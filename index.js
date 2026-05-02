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

// --- GAME LOGIC ---
let waitingPlayers = [];
let activeGames = {};

io.on('connection', (socket) => {
    socket.on('findMatch', async (data) => {
        const user = await User.findOne({ phone: data.phone });
        const bet = Number(data.bet);
        if (!user || user.balance < bet) return socket.emit('gameOver', { msg: "Balans piti!" });

        let oppIdx = waitingPlayers.findIndex(p => p.bet === bet && p.phone !== data.phone);
        if (oppIdx > -1) {
            const opponent = waitingPlayers.splice(oppIdx, 1)[0];
            const room = `room_${Date.now()}`;
            await User.updateOne({ phone: data.phone }, { $inc: { balance: -bet } });
            await User.updateOne({ phone: opponent.phone }, { $inc: { balance: -bet } });

            socket.join(room);
            const oppSoc = io.sockets.sockets.get(opponent.socketId);
            if(oppSoc) oppSoc.join(room);

            const prize = (bet * 2) * 0.9;
            activeGames[room] = { prize, players: [socket.id, opponent.socketId] };
            io.to(room).emit('gameStart', { room, prize, firstTurn: data.phone });
            
            socket.emit('balanceUpdate', { balance: user.balance - bet });
            const oU = await User.findOne({ phone: opponent.phone });
            if(oppSoc) oppSoc.emit('balanceUpdate', { balance: oU.balance });
        } else { 
            waitingPlayers.push({ phone: data.phone, bet, socketId: socket.id }); 
        }
    });

    socket.on('move', (data) => socket.to(data.room).emit('opponentMove', data));

    socket.on('win', async (data) => {
        const game = activeGames[data.room];
        if (game) {
            delete activeGames[data.room];
            const winner = await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: game.prize } }, { new: true });
            io.to(data.room).emit('gameOver', { winner: data.phone, newBalance: winner.balance, prize: game.prize.toFixed(2) });
        }
    });

    socket.on('disconnect', () => { 
        waitingPlayers = waitingPlayers.filter(p => p.socketId !== socket.id); 
    });
});

server.listen(PORT, () => console.log(`🚀 LIVE sou ${PORT}`));
