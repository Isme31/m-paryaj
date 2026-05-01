const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// KONEKSYON MONGODB
mongoose.connect("mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/blitz_db?retryWrites=true&w=majority");

// MODÈL YO
const User = mongoose.model('User', { 
    phone: String, 
    password: String, 
    balance: { type: Number, default: 0 } 
});

const Deposit = mongoose.model('Deposit', { 
    phone: String, 
    amount: Number, 
    transactionId: String, 
    method: String, 
    status: { type: String, default: 'pending' } 
});

app.use(express.json());
app.use(express.static(__dirname));

// LOGIN
app.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    let user = await User.findOne({ phone });
    if (!user) { user = new User({ phone, password }); await user.save(); }
    if (user.password === password) res.json({ success: true, balance: user.balance, phone: user.phone });
    else res.json({ success: false, message: "Modpas pa bon!" });
});

// DEPO
app.post('/submit-deposit', async (req, res) => {
    const { phone, tid, amount, method } = req.body;
    const newDep = new Deposit({ phone, amount, transactionId: tid, method });
    await newDep.save();
    res.json({ success: true });
});

// ADMIN
app.get('/admin/all-data', async (req, res) => {
    if (req.query.key !== "hugues") return res.status(403).send("Refize");
    const deposits = await Deposit.find({ status: 'pending' });
    res.json({ deposits });
});

app.post('/admin/confirm-deposit', async (req, res) => {
    const { key, id } = req.body;
    if (key !== "hugues") return res.status(403).json({ success: false });
    const dep = await Deposit.findById(id);
    if (dep && dep.status === 'pending') {
        const user = await User.findOneAndUpdate({ phone: dep.phone }, { $inc: { balance: dep.amount } }, { new: true });
        dep.status = 'confirmed'; await dep.save();
        io.emit('balanceUpdate', { phone: dep.phone, newBalance: user.balance });
        res.json({ success: true });
    }
});

// JWÈT ONLINE (SOCKET.IO)
io.on('connection', (socket) => {
    socket.on('createPrivate', (data) => { 
        socket.join(data.room); 
        socket.myPhone = data.phone;
    });

    socket.on('joinPrivate', async (data) => {
        const room = io.sockets.adapter.rooms.get(data.room);
        const user = await User.findOne({ phone: data.phone });
        
        if (user && user.balance >= 50 && room && room.size === 1) {
            const clients = Array.from(room);
            const hostSocket = io.sockets.sockets.get(clients[0]);
            
            socket.join(data.room);
            // Retire 50G nan tou de kont yo
            await User.updateMany({ phone: { $in: [data.phone, hostSocket.myPhone] } }, { $inc: { balance: -50 } });

            io.to(data.room).emit('gameStart', { 
                room: data.room, 
                players: [hostSocket.myPhone, data.phone] 
            });
        } else {
            socket.emit('error_msg', "Kòd pa bon oswa balans ba!");
        }
    });

    socket.on('move', (data) => socket.to(data.room).emit('opponentMove', data));

    socket.on('win', async (data) => {
        await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: 90 } });
        io.to(data.room).emit('gameOver', { winner: data.phone });
    });
});

server.listen(process.env.PORT || 10000);
