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

// KONEKSYON AK KOREKSYON SÈTIFIKA
mongoose.connect(MONGO_URI, {
    tlsAllowInvalidCertificates: true,
    sslValidate: false,
    retryWrites: true,
})
.then(() => console.log("✅ MONGO KONEKTE"))
.catch(err => console.log("❌ ERÈ MONGO:", err));

const User = mongoose.model('User', new mongoose.Schema({
    phone: { type: String, unique: true },
    password: { type: String },
    balance: { type: Number, default: 0 },
    referralCount: { type: Number, default: 0 }
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};
let gameTimers = {}; // Pou jere 30 segonn yo

// FONKSYON TIMER (SI TAN FINI, OPOZAN AN GENYEN)
function startTurnTimer(roomCode, activePlayer, prize) {
    if (gameTimers[roomCode]) clearTimeout(gameTimers[roomCode]);

    gameTimers[roomCode] = setTimeout(async () => {
        if (rooms[roomCode]) {
            const players = rooms[roomCode].phones;
            const winnerPhone = players.find(p => p !== activePlayer);
            
            const winner = await User.findOneAndUpdate({ phone: winnerPhone }, { $inc: { balance: prize } }, { new: true });
            io.to(roomCode).emit('gameOver', { 
                winner: winnerPhone, 
                msg: "Tan fini (30s)! Opozan an genyen.", 
                newBalance: winner.balance 
            });
            delete rooms[roomCode];
            delete gameTimers[roomCode];
        }
    }, 30000); 
}

app.post('/login', async (req, res) => {
    const { phone, password, ref } = req.body;
    const cleanPhone = phone.trim();
    let user = await User.findOne({ phone: cleanPhone });
    if (!user) {
        if (ref && ref !== cleanPhone) await User.findOneAndUpdate({ phone: ref }, { $inc: { balance: 5, referralCount: 1 } });
        user = await User.create({ phone: cleanPhone, password, balance: 100 }); 
    }
    if (user.password !== password) return res.json({ success: false, msg: "Modpas pa bon!" });
    res.json({ success: true, user });
});

io.on('connection', (socket) => {
    socket.on('startMatchmaking', async (data) => {
        const bet = Number(data.bet);
        const user = await User.findOne({ phone: data.phone });
        if (!user || user.balance < bet) return socket.emit('errorMsg', "Balans ou piti!");

        // Lojik Matchmaking... (senplifye pou espas)
        // Lè match lanse:
        // startTurnTimer(roomCode, firstPlayer, prize);
    });

    socket.on('move', (data) => {
        if (rooms[data.room]) {
            socket.to(data.room).emit('opponentMove', data);
            const nextPlayer = rooms[data.room].phones.find(p => p !== data.phone);
            startTurnTimer(data.room, nextPlayer, data.prize);
        }
    });

    socket.on('win', async (data) => {
        if (rooms[data.room]) {
            clearTimeout(gameTimers[data.room]);
            delete rooms[data.room];
            const winner = await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: data.prize } }, { new: true });
            io.to(data.room).emit('gameOver', { winner: data.phone, msg: "MOPYON! Ou genyen!", newBalance: winner.balance });
        }
    });
});

server.listen(PORT, () => console.log(`⚡ Blitz Ready sou ${PORT}`));
