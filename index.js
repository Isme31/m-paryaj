const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static(__dirname));

// --- 1. MONGODB (Balans & Retrè) ---
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost/blitz";
mongoose.connect(MONGO_URI).then(() => console.log("MongoDB konekte ✅")).catch(e => console.log(e));

const Player = mongoose.model('Player', new mongoose.Schema({
    phone: String, password: String, balance: { type: Number, default: 0 }, refBy: String
}));

const Withdraw = mongoose.model('Withdraw', new mongoose.Schema({
    phone: String, amount: Number, status: { type: String, default: 'pending' }
}));

// --- 2. WOUT PAJ YO ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin-blitz', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

app.post('/login', async (req, res) => {
    const { phone, password, ref } = req.body;
    let p = await Player.findOne({ phone });
    if (!p) p = await Player.create({ phone, password, refBy: ref, balance: 0 });
    res.json({ success: true, phone: p.phone, balance: p.balance });
});

// Admin Ops
app.post('/admin/update-balance', async (req, res) => {
    const { phone, amount, secret } = req.body;
    if (secret !== "1234") return res.json({ success: false }); // Chanje 1234 la
    await Player.findOneAndUpdate({ phone }, { $inc: { balance: parseInt(amount) } });
    res.json({ success: true });
});

app.get('/admin/withdraws', async (req, res) => {
    if (req.query.secret !== "1234") return res.json([]);
    res.json(await Withdraw.find({ status: 'pending' }));
});

// --- 3. SOCKET.IO (JWÈT & TIMER 30S) ---
const gameRooms = {};

io.on('connection', (socket) => {
    socket.on('createPrivate', (data) => {
        const code = Math.random().toString(36).substring(2, 6).toUpperCase();
        gameRooms[code] = { players: [data.phone], bet: data.bet, game: data.game, timer: 30 };
        socket.join(code);
        socket.emit('roomCreated', { code });
    });

    socket.on('joinPrivate', (data) => {
        const room = gameRooms[data.code];
        if (room && room.players.length < 2) {
            room.players.push(data.phone);
            socket.join(data.code);
            let startData = { room: data.code, game: room.game, firstTurn: room.players[0] };
            if(room.game === 'domino') {
                startData.hand1 = Array.from({length:7}, () => [Math.floor(Math.random()*7), Math.floor(Math.random()*7)]);
                startData.hand2 = Array.from({length:7}, () => [Math.floor(Math.random()*7), Math.floor(Math.random()*7)]);
            }
            io.to(data.code).emit('gameStart', startData);
            startTimer(data.code);
        }
    });

    socket.on('move', (data) => {
        if (gameRooms[data.room]) {
            gameRooms[data.room].timer = 30; // Reset Timer
            socket.to(data.room).emit('opponentMove', data);
        }
    });

    socket.on('win', (data) => {
        if (gameRooms[data.room]) {
            clearInterval(gameRooms[data.room].itv);
            io.to(data.room).emit('gameOver', { winner: data.phone });
            delete gameRooms[data.room];
        }
    });
});

function startTimer(code) {
    gameRooms[code].itv = setInterval(() => {
        if (gameRooms[code]) {
            gameRooms[code].timer--;
            io.to(code).emit('timerUpdate', { time: gameRooms[code].timer });
            if (gameRooms[code].timer <= 0) {
                clearInterval(gameRooms[code].itv);
                io.to(code).emit('errorMsg', "Tan an fini!");
                delete gameRooms[code];
            }
        }
    }, 1000);
}

server.listen(process.env.PORT || 3000, () => console.log("Sèvè Aktif!"));
