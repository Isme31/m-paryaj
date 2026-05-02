const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const ADMIN_SECRET = "MOPYON2024"; // Chanje sa nan prodiksyon
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- DB CONNECTION ---
mongoose.connect("mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/mopyon_db").then(() => console.log("MongoDB Konekte ✅"));

// --- MODELS ---
const User = mongoose.model('User', new mongoose.Schema({
    phone: { type: String, unique: true, required: true, index: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 0 } // Mete l 0 pou evite moun kreye mil kont
}));

const Withdraw = mongoose.model('Withdraw', new mongoose.Schema({
    phone: String, amount: Number, status: { type: String, default: 'Pending' }, date: { type: Date, default: Date.now }
}));

// --- GAME LOGIC GLOBALS ---
let waitingPlayers = [];
let activeGames = {};

// Fonksyon pou verifye si yon moun fè 5 mopyon (Sèvè a k tcheke sa kounye a)
function checkWinner(board) {
    const size = 15;
    for (let i = 0; i < board.length; i++) {
        if (!board[i]) continue;
        const s = board[i];
        const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
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
    socket.on('findMatch', async (data) => {
        const bet = Number(data.bet);
        if (bet < 50) return;

        // SEKIRITE: Retire kòb la sèlman si balans lan ase (Atomic Update)
        const user = await User.findOneAndUpdate(
            { phone: data.phone, balance: { $gte: bet } },
            { $inc: { balance: -bet } },
            { new: true }
        );

        if (!user) return socket.emit('gameOver', { msg: "Balans pa ase!" });

        let oppIdx = waitingPlayers.findIndex(p => p.bet === bet && p.phone !== data.phone);
        
        if (oppIdx > -1) {
            const opponent = waitingPlayers.splice(oppIdx, 1)[0];
            const room = `room_${Date.now()}`;
            
            socket.join(room);
            const oppSocket = io.sockets.sockets.get(opponent.socketId);
            if (oppSocket) oppSocket.join(room);

            const prize = (bet * 2) * 0.9; // 10% frè
            activeGames[room] = {
                prize,
                board: Array(225).fill(null),
                players: { [socket.id]: data.phone, [opponent.socketId]: opponent.phone },
                turn: socket.id
            };

            io.to(room).emit('gameStart', { room, prize, firstTurn: data.phone });
        } else {
            waitingPlayers.push({ phone: data.phone, bet, socketId: socket.id });
        }
    });

    socket.on('move', async (data) => {
        const game = activeGames[data.room];
        if (!game || game.turn !== socket.id || game.board[data.index] !== null) return;

        const symbol = game.players[socket.id] === Object.values(game.players)[0] ? 'X' : 'O';
        game.board[data.index] = symbol;
        
        // Chanje souse moun k ap jwe a
        const playerIds = Object.keys(game.players);
        game.turn = playerIds.find(id => id !== socket.id);

        io.to(data.room).emit('opponentMove', data);

        // VERIFIKASYON VIKTWA SOU SÈVÈ A (Piratage enposib isit la)
        const winnerSymbol = checkWinner(game.board);
        if (winnerSymbol) {
            const winnerPhone = game.players[socket.id];
            const finalWinner = await User.findOneAndUpdate({ phone: winnerPhone }, { $inc: { balance: game.prize } }, { new: true });
            io.to(data.room).emit('gameOver', { winner: winnerPhone, newBalance: finalWinner.balance });
            delete activeGames[data.room];
        }
    });

    socket.on('disconnect', () => {
        // Si yon moun dekonekte, li pèdi kòb li te mize a.
        waitingPlayers = waitingPlayers.filter(p => p.socketId !== socket.id);
    });
});

server.listen(PORT, () => console.log(`🚀 Sèvè Sekirize sou pòt ${PORT}`));
