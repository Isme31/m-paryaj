const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Koneksyon MongoDB
mongoose.connect("mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/blitz_db?retryWrites=true&w=majority");

const User = mongoose.model('User', { phone: String, password: String, balance: { type: Number, default: 0 }, referredBy: String });

app.use(express.json());
app.use(express.static(__dirname));

// --- ROUTES ---
app.post('/login', async (req, res) => {
    const { phone, password, ref } = req.body;
    let user = await User.findOne({ phone });
    if (!user) { 
        user = new User({ phone, password, referredBy: ref }); await user.save();
        if(ref) await User.findOneAndUpdate({ phone: ref }, { $inc: { balance: 5 } });
    }
    if (user.password === password) res.json({ success: true, balance: user.balance, phone: user.phone });
    else res.json({ success: false, message: "Modpas pa bon!" });
});

// --- SOCKET.IO ---
io.on('connection', (socket) => {
    // KREYE TAB PRIVE (WHATSAPP)
    socket.on('createPrivate', (data) => {
        socket.join(data.room);
        socket.userData = data;
    });

    // RANTRE NAN TAB PRIVE
    socket.on('joinPrivate', async (data) => {
        const room = io.sockets.adapter.rooms.get(data.room);
        const user = await User.findOne({ phone: data.phone });
        if (user && user.balance >= 50 && room && room.size === 1) {
            socket.join(data.room);
            await User.updateMany({ phone: { $in: [data.phone, data.oppPhone] } }, { $inc: { balance: -50 } });
            io.to(data.room).emit('gameStart', { room: data.room, players: [data.oppPhone, data.phone], turn: 'X' });
        } else { socket.emit('error_msg', "Kòd envalid oswa balans ba!"); }
    });

    socket.on('move', (data) => socket.to(data.room).emit('opponentMove', data));
    socket.on('win', async (data) => {
        await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: 90 } });
        io.to(data.room).emit('gameOver', { winner: data.phone });
    });
});

server.listen(process.env.PORT || 10000);
