const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Sèvi fichye HTML yo (si index.html nan menm katab la)
app.use(express.static(__dirname));

// --- DATA SÈVÈ ---
let chanmPrive = {}; 
let keuPublik = [];

io.on('connection', (socket) => {
    console.log(`Nouvo koneksyon: ${socket.id}`);

    // 1. LOJIK LOGIN (Pou bouton "KONEKTE" a mache)
    socket.on('login', (data) => {
        console.log(`Itilizatè konekte: ${data.phone}`);
        // Voye konfimasyon bay HTML la
        socket.emit('login-success', {
            phone: data.phone,
            balance: "250" // Balans tès
        });
    });

    // 2. KREYE MATCH PRIVE (Bouton "KREYE KÒD MATCH")
    socket.on('create-room', (data) => {
        const kod = Math.random().toString(36).substring(2, 7).toUpperCase();
        socket.join(kod);
        
        chanmPrive[kod] = {
            createur: socket.id,
            bet: data.bet,
            status: 'waiting'
        };

        socket.emit('room-created', kod);
        console.log(`Match prive kreye: ${kod} (Miz: ${data.bet} HTG)`);
    });

    // 3. ANTRE NAN MATCH (Bouton "ANTRE NAN MATCH")
    socket.on('join-room', (kod) => {
        const room = io.sockets.adapter.rooms.get(kod);
        
        if (room && room.size === 1 && chanmPrive[kod]) {
            socket.join(kod);
            chanmPrive[kod].status = 'playing';
            chanmPrive[kod].adversaire = socket.id;

            // Notifye de jwè yo
            io.to(kod).emit('match-found', {
                room: kod,
                bet: chanmPrive[kod].bet,
                firstTurn: chanmPrive[kod].createur
            });
        } else {
            socket.emit('error-msg', 'Kòd sa pa bon oswa match la plen');
        }
    });

    // 4. JERE MOUVMAN (Mopyon 15x15)
    socket.on('make-move', (data) => {
        // data: { room, cellIndex, symbol }
        socket.to(data.room).emit('receive-move', data);
    });

    // 5. DEKONEKSYON
    socket.on('disconnect', () => {
        // Netwaye si yon moun pati
        for (const kod in chanmPrive) {
            if (chanmPrive[kod].createur === socket.id || chanmPrive[kod].adversaire === socket.id) {
                io.to(kod).emit('player-left');
                delete chanmPrive[kod];
            }
        }
        keuPublik = keuPublik.filter(j => j.id !== socket.id);
        console.log(`Dekonekte: ${socket.id}`);
    });
});

// LANSE SÈVÈ A
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`=== BLITZ SÈVÈ KÒMANSE SOU PÒT ${PORT} ===`);
});
