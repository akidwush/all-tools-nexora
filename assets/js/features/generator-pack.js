/* Generator pack — extracted from index.html v3. Classic script; keep execution order. */

/* ===== original script 15: nxGenPack ===== */
// Nexora generator pack: Windows Quotes (2 style), IQC (3 style), Nokia Message
function nxGenShow(prefix, url) {
    var resDiv = document.getElementById(prefix + 'ResultDiv');
    var preview = document.getElementById(prefix + 'PreviewBox');
    resDiv.style.display = 'block';
    preview.innerHTML = '<div style="color:#8b7ab8;padding:26px;text-align:center;"><i class="fas fa-spinner fa-spin" style="font-size:26px;"></i><br>Menggambar...</div>';
    var img = new Image();
    img.onload = function() {
        preview.innerHTML = '';
        img.alt = 'Hasil generate';
        img.style.width = '100%';
        img.style.borderRadius = '12px';
        preview.appendChild(img);
    };
    img.onerror = function() {
        preview.innerHTML = '<div style="color:#ef4444;padding:20px;text-align:center;"><i class="fas fa-exclamation-circle"></i> Gagal generate. Cek input / koneksi lalu coba lagi.</div>';
    };
    img.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + '_t=' + Date.now();
}
async function nxGenDownload(url, name) {
    if (!url) return;
    try {
        var res = await window.NexoraFetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var blob = await res.blob();
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name + '_' + Date.now() + '.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } catch (e) {
        window.open(url, '_blank');
    }
}
function nxGenCopy(url) {
    if (!url) return;
    navigator.clipboard.writeText(url).then(function() { alert('URL disalin!'); }).catch(function() { alert('Gagal menyalin.'); });
}

// ── WINDOWS QUOTES (2 STYLE) ──
function renderWinquotes2(body) {
    var wqStyle = '1';
    var wq2Url = '';
    body.innerHTML = `
        <h2><i class="fa-brands fa-windows"></i> Windows Quotes</h2>
        <label>Pilih Style:</label>
        <div class="provider-buttons" id="wq2StyleBtns" style="margin-bottom:12px;">
            <button class="provider-btn active" data-style="1"><i class="fa-brands fa-windows"></i> Style 1</button>
            <button class="provider-btn" data-style="2"><i class="fa-brands fa-windows"></i> Style 2</button>
        </div>
        <label>Teks (pisahkan baris dengan tanda | ):</label>
        <input type="text" id="wq2Text" class="v-input" value="ngapain cemburu|kan|cuman sebatas|teman">
        <button class="v-btn" id="wq2GenBtn"><i class="fas fa-bolt"></i> Generate</button>
        <div id="wq2ResultDiv" style="display:none;">
            <div class="iqc-preview" id="wq2PreviewBox"></div>
            <div class="btn-group" style="margin-top:10px;">
                <button class="v-btn" id="wq2DlBtn"><i class="fas fa-download"></i> Download PNG</button>
                <button class="v-btn" id="wq2CopyBtn"><i class="fas fa-copy"></i> Copy URL</button>
            </div>
        </div>`;
    body.querySelectorAll('#wq2StyleBtns .provider-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            body.querySelectorAll('#wq2StyleBtns .provider-btn').forEach(function(b) { b.classList.remove('active'); });
            this.classList.add('active');
            wqStyle = this.dataset.style;
        });
    });
    document.getElementById('wq2GenBtn').onclick = function() {
        var text = document.getElementById('wq2Text').value.trim();
        if (!text) { alert('Isi teks dulu!'); return; }
        wq2Url = 'https://apii.nexadev.my.id/wmp' + wqStyle + '?text=' + encodeURIComponent(text);
        nxGenShow('wq2', wq2Url);
    };
    document.getElementById('wq2DlBtn').onclick = function() { nxGenDownload(wq2Url, 'WindowsQuote'); };
    document.getElementById('wq2CopyBtn').onclick = function() { nxGenCopy(wq2Url); };
}

// ── NOKIA MESSAGE ──
function renderNokiaMsg(body) {
    var now = new Date();
    var defDate = String(now.getDate()).padStart(2, '0') + '/' + String(now.getMonth() + 1).padStart(2, '0') + '/' + now.getFullYear();
    var defTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    var nokiaUrl = '';
    body.innerHTML = `
        <h2><i class="fas fa-mobile-retro"></i> Nokia Message</h2>
        <label>Pesan:</label>
        <input type="text" id="nokiaText" class="v-input" value="kata-kata hari ini">
        <div style="display:flex;gap:12px;">
            <div style="flex:1;"><label>Dari:</label><input type="text" id="nokiaFrom" class="v-input" value="Dika"></div>
            <div style="flex:1;"><label>Judul:</label><input type="text" id="nokiaTitle" class="v-input" value="Pesan"></div>
        </div>
        <div style="display:flex;gap:12px;">
            <div style="flex:1;"><label>Tanggal:</label><input type="text" id="nokiaDate" class="v-input" value="${defDate}"></div>
            <div style="flex:1;"><label>Jam:</label><input type="text" id="nokiaTime" class="v-input" value="${defTime}"></div>
        </div>
        <button class="v-btn" id="nokiaGenBtn"><i class="fas fa-bolt"></i> Generate</button>
        <div id="nokiaResultDiv" style="display:none;">
            <div class="iqc-preview" id="nokiaPreviewBox"></div>
            <div class="btn-group" style="margin-top:10px;">
                <button class="v-btn" id="nokiaDlBtn"><i class="fas fa-download"></i> Download PNG</button>
                <button class="v-btn" id="nokiaCopyBtn"><i class="fas fa-copy"></i> Copy URL</button>
            </div>
        </div>`;
    document.getElementById('nokiaGenBtn').onclick = function() {
        var text = document.getElementById('nokiaText').value.trim();
        if (!text) { alert('Isi pesan dulu!'); return; }
        var from = document.getElementById('nokiaFrom').value.trim();
        var title = document.getElementById('nokiaTitle').value.trim();
        var date = document.getElementById('nokiaDate').value.trim();
        var time = document.getElementById('nokiaTime').value.trim();
        nokiaUrl = 'https://apii.nexadev.my.id/nokia?text=' + encodeURIComponent(text) + '&from=' + encodeURIComponent(from) + '&date=' + encodeURIComponent(date) + '&time=' + encodeURIComponent(time) + '&title=' + encodeURIComponent(title);
        nxGenShow('nokia', nokiaUrl);
    };
    document.getElementById('nokiaDlBtn').onclick = function() { nxGenDownload(nokiaUrl, 'NokiaMessage'); };
    document.getElementById('nokiaCopyBtn').onclick = function() { nxGenCopy(nokiaUrl); };
}

// ── IQC GENERATOR (3 STYLE: Operator / Image / Dark) ──

// Route the universal tool rooms (and legacy viewer) to the new renderers
window.renderWinquotes = renderWinquotes2;
