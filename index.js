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

let waitingPlayer = null;
let gameTimers = {};

// --- LOJIK TIMER SÈVÈ ---
function startTurnTimer(room, activePhone) {
    if (gameTimers[room]) clearTimeout(gameTimers[room]);
    gameTimers[room] = setTimeout(async () => {
        io.to(room).emit('timeout', { loser: activePhone });
        const players = room.replace('room_', '').split('_');
        const winnerPhone = players.find(p => p !== activePhone);
        if (winnerPhone) await User.findOneAndUpdate({ phone: winnerPhone }, { $inc: { balance: 90 } });
        delete gameTimers[room];
    }, 32000); // 32s (pou bay kliyan an tan senkronize)
}

// --- ROUTES ADMIN & LOGIN ---
app.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    let user = await User.findOne({ phone });
    if (!user) { user = new User({ phone, password }); await user.save(); }
    if (user.password === password) res.json({ success: true, balance: user.balance, phone: user.phone });
    else res.json({ success: false, message: "Modpas pa bon!" });
});

app.post('/submit-deposit', async (req, res) => {
    await new Deposit(req.body).save();
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
    socket.on('findMatch', async (data) => {
        const user = await User.findOne({ phone: data.phone });
        if (!user || user.balance < 50) return socket.emit('error_msg', "Balans ba (50G)!");

        if (waitingPlayer && waitingPlayer.phone !== data.phone) {
            const opponent = waitingPlayer;
            const room = `room_${opponent.phone}_${data.phone}`;
            waitingPlayer = null;
            socket.join(room); opponent.socket.join(room);
            await User.updateMany({ phone: { $in: [data.phone, opponent.phone] } }, { $inc: { balance: -50 } });
            io.to(room).emit('gameStart', { room, players: [opponent.phone, data.phone], firstTurn: opponent.phone });
            startTurnTimer(room, opponent.phone);
        } else {
            waitingPlayer = { phone: data.phone, socket: socket };
            socket.emit('status_update', "🔍 Ap chache jwè...");
        }
    });

    socket.on('move', (data) => {
        socket.to(data.room).emit('opponentMove', data);
        startTurnTimer(data.room, data.nextPlayer);
    });

    socket.on('win', async (data) => {
        if (gameTimers[data.room]) clearTimeout(gameTimers[data.room]);
        await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: 90 } });
        io.to(data.room).emit('gameOver', { winner: data.phone });
    });
});

server.listen(process.env.PORT || 10000);
