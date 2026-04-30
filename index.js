const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Liy sa a ap sèvi tout fichye ki nan rasin pwojè a (HTML, CSS, JS)
app.use(express.static(__dirname));

// Liy sa a ap voye index.html bay moun k ap vizite sit la
app.get('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'index.html'));
});

// Jesyon Socket.io pou jwèt la
io.on('connection', (socket) => {
  console.log('Yon jwè konekte: ' + socket.id);

  socket.on('mouvman', (data) => {
    // Voye mouvman an bay tout lòt jwè yo
    socket.broadcast.emit('mouvman', data);
  });

  socket.on('disconnect', () => {
    console.log('Yon jwè dekonekte');
  });
});

// Render ap toujou bay yon pò nan "process.env.PORT"
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sèvè a ap kouri sou pò ${PORT}`);
});
