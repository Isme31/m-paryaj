const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Sèvi fichye yo nan menm katab la
app.use(express.static(__dirname));

// Voye index.html lè yon moun antre sou paj la
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

let chanmPrive = {};

io.on('connection', (socket) => {
    console.log(`Itilizatè konekte: ${socket.id}`);

    // LOGIN
    socket.on('login', (data) => {
        socket.emit('login-success', { phone: data.phone, balance: "250" });
    });

    // KREYE MATCH
    socket.on('create-room', (data) => {
        const kod = Math.random().toString(36).substring(2, 7).toUpperCase();
        socket.join(kod);
        chanmPrive[kod] = {
            players: [socket.id],
            bet: data.bet,
            board: Array(225).fill(null), // 15x15 = 225
            turn: socket.id
        };
        socket.emit('room-created', kod);
    });

    // ANTRE NAN MATCH
    socket.on('join-room', (kod) => {
        const r = chanmPrive[kod];
        if (r && r.players.length === 1) {
            socket.join(kod);
            r.players.push(socket.id);
            io.to(kod).emit('match-found', { room: kod, bet: r.bet, startTurn: r.turn });
        } else {
            socket.emit('error-msg', 'Kòd invalid oswa chanm plen!');
        }
    });

    // JERE MOUVMAN
    socket.on('make-move', (data) => {
        const r = chanmPrive[data.room];
        if (r && r.turn === socket.id && r.board[data.index] === null) {
            r.board[data.index] = socket.id;
            const symbol = (socket.id === r.players[0]) ? 'X' : 'O';
            r.turn = r.players.find(id => id !== socket.id);

            io.to(data.room).emit('update-board', {
                index: data.index,
                symbol: symbol,
                nextTurn: r.turn
            });

            if (checkWin(r.board, data.index, socket.id)) {
                io.to(data.room).emit('game-over', { winner: socket.id });
                delete chanmPrive[data.room];
            }
        }
    });

    socket.on('disconnect', () => {
        for (let k in chanmPrive) {
            if (chanmPrive[k].players.includes(socket.id)) {
                io.to(k).emit('player-left');
                delete chanmPrive[k];
            }
        }
    });
});

// Lojik pou verifye si gen 5 nan liy
function checkWin(board, index, player) {
    const size = 15;
    const r = Math.floor(index / size);
    const c = index % size;
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]]; // H, V, D1, D2

    for (let [dr, dc] of directions) {
        let count = 1;
        for (let i = 1; i < 5; i++) {
            let nr = r + dr * i, nc = c + dc * i;
            if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr * size + nc] === player) count++;
            else break;
        }
        for (let i = 1; i < 5; i++) {
            let nr = r - dr * i, nc = c - dc * i;
            if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr * size + nc] === player) count++;
            else break;
        }
        if (count >= 5) return true;
    }
    return false;
}

server.listen(3000, () => console.log('BLITZ ⚡ aktive sou pòt 3000'));
