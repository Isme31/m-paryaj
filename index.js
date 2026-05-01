const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- KONEKSYON MONGODB ---
// Liy sa a ap pran lyen an nan Render Environment Variables (MONGO_URI)
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://hugues:MODPAS_OU_ISI@hugues.pte9ru5.mongodb.net/mopyon_db?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ MongoDB Konekte!"))
    .catch(err => console.error("❌ Erè MongoDB:", err));

// --- MODÈL YO ---
const User = mongoose.model('User', { 
    phone: String, 
    pass: String, 
    balance: { type: Number, default: 0 } 
});

const Deposit = mongoose.model('Deposit', { 
    phone: String, 
    tid: String, 
    amount: Number, 
    method: String, 
    status: { type: String, default: 'pending' } 
});

// --- ROUTES API ---
app.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    try {
        let user = await User.findOne({ phone });
        if (!user) user = await User.create({ phone, pass: password, balance: 0 });
        res.json({ success: true, phone: user.phone, balance: user.balance });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/submit-deposit', async (req, res) => {
    try {
        await Deposit.create(req.body);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/admin/all-data', async (req, res) => {
    if (req.query.key !== "hugues") return res.status(401).send("Aksè refize");
    const deposits = await Deposit.find({ status: 'pending' });
    res.json({ deposits });
});

// --- LOGIK JWÈT (SOCKET.IO) ---
let waitingPlayer = null;
io.on('connection', (socket) => {
    socket.on('findMatch', async ({ phone, bet }) => {
        const user = await User.findOne({ phone });
        if (!user || user.balance < bet) return socket.emit('status_update', "Kòb ou pa ase!");

        if (!waitingPlayer) {
            waitingPlayer = { socket, phone, bet };
            socket.emit('status_update', "Ap chèche moun...");
        } else {
            const room = `room_${waitingPlayer.phone}_${phone}`;
            const prize = (waitingPlayer.bet + bet) * 0.9;
            
            await User.updateOne({ phone: waitingPlayer.phone }, { $inc: { balance: -waitingPlayer.bet } });
            await User.updateOne({ phone: phone }, { $inc: { balance: -bet } });

            socket.join(room);
            waitingPlayer.socket.join(room);
            io.to(room).emit('gameStart', { room, firstTurn: waitingPlayer.phone, prize });
            waitingPlayer = null;
        }
    });

    socket.on('move', (data) => socket.to(data.room).emit('opponentMove', data));

    socket.on('win', async ({ phone, prize }) => {
        const user = await User.findOneAndUpdate({ phone }, { $inc: { balance: prize } }, { new: true });
        io.emit('balanceUpdate', { phone: user.phone, newBalance: user.balance });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sèvè ap woule sou pòt ${PORT}`));
