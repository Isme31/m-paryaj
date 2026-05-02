const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { transports: ['websocket'], cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;

mongoose.connect("mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/mopyon_db?retryWrites=true&w=majority")
    .then(() => console.log("Mopyon DB Konekte ✅"));

const User = mongoose.model('User', new mongoose.Schema({
    phone: { type: String, unique: true },
    password: { type: String },
    balance: { type: Number, default: 50 }
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    let user = await User.findOne({ phone: phone.trim() });
    if (!user) {
        user = await User.create({ phone: phone.trim(), password, balance: 50 });
    } else if (user.password !== password) return res.json({ success: false, msg: "Modpas pa bon" });
    res.json({ success: true, user });
});

let rooms = {};

io.on('connection', (socket) => {
    socket.on('createRoom', async (data) => {
        const user = await User.findOne({ phone: data.phone });
        const bet = Number(data.bet);
        if (!user || user.balance < bet) return socket.emit('errorMsg', "Balans ou piti!");
        
        const code = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[code] = { host: data.phone, bet, players: [socket.id], phones: [data.phone] };
        
        socket.join(code);
        socket.emit('roomCreated', { code, bet });

        // TIMER POU KÒD LA: Si apre 2 minit match la pa kòmanse, nou efase chanm nan
        setTimeout(() => {
            if (rooms[code] && rooms[code].players.length < 2) {
                delete rooms[code];
                socket.emit('errorMsg', "Tan an fini, kòd la ekspire!");
            }
        }, 120000); 
    });

    socket.on('joinRoom', async (data) => {
        const room = rooms[data.code];
        const user = await User.findOne({ phone: data.phone });
        if (room && user && user.balance >= room.bet && room.players.length < 2) {
            socket.join(data.code);
            room.players.push(socket.id);
            room.phones.push(data.phone);
            
            await User.updateMany({ phone: { $in: room.phones } }, { $inc: { balance: -room.bet } });
            const prize = (room.bet * 2) * 0.95;
            io.to(data.code).emit('gameStart', { room: data.code, prize, turn: room.host });
        } else {
            socket.emit('errorMsg', "Kòd pa bon oswa chanm plen!");
        }
    });

    socket.on('move', (data) => socket.to(data.room).emit('opponentMove', data));

    socket.on('win', async (data) => {
        const user = await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: Number(data.prize) } }, { new: true });
        io.to(data.room).emit('gameOver', { winner: data.phone, prize: data.prize, newBalance: user.balance });
        delete rooms[data.room];
    });
});

server.listen(PORT, () => console.log(`Sèvè kouri sou ${PORT}`));
