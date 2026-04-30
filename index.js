const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'index.html'));
});

// Nou kòmanse pa chwazi X oswa O pa azar
let winnerOfLastRound = Math.random() < 0.5 ? 'X' : 'O';

io.on('connection', (socket) => {
  // Lè yon moun konekte, nou di l kiyès k ap kòmanse
  socket.emit('start-player', winnerOfLastRound);

  socket.on('mouvman', (data) => {
    socket.broadcast.emit('mouvman', data);
  });

  socket.on('game-over', (winner) => {
    winnerOfLastRound = winner; // Moun ki genyen an ap kòmanse pwochen fwa
    io.emit('reset', winnerOfLastRound);
  });

  socket.on('reset', () => {
    io.emit('reset', winnerOfLastRound);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sèvè a ap kouri sou pò ${PORT}`);
});
