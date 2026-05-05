const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { transports: ['websocket', 'polling'] });

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

// KONEKSYON SEKIRIZE
mongoose.connect(MONGO_URI, { 
    tlsAllowInvalidCertificates: true, 
    sslValidate: false,
    retryWrites: true 
}).then(() => console.log("✅ MONGO KONEKTE")).catch(err => console.log("❌ ERÈ MONGO:", err));

const User = mongoose.model('User', new mongoose.Schema({
    phone: { type: String, unique: true },
    password: { type: String },
    balance: { type: Number, default: 0 },
    referralCount: { type: Number, default: 0 }
}));

const Withdraw = mongoose.model('Withdraw', new mongoose.Schema({
    phone: String, amount: Number, status: { type: String, default: 'pending' }, date: { type: Date, default: Date.now }
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// FONKSYON SEKIRITE 8 CHIF
const cleanP = (p) => {
    let c = p.toString().replace(/\D/g, ''); 
    return c.length > 8 ? c.slice(-8) : c;
};

app.post('/login', async (req, res) => {
    try {
        let { phone, password, ref } = req.body;
        const p8 = cleanP(phone);
        let user = await User.findOne({ phone: p8 });
        if (!user) {
            if (ref) {
                const r8 = cleanP(ref);
                await User.findOneAndUpdate({ phone: r8 }, { $inc: { balance: 5, referralCount: 1 } });
            }
            user = await User.create({ phone: p8, password, balance: 10 }); 
        }
        if (user.password !== password) return res.json({ success: false, msg: "Modpas pa bon!" });
        res.json({ success: true, user });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/withdraw', async (req, res) => {
    try {
        const p8 = cleanP(req.body.phone);
        const amt = Number(req.body.amount);
        const user = await User.findOne({ phone: p8 });
        if (user && user.balance >= amt && amt >= 100) {
            await User.findOneAndUpdate({ phone: p8 }, { $inc: { balance: -amt } });
            await Withdraw.create({ phone: p8, amount: amt });
            res.json({ success: true });
        } else res.json({ success: false });
    } catch (e) { res.status(500).json({ success: false }); }
});

let rooms = {};
let gameTimers = {};

function checkWinServer(board, r, c, symbol) {
    const ds = [{dr:0,dc:1},{dr:1,dc:0},{dr:1,dc:1},{dr:1,dc:-1}];
    for (let {dr, dc} of ds) {
        let cells = [{r, c}];
        for (let i = 1; i < 5; i++) {
            let nr = r + dr * i, nc = c + dc * i;
            if (board[nr] && board[nr][nc] === symbol) cells.push({r: nr, c: nc}); else break;
        }
        for (let i = 1; i < 5; i++) {
            let nr = r - dr * i, nc = c - dc * i;
            if (board[nr] && board[nr][nc] === symbol) cells.push({r: nr, c: nc}); else break;
        }
        if (cells.length >= 5) return cells;
    }
    return null;
}

function startTurnTimer(roomCode, activePlayer) {
    if (gameTimers[roomCode]) clearTimeout(gameTimers[roomCode]);
    gameTimers[roomCode] = setTimeout(async () => {
        if (rooms[roomCode]) {
            const winnerP = rooms[roomCode].phones.find(p => p !== activePlayer);
            const prize = (rooms[roomCode].bet * 2) * 0.95;
            const winner = await User.findOneAndUpdate({ phone: winnerP }, { $inc: { balance: prize } }, { new: true });
            io.to(roomCode).emit('gameOver', { winner: winnerP, msg: "Tan opozan an fini!", newBalance: winner.balance });
            delete rooms[roomCode];
        }
    }, 31000);
}

io.on('connection', (socket) => {
    socket.on('joinPrivate', async (data) => {
        const p8 = cleanP(data.phone);
        const { roomCode, bet } = data;
        const user = await User.findOne({ phone: p8 });
        if (!user || user.balance < Number(bet)) return socket.emit('errorMsg', "Balans ou piti!");

        if (!rooms[roomCode]) {
            rooms[roomCode] = { host: p8, bet: Number(bet), phones: [p8], board: Array(20).fill().map(() => Array(20).fill('')) };
            socket.join(roomCode);
            socket.emit('match-status', "KÒD: " + roomCode + " (Atann zanmi...)");
        } else {
            const r = rooms[roomCode];
            if (r.phones.length >= 2) return socket.emit('errorMsg', "Chanm sa plen!");
            r.phones.push(p8);
            socket.join(roomCode);
            const prize = (r.bet * 2) * 0.95;
            await User.updateMany({ phone: { $in: r.phones } }, { $inc: { balance: -r.bet } });
            io.to(roomCode).emit('gameStart', { room: roomCode, prize, turn: r.host });
            startTurnTimer(roomCode, r.host);
        }
    });

    socket.on('move', async (data) => {
        const rCode = data.room;
        if (rooms[rCode]) {
            rooms[rCode].board[data.r][data.c] = data.symbol;
            socket.to(rCode).emit('opponentMove', data);
            const winCells = checkWinServer(rooms[rCode].board, data.r, data.c, data.symbol);
            if (winCells) {
                clearTimeout(gameTimers[rCode]);
                const prize = (rooms[rCode].bet * 2) * 0.95;
                const winner = await User.findOneAndUpdate({ phone: cleanP(data.phone) }, { $inc: { balance: prize } }, { new: true });
                io.to(rCode).emit('gameOver', { winner: winner.phone, winCells, msg: "MOPYON! 🎉", newBalance: winner.balance });
                delete rooms[rCode];
            } else {
                const nextP = rooms[rCode].phones.find(p => p !== cleanP(data.phone));
                startTurnTimer(rCode, nextP);
            }
        }
    });
});

server.listen(PORT, () => console.log(`⚡ Blitz Ready`));
