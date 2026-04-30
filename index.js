const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Sèvi fichye static (HTML, CSS, JS) ki nan rasin pwojè a
app.use(express.static(__dirname));

// Voye index.html lè yon moun vizite sit la
app.get('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'index.html'));
});

// Jesyon kominikasyon an dirèk ak Socket.io
io.on('connection', (socket) => {
  console.log('Yon jwè konekte: ' + socket.id);

  // Lè yon jwè fè yon mouvman, voye l bay tout lòt moun
  socket.on('mouvman', (data) => {
    socket.broadcast.emit('mouvman', data);
  });

  // Lè yon moun klike sou bouton "Rekòmanse", reset pou tout moun
  socket.on('reset', () => {
    io.emit('reset');
  });

  socket.on('disconnect', () => {
    console.log('Yon jwè dekonekte');
  });
});

// Sèvi ak pò Render bay la oswa 3000 pa defo
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sèvè a ap kouri sou pò ${PORT}`);
});
