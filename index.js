const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    transports: ['websocket', 'polling'], 
    cors: { origin: "*" } 
});

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/mopyon_db?retryWrites=true&w=majority";
const ADMIN_SECRET = "hugues";

mongoose.connect(MONGO_URI)
    .then(() => console.log("Mopyon Blitz Estab ✅"))
    .catch(err => console.log("Erè MongoDB: ", err));

// --- MODÈL ---
const User = mongoose.model('User', new mongoose.Schema({
    phone: { type: String, unique: true },
    password: { type: String },
    balance: { type: Number, default: 50 },
    referralCount: { type: Number, default: 0 }
}));

const Withdraw = mongoose.model('Withdraw', new mongoose.Schema({
    phone: String,
    amount: Number,
    date: { type: Date, default: Date.now },
    status: { type: String, default: 'pending' }
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- LOGIN + SEKIRITE ---
app.post('/login', async (req, res) => {
    try {
        const { phone, password, ref } = req.body;
        const cleanPhone = phone.trim().replace(/\s+/g, ''); 
        const haitiRegex = /^[3-5][0-9]{7}$/;

        if (!haitiRegex.test(cleanPhone)) {
            return res.json({ success: false, msg: "Nimewo sa pa valab! (8 chif Digicel/Natcom)" });
        }

        let user = await User.findOne({ phone: cleanPhone });
        if (!user) {
            if (ref && ref !== cleanPhone) {
                await User.findOneAndUpdate({ phone: ref }, { $inc: { balance: 5, referralCount: 1 } });
            }
            user = await User.create({ phone: cleanPhone, password, balance: 50 });
        } else if (user.password !== password) {
            return res.json({ success: false, msg: "Modpas pa bon" });
        }
        res.json({ success: true, user });
    } catch (e) { res.json({ success: false, msg: "Erè sèvè" }); }
});

// --- RETRÈ ---
app.post('/withdraw', async (req, res) => {
    try {
        const { phone, amount } = req.body;
        const amt = Number(amount);
        const user = await User.findOne({ phone });
        if (user && user.balance >= amt && amt >= 100) {
            await User.findOneAndUpdate({ phone }, { $inc: { balance: -amt } });
            await Withdraw.create({ phone, amount: amt });
            res.json({ success: true, msg: "Demann voye! N ap trete l rapid." });
        } else {
            res.json({ success: false, msg: "Balans ou piti (Min 100G)." });
        }
    } catch (e) { res.json({ success: false, msg: "Erè" }); }
});

// --- ADMIN ---
app.post('/admin/update-balance', async (req, res) => {
    const { phone, amount, secret } = req.body;
    if (secret !== ADMIN_SECRET) return res.json({ success: false });
    const user = await User.findOneAndUpdate({ phone }, { $inc: { balance: Number(amount) } }, { new: true });
    res.json({ success: !!user });
});

app.get('/admin/withdraws', async (req, res) => {
    if (req.query.secret !== ADMIN_SECRET) return res.json([]);
    res.json(await Withdraw.find({ status: 'pending' }));
});

// --- JWÈT (SOCKET.IO) ---
let rooms = {};
let waitingPlayers = {}; 

io.on('connection', (socket) => {
    // Matchmaking Auto
    socket.on('startMatchmaking', async (data) => {
        const bet = Number(data.bet);
        const user = await User.findOne({ phone: data.phone });
        if (!user || user.balance < bet) return socket.emit('errorMsg', "Balans ou piti!");

        if (waitingPlayers[bet] && waitingPlayers[bet].phone !== data.phone) {
            const opponent = waitingPlayers[bet];
            delete waitingPlayers[bet];
            const code = `auto_${Date.now()}`;
            rooms[code] = { host: opponent.phone, bet, players: [{id: opponent.id, phone: opponent.phone}, {id: socket.id, phone: data.phone}] };
            socket.join(code);
            const oppSocket = io.sockets.sockets.get(opponent.id);
            if(oppSocket) oppSocket.join(code);

            for (let p of rooms[code].players) {
                const up = await User.findOneAndUpdate({ phone: p.phone }, { $inc: { balance: -bet } }, { new: true });
                io.to(p.id).emit('updateBalance', up.balance);
            }
            io.to(code).emit('gameStart', { room: code, prize: (bet * 2) * 0.95, turn: opponent.phone, bet });
        } else {
            waitingPlayers[bet] = { id: socket.id, phone: data.phone };
        }
    });

    socket.on('cancelMatchmaking', (bet) => {
        if (waitingPlayers[bet] && waitingPlayers[bet].id === socket.id) delete waitingPlayers[bet];
    });

    // Kòd Prive
    socket.on('createRoom', async (data) => {
        const user = await User.findOne({ phone: data.phone });
        const bet = Number(data.bet);
        if (!user || user.balance < bet) return socket.emit('errorMsg', "Balans ou piti!");
        const code = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[code] = { host: data.phone, bet, players: [{id: socket.id, phone: data.phone}] };
        socket.join(code);
        socket.emit('roomCreated', { code, bet });
    });

    socket.on('joinRoom', async (data) => {
        const room = rooms[data.code];
        const user = await User.findOne({ phone: data.phone });
        if (room && user && user.balance >= room.bet && room.players.length === 1) {
            socket.join(data.code);
            room.players.push({id: socket.id, phone: data.phone});
            for (let p of room.players) {
                const up = await User.findOneAndUpdate({ phone: p.phone }, { $inc: { balance: -room.bet } }, { new: true });
                io.to(p.id).emit('updateBalance', up.balance);
            }
            io.to(data.code).emit('gameStart', { room: data.code, prize: (room.bet * 2) * 0.95, turn: room.host, bet: room.bet });
        } else socket.emit('errorMsg', "Kòd erè oswa balans piti!");
    });

    socket.on('move', (data) => socket.to(data.room).emit('opponentMove', data));

    socket.on('win', async (data) => {
        if (!rooms[data.room]) return;
        const prize = Number(data.prize);
        delete rooms[data.room];
        const winner = await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: prize } }, { new: true });
        io.to(data.room).emit('gameOver', { winner: data.phone, prize, winnerBalance: winner.balance });
    });

    socket.on('disconnect', async (reason) => {
        for (let code in rooms) {
            const room = rooms[code];
            const pIndex = room.players.findIndex(p => p.id === socket.id);
            if (pIndex !== -1) {
                const opponent = room.players.find(p => p.id !== socket.id);
                if (room.players.length === 2) {
                    if (reason === "client namespace disconnect" || reason === "server namespace disconnect") {
                        const prize = (room.bet * 2) * 0.95;
                        if (opponent) {
                            const winner = await User.findOneAndUpdate({ phone: opponent.phone }, { $inc: { balance: prize } }, { new: true });
                            io.to(opponent.id).emit('updateBalance', winner.balance);
                            io.to(opponent.id).emit('gameOver', { winner: opponent.phone, prize, msg: "Abandone! Ou genyen." });
                        }
                    } else {
                        for (let p of room.players) { await User.findOneAndUpdate({ phone: p.phone }, { $inc: { balance: room.bet } }); }
                        io.to(code).emit('errorMsg', "Koneksyon koupe. Ranbousman!");
                    }
                }
                delete rooms[code]; break;
            }
        }
        for (let bet in waitingPlayers) { if (waitingPlayers[bet].id === socket.id) delete waitingPlayers[bet]; }
    });
});

server.listen(PORT, "0.0.0.0", () => console.log(`Sèvè kouri sou pò ${PORT} ⚡`));
