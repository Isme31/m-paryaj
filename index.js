const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Sèvi fichye yo (asire w index.html nan menm katab la)
app.use(express.static(__dirname));

// --- DATA ---
let chanmPrive = {}; 

io.on('connection', (socket) => {
    console.log(`Itilizatè konekte: ${socket.id}`);

    // 1. LOGIN
    socket.on('login', (data) => {
        // simulation yon koneksyon reyisi
        socket.emit('login-success', { 
            phone: data.phone, 
            balance: "250" 
        });
    });

    // 2. KREYE MATCH PRIVE (MOPYON)
    socket.on('create-room', (data) => {
        const kod = Math.random().toString(36).substring(2, 7).toUpperCase();
        socket.join(kod);
        
        chanmPrive[kod] = {
            players: [socket.id],
            bet: data.bet,
            board: Array(225).fill(null), // 15x15
            turn: socket.id,
            status: 'waiting'
        };

        socket.emit('room-created', kod);
    });

    // 3. ANTRE NAN MATCH
    socket.on('join-room', (kod) => {
        const r = chanmPrive[kod];
        
        if (r && r.players.length === 1) {
            socket.join(kod);
            r.players.push(socket.id);
            r.status = 'playing';

            // Notifye tou de jwè yo
            io.to(kod).emit('match-found', {
                room: kod,
                bet: r.bet,
                startTurn: r.turn
            });
        } else {
            socket.emit('error-msg', 'Kòd sa pa valid oswa match la plen');
        }
    });

    // 4. JERE MOUVMAN SOU TABLO A
    socket.on('make-move', (data) => {
        const r = chanmPrive[data.room];
        
        // Tcheke si se tou pa l epi kare a vid
        if (r && r.turn === socket.id && r.board[data.index] === null) {
            r.board[data.index] = socket.id;
            
            // Chwazi senbòl la (X pou kreyatè a, O pou dezyèm nan)
            const symbol = (socket.id === r.players[0]) ? 'X' : 'O';
            
            // Chanje tou a
            r.turn = r.players.find(id => id !== socket.id);

            // Voye mouvman an bay tout moun nan room nan
            io.to(data.room).emit('update-board', {
                index: data.index,
                symbol: symbol,
                nextTurn: r.turn
            });

            // Tcheke si jwè a genyen
            if (checkWin(r.board, data.index, socket.id)) {
                io.to(data.room).emit('game-over', { winner: socket.id });
                delete chanmPrive[data.room];
            }
        }
    });

    // 5. DEKONEKSYON
    socket.on('disconnect', () => {
        for (let kod in chanmPrive) {
            if (chanmPrive[kod].players.includes(socket.id)) {
                io.to(kod).emit('player-left');
                delete chanmPrive[kod];
            }
        }
    });
});

// LOJIK POU TCHEKE 5 NAN LIY (15x15)
function checkWin(board, index, player) {
    const size = 15;
    const r = Math.floor(index / size);
    const c = index % size;
    const directions = [[0,1], [1,0], [1,1], [1,-1]]; // orizontal, vètikal, dyagonal

    for (let [dr, dc] of directions) {
        let count = 1;
        // Tcheke yon bò
        for (let i = 1; i < 5; i++) {
            let nr = r + dr * i, nc = c + dc * i;
            if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr * size + nc] === player) count++;
            else break;
        }
        // Tcheke lòt bò a
        for (let i = 1; i < 5; i++) {
            let nr = r - dr * i, nc = c - dc * i;
            if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr * size + nc] === player) count++;
            else break;
        }
        if (count >= 5) return true;
    }
    return false;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`BLITZ ⚡ Sèvè ap kouri sou http://localhost:${PORT}`);
});
