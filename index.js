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

mongoose.connect("mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/mopyon_db?retryWrites=true&w=majority")
    .then(() => console.log("MongoDB Konekte ✅"));

const User = mongoose.model('User', new mongoose.Schema({
    phone: { type: String, unique: true },
    password: String,
    balance: { type: Number, default: 50 }, // 50G Kado
    referralCount: { type: Number, default: 0 }
}));

const Withdraw = mongoose.model('Withdraw', new mongoose.Schema({ phone: String, amount: Number, fee: Number, status: { type: String, default: 'Pending' } }));

// ROUTES
app.post('/login', async (req, res) => {
    const { phone, password, ref } = req.body;
    const cleanPhone = phone.trim();
    let user = await User.findOne({ phone: cleanPhone });
    if (!user) {
        if (ref) await User.findOneAndUpdate({ phone: ref }, { $inc: { balance: 5, referralCount: 1 } });
        user = await User.create({ phone: cleanPhone, password, balance: 50 });
    }
    res.json({ success: true, phone: user.phone, balance: user.balance });
});

app.post('/request-withdraw', async (req, res) => {
    const { phone, amount } = req.body;
    const amt = Number(amount);
    if (amt < 100) return res.json({ success: false, msg: "Minimòm 100G" });
    const user = await User.findOne({ phone });
    if (user && user.balance >= amt) {
        const fee = amt * 0.05; // 5% Admin
        await User.updateOne({ phone }, { $inc: { balance: -amt } });
        await Withdraw.create({ phone, amount: amt - fee, fee });
        res.json({ success: true, newBalance: user.balance - amt });
    } else res.json({ success: false, msg: "Balans piti" });
});

// GAME LOGIC
let rooms = {};
let activeGames = {};

io.on('connection', (socket) => {
    socket.on('createRoom', async (data) => {
        const user = await User.findOne({ phone: data.phone });
        if (!user || user.balance < data.bet) return socket.emit('errorMsg', "Balans piti");
        const code = (data.type === 'domino' ? 'DOM-' : 'MOP-') + Math.floor(1000 + Math.random() * 9000);
        rooms[code] = { host: data.phone, bet: Number(data.bet), type: data.type };
        socket.join(code);
        socket.emit('roomCreated', { code, bet: data.bet });
    });

    socket.on('joinRoom', async (data) => {
        const room = rooms[data.code];
        const user = await User.findOne({ phone: data.phone });
        if (room && user && user.balance >= room.bet) {
            await User.updateOne({ phone: room.host }, { $inc: { balance: -room.bet } });
            await User.updateOne({ phone: data.phone }, { $inc: { balance: -room.bet } });
            const prize = (room.bet * 2) * 0.95; // 5% Admin
            
            if (room.type === 'domino') {
                let deck = []; for(let i=0; i<=6; i++) for(let j=i; j<=6; j++) deck.push([i,j]);
                deck.sort(() => Math.random() - 0.5);
                const h1 = deck.slice(0, 7), h2 = deck.slice(7, 14);
                
                const getMaxD = (hand) => {
                    let doubles = hand.filter(d => d[0] === d[1]).map(d => d[0]);
                    return doubles.length > 0 ? Math.max(...doubles) : -1;
                };

                const d1 = getMaxD(h1), d2 = getMaxD(h2);
                const first = d1 > d2 ? room.host : data.phone;

                activeGames[data.code] = { prize, players: [room.host, data.phone] };
                io.to(data.code).emit('gameStart', { type:'domino', room:data.code, hands:{[room.host]:h1, [data.phone]:h2}, prize, firstTurn:first });
            } else {
                activeGames[data.code] = { prize, players: [room.host, data.phone] };
                io.to(data.code).emit('gameStart', { type:'mopyon', room:data.code, prize, firstTurn:room.host });
            }
            delete rooms[data.code];
        } else socket.emit('errorMsg', "Kòd erè!");
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

server.listen(PORT, () => console.log("Sèvè LIVE 🚀"));
