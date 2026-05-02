const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static(__dirname)); // Sa a ranje erè "Not Found" la

// --- 1. MONGODB ---
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost/blitz";
mongoose.connect(MONGO_URI)
    .then(() => console.log("MongoDB konekte ✅"))
    .catch(e => console.log("Atansyon: Pral sèvi ak memwa lokal paske MongoDB pa konekte."));

const Player = mongoose.model('Player', new mongoose.Schema({
    phone: String, password: String, balance: { type: Number, default: 0 }, refBy: String
}));

const Withdraw = mongoose.model('Withdraw', new mongoose.Schema({
    phone: String, amount: Number, status: { type: String, default: 'pending' }
}));

// --- 2. WOUT POU PAJ YO ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin-blitz', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// Login ak Referans
app.post('/login', async (req, res) => {
    const { phone, password, ref } = req.body;
    try {
        let p = await Player.findOne({ phone });
        if (!p) p = await Player.create({ phone, password, refBy: ref, balance: 0 });
        res.json({ success: true, phone: p.phone, balance: p.balance });
    } catch (e) { res.json({ success: false, msg: "Erè sèvè" }); }
});

// Admin: Rechaje Balans
app.post('/admin/update-balance', async (req, res) => {
    const { phone, amount, secret } = req.body;
    if (secret !== "1234") return res.json({ success: false, msg: "Kle sekrè a pa bon" });
    try {
        await Player.findOneAndUpdate({ phone }, { $inc: { balance: parseInt(amount) } });
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

// Admin: Lis Retrè
app.get('/admin/withdraws', async (req, res) => {
    if (req.query.secret !== "1234") return res.json([]);
    res.json(await Withdraw.find({ status: 'pending' }));
});

// --- 3. LOGIK JWÈT (SOCKET.IO) ---
const gameRooms = {};

io.on('connection', (socket) => {
    console.log('Jwè konekte: ' + socket.id);

    socket.on('createPrivate', (data) => {
        const code = Math.random().toString(36).substring(2, 6).toUpperCase();
        gameRooms[code] = { 
            players: [data.phone], 
            bet: data.bet, 
            game: data.game, 
            timer: 30, // 30 segond
            itv: null 
        };
        socket.join(code);
        socket.emit('roomCreated', { code });
    });

    socket.on('joinPrivate', (data) => {
        const room = gameRooms[data.code];
        if (room && room.players.length < 2) {
            room.players.push(data.phone);
            socket.join(data.code);
            
            let startData = { 
                room: data.code, 
                game: room.game, 
                firstTurn: room.players[0], // Premye a kòmanse
                bet: room.bet 
            };

            // Lojik Domino (7 kat chak)
            if(room.game === 'domino') {
                startData.hand1 = Array.from({length: 7}, () => [Math.floor(Math.random()*7), Math.floor(Math.random()*7)]);
                startData.hand2 = Array.from({length: 7}, () => [Math.floor(Math.random()*7), Math.floor(Math.random()*7)]);
            }
            
            io.to(data.code).emit('gameStart', startData);
            startTimer(data.code);
        } else {
            socket.emit('errorMsg', "Kòd la pa bon oswa chanm nan plen.");
        }
    });

    socket.on('move', (data) => {
        if (gameRooms[data.room]) {
            gameRooms[data.room].timer = 30; // Reset timer
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

    socket.on('disconnect', () => {
        // Netwaye si yon moun pati
    });
});

// Fonksyon Timer
function startTimer(code) {
    if (!gameRooms[code]) return;
    gameRooms[code].itv = setInterval(() => {
        if (gameRooms[code]) {
            gameRooms[code].timer--;
            io.to(code).emit('timerUpdate', { time: gameRooms[code].timer });
            if (gameRooms[code].timer <= 0) {
                clearInterval(gameRooms[code].itv);
                io.to(code).emit('errorMsg', "Tan an fini! Match anile.");
                delete gameRooms[code];
            }
        } else {
            clearInterval(this);
        }
    }, 1000);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Blitz ⚡ moute sou pò ${PORT}`));
