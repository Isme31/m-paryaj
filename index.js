const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

// Konfigirasyon baz de done (lowdb)
const adapter = new FileSync('db.json');
const db = low(adapter);
db.defaults({ users: [] }).write();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(__dirname));

// --- ROUTES API ---

// Login: Kreye kont si li pa egziste oswa tcheke modpas
app.post('/login', (req, res) => {
    const { phone, password } = req.body;
    let user = db.get('users').find({ phone }).value();
    
    if (!user) {
        user = { phone, password, balance: 100 }; // Kado 100G pou nouvo moun
        db.get('users').push(user).write();
    }
    
    if (user.password === password) {
        res.json({ success: true, balance: user.balance });
    } else {
        res.json({ success: false, message: "Modpas la pa bon!" });
    }
});

// Bet: Retire 50G nan balan jwè a
app.post('/bet', (req, res) => {
    const { phone } = req.body;
    let user = db.get('users').find({ phone }).value();
    
    if (user && user.balance >= 50) {
        const newBalance = user.balance - 50;
        db.get('users').find({ phone }).assign({ balance: newBalance }).write();
        res.json({ success: true, newBalance });
    } else {
        res.json({ success: false, message: "Ou pa gen ase kòb (50G)" });
    }
});

// --- LOGIK JWÈT (SOCKET.IO) ---

io.on('connection', (socket) => {
    
    socket.on('join-room', (data) => {
        const { roomCode, phone } = data;
        
        socket.join(roomCode);
        socket.myRoom = roomCode;
        socket.phone = phone; // Sere nimewo a pou lè moun nan genyen
        
        const clients = io.sockets.adapter.rooms.get(roomCode);
        const numClients = clients ? clients.size : 0;
        
        // Premye moun ki antre se X, dezyèm nan se O
        const role = numClients === 1 ? 'X' : 'O';
        socket.emit('player-role', role);
        
        // Si gen 2 moun, jwèt la kòmanse ak X
        if (numClients === 2) {
            io.to(roomCode).emit('start-game', 'X');
        }
    });

    socket.on('mouvman', (data) => {
        // Voye mouvman an bay lòt moun ki nan chanm nan
        socket.to(data.room).emit('mouvman', data);
    });

    socket.on('game-over', (data) => {
        const { room, winner, winnerPhone } = data;
        
        // Si gen yon gayan, ba li 100G (parye 2 moun yo)
        if (winnerPhone) {
            let user = db.get('users').find({ phone: winnerPhone }).value();
            if (user) {
                const updatedBalance = user.balance + 100;
                db.get('users').find({ phone: winnerPhone }).assign({ balance: updatedBalance }).write();
                
                // Mete balans lan ajou sou ekran jwè a
                io.to(room).emit('update-balance', { phone: winnerPhone, balance: updatedBalance });
            }
        }
        
        // Di tout moun nan chanm nan jwèt la fini
        io.to(room).emit('reset', winner);
    });

    socket.on('disconnect', () => {
        if (socket.myRoom) {
            socket.to(socket.myRoom).emit('player-left');
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sèvè a limen sou: http://localhost:${PORT}`);
});
