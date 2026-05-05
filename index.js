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

// --- KONEKSYON MONGODB (RANJE POU TRANZAKSYON) ---
mongoose.connect(MONGO_URI, {
    tlsAllowInvalidCertificates: true, // RANJE ERÈ "CERTIFICATE VALIDATION"
    retryWrites: true,
    w: 'majority'
})
.then(() => console.log("✅ MONGO KONEKTE AVÈK SIKSE!"))
.catch(err => console.log("❌ ERÈ KONEKSYON:", err));

// --- MODÈL YO (ASIRE YO SE NUMBER) ---
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

// --- LOGIN & REFERRAL ---
app.post('/login', async (req, res) => {
    try {
        const { phone, password, ref } = req.body;
        const cleanPhone = phone.trim().replace(/\s+/g, '');
        let user = await User.findOne({ phone: cleanPhone });

        if (!user) {
            if (ref && ref !== cleanPhone) {
                await User.findOneAndUpdate({ phone: ref }, { $inc: { balance: 5, referralCount: 1 } });
            }
            user = await User.create({ phone: cleanPhone, password, balance: 0 });
        }
        if (user.password !== password) return res.json({ success: false, msg: "Modpas pa bon!" });
        res.json({ success: true, user });
    } catch (e) { res.status(500).json({ success: false }); }
});

// --- TRANZAKSYON RETRÈ ---
app.post('/withdraw', async (req, res) => {
    const { phone, amount } = req.body;
    const user = await User.findOne({ phone });
    const val = Number(amount);
    if (user && user.balance >= val && val >= 100) {
        await User.findOneAndUpdate({ phone }, { $inc: { balance: -val } });
        await Withdraw.create({ phone, amount: val });
        res.json({ success: true, msg: "Demann voye bay Admin!" });
    } else res.json({ success: false, msg: "Balans ba oswa montan an piti!" });
});

// --- LOJIK JWÈT & TRANZAKSYON MATCH ---
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
            const code = `room_${Date.now()}`;
            rooms[code] = { phones: [opp.phone, data.phone], bet };
            
            socket.join(code);
            const oppSocket = io.sockets.sockets.get(opp.id);
            if(oppSocket) oppSocket.join(code);

            // Retire kòb de jwè yo nan MongoDB
            await User.updateMany({ phone: { $in: [opp.phone, data.phone] } }, { $inc: { balance: -bet } });
            io.to(code).emit('gameStart', { room: code, prize: (bet * 2) * 0.95, turn: opp.phone, symbol: 'X' });
        } else {
            waitingPlayers[bet] = { id: socket.id, phone: data.phone };
        }
    });

    socket.on('joinRoom', async (data) => {
        const { roomCode, phone, bet } = data;
        const user = await User.findOne({ phone });
        if (!rooms[roomCode]) {
            if (!user || user.balance < Number(bet)) return socket.emit('errorMsg', "Balans ou piti!");
            rooms[roomCode] = { host: phone, bet: Number(bet), phones: [phone] };
            socket.join(roomCode);
        } else {
            const r = rooms[roomCode];
            if (user.balance < r.bet) return socket.emit('errorMsg', "Balans ou piti!");
            r.phones.push(phone);
            socket.join(roomCode);
            await User.updateMany({ phone: { $in: r.phones } }, { $inc: { balance: -r.bet } });
            io.to(roomCode).emit('gameStart', { room: roomCode, prize: (r.bet * 2) * 0.95, turn: r.host, symbol: 'O' });
        }
    });

    socket.on('move', (data) => socket.to(data.room).emit('opponentMove', data));

    socket.on('win', async (data) => {
        if (rooms[data.room]) {
            const prize = Number(data.prize);
            delete rooms[data.room];
            // Depoze kòb ganyan an nan MongoDB
            const winner = await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: prize } }, { new: true });
            io.to(data.room).emit('gameOver', { winner: data.phone, prize });
            io.to(socket.id).emit('updateBalance', winner.balance);
        }
    });
});

// --- SISTÈM ANTI-DÒMI (PING SENP) ---
setInterval(() => {
    const url = process.env.RENDER_EXTERNAL_URL; 
    if (url) axios.get(url).catch(() => {});
}, 600000); 

server.listen(PORT, () => console.log(`⚡ Blitz ap kouri sou ${PORT}`));
