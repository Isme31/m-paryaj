const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    transports: ['websocket', 'polling'], 
    cors: { origin: "*" } 
});

const PORT = process.env.PORT || 3000;

// Sèvi ak MONGO_URI ki nan Render Settings la si li la
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/mopyon_db?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
    .then(() => console.log("Mopyon Blitz Estab ✅"))
    .catch(err => console.log("Erè MongoDB: ", err));

const User = mongoose.model('User', new mongoose.Schema({
    phone: { type: String, unique: true },
    password: { type: String },
    balance: { type: Number, default: 50 },
    referralCount: { type: Number, default: 0 }
}));

app.use(express.json());

// --- KOREKSYON NOT FOUND ---
// Li di sèvè a sèvi fichiye ki nan menm folder ak index.js la
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
// ---------------------------

app.post('/login', async (req, res) => {
    try {
        const { phone, password, ref } = req.body;
        const cleanPhone = phone.trim();
        let user = await User.findOne({ phone: cleanPhone });
        if (!user) {
            if (ref && ref !== cleanPhone) await User.findOneAndUpdate({ phone: ref }, { $inc: { balance: 5, referralCount: 1 } });
            user = await User.create({ phone: cleanPhone, password, balance: 50 });
        } else if (user.password !== password) return res.json({ success: false, msg: "Modpas pa bon" });
        res.json({ success: true, user });
    } catch (e) {
        res.json({ success: false, msg: "Erè sèvè" });
    }
});

let rooms = {};

io.on('connection', (socket) => {
    socket.on('createRoom', async (data) => {
        try {
            const user = await User.findOne({ phone: data.phone });
            const bet = Number(data.bet);
            if (!user || user.balance < bet) return socket.emit('errorMsg', "Balans ou piti!");
            const code = Math.floor(1000 + Math.random() * 9000).toString();
            rooms[code] = { host: data.phone, bet, players: [{id: socket.id, phone: data.phone}] };
            socket.join(code);
            socket.emit('roomCreated', { code, bet });
        } catch (e) { console.log(e); }
    });

    socket.on('joinRoom', async (data) => {
        try {
            const room = rooms[data.code];
            const user = await User.findOne({ phone: data.phone });
            if (room && user && user.balance >= room.bet && room.players.length === 1) {
                socket.join(data.code);
                room.players.push({id: socket.id, phone: data.phone});

                for (let p of room.players) {
                    const updatedUser = await User.findOneAndUpdate({ phone: p.phone }, { $inc: { balance: -room.bet } }, { new: true });
                    io.to(p.id).emit('updateBalance', updatedUser.balance);
                }

                const prize = (room.bet * 2) * 0.95;
                io.to(data.code).emit('gameStart', { room: data.code, prize, turn: room.host, bet: room.bet });
            } else socket.emit('errorMsg', "Kòd pa bon oswa balans piti!");
        } catch (e) { console.log(e); }
    });

    socket.on('move', (data) => socket.to(data.room).emit('opponentMove', data));

    socket.on('win', async (data) => {
        try {
            if (!rooms[data.room]) return;
            const prize = Number(data.prize);
            const winnerPhone = data.phone;
            delete rooms[data.room];

            const winner = await User.findOneAndUpdate({ phone: winnerPhone }, { $inc: { balance: prize } }, { new: true });
            io.to(data.room).emit('gameOver', { winner: winnerPhone, prize: prize, winnerBalance: winner.balance });
        } catch (e) { console.log(e); }
    });

    socket.on('leaveRoom', (room) => socket.leave(room));
});

// KOREKSYON PORT POU RENDER
server.listen(PORT, "0.0.0.0", () => {
    console.log(`Sèvè kouri sou pò ${PORT} ⚡`);
});
