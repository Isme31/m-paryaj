const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { transports: ['websocket', 'polling'] });

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

// FIX CONNEXION MONGODB
mongoose.connect(MONGO_URI, { tlsAllowInvalidCertificates: true, sslValidate: false, retryWrites: true })
.then(() => console.log("✅ MONGO KONEKTE")).catch(err => console.log("❌ ERÈ MONGO:", err));

// SCHÉMAS
const User = mongoose.model('User', new mongoose.Schema({
    phone: { type: String, unique: true },
    password: { type: String },
    balance: { type: Number, default: 0 },
    referralCount: { type: Number, default: 0 }
}));

const Withdraw = mongoose.model('Withdraw', new mongoose.Schema({
    phone: String, amount: Number, status: { type: String, default: 'pending' }, date: { type: Date, default: Date.now }
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};
let gameTimers = {};

function startTurnTimer(roomCode, activePlayer, prize) {
    if (gameTimers[roomCode]) clearTimeout(gameTimers[roomCode]);
    gameTimers[roomCode] = setTimeout(async () => {
        if (rooms[roomCode]) {
            const players = rooms[roomCode].phones;
            const winnerPhone = players.find(p => p !== activePlayer);
            const winner = await User.findOneAndUpdate({ phone: winnerPhone }, { $inc: { balance: prize } }, { new: true });
            io.to(roomCode).emit('gameOver', { winner: winnerPhone, msg: "Tan fini (30s)!", newBalance: winner.balance });
            delete rooms[roomCode]; delete gameTimers[roomCode];
        }
    }, 30000);
}

// API
app.post('/login', async (req, res) => {
    const { phone, password, ref } = req.body;
    const cleanPhone = phone.trim();
    let user = await User.findOne({ phone: cleanPhone });
    if (!user) {
        if (ref && ref !== cleanPhone) await User.findOneAndUpdate({ phone: ref }, { $inc: { balance: 5, referralCount: 1 } });
        user = await User.create({ phone: cleanPhone, password, balance: 10 }); 
    }
    if (user.password !== password) return res.json({ success: false, msg: "Modpas pa bon!" });
    res.json({ success: true, user });
});

app.post('/withdraw', async (req, res) => {
    const { phone, amount } = req.body;
    const user = await User.findOne({ phone });
    if (user && user.balance >= amount && amount >= 100) {
        await User.findOneAndUpdate({ phone }, { $inc: { balance: -amount } });
        await Withdraw.create({ phone, amount });
        res.json({ success: true });
    } else res.json({ success: false, msg: "Balans ba!" });
});

// SOCKETS
io.on('connection', (socket) => {
    socket.on('joinPrivate', async (data) => {
        const { roomCode, phone, bet } = data;
        const user = await User.findOne({ phone });
        if (!user || user.balance < Number(bet)) return socket.emit('errorMsg', "Balans ou piti!");

        if (!rooms[roomCode]) {
            rooms[roomCode] = { host: phone, bet: Number(bet), phones: [phone], hostId: socket.id };
            socket.join(roomCode);
            socket.emit('match-status', "KÒD: " + roomCode + " (Atann zanmi...)");
        } else {
            const r = rooms[roomCode];
            if (r.phones.length >= 2) return socket.emit('errorMsg', "Chanm sa plen!");
            r.phones.push(phone);
            socket.join(roomCode);
            const prize = (r.bet * 2) * 0.95;
            await User.updateMany({ phone: { $in: r.phones } }, { $inc: { balance: -r.bet } });
            io.to(roomCode).emit('gameStart', { room: roomCode, prize, turn: r.host });
            startTurnTimer(roomCode, r.host, prize);
        }
    });

    socket.on('move', (data) => {
        if (rooms[data.room]) {
            socket.to(data.room).emit('opponentMove', data);
            const nextPlayer = rooms[data.room].phones.find(p => p !== data.phone);
            startTurnTimer(data.room, nextPlayer, data.prize);
        }
    });

    socket.on('win', async (data) => {
        if (rooms[data.room]) {
            clearTimeout(gameTimers[data.room]);
            const prize = Number(data.prize);
            const winner = await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: prize } }, { new: true });
            io.to(data.room).emit('gameOver', { winner: data.phone, msg: "MOPYON! 5 PWEN!", newBalance: winner.balance });
            delete rooms[data.room];
        }
    });
});

server.listen(PORT, () => console.log(`⚡ Blitz Ready`));
