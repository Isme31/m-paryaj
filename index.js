const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    transports: ['websocket'], 
    pingInterval: 10000, 
    pingTimeout: 5000 
});

const PORT = process.env.PORT || 3000;

// KONEKSYON BAZ DE DONE
mongoose.connect("mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/mopyon_db?retryWrites=true&w=majority")
    .then(() => console.log("Tranzaksyon Estab ✅"));

const User = mongoose.model('User', new mongoose.Schema({
    phone: { type: String, unique: true },
    password: { type: String },
    balance: { type: Number, default: 50 },
    referralCount: { type: Number, default: 0 }
}));

const Transaction = mongoose.model('Transaction', new mongoose.Schema({
    phone: String, amount: Number, type: String, status: { type: String, default: 'Pending' }, date: { type: Date, default: Date.now }
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- ROUTES AUTH & RETRÈ ---
app.post('/login', async (req, res) => {
    const { phone, password, ref } = req.body;
    const cleanPhone = phone.trim();
    let user = await User.findOne({ phone: cleanPhone });
    if (!user) {
        if (ref && ref !== cleanPhone) await User.findOneAndUpdate({ phone: ref }, { $inc: { balance: 5, referralCount: 1 } });
        user = await User.create({ phone: cleanPhone, password, balance: 50 });
    } else if (user.password !== password) return res.json({ success: false, msg: "Modpas pa bon" });
    res.json({ success: true, user });
});

app.post('/request-withdraw', async (req, res) => {
    const { phone, amount } = req.body;
    const amt = Number(amount);
    const user = await User.findOne({ phone });
    if (user && user.balance >= amt && amt >= 100) {
        await User.updateOne({ phone }, { $inc: { balance: -amt } });
        await Transaction.create({ phone, amount: amt * 0.95, type: 'Withdraw' });
        res.json({ success: true, newBalance: user.balance - amt });
    } else res.json({ success: false, msg: "Min 100G ak balans sifi!" });
});

// --- LOGIK JWÈT ---
let rooms = {};

io.on('connection', (socket) => {
    socket.on('createRoom', async (data) => {
        const user = await User.findOne({ phone: data.phone });
        const bet = Number(data.bet);
        if (!user || user.balance < bet) return socket.emit('errorMsg', "Balans ou piti!");
        
        const code = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[code] = { host: data.phone, bet, players: [socket.id], phones: [data.phone] };
        
        socket.join(code);
        socket.emit('roomCreated', { code, bet });
    });

    socket.on('joinRoom', async (data) => {
        const room = rooms[data.code];
        const user = await User.findOne({ phone: data.phone });
        if (room && user && user.balance >= room.bet && room.players.length === 1) {
            socket.join(data.code);
            room.players.push(socket.id);
            room.phones.push(data.phone);

            // Tranzaksyon stab: rale kòb la nan de balans yo
            await User.updateOne({ phone: room.host }, { $inc: { balance: -room.bet } });
            await User.updateOne({ phone: data.phone }, { $inc: { balance: -room.bet } });

            io.to(data.code).emit('gameStart', { 
                room: data.code, 
                prize: (room.bet * 2) * 0.95, 
                turn: room.host,
                bet: room.bet
            });
        } else socket.emit('errorMsg', "Kòd pa bon oswa balans piti!");
    });

    socket.on('move', (data) => socket.to(data.room).emit('opponentMove', data));

    socket.on('win', async (data) => {
        if (!rooms[data.room]) return;
        const prize = Number(data.prize);
        delete rooms[data.room]; // Efase chanm nan pou evite doub peman

        const user = await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: prize } }, { new: true });
        io.to(data.room).emit('gameOver', { winner: data.phone, prize, newBalance: user.balance });
    });
});

server.listen(PORT, () => console.log(`Blitz kouri sou ${PORT}`));
