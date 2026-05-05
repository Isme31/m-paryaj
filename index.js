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

// KOREKSYON POU ERÈ CERTIFICATE VALIDATION FAILED
mongoose.connect(MONGO_URI, {
    tlsAllowInvalidCertificates: true,
    sslValidate: false,
    retryWrites: true,
})
.then(() => console.log("✅ MONGO KONEKTE: Sekirite debloke!"))
.catch(err => console.log("❌ ERÈ MONGO:", err));

const User = mongoose.model('User', new mongoose.Schema({
    phone: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 0 },
    referralCount: { type: Number, default: 0 }
}));

const Withdraw = mongoose.model('Withdraw', new mongoose.Schema({
    phone: String, amount: Number, status: { type: String, default: 'pending' }, date: { type: Date, default: Date.now }
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/login', async (req, res) => {
    const { phone, password, ref } = req.body;
    const cleanPhone = phone.trim();
    let user = await User.findOne({ phone: cleanPhone });
    if (!user) {
        if (ref && ref !== cleanPhone) await User.findOneAndUpdate({ phone: ref }, { $inc: { balance: 5, referralCount: 1 } });
        user = await User.create({ phone: cleanPhone, password, balance: 10 }); 
    }
    if (user.password !== password) return res.json({ success: false, msg: "Modpas pa bon!" });
    res.json({ success: true, user });
});

app.post('/withdraw', async (req, res) => {
    const { phone, amount } = req.body;
    const user = await User.findOne({ phone });
    if (user && user.balance >= amount && amount >= 100) {
        await User.findOneAndUpdate({ phone }, { $inc: { balance: -amount } });
        await Withdraw.create({ phone, amount });
        res.json({ success: true, msg: "Demann voye bay Admin!" });
    } else res.json({ success: false, msg: "Balans ba oswa montan invalid!" });
});

let rooms = {};
let waitingPlayers = {}; 

io.on('connection', (socket) => {
    
    socket.on('startMatchmaking', async (data) => {
        const bet = Number(data.bet);
        const user = await User.findOne({ phone: data.phone });
        if (!user || user.balance < bet) return socket.emit('errorMsg', "Balans ou piti!");

        if (waitingPlayers[bet] && waitingPlayers[bet].phone !== data.phone) {
            const opp = waitingPlayers[bet];
            delete waitingPlayers[bet];
            const code = `auto_${Date.now()}`;
            rooms[code] = { phones: [opp.phone, data.phone], bet: bet, board: Array(15).fill().map(() => Array(15).fill('')) };
            socket.join(code);
            io.sockets.sockets.get(opp.id)?.join(code);
            await User.updateMany({ phone: { $in: [opp.phone, data.phone] } }, { $inc: { balance: -bet } });
            io.to(code).emit('gameStart', { room: code, prize: (bet * 2) * 0.95, turn: opp.phone });
        } else {
            waitingPlayers[bet] = { id: socket.id, phone: data.phone };
            socket.emit('match-status', "Ap chache opozan...");
        }
    });

    socket.on('joinPrivate', async (data) => {
        const { roomCode, phone, bet } = data;
        const user = await User.findOne({ phone });
        if (!user || user.balance < Number(bet)) return socket.emit('errorMsg', "Balans ou piti!");

        if (!rooms[roomCode]) {
            rooms[roomCode] = { host: phone, bet: Number(bet), phones: [phone], board: Array(15).fill().map(() => Array(15).fill('')) };
            socket.join(roomCode);
            socket.emit('match-status', "Atann yon zanmi... Kòd: " + roomCode);
        } else {
            const r = rooms[roomCode];
            if (r.phones.length >= 2) return socket.emit('errorMsg', "Chanm sa plen!");
            r.phones.push(phone);
            socket.join(roomCode);
            await User.updateMany({ phone: { $in: r.phones } }, { $inc: { balance: -r.bet } });
            io.to(roomCode).emit('gameStart', { room: roomCode, prize: (r.bet * 2) * 0.95, turn: r.host });
        }
    });

    socket.on('move', (data) => {
        if (rooms[data.room]) {
            rooms[data.room].board[data.r][data.c] = data.symbol;
            socket.to(data.room).emit('opponentMove', data);
        }
    });

    socket.on('win', async (data) => {
        if (rooms[data.room]) {
            const prize = Number(data.prize);
            delete rooms[data.room];
            const winner = await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: prize } }, { new: true });
            io.to(data.room).emit('gameOver', { winner: data.phone, newBalance: winner.balance });
        }
    });
});

server.listen(PORT, () => console.log(`⚡ Blitz aktive sou pòt ${PORT}`));
