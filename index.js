const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const adapter = new FileSync('db.json');
const db = low(adapter);
db.defaults({ users: [] }).write();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(__dirname));

app.post('/login', (req, res) => {
    const { phone, password } = req.body;
    let user = db.get('users').find({ phone }).value();
    if (!user) {
        user = { phone, password, balance: 100 };
        db.get('users').push(user).write();
    }
    if (user.password === password) res.json({ success: true, balance: user.balance });
    else res.json({ success: false, message: "Modpas pa bon!" });
});

app.post('/bet', (req, res) => {
    const { phone } = req.body;
    let user = db.get('users').find({ phone }).value();
    if (user.balance >= 50) {
        const newBalance = user.balance - 50;
        db.get('users').find({ phone }).assign({ balance: newBalance }).write();
        res.json({ success: true, newBalance });
    } else res.json({ success: false, message: "Ou pa gen ase kòb (50G)" });
});

io.on('connection', (socket) => {
    socket.on('join-room', (roomCode) => {
        socket.join(roomCode);
        const clients = io.sockets.adapter.rooms.get(roomCode);
        const numClients = clients ? clients.size : 0;
        
        // Premye moun ki antre se X, dezyèm nan se O
        const role = numClients === 1 ? 'X' : 'O';
        socket.emit('player-role', role);
        
        if (numClients === 2) {
            io.to(roomCode).emit('start-game', 'X');
        }
    });

    socket.on('mouvman', (data) => {
        socket.to(data.room).emit('mouvman', data);
    });

    socket.on('game-over', (data) => {
        io.to(data.room).emit('reset', data.winner);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sèvè ap kouri sou ${PORT}`));
