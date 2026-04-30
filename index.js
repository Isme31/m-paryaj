
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Sèvi fichye HTML yo ki nan folder "public" la (si w genyen l)
app.use(express.static(path.join(__dirname, 'public')));

// Si w pa gen folder public, li pral chèche index.html nan rasin lan
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Jesyon koneksyon jwè yo ak Socket.io
io.on('connection', (socket) => {
  console.log('Yon jwè konekte: ' + socket.id);

  socket.on('disconnect', () => {
    console.log('Yon jwè dekonekte');
  });

  // Ou ka ajoute lòt fonksyon pou jwèt la isit la (mouvman, genyen, elatriye)
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sèvè a ap kouri sou pò ${PORT}`);
});
