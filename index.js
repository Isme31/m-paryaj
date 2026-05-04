const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const axios = require('axios'); // Mwen ajoute sa ✅

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    transports: ['websocket', 'polling'], 
    cors: { origin: "*" } 
});

const PORT = process.env.PORT || 3000;
const MONGO_URI = "mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/mopyon_db?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
    .then(() => console.log("Mopyon Blitz Estab ✅"))
    .catch(err => console.error("Erè MongoDB: ", err));

const User = mongoose.model('User', new mongoose.Schema({
    phone: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 0 },
    referralCount: { type: Number, default: 0 }
}));

const Withdraw = mongoose.model('Withdraw', new mongoose.Schema({
    phone: String,
    amount: Number,
    date: { type: Date, default: Date.now },
    status: { type: String, default: 'pending' }
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Route pou paj akèy la (index.html)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route pou paj admin (admin.html)
app.get('/admin-panel', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.post('/login', async (req, res) => {
    try {
        const { phone, password, ref } = req.body;
        if (!phone || !password) return res.status(400).json({ success: false, msg: "Ranpli tout bwat yo!" });

        const cleanPhone = phone.trim().replace(/\s+/g, '');
        if (!/^[3-5][0-9]{7}$/.test(cleanPhone)) {
            return res.json({ success: false, msg: "Nimewo 8 chif sèlman (Eg: 31223344)!" });
        }

        let user = await User.findOne({ phone: cleanPhone });
        if (!user) {
            if (ref && ref !== cleanPhone) {
                await User.findOneAndUpdate({ phone: ref }, { $inc: { balance: 5, referralCount: 1 } }).catch(e => console.log("Ref Error"));
            }
            user = await User.create({ phone: cleanPhone, password, balance: 0 });
            return res.json({ success: true, user, msg: "Byenveni! Kontakte nou pou rechaje." });
        }

        if (user.password !== password) return res.json({ success: false, msg: "Modpas pa bon!" });
        return res.json({ success: true, user });

    } catch (e) {
        return res.status(500).json({ success: false, msg: "Erè Sèvè." });
    }
});

app.post('/withdraw', async (req, res) => {
    try {
        const { phone, amount } = req.body;
        const user = await User.findOne({ phone });
        if (user && user.balance >= amount && amount >= 100) {
            await User.findOneAndUpdate({ phone }, { $inc: { balance: -amount } });
            await Withdraw.create({ phone, amount });
            res.json({ success: true, msg: "Demann voye!" });
        } else res.json({ success: false, msg: "Balans ou piti oswa montan an ba!" });
    } catch (e) { res.json({ success: false, msg: "Erè Sèvè" }); }
});

// SOCKET.IO LOGIC
let rooms = {};
let waitingPlayers = {}; 

io.on('connection', (socket) => {
    socket.on('startMatchmaking', async (data) => {
        const bet = Number(data.bet);
        const user = await User.findOne({ phone: data.phone });
        if (!user || user.balance < bet) return socket.emit('errorMsg', "Balans ou piti!");

        if (waitingPlayers[bet] && waitingPlayers[bet].phone !== data.phone) {
            const opponent = waitingPlayers[bet];
            delete waitingPlayers[bet];
            const code = `auto_${Date.now()}`;
            rooms[code] = { host: opponent.phone, bet, players: [{id: opponent.id, phone: opponent.phone}, {id: socket.id, phone: data.phone}] };
            socket.join(code);
            if (io.sockets.sockets.get(opponent.id)) io.sockets.sockets.get(opponent.id).join(code);

            for (let p of rooms[code].players) {
                const up = await User.findOneAndUpdate({ phone: p.phone }, { $inc: { balance: -bet } }, { new: true });
                io.to(p.id).emit('updateBalance', up.balance);
            }
            io.to(code).emit('gameStart', { room: code, prize: (bet * 2) * 0.95, turn: opponent.phone, symbol: 'X' });
        } else waitingPlayers[bet] = { id: socket.id, phone: data.phone };
    });

    socket.on('move', (data) => socket.to(data.room).emit('opponentMove', data));

    socket.on('win', async (data) => {
        if (!rooms[data.room]) return;
        const prize = Number(data.prize);
        delete rooms[data.room];
        const winner = await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: prize } }, { new: true });
        io.to(data.room).emit('gameOver', { winner: data.phone, prize });
    });
});

// SELF-PING POU EVITE DÒMI (Chak 10 minit) ✅
setInterval(() => {
    // RANPLASE URL SA A AK VRÈ LINK RENDER OU A
    axios.get('https://onrender.com')
        .then(() => console.log('Keep-alive: Sèvè a reveye!'))
        .catch(err => console.log('Keep-alive Error'));
}, 600000); 

server.listen(PORT, () => console.log(`Blitz ap kouri sou ${PORT} ⚡`));
