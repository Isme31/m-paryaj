const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const axios = require('axios');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const ADMIN_KEY = "hugues"; 
// Ranplase lyen sa a ak lyen Render ou a
const URL_APLIKASYON_AN = "https://onrender.com"; 

// --- KONFIKIRASYON MONGODB ---
const dbURI = "mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/blitz_db?retryWrites=true&w=majority";
mongoose.connect(dbURI)
    .then(() => console.log("✅ MongoDB Konekte ak siksè!"))
    .catch(err => console.log("❌ Erè MongoDB:", err));

// --- MODÈL DONE ---
const User = mongoose.model('User', { 
    phone: String, 
    password: String, 
    balance: {type: Number, default: 100} 
});

const Deposit = mongoose.model('Deposit', { 
    phone: String, 
    amount: Number, 
    transactionId: String, 
    status: {type: String, default: 'pending'},
    date: { type: Date, default: Date.now }
});

const Withdrawal = mongoose.model('Withdrawal', { 
    userPhone: String, 
    amount: Number, 
    method: String, 
    status: {type: String, default: 'pending'},
    date: { type: Date, default: Date.now }
});

// --- MIDDLEWARE ---
app.use(express.json());
app.use(express.static(__dirname)); // Sa ap sèvi tout fichye ki bò kote index.js

// --- SISTÈM ANTI-DÒMI (AUTO-PING) ---
// Sa ap vizite sit la chak 14 minit pou Render pa janm mete l nan dòmi
setInterval(() => {
    axios.get(URL_APLIKASYON_AN)
        .then(() => console.log("⚡ Blitz toujou leve, li p ap dòmi!"))
        .catch(() => console.log("Ping failed, but it's okay."));
}, 840000); 

// --- ROUTES POU PAJ YO ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin-panel', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// --- API ROUTES ---
app.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    try {
        let user = await User.findOne({ phone });
        if (!user) { 
            user = new User({ phone, password }); 
            await user.save(); 
        }
        if (user.password === password) {
            res.json({ success: true, balance: user.balance, isAdmin: (phone === "31594645" || phone === "55110103") });
        } else { 
            res.json({ success: false, message: "Modpas pa bon!" }); 
        }
    } catch (e) { res.status(500).json({success: false}); }
});

app.post('/request-deposit', async (req, res) => {
    const { phone, amount, transactionId } = req.body;
    const existe = await Deposit.findOne({ transactionId });
    if(existe) return res.json({ success: false, message: "ID sa deja itilize!" });
    
    await new Deposit({ phone, amount: parseInt(amount), transactionId }).save();
    res.json({ success: true });
});

app.post('/bet', async (req, res) => {
    const { phone, password, free } = req.body;
    let user = await User.findOne({ phone, password });
    if (user && (free || user.balance >= 50)) {
        if (!free) { 
            user.balance -= 50; 
            await user.save(); 
        }
        res.json({ success: true, newBalance: user.balance });
    } else { res.json({ success: false, message: "Kòb ou pa ase!" }); }
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
        user.balance -= amount; 
        await user.save();
        await new Withdrawal({ userPhone: phone, amount, method }).save();
        res.json({ success: true, newBalance: user.balance });
    } else { res.json({ success: false }); }
});

// --- ADMIN API ---
app.get('/admin/data', async (req, res) => {
    if (req.query.key !== ADMIN_KEY) return res.status(403).send("Refize");
    const deposits = await Deposit.find({status:'pending'});
    const withdrawals = await Withdrawal.find({status:'pending'});
    res.json({ deposits, withdrawals });
});

app.post('/admin/confirm-deposit', async (req, res) => {
    if (req.body.key !== ADMIN_KEY) return res.status(403).send();
    const dep = await Deposit.findById(req.body.id);
    if (dep) {
        await User.findOneAndUpdate({ phone: dep.phone }, { $inc: { balance: dep.amount } });
        dep.status = 'confirmed'; 
        await dep.save();
        res.json({ success: true });
    }
});

// --- SOCKETS (POU JWÈT LA) ---
io.on('connection', (socket) => {
    socket.on('join-room', (d) => {
        socket.join(d.roomCode);
        socket.room = d.roomCode;
        const clients = io.sockets.adapter.rooms.get(d.roomCode);
        const role = (clients.size === 1) ? 'X' : 'O';
        socket.emit('player-role', role);
        if (clients.size === 2) io.to(d.roomCode).emit('start-game', 'X');
    });

    socket.on('mouvman', (d) => {
        socket.to(d.room).emit('mouvman', d);
    });

    socket.on('chat-message', (d) => {
        io.to(d.room).emit('chat-message', d);
    });

    socket.on('game-over', (d) => {
        io.to(d.room).emit('reset');
    });
});

// --- KÒMANSE SÈVÈ A ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Sèvè Blitz ap kouri sou pò ${PORT}`);
});
