const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

mongoose.connect("mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/blitz_db?retryWrites=true&w=majority");

const User = mongoose.model('User', { phone: String, password: String, balance: { type: Number, default: 0 } });
const Deposit = mongoose.model('Deposit', { phone: String, amount: Number, transactionId: String, method: String, status: { type: String, default: 'pending' } });

app.use(express.json());
app.use(express.static(__dirname));

// --- GESTION MATCHMAKING ---
let waitingPlayer = null;

// --- ROUTES ---
app.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    let user = await User.findOne({ phone });
    if (!user) { user = new User({ phone, password }); await user.save(); }
    if (user.password === password) res.json({ success: true, balance: user.balance, phone: user.phone });
    else res.json({ success: false, message: "Modpas pa bon!" });
});

app.post('/submit-deposit', async (req, res) => {
    const { phone, tid, amount, method } = req.body;
    await new Deposit({ phone, amount, transactionId: tid, method }).save();
    res.json({ success: true });
});

app.get('/admin/all-data', async (req, res) => {
    if (req.query.key !== "hugues") return res.status(403).send("Refize");
    res.json({ deposits: await Deposit.find({ status: 'pending' }) });
});

app.post('/admin/confirm-deposit', async (req, res) => {
    const { key, id } = req.body;
    if (key !== "hugues") return res.status(403).json({ success: false });
    const dep = await Deposit.findById(id);
    if (dep && dep.status === 'pending') {
        const user = await User.findOneAndUpdate({ phone: dep.phone }, { $inc: { balance: dep.amount } }, { new: true });
        dep.status = 'confirmed'; await dep.save();
        io.emit('balanceUpdate', { phone: dep.phone, newBalance: user.balance });
        res.json({ success: true });
    }
});

// --- SOCKET.IO ---
io.on('connection', (socket) => {
    // Matchmaking
    socket.on('findMatch', async (data) => {
        const user = await User.findOne({ phone: data.phone });
        if (!user || user.balance < 50) return socket.emit('error_msg', "Rechaje kont ou pou w jwe (50G)!");

        if (waitingPlayer && waitingPlayer.phone !== data.phone) {
            const room = `room_${waitingPlayer.phone}_${data.phone}`;
            const opponent = waitingPlayer;
            waitingPlayer = null;

            socket.join(room);
            opponent.socket.join(room);

            await User.updateMany({ phone: { $in: [data.phone, opponent.phone] } }, { $inc: { balance: -50 } });
            io.to(room).emit('gameStart', { room, players: [opponent.phone, data.phone] });
        } else {
            waitingPlayer = { phone: data.phone, socket: socket };
            socket.emit('status_update', "🔍 Ap chache advèsè...");
        }
    });

    socket.on('cancelSearch', () => {
        if (waitingPlayer && waitingPlayer.socket.id === socket.id) {
            waitingPlayer = null;
            socket.emit('status_update', "Chache anile.");
        }
    });

    // Jwèt ak Kòd
    socket.on('createPrivate', (data) => { socket.join(data.room); socket.myPhone = data.phone; });
    socket.on('joinPrivate', async (data) => {
        const room = io.sockets.adapter.rooms.get(data.room);
        const user = await User.findOne({ phone: data.phone });
        if (user && user.balance < 50) return socket.emit('error_msg', "Rechaje kont ou!");
        if (room && room.size === 1) {
            const hostSocket = io.sockets.sockets.get(Array.from(room)[0]);
            socket.join(data.room);
            await User.updateMany({ phone: { $in: [data.phone, hostSocket.myPhone] } }, { $inc: { balance: -50 } });
            io.to(data.room).emit('gameStart', { room: data.room, players: [hostSocket.myPhone, data.phone] });
        } else { socket.emit('error_msg', "Kòd envalid!"); }
    });

    socket.on('move', (data) => socket.to(data.room).emit('opponentMove', data));
    socket.on('win', async (data) => {
        await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: 90 } });
        io.to(data.room).emit('gameOver', { winner: data.phone });
    });
});

server.listen(process.env.PORT || 10000);
