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

// Koneksyon MongoDB (Ranplase sa ak lyen pa ou a)
mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://admin:admin@cluster.mongodb.net/mopyon');

const User = mongoose.model('User', { phone: String, pass: String, balance: { type: Number, default: 0 } });
const Deposit = mongoose.model('Deposit', { phone: String, tid: String, amount: Number, method: String, status: { type: String, default: 'pending' } });

// --- ROUTES ---
app.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    let user = await User.findOne({ phone });
    if (!user) user = await User.create({ phone, pass: password, balance: 0 });
    res.json({ success: true, phone: user.phone, balance: user.balance });
});

app.post('/submit-deposit', async (req, res) => {
    await Deposit.create(req.body);
    res.json({ success: true });
});

// Route Admin Sekrè
const ADMIN_KEY = "hugues";
app.get('/admin/all-data', async (req, res) => {
    if (req.query.key !== ADMIN_KEY) return res.status(401).send("Aksè refize");
    const deposits = await Deposit.find({ status: 'pending' });
    res.json({ deposits });
});

// --- LOGIK JWÈT ---
let waitingPlayer = null;
io.on('connection', (socket) => {
    socket.on('findMatch', ({ phone, bet }) => {
        if (!waitingPlayer) {
            waitingPlayer = { socket, phone, bet };
        } else {
            const room = `room_${waitingPlayer.phone}_${phone}`;
            socket.join(room); waitingPlayer.socket.join(room);
            io.to(room).emit('gameStart', { room, firstTurn: waitingPlayer.phone, prize: bet * 2 });
            waitingPlayer = null;
        }
    });

    socket.on('move', (data) => { socket.to(data.room).emit('opponentMove', data); });
    
    socket.on('win', async ({ phone, prize }) => {
        await User.findOneAndUpdate({ phone }, { $inc: { balance: prize } });
        const user = await User.findOne({ phone });
        io.emit('balanceUpdate', { phone, newBalance: user.balance });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sèvè ap woule sou pòt ${PORT}`));
