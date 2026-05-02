const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const ADMIN_SECRET = "MOPYON2024";
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- DB CONNECTION ---
const mongoURI = "mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/mopyon_db?retryWrites=true&w=majority";
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
        let user = await User.findOne({ phone: phone.trim() });
        if (!user) {
            user = await User.create({ phone: phone.trim(), password, balance: 100 });
        } else if (user.password !== password) {
            return res.json({ success: false, msg: "Modpas pa bon" });
        }
        res.json({ success: true, phone: user.phone, balance: user.balance });
    } catch (err) { res.json({ success: false, msg: "Erè sèvè" }); }
});

app.post('/admin/update-balance', async (req, res) => {
    const { phone, amount, secret } = req.body;
    if (secret !== ADMIN_SECRET) return res.status(403).json({ success: false });
    const user = await User.findOneAndUpdate({ phone: phone.trim() }, { $inc: { balance: Number(amount) } }, { new: true });
    res.json({ success: true, newBalance: user ? user.balance : 0 });
});

app.get('/admin/withdraws', async (req, res) => {
    if (req.query.secret !== ADMIN_SECRET) return res.status(403).send("Refize");
    const list = await Withdraw.find({ status: 'Pending' }).sort({date: -1});
    res.json(list);
});

app.post('/admin/confirm-withdraw', async (req, res) => {
    if (req.body.secret !== ADMIN_SECRET) return res.status(403).json({ success: false });
    await Withdraw.findByIdAndUpdate(req.body.id, { status: 'Completed' });
    res.json({ success: true });
});

app.post('/request-withdraw', async (req, res) => {
    const { phone, amount } = req.body;
    const amt = Number(amount);
    const user = await User.findOne({ phone: phone.trim() });
    if (user && user.balance >= amt && amt >= 100) {
        await User.updateOne({ phone: phone.trim() }, { $inc: { balance: -amt } });
        const fee = amt * 0.05;
        await Withdraw.create({ phone: phone.trim(), amount: amt - fee, fee: fee });
        res.json({ success: true, newBalance: user.balance - amt });
    } else { res.json({ success: false, msg: "Balans ensifizan (Min 100G)!" }); }
});

// --- GAME LOGIC (SYSTEM CHANM OTOMATIK) ---
let privateRooms = {}; 

io.on('connection', (socket) => {
    socket.on('createPrivate', async (data) => {
        const user = await User.findOne({ phone: data.phone });
        if (!user || user.balance < data.bet) return socket.emit('errorMsg', "Balans ou ensifizan!");

        const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
        privateRooms[roomCode] = { host: data.phone, bet: Number(data.bet), socketId: socket.id };
        
        socket.join(roomCode);
        socket.emit('roomCreated', { code: roomCode, bet: data.bet });
    });

    socket.on('joinPrivate', async (data) => {
        const room = privateRooms[data.code];
        const user = await User.findOne({ phone: data.phone });

        if (!room) return socket.emit('errorMsg', "Kòd sa a pa bon!");
        if (room.host === data.phone) return socket.emit('errorMsg', "Ou pa ka jwe kont tèt ou!");
        if (!user || user.balance < room.bet) return socket.emit('errorMsg', "Balans ou ensifizan!");

        await User.updateOne({ phone: room.host }, { $inc: { balance: -room.bet } });
        await User.updateOne({ phone: data.phone }, { $inc: { balance: -room.bet } });

        socket.join(data.code);
        const prize = (room.bet * 2) * 0.9;
        
        io.to(data.code).emit('gameStart', { room: data.code, prize, firstTurn: room.host });
        delete privateRooms[data.code];
    });

    socket.on('move', (data) => socket.to(data.room).emit('opponentMove', data));

    socket.on('win', async (data) => {
        const winner = await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: data.prize } }, { new: true });
        io.to(data.room).emit('gameOver', { winner: data.phone, newBalance: winner.balance, prize: data.prize });
    });

    socket.on('disconnect', () => { /* Netwayaj chanm si sa nesesè */ });
});

server.listen(PORT, () => console.log(`🚀 LIVE sou ${PORT}`));
