const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const adapter = new FileSync('db.json');
const db = low(adapter);
db.defaults({ users: [], deposits: [], withdrawals: [] }).write();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(__dirname));

// --- ROUTES ---
app.post('/login', (req, res) => {
    const { phone, password } = req.body;
    let user = db.get('users').find({ phone }).value();
    if (!user) {
        user = { phone, password, balance: 100 };
        db.get('users').push(user).write();
    }
    if (user.password === password) res.json({ success: true, balance: user.balance });
    else res.json({ success: false, message: "Modpas pa bon!" });
});

app.post('/bet', (req, res) => {
    const { phone } = req.body;
    let user = db.get('users').find({ phone }).value();
    if (user && user.balance >= 50) {
        const newBalance = user.balance - 50;
        db.get('users').find({ phone }).assign({ balance: newBalance }).write();
        res.json({ success: true, newBalance });
    } else res.json({ success: false, message: "Ou pa gen ase kòb (50G)" });
});

app.post('/request-deposit', (req, res) => {
    const { phone, amount, transactionId } = req.body;
    db.get('deposits').push({ id: Date.now(), phone, amount: parseInt(amount), transactionId, status: 'pending' }).write();
    res.json({ success: true, message: "Demand voye! Tann admin konfime l." });
});

app.post('/request-withdrawal', (req, res) => {
    const { phone, amount, method } = req.body;
    let user = db.get('users').find({ phone }).value();
    if (user && user.balance >= amount && amount >= 100) {
        const newBalance = user.balance - amount;
        db.get('users').find({ phone }).assign({ balance: newBalance }).write();
        db.get('withdrawals').push({ id: Date.now(), userPhone: phone, amount, method, status: 'pending' }).write();
        res.json({ success: true, message: "Demann retrè voye!", newBalance });
    } else res.json({ success: false, message: "Balans ensifizan (Min 100G)" });
});

app.get('/admin/data', (req, res) => {
    res.json({ 
        deposits: db.get('deposits').filter({ status: 'pending' }).value(),
        withdrawals: db.get('withdrawals').filter({ status: 'pending' }).value()
    });
});

app.post('/admin/confirm-deposit', (req, res) => {
    const { depositId } = req.body;
    const dep = db.get('deposits').find({ id: depositId }).value();
    if (dep) {
        let user = db.get('users').find({ phone: dep.phone }).value();
        db.get('users').find({ phone: dep.phone }).assign({ balance: (user.balance || 0) + dep.amount }).write();
        db.get('deposits').find({ id: depositId }).assign({ status: 'confirmed' }).write();
        res.json({ success: true });
    }
});

app.post('/admin/confirm-withdrawal', (req, res) => {
    db.get('withdrawals').find({ id: req.body.id }).assign({ status: 'confirmed' }).write();
    res.json({ success: true });
});

io.on('connection', (socket) => {
    socket.on('join-room', (data) => {
        const { roomCode, phone } = data;
        socket.join(roomCode);
        socket.myRoom = roomCode; socket.phone = phone;
        const clients = io.sockets.adapter.rooms.get(roomCode);
        const role = (clients.size === 1) ? 'X' : 'O';
        socket.emit('player-role', role);
        if (clients.size === 2) io.to(roomCode).emit('start-game', 'X');
    });
    socket.on('mouvman', (data) => socket.to(data.room).emit('mouvman', data));
    socket.on('game-over', (data) => {
        const { room, winnerPhone } = data;
        if (winnerPhone) {
            let user = db.get('users').find({ phone: winnerPhone }).value();
            const updatedBalance = (user.balance || 0) + 90;
            db.get('users').find({ phone: winnerPhone }).assign({ balance: updatedBalance }).write();
            io.to(room).emit('update-balance', { phone: winnerPhone, balance: updatedBalance });
        }
        io.to(room).emit('reset');
    });
});

server.listen(3000, () => console.log('Sèvè prè sou pò 3000'));
