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
const dbURI = "mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/mopyonDB?retryWrites=true&w=majority&appName=hugues";
mongoose.connect(dbURI).then(() => console.log("MongoDB Konekte ✅"));

// --- MODEL DONE ---
const User = mongoose.model('User', new mongoose.Schema({
    phone: { type: String, unique: true },
    password: String,
    balance: { type: Number, default: 100 }
}));

let waitingPlayers = []; 
let activeGames = {}; 

io.on('connection', (socket) => {
    
    socket.on('findMatch', async (data) => {
        try {
            const user = await User.findOne({ phone: data.phone });
            if (!user || user.balance < data.bet) return socket.emit('error_msg', 'Kòb ou pa ase!');

            await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: -data.bet } });
            socket.emit('balanceUpdate', { balance: user.balance - data.bet });

            let oppIdx = waitingPlayers.findIndex(p => p.bet === data.bet && p.phone !== data.phone);

            if (oppIdx > -1) {
                const opponent = waitingPlayers.splice(oppIdx, 1)[0];
                const room = `room_${Date.now()}`;
                const prize = (data.bet * 2) * 0.9;

                socket.join(room);
                const oppSocket = io.sockets.sockets.get(opponent.socketId);
                if (oppSocket) oppSocket.join(room);

                activeGames[room] = { players: [socket.id, opponent.socketId], prize, phones: [data.phone, opponent.phone] };

                io.to(room).emit('gameStart', {
                    room, prize,
                    firstTurn: Math.random() > 0.5 ? data.phone : opponent.phone
                });
            } else {
                waitingPlayers.push({ ...data, socketId: socket.id });
                socket.emit('waiting', 'Ap chache advèsè...');
            }
        } catch (e) { console.error(e); }
    });

    socket.on('move', (data) => { socket.to(data.room).emit('opponentMove', data); });

    socket.on('win', async (data) => {
        try {
            const game = activeGames[data.room];
            if (game) {
                const winner = await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: game.prize } }, { new: true });
                io.to(data.room).emit('gameOver', { winner: data.phone, newBalance: winner.balance, prize: game.prize });
                delete activeGames[data.room];
            }
        } catch (e) { console.error(e); }
    });

    socket.on('disconnect', () => {
        waitingPlayers = waitingPlayers.filter(p => p.socketId !== socket.id);
    });
});

server.listen(process.env.PORT || 3000, () => console.log(`Sèvè a Live 🚀`));
