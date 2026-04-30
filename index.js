const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const ADMIN_KEY = "hugues"; 
const dbURI = "mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/blitz_db?retryWrites=true&w=majority";

mongoose.connect(dbURI).then(() => console.log("✅ MongoDB Konekte!"));

const User = mongoose.model('User', { phone: String, password: String, balance: {type: Number, default: 0} });
const Deposit = mongoose.model('Deposit', { phone: String, amount: Number, transactionId: {type: String, unique: true}, status: {type: String, default: 'pending'} });

app.use(express.json());
app.use(express.static(__dirname));

// --- ROUTES ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin-panel', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

app.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    try {
        let user = await User.findOne({ phone });
        if (!user) { user = new User({ phone, password }); await user.save(); }
        if (user.password === password) {
            res.json({ success: true, balance: user.balance, isAdmin: (phone === "31594645" || phone === "55110103") });
        } else { res.json({ success: false, message: "Modpas pa bon!" }); }
    } catch(e) { res.status(500).json({success: false}); }
});

app.post('/bet', async (req, res) => {
    const { phone, password } = req.body;
    let user = await User.findOne({ phone, password });
    if (user && (user.balance >= 50 || phone === "31594645" || phone === "55110103")) {
        if (!(phone === "31594645" || phone === "55110103")) { user.balance -= 50; await user.save(); }
        res.json({ success: true, newBalance: user.balance });
    } else { res.json({ success: false }); }
});

app.post('/win-game', async (req, res) => {
    const { phone, password } = req.body;
    await User.findOneAndUpdate({ phone, password }, { $inc: { balance: 90 } });
    res.json({ success: true });
});

// ADMIN API
app.get('/admin/all-data', async (req, res) => {
    if (req.query.key !== ADMIN_KEY) return res.status(403).send();
    res.json({ deposits: await Deposit.find({status:'pending'}) });
});

app.post('/admin/confirm-deposit', async (req, res) => {
    if (req.body.key !== ADMIN_KEY) return res.status(403).send();
    const dep = await Deposit.findById(req.body.id);
    if (dep) {
        await User.findOneAndUpdate({ phone: dep.phone }, { $inc: { balance: dep.amount } });
        dep.status = 'confirmed'; await dep.save();
        res.json({ success: true });
    }
});

app.post('/request-deposit', async (req, res) => {
    const { phone, amount, transactionId } = req.body;
    try {
        await new Deposit({ phone, amount: parseInt(amount), transactionId }).save();
        res.json({ success: true });
    } catch (e) { res.json({ success: false, message: "ID sa dejà itilize!" }); }
});

// SOCKETS
let waitingPlayers = [];
io.on('connection', (socket) => {
    socket.on('find-match', () => {
        if (waitingPlayers.length > 0) {
            let opponent = waitingPlayers.shift();
            let roomName = "match_" + Date.now();
            socket.join(roomName); opponent.join(roomName);
            socket.room = roomName; opponent.room = roomName;
            io.to(opponent.id).emit('player-role', 'X');
            io.to(socket.id).emit('player-role', 'O');
            io.to(roomName).emit('start-game', 'X');
        } else { waitingPlayers.push(socket); socket.emit('waiting', "Ap chèche moun..."); }
    });
    socket.on('join-room', (d) => {
        socket.join(d.roomCode); socket.room = d.roomCode;
        const clients = io.sockets.adapter.rooms.get(d.roomCode);
        socket.emit('player-role', (clients.size === 1) ? 'X' : 'O');
        if (clients.size === 2) io.to(d.roomCode).emit('start-game', 'X');
    });
    socket.on('mouvman', (d) => socket.to(socket.room).emit('mouvman', d));
    socket.on('disconnect', () => { waitingPlayers = waitingPlayers.filter(p => p.id !== socket.id); });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Sèvè ap kouri sou ${PORT}`));
