const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname + '/public')); // Sipoze HTML ou nan folder 'public'

// --- DATA JWÈT ---
let chanmPrive = {}; // Pou sere match ki kreye ak kòd

io.on('connection', (socket) => {
    console.log(`Nouvo koneksyon: ${socket.id}`);

    // 1. KREYE MATCH (Lè jwè a klike sou "KREYE KÒD MATCH")
    socket.on('create-room', (data) => {
        const kod = Math.random().toString(36).substring(2, 7).toUpperCase(); // Jenere kòd 5 lèt
        socket.join(kod);
        
        chanmPrive[kod] = {
            createur: socket.id,
            bet: data.bet,
            status: 'waiting'
        };

        socket.emit('room-created', kod);
        console.log(`Match kreye: ${kod} ak bet: ${data.bet} HTG`);
    });

    // 2. ANTRE NAN MATCH (Lè zanmi an mete kòd la)
    socket.on('join-room', (kod) => {
        const room = io.sockets.adapter.rooms.get(kod);
        
        if (room && room.size === 1 && chanmPrive[kod]) {
            socket.join(kod);
            chanmPrive[kod].status = 'playing';
            chanmPrive[kod].adversaire = socket.id;

            // Notifye tou de jwè yo ke match la kòmanse
            io.to(kod).emit('match-found', {
                room: kod,
                bet: chanmPrive[kod].bet,
                turn: chanmPrive[kod].createur // Premye moun nan kòmanse
            });
            console.log(`Jwè ${socket.id} antre nan match ${kod}`);
        } else {
            socket.emit('error-msg', 'Kòd sa pa valid oswa match la fini');
        }
    });

    // 3. JERE MOUVMAN (Lè yon jwè jwe sou grid la)
    socket.on('make-move', (data) => {
        // data dwe gen { room, cellIndex, symbol }
        socket.to(data.room).emit('receive-move', data);
    });

    // 4. JERE DEKONEKSYON
    socket.on('disconnect', () => {
        // Netwaye chanm si yon moun pati
        for (const kod in chanmPrive) {
            if (chanmPrive[kod].createur === socket.id || chanmPrive[kod].adversaire === socket.id) {
                io.to(kod).emit('player-left');
                delete chanmPrive[kod];
            }
        }
        console.log(`Dekonekte: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`BLITZ Sèvè ap kouri sou pòt ${PORT} ⚡`);
});
