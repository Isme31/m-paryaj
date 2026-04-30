const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

// Konfigirasyon Database
const adapter = new FileSync('db.json');
const db = low(adapter);
db.defaults({ users: [], deposits: [], withdrawals: [] }).write();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const ADMIN_KEY = "hugues"; 

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
    if (user.password === password) {
        res.json({ success: true, balance: user.balance, isAdmin: (phone === "31594645" || phone === "55110103") });
    } else {
        res.json({ success: false, message: "Modpas pa kòrèk!" });
    }
});

app.post('/request-deposit', (req, res) => {
    const { phone, amount, transactionId } = req.body;
    
    // SEKIRITE: Tcheke si ID sa a te deja itilize nan sistèm nan
    const idExists = db.get('deposits').find({ transactionId }).value();
    if (idExists) {
        return res.json({ success: false, message: "ID sa a deja itilize nan yon lòt tranzaksyon!" });
    }

    db.get('deposits').push({ 
        id: Date.now(), 
        phone, 
        amount: parseInt(amount), 
        transactionId, 
        status: 'pending' 
    }).write();
    res.json({ success: true, message: "Depo voye! Admin ap verifye sa." });
});

app.post('/bet', (req, res) => {
    const { phone, password, free } = req.body;
    let user = db.get('users').find({ phone, password }).value();
    
    // Admin jwe gratis
    if (free && (phone === "31594645" || phone === "55110103")) {
        return res.json({ success: true, newBalance: user.balance });
    }

    if (user && user.balance >= 50) {
        const newBalance = user.balance - 50;
        db.get('users').find({ phone }).assign({ balance: newBalance }).write();
        res.json({ success: true, newBalance });
    } else {
        res.json({ success: false, message: "Ou bezwen 50G pou jwe!" });
    }
});

app.post('/win-game', (req, res) => {
    const { phone, password } = req.body;
    let user = db.get('users').find({ phone, password }).value();
    if(user) {
        const newB = user.balance + 90;
        db.get('users').find({ phone }).assign({ balance: newB }).write();
        res.json({ success: true, balance: newB });
    }
});

app.post('/request-withdrawal', (req, res) => {
    const { phone, password, amount, method } = req.body;
    const val = parseInt(amount);
    let user = db.get('users').find({ phone, password }).value();
    if (user && val >= 100 && user.balance >= val) {
        const newBal = user.balance - val;
        db.get('users').find({ phone }).assign({ balance: newBal }).write();
        db.get('withdrawals').push({ id: Date.now(), userPhone: phone, amount: val, method, status: 'pending' }).write();
        res.json({ success: true, message: "Demand retrè voye!", newBalance: newBal });
    } else {
        res.json({ success: false, message: "Erè nan balans lan!" });
    }
});

// --- ADMIN API ---

app.get('/admin/data', (req, res) => {
    if (req.query.key !== ADMIN_KEY) return res.status(403).send("Refize");
    res.json({ 
        deposits: db.get('deposits').filter({status:'pending'}).value(), 
        withdrawals: db.get('withdrawals').filter({status:'pending'}).value() 
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

// --- SOCKETS ---

io.on('connection', (socket) => {
    socket.on('join-room', (d) => {
        socket.join(d.roomCode); socket.room = d.roomCode;
        const clients = io.sockets.adapter.rooms.get(d.roomCode);
        const role = (clients.size === 1) ? 'X' : 'O';
        socket.emit('player-role', role);
        if (clients.size === 2) io.to(d.roomCode).emit('start-game', 'X');
    });
    socket.on('mouvman', (d) => socket.to(d.room).emit('mouvman', d));
    socket.on('chat-message', (d) => io.to(d.room).emit('chat-message', d));
    socket.on('game-over', (d) => io.to(d.room).emit('reset'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sèvè Blitz ap kouri sou pò ${PORT}`));
