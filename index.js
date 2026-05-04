const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(__dirname));

let chanmPrive = {}; 
let keuPublik = [];

io.on('connection', (socket) => {
    // LOGIN
    socket.on('login', (data) => {
        socket.emit('login-success', { phone: data.phone, balance: "250" });
    });

    // MATCHMAKING PIBLIK
    socket.on('join-matchmaking', (data) => {
        const nivo = data?.nivo || 0;
        const adversaireIndex = keuPublik.findIndex(j => Math.abs(j.nivo - nivo) <= 5);

        if (adversaireIndex !== -1) {
            const adversaire = keuPublik.splice(adversaireIndex, 1)[0];
            const roomName = `match_${socket.id}_${adversaire.socket.id}`;
            socket.join(roomName);
            adversaire.socket.join(roomName);
            chanmPrive[roomName] = { players: [socket.id, adversaire.socket.id], board: Array(225).fill(null), turn: socket.id };
            io.to(roomName).emit('match-found', { room: roomName, startTurn: socket.id });
        } else {
            keuPublik.push({ socket, nivo });
        }
    });

    // KREYE MATCH PRIVE
    socket.on('create-room', (data) => {
        const kod = Math.random().toString(36).substring(2, 7).toUpperCase();
        socket.join(kod);
        chanmPrive[kod] = { players: [socket.id], bet: data.bet, board: Array(225).fill(null), turn: socket.id };
        socket.emit('room-created', kod);
    });

    // ANTRE NAN MATCH PRIVE
    socket.on('join-room', (kod) => {
        const r = chanmPrive[kod];
        if (r && r.players.length === 1) {
            socket.join(kod);
            r.players.push(socket.id);
            io.to(kod).emit('match-found', { room: kod, bet: r.bet, startTurn: r.turn });
        } else {
            socket.emit('error-msg', 'Kòd invalid!');
        }
    });

    // JERE MOUVMAN (15x15)
    socket.on('make-move', (data) => {
        const r = chanmPrive[data.room];
        if (r && r.turn === socket.id && r.board[data.index] === null) {
            r.board[data.index] = socket.id;
            const symbol = (socket.id === r.players[0]) ? 'X' : 'O';
            r.turn = r.players.find(id => id !== socket.id);
            io.to(data.room).emit('update-board', { index: data.index, symbol, nextTurn: r.turn });

            if (checkWin(r.board, data.index, socket.id)) {
                io.to(data.room).emit('game-over', { winner: socket.id });
                delete chanmPrive[data.room];
            }
        }
    });

    socket.on('disconnect', () => {
        keuPublik = keuPublik.filter(j => j.socket.id !== socket.id);
    });
});

function checkWin(board, index, player) {
    const size = 15;
    const r = Math.floor(index / size), c = index % size;
    const dirs = [[0,1], [1,0], [1,1], [1,-1]];
    for (let [dr, dc] of dirs) {
        let count = 1;
        for (let i=1; i<5; i++) {
            let nr=r+dr*i, nc=c+dc*i;
            if (nr>=0 && nr<15 && nc>=0 && nc<15 && board[nr*size+nc]===player) count++; else break;
        }
        for (let i=1; i<5; i++) {
            let nr=r-dr*i, nc=c-dc*i;
            if (nr>=0 && nr<15 && nc>=0 && nc<15 && board[nr*size+nc]===player) count++; else break;
        }
        if (count >= 5) return true;
    }
    return false;
}

server.listen(3000, () => console.log('Sèvè BLITZ ⚡ sou 3000'));
