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

// DB CONNECTION
mongoose.connect("mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/mopyon_db").then(() => console.log("MongoDB Konekte ✅"));

// MODELS
const User = mongoose.model('User', new mongoose.Schema({
    phone: { type: String, unique: true, required: true, index: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 0 }
}));

// GAME LOGIC
let publicRooms = [];
let activeGames = {};

function checkWinner(board) {
    const size = 15;
    const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (let i = 0; i < board.length; i++) {
        if (!board[i]) continue;
        const s = board[i];
        for (let [dx, dy] of directions) {
            let count = 1;
            for (let step = 1; step < 5; step++) {
                let x = (i % size) + dx * step;
                let y = Math.floor(i / size) + dy * step;
                if (x >= 0 && x < size && y >= 0 && y < size && board[y * size + x] === s) count++;
                else break;
            }
            if (count >= 5) return s;
        }
    }
    return null;
}

io.on('connection', (socket) => {
    socket.emit('updateRooms', publicRooms.filter(r => r.status === 'waiting'));

    socket.on('createRoom', async (data) => {
        const bet = Number(data.bet);
        if (bet < 50) return socket.emit('msg', "Miz minimòm se 50G");

        const user = await User.findOneAndUpdate(
            { phone: data.phone, balance: { $gte: bet } },
            { $inc: { balance: -bet } }, { new: true }
        );

        if (!user) return socket.emit('msg', "Balans pa ase!");

        const roomID = `room_${Math.random().toString(36).substr(2, 5)}`;
        socket.join(roomID);

        const newRoom = { id: roomID, creator: data.phone, bet: bet, status: 'waiting' };
        publicRooms.push(newRoom);
        
        activeGames[roomID] = { 
            prize: (bet * 2) * 0.9, 
            board: Array(225).fill(null), 
            players: { [socket.id]: data.phone },
            turn: null 
        };

        io.emit('updateRooms', publicRooms.filter(r => r.status === 'waiting'));
        socket.emit('roomCreated', roomID);
        socket.emit('balanceUpdate', { balance: user.balance });
    });

    socket.on('joinRoom', async (data) => {
        const room = publicRooms.find(r => r.id === data.roomID);
        if (!room || room.status !== 'waiting') return socket.emit('msg', "Chanm sa a pa disponib");

        const user = await User.findOneAndUpdate(
            { phone: data.phone, balance: { $gte: room.bet } },
            { $inc: { balance: -room.bet } }, { new: true }
        );

        if (!user) return socket.emit('msg', "Balans pa ase!");

        socket.join(data.roomID);
        room.status = 'playing';
        
        const game = activeGames[data.roomID];
        game.players[socket.id] = data.phone;
        const playerIds = Object.keys(game.players);
        game.turn = playerIds[0]; 

        io.emit('updateRooms', publicRooms.filter(r => r.status === 'waiting'));
        io.to(data.roomID).emit('gameStart', { 
            room: data.roomID, 
            prize: game.prize, 
            firstTurn: room.creator 
        });
        socket.emit('balanceUpdate', { balance: user.balance });
    });

    socket.on('move', async (data) => {
        const game = activeGames[data.room];
        if (!game || game.turn !== socket.id || game.board[data.index]) return;

        const symbol = game.players[socket.id] === Object.values(game.players)[0] ? 'X' : 'O';
        game.board[data.index] = symbol;
        game.turn = Object.keys(game.players).find(id => id !== socket.id);

        io.to(data.room).emit('opponentMove', { index: data.index, symbol });

        const winSym = checkWinner(game.board);
        if (winSym) {
            const winnerPhone = game.players[socket.id];
            const winner = await User.findOneAndUpdate({ phone: winnerPhone }, { $inc: { balance: game.prize } }, { new: true });
            io.to(data.room).emit('matchEnded', { winner: winnerPhone, prize: game.prize, newBalance: winner.balance });
            publicRooms = publicRooms.filter(r => r.id !== data.room);
            delete activeGames[data.room];
        }
    });

    socket.on('disconnect', () => {
        // Netwayaj si yon moun kite anvan match kòmanse
        const roomToClean = publicRooms.find(r => r.creatorSocket === socket.id && r.status === 'waiting');
        if(roomToClean) {
            publicRooms = publicRooms.filter(r => r.id !== roomToClean.id);
            io.emit('updateRooms', publicRooms.filter(r => r.status === 'waiting'));
        }
    });
});

app.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    let user = await User.findOne({ phone: phone.trim() });
    if (!user) user = await User.create({ phone: phone.trim(), password, balance: 0 });
    else if (user.password !== password) return res.json({ success: false, msg: "Modpas pa bon" });
    res.json({ success: true, phone: user.phone, balance: user.balance });
});

server.listen(PORT, () => console.log(`🚀 LIVE: ${PORT}`));
