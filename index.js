const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// KONFIGIRASYON
const ADMIN_SECRET = "MOPYON2024";
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- KONEKSYON MONGODB ---
// Mwen ajoute "mopyon_db" nan URL la pou asire l konekte nan bon baz done a
const mongoURI = "mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/mopyon_db?retryWrites=true&w=majority&appName=hugues";

mongoose.connect(mongoURI)
    .then(() => console.log("MongoDB Konekte nan mopyon_db ✅"))
    .catch(err => console.error("Erè Koneksyon DB:", err));

// --- MODÈL YO ---
// Mwen fòse non koleksyon an "users" pou l match ak foto ou a
const User = mongoose.model('User', new mongoose.Schema({
    phone: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 100 }
}), 'users');

const Withdraw = mongoose.model('Withdraw', new mongoose.Schema({
    phone: String,
    amount: Number,
    status: { type: String, default: 'Pending' },
    date: { type: Date, default: Date.now }
}), 'withdraws');

// --- ROUTES ADMIN ---
app.post('/admin/update-balance', async (req, res) => {
    const { phone, amount, secret } = req.body;
    if (secret !== ADMIN_SECRET) return res.status(403).json({ success: false, msg: "Kle Admin pa bon!" });
    try {
        const user = await User.findOneAndUpdate({ phone }, { $inc: { balance: amount } }, { new: true });
        if(!user) return res.json({ success: false, msg: "Jwè sa pa egziste" });
        res.json({ success: true, newBalance: user.balance });
    } catch (e) { res.json({ success: false, msg: "Erè nan baz done" }); }
});

app.get('/admin/withdraws', async (req, res) => {
    if (req.query.secret !== ADMIN_SECRET) return res.status(403).send("Refize");
    const list = await Withdraw.find({ status: 'Pending' });
    res.json(list);
});

app.post('/admin/confirm-withdraw', async (req, res) => {
    const { id, secret } = req.body;
    if (secret !== ADMIN_SECRET) return res.status(403).json({ success: false });
    await Withdraw.findByIdAndUpdate(id, { status: 'Completed' });
    res.json({ success: true });
});

// --- ROUTES JWÈ ---
app.post('/login', async (req, res) => {
    try {
        const { phone, password } = req.body;
        let user = await User.findOne({ phone });
        
        if (!user) {
            // Kreye nouvo jwè si li pa egziste
            user = await User.create({ phone, password, balance: 100 });
            console.log("Nouvo jwè enskri:", phone);
        } else if (user.password !== password) {
            return res.json({ success: false, msg: "Modpas pa bon" });
        }
        res.json({ success: true, phone: user.phone, balance: user.balance });
    } catch (err) {
        console.error("Erè Login:", err);
        res.json({ success: false, msg: "Erè Sèvè" });
    }
});

app.post('/request-withdraw', async (req, res) => {
    const { phone, amount } = req.body;
    const user = await User.findOne({ phone });
    if (user && user.balance >= amount && amount >= 100) {
        const updated = await User.findOneAndUpdate({ phone }, { $inc: { balance: -amount } }, { new: true });
        await Withdraw.create({ phone, amount });
        res.json({ success: true, newBalance: updated.balance });
    } else { res.json({ success: false, msg: "Balans twò piti (Min 100G)!" }); }
});

// --- LOJIK JWÈT (SOCKET.IO) ---
let waitingPlayers = [];
let activeGames = {};

io.on('connection', (socket) => {
    socket.on('findMatch', async (data) => {
        const user = await User.findOne({ phone: data.phone });
        if (!user || user.balance < data.bet) return socket.emit('gameOver', { msg: "Balans ou twò piti!" });

        let oppIdx = waitingPlayers.findIndex(p => p.bet === data.bet && p.phone !== data.phone);
        
        if (oppIdx > -1) {
            const opponent = waitingPlayers.splice(oppIdx, 1)[0];
            const room = `room_${Date.now()}`;
            
            // Retire kòb paryaj la
            await User.updateOne({ phone: data.phone }, { $inc: { balance: -data.bet } });
            await User.updateOne({ phone: opponent.phone }, { $inc: { balance: -data.bet } });

            socket.join(room);
            io.sockets.sockets.get(opponent.socketId)?.join(room);

            activeGames[room] = { 
                prize: (data.bet * 2) * 0.9, 
                players: { [socket.id]: data.phone, [opponent.socketId]: opponent.phone } 
            };

            io.to(room).emit('gameStart', { room, prize: activeGames[room].prize, firstTurn: data.phone });
            
            // Mizajou balans pou tou de
            socket.emit('balanceUpdate', { balance: user.balance - data.bet });
            io.to(opponent.socketId).emit('balanceUpdate', { balance: opponent.balance - data.bet });
        } else { 
            waitingPlayers.push({ ...data, socketId: socket.id }); 
            socket.emit('statusUpdate', "Ap chèche yon moun...");
        }
    });

    socket.on('move', (data) => { socket.to(data.room).emit('opponentMove', data); });

    socket.on('win', async (data) => {
        const game = activeGames[data.room];
        if (game) {
            delete activeGames[data.room]; // Sekirite pou evite double win
            const winner = await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: game.prize } }, { new: true });
            io.to(data.room).emit('gameOver', { winner: data.phone, newBalance: winner.balance, prize: game.prize.toFixed(2) });
        }
    });

    socket.on('disconnect', () => {
        waitingPlayers = waitingPlayers.filter(p => p.socketId !== socket.id);
    });
});

server.listen(PORT, () => console.log(`Sèvè a ap mache sou pòt ${PORT} 🚀`));
