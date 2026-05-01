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

// --- 1. KONEKSYON MONGODB ---
// Ranplase liy sa a ak lyen MongoDB Atlas pa w la si w gen youn
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://admin:admin@cluster.mongodb.net/mopyon-blitz';
mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ Koneksyon ak MongoDB reyisi!"))
    .catch(err => console.error("❌ Erè koneksyon MongoDB:", err));

// --- 2. MODÈL DONE YO ---
const User = mongoose.model('User', { 
    phone: String, 
    pass: String, 
    balance: { type: Number, default: 0 } 
});

const Deposit = mongoose.model('Deposit', { 
    phone: String, 
    tid: String, 
    amount: Number, 
    method: String, 
    status: { type: String, default: 'pending' },
    date: { type: Date, default: Date.now }
});

// --- 3. ROUTES API ---

// Login oswa Kreye Kont
app.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    try {
        let user = await User.findOne({ phone });
        if (!user) {
            user = await User.create({ phone, pass: password, balance: 0 });
        }
        res.json({ success: true, phone: user.phone, balance: user.balance });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Soumèt yon Depo nan baz de done a
app.post('/submit-deposit', async (req, res) => {
    try {
        const { phone, tid, amount, method } = req.body;
        await Deposit.create({ phone, tid, amount, method });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

// Route pou Admin wè depo yo (Kle: hugues)
app.get('/admin/all-data', async (req, res) => {
    if (req.query.key !== "hugues") return res.status(401).send("Aksè refize");
    try {
        const deposits = await Deposit.find({ status: 'pending' }).sort({ date: -1 });
        res.json({ deposits });
    } catch (e) {
        res.status(500).send("Erè sèvè");
    }
});

// --- 4. LOGIK JWÈT AK SOCKET.IO ---
let waitingPlayer = null;

io.on('connection', (socket) => {
    console.log('Yon jwè konekte:', socket.id);

    socket.on('findMatch', async ({ phone, bet }) => {
        const user = await User.findOne({ phone });
        if (!user || user.balance < bet) {
            return socket.emit('status_update', "Balans ou twò piti!");
        }

        if (!waitingPlayer) {
            waitingPlayer = { socket, phone, bet };
            socket.emit('status_update', "Ap chèche yon advèsè...");
        } else {
            const room = `room_${waitingPlayer.phone}_${phone}`;
            const prize = (waitingPlayer.bet + bet) * 0.9; // 10% frè komisyon

            // Retire kòb la nan balans tou de jwè yo
            await User.updateOne({ phone: waitingPlayer.phone }, { $inc: { balance: -waitingPlayer.bet } });
            await User.updateOne({ phone: phone }, { $inc: { balance: -bet } });

            socket.join(room);
            waitingPlayer.socket.join(room);

            io.to(room).emit('gameStart', { 
                room, 
                firstTurn: waitingPlayer.phone, 
                prize: prize 
            });

            // Aktyalize balans sou ekran yo
            const u1 = await User.findOne({ phone: waitingPlayer.phone });
            const u2 = await User.findOne({ phone: phone });
            waitingPlayer.socket.emit('balanceUpdate', { phone: u1.phone, newBalance: u1.balance });
            socket.emit('balanceUpdate', { phone: u2.phone, newBalance: u2.balance });

            waitingPlayer = null;
        }
    });

    socket.on('move', (data) => {
        socket.to(data.room).emit('opponentMove', data);
    });

    socket.on('win', async ({ phone, prize }) => {
        const user = await User.findOneAndUpdate(
            { phone }, 
            { $inc: { balance: prize } }, 
            { new: true }
        );
        io.emit('balanceUpdate', { phone: user.phone, newBalance: user.balance });
    });

    socket.on('disconnect', () => {
        if (waitingPlayer && waitingPlayer.socket.id === socket.id) {
            waitingPlayer = null;
        }
    });
});

// --- 5. LANSE SÈVÈ A ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`⚡ Sèvè Mopyon Blitz ap woule sou pòt ${PORT}`);
});
