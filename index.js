const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Connexion à MongoDB
mongoose.connect("mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/blitz_db?retryWrites=true&w=majority")
.then(() => console.log("✅ MongoDB connecté !"))
.catch(err => console.log("❌ Erreur MongoDB :", err));

// Modèles de données
const User = mongoose.model('User', { 
    phone: String, 
    password: String, 
    balance: { type: Number, default: 0 } 
});

const Deposit = mongoose.model('Deposit', { 
    phone: String, 
    amount: Number, 
    tid: String, 
    method: String, 
    status: { type: String, default: 'pending' } 
});

app.use(express.json());
// Servir les fichiers statiques du dossier racine
app.use(express.static(__dirname));

let waitingPlayers = []; 
let gameTimers = {};
let onlineUsers = 0;

// --- ROUTES POUR LES PAGES ---

// Page d'accueil (Le jeu)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Page Admin - On utilise /admin-panel pour être sûr que ça charge admin.html
app.get('/admin-panel', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// --- LOGIQUE DU TIMER ---
function startTurnTimer(room, activePhone, prize) {
    if (gameTimers[room]) clearTimeout(gameTimers[room]);
    gameTimers[room] = setTimeout(async () => {
        io.to(room).emit('timeout', { loser: activePhone });
        const players = room.replace('room_', '').split('_');
        const winnerPhone = players.find(p => p !== activePhone);
        if (winnerPhone) await User.findOneAndUpdate({ phone: winnerPhone }, { $inc: { balance: prize } });
        delete gameTimers[room];
    }, 32000);
}

// --- API ROUTES ---

app.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    try {
        let user = await User.findOne({ phone });
        if (!user) { 
            user = new User({ phone, password }); 
            await user.save(); 
        }
        if (user.password === password) {
            res.json({ success: true, balance: user.balance, phone: user.phone });
        } else {
            res.json({ success: false, message: "Mot de passe incorrect !" });
        }
    } catch (e) {
        res.json({ success: false });
    }
});

app.post('/submit-deposit', async (req, res) => {
    try {
        await new Deposit(req.body).save();
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false });
    }
});

// Récupérer les dépôts pour l'admin
app.get('/admin/all-data', async (req, res) => {
    const { key } = req.query;
    if (key !== "hugues") return res.status(403).send("Accès refusé");
    try {
        const deposits = await Deposit.find({ status: 'pending' });
        res.json({ deposits });
    } catch (e) {
        res.status(500).json({ error: "Erreur DB" });
    }
});

// Confirmer un dépôt
app.post('/admin/confirm-deposit', async (req, res) => {
    const { key, id } = req.body;
    if (key !== "hugues") return res.status(403).json({ success: false });
    try {
        const dep = await Deposit.findById(id);
        if (dep && dep.status === 'pending') {
            const user = await User.findOneAndUpdate(
                { phone: dep.phone }, 
                { $inc: { balance: dep.amount } }, 
                { new: true }
            );
            dep.status = 'confirmed'; 
            await dep.save();
            io.emit('balanceUpdate', { phone: dep.phone, newBalance: user.balance });
            res.json({ success: true });
        }
    } catch (e) {
        res.json({ success: false });
    }
});

// --- SOCKET.IO ---
io.on('connection', (socket) => {
    onlineUsers++;
    io.emit('updateOnlineCount', onlineUsers);

    socket.on('findMatch', async (data) => {
        const { phone, bet } = data;
        const user = await User.findOne({ phone });
        if (!user || user.balance < bet) return socket.emit('error_msg', "Balance trop basse !");

        const opponentIndex = waitingPlayers.findIndex(p => p.bet === bet && p.phone !== phone);
        if (opponentIndex !== -1) {
            const opponent = waitingPlayers[opponentIndex];
            waitingPlayers.splice(opponentIndex, 1);
            const room = `room_${opponent.phone}_${phone}`;
            const prize = bet * 1.8; 
            socket.join(room); 
            opponent.socket.join(room);
            await User.updateMany({ phone: { $in: [phone, opponent.phone] } }, { $inc: { balance: -bet } });
            io.to(room).emit('gameStart', { room, players: [opponent.phone, phone], firstTurn: opponent.phone, prize });
            startTurnTimer(room, opponent.phone, prize);
        } else {
            waitingPlayers.push({ phone, bet, socket });
            socket.emit('status_update', `🔍 Recherche de match (${bet}G)...`);
        }
    });

    socket.on('move', (data) => {
        socket.to(data.room).emit('opponentMove', data);
        startTurnTimer(data.room, data.nextPlayer, data.prize);
    });

    socket.on('win', async (data) => {
        if (gameTimers[data.room]) clearTimeout(gameTimers[data.room]);
        await User.findOneAndUpdate({ phone: data.phone }, { $inc: { balance: data.prize } });
        io.to(data.room).emit('gameOver', { winner: data.phone });
        delete gameTimers[data.room];
    });

    socket.on('disconnect', () => {
        onlineUsers--;
        io.emit('updateOnlineCount', onlineUsers);
        waitingPlayers = waitingPlayers.filter(p => p.socket.id !== socket.id);
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`🚀 Serveur lancé sur le port ${PORT}`);
});
