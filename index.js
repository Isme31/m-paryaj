const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static(__dirname));

const gameRooms = {};

app.post('/login', (req, res) => {
    const { phone, password, ref } = req.body;
    res.json({ success: true, phone: phone, balance: 500 });
});

io.on('connection', (socket) => {
    socket.on('createPrivate', (data) => {
        const code = Math.random().toString(36).substring(2, 6).toUpperCase();
        gameRooms[code] = { players: [data.phone], bet: data.bet, game: data.game, timer: 30 };
        socket.join(code);
        socket.emit('roomCreated', { code });
    });

    socket.on('joinPrivate', (data) => {
        const room = gameRooms[data.code];
        if (room && room.players.length < 2) {
            room.players.push(data.phone);
            socket.join(data.code);
            let startData = { room: data.code, game: room.game, firstTurn: room.players };
            if(room.game === 'domino') {
                startData.hand1 = Array.from({length:7}, () => [Math.floor(Math.random()*7), Math.floor(Math.random()*7)]);
                startData.hand2 = Array.from({length:7}, () => [Math.floor(Math.random()*7), Math.floor(Math.random()*7)]);
            }
            io.to(data.code).emit('gameStart', startData);
            startTimer(data.code);
        }
    });

    socket.on('move', (data) => {
        if (gameRooms[data.room]) {
            gameRooms[data.room].timer = 30;
            socket.to(data.room).emit('opponentMove', data);
        }
    });

    socket.on('win', (data) => {
        if (gameRooms[data.room]) {
            clearInterval(gameRooms[data.room].itv);
            io.to(data.room).emit('gameOver', { winner: data.phone });
            delete gameRooms[data.room];
        }
    });
});

function startTimer(code) {
    gameRooms[code].itv = setInterval(() => {
        if (gameRooms[code]) {
            gameRooms[code].timer--;
            io.to(code).emit('timerUpdate', { time: gameRooms[code].timer });
            if (gameRooms[code].timer <= 0) {
                clearInterval(gameRooms[code].itv);
                io.to(code).emit('errorMsg', "Tan fini!");
                delete gameRooms[code];
            }
        }
    }, 1000);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Aktif sou ${PORT}`));
