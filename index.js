require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" },
    transports: ['websocket', 'polling']
});

const PORT = process.env.PORT || 3000;
const ADMIN_SECRET = process.env.ADMIN_SECRET || "MOPYON2024";

// --- DB CONNECTION ---
mongoose.connect(process.env.MONGO_URI).then(() => console.log("MongoDB Konekte ✅"));

// --- MODÈL YO ---
const User = mongoose.model('User', new mongoose.Schema({
    phone: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 100 },
    referredBy: { type: String, default: null }
}));

const Withdraw = mongoose.model('Withdraw', new mongoose.Schema({
    phone: String,
    amount: Number,
    fee: Number,
    status: { type: String, default: 'Pending' },
    date: { type: Date, default: Date.now }
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- API ROUTES ---

// Login ki aksepte modpas ankripte ak modpas nòmal
app.post('/login', async (req, res) => {
    try {
        const { phone, password, ref } = req.body;
        const cleanPhone = phone.trim();
        let user = await User.findOne({ phone: cleanPhone });

        if (!user) {
            user = await User.create({ phone: cleanPhone, password: password, balance: 100, referredBy: ref });
            if (ref) await User.findOneAndUpdate({ phone: ref }, { $inc: { balance: 5 } });
            return res.json({ success: true, phone: user.phone, balance: user.balance });
        }

        let isMatch = (password === user.password);
        if (!isMatch && user.password.startsWith('$2')) {
            isMatch = await bcrypt.compare(password, user.password);
        }

        if (!isMatch) return res.json({ success: false, msg: "Modpas pa bon" });
        res.json({ success: true, phone: user.phone, balance: user.balance });
    } catch (err) { res.json({ success: false, msg: "Erè sèvè" }); }
});

// Demann Retrè
app.post('/request-withdraw', async (req, res) => {
    try {
        const { phone, amount } = req.body;
        const amt = parseFloat(amount);
        const user = await User.findOne({ phone: phone.trim() });

        if (user && user.balance >= amt && amt >= 100) {
            await User.updateOne({ phone: phone.trim() }, { $inc: { balance: -amt } });
            const fee = amt * 0.05; // 5% frè
            await Withdraw.create({ phone: phone.trim(), amount: amt - fee, fee: fee });
            res.json({ success: true, newBalance: user.balance - amt });
        } else {
            res.json({ success: false, msg: "Balans ensifizan (Min 100G)" });
        }
    } catch (err) { res.json({ success: false, msg: "Erè sèvè" }); }
});

// Admin Update Balance
app.post('/admin/update-balance', async (req, res) => {
    const { phone, amount, secret } = req.body;
    if (secret !== ADMIN_SECRET) return res.status(403).json({ success: false });
    const user = await User.findOneAndUpdate({ phone: phone.trim() }, { $inc: { balance: parseFloat(amount) } }, { new: true });
    res.json({ success: true, newBalance: user ? user.balance : 0 });
});

// --- GAME LOGIC (SOCKET.IO) ---
let waitingPlayers = [], privateRooms = {}, activeGames = {};

io.on('connection', (socket) => {

    socket.on('findMatch', async (data) => {
        const user = await User.findOne({ phone: data.phone });
        const bet = parseFloat(data.bet);
        if (!user || user.balance < bet) return socket.emit('gameOver', { msg: "Balans piti!" });

        let oppIdx = waitingPlayers.findIndex(p => p.bet === bet && p.phone !== data.phone);
        if (oppIdx > -1) {
            startGame(socket, waitingPlayers.splice(oppIdx, 1)[0], bet, `rapid_${Date.now()}`, data.phone);
        } else {
            waitingPlayers.push({ phone: data.phone, bet, socketId: socket.id });
            socket.emit('statusUpdate', "Ap chèche moun...");
        }
    });

    socket.on('joinPrivate', async (data) => {
        const { phone, bet, room } = data;
        const cleanRoom = room.trim().toLowerCase();
        const bAmount = parseFloat(bet);
        const user = await User.findOne({ phone: phone.trim() });

        if (!user || user.balance < bAmount) return socket.emit('gameOver', { msg: "Balans piti!" });

        if (privateRooms[cleanRoom]) {
            const opp = privateRooms[cleanRoom];
            delete privateRooms[cleanRoom];
            startGame(socket, opp, bAmount, cleanRoom, phone);
        } else {
            privateRooms[cleanRoom] = { phone, bet: bAmount, socketId: socket.id };
            socket.join(cleanRoom);
            socket.emit('statusUpdate', `Kòd: ${cleanRoom}. Tann zanmi...`);
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
        io.to(room).emit('gameStart', { room, prize, firstTurn: p1Phone });
    }

    socket.on('move', (data) => socket.to(data.room).emit('opponentMove', data));

    socket.on('win', async (data) => {
        const game = activeGames[data.room];
        if (game) {
            delete activeGames[data.room];
            const winner = await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: game.prize } }, { new: true });
            io.to(data.room).emit('gameOver', { winner: data.phone, newBalance: winner.balance, prize: game.prize });
        }
    });

    socket.on('timesUp', async (data) => {
        const game = activeGames[data.room];
        if (game) {
            const winner = game.players.find(p => p.phone !== data.phone);
            delete activeGames[data.room];
            const winUser = await User.findOneAndUpdate({ phone: winner.phone }, { $inc: { balance: game.prize } }, { new: true });
            io.to(data.room).emit('gameOver', { winner: winner.phone, newBalance: winUser.balance, prize: game.prize, msg: "Tan fini!" });
        }
    });

    socket.on('disconnect', () => {
        waitingPlayers = waitingPlayers.filter(p => p.socketId !== socket.id);
    });
});

server.listen(PORT, () => console.log(`🚀 Sèvè LIVE sou pòt ${PORT}`));
