const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { transports: ['websocket', 'polling'], cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;
const MONGO_URI = "mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/mopyon_db?retryWrites=true&w=majority";
const ADMIN_SECRET = "hugues";

mongoose.connect(MONGO_URI).then(() => console.log("Blitz Sèvè ✅")).catch(e => console.log(e));

const User = mongoose.model('User', new mongoose.Schema({
    phone: { type: String, unique: true },
    password: { type: String },
    balance: { type: Number, default: 0 },
    referralCount: { type: Number, default: 0 }
}));

const Withdraw = mongoose.model('Withdraw', new mongoose.Schema({
    phone: String, amount: Number, status: { type: String, default: 'pending' }
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/login', async (req, res) => {
    try {
        const { phone, password, ref } = req.body;
        const cleanPhone = phone.trim().replace(/\s+/g, '');
        if (!/^[3-5][0-9]{7}$/.test(cleanPhone)) return res.json({ success: false, msg: "Nimewo Ayiti 8 chif!" });

        let user = await User.findOne({ phone: cleanPhone });
        if (!user) {
            if (ref && ref !== cleanPhone) await User.findOneAndUpdate({ phone: ref }, { $inc: { balance: 5, referralCount: 1 } });
            user = await User.create({ phone: cleanPhone, password, balance: 0 });
            return res.json({ success: true, user, msg: "Byenveni! Kontakte nou pou rechaje." });
        }
        if (user.password !== password) return res.json({ success: false, msg: "Modpas pa bon!" });
        res.json({ success: true, user });
    } catch (e) { res.json({ success: false, msg: "Erè Sèvè" }); }
});

app.post('/withdraw', async (req, res) => {
    const { phone, amount } = req.body;
    const user = await User.findOne({ phone });
    if (user && user.balance >= amount && amount >= 100) {
        await User.findOneAndUpdate({ phone }, { $inc: { balance: -amount } });
        await Withdraw.create({ phone, amount });
        res.json({ success: true, msg: "Demann voye!" });
    } else res.json({ success: false, msg: "Balans ou piti!" });
});

app.post('/admin/update-balance', async (req, res) => {
    const { phone, amount, secret } = req.body;
    if (secret !== ADMIN_SECRET) return res.json({ success: false });
    await User.findOneAndUpdate({ phone }, { $inc: { balance: Number(amount) } });
    res.json({ success: true });
});

io.on('connection', (socket) => {
    socket.on('startMatchmaking', async (data) => {
        const bet = Number(data.bet);
        const user = await User.findOne({ phone: data.phone });
        if (!user || user.balance < bet) return socket.emit('errorMsg', "Balans ou piti!");
        // Lojik matchmaking ou te genyen an...
    });
});

server.listen(PORT, "0.0.0.0", () => console.log(`Blitz kouri sou ${PORT}`));
