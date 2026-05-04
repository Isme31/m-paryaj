const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- DATA ---
let keuPublik = []; // Pou matchmaking nòmal
let chanmPrive = {}; // Pou jwe ak kòd

io.on('connection', (socket) => {
    console.log(`Konekte: ${socket.id}`);

    // OPTION 1: Matchmaking Nòmal (ak nivo si w vle)
    socket.on('join-matchmaking', (data) => {
        const nivo = data?.nivo || 0;
        const nouvoJwe = { socket, nivo };

        // Chache yon moun ki gen menm nivo (diff mwens pase 5)
        const adversaireIndex = keuPublik.findIndex(j => Math.abs(j.nivo - nivo) <= 5);

        if (adversaireIndex !== -1) {
            const adversaire = keuPublik.splice(adversaireIndex, 1)[0];
            const roomName = `match_${socket.id}_${adversaire.socket.id}`;

            socket.join(roomName);
            adversaire.socket.join(roomName);

            io.to(roomName).emit('match-found', { room: roomName, nivoAdversaire: adversaire.nivo });
            console.log(`Match piblik kreye: ${roomName}`);
        } else {
            keuPublik.push(nouvoJwe);
            socket.emit('waiting', 'N ap chache yon moun pou ou...');
        }
    });

    // OPTION 2: Kreye yon match prive (Kòd)
    socket.on('create-private', (kod) => {
        socket.join(kod);
        chanmPrive[kod] = socket.id;
        socket.emit('room-created', kod);
    });

    // OPTION 3: Antre nan yon match prive ak kòd
    socket.on('join-private', (kod) => {
        const room = io.sockets.adapter.rooms.get(kod);
        if (room && room.size === 1) {
            socket.join(kod);
            io.to(kod).emit('match-found', { room: kod, private: true });
            delete chanmPrive[kod];
        } else {
            socket.emit('error-msg', 'Kòd sa pa bon oswa chanm nan plen');
        }
    });

    // OPTION 4: Jere mouvman nan jwèt la
    socket.on('send-move', (data) => {
        // data dwe gen { room: "non_room_nan", move: ... }
        socket.to(data.room).emit('receive-move', data.move);
    });

    // Netwaye si jwè a dekonekte
    socket.on('disconnect', () => {
        keuPublik = keuPublik.filter(j => j.socket.id !== socket.id);
        console.log(`Dekonekte: ${socket.id}`);
    });
});

server.listen(3000, () => console.log('Sèvè a sou pòt 3000'));
