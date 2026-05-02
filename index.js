const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const ADMIN_SECRET = "MOPYON2024"; // Kle sekrè Admin nan

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- DB CONNECTION ---
mongoose.connect("mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/mopyonDB?retryWrites=true&w=majority&appName=hugues")
    .then(() => console.log("MongoDB Konekte ✅"));

// --- MODELS ---
const User = mongoose.model('User', new mongoose.Schema({
    phone: { type: String, unique: true },
    password: String,
    balance: { type: Number, default: 100 }
}));

const Withdraw = mongoose.model('Withdraw', new mongoose.Schema({
    phone: String,
    amount: Number,
    status: { type: String, default: 'Pending' },
    date: { type: Date, default: Date.now }
}));

// --- ADMIN & MONEY ROUTES ---
app.post('/admin/update-balance', async (req, res) => {
    const { phone, amount, secret } = req.body;
    if (secret !== ADMIN_SECRET) return res.status(403).json({ success: false, msg: "Kle Admin pa bon!" });
    try {
        const user = await User.findOneAndUpdate({ phone }, { $inc: { balance: amount } }, { new: true });
        res.json({ success: true, newBalance: user.balance });
    } catch (e) { res.json({ success: false, msg: "Erè nan baz done" }); }
});

app.get('/admin/withdraws', async (req, res) => {
    if (req.query.secret !== ADMIN_SECRET) return res.status(403).send("Refize");
    const list = await Withdraw.find({ status: 'Pending' });
    res.json(list);
});

app.post('/admin/confirm-withdraw', async (req, res) => {
    if (req.body.secret !== ADMIN_SECRET) return res.status(403).json({ success: false });
    await Withdraw.findByIdAndUpdate(req.body.id, { status: 'Completed' });
    res.json({ success: true });
});

app.post('/request-withdraw', async (req, res) => {
    const { phone, amount } = req.body;
    const user = await User.findOne({ phone });
    if (user && user.balance >= amount && amount >= 100) {
        const updated = await User.findOneAndUpdate({ phone }, { $inc: { balance: -amount } }, { new: true });
        await Withdraw.create({ phone, amount });
        res.json({ success: true, newBalance: updated.balance });
    } else { res.json({ success: false, msg: "Balans twò piti (Min 100G)!" }); }
});

// --- LOGIN ---
app.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    let user = await User.findOne({ phone });
    if (!user) user = await User.create({ phone, password, balance: 100 });
    else if (user.password !== password) return res.json({ success: false, msg: "Modpas pa bon" });
    res.json({ success: true, phone: user.phone, balance: user.balance });
});

// --- GAME LOGIC ---
let waitingPlayers = [];
let privateRooms = {};
let activeGames = {};

io.on('connection', (socket) => {
    socket.on('findMatch', async (data) => {
        const user = await User.findOne({ phone: data.phone });
        if (!user || user.balance < 50) return socket.emit('gameOver', { msg: "Ou bezwen pi piti 50G!" });

        let oppIdx = waitingPlayers.findIndex(p => p.bet === data.bet && p.phone !== data.phone);
        if (oppIdx > -1) {
            const opponent = waitingPlayers.splice(oppIdx, 1)[0];
            const room = `room_${Date.now()}`;
            await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: -data.bet } });
            await User.findOneAndUpdate({ phone: opponent.phone }, { $inc: { balance: -data.bet } });

            socket.join(room);
            io.sockets.sockets.get(opponent.socketId)?.join(room);
            activeGames[room] = { prize: (data.bet * 2) * 0.9, players: [socket.id, opponent.socketId] };
            io.to(room).emit('gameStart', { room, prize: activeGames[room].prize, firstTurn: data.phone });
            socket.emit('balanceUpdate', { balance: user.balance - data.bet });
            io.to(opponent.socketId).emit('balanceUpdate', { balance: opponent.balance - data.bet });
        } else { waitingPlayers.push({ ...data, socketId: socket.id, balance: user.balance }); }
    });

    socket.on('joinPrivate', async (data) => {
        const user = await User.findOne({ phone: data.phone });
        if (!user || user.balance < 50) return socket.emit('gameOver', { msg: "Ou bezwen pi piti 50G!" });
        const roomKey = `priv_${data.room}`;
        if (privateRooms[roomKey]) {
            const opponent = privateRooms[roomKey];
            const room = `room_${Date.now()}`;
            socket.join(room);
            io.sockets.sockets.get(opponent.socketId)?.join(room);
            await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: -data.bet } });
            await User.findOneAndUpdate({ phone: opponent.phone }, { $inc: { balance: -data.bet } });
            activeGames[room] = { prize: (data.bet * 2) * 0.9, players: [socket.id, opponent.socketId] };
            io.to(room).emit('gameStart', { room, prize: activeGames[room].prize, firstTurn: opponent.phone });
            socket.emit('balanceUpdate', { balance: user.balance - data.bet });
            io.to(opponent.socketId).emit('balanceUpdate', { balance: opponent.balance - data.bet });
            delete privateRooms[roomKey];
        } else {
            privateRooms[roomKey] = { socketId: socket.id, phone: data.phone, bet: data.bet, balance: user.balance };
            socket.emit('statusUpdate', "Ap tann zanmi nan: " + data.room);
        }
    });

    socket.on('move', (data) => { socket.to(data.room).emit('opponentMove', data); });

    socket.on('win', async (data) => {
        const game = activeGames[data.room];
        if (game) {
            const winner = await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: game.prize } }, { new: true });
            io.to(data.room).emit('gameOver', { winner: data.phone, newBalance: winner.balance, prize: game.prize });
            delete activeGames[data.room];
        }
    });

    socket.on('disconnect', () => { waitingPlayers = waitingPlayers.filter(p => p.socketId !== socket.id); });
});

server.listen(process.env.PORT || 3000, () => console.log("Live 🚀"));
