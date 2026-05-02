require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const ADMIN_SECRET = process.env.ADMIN_SECRET || "MOPYON2024";
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- DB CONNECTION ---
const mongoURI = process.env.MONGO_URI || "mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/mopyon_db?retryWrites=true&w=majority";
mongoose.connect(mongoURI).then(() => console.log("MongoDB Konekte ✅"));

// --- MODELS ---
const User = mongoose.model('User', new mongoose.Schema({
    phone: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 100 }
}));

const Withdraw = mongoose.model('Withdraw', new mongoose.Schema({
    phone: String,
    amount: Number,
    fee: Number,
    status: { type: String, default: 'Pending' },
    date: { type: Date, default: Date.now }
}));

// --- ROUTES ---
app.post('/login', async (req, res) => {
    try {
        const { phone, password } = req.body;
        const cleanPhone = phone.trim();
        let user = await User.findOne({ phone: cleanPhone });

        if (!user) {
            const hashedPassword = await bcrypt.hash(password, 10);
            user = await User.create({ phone: cleanPhone, password: hashedPassword, balance: 100 });
            return res.json({ success: true, phone: user.phone, balance: user.balance });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.json({ success: false, msg: "Modpas pa bon" });

        res.json({ success: true, phone: user.phone, balance: user.balance });
    } catch (err) { res.json({ success: false, msg: "Erè sèvè" }); }
});

// Admin Update Balance
app.post('/admin/update-balance', async (req, res) => {
    const { phone, amount, secret } = req.body;
    if (secret !== ADMIN_SECRET) return res.status(403).json({ success: false });
    const user = await User.findOneAndUpdate({ phone: phone.trim() }, { $inc: { balance: Number(amount) } }, { new: true });
    res.json({ success: true, newBalance: user ? user.balance : 0 });
});

// Request Withdraw
app.post('/request-withdraw', async (req, res) => {
    const { phone, amount } = req.body;
    const amt = Number(amount);
    const user = await User.findOne({ phone: phone.trim() });

    if (user && user.balance >= amt && amt >= 100) {
        await User.updateOne({ phone: phone.trim() }, { $inc: { balance: -amt } });
        const fee = amt * 0.05;
        await Withdraw.create({ phone: phone.trim(), amount: amt - fee });
        res.json({ success: true, newBalance: user.balance - amt });
    } else { res.json({ success: false, msg: "Balans ensifizan!" }); }
});

// --- GAME LOGIC ---
let waitingPlayers = []; // Pou Match Rapid
let privateRooms = {};   // Pou Chanm Prive
let activeGames = {};

io.on('connection', (socket) => {

    // 1. MATCH RAPID
    socket.on('findMatch', async (data) => {
        const user = await User.findOne({ phone: data.phone });
        const bet = Number(data.bet);
        if (!user || user.balance < bet) return socket.emit('gameOver', { msg: "Balans ou twò piti!" });

        let oppIdx = waitingPlayers.findIndex(p => p.bet === bet && p.phone !== data.phone);
        if (oppIdx > -1) {
            const opponent = waitingPlayers.splice(oppIdx, 1)[0];
            startGame(socket, opponent, bet);
        } else {
            waitingPlayers.push({ ...data, bet, socketId: socket.id });
            socket.emit('statusUpdate', "Ap chèche yon moun...");
        }
    });

    // 2. JOIN PRIVATE ROOM
    socket.on('joinPrivate', async (data) => {
        const { phone, bet, room } = data;
        const user = await User.findOne({ phone: phone.trim() });
        const bAmount = Number(bet);

        if (!user || user.balance < bAmount) return socket.emit('gameOver', { msg: "Balans ou twò piti!" });
        if (!room) return socket.emit('statusUpdate', "Mete yon kòd!");

        if (privateRooms[room]) {
            const opponent = privateRooms[room];
            if (opponent.phone === phone) return socket.emit('statusUpdate', "W ap tann zanmi w...");
            delete privateRooms[room];
            startGame(socket, opponent, bAmount, room);
        } else {
            privateRooms[room] = { phone, bet: bAmount, socketId: socket.id };
            socket.emit('statusUpdate', `Kòd: ${room}. Tann zanmi w...`);
        }
    });

    async function startGame(s1, s2, bet, roomID = null) {
        const room = roomID || `room_${Date.now()}`;
        await User.updateOne({ phone: s1.phone || s1.handshake.query.phone }, { $inc: { balance: -bet } });
        await User.updateOne({ phone: s2.phone }, { $inc: { balance: -bet } });

        s1.join(room);
        const s2Socket = io.sockets.sockets.get(s2.socketId);
        if (s2Socket) s2Socket.join(room);

        const prize = (bet * 2) * 0.9;
        activeGames[room] = { prize, players: [s1.id, s2.socketId] };

        io.to(room).emit('gameStart', { room, prize, firstTurn: s1.phone || "Jwè 1" });
        
        // Update Balans sou ekran yo
        const u1 = await User.findOne({ phone: s1.phone });
        const u2 = await User.findOne({ phone: s2.phone });
        s1.emit('balanceUpdate', { balance: u1.balance });
        if (s2Socket) s2Socket.emit('balanceUpdate', { balance: u2.balance });
    }

    socket.on('move', (data) => {
        socket.to(data.room).emit('opponentMove', data);
    });

    socket.on('win', async (data) => {
        const game = activeGames[data.room];
        if (game) {
            delete activeGames[data.room];
            const winner = await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: game.prize } }, { new: true });
            io.to(data.room).emit('gameOver', { winner: data.phone, newBalance: winner.balance, prize: game.prize.toFixed(2) });
        }
    });

    socket.on('disconnect', () => {
        waitingPlayers = waitingPlayers.filter(p => p.socketId !== socket.id);
        // Netwaye chanm prive si mèt la dekonekte
        for (let r in privateRooms) {
            if (privateRooms[r].socketId === socket.id) delete privateRooms[r];
        }
    });
});

server.listen(PORT, () => console.log(`🚀 Sèvè a moute sou pòt ${PORT}`));
