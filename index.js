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
    referralCount: { type: Number, default: 0 }
}));

const Transaction = mongoose.model('Transaction', new mongoose.Schema({
    phone: String, amount: Number, type: String, status: { type: String, default: 'Pending' }, date: { type: Date, default: Date.now }
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/login', async (req, res) => {
    const { phone, password, ref } = req.body;
    let user = await User.findOne({ phone: phone.trim() });
    if (!user) {
        if (ref && ref !== phone) await User.findOneAndUpdate({ phone: ref }, { $inc: { balance: 5, referralCount: 1 } });
        user = await User.create({ phone: phone.trim(), password, balance: 50 });
    } else if (user.password !== password) return res.json({ success: false, msg: "Modpas pa bon" });
    res.json({ success: true, user });
});

app.post('/withdraw', async (req, res) => {
    const { phone, amount } = req.body;
    const user = await User.findOne({ phone });
    if (user && user.balance >= amount && amount >= 100) {
        const fee = amount * 0.05;
        await User.updateOne({ phone }, { $inc: { balance: -amount } });
        await Transaction.create({ phone, amount: amount - fee, type: 'Withdraw' });
        res.json({ success: true, newBalance: user.balance - amount });
    } else res.json({ success: false, msg: "Limit retrè se 100G ak Balans sifi!" });
});

let rooms = {};
io.on('connection', (socket) => {
    socket.on('createRoom', async (data) => {
        const user = await User.findOne({ phone: data.phone });
        if (!user || user.balance < data.bet) return socket.emit('errorMsg', "Balans piti!");
        const code = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[code] = { host: data.phone, bet: Number(data.bet), players: [socket.id], phones: [data.phone] };
        socket.join(code);
        socket.emit('roomCreated', { code, bet: data.bet });
    });

    socket.on('joinRoom', async (data) => {
        const room = rooms[data.code];
        const user = await User.findOne({ phone: data.phone });
        if (room && user && user.balance >= room.bet && room.players.length < 2) {
            socket.join(data.code);
            room.players.push(socket.id); room.phones.push(data.phone);
            await User.updateMany({ phone: { $in: room.phones } }, { $inc: { balance: -room.bet } });
            const prize = (room.bet * 2) * 0.95;
            io.to(data.code).emit('gameStart', { room: data.code, prize, turn: room.host, bet: room.bet });
        } else socket.emit('errorMsg', "Kòd erè oswa Balans piti!");
    });

    socket.on('move', (data) => socket.to(data.room).emit('opponentMove', data));
    
    socket.on('win', async (data) => {
        const user = await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: data.prize } }, { new: true });
        io.to(data.room).emit('gameOver', { winner: data.phone, prize: data.prize, newBalance: user.balance });
    });

    socket.on('requestRematch', (data) => socket.to(data.room).emit('rematchOffered', data));
});

server.listen(PORT, () => console.log(`Blitz kouri sou ${PORT}`));
