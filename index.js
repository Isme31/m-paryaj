const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const ADMIN_SECRET = "MOPYON2024";
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// DB CONNECTION
const mongoURI = "mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/mopyon_db?retryWrites=true&w=majority";
mongoose.connect(mongoURI).then(() => console.log("MongoDB Konekte ✅"));

// MODELS
const User = mongoose.model('User', new mongoose.Schema({
    phone: { type: String, unique: true },
    password: String,
    balance: { type: Number, default: 50 },
    referralCount: { type: Number, default: 0 }
}));

const Withdraw = mongoose.model('Withdraw', new mongoose.Schema({
    phone: String, amount: Number, fee: Number, status: { type: String, default: 'Pending' }, date: { type: Date, default: Date.now }
}));

// ROUTES
app.post('/login', async (req, res) => {
    try {
        const { phone, password, ref } = req.body;
        const cleanPhone = phone.trim();
        let user = await User.findOne({ phone: cleanPhone });
        if (!user) {
            if (ref && ref !== cleanPhone) await User.findOneAndUpdate({ phone: ref }, { $inc: { balance: 5, referralCount: 1 } });
            user = await User.create({ phone: cleanPhone, password, balance: 50 });
        } else if (user.password !== password) return res.json({ success: false, msg: "Modpas pa bon!" });
        res.json({ success: true, phone: user.phone, balance: user.balance });
    } catch (err) { res.json({ success: false }); }
});

app.post('/request-withdraw', async (req, res) => {
    const { phone, amount } = req.body;
    const amt = Number(amount);
    if (amt < 100) return res.json({ success: false, msg: "Minimòm 100G! 🛑" });
    const user = await User.findOne({ phone: phone.trim() });
    if (user && user.balance >= amt) {
        const fee = amt * 0.05;
        await User.updateOne({ phone: phone.trim() }, { $inc: { balance: -amt } });
        await Withdraw.create({ phone: phone.trim(), amount: amt - fee, fee: fee });
        res.json({ success: true, newBalance: user.balance - amt });
    } else res.json({ success: false, msg: "Balans ensifizan!" });
});

// ADMIN ROUTES
app.post('/admin/update-balance', async (req, res) => {
    const { phone, amount, secret } = req.body;
    if (secret !== ADMIN_SECRET) return res.json({ success: false });
    const user = await User.findOneAndUpdate({ phone: phone.trim() }, { $inc: { balance: Number(amount) } }, { new: true });
    res.json({ success: true, newBalance: user ? user.balance : 0 });
});

// GAME LOGIC
let rooms = {};
let activeGames = {};

io.on('connection', (socket) => {
    socket.on('createRoom', async (data) => {
        const user = await User.findOne({ phone: data.phone });
        if (!user || user.balance < data.bet) return socket.emit('errorMsg', "Balans ou piti!");
        const code = (data.type === 'domino' ? 'DOM-' : 'MOP-') + Math.floor(1000 + Math.random() * 9000);
        rooms[code] = { host: data.phone, bet: Number(data.bet), type: data.type, socketId: socket.id };
        socket.join(code);
        socket.emit('roomCreated', { code, bet: data.bet });
    });

    socket.on('joinRoom', async (data) => {
        const room = rooms[data.code];
        const user = await User.findOne({ phone: data.phone });
        if (room && user && user.balance >= room.bet) {
            await User.updateOne({ phone: room.host }, { $inc: { balance: -room.bet } });
            await User.updateOne({ phone: data.phone }, { $inc: { balance: -room.bet } });
            const prize = (room.bet * 2) * 0.95; // 5% Komisyon Admin
            
            if (room.type === 'domino') {
                let deck = []; for(let i=0; i<=6; i++) for(let j=i; j<=6; j++) deck.push([i,j]);
                deck.sort(() => Math.random() - 0.5);
                const h1 = deck.slice(0, 7), h2 = deck.slice(7, 14);
                const getD = (h) => { let m = -1; h.forEach(d => { if(d[0]===d[1] && d[0]>m) m=d[0]; }); return m; };
                const first = getD(h1) > getD(h2) ? room.host : data.phone;
                activeGames[data.code] = { prize, players: [room.host, data.phone] };
                io.to(data.code).emit('gameStart', { type: 'domino', room: data.code, hands: {[room.host]: h1, [data.phone]: h2}, prize, firstTurn: first });
            } else {
                activeGames[data.code] = { prize, players: [room.host, data.phone] };
                io.to(data.code).emit('gameStart', { type: 'mopyon', room: data.code, prize, firstTurn: room.host });
            }
            delete rooms[data.code];
        } else socket.emit('errorMsg', "Kòd erè oswa Balans piti!");
    });

    socket.on('move', (data) => socket.to(data.room).emit('opponentMove', data));
    socket.on('win', async (data) => {
        const game = activeGames[data.room];
        if (game) {
            delete activeGames[data.room];
            const winner = await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: game.prize } }, { new: true });
            io.to(data.room).emit('gameOver', { winner: data.phone, prize: game.prize.toFixed(2), newBalance: winner.balance });
        }
    });
});

server.listen(PORT, () => console.log(`🚀 Sèvè a sou pòt ${PORT}`));
