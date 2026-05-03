const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { transports: ['websocket'], cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;

mongoose.connect("mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/mopyon_db?retryWrites=true&w=majority").then(() => console.log("Mopyon Blitz Estab ✅"));

const User = mongoose.model('User', new mongoose.Schema({
    phone: { type: String, unique: true },
    password: { type: String },
    balance: { type: Number, default: 50 },
    referralCount: { type: Number, default: 0 }
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/login', async (req, res) => {
    const { phone, password, ref } = req.body;
    const cleanPhone = phone.trim();
    let user = await User.findOne({ phone: cleanPhone });
    if (!user) {
        if (ref && ref !== cleanPhone) await User.findOneAndUpdate({ phone: ref }, { $inc: { balance: 5, referralCount: 1 } });
        user = await User.create({ phone: cleanPhone, password, balance: 50 });
    } else if (user.password !== password) return res.json({ success: false });
    res.json({ success: true, user });
});

let rooms = {};

io.on('connection', (socket) => {
    socket.on('createRoom', async (data) => {
        const user = await User.findOne({ phone: data.phone });
        const bet = Number(data.bet);
        if (!user || user.balance < bet) return socket.emit('errorMsg', "Balans ou piti!");
        const code = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[code] = { host: data.phone, bet, players: [{id: socket.id, phone: data.phone}] };
        socket.join(code);
        socket.emit('roomCreated', { code, bet });
    });

    socket.on('joinRoom', async (data) => {
        const room = rooms[data.code];
        const user = await User.findOne({ phone: data.phone });
        if (room && user && user.balance >= room.bet && room.players.length === 1) {
            socket.join(data.code);
            room.players.push({id: socket.id, phone: data.phone});

            // RETIRE KÒB LA SOU DE JWÈ YO DEPI MATCH LA KÒMANSE
            for (let p of room.players) {
                const updatedUser = await User.findOneAndUpdate({ phone: p.phone }, { $inc: { balance: -room.bet } }, { new: true });
                // Voye nouvo balans lan bay chak jwè separeman
                io.to(p.id).emit('updateBalance', updatedUser.balance);
            }

            const prize = (room.bet * 2) * 0.95;
            io.to(data.code).emit('gameStart', { room: data.code, prize, turn: room.host, bet: room.bet });
        } else socket.emit('errorMsg', "Kòd pa bon oswa balans piti!");
    });

    socket.on('move', (data) => socket.to(data.room).emit('opponentMove', data));

    socket.on('win', async (data) => {
        if (!rooms[data.room]) return;
        const prize = Number(data.prize);
        const winnerPhone = data.phone;
        delete rooms[data.room];

        // SÈLMAN GANYAN AN KI JWENN PRI A (95G SI MIZ TE 50G)
        const winner = await User.findOneAndUpdate({ phone: winnerPhone }, { $inc: { balance: prize } }, { new: true });
        io.to(data.room).emit('gameOver', { winner: winnerPhone, prize: prize, winnerBalance: winner.balance });
    });

    socket.on('leaveRoom', (room) => socket.leave(room));
});

server.listen(PORT, () => console.log(`Sèvè kouri sou ${PORT}`));
