const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Koneksyon MongoDB
const dbURI = "mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/blitz_db?retryWrites=true&w=majority";
mongoose.connect(dbURI).then(() => console.log("✅ Sèvè Blitz Pare!"));

// Modèl Done
const User = mongoose.model('User', { 
    phone: String, 
    password: String, 
    balance: { type: Number, default: 0 },
    referredBy: String 
});

const Deposit = mongoose.model('Deposit', { 
    phone: String, 
    amount: Number, 
    transactionId: String, 
    status: { type: String, default: 'pending' } 
});

app.use(express.json());
app.use(express.static(__dirname));

// --- ROUTES ---

app.post('/login', async (req, res) => {
    const { phone, password, ref } = req.body;
    try {
        let user = await User.findOne({ phone });
        if (!user) { 
            user = new User({ phone, password, referredBy: ref }); 
            await user.save();
            // Parrainage: bay paren an 5G
            if(ref && ref !== phone) await User.findOneAndUpdate({ phone: ref }, { $inc: { balance: 5 } });
        }
        if (user.password === password) {
            res.json({ success: true, balance: user.balance, phone: user.phone });
        } else { res.json({ success: false, message: "Modpas pa bon!" }); }
    } catch(e) { res.status(500).json({ success: false }); }
});

app.get('/admin/all-data', async (req, res) => {
    if (req.query.key !== "hugues") return res.status(403).send();
    const deposits = await Deposit.find({ status: 'pending' });
    res.json({ deposits });
});

app.post('/admin/confirm-deposit', async (req, res) => {
    const { key, id } = req.body;
    if (key !== "hugues") return res.status(403).send();
    const depo = await Deposit.findById(id);
    if (depo && depo.status === 'pending') {
        await User.findOneAndUpdate({ phone: depo.phone }, { $inc: { balance: depo.amount } });
        depo.status = 'confirmed';
        await depo.save();
        res.json({ success: true });
    }
});

// --- SOCKET.IO (JWÈT MULTIPLAYER) ---
let waitingPlayer = null;

io.on('connection', (socket) => {
    socket.on('findGame', async (userData) => {
        const user = await User.findOne({ phone: userData.phone });
        if (!user || user.balance < 50) return socket.emit('error_msg', "Rechaje kont ou (min 50G)!");

        if (waitingPlayer && waitingPlayer.userData.phone !== userData.phone) {
            const room = `room_${Date.now()}`;
            socket.join(room); waitingPlayer.join(room);
            
            // Retire 50G nan men chak jwè
            await User.updateMany({ phone: { $in: [waitingPlayer.userData.phone, userData.phone] } }, { $inc: { balance: -50 } });

            io.to(room).emit('gameStart', { 
                room, 
                players: { [waitingPlayer.id]: 'X', [socket.id]: 'O' },
                names: [waitingPlayer.userData.phone, userData.phone],
                turn: 'X' 
            });
            waitingPlayer = null;
        } else {
            waitingPlayer = socket; socket.userData = userData;
            socket.emit('status', "Ap chèche advèsè...");
        }
    });

    socket.on('move', (data) => socket.to(data.room).emit('opponentMove', data));

    socket.on('win', async (data) => {
        // Ganyen touche 90G (10G komisyon pou admin)
        await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: 90 } });
        io.to(data.room).emit('gameOver', { winner: data.phone });
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Blitz kouri sou pòt ${PORT}`));
