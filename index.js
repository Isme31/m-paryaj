const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- KONFIGIRASYON ---
const ADMIN_SECRET = "MOPYON2024"; 
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- KONEKSYON MONGODB ---
const mongoURI = "mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/mopyon_db?retryWrites=true&w=majority&appName=hugues";

mongoose.connect(mongoURI)
    .then(() => console.log("MongoDB Konekte nan mopyon_db ✅"))
    .catch(err => console.error("Erè Koneksyon DB:", err));

// --- MODÈL YO ---
const User = mongoose.model('User', new mongoose.Schema({
    phone: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 100 }
}), 'users');

const Withdraw = mongoose.model('Withdraw', new mongoose.Schema({
    phone: String,
    amount: Number,       // Sa jwè a ap resevwa apre frè a
    fee: Number,          // 5% ou kenbe a
    originalAmount: Number,
    status: { type: String, default: 'Pending' },
    date: { type: Date, default: Date.now }
}), 'withdraws');

// --- LOGIN & ENSRIPSYON ---
app.post('/login', async (req, res) => {
    try {
        const { phone, password } = req.body;
        if (!phone || !password) return res.json({ success: false, msg: "Ranpli tout bwat yo!" });

        let user = await User.findOne({ phone: phone.trim() });

        if (!user) {
            user = await User.create({ phone: phone.trim(), password, balance: 100 });
            console.log("✅ Nouvo jwè enskri: " + phone);
        } else if (user.password !== password) {
            return res.json({ success: false, msg: "Modpas la pa bon!" });
        }
        res.json({ success: true, phone: user.phone, balance: user.balance });
    } catch (err) {
        res.json({ success: false, msg: "Erè sèvè" });
    }
});

// --- RETRÈ LAJAN AK FRÈ 5% ---
app.post('/request-withdraw', async (req, res) => {
    const { phone, amount } = req.body;
    const user = await User.findOne({ phone: phone.trim() });

    if (user && user.balance >= amount && amount >= 100) {
        // Nou retire kòb la nan balans li
        await User.updateOne({ phone: phone.trim() }, { $inc: { balance: -amount } });
        
        // Kalkil Benefis ou (5%)
        const fee = amount * 0.05;
        const netAmount = amount - fee;

        await Withdraw.create({ 
            phone: phone.trim(), 
            amount: netAmount, 
            fee: fee, 
            originalAmount: amount 
        });

        res.json({ success: true, newBalance: user.balance - amount, msg: `W ap resevwa ${netAmount}G apre frè 5%.` });
    } else {
        res.json({ success: false, msg: "Balans twò piti (Min 100G)!" });
    }
});

// --- ADMIN ROUTES ---
app.post('/admin/update-balance', async (req, res) => {
    const { phone, amount, secret } = req.body;
    if (secret !== ADMIN_SECRET) return res.status(403).json({ success: false });
    const user = await User.findOneAndUpdate({ phone }, { $inc: { balance: amount } }, { new: true });
    res.json({ success: true, newBalance: user ? user.balance : 0 });
});

app.get('/admin/withdraws', async (req, res) => {
    if (req.query.secret !== ADMIN_SECRET) return res.status(403).send("Refize");
    const list = await Withdraw.find({ status: 'Pending' });
    res.json(list);
});

app.post('/admin/confirm-withdraw', async (req, res) => {
    const { id, secret } = req.body;
    if (secret !== ADMIN_SECRET) return res.status(403).json({ success: false });
    await Withdraw.findByIdAndUpdate(id, { status: 'Completed' });
    res.json({ success: true });
});

// --- LOJIK JWÈT (SOCKET.IO) ---
let waitingPlayers = [];
let activeGames = {};

io.on('connection', (socket) => {
    socket.on('findMatch', async (data) => {
        const user = await User.findOne({ phone: data.phone });
        if (!user || user.balance < data.bet) return socket.emit('gameOver', { msg: "Kòb ou pa ase!" });

        let oppIdx = waitingPlayers.findIndex(p => p.bet === data.bet && p.phone !== data.phone);

        if (oppIdx > -1) {
            const opponent = waitingPlayers.splice(oppIdx, 1)[0];
            const room = `room_${Date.now()}`;

            await User.updateOne({ phone: data.phone }, { $inc: { balance: -data.bet } });
            await User.updateOne({ phone: opponent.phone }, { $inc: { balance: -data.bet } });

            socket.join(room);
            const oppSocket = io.sockets.sockets.get(opponent.socketId);
            if (oppSocket) oppSocket.join(room);

            // Benefis ou: 10% sou chak match
            const prizePool = (data.bet * 2) * 0.9;
            activeGames[room] = { prize: prizePool, players: [socket.id, opponent.socketId] };

            io.to(room).emit('gameStart', { room, prize: prizePool, firstTurn: data.phone });
            socket.emit('balanceUpdate', { balance: user.balance - data.bet });
            if (oppSocket) oppSocket.emit('balanceUpdate', { balance: opponent.balance - data.bet });
        } else {
            waitingPlayers.push({ ...data, socketId: socket.id });
            socket.emit('statusUpdate', "Ap tann yon lòt moun...");
        }
    });

    socket.on('move', (data) => { socket.to(data.room).emit('opponentMove', data); });

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

server.listen(PORT, () => console.log(`🚀 Mopyon Blitz LIVE nan pòt ${PORT}`));
