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

mongoose.connect(MONGO_URI).then(() => console.log("✅ MONGO KONEKTE")).catch(err => console.log("❌ ERÈ MONGO:", err));

// Modèles
const User = mongoose.model('User', new mongoose.Schema({
    phone: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 0 },
    referralCount: { type: Number, default: 0 }
}));

const Withdraw = mongoose.model('Withdraw', new mongoose.Schema({
    phone: String, amount: Number, status: { type: String, default: 'pending' }, date: { type: Date, default: Date.now }
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes API
app.post('/login', async (req, res) => {
    const { phone, password, ref } = req.body;
    const cleanPhone = phone.trim();
    let user = await User.findOne({ phone: cleanPhone });
    if (!user) {
        // Système de Parrainage (Bonus 5 HTG)
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
        res.json({ success: true, msg: "Demann voye!" });
    } else res.json({ success: false, msg: "Balans ba oswa montan invalid!" });
});

// Logique de Jeu
let rooms = {};
let waitingPlayers = {}; 

io.on('connection', (socket) => {
    // Matchmaking Auto
    socket.on('startMatchmaking', async (data) => {
        const bet = Number(data.bet);
        if (waitingPlayers[bet] && waitingPlayers[bet].phone !== data.phone) {
            const opp = waitingPlayers[bet];
            delete waitingPlayers[bet];
            const code = `room_${Date.now()}`;
            rooms[code] = { phones: [opp.phone, data.phone], bet };
            socket.join(code);
            io.sockets.sockets.get(opp.id)?.join(code);
            await User.updateMany({ phone: { $in: [opp.phone, data.phone] } }, { $inc: { balance: -bet } });
            io.to(code).emit('gameStart', { room: code, prize: (bet * 2) * 0.95, turn: opp.phone });
        } else {
            waitingPlayers[bet] = { id: socket.id, phone: data.phone };
        }
    });

    // Chambre Privée
    socket.on('joinPrivate', async (data) => {
        const { roomCode, phone, bet } = data;
        if (!rooms[roomCode]) {
            rooms[roomCode] = { host: phone, bet: Number(bet), phones: [phone], hostId: socket.id };
            socket.join(roomCode);
        } else {
            const r = rooms[roomCode];
            r.phones.push(phone);
            socket.join(roomCode);
            await User.updateMany({ phone: { $in: r.phones } }, { $inc: { balance: -r.bet } });
            io.to(roomCode).emit('gameStart', { room: roomCode, prize: (r.bet * 2) * 0.95, turn: r.host });
        }
    });

    // Synchronisation des mouvements
    socket.on('move', (data) => {
        socket.to(data.room).emit('opponentMove', data);
    });

    socket.on('win', async (data) => {
        if (rooms[data.room]) {
            delete rooms[data.room];
            await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: Number(data.prize) } });
            io.to(data.room).emit('gameOver', { winner: data.phone });
        }
    });
});

server.listen(PORT, () => console.log(`⚡ Blitz sou ${PORT}`));
