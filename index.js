<!DOCTYPE html>
<html lang="ht">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mopyon Blitz ⚡</title>
    <script src="/socket.io/socket.io.js"></script>
    <style>
        body { background: #0f0f0f; color: white; text-align: center; font-family: sans-serif; margin: 0; }
        .screen { padding: 20px; }
        .hidden { display: none !important; }
        .grid { display: grid; grid-template-columns: repeat(15, 1fr); gap: 1px; width: 100%; max-width: 500px; margin: auto; background: #444; border: 2px solid #ff4757; }
        .cell { aspect-ratio: 1/1; background: #181818; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; cursor: pointer; }
        input, button { padding: 12px; margin: 5px 0; width: 90%; border-radius: 8px; border: none; font-size: 15px; }
        button { background: #ff4757; color: white; font-weight: bold; cursor: pointer; }
        .bal-box { background: #1e1e1e; padding: 15px; border-radius: 10px; border: 1px solid #333; margin-bottom: 10px; }
    </style>
</head>
<body>

    <div id="auth-screen" class="screen">
        <h1 style="color:#ff4757">Mopyon Blitz ⚡</h1>
        <input type="text" id="phone" placeholder="Telefòn">
        <input type="password" id="pass" placeholder="Modpas">
        <button onclick="login()">KONEKTE</button>
    </div>

    <div id="game-screen" class="screen hidden">
        <div class="bal-box"><h2><span id="bal">0</span> G</h2></div>
        <div id="lobby">
            <h3>Paryaj (G): <input type="number" id="bet" value="100" style="width:80px"></h3>
            <button onclick="createPrivate()" style="background:#2ecc71">KREYE KÒD</button>
            <div id="display-code" class="hidden" style="margin-top:10px; border:2px dashed #ff4757; padding:10px;">
                <h1 id="room-code-val" style="color:#ff4757">----</h1>
                <button id="share-btn" style="background:#25d366">Voye sou WhatsApp</button>
            </div>
            <hr>
            <input type="text" id="join-code" placeholder="Mete kòd la">
            <button onclick="joinPrivate()" style="background:#ffa502">ANTRE NAN MATCH</button>
        </div>
        <div id="board-container" class="hidden">
            <div id="timer" style="font-size:20px; color:red">30s</div>
            <div id="status">Atann...</div>
            <div id="board" class="grid"></div>
        </div>
    </div>

    <div id="game-modal" class="hidden" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); display:flex; flex-direction:column; align-items:center; justify-content:center;">
        <h1 id="res-txt"></h1>
        <button onclick="location.reload()">REJWE</button>
    </div>

    <script>
        const socket = io();
        let myPhone, mySymbol, currentRoom, myTurn = false, boardData = Array(225).fill("");
        let timer;

        async function login() {
            const phone = document.getElementById('phone').value;
            const password = document.getElementById('pass').value;
            const res = await fetch('/login', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ phone, password }) });
            const d = await res.json();
            if(d.success) {
                myPhone = d.phone; document.getElementById('bal').innerText = d.balance;
                document.getElementById('auth-screen').classList.add('hidden'); document.getElementById('game-screen').classList.remove('hidden');
            } else alert(d.msg);
        }

        function createPrivate() {
            socket.emit('createPrivate', { phone: myPhone, bet: document.getElementById('bet').value });
        }

        function joinPrivate() {
            socket.emit('joinPrivate', { code: document.getElementById('join-code').value, phone: myPhone });
        }

        socket.on('roomCreated', data => {
            document.getElementById('room-code-val').innerText = data.code;
            document.getElementById('display-code').classList.remove('hidden');
            document.getElementById('share-btn').onclick = () => window.open(`https://wa.me{data.code}`);
        });

        socket.on('gameStart', data => {
            currentRoom = data.room; mySymbol = data.firstTurn === myPhone ? 'X' : 'O'; myTurn = (data.firstTurn === myPhone);
            document.getElementById('lobby').classList.add('hidden'); document.getElementById('board-container').classList.remove('hidden');
            renderBoard();
        });

        function renderBoard() {
            const b = document.getElementById('board'); b.innerHTML = "";
            boardData.forEach((c, i) => {
                const d = document.createElement('div'); d.className = 'cell'; d.innerText = c;
                d.onclick = () => {
                    if(!myTurn || boardData[i] !== "") return;
                    boardData[i] = mySymbol; myTurn = false; renderBoard();
                    socket.emit('move', { room: currentRoom, index: i, symbol: mySymbol });
                    if(checkWin(i, mySymbol)) socket.emit('win', { room: currentRoom, phone: myPhone });
                };
                b.appendChild(d);
            });
        }

        function checkWin(idx, s) {
            const size = 15; const r = Math.floor(idx/size), c = idx%size;
            const dirs = [[0,1],[1,0],[1,1],[1,-1]];
            for (let [dr, dc] of dirs) {
                let cnt = 1;
                for (let i=1; i<5; i++) { let nr=r+dr*i, nc=c+dc*i; if(nr>=0 && nr<15 && nc>=0 && nc<15 && boardData[nr*size+nc]===s) cnt++; else break; }
                for (let i=1; i<5; i++) { let nr=r-dr*i, nc=c-dc*i; if(nr>=0 && nr<15 && nc>=0 && nc<15 && boardData[nr*size+nc]===s) cnt++; else break; }
                if(cnt>=5) return true;
            }
            return false;
        }

        socket.on('opponentMove', d => { boardData[d.index] = d.symbol; myTurn = true; renderBoard(); });
        socket.on('gameOver', d => { 
            document.getElementById('res-txt').innerText = d.winner === myPhone ? "OU GENYEN!" : "OU PÈDI!";
            document.getElementById('game-modal').classList.remove('hidden');
        });
        socket.on('errorMsg', m => alert(m));
    </script>
</body>
</html>
