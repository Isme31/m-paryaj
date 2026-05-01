const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

mongoose.connect("mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/blitz_db?retryWrites=true&w=majority");

const User = mongoose.model('User', { phone: String, password: String, balance: { type: Number, default: 0 } });
const Deposit = mongoose.model('Deposit', { phone: String, amount: Number, transactionId: String, method: String, status: { type: String, default: 'pending' } });

app.use(express.json());
app.use(express.static(__dirname));

let waitingPlayers = []; 
let gameTimers = {};

function startTurnTimer(room, activePhone, prize) {
    if (gameTimers[room]) clearTimeout(gameTimers[room]);
    gameTimers[room] = setTimeout(async () => {
        io.to(room).emit('timeout', { loser: activePhone });
        const players = room.replace('room_', '').split('_');
        const winnerPhone = players.find(p => p !== activePhone);
        if (winnerPhone) await User.findOneAndUpdate({ phone: winnerPhone }, { $inc: { balance: prize } });
        delete gameTimers[room];
    }, 32000);
}

app.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    let user = await User.findOne({ phone });
    if (!user) { user = new User({ phone, password }); await user.save(); }
    if (user.password === password) res.json({ success: true, balance: user.balance, phone: user.phone });
    else res.json({ success: false, message: "Modpas pa bon!" });
});

app.post('/submit-deposit', async (req, res) => {
    await new Deposit(req.body).save();
    res.json({ success: true });
});

app.post('/admin/confirm-deposit', async (req, res) => {
    const { key, id } = req.body;
    if (key !== "hugues") return res.status(403).json({ success: false });
    const dep = await Deposit.findById(id);
    if (dep && dep.status === 'pending') {
        const user = await User.findOneAndUpdate({ phone: dep.phone }, { $inc: { balance: dep.amount } }, { new: true });
        dep.status = 'confirmed'; await dep.save();
        io.emit('balanceUpdate', { phone: dep.phone, newBalance: user.balance });
        res.json({ success: true });
    }
});

io.on('connection', (socket) => {
    socket.on('findMatch', async (data) => {
        const { phone, bet } = data;
        const user = await User.findOne({ phone });
        if (!user || user.balance < bet) return socket.emit('error_msg', "Balans ou twò ba pou miz sa!");

        const opponentIndex = waitingPlayers.findIndex(p => p.bet === bet && p.phone !== phone);

        if (opponentIndex !== -1) {
            const opponent = waitingPlayers[opponentIndex];
            waitingPlayers.splice(opponentIndex, 1);
            const room = `room_${opponent.phone}_${phone}`;
            const prize = bet * 1.8; 

            socket.join(room); opponent.socket.join(room);
            await User.updateMany({ phone: { $in: [phone, opponent.phone] } }, { $inc: { balance: -bet } });
            
            io.to(room).emit('gameStart', { room, players: [opponent.phone, phone], firstTurn: opponent.phone, prize });
            startTurnTimer(room, opponent.phone, prize);
        } else {
            waitingPlayers.push({ phone, bet, socket });
            socket.emit('status_update', `🔍 Chèche match (${bet}G)...`);
        }
    });

    socket.on('move', (data) => {
        socket.to(data.room).emit('opponentMove', data);
        startTurnTimer(data.room, data.nextPlayer, data.prize);
    });

    socket.on('win', async (data) => {
        if (gameTimers[data.room]) clearTimeout(gameTimers[data.room]);
        await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: data.prize } });
        io.to(data.room).emit('gameOver', { winner: data.phone });
        delete gameTimers[data.room];
    });

    socket.on('disconnect', () => {
        waitingPlayers = waitingPlayers.filter(p => p.socket.id !== socket.id);
    });
});

server.listen(process.env.PORT || 10000);
