const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- KONFIGIRASYON ---
app.use(express.json());
app.use(express.static('public'));

// KONEKSYON MONGODB (Chanje URL sa si w ap itilize Atlas)
mongoose.connect('mongodb://localhost:27017/mopyonDB')
    .then(() => console.log("MongoDB Konekte ✅"))
    .catch(err => console.log("Erè DB:", err));

// --- MODEL DONE ---
const UserSchema = new mongoose.Schema({
    phone: { type: String, unique: true },
    password: String,
    balance: { type: Number, default: 0 }
});
const User = mongoose.model('User', UserSchema);

const DepositSchema = new mongoose.Schema({
    phone: String, tid: String, amount: Number, status: { type: String, default: 'pending' }, date: { type: Date, default: Date.now }
});
const Deposit = mongoose.model('Deposit', DepositSchema);

// --- ROUTES API ---

// Koneksyon / Enskripsyon
app.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    try {
        let user = await User.findOne({ phone });
        if (!user) {
            user = await User.create({ phone, password, balance: 0 });
        } else if (user.password !== password) {
            return res.json({ success: false, msg: "Modpas pa bon" });
        }
        res.json({ success: true, phone: user.phone, balance: user.balance });
    } catch (e) { res.json({ success: false }); }
});

// Soumèt Depo
app.post('/submit-deposit', async (req, res) => {
    try {
        await Deposit.create(req.body);
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

// Admin chaje done
app.get('/admin/all-data', async (req, res) => {
    if(req.query.key !== 'hugues') return res.status(403).send('Aksè refize');
    const deposits = await Deposit.find({ status: 'pending' }).sort({ date: -1 });
    res.json({ deposits });
});

// --- LOJIK JWÈT (SOCKET.IO) ---
let waitingPlayers = []; 

io.on('connection', (socket) => {
    console.log('Yon jwè konekte:', socket.id);

    socket.on('findMatch', async (data) => {
        const user = await User.findOne({ phone: data.phone });
        
        if (!user || user.balance < data.bet) {
            return socket.emit('error_msg', 'Balans ou twò piti!');
        }

        // Tcheke si gen yon moun k ap tann
        let opponentIndex = waitingPlayers.findIndex(p => 
            p.bet === data.bet && p.code === data.code && p.phone !== data.phone
        );

        if (opponentIndex > -1) {
            const opponent = waitingPlayers.splice(opponentIndex, 1)[0];
            const room = `room_${Date.now()}`;
            
            // Retire kòb paryaj la nan balans tou de jwè yo kòmanse
            await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: -data.bet } });
            await User.findOneAndUpdate({ phone: opponent.phone }, { $inc: { balance: -data.bet } });

            socket.join(room);
            io.sockets.sockets.get(opponent.socketId)?.join(room);

            io.to(room).emit('gameStart', {
                room: room,
                prize: data.bet * 1.9, // 10% komisyon pou house la
                firstTurn: Math.random() > 0.5 ? data.phone : opponent.phone
            });
        } else {
            waitingPlayers.push({ ...data, socketId: socket.id });
        }
    });

    socket.on('move', (data) => {
        socket.to(data.room).emit('opponentMove', data);
    });

    socket.on('win', async (data) => {
        // Sekirite: Sèlman server a ta dwe valide viktwa a nòmalman, 
        // men pou kounye a n ap mete pri a sou balans lan
        await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: data.prize } });
        console.log(`${data.phone} genyen ${data.prize}G`);
    });

    socket.on('disconnect', () => {
        waitingPlayers = waitingPlayers.filter(p => p.socketId !== socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Mopyon Blitz ap mache sou port ${PORT} 🚀`));
