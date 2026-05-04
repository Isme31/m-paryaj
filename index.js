const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;

// 1. KONEKSYON MONGODB (Ranplase lyen sa a ak pa w la)
const MONGO_URI = "lyen_mongodb_ou_isit_la"; 

mongoose.connect(MONGO_URI)
    .then(() => console.log("Konekte ak MongoDB! ✅"))
    .catch(err => console.error("Erè MongoDB:", err));

// 2. SCHEMA ITILIZATÈ
const UserSchema = new mongoose.Schema({
    phone: { type: String, unique: true, required: true },
    balance: { type: Number, default: 250 },
    history: Array
});
const User = mongoose.model('User', UserSchema);

app.use(express.static(path.join(__dirname, 'public')));

let chanmPrive = {};
let keuPublik = [];

// ROUTES
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

io.on('connection', (socket) => {

    // LOGIN
    socket.on('login', async (data) => {
        try {
            let user = await User.findOne({ phone: data.phone });
            if (!user) {
                user = new User({ phone: data.phone });
                await user.save();
            }
            socket.phone = user.phone;
            socket.emit('login-success', { phone: user.phone, bal: user.balance });
        } catch (e) { socket.emit('error-msg', 'Erè koneksyon baz de done'); }
    });

    // MATCHMAKING PIBLIK
    socket.on('join-matchmaking', async () => {
        const user = await User.findOne({ phone: socket.phone });
        if (!user || user.balance < 50) return socket.emit('error-msg', 'Balans twò piti (50 HTG min)');

        keuPublik = keuPublik.filter(j => j.socket.id !== socket.id);
        const adversaire = keuPublik.shift();

        if (adversaire) {
            const roomName = `blitz_${socket.id}_${adversaire.socket.id}`;
            socket.join(roomName);
            adversaire.socket.join(roomName);
            chanmPrive[roomName] = { 
                players: [socket.id, adversaire.socket.id], 
                phones: [socket.phone, adversaire.phone],
                board: Array(225).fill(null), 
                turn: socket.id, 
                bet: 50 
            };
            io.to(roomName).emit('match-found', { room: roomName, startTurn: socket.id });
        } else {
            keuPublik.push({ socket, phone: socket.phone });
        }
    });

    // KREYE MATCH PRIVE
    socket.on('create-room', (data) => {
        const kod = Math.random().toString(36).substring(2, 7).toUpperCase();
        socket.join(kod);
        chanmPrive[kod] = { 
            players: [socket.id], 
            phones: [socket.phone], 
            bet: data.bet, 
            board: Array(225).fill(null), 
            turn: socket.id 
        };
        socket.emit('room-created', kod);
    });

    // ANTRE NAN MATCH PRIVE
    socket.on('join-room', (kod) => {
        const r = chanmPrive[kod];
        if (r && r.players.length === 1) {
            socket.join(kod);
            r.players.push(socket.id);
            r.phones.push(socket.phone);
            io.to(kod).emit('match-found', { room: kod, bet: r.bet, startTurn: r.turn });
        } else {
            socket.emit('error-msg', 'Kòd invalid!');
        }
    });

    // JERE MOUVMAN
    socket.on('make-move', async (data) => {
        const r = chanmPrive[data.room];
        if (r && r.turn === socket.id && r.board[data.index] === null) {
            r.board[data.index] = socket.id;
            const symbol = (socket.id === r.players[0]) ? 'X' : 'O';
            r.turn = r.players.find(id => id !== socket.id);
            io.to(data.room).emit('update-board', { index: data.index, symbol, nextTurn: r.turn });

            if (checkWin(r.board, data.index, socket.id)) {
                io.to(data.room).emit('game-over', { winner: socket.id });
                
                // PEYE WINNER LA NAN MONGODB
                const winnerPhone = socket.phone;
                const loserPhone = r.phones.find(p => p !== winnerPhone);
                const betAmount = parseInt(r.bet);

                await User.findOneAndUpdate({ phone: winnerPhone }, { $inc: { balance: betAmount } });
                await User.findOneAndUpdate({ phone: loserPhone }, { $inc: { balance: -betAmount } });

                delete chanmPrive[data.room];
            }
        }
    });

    // ADMIN OPSYON
    socket.on('get-all-users', async () => {
        const allUsers = await User.find({});
        socket.emit('admin-users-list', allUsers);
    });

    socket.on('update-balance', async (data) => {
        await User.findOneAndUpdate({ phone: data.phone }, { balance: data.newBal });
        const allUsers = await User.find({});
        socket.emit('admin-users-list', allUsers);
        io.emit('balance-updated', { phone: data.phone, newBal: data.newBal });
    });

    socket.on('disconnect', () => {
        keuPublik = keuPublik.filter(j => j.socket.id !== socket.id);
    });
});

function checkWin(board, index, player) {
    const size = 15;
    const r = Math.floor(index / size), c = index % size;
    const dirs = [[0,1], [1,0], [1,1], [1,-1]];
    for (let [dr, dc] of dirs) {
        let count = 1;
        for (let i=1; i<5; i++) {
            let nr=r+dr*i, nc=c+dc*i;
            if (nr>=0 && nr<15 && nc>=0 && nc<15 && board[nr*size+nc]===player) count++; else break;
        }
        for (let i=1; i<5; i++) {
            let nr=r-dr*i, nc=c-dc*i;
            if (nr>=0 && nr<15 && nc>=0 && nc<15 && board[nr*size+nc]===player) count++; else break;
        }
        if (count >= 5) return true;
    }
    return false;
}

server.listen(PORT, () => console.log(`BLITZ ⚡ aktive sou pò ${PORT}`));
