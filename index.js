const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static(__dirname));

// Memwa pou jere chanm yo ak Timer
const gameRooms = {};

// --- 1. LOGIN, REFERANS, AK DONE JWÈ ---
app.post('/login', (req, res) => {
    const { phone, password, ref } = req.body;
    console.log(`Nouvo Login: ${phone} | Ref: ${ref || 'pèsonn'}`);
    
    // Isit la ou ka konekte baz de done w pou jere Depo/Retrè pita
    res.json({ 
        success: true, 
        phone: phone, 
        balance: 500, // Egzanp balans
        msg: "Koneksyon reyisi!"
    });
});

// Fonksyon pou jere Retrè (ou ka ajoute lojik la isit la)
app.post('/withdraw', (req, res) => {
    const { phone, amount } = req.body;
    console.log(`Demann retrè: ${amount}G pou ${phone}`);
    res.json({ success: true, msg: "Demann retrè w la voye bay Admin!" });
});

// --- 2. LOGIK JWÈT (MOPYON & DOMINO) ---
io.on('connection', (socket) => {
    console.log('Jwè konekte: ' + socket.id);

    // Kreyasyon Chanm Privé (Miz + Timer 30s)
    socket.on('createPrivate', (data) => {
        const code = Math.random().toString(36).substring(2, 6).toUpperCase();
        gameRooms[code] = {
            players: [data.phone],
            bet: data.bet,
            game: data.game,
            timer: 30, // TIMER 30 SEGOND
            status: 'waiting'
        };
        socket.join(code);
        socket.emit('roomCreated', { code: code });
        console.log(`Chanm ${code} kreyé | Jwèt: ${data.game} | Miz: ${data.bet}G`);
    });

    // Antre nan Match (Mete 2 moun ansanm)
    socket.on('joinPrivate', (data) => {
        const room = gameRooms[data.code];
        if (room && room.players.length < 2) {
            room.players.push(data.phone);
            room.status = 'playing';
            socket.join(data.code);

            let startData = {
                room: data.code,
                game: room.game,
                firstTurn: room.players[0], // Premye moun nan kòmanse
                bet: room.bet
            };

            // Lojik distribisyon kat Domino (7 kat chak)
            if(room.game === 'domino') {
                startData.hand1 = generateDominoHand();
                startData.hand2 = generateDominoHand();
            }

            io.to(data.code).emit('gameStart', startData);
            startRoomTimer(data.code);
        } else {
            socket.emit('errorMsg', 'Kòd sa a pa bon oswa match la plen!');
        }
    });

    // Mouvman Jwè yo (Mopyon/Domino)
    socket.on('move', (data) => {
        const room = gameRooms[data.room];
        if (room) {
            room.timer = 30; // RESET TIMER CHAK FWA YON MOUN JWE
            socket.to(data.room).emit('opponentMove', data);
        }
    });

    // Viktwa
    socket.on('win', (data) => {
        stopTimer(data.room);
        console.log(`Match fini! Gayan: ${data.phone}`);
        io.to(data.room).emit('gameOver', { winner: data.phone });
        delete gameRooms[data.room];
    });

    socket.on('disconnect', () => {
        console.log('Yon jwè dekonekte');
    });
});

// --- 3. JERE TIMER 30 SEGOND ---
function startRoomTimer(roomCode) {
    if (!gameRooms[roomCode]) return;
    
    gameRooms[roomCode].interval = setInterval(() => {
        if (gameRooms[roomCode]) {
            gameRooms[roomCode].timer--;
            io.to(roomCode).emit('timerUpdate', { time: gameRooms[roomCode].timer });

            if (gameRooms[roomCode].timer <= 0) {
                stopTimer(roomCode);
                io.to(roomCode).emit('errorMsg', 'Tan an fini! Match la anile.');
                delete gameRooms[roomCode];
            }
        }
    }, 1000);
}

function stopTimer(roomCode) {
    if (gameRooms[roomCode] && gameRooms[roomCode].interval) {
        clearInterval(gameRooms[roomCode].interval);
    }
}

// --- 4. JENERE KAT DOMINO ---
function generateDominoHand() {
    let hand = [];
    for(let i=0; i<7; i++) {
        hand.push([Math.floor(Math.random()*7), Math.floor(Math.random()*7)]);
    }
    return hand;
}

// --- 5. PORT POU RENDER (FIX) ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Mopyon Blitz ⚡ Sèvè a ap mache sou pò ${PORT}`);
});
