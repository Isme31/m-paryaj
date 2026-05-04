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

mongoose.connect(MONGO_URI)
    .then(() => console.log("Mopyon Blitz Estab ✅"))
    .catch(err => console.error("Erè MongoDB: ", err));

const User = mongoose.model('User', new mongoose.Schema({
    phone: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 0 }, 
    referralCount: { type: Number, default: 0 }
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/login', async (req, res) => {
    try {
        const { phone, password, ref } = req.body;
        if (!phone || !password) return res.json({ success: false, msg: "Ranpli tout bwat yo!" });
        const cleanPhone = phone.trim().replace(/\s+/g, '');
        if (!/^[3-5][0-9]{7}$/.test(cleanPhone)) return res.json({ success: false, msg: "Nimewo 8 chif sèlman!" });

        let user = await User.findOne({ phone: cleanPhone });
        if (!user) {
            if (ref && ref !== cleanPhone) {
                await User.findOneAndUpdate({ phone: ref }, { $inc: { referralCount: 1 } }).catch(e => console.log("Ref Error"));
            }
            user = new User({ phone: cleanPhone, password: password, balance: 0 });
            await user.save();
            return res.json({ success: true, user, msg: "Byenveni!" });
        }
        if (user.password !== password) return res.json({ success: false, msg: "Modpas pa bon!" });
        return res.json({ success: true, user });
    } catch (e) { res.json({ success: false, msg: "Erè sèvè" }); }
});

let rooms = {};
let waitingPlayers = {}; 

io.on('connection', (socket) => {
    // MATCHMAKING AUTO
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
            const prize = (bet * 2) * 0.95;
            io.to(code).emit('gameStart', { room: code, prize, turn: opponent.phone, bet });
        } else {
            waitingPlayers[bet] = { id: socket.id, phone: data.phone };
        }
    });

    socket.on('cancelMatchmaking', (bet) => {
        if (waitingPlayers[bet] && waitingPlayers[bet].id === socket.id) delete waitingPlayers[bet];
    });

    // KREYE KÒD MATCH (PRIVÉ)
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
            const prize = (room.bet * 2) * 0.95;
            io.to(data.code).emit('gameStart', { room: data.code, prize, turn: room.host, bet: room.bet });
        } else socket.emit('errorMsg', "Kòd pa bon oswa balans piti!");
    });

    socket.on('move', (data) => socket.to(data.room).emit('opponentMove', data));

    socket.on('win', async (data) => {
        if (!rooms[data.room]) return;
        const prize = Number(data.prize);
        delete rooms[data.room];
        const winner = await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: prize } }, { new: true });
        io.to(data.room).emit('gameOver', { winner: data.phone, prize, winnerBalance: winner.balance });
    });

    socket.on('disconnect', () => {
        for (let bet in waitingPlayers) {
            if (waitingPlayers[bet].id === socket.id) delete waitingPlayers[bet];
        }
    });
});

server.listen(PORT, "0.0.0.0", () => console.log(`Sèvè Blitz kouri sou ${PORT} ⚡`));
