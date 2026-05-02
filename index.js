const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const ADMIN_SECRET = "MOPYON2024"; // KLE SEKRE ADMIN NAN

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect("mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/mopyonDB?retryWrites=true&w=majority&appName=hugues").then(() => console.log("DB Konekte ✅"));

const User = mongoose.model('User', new mongoose.Schema({
    phone: { type: String, unique: true },
    password: String,
    balance: { type: Number, default: 100 }
}));

// --- API ADMIN SEKIRIZE ---
app.post('/admin/update-balance', async (req, res) => {
    const { phone, amount, secret } = req.body;
    if (secret !== ADMIN_SECRET) return res.status(403).json({ success: false, msg: "Sekirite: Kòd Admin pa bon!" });

    try {
        const user = await User.findOneAndUpdate({ phone }, { $inc: { balance: amount } }, { new: true });
        res.json({ success: true, newBalance: user.balance });
    } catch (e) { res.json({ success: false, msg: "Erè nan DB" }); }
});

// --- RÈS KÒD LOGIN AK SOCKET LA ---
app.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    let user = await User.findOne({ phone });
    if (!user) user = await User.create({ phone, password, balance: 100 });
    else if (user.password !== password) return res.json({ success: false, msg: "Modpas pa bon" });
    res.json({ success: true, phone: user.phone, balance: user.balance });
});

let waitingPlayers = [];
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
        } else {
            waitingPlayers.push({ ...data, socketId: socket.id });
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
});

server.listen(process.env.PORT || 3000, () => console.log("Sèvè Live 🚀"));
