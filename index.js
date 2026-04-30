const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const adapter = new FileSync('db.json');
const db = low(adapter);

// Inisyalize DB ak balans pa defo
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
        // Kado 100 goud pou nouvo moun
        user = { phone, password, balance: 100 };
        db.get('users').push(user).write();
        return res.json({ success: true, balance: user.balance });
    } else {
        if (user.password === password) {
            return res.json({ success: true, balance: user.balance });
        } else {
            return res.json({ success: false, message: "Modpas pa bon!" });
        }
    }
});

// Route pou tcheke si moun nan ka mize
app.post('/bet', (req, res) => {
    const { phone } = req.body;
    let user = db.get('users').find({ phone }).value();
    
    if (user.balance >= 50) {
        const newBalance = user.balance - 50;
        db.get('users').find({ phone }).assign({ balance: newBalance }).write();
        return res.json({ success: true, newBalance });
    } else {
        return res.json({ success: false, message: "Ou pa gen ase kòb (50G min)" });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'index.html'));
});

let winnerOfLastRound = 'X';

io.on('connection', (socket) => {
    socket.emit('start-player', winnerOfLastRound);
    socket.on('mouvman', (data) => socket.broadcast.emit('mouvman', data));
    socket.on('game-over', (winner) => {
        winnerOfLastRound = winner;
        io.emit('reset', winnerOfLastRound);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sèvè ap kouri sou ${PORT}`));
