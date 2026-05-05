<!DOCTYPE html>
<html lang="ht">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BLITZ ⚡ | Jwe, Genyen, Touche</title>
    <script src="/socket.io/socket.io.js"></script>
    <link rel="stylesheet" href="https://cloudflare.com">
    <style>
        :root { --primary: #1b5e20; --accent: #2e7d32; --bg: #f4f7f6; --white: #ffffff; }
        body { background: var(--bg); color: #333; font-family: 'Segoe UI', sans-serif; margin: 0; padding-bottom: 50px; }
        .header { background: var(--white); padding: 15px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 5px rgba(0,0,0,0.05); position: sticky; top: 0; z-index: 1000; }
        .balance-pill { background: #e8f5e9; color: var(--primary); padding: 5px 12px; border-radius: 20px; font-weight: bold; }
        .screen { padding: 15px; max-width: 500px; margin: auto; }
        .hidden { display: none !important; }
        .banner-info { background: linear-gradient(135deg, var(--primary), var(--accent)); color: white; border-radius: 15px; padding: 20px; margin-bottom: 15px; }
        .service-box { font-size: 11px; background: rgba(255,255,255,0.1); padding: 10px; border-radius: 10px; margin-top: 10px; }
        .game-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
        .game-card { background: white; border-radius: 15px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.08); position: relative; }
        .game-card img { width: 100%; height: 110px; object-fit: cover; }
        .badge { position: absolute; top: 8px; right: 8px; font-size: 9px; padding: 3px 7px; border-radius: 10px; color: white; }
        .card-ui { background: white; padding: 15px; border-radius: 15px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); margin-bottom: 15px; }
        .btn { background: var(--primary); color: white; border: none; padding: 14px; border-radius: 10px; width: 100%; font-weight: bold; cursor: pointer; margin-top: 10px; }
        input { padding: 12px; border-radius: 10px; border: 1px solid #ddd; width: 93%; margin-bottom: 10px; }
        .grid { display: grid; grid-template-columns: repeat(15, 1fr); gap: 1px; background: #bbb; border: 2px solid var(--primary); border-radius: 8px; width: 100%; max-width: 400px; margin: auto; }
        .cell { aspect-ratio: 1/1; background: white; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; cursor: pointer; }
        #game-overlay { position: fixed; top:0; left:0; width:100%; height:100%; background:white; z-index:2000; display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 20px; }
    </style>
</head>
<body>

    <div class="header">
        <div class="logo" style="color:var(--primary); font-weight:bold;">BLITZ ⚡</div>
        <div id="user-header" class="hidden"><span id="u-bal" class="balance-pill">0 HTG</span></div>
    </div>

    <!-- LOGIN SCREEN -->
    <div id="auth-s" class="screen">
        <div style="text-align: center; margin-top: 50px;">
            <h1>Byenveni 👋</h1>
            <p style="font-style: italic; color: var(--accent);">" Jwe, Genyen, Touche "</p>
            <div class="card-ui">
                <input type="text" id="phone" placeholder="Telefòn">
                <input type="password" id="pass" placeholder="Modpas">
                <button class="btn" onclick="login()">KONEKTE</button>
            </div>
        </div>
    </div>

    <!-- MENU SCREEN -->
    <div id="menu-s" class="screen hidden">
        <div class="banner-info">
            <h2 style="margin:0">BLITZ SERVICES ⚡</h2>
            <div class="service-box">
                Natcom: 55110103 | Digicel: 31594645
            </div>
        </div>

        <div style="display:flex; gap:10px; margin-bottom:15px;">
            <button class="btn" style="background:#ffa502;" onclick="showS('withdraw-s')">Retrè</button>
            <button class="btn" style="background:#25d366;" onclick="window.open('https://wa.me')">Admin</button>
        </div>

        <div class="game-grid">
            <div class="game-card" onclick="showS('mopyon-opts')">
                <span class="badge" style="background:green">AKTIF</span>
                <img src="https://unsplash.com">
                <h4 style="text-align:center">MOPYON</h4>
            </div>
            <div class="game-card" onclick="alert('Domino ap vini byento!')">
                <span class="badge" style="background:gold; color:black">PREMIUM</span>
                <img src="https://unsplash.com">
                <h4 style="text-align:center">DOMINO</h4>
            </div>
        </div>

        <div id="mopyon-opts" class="hidden card-ui" style="margin-top:15px;">
            <input type="number" id="bet" value="50">
            <button class="btn" onclick="startMatchmaking()">MATCH OTOMATIK</button>
            <button class="btn" style="background:#444;" onclick="createPrivate()">CHANM PRIVÉ</button>
            <input type="text" id="join-code" placeholder="Kòd zanmi" style="margin-top:10px;">
            <button class="btn" style="background:#666;" onclick="joinPrivate()">ANTRE</button>
            <button class="btn" style="background:#999;" onclick="showS('menu-s')">RETOUNEN</button>
        </div>
    </div>

    <!-- WITHDRAW SCREEN -->
    <div id="withdraw-s" class="screen hidden">
        <div class="card-ui">
            <h3>Mande Retrè</h3>
            <input type="number" id="w-amount" placeholder="Montan">
            <button class="btn" onclick="submitWithdraw()">VOYE DEMANN</button>
            <button class="btn" style="background:#ccc;" onclick="showS('menu-s')">RETOUNEN</button>
        </div>
    </div>

    <!-- GAME OVERLAY -->
    <div id="game-overlay" class="hidden">
        <h2 id="match-status">Chache...</h2>
        <div id="prize-tag" class="balance-pill">-- HTG</div>
        <div id="room-display" style="margin:10px 0; color:#888;"></div>
        <div class="grid" id="board-grid"></div>
        <p id="turn-info" style="font-weight:bold;"></p>
        <button class="btn" style="background:red; width:150px;" onclick="location.reload()">KITE JWÈT</button>
    </div>

    <script>
        const socket = io();
        let user, room, symbol, myTurn, board = Array(15).fill().map(() => Array(15).fill(''));

        function showS(id) {
            document.querySelectorAll('.screen, #mopyon-opts').forEach(s => s.classList.add('hidden'));
            document.getElementById(id).classList.remove('hidden');
            if(id === 'mopyon-opts') document.getElementById('menu-s').classList.remove('hidden');
        }

        async function login() {
            const phone = document.getElementById('phone').value, pass = document.getElementById('pass').value;
            const ref = new URLSearchParams(window.location.search).get('ref');
            const res = await fetch('/login', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ phone, password: pass, ref }) });
            const data = await res.json();
            if(data.success) { 
                user = data.user; 
                showS('menu-s'); 
                document.getElementById('user-header').classList.remove('hidden'); 
                updateUI(); 
            } else alert(data.msg);
        }

        function updateUI() { 
            document.getElementById('u-bal').innerText = user.balance + " HTG"; 
        }

        function startMatchmaking() {
            const bet = parseInt(document.getElementById('bet').value);
            socket.emit('startMatchmaking', { phone: user.phone, bet });
            document.getElementById('game-overlay').classList.remove('hidden');
        }

        function createPrivate() {
            const bet = parseInt(document.getElementById('bet').value);
            const code = Math.floor(1000 + Math.random() * 9000);
            socket.emit('joinRoom', { roomCode: code, phone: user.phone, bet });
            document.getElementById('game-overlay').classList.remove('hidden');
            document.getElementById('room-display').innerText = "KÒD: " + code;
        }

        function joinPrivate() {
            const code = document.getElementById('join-code').value;
            socket.emit('joinRoom', { roomCode: code, phone: user.phone });
            document.getElementById('game-overlay').classList.remove('hidden');
        }

        socket.on('gameStart', (data) => {
            room = data.room; symbol = data.symbol; myTurn = (data.turn === user.phone);
            document.getElementById('match-status').innerText = "Match Lanse!";
            document.getElementById('prize-tag').innerText = "Pri: " + data.prize + " HTG";
            renderBoard(); updateTurnText();
        });

        socket.on('opponentMove', (data) => {
            board[data.r][data.c] = data.symbol; myTurn = true;
            renderBoard(); updateTurnText();
        });

        function renderBoard() {
            const grid = document.getElementById('board-grid'); grid.innerHTML = '';
            for(let r=0; r<15; r++){
                for(let c=0; c<15; c++){
                    const cell = document.createElement('div'); cell.className = 'cell';
                    if(board[r][c] === 'X') cell.style.color = 'red';
                    if(board[r][c] === 'O') cell.style.color = 'blue';
                    cell.innerText = board[r][c];
                    cell.onclick = () => {
                        if(!myTurn || board[r][c] !== '') return;
                        board[r][c] = symbol; myTurn = false; renderBoard(); updateTurnText();
                        socket.emit('move', { room, r, c, symbol });
                        if(checkWin(r, c)) socket.emit('win', { room, phone: user.phone, prize: parseFloat(document.getElementById('prize-tag').innerText.replace(/[^0-9.]/g, '')) });
                    };
                    grid.appendChild(cell);
                }
            }
        }

        function updateTurnText() {
            const t = document.getElementById('turn-info');
            t.innerText = myTurn ? "TOU PA W ("+symbol+")" : "ATANN ADVÈSÈ A...";
            t.style.color = myTurn ? "green" : "orange";
        }

        function checkWin(r, c) {
            const s = board[r][c]; const dirs = [ [0,1], [1,0], [1,1], [1,-1] ];
            for(let [dr, dc] of dirs) {
                let count = 1;
                for(let i=1; i<5; i++) if(board[r+dr*i]?.[c+dc*i] === s) count++; else break;
                for(let i=1; i<5; i++) if(board[r-dr*i]?.[c-dc*i] === s) count++; else break;
                if(count >= 5) return true;
            }
            return false;
        }

        socket.on('gameOver', (data) => { alert(data.winner === user.phone ? "OU GENYEN!" : "OU PÈDI!"); location.reload(); });
        socket.on('updateBalance', (b) => { user.balance = b; updateUI(); });
        socket.on('errorMsg', (m) => { alert(m); location.reload(); });
    </script>
</body>
</html>
