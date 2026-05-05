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

mongoose.connect(MONGO_URI, { 
    tlsAllowInvalidCertificates: true, 
    sslValidate: false,
    retryWrites: true 
}).then(() => console.log("✅ MONGO KONEKTE")).catch(err => console.log("❌ ERÈ MONGO:", err));

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

const cleanP = (p) => {
    let c = p.toString().replace(/\D/g, ''); 
    return c.length > 8 ? c.slice(-8) : c;
};

app.post('/login', async (req, res) => {
    try {
        let { phone, password, ref } = req.body;
        const p8 = cleanP(phone);
        let user = await User.findOne({ phone: p8 });
        if (!user) {
            if (ref) {
                const r8 = cleanP(ref);
                await User.findOneAndUpdate({ phone: r8 }, { $inc: { balance: 5, referralCount: 1 } });
            }
            user = await User.create({ phone: p8, password, balance: 10 }); 
        }
        if (user.password !== password) return res.json({ success: false, msg: "Modpas pa bon!" });
        res.json({ success: true, user });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/withdraw', async (req, res) => {
    try {
        const p8 = cleanP(req.body.phone);
        const amt = Number(req.body.amount);
        const user = await User.findOne({ phone: p8 });
        if (user && user.balance >= amt && amt >= 100) {
            await User.findOneAndUpdate({ phone: p8 }, { $inc: { balance: -amt } });
            await Withdraw.create({ phone: p8, amount: amt });
            res.json({ success: true });
        } else res.json({ success: false });
    } catch (e) { res.status(500).json({ success: false }); }
});

let rooms = {};
let gameTimers = {};

function startTurnTimer(roomCode, activePlayer, prize) {
    if (gameTimers[roomCode]) clearTimeout(gameTimers[roomCode]);
    gameTimers[roomCode] = setTimeout(async () => {
        if (rooms[roomCode]) {
            const players = rooms[roomCode].phones;
            const winnerP = players.find(p => p !== activePlayer);
            const winner = await User.findOneAndUpdate({ phone: winnerP }, { $inc: { balance: prize } }, { new: true });
            io.to(roomCode).emit('gameOver', { winner: winnerP, msg: "Tan fini (30s)!", newBalance: winner.balance });
            delete rooms[roomCode];
        }
    }, 30000);
}

io.on('connection', (socket) => {
    socket.on('joinPrivate', async (data) => {
        const p8 = cleanP(data.phone);
        const { roomCode, bet } = data;
        const user = await User.findOne({ phone: p8 });
        if (!user || user.balance < Number(bet)) return socket.emit('errorMsg', "Balans ou piti!");

        if (!rooms[roomCode]) {
            rooms[roomCode] = { host: p8, bet: Number(bet), phones: [p8] };
            socket.join(roomCode);
            socket.emit('match-status', "KÒD: " + roomCode + " (Atann zanmi...)");
        } else {
            const r = rooms[roomCode];
            r.phones.push(p8);
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
            const nextP = rooms[data.room].phones.find(p => p !== cleanP(data.phone));
            startTurnTimer(data.room, nextP, data.prize);
        }
    });

    socket.on('win', async (data) => {
        if (rooms[data.room]) {
            clearTimeout(gameTimers[data.room]);
            const winner = await User.findOneAndUpdate({ phone: cleanP(data.phone) }, { $inc: { balance: Number(data.prize) } }, { new: true });
            io.to(data.room).emit('gameOver', { winner: winner.phone, msg: "MOPYON! 🎉", newBalance: winner.balance });
            delete rooms[data.room];
        }
    });
});

server.listen(PORT, () => console.log(`⚡ Blitz Ready`));
