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

// --- KONEKSYON MONGODB ---
const mongoURI = "mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/mopyon_db?retryWrites=true&w=majority";
mongoose.connect(mongoURI).then(() => console.log("MongoDB Konekte ✅"));

// --- MODÈL YO ---
const User = mongoose.model('User', new mongoose.Schema({
    phone: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 50 },
    referralCount: { type: Number, default: 0 },
    referredBy: { type: String, default: null }
}));

const Withdraw = mongoose.model('Withdraw', new mongoose.Schema({
    phone: String, amount: Number, fee: Number, status: { type: String, default: 'Pending' }, date: { type: Date, default: Date.now }
}));

// --- ROUTES ---
app.post('/login', async (req, res) => {
    try {
        const { phone, password, ref } = req.body;
        const cleanPhone = phone.trim();
        let user = await User.findOne({ phone: cleanPhone });
        if (!user) {
            if (ref && ref !== cleanPhone) await User.findOneAndUpdate({ phone: ref }, { $inc: { balance: 5, referralCount: 1 } });
            user = await User.create({ phone: cleanPhone, password, balance: 50, referredBy: ref });
        } else if (user.password !== password) return res.json({ success: false, msg: "Modpas pa bon!" });
        res.json({ success: true, phone: user.phone, balance: user.balance });
    } catch (err) { res.json({ success: false, msg: "Erè sèvè" }); }
});

app.post('/request-withdraw', async (req, res) => {
    const { phone, amount } = req.body;
    const amt = Number(amount);
    if (amt < 100) return res.json({ success: false, msg: "Minimòm retrè se 100G!" });
    const user = await User.findOne({ phone: phone.trim() });
    if (user && user.balance >= amt) {
        const fee = amt * 0.05;
        await User.updateOne({ phone: phone.trim() }, { $inc: { balance: -amt } });
        await Withdraw.create({ phone: phone.trim(), amount: amt - fee, fee });
        res.json({ success: true, newBalance: user.balance - amt });
    } else res.json({ success: false, msg: "Balans ou ensifizan!" });
});

// --- ADMIN ---
app.post('/admin/update-balance', async (req, res) => {
    const { phone, amount, secret } = req.body;
    if (secret !== ADMIN_SECRET) return res.json({ success: false });
    await User.findOneAndUpdate({ phone: phone.trim() }, { $inc: { balance: Number(amount) } });
    res.json({ success: true });
});

// --- SOCKET LOGIC ---
let privateRooms = {};
let activeGames = {};

io.on('connection', (socket) => {
    socket.on('createPrivate', async (data) => {
        const betAmt = Number(data.bet);
        if (betAmt < 50) return socket.emit('errorMsg', "Miz minimòm lan se 50G!");
        const user = await User.findOne({ phone: data.phone });
        if (!user || user.balance < betAmt) return socket.emit('errorMsg', "Balans ou ensifizan!");

        const code = Math.floor(1000 + Math.random() * 9000).toString();
        privateRooms[code] = { host: data.phone, bet: betAmt, game: data.game };
        socket.join(code);
        socket.emit('roomCreated', { code, bet: betAmt, game: data.game });
    });

    socket.on('joinPrivate', async (data) => {
        const room = privateRooms[data.code];
        const user = await User.findOne({ phone: data.phone });
        if (room && user && user.balance >= room.bet) {
            await User.updateOne({ phone: room.host }, { $inc: { balance: -room.bet } });
            await User.updateOne({ phone: data.phone }, { $inc: { balance: -room.bet } });
            const prize = (room.bet * 2) * 0.95;
            activeGames[data.code] = { prize, players: [room.host, data.phone], game: room.game };
            socket.join(data.code);
            io.to(data.code).emit('gameStart', { room: data.code, prize, game: room.game, firstTurn: room.host });
            delete privateRooms[data.code];
        } else socket.emit('errorMsg', "Kòd mal oswa balans piti!");
    });

    socket.on('move', (data) => socket.to(data.room).emit('opponentMove', data));
    socket.on('win', async (data) => {
        const game = activeGames[data.room];
        if (game) {
            delete activeGames[data.room];
            const winner = await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: game.prize } }, { new: true });
            io.to(data.room).emit('gameOver', { winner: data.phone, prize: game.prize.toFixed(2), newBalance: winner.balance });
        }
    });
});

server.listen(PORT, () => console.log(`🚀 Sèvè ap kouri sou ${PORT}`));
