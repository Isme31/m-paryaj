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

const ADMIN_KEY = "hugues"; // Modpas ou mande a

app.use(express.json());
app.use(express.static(__dirname));

// LOGIN
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

// BET 50G
app.post('/bet', (req, res) => {
    const { phone, password } = req.body;
    let user = db.get('users').find({ phone, password }).value();
    if (user && user.balance >= 50) {
        const newBalance = user.balance - 50;
        db.get('users').find({ phone }).assign({ balance: newBalance }).write();
        res.json({ success: true, newBalance });
    } else res.json({ success: false, message: "Kòb ou pa ase!" });
});

// RETRÈ
app.post('/request-withdrawal', (req, res) => {
    const { phone, password, amount, method } = req.body;
    const val = parseInt(amount);
    let user = db.get('users').find({ phone, password }).value();
    if (user && val >= 100 && user.balance >= val) {
        const newBal = user.balance - val;
        db.get('users').find({ phone }).assign({ balance: newBal }).write();
        db.get('withdrawals').push({ id: Date.now(), userPhone: phone, amount: val, method, status: 'pending' }).write();
        res.json({ success: true, message: "Demann voye!", newBalance: newBal });
    } else res.json({ success: false, message: "Erè nan balans oswa modpas!" });
});

// DEPO
app.post('/request-deposit', (req, res) => {
    const { phone, amount, transactionId } = req.body;
    db.get('deposits').push({ id: Date.now(), phone, amount: parseInt(amount), transactionId, status: 'pending' }).write();
    res.json({ success: true, message: "Admin nan ap verifye sa!" });
});

// ADMIN API
app.get('/admin/data', (req, res) => {
    if (req.query.key !== ADMIN_KEY) return res.status(403).send("Aksè Refize");
    res.json({ 
        deposits: db.get('deposits').filter({ status: 'pending' }).value(),
        withdrawals: db.get('withdrawals').filter({ status: 'pending' }).value()
    });
});

app.post('/admin/confirm-deposit', (req, res) => {
    if (req.body.key !== ADMIN_KEY) return res.status(403).send();
    const dep = db.get('deposits').find({ id: req.body.id }).value();
    if (dep) {
        let user = db.get('users').find({ phone: dep.phone }).value();
        db.get('users').find({ phone: dep.phone }).assign({ balance: (user.balance || 0) + dep.amount }).write();
        db.get('deposits').find({ id: req.body.id }).assign({ status: 'confirmed' }).write();
        res.json({ success: true });
    }
});

app.post('/admin/confirm-withdrawal', (req, res) => {
    if (req.body.key !== ADMIN_KEY) return res.status(403).send();
    db.get('withdrawals').find({ id: req.body.id }).assign({ status: 'confirmed' }).write();
    res.json({ success: true });
});

// SOCKETS (MOPYON)
io.on('connection', (socket) => {
    socket.on('join-room', (data) => {
        socket.join(data.roomCode);
        socket.room = data.roomCode;
        const clients = io.sockets.adapter.rooms.get(data.roomCode);
        const role = (clients.size === 1) ? 'X' : 'O';
        socket.emit('player-role', role);
        if (clients.size === 2) io.to(data.roomCode).emit('start-game', 'X');
    });
    socket.on('mouvman', (data) => socket.to(data.room).emit('mouvman', data));
    socket.on('game-over', (data) => {
        if (data.winnerPhone) {
            let user = db.get('users').find({ phone: data.winnerPhone }).value();
            if(user) {
                const newB = (user.balance || 0) + 90;
                db.get('users').find({ phone: data.winnerPhone }).assign({ balance: newB }).write();
                io.to(data.room).emit('update-balance', { phone: data.winnerPhone, balance: newB });
            }
        }
        io.to(data.room).emit('reset');
    });
});

server.listen(3000, () => console.log('Sèvè kòmanse sou pò 3000'));
