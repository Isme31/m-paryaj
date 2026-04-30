const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const ADMIN_KEY = "hugues"; 
const URL_APLIKASYON_AN = "https://onrender.com"; // CHANJE SA AK LYEN PAW LA

// --- KONFIGIRASYON MONGODB ---
const dbURI = "mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/blitz_db?retryWrites=true&w=majority";
mongoose.connect(dbURI).then(() => console.log("✅ MongoDB Konekte")).catch(err => console.log(err));

// --- MODÈL DONE ---
const User = mongoose.model('User', { phone: String, password: String, balance: {type: Number, default: 100} });
const Deposit = mongoose.model('Deposit', { phone: String, amount: Number, transactionId: String, status: {type: String, default: 'pending'} });
const Withdrawal = mongoose.model('Withdrawal', { userPhone: String, amount: Number, method: String, status: {type: String, default: 'pending'} });

app.use(express.json());
app.use(express.static(__dirname));

// --- SISTÈM ANTI-DÒMI (AUTO-PING) ---
setInterval(() => {
    axios.get(URL_APLIKASYON_AN).then(() => console.log("⚡ Blitz toujou reveye!")).catch(() => {});
}, 840000); // Chak 14 minit

// --- ROUTES ---
app.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    let user = await User.findOne({ phone });
    if (!user) { user = new User({ phone, password }); await user.save(); }
    if (user.password === password) {
        res.json({ success: true, balance: user.balance, isAdmin: (phone === "31594645" || phone === "55110103") });
    } else { res.json({ success: false, message: "Modpas pa bon!" }); }
});

app.post('/request-deposit', async (req, res) => {
    const { phone, amount, transactionId } = req.body;
    if(await Deposit.findOne({ transactionId })) return res.json({ success: false, message: "ID deja itilize!" });
    await new Deposit({ phone, amount: parseInt(amount), transactionId }).save();
    res.json({ success: true });
});

app.post('/bet', async (req, res) => {
    const { phone, password, free } = req.body;
    let user = await User.findOne({ phone, password });
    if (user && (free || user.balance >= 50)) {
        if (!free) { user.balance -= 50; await user.save(); }
        res.json({ success: true, newBalance: user.balance });
    } else { res.json({ success: false }); }
});

app.post('/win-game', async (req, res) => {
    const { phone, password } = req.body;
    await User.findOneAndUpdate({ phone, password }, { $inc: { balance: 90 } });
    res.json({ success: true });
});

app.post('/request-withdrawal', async (req, res) => {
    const { phone, password, amount, method } = req.body;
    let user = await User.findOne({ phone, password });
    if (user && user.balance >= amount) {
        user.balance -= amount; await user.save();
        await new Withdrawal({ userPhone: phone, amount, method }).save();
        res.json({ success: true, newBalance: user.balance });
    } else { res.json({ success: false }); }
});

// --- ADMIN ---
app.get('/admin/data', async (req, res) => {
    if (req.query.key !== ADMIN_KEY) return res.status(403).send();
    res.json({ deposits: await Deposit.find({status:'pending'}), withdrawals: await Withdrawal.find({status:'pending'}) });
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

// --- SOCKETS ---
io.on('connection', (socket) => {
    socket.on('join-room', (d) => {
        socket.join(d.roomCode);
        const role = (io.sockets.adapter.rooms.get(d.roomCode).size === 1) ? 'X' : 'O';
        socket.emit('player-role', role);
        if (role === 'O') io.to(d.roomCode).emit('start-game', 'X');
    });
    socket.on('mouvman', (d) => socket.to(d.room).emit('mouvman', d));
    socket.on('game-over', (d) => io.to(d.room).emit('reset'));
});

server.listen(process.env.PORT || 3000);
