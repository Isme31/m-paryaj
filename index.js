<div class="bal-box" style="margin-top: 10px; font-size: 13px;">
    <p>🎁 Envite yon zanmi, genyen <b>5G</b>!</p>
    <input type="text" id="ref-link" readonly style="width: 80%; font-size: 11px; background: #000; color: #0f0; border: 1px solid #333;">
    <button onclick="copyRef()" style="width: auto; padding: 5px 10px; font-size: 11px; margin-top: 5px;">KOPYE LYEN</button>
</div>

<script>
    // Nan fonksyon login() an, modifye fetch la konsa:
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get('ref');

    // Lè w ap voye login lan:
    // body: JSON.stringify({ phone, password, ref: refCode })

    function updateRefLink() {
        const link = `${window.location.origin}?ref=${myPhone}`;
        document.getElementById('ref-link').value = link;
    }

    function copyRef() {
        const el = document.getElementById("ref-link");
        el.select();
        document.execCommand("copy");
        alert("Lyen paraj kopye! Voye l bay zanmi w.");
    }
    
    // Rele updateRefLink() andedan socket.on('gameStart') oswa apre login siksè.
</script>
