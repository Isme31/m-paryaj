const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- KONEKSYON MONGODB ---
// Lyen an mete ajou ak modpas "hugues" la
const dbURI = "mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/mopyonDB?retryWrites=true&w=majority&appName=hugues";

mongoose.connect(dbURI)
    .then(() => console.log("MongoDB Konekte nan Nwaj la! ✅"))
    .catch(err => console.error("Erè Koneksyon DB ❌:", err));

// --- MODEL DONE ---
const User = mongoose.model('User', new mongoose.Schema({
    phone: { type: String, unique: true },
    password: String,
    balance: { type: Number, default: 0 }
}));

const Deposit = mongoose.model('Deposit', new mongoose.Schema({
    phone: String, tid: String, amount: Number, status: { type: String, default: 'pending' }
}));

// --- ROUTES API ---
app.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    try {
        let user = await User.findOne({ phone });
        if (!user) {
            // Nou kreye itilizatè a si l pa egziste epi nou ba l 100G pou l teste
            user = await User.create({ phone, password, balance: 100 });
            console.log("Nouvo jwè: " + phone);
        } else if (user.password !== password) {
            return res.json({ success: false, msg: "Modpas pa bon" });
        }
        res.json({ success: true, phone: user.phone, balance: user.balance });
    } catch (e) {
        console.error("Erè nan login:", e);
        res.status(500).json({ success: false, msg: "Erè Sèvè" });
    }
});

app.post('/submit-deposit', async (req, res) => {
    try { 
        await Deposit.create(req.body); 
        res.json({ success: true }); 
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/admin/all-data', async (req, res) => {
    if(req.query.key !== 'hugues') return res.status(403).send('Aksè refize');
    const deposits = await Deposit.find({ status: 'pending' });
    res.json({ deposits });
});

// --- LOJIK JWÈT (SOCKET.IO) ---
let waitingPlayers = []; 

io.on('connection', (socket) => {
    socket.on('findMatch', async (data) => {
        try {
            const user = await User.findOne({ phone: data.phone });
            if (!user || user.balance < data.bet) return socket.emit('error', 'Kòb ou pa ase!');

            let opponentIndex = waitingPlayers.findIndex(p => p.bet === data.bet && p.phone !== data.phone);

            if (opponentIndex > -1) {
                const opponent = waitingPlayers.splice(opponentIndex, 1)[0];
                const room = `room_${Date.now()}`;
                
                socket.join(room);
                const oppSocket = io.sockets.sockets.get(opponent.socketId);
                if (oppSocket) oppSocket.join(room);

                io.to(room).emit('gameStart', {
                    room, 
                    prize: data.bet * 1.9,
                    firstTurn: Math.random() > 0.5 ? data.phone : opponent.phone
                });
            } else {
                waitingPlayers.push({ ...data, socketId: socket.id });
            }
        } catch (e) { console.error(e); }
    });

    socket.on('move', (data) => socket.to(data.room).emit('opponentMove', data));

    socket.on('win', async (data) => {
        try {
            await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: data.prize } });
            console.log("Ganyan: " + data.phone + " + " + data.prize + "G");
        } catch (e) { console.error(e); }
    });

    socket.on('disconnect', () => {
        waitingPlayers = waitingPlayers.filter(p => p.socketId !== socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sèvè a Live sou port ${PORT} 🚀`));
