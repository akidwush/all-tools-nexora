/* Generator pack — extracted from index.html v3. Classic script; keep execution order. */

/* ===== original script 15: nxGenPack ===== */
// Nexus generator pack: Windows Quotes (2 style), IQC (3 style), Nokia Message
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
function renderIqc2(body) {
    var iqcStyle = 'operator';
    var selectedProvider = 'Axis';
    var uploadedUrl = null;
    var lastUrl = '';
    var blobUrl = '';
    var lastMode = '';
    body.innerHTML = `
        <h2><i class="fas fa-image"></i> IQC Generator</h2>
        <label>Pilih Style:</label>
        <div class="provider-buttons" id="iqc2StyleBtns" style="margin-bottom:12px;">
            <button class="provider-btn active" data-style="operator"><i class="fas fa-signal"></i> Operator</button>
            <button class="provider-btn" data-style="image"><i class="fas fa-camera"></i> Image</button>
            <button class="provider-btn" data-style="dark"><i class="fas fa-moon"></i> Dark</button>
        </div>
        <label>Pesan:</label>
        <input type="text" id="iqc2Text" class="v-input" value="Hai">
        <div id="iqc2OpFields">
            <label>Pilih Operator:</label>
            <div class="provider-buttons" id="iqc2ProvBtns">
                <button class="provider-btn active" data-prov="Axis">Axis</button>
                <button class="provider-btn" data-prov="Telkomsel">Telkomsel</button>
                <button class="provider-btn" data-prov="Indosat">Indosat</button>
                <button class="provider-btn" data-prov="XL">XL</button>
                <button class="provider-btn" data-prov="Three">Three</button>
                <button class="provider-btn" data-prov="Smartfren">Smartfren</button>
            </div>
            <div style="display:flex;gap:12px;">
                <div style="flex:1;"><label>Jam:</label><input type="number" id="iqc2Jam" class="v-input" value="12" min="0" max="23"></div>
                <div style="flex:1;"><label>Baterai (%):</label><input type="number" id="iqc2Bat" class="v-input" value="65" min="0" max="100"></div>
            </div>
        </div>
        <div id="iqc2DarkFields" style="display:none;">
            <div id="iqc2UploadWrap">
                <label>Foto (opsional):</label>
                <input type="file" id="iqc2File" accept="image/*" class="v-input" style="padding:10px;">
                <div id="iqc2UpStatus" style="font-size:12px;color:#8b7ab8;margin:4px 0 10px;"></div>
            </div>
            <label>Jam (contoh 01.27):</label>
            <input type="text" id="iqc2Time" class="v-input" value="01.27">
        </div>
        <button class="v-btn" id="iqc2GenBtn"><i class="fas fa-bolt"></i> Generate</button>
        <div id="iqc2ResultDiv" style="display:none;">
            <div class="iqc-preview" id="iqc2PreviewBox"></div>
            <div class="btn-group" style="margin-top:10px;">
                <button class="v-btn" id="iqc2DlBtn"><i class="fas fa-download"></i> Download PNG</button>
                <button class="v-btn" id="iqc2CopyBtn"><i class="fas fa-copy"></i> Copy URL</button>
            </div>
        </div>`;
    function setStyle(s) {
        iqcStyle = s;
        document.getElementById('iqc2OpFields').style.display = (s === 'operator') ? '' : 'none';
        document.getElementById('iqc2DarkFields').style.display = (s === 'operator') ? 'none' : '';
        document.getElementById('iqc2UploadWrap').style.display = (s === 'image') ? '' : 'none';
    }
    body.querySelectorAll('#iqc2StyleBtns .provider-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            body.querySelectorAll('#iqc2StyleBtns .provider-btn').forEach(function(b) { b.classList.remove('active'); });
            this.classList.add('active');
            setStyle(this.dataset.style);
        });
    });
    setStyle('operator');
    body.querySelectorAll('#iqc2ProvBtns .provider-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            body.querySelectorAll('#iqc2ProvBtns .provider-btn').forEach(function(b) { b.classList.remove('active'); });
            this.classList.add('active');
            selectedProvider = this.dataset.prov;
        });
    });
    document.getElementById('iqc2File').onchange = async function() {
        var file = this.files[0];
        var st = document.getElementById('iqc2UpStatus');
        if (!file) return;
        st.style.color = '#8b7ab8';
        st.textContent = 'Mengupload foto...';
        try {
            var fd = new FormData();
            fd.append('files[]', file);
            var res = await window.NexoraFetch('https://api.nexadev.my.id/uploder/', { method: 'POST', body: fd });
            var data = await res.json();
            if (data.success && data.files && data.files[0] && data.files[0].url) {
                uploadedUrl = data.files[0].url;
                st.style.color = '#4ade80';
                st.textContent = 'Upload berhasil ✓';
            } else { throw new Error('Upload gagal'); }
        } catch (e) {
            uploadedUrl = null;
            st.style.color = '#ef4444';
            st.textContent = 'Upload gagal — coba lagi.';
        }
    };
    document.getElementById('iqc2GenBtn').onclick = async function() {
        var text = document.getElementById('iqc2Text').value.trim() || 'Hai';
        if (iqcStyle === 'operator') {
            var jam = document.getElementById('iqc2Jam').value || '12';
            var bat = document.getElementById('iqc2Bat').value || '65';
            var resDiv = document.getElementById('iqc2ResultDiv');
            var preview = document.getElementById('iqc2PreviewBox');
            resDiv.style.display = 'block';
            preview.innerHTML = '<div style="color:#8b7ab8;padding:26px;text-align:center;"><i class="fas fa-spinner fa-spin" style="font-size:26px;"></i><br>Menggambar...</div>';
            try {
                lastUrl = 'https://api.nexray.eu.cc/maker/v1/iqc?text=' + encodeURIComponent(text) + '&provider=' + encodeURIComponent(selectedProvider) + '&jam=' + jam + '&baterai=' + bat;
                var result = await nxFetchBlobWithBackup('nexray', nxBackupSources('Nexray', lastUrl));
                if (blobUrl) URL.revokeObjectURL(blobUrl);
                blobUrl = URL.createObjectURL(result.blob);
                lastMode = 'blob';
                preview.innerHTML = '<img src="' + blobUrl + '" alt="IQC Result" style="width:100%;border-radius:12px;">';
            } catch (e) {
                preview.innerHTML = '<div style="color:#ef4444;padding:20px;text-align:center;"><i class="fas fa-exclamation-circle"></i> Gagal: ' + e.message + '</div>';
            }
        } else {
            var time = document.getElementById('iqc2Time').value.trim() || '01.27';
            lastUrl = 'https://apii.nexadev.my.id/iqc-dark?text=' + encodeURIComponent(text) + '&time=' + encodeURIComponent(time);
            if (iqcStyle === 'image') { lastUrl += '&url=' + encodeURIComponent(uploadedUrl || ''); }
            lastMode = 'url';
            nxGenShow('iqc2', lastUrl);
        }
    };
    document.getElementById('iqc2DlBtn').onclick = function() {
        if (lastMode === 'blob' && blobUrl) {
            var a = document.createElement('a');
            a.href = blobUrl;
            a.download = 'IQC_' + Date.now() + '.png';
            a.click();
        } else { nxGenDownload(lastUrl, 'IQC'); }
    };
    document.getElementById('iqc2CopyBtn').onclick = function() { nxGenCopy(lastUrl); };
}

// Route the universal tool rooms (and legacy viewer) to the new renderers
window.renderWinquotes = renderWinquotes2;
window.renderIqc = renderIqc2;
