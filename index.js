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

// CONNEXION SÉCURISÉE MONGODB
mongoose.connect(MONGO_URI, {
    tlsAllowInvalidCertificates: true,
    sslValidate: false,
    retryWrites: true,
})
.then(() => console.log("✅ MONGO KONEKTE"))
.catch(err => console.log("❌ ERÈ MONGO:", err));

// SCHÉMAS DATABASE
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
let waitingPlayers = {}; 
let gameTimers = {};

// LOGIQUE TIMER 30S SERVEUR
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

// ROUTES API
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

// SOCKET.IO
io.on('connection', (socket) => {
    socket.on('startMatchmaking', async (data) => {
        const bet = Number(data.bet);
        const user = await User.findOne({ phone: data.phone });
        if (!user || user.balance < bet) return socket.emit('errorMsg', "Balans ou piti!");

        if (waitingPlayers[bet] && waitingPlayers[bet].phone !== data.phone) {
            const opp = waitingPlayers[bet]; delete waitingPlayers[bet];
            const code = `auto_${Date.now()}`;
            rooms[code] = { phones: [opp.phone, data.phone], bet: bet };
            socket.join(code); io.sockets.sockets.get(opp.id)?.join(code);
            await User.updateMany({ phone: { $in: [opp.phone, data.phone] } }, { $inc: { balance: -bet } });
            io.to(code).emit('gameStart', { room: code, prize: (bet * 2) * 0.95, turn: opp.phone });
            startTurnTimer(code, opp.phone, (bet * 2) * 0.95);
        } else {
            waitingPlayers[bet] = { id: socket.id, phone: data.phone };
            socket.emit('match-status', "Ap chache opozan...");
        }
    });

    socket.on('joinPrivate', async (data) => {
        const { roomCode, phone, bet } = data;
        const user = await User.findOne({ phone });
        if (!user || user.balance < Number(bet)) return socket.emit('errorMsg', "Balans ou piti!");

        if (!rooms[roomCode]) {
            rooms[roomCode] = { host: phone, bet: Number(bet), phones: [phone] };
            socket.join(roomCode);
            socket.emit('match-status', "Kòd: " + roomCode + " (Atann...)");
        } else {
            const r = rooms[roomCode];
            r.phones.push(phone); socket.join(roomCode);
            await User.updateMany({ phone: { $in: r.phones } }, { $inc: { balance: -r.bet } });
            io.to(roomCode).emit('gameStart', { room: roomCode, prize: (r.bet * 2) * 0.95, turn: r.host });
            startTurnTimer(roomCode, r.host, (r.bet * 2) * 0.95);
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
            const prize = Number(data.prize); delete rooms[data.room];
            const winner = await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: prize } }, { new: true });
            io.to(data.room).emit('gameOver', { winner: data.phone, msg: "MOPYON! Ou genyen!", newBalance: winner.balance });
        }
    });
});

server.listen(PORT, () => console.log(`⚡ Blitz Ready`));
