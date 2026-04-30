const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const dbURI = "mongodb+srv://hugues:hugues@hugues.pte9ru5.mongodb.net/blitz_db?retryWrites=true&w=majority";

mongoose.connect(dbURI).then(() => console.log("✅ MongoDB Konekte!"));

const User = mongoose.model('User', { phone: String, password: String, balance: {type: Number, default: 0} });

app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    try {
        let user = await User.findOne({ phone });
        if (!user) { user = new User({ phone, password }); await user.save(); }
        if (user.password === password) {
            res.json({ success: true, balance: user.balance });
        } else { res.json({ success: false, message: "Modpas pa bon!" }); }
    } catch(e) { res.status(500).json({success: false}); }
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Sèvè ap kouri sou ${PORT}`));
