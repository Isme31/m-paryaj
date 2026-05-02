const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- KONEKSYON MONGODB ---
const dbURI = "mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/mopyonDB?retryWrites=true&w=majority&appName=hugues";

mongoose.connect(dbURI)
    .then(() => console.log("MongoDB Konekte ✅"))
    .catch(err => console.error("Erè DB ❌:", err));

// --- MODEL DONE ---
const User = mongoose.model('User', new mongoose.Schema({
    phone: { type: String, unique: true },
    password: String,
    balance: { type: Number, default: 100 }
}));

// --- ROUTES API ---
app.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    try {
        let user = await User.findOne({ phone });
        if (!user) {
            user = await User.create({ phone, password, balance: 100 });
        } else if (user.password !== password) {
            return res.json({ success: false, msg: "Modpas pa bon" });
        }
        res.json({ success: true, phone: user.phone, balance: user.balance });
    } catch (e) { res.status(500).json({ success: false }); }
});

// --- LOJIK JWÈT (SOCKET.IO) ---
let waitingPlayers = []; 

io.on('connection', (socket) => {
    
    socket.on('findMatch', async (data) => {
        try {
            const user = await User.findOne({ phone: data.phone });
            
            // 1. Tcheke si jwè a gen kòb li vle mize a
            if (!user || user.balance < data.bet) {
                return socket.emit('error_msg', 'Kòb ou pa ase pou mize sa!');
            }

            // 2. RETIRE KANTITE LI MIZE A SOU KONT LI TOUT SWIT
            const updatedUser = await User.findOneAndUpdate(
                { phone: data.phone }, 
                { $inc: { balance: -data.bet } },
                { new: true }
            );
            
            // Voye nouvo balans lan bay jwè a pou l wè kòb la soti
            socket.emit('balanceUpdate', { balance: updatedUser.balance });
            console.log(`Mize ${data.bet}G soti sou kont ${data.phone}`);

            // 3. CHACHE ADVÈSÈ KI MIZE MENM KANTITE A
            let opponentIndex = waitingPlayers.findIndex(p => p.bet === data.bet && p.phone !== data.phone);

            if (opponentIndex > -1) {
                const opponent = waitingPlayers.splice(opponentIndex, 1)[0];
                const room = `room_${Date.now()}`;
                
                socket.join(room);
                const oppSocket = io.sockets.sockets.get(opponent.socketId);
                if (oppSocket) oppSocket.join(room);

                // Ganyan an ap touche mize pa l + mize lòt la (mwens 10% frais)
                const prize = (data.bet * 2) * 0.9;

                io.to(room).emit('gameStart', {
                    room, 
                    prize: prize,
                    firstTurn: Math.random() > 0.5 ? data.phone : opponent.phone
                });
            } else {
                // Mete jwè a nan lis datant lan ak tout mize li
                waitingPlayers.push({ ...data, socketId: socket.id });
                socket.emit('waiting', 'Mize anrejistre. Ap chache advèsè...');
            }
        } catch (e) { console.error(e); }
    });

    socket.on('move', (data) => {
        socket.to(data.room).emit('opponentMove', data);
    });

    socket.on('win', async (data) => {
        try {
            // 4. BAY GANYAN AN TOUT KÒB PO A (Mize pa l + mize pèdan an)
            const winner = await User.findOneAndUpdate(
                { phone: data.phone }, 
                { $inc: { balance: data.prize } },
                { new: true }
            );
            console.log(`💰 ${data.phone} genyen po a: ${data.prize}G!`);
            io.to(socket.id).emit('balanceUpdate', { balance: winner.balance });
        } catch (e) { console.error(e); }
    });

    socket.on('disconnect', () => {
        // Si yon moun dekonekte pandan l t ap tann, ou ka ajoute lojik pou rann li mize l la isit la
        waitingPlayers = waitingPlayers.filter(p => p.socketId !== socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sèvè a Live sou port ${PORT} 🚀`));
