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
const dbURI = "mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/mopyonDB?retryWrites=true&w=majority&appName=hugues";
mongoose.connect(dbURI).then(() => console.log("MongoDB Konekte ✅")).catch(e => console.log("Erè DB ❌"));

// --- MODEL ---
const User = mongoose.model('User', new mongoose.Schema({
    phone: { type: String, unique: true },
    password: String,
    balance: { type: Number, default: 100 }
}));

// --- LOGIN ---
app.post('/login', async (req, res) => {
    try {
        const { phone, password } = req.body;
        let user = await User.findOne({ phone });
        if (!user) {
            user = await User.create({ phone, password, balance: 100 });
        } else if (user.password !== password) {
            return res.json({ success: false, msg: "Modpas pa bon" });
        }
        res.json({ success: true, phone: user.phone, balance: user.balance });
    } catch (e) { res.status(500).json({ success: false }); }
});

// --- ADMIN API ---
app.post('/admin/update-balance', async (req, res) => {
    const { phone, amount } = req.body;
    await User.findOneAndUpdate({ phone }, { $inc: { balance: amount } });
    res.json({ success: true });
});

let waitingPlayers = [];
let activeGames = {};

io.on('connection', (socket) => {
    // --- MATCH RAPID ---
    socket.on('findMatch', async (data) => {
        const user = await User.findOne({ phone: data.phone });
        if (!user || user.balance < 50) return socket.emit('gameOver', { msg: "Ou bezwen pi piti 50G pou w jwe!" });

        if (user.balance >= data.bet) {
            await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: -data.bet } });
            socket.emit('balanceUpdate', { balance: user.balance - data.bet });

            let oppIdx = waitingPlayers.findIndex(p => p.bet === data.bet && p.phone !== data.phone);
            if (oppIdx > -1) {
                const opponent = waitingPlayers.splice(oppIdx, 1)[0];
                const room = `room_${Date.now()}`;
                socket.join(room);
                const oppSock = io.sockets.sockets.get(opponent.socketId);
                if (oppSock) oppSock.join(room);

                activeGames[room] = { prize: (data.bet * 2) * 0.9, players: [socket.id, opponent.socketId] };
                io.to(room).emit('gameStart', { room, prize: activeGames[room].prize, firstTurn: data.phone });
            } else {
                waitingPlayers.push({ ...data, socketId: socket.id });
            }
        }
    });

    // --- MATCH PRIVE ---
    socket.on('joinPrivate', async (data) => {
        const user = await User.findOne({ phone: data.phone });
        if (!user || user.balance < 50) return socket.emit('gameOver', { msg: "Ou bezwen pi piti 50G pou w jwe!" });

        const roomName = `private_${data.room}`;
        socket.join(roomName);
        const clients = io.sockets.adapter.rooms.get(roomName);

        if (clients.size === 2) {
            await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: -data.bet } });
            activeGames[roomName] = { prize: (data.bet * 2) * 0.9, players: Array.from(clients) };
            io.to(roomName).emit('gameStart', { room: roomName, prize: activeGames[roomName].prize, firstTurn: data.phone });
        } else {
            await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: -data.bet } });
            socket.emit('balanceUpdate', { balance: user.balance - data.bet });
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

    socket.on('disconnect', () => {
        waitingPlayers = waitingPlayers.filter(p => p.socketId !== socket.id);
    });
});

server.listen(process.env.PORT || 3000, () => console.log("Sèvè Live 🚀"));
