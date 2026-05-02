require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } }); // Ajoute CORS pou evite blokaj

const PORT = process.env.PORT || 3000;
const ADMIN_SECRET = process.env.ADMIN_SECRET || "MOPYON2024";

// --- DB CONNECTION ---
mongoose.connect(process.env.MONGO_URI).then(() => console.log("MongoDB Konekte ✅"));

// --- MODÈL ---
const User = mongoose.model('User', new mongoose.Schema({
    phone: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 100 },
    referredBy: { type: String, default: null }
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- API ---
app.post('/login', async (req, res) => {
    try {
        const { phone, password, ref } = req.body;
        const cleanPhone = phone.trim();
        let user = await User.findOne({ phone: cleanPhone });

        if (!user) {
            const hashedPassword = await bcrypt.hash(password, 10);
            user = await User.create({ phone: cleanPhone, password: hashedPassword, balance: 100, referredBy: ref });
            if (ref) await User.findOneAndUpdate({ phone: ref }, { $inc: { balance: 5 } });
            return res.json({ success: true, phone: user.phone, balance: user.balance });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.json({ success: false, msg: "Modpas pa bon" });
        res.json({ success: true, phone: user.phone, balance: user.balance });
    } catch (err) { res.json({ success: false, msg: "Erè sèvè" }); }
});

// --- MATCHMAKING LOGIC ---
let waitingPlayers = []; 
let privateRooms = {};   
let activeGames = {};

io.on('connection', (socket) => {
    console.log(`Nouvo koneksyon: ${socket.id}`);

    // MATCH RAPID
    socket.on('findMatch', async (data) => {
        const bet = parseFloat(data.bet);
        const user = await User.findOne({ phone: data.phone });
        if (!user || user.balance < bet) return socket.emit('gameOver', { msg: "Balans ou piti!" });

        let oppIdx = waitingPlayers.findIndex(p => p.bet === bet && p.phone !== data.phone);
        if (oppIdx > -1) {
            const opponent = waitingPlayers.splice(oppIdx, 1)[0];
            const room = `rapid_${Date.now()}`;
            startGame(socket, opponent, bet, room, data.phone);
        } else {
            waitingPlayers.push({ phone: data.phone, bet, socketId: socket.id });
            socket.emit('statusUpdate', "Ap chèche jwè...");
        }
    });

    // CHANM PRIVE
    socket.on('joinPrivate', async (data) => {
        const { phone, bet, room } = data;
        const cleanRoom = room.trim();
        const bAmount = parseFloat(bet);
        const user = await User.findOne({ phone: phone.trim() });

        if (!user || user.balance < bAmount) return socket.emit('gameOver', { msg: "Balans ou piti!" });

        if (privateRooms[cleanRoom]) {
            const opp = privateRooms[cleanRoom];
            if (opp.phone === phone) return socket.emit('statusUpdate', "W ap tann zanmi w...");
            delete privateRooms[cleanRoom];
            startGame(socket, opp, bAmount, cleanRoom, phone);
        } else {
            privateRooms[cleanRoom] = { phone, bet: bAmount, socketId: socket.id };
            socket.join(cleanRoom);
            socket.emit('statusUpdate', `Kòd: ${cleanRoom}. Tann zanmi w...`);
        }
    });

    async function startGame(s1, s2, bet, room, p1Phone) {
        await User.updateOne({ phone: p1Phone }, { $inc: { balance: -bet } });
        await User.updateOne({ phone: s2.phone }, { $inc: { balance: -bet } });

        s1.join(room);
        const s2Socket = io.sockets.sockets.get(s2.socketId);
        if (s2Socket) s2Socket.join(room);

        const prize = (bet * 2) * 0.9;
        activeGames[room] = { prize, players: [{id: s1.id, phone: p1Phone}, {id: s2.socketId, phone: s2.phone}] };
        
        io.in(room).emit('gameStart', { room, prize, firstTurn: p1Phone });
    }

    socket.on('move', (data) => socket.to(data.room).emit('opponentMove', data));

    socket.on('win', async (data) => {
        const game = activeGames[data.room];
        if (game) {
            delete activeGames[data.room];
            const winUser = await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: game.prize } }, { new: true });
            io.in(data.room).emit('gameOver', { winner: data.phone, newBalance: winUser.balance, prize: game.prize });
        }
    });

    socket.on('disconnect', () => {
        waitingPlayers = waitingPlayers.filter(p => p.socketId !== socket.id);
        for (let r in privateRooms) if (privateRooms[r].socketId === socket.id) delete privateRooms[r];
    });
});

server.listen(PORT, () => console.log(`Sèvè LIVE sou ${PORT}`));
