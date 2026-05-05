const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    transports: ['websocket', 'polling'], 
    cors: { origin: "*" } 
});

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI; 

const ADMIN_INFO = {
    depo_phone: "31594645",
    retre_phone: "55110103",
    assistant_whatsapp: "https://wa.me"
};

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

// --- NOUVO: ROUTE POU TCHEKE BALANS LAN TOUT TAN ---
app.get('/api/get-balance/:phone', async (req, res) => {
    try {
        const user = await User.findOne({ phone: req.params.phone });
        if (user) {
            res.json({ success: true, balance: user.balance });
        } else {
            res.status(404).json({ success: false });
        }
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/api/admin-info', (req, res) => { res.json(ADMIN_INFO); });
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

app.post('/login', async (req, res) => {
    try {
        const { phone, password } = req.body;
        const cleanPhone = phone.trim().replace(/\s+/g, '');
        let user = await User.findOne({ phone: cleanPhone });
        if (!user) {
            user = await User.create({ phone: cleanPhone, password, balance: 0 });
            return res.json({ success: true, user, msg: `Byenveni! Depoze sou ${ADMIN_INFO.depo_phone}` });
        }
        if (user.password !== password) return res.json({ success: false, msg: "Modpas pa bon!" });
        return res.json({ success: true, user });
    } catch (e) { return res.status(500).json({ success: false, msg: "Erè Sèvè." }); }
});

// --- SOCKET.IO ---
io.on('connection', (socket) => {
    // Lè yon jwè konekte, nou voye balans li ba li depi nan DB
    socket.on('checkBalance', async (phone) => {
        const user = await User.findOne({ phone });
        if (user) socket.emit('updateBalance', user.balance);
    });

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
        socket.emit('updateBalance', winner.balance);
    });
});

let rooms = {};
let waitingPlayers = {}; 

// Ranplase ak URL Render ou a pou sèvè a pa dòmi
setInterval(() => { axios.get('https://onrender.com').catch(() => {}); }, 600000); 

server.listen(PORT, () => console.log(`Blitz ap kouri sou ${PORT} ⚡`));
