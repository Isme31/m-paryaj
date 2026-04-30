const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const dbURI = "mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/blitz_db?retryWrites=true&w=majority";
mongoose.connect(dbURI).then(() => console.log("✅ MongoDB Konekte!"));

const User = mongoose.model('User', { 
    phone: String, 
    password: String, 
    balance: {type: Number, default: 0},
    referredBy: String 
});

const Deposit = mongoose.model('Deposit', { phone: String, amount: Number, transactionId: String, status: {type: String, default: 'pending'} });

app.use(express.json());
app.use(express.static(__dirname));

// LOGIN + PARRAINAGE (5G)
app.post('/login', async (req, res) => {
    const { phone, password, ref } = req.body;
    try {
        let user = await User.findOne({ phone });
        if (!user) { 
            user = new User({ phone, password, referredBy: ref }); 
            await user.save();
            if(ref) await User.findOneAndUpdate({ phone: ref }, { $inc: { balance: 5 } });
        }
        if (user.password === password) {
            res.json({ success: true, balance: user.balance, phone: user.phone });
        } else { res.json({ success: false, message: "Modpas pa bon!" }); }
    } catch(e) { res.status(500).json({success: false}); }
});

// ADMIN: KONFIME DEPO
app.post('/admin/confirm-deposit', async (req, res) => {
    const { key, id } = req.body;
    if (key !== "hugues") return res.status(403).json({success: false});
    const depo = await Deposit.findById(id);
    if (depo && depo.status === 'pending') {
        await User.findOneAndUpdate({ phone: depo.phone }, { $inc: { balance: depo.amount } });
        depo.status = 'confirmed';
        await depo.save();
        res.json({ success: true });
    }
});

// SOCKET.IO: JWÈT 5 PYON
let waitingPlayer = null;
io.on('connection', (socket) => {
    socket.on('findGame', (userData) => {
        if (waitingPlayer && waitingPlayer.id !== socket.id) {
            const room = `room_${waitingPlayer.id}_${socket.id}`;
            socket.join(room); waitingPlayer.join(room);
            io.to(room).emit('gameStart', { room, players: [waitingPlayer.userData.phone, userData.phone], turn: 'X' });
            waitingPlayer = null;
        } else {
            waitingPlayer = socket; socket.userData = userData;
            socket.emit('status', "Ap chèche advèsè...");
        }
    });
    socket.on('move', (data) => { socket.to(data.room).emit('opponentMove', data); });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Sèvè ap kouri sou ${PORT}`));
