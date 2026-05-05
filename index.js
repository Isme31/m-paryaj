const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    transports: ['websocket', 'polling'], 
    cors: { origin: "*" } 
});

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

// Koneksyon MongoDB ak Log klè
mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ MONGO KONEKTE"))
    .catch(err => console.log("❌ ERÈ MONGO:", err));

const User = mongoose.model('User', new mongoose.Schema({
    phone: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 0 },
    referralCount: { type: Number, default: 0 }
}));

const Withdraw = mongoose.model('Withdraw', new mongoose.Schema({
    phone: String,
    amount: Number,
    date: { type: Date, default: Date.now },
    status: { type: String, default: 'pending' }
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API LOGIN
app.post('/login', async (req, res) => {
    try {
        const { phone, password, ref } = req.body;
        const cleanPhone = phone.trim().replace(/\s+/g, '');
        let user = await User.findOne({ phone: cleanPhone });
        if (!user) {
            if (ref && ref !== cleanPhone) {
                await User.findOneAndUpdate({ phone: ref }, { $inc: { balance: 5, referralCount: 1 } });
            }
            user = await User.create({ phone: cleanPhone, password, balance: 0 });
        }
        if (user.password !== password) return res.json({ success: false, msg: "Modpas pa bon!" });
        res.json({ success: true, user });
    } catch (e) { res.status(500).json({ success: false }); }
});

// API RETRÈ
app.post('/withdraw', async (req, res) => {
    const { phone, amount } = req.body;
    const user = await User.findOne({ phone });
    if (user && user.balance >= amount && amount >= 100) {
        await User.findOneAndUpdate({ phone }, { $inc: { balance: -amount } });
        await Withdraw.create({ phone, amount });
        res.json({ success: true, msg: "Mande voye!" });
    } else res.json({ success: false, msg: "Balans ba!" });
});

// JWÈT AK MATCHMAKING
let rooms = {};
let waitingPlayers = {}; 

io.on('connection', (socket) => {
    socket.on('startMatchmaking', async (data) => {
        const bet = Number(data.bet);
        const user = await User.findOne({ phone: data.phone });
        if (!user || user.balance < bet) return socket.emit('errorMsg', "Balans ou piti!");

        if (waitingPlayers[bet] && waitingPlayers[bet].phone !== data.phone) {
            const opp = waitingPlayers[bet];
            delete waitingPlayers[bet];
            const code = `room_${Date.now()}`;
            rooms[code] = { phones: [opp.phone, data.phone], bet };
            
            socket.join(code);
            const oppSocket = io.sockets.sockets.get(opp.id);
            if(oppSocket) oppSocket.join(code);

            await User.updateMany({ phone: { $in: [opp.phone, data.phone] } }, { $inc: { balance: -bet } });
            io.to(code).emit('gameStart', { room: code, prize: (bet * 2) * 0.95, turn: opp.phone, symbol: 'X' });
        } else {
            waitingPlayers[bet] = { id: socket.id, phone: data.phone };
        }
    });

    socket.on('joinRoom', async (data) => {
        const { roomCode, phone, bet } = data;
        const user = await User.findOne({ phone });
        if (!rooms[roomCode]) {
            if (!user || user.balance < bet) return socket.emit('errorMsg', "Balans ou piti!");
            rooms[roomCode] = { host: phone, bet, phones: [phone] };
            socket.join(roomCode);
        } else {
            const r = rooms[roomCode];
            r.phones.push(phone);
            socket.join(roomCode);
            await User.updateMany({ phone: { $in: r.phones } }, { $inc: { balance: -r.bet } });
            io.to(roomCode).emit('gameStart', { room: roomCode, prize: (r.bet * 2) * 0.95, turn: r.host, symbol: 'O' });
        }
    });

    socket.on('move', (data) => socket.to(data.room).emit('opponentMove', data));

    socket.on('win', async (data) => {
        if (rooms[data.room]) {
            delete rooms[data.room];
            const winner = await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: Number(data.prize) } }, { new: true });
            io.to(data.room).emit('gameOver', { winner: data.phone, prize: data.prize });
            io.to(socket.id).emit('updateBalance', winner.balance);
        }
    });
});

// --- SISTÈM KONT DÒMI (REMAKLE POU PA GEN ERÈ) ---
setInterval(() => {
    const url = process.env.APP_URL; 
    if (url) {
        axios.get(url).catch(() => console.log("Ping skip"));
    }
}, 600000); // 10 minit

server.listen(PORT, () => console.log(`⚡ Sèvè ap kouri sou ${PORT}`));
