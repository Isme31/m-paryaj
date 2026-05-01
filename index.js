const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Koneksyon MongoDB
mongoose.connect("mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/blitz_db?retryWrites=true&w=majority")
.then(() => console.log("✅ MongoDB konekte!"))
.catch(err => console.log("❌ Erè MongoDB:", err));

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// --- WOUT YO ---

// Paj Prensipal
app.get('/', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'index.html'));
});

// Paj Admin - Sèvi ak path.resolve pou evite erè 404
app.get('/admin', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'admin.html'));
});

// API login ak lòt yo...
app.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    // ... (rest kòd login lan menm jan an)
});

// Port konfigirasyon pou Render
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`🚀 Sèvè a ap kouri sou pò ${PORT}`);
});
