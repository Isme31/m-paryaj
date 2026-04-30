<!DOCTYPE html>
<html lang="hat">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mopyon 50g | Login</title>
    <script src="https://tailwindcss.com"></script>
    <style>
        @import url('https://googleapis.com');
        body { font-family: 'Poppins', sans-serif; background: #0f172a; color: white; }
        .glass { background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1); }
        .board { display: grid; grid-template-columns: repeat(15, 25px); gap: 2px; background: #1e293b; padding: 5px; border-radius: 8px; }
        .cell { width: 25px; height: 25px; background: #334155; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 12px; border-radius: 2px; }
        .timer-bar { height: 4px; background: #22c55e; width: 100%; transition: width 1s linear; }
        .hidden { display: none; }
    </style>
</head>
<body class="min-h-screen flex items-center justify-center p-4">

    <!-- FORMULAIRE LOGIN/INSCRIPTION -->
    <div id="auth-screen" class="w-full max-w-md text-center animate-fade-in">
        <h1 class="text-4xl font-bold mb-6 text-blue-400">MOPYON 50G</h1>
        <div class="glass p-8 rounded-3xl shadow-2xl">
            <p class="text-gray-400 mb-6 text-sm">Mete nimewo telefòn ou ak yon modpas pou w ka jwe.</p>
            <input type="text" id="phone" placeholder="Nimewo Telefòn" class="w-full bg-slate-800 border border-slate-700 p-3 rounded-xl mb-4 focus:outline-none focus:border-blue-500">
            <input type="password" id="password" placeholder="Modpas" class="w-full bg-slate-800 border border-slate-700 p-3 rounded-xl mb-6 focus:outline-none focus:border-blue-500">
            <button onclick="handleLogin()" class="w-full bg-blue-600 hover:bg-blue-500 py-3 rounded-xl font-bold shadow-lg transition">ANTRE NAN JWÈT LA</button>
            <p id="auth-error" class="text-red-400 text-xs mt-4"></p>
        </div>
    </div>

    <!-- PAJ JWÈT LA (KACHE PA DEFO) -->
    <div id="game-screen" class="hidden w-full max-w-4xl text-center">
        <div class="glass p-4 rounded-2xl mb-4 max-w-sm mx-auto">
            <div id="status" class="font-bold mb-2">Chaje...</div>
            <div class="w-full bg-gray-700 rounded-full overflow-hidden h-1">
                <div id="timer-visual" class="timer-bar"></div>
            </div>
        </div>
        <div class="flex justify-center overflow-auto py-4">
            <div class="board" id="board"></div>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let currentPlayer = '';
        let board = Array(225).fill(null);
        let timeLeft = 30;
        let timerInterval = null;

        async function handleLogin() {
            const phone = document.getElementById('phone').value;
            const password = document.getElementById('password').value;
            const errorElement = document.getElementById('auth-error');

            if (!phone || !password) {
                errorElement.innerText = "Mete tout enfòmasyon yo!";
                return;
            }

            const response = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, password })
            });
            const data = await response.json();

            if (data.success) {
                document.getElementById('auth-screen').classList.add('hidden');
                document.getElementById('game-screen').classList.remove('hidden');
                createBoard();
            } else {
                errorElement.innerText = data.message;
            }
        }

        // --- Tout lojik jwèt la (createBoard, makeMove, checkWin, startTimer) rete menm jan ak anvan ---
        // ... (mwen kache yo pou mesaj la pa twò long, men ou dwe kite yo anndan script la) ...

        function createBoard() {
            const b = document.getElementById('board');
            b.innerHTML = '';
            for(let i=0; i<225; i++) {
                const c = document.createElement('div');
                c.classList.add('cell');
                c.onclick = () => makeMove(i, true);
                b.appendChild(c);
            }
        }

        function startTimer() {
            clearInterval(timerInterval); timeLeft = 30;
            timerInterval = setInterval(() => {
                timeLeft--; 
                document.getElementById('timer-visual').style.width = (timeLeft/30)*100 + "%";
                if(timeLeft <= 0) {
                    clearInterval(timerInterval);
                    alert("Tan fini!");
                    socket.emit('game-over', currentPlayer === 'X' ? 'O' : 'X');
                }
            }, 1000);
        }

        function makeMove(i, emit) {
            if(board[i] || !currentPlayer) return;
            board[i] = currentPlayer;
            const cell = document.getElementById('board').children[i];
            cell.innerText = currentPlayer;
            cell.classList.add(currentPlayer);
            if(emit) socket.emit('mouvman', {index: i, player: currentPlayer});
            currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
            document.getElementById('status').innerText = "Tou pa: " + currentPlayer;
            startTimer();
        }

        socket.on('start-player', p => { if(!currentPlayer){currentPlayer=p; startTimer();} });
        socket.on('mouvman', d => { currentPlayer=d.player; makeMove(d.index, false); });
        socket.on('reset', p => { board.fill(null); currentPlayer=p; createBoard(); startTimer(); });
    </script>
</body>
</html>
