const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const ADMIN_SECRET = "MOPYON2024";
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- DATABASE ---
const mongoURI = "mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/mopyon_db?retryWrites=true&w=majority";
mongoose.connect(mongoURI).then(() => console.log("MongoDB Konekte ✅"));

const User = mongoose.model('User', new mongoose.Schema({
    phone: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 50 },
    referralCount: { type: Number, default: 0 },
    referredBy: { type: String, default: null }
}));

// --- LOJIK DOMINO ---
function shuffleDominoes() {
    let deck = [];
    for (let i = 0; i <= 6; i++) {
        for (let j = i; j <= 6; j++) deck.push({ a: i, b: j });
    }
    return deck.sort(() => Math.random() - 0.5);
}

function canMove(hand, ends) {
    if (ends[0] === null) return true;
    return hand.some(t => t.a === ends[0] || t.b === ends[0] || t.a === ends[1] || t.b === ends[1]);
}

// --- ROUTES ---
app.post('/login', async (req, res) => {
    const { phone, password, ref } = req.body;
    let user = await User.findOne({ phone: phone.trim() });
    if (!user) {
        user = await User.create({ phone: phone.trim(), password, balance: 50, referredBy: ref });
    }
    res.json({ success: true, phone: user.phone, balance: user.balance });
});

// --- SOCKET LOGIC ---
let privateRooms = {};
let activeGames = {};

io.on('connection', (socket) => {
    socket.on('createPrivate', async (data) => {
        const code = Math.floor(1000 + Math.random() * 9000).toString();
        privateRooms[code] = { host: data.phone, bet: Number(data.bet), game: data.game };
        socket.join(code);
        socket.emit('roomCreated', { code });
    });

    socket.on('joinPrivate', async (data) => {
        const room = privateRooms[data.code];
        const user = await User.findOne({ phone: data.phone });
        if (room && user && user.balance >= room.bet) {
            await User.updateOne({ phone: room.host }, { $inc: { balance: -room.bet } });
            await User.updateOne({ phone: data.phone }, { $inc: { balance: -room.bet } });

            const prize = (room.bet * 2) * 0.95;
            let gameData = { prize, players: [room.host, data.phone], game: room.game, board: [], ends: [null, null] };

            if (room.game === 'domino') {
                const deck = shuffleDominoes();
                const h1 = deck.splice(0, 7);
                const h2 = deck.splice(0, 7);
                let starter = room.host;
                let maxD = -1;
                [{p:room.host, h:h1}, {p:data.phone, h:h2}].forEach(o => {
                    o.h.forEach(t => { if(t.a === t.b && t.a > maxD) { maxD = t.a; starter = o.p; } });
                });
                gameData.hands = { [room.host]: h1, [data.phone]: h2 };
                gameData.turn = starter;
                socket.join(data.code);
                io.to(data.code).emit('gameStart', { room: data.code, prize, game: 'domino', turn: starter });
                io.to(data.code).emit('receiveHand', { hands: gameData.hands });
            } else {
                socket.join(data.code);
                io.to(data.code).emit('gameStart', { room: data.code, prize, game: 'mopyon', turn: room.host });
            }
            activeGames[data.code] = gameData;
            delete privateRooms[data.code];
        }
    });

    socket.on('dominoMove', async (data) => {
        const g = activeGames[data.room];
        if (!g || g.turn !== data.phone) return;
        let t = data.tile;
        let played = false;

        if (g.board.length === 0) {
            g.board.push(t); g.ends = [t.a, t.b]; played = true;
        } else {
            if (t.a === g.ends[0] || t.b === g.ends[0]) {
                g.ends[0] = (t.a === g.ends[0]) ? t.b : t.a;
                g.board.unshift(t); played = true;
            } else if (t.a === g.ends[1] || t.b === g.ends[1]) {
                g.ends[1] = (t.a === g.ends[1]) ? t.b : t.a;
                g.board.push(t); played = true;
            }
        }

        if (played) {
            g.hands[data.phone].splice(data.index, 1);
            if (g.hands[data.phone].length === 0) {
                const winner = await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: g.prize } }, { new: true });
                io.to(data.room).emit('gameOver', { winner: data.phone, prize: g.prize.toFixed(2), newBalance: winner.balance });
                return delete activeGames[data.room];
            }
            let nextP = g.players.find(p => p !== data.phone);
            if (!canMove(g.hands[nextP], g.ends)) {
                if (!canMove(g.hands[data.phone], g.ends)) {
                    io.to(data.room).emit('errorMsg', "Jwèt la bloke! (Match Nul)");
                } else {
                    io.to(data.room).emit('playerSkipped', { skipped: nextP, next: data.phone });
                    g.turn = data.phone;
                }
            } else { g.turn = nextP; }
            io.to(data.room).emit('updateBoard', { board: g.board, turn: g.turn });
        }
    });
});

server.listen(PORT, () => console.log(`Sèvè kouri sou ${PORT}`));
