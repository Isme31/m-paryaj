const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const axios = require('axios');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- CONFIGURATION ---
const ADMIN_KEY = "hugues"; 
const URL_APLIKASYON_AN = "https://mopyon-50g.onrender.com"; // CHANJE ISIT
const dbURI = "mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/blitz_db?retryWrites=true&w=majority";

// --- CONNEXION MONGODB ---
mongoose.connect(dbURI)
    .then(() => console.log("✅ MongoDB Konekte ak siksè!"))
    .catch(err => console.log("❌ Erè MongoDB:", err));

// --- MODÈLES DE DONNÉES ---
const User = mongoose.model('User', { 
    phone: String, 
    password: String, 
    balance: {type: Number, default: 100} 
});

const Deposit = mongoose.model('Deposit', { 
    phone: String, 
    amount: Number, 
    transactionId: String, 
    status: {type: String, default: 'pending'}
});

const Withdrawal = mongoose.model('Withdrawal', { 
    userPhone: String, 
    amount: Number, 
    method: String, 
    status: {type: String, default: 'pending'}
});

// --- MIDDLEWARES ---
app.use(express.json());
// Sa ap pèmèt sèvè a jwenn CSS ak JS nan menm kote ak HTML la
app.use(express.static(__dirname)); 

// --- ROUTES POU PAJ YO ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin-panel', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// --- API ROUTES (LOGIN, BET, etc.) ---
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

// (Mete lòt route API yo isit la...)
// ... (Kòd ou te genyen pou /request-deposit, /bet, /win-game, /request-withdrawal)

// --- SYSTÈME ANTI-DODO (AUTO-PING) ---
setInterval(() => {
    axios.get(URL_APLIKASYON_AN).catch(() => {});
}, 840000); 

// --- SOCKETS ---
io.on('connection', (socket) => {
    socket.on('join-room', (d) => {
        socket.join(d.roomCode);
        socket.room = d.roomCode;
        const clients = io.sockets.adapter.rooms.get(d.roomCode);
        const role = (clients.size === 1) ? 'X' : 'O';
        socket.emit('player-role', role);
        if (clients.size === 2) io.to(d.roomCode).emit('start-game', 'X');
    });
    socket.on('mouvman', (d) => socket.to(d.room).emit('mouvman', d));
    socket.on('chat-message', (d) => io.to(d.room).emit('chat-message', d));
    socket.on('game-over', (d) => io.to(d.room).emit('reset'));
});

const PORT = process.env.PORT || 10000; // Render prefere 10000
server.listen(PORT, () => console.log(`🚀 Sèvè Blitz ap kouri sou pò ${PORT}`));
