const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { transports: ['websocket'], cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;

mongoose.connect("mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/mopyon_db?retryWrites=true&w=majority").then(() => console.log("DB Konekte ✅"));

const User = mongoose.model('User', new mongoose.Schema({
    phone: { type: String, unique: true },
    password: { type: String },
    balance: { type: Number, default: 50 },
    referralCount: { type: Number, default: 0 },
    referredBy: { type: String, default: null }
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/login', async (req, res) => {
    const { phone, password, ref } = req.body;
    const cleanPhone = phone.trim();
    let user = await User.findOne({ phone: cleanPhone });
    if (!user) {
        if (ref && ref !== cleanPhone) {
            await User.findOneAndUpdate({ phone: ref }, { $inc: { balance: 5, referralCount: 1 } });
        }
        user = await User.create({ phone: cleanPhone, password, balance: 50, referredBy: ref });
    } else if (user.password !== password) return res.json({ success: false, msg: "Modpas pa bon" });
    res.json({ success: true, user });
});

// LOGIK JWÈT
let rooms = {};
io.on('connection', (socket) => {
    socket.on('createRoom', async (data) => {
        const user = await User.findOne({ phone: data.phone });
        if (!user || user.balance < data.bet) return socket.emit('errorMsg', "Balans ou piti!");
        const code = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[code] = { host: data.phone, bet: Number(data.bet), type: data.type, players: [socket.id] };
        socket.join(code);
        socket.emit('roomCreated', { code, bet: data.bet });
    });

    socket.on('joinRoom', async (data) => {
        const room = rooms[data.code];
        const user = await User.findOne({ phone: data.phone });
        if (room && user && user.balance >= room.bet && room.players.length < 2) {
            await User.updateOne({ phone: room.host }, { $inc: { balance: -room.bet } });
            await User.updateOne({ phone: data.phone }, { $inc: { balance: -room.bet } });
            room.players.push(socket.id);
            const prize = (room.bet * 2) * 0.95; // 5% Komisyon
            io.to(data.code).emit('gameStart', { room: data.code, type: room.type, prize, players: [room.host, data.phone], turn: room.host });
        } else { socket.emit('errorMsg', "Kòd erè oswa Balans piti!"); }
    });

    socket.on('move', (data) => socket.to(data.room).emit('opponentMove', data));
    socket.on('chat', (data) => io.to(data.room).emit('chatMsg', data));
    
    socket.on('win', async (data) => {
        const user = await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: data.prize } }, { new: true });
        io.to(data.room).emit('gameOver', { winner: data.phone, prize: data.prize, newBalance: user.balance });
    });
});

server.listen(PORT, () => console.log(`Sèvè kouri sou ${PORT}`));
