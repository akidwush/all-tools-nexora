/* Nexora application core — eager. */
// script.js
async function getUserInfo() {
    const countryEl = document.getElementById('userCountry');
    const COUNTRY_CACHE_KEY = 'nexus_country_cache_v2';
    const COUNTRY_CACHE_AGE = 6 * 60 * 60 * 1000;

    function countryNameFromCode(code) {
        if (!code) return '';
        const normalized = String(code).trim().toUpperCase();
        try {
            if (typeof Intl.DisplayNames === 'function') {
                return new Intl.DisplayNames(['id'], { type: 'region' }).of(normalized) || normalized;
            }
        } catch (e) {}
        return normalized;
    }

    function countryFlag(code) {
        const normalized = String(code || '').trim().toUpperCase();
        if (!/^[A-Z]{2}$/.test(normalized)) return '';
        return String.fromCodePoint(...Array.from(normalized).map(char => 127397 + char.charCodeAt(0)));
    }

    function showCountry(name, code, source) {
        if (!countryEl || !name) return false;
        const flag = countryFlag(code);
        countryEl.textContent = (flag ? flag + ' ' : '') + name;
        countryEl.dataset.countryCode = code || '';
        countryEl.dataset.countrySource = source || '';
        countryEl.title = source ? 'Sumber deteksi: ' + source : '';
        return true;
    }

    function readCountryCache() {
        try {
            const cached = JSON.parse(localStorage.getItem(COUNTRY_CACHE_KEY) || 'null');
            if (cached && cached.name && Date.now() - Number(cached.time || 0) < COUNTRY_CACHE_AGE) {
                return cached;
            }
        } catch (e) {}
        return null;
    }

    function saveCountryCache(name, code) {
        try {
            localStorage.setItem(COUNTRY_CACHE_KEY, JSON.stringify({ name, code, time: Date.now() }));
        } catch (e) {}
    }

    function deviceCountryFallback() {
        let code = '';
        try {
            const locale = String(navigator.language || (navigator.languages && navigator.languages[0]) || '');
            const match = locale.match(/[-_]([A-Za-z]{2})$/);
            if (match) code = match[1].toUpperCase();
        } catch (e) {}

        if (!code) {
            try {
                const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
                const timezoneCountry = {
                    'Asia/Jakarta':'ID','Asia/Makassar':'ID','Asia/Jayapura':'ID','Asia/Pontianak':'ID',
                    'Asia/Kuala_Lumpur':'MY','Asia/Singapore':'SG','Asia/Bangkok':'TH','Asia/Manila':'PH',
                    'Asia/Tokyo':'JP','Asia/Seoul':'KR','Asia/Shanghai':'CN','Asia/Hong_Kong':'HK',
                    'Asia/Kolkata':'IN','Asia/Dubai':'AE','Europe/London':'GB','Europe/Paris':'FR',
                    'America/New_York':'US','America/Chicago':'US','America/Denver':'US','America/Los_Angeles':'US',
                    'Australia/Sydney':'AU','Pacific/Auckland':'NZ'
                };
                code = timezoneCountry[zone] || '';
            } catch (e) {}
        }

        return code ? { code, name: countryNameFromCode(code) } : null;
    }

    async function fetchJsonWithTimeout(url, timeoutMs) {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
        try {
            const response = await window.NexoraFetch(url, {
                method: 'GET',
                mode: 'cors',
                cache: 'no-store',
                credentials: 'omit',
                headers: { 'Accept': 'application/json' },
                signal: controller ? controller.signal : undefined
            });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return await response.json();
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    async function detectCountry() {
        const cached = readCountryCache();
        if (cached) showCountry(cached.name, cached.code, 'cache');
        else if (countryEl) countryEl.textContent = 'Mendeteksi...';

        const providers = [
            {
                name: 'ipwho.is',
                url: 'https://ipwho.is/?fields=success,country,country_code',
                parse: data => data && data.success !== false && data.country
                    ? { name: data.country, code: data.country_code || '' } : null
            },
            {
                name: 'ipapi.co',
                url: 'https://ipapi.co/json/',
                parse: data => data && !data.error && (data.country_name || data.country)
                    ? { name: data.country_name || countryNameFromCode(data.country), code: data.country_code || data.country || '' } : null
            },
            {
                name: 'country.is',
                url: 'https://api.country.is/',
                parse: data => data && data.country
                    ? { name: countryNameFromCode(data.country), code: data.country } : null
            }
        ];

        for (const provider of providers) {
            try {
                const data = await fetchJsonWithTimeout(provider.url, 5500);
                const result = provider.parse(data);
                if (result && result.name) {
                    saveCountryCache(result.name, result.code);
                    showCountry(result.name, result.code, provider.name);
                    return true;
                }
            } catch (e) {
                console.warn('[Nexus Country] ' + provider.name + ' gagal:', e && e.message ? e.message : e);
            }
        }

        if (cached) return true;
        const fallback = deviceCountryFallback();
        if (fallback) {
            showCountry(fallback.name, fallback.code, 'perkiraan perangkat');
            return true;
        }
        if (countryEl) {
            countryEl.textContent = 'Tidak terdeteksi';
            countryEl.title = 'Pastikan koneksi internet aktif dan pemblokir pelacak tidak memblokir layanan geolokasi IP.';
        }
        return false;
    }

    await detectCountry();
    window.addEventListener('online', function nexusRetryCountryOnce() {
        try { localStorage.removeItem(COUNTRY_CACHE_KEY); } catch (e) {}
        detectCountry();
    }, { once: true });

    const ua = navigator.userAgent;
    let device = 'Desktop';
    let brand = '';
    if (/iPhone/i.test(ua)) { device = 'Mobile'; brand = 'iPhone'; }
    else if (/iPad/i.test(ua)) { device = 'Tablet'; brand = 'iPad'; }
    else if (/Samsung|SM-|Galaxy/i.test(ua)) { device = 'Mobile'; brand = 'Samsung'; }
    else if (/Xiaomi|Redmi|POCO/i.test(ua)) { device = 'Mobile'; brand = 'Xiaomi'; }
    else if (/Oppo|Realme|OnePlus/i.test(ua)) { device = 'Mobile'; brand = 'Oppo'; }
    else if (/Vivo|iQOO/i.test(ua)) { device = 'Mobile'; brand = 'Vivo'; }
    else if (/Google Pixel/i.test(ua)) { device = 'Mobile'; brand = 'Google Pixel'; }
    else if (/Nokia/i.test(ua)) { device = 'Mobile'; brand = 'Nokia'; }
    else if (/Huawei|Honor/i.test(ua)) { device = 'Mobile'; brand = 'Huawei'; }
    else if (/ASUS|ZenFone|ROG/i.test(ua)) { device = 'Mobile'; brand = 'ASUS'; }
    else if (/Lenovo|Moto/i.test(ua)) { device = 'Mobile'; brand = 'Lenovo'; }
    else if (/Android/i.test(ua)) { device = 'Mobile'; brand = 'Android'; }
    document.getElementById('userDevice').textContent = brand ? `${brand}` : device;

    let browser = 'Unknown';
    if (ua.includes('Chrome') && !ua.includes('Edg') && !ua.includes('OPR')) browser = 'Chrome';
    else if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Safari') && !ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Safari';
    else if (ua.includes('Edg')) browser = 'Edge';
    else if (ua.includes('Opera') || ua.includes('OPR')) browser = 'Opera';
    else if (ua.includes('UCBrowser')) browser = 'UC Browser';
    else if (ua.includes('SamsungBrowser')) browser = 'Samsung Internet';
    document.getElementById('userBrowser').textContent = browser;
    document.getElementById('userStatus').textContent = '● Online';

    if (navigator.getBattery) {
        try {
            const battery = await navigator.getBattery();
            const level = Math.round(battery.level * 100);
            document.getElementById('batteryFill').style.width = level + '%';
            document.getElementById('batteryPercent').textContent = level + '%';
        } catch {}
    }
}
getUserInfo();



const apiStatusChecks = [
    {
        id:'tikwm', name:'TikWM',
        hosts:['tikwm.com','www.tikwm.com'], tools:[]
    },
    {
        id:'nexray', name:'NexRay',
        hosts:['api.nexray.eu.cc'],
        tools:['iqc','fakedana','fakelobby','fakebankjago']
    },
    {
        id:'siputzx', name:'Siputzx',
        hosts:['api.siputzx.my.id'], tools:['brat','sertifikat']
    },
    {
        id:'ikyyxd', name:'IkyyXD',
        hosts:['api.ikyyxd.my.id'], tools:['fakedev']
    },
    {
        id:'nanzz', name:'Nanzz',
        hosts:['api-nanzz.my.id'],
        tools:['tanyaustadz','removebg']
    },
    {
        id:'qrserver', name:'QR Server',
        hosts:['api.qrserver.com'], tools:['qrgen']
    },
    {
        id:'mangadex', name:'MangaDex',
        hosts:['api.mangadex.org','uploads.mangadex.org'],
        tools:['comicreader']
    },
    {
        id:'vercel', name:'Vercel',
        hosts:['api.vercel.com','api.netlify.com'], tools:['vdeploy']
    },
    {
        id:'nexusai', name:'Nexus AI',
        hosts:[], tools:['nexusai']
    },
    {
        id:'groqfact', name:'Groq CariFakta',
        hosts:['api.groq.com'], tools:['carifakta']
    },
    {
        id:'corsbridge', name:'CORS Bridge',
        hosts:['api.allorigins.win','corsproxy.io','test.cors.workers.dev'],
        tools:['getcode']
    },
    {
        id:'mltoolsapi', name:'ML Tools API',
        hosts:['kyzznekoo.zone.id','api.nexray.eu.cc'],
        tools:['mltools']
    }
];

const apiStatusCache = Object.create(null);
const apiLastRequest = Object.create(null);
const toolApiMap = Object.fromEntries(
    apiStatusChecks.flatMap(api =>
        (api.tools || []).map(toolId => [toolId, api.id])
    )
);

const nxTrackedNativeFetch = window.fetch.bind(window);

function nxApiStateLabel(state) {
    return ({
        idle:'Belum diuji',
        checking:'Memeriksa',
        ok:'Aktif',
        warn:'Merespons',
        err:'Gagal'
    })[state] || state;
}

function nxDecodeProxyTarget(rawUrl) {
    try {
        const url = new URL(rawUrl, location.href);

        if (
            url.hostname === 'api.allorigins.win' &&
            url.searchParams.get('url')
        ) {
            return decodeURIComponent(url.searchParams.get('url'));
        }

        if (url.hostname === 'corsproxy.io') {
            const target = url.searchParams.get('url');

            if (target) return decodeURIComponent(target);

            const query = url.search.slice(1);

            if (/^https?%3A/i.test(query)) return decodeURIComponent(query);
            if (/^https?:/i.test(query)) return query;
        }

        if (url.hostname === 'cors.isomorphic-git.org') {
            const path = url.pathname.replace(/^\/+/,'');

            if (/^https?:\/\//i.test(path)) {
                return path + url.search;
            }
        }

        return url.href;
    } catch (error) {
        return String(rawUrl || '');
    }
}

function nxRequestUrl(input) {
    if (typeof input === 'string') return input;
    if (input && typeof input.url === 'string') return input.url;
    return '';
}

function nxApiForUrl(rawUrl) {
    const decoded = nxDecodeProxyTarget(rawUrl);

    try {
        const parsed = new URL(decoded, location.href);
        const host = parsed.hostname.toLowerCase();

        return apiStatusChecks.find(api =>
            (api.hosts || []).some(candidate =>
                host === candidate || host.endsWith('.' + candidate)
            )
        ) || null;
    } catch (error) {
        return null;
    }
}

function nxLoadApiCache() {
    try {
        const saved = JSON.parse(
            sessionStorage.getItem('nxInlineApiStatus') || '{}'
        );

        Object.keys(saved).forEach(id => {
            const item = saved[id];

            if (
                item &&
                item.at &&
                Date.now() - item.at < 15 * 60 * 1000
            ) {
                apiStatusCache[id] = item;
            }
        });
    } catch (error) {}
}

function nxSaveApiCache() {
    try {
        sessionStorage.setItem(
            'nxInlineApiStatus',
            JSON.stringify(apiStatusCache)
        );
    } catch (error) {}
}

function getApiById(apiId) {
    return apiStatusChecks.find(api => api.id === apiId);
}

function updateInlineApiStatus(apiId, state, detail) {
    document.querySelectorAll(
        `[data-api-inline="${apiId}"]`
    ).forEach(node => {
        node.classList.remove(
            'idle','checking','ok','warn','err'
        );
        node.classList.add(state);

        const desc = node.querySelector('[data-api-desc]');
        if (desc) desc.textContent = detail;

        const label = node.querySelector('[data-api-state]');
        if (label) label.textContent = nxApiStateLabel(state);
    });
}

function setApiStatus(api, state, detail, meta) {
    if (!api) return;

    apiStatusCache[api.id] = {
        state:state,
        detail:detail,
        at:Date.now(),
        status:meta && meta.status || 0,
        ms:meta && meta.ms || 0
    };

    nxSaveApiCache();
    updateInlineApiStatus(api.id, state, detail);
}

function nxResultState(response) {
    if (response.ok) return 'ok';
    if (response.status >= 400 && response.status < 500) return 'warn';
    return 'err';
}

function nxResultDetail(response, ms) {
    if (response.ok) {
        return 'Aktif · ' + ms + ' ms';
    }

    if (response.status >= 400 && response.status < 500) {
        return 'Merespons HTTP ' + response.status + ' · ' + ms + ' ms';
    }

    return 'Gagal HTTP ' + (response.status || '?') + ' · ' + ms + ' ms';
}

window.fetch = async function(input, init) {
    const rawUrl = nxRequestUrl(input);
    const api = nxApiForUrl(rawUrl);

    if (!api) {
        return nxTrackedNativeFetch(input, init);
    }

    const started = performance.now();
    const method = String(
        init && init.method ||
        input && input.method ||
        'GET'
    ).toUpperCase();

    apiLastRequest[api.id] = {
        url:rawUrl,
        method:method,
        at:Date.now()
    };

    setApiStatus(api, 'checking', 'Memeriksa API…');

    try {
        const response = await nxTrackedNativeFetch(input, init);
        const ms = Math.max(
            1,
            Math.round(performance.now() - started)
        );
        const state = nxResultState(response);

        setApiStatus(
            api,
            state,
            nxResultDetail(response, ms),
            {
                status:response.status,
                ms:ms
            }
        );

        return response;
    } catch (error) {
        const aborted = error && error.name === 'AbortError';

        setApiStatus(
            api,
            aborted ? 'warn' : 'err',
            aborted
                ? 'Dibatalkan / timeout'
                : 'Gagal jaringan'
        );

        throw error;
    }
};

async function probeApi(api) {
    const last = apiLastRequest[api.id];

    if (!last || last.method !== 'GET') {
        setApiStatus(
            api,
            'idle',
            'Belum diuji · jalankan fitur'
        );
        return null;
    }

    setApiStatus(api, 'checking', 'Mengulang request…');
    const started = performance.now();

    try {
        const response = await nxTrackedNativeFetch(last.url, {
            method:'GET',
            cache:'no-store'
        });

        const ms = Math.max(
            1,
            Math.round(performance.now() - started)
        );

        const state = nxResultState(response);

        setApiStatus(
            api,
            state,
            nxResultDetail(response, ms),
            {
                status:response.status,
                ms:ms
            }
        );

        return state === 'ok' || state === 'warn';
    } catch (error) {
        setApiStatus(
            api,
            error && error.name === 'AbortError' ? 'warn' : 'err',
            error && error.name === 'AbortError'
                ? 'Dibatalkan / timeout'
                : 'Gagal jaringan'
        );

        return false;
    }
}

function apiInlineTemplate(apiId) {
    const api = getApiById(apiId);

    if (!api) return '';

    const cached = apiStatusCache[api.id];
    const state = cached ? cached.state : 'idle';
    const detail = cached
        ? cached.detail
        : 'Belum diuji · jalankan fitur';

    return `
        <div class="tool-api-line ${state}"
            data-api-inline="${api.id}">
            <span class="tool-api-dot"></span>

            <div class="tool-api-copy">
                <b>
                    ${api.name} API ·
                    <span data-api-state>
                        ${nxApiStateLabel(state)}
                    </span>
                </b>

                <span data-api-desc>${detail}</span>
            </div>

            <button class="tool-api-refresh"
                type="button"
                data-api-refresh="${api.id}"
                title="Tes ulang request API terakhir">
                <i class="fas fa-rotate"></i>
            </button>
        </div>
    `;
}

function refreshInlineApi(apiId) {
    const cached = apiStatusCache[apiId];

    if (cached) {
        updateInlineApiStatus(
            apiId,
            cached.state,
            cached.detail
        );
    } else {
        updateInlineApiStatus(
            apiId,
            'idle',
            'Belum diuji · jalankan fitur'
        );
    }
}

function mountToolApiStatus(body, toolId) {
    const mapped = toolApiMap[toolId];

    if (!mapped || body.querySelector('[data-api-inline]')) {
        return;
    }

    const apiIds = Array.isArray(mapped)
        ? mapped
        : [mapped];

    const wrapper = document.createElement('div');
    wrapper.className = 'nx-tool-api-status-group';
    wrapper.innerHTML = apiIds
        .map(apiInlineTemplate)
        .join('');

    const title =
        body.querySelector('.nx-source-intro h2') ||
        body.querySelector('h2') ||
        body.querySelector('h1');

    if (title) {
        const intro = title.closest('.nx-source-intro');

        if (intro) {
            intro.insertAdjacentElement('afterend', wrapper);
        } else {
            title.insertAdjacentElement('afterend', wrapper);
        }
    } else {
        body.prepend(wrapper);
    }

    apiIds.forEach(refreshInlineApi);
}

document.addEventListener('click', function(event) {
    const refresh = event.target.closest('[data-api-refresh]');

    if (!refresh) return;

    const api = getApiById(refresh.dataset.apiRefresh);

    if (api) probeApi(api);
});

document.addEventListener('load', function(event) {
    const target = event.target;

    if (!target || !target.src) return;

    const api = nxApiForUrl(target.src);

    if (api) {
        setApiStatus(api, 'ok', 'Resource aktif');
    }
}, true);

document.addEventListener('error', function(event) {
    const target = event.target;

    if (!target || !target.src) return;

    const api = nxApiForUrl(target.src);

    if (api) {
        setApiStatus(api, 'err', 'Resource gagal dimuat');
    }
}, true);

window.addEventListener('message', function(event) {
    const data = event.data;

    if (!data || data.type !== 'nx-api-status') return;
    const sourceFrame = document.querySelector('.nx-imported-frame');
    if (!sourceFrame || event.source !== sourceFrame.contentWindow) return;

    const api = getApiById(data.provider);

    if (!api) return;

    const allowed = [
        'idle','checking','ok','warn','err'
    ];

    const state = allowed.includes(data.state)
        ? data.state
        : 'idle';

    setApiStatus(
        api,
        state,
        String(data.detail || nxApiStateLabel(state))
    );
});

nxLoadApiCache();


function nxProxyUrl(url) {
    return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url);
}

function nxBackupSources(primaryName, primaryUrl, extras) {
    const list = [{ name: primaryName || 'Primary', url: primaryUrl }];
    (extras || []).forEach(item => list.push(typeof item === 'string' ? { name: 'Backup', url: item } : item));
    list.push({ name: 'Proxy Backup', url: nxProxyUrl(primaryUrl) });
    return list;
}

async function nxFetchJsonWithBackup(apiId, sources, options) {
    const api = getApiById(apiId);
    let lastError = null;
    for (const source of sources) {
        try {
            const res = await window.NexoraFetch(source.url, options || {});
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            if (api) setApiStatus(api, 'ok', 'Online via ' + source.name);
            return { data, source };
        } catch (e) {
            lastError = e;
        }
    }
    if (api) setApiStatus(api, 'err', 'Semua API gagal');
    throw lastError || new Error('Semua API gagal');
}

async function nxFetchBlobWithBackup(apiId, sources, options) {
    const api = getApiById(apiId);
    let lastError = null;
    for (const source of sources) {
        try {
            const res = await window.NexoraFetch(source.url, options || {});
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const blob = await res.blob();
            if (api) setApiStatus(api, 'ok', 'Online via ' + source.name);
            return { blob, source };
        } catch (e) {
            lastError = e;
        }
    }
    if (api) setApiStatus(api, 'err', 'Semua API gagal');
    throw lastError || new Error('Semua API gagal');
}

function nxFindMediaUrl(data) {
    if (!data) return null;
    if (typeof data === 'string') {
        const s = data.trim();
        if (/^(https?:\/\/|blob:|data:image\/)/i.test(s)) return s;
        if (s.length > 180 && /^[a-z0-9+/=\s]+$/i.test(s)) return 'data:image/png;base64,' + s.replace(/\s+/g, '');
        return null;
    }
    if (Array.isArray(data)) {
        for (const item of data) {
            const found = nxFindMediaUrl(item);
            if (found) return found;
        }
        return null;
    }
    if (typeof data === 'object') {
        const keys = ['url','image','img','result','data','link','download','downloadUrl','file','output','buffer','base64','base64Image'];
        for (const key of keys) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                const found = nxFindMediaUrl(data[key]);
                if (found) return found;
            }
        }
        for (const key of Object.keys(data)) {
            const found = nxFindMediaUrl(data[key]);
            if (found) return found;
        }
    }
    return null;
}

async function nxImageFromResponse(res) {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('json')) {
        const data = await res.json();
        const link = nxFindMediaUrl(data);
        if (link) return link;
        throw new Error(data.message || data.error || 'Link gambar tidak ditemukan');
    }
    if (ct.includes('text') || ct.includes('html')) {
        const text = await res.text();
        try {
            const link = nxFindMediaUrl(JSON.parse(text));
            if (link) return link;
        } catch {}
        throw new Error('Response bukan gambar');
    }
    const blob = await res.blob();
    if (!blob || blob.size < 20) throw new Error('Gambar kosong');
    if (blob.type && /json|text|html/i.test(blob.type)) {
        const text = await blob.text();
        try {
            const link = nxFindMediaUrl(JSON.parse(text));
            if (link) return link;
        } catch {}
        throw new Error('Response bukan gambar');
    }
    return URL.createObjectURL(blob);
}

async function nxFetchImageWithBackup(apiId, sources, options) {
    const api = getApiById(apiId);
    let lastError = null;
    for (const source of sources) {
        try {
            const res = await window.NexoraFetch(source.url, options || {});
            const img = await nxImageFromResponse(res);
            if (api) setApiStatus(api, 'ok', 'Online via ' + source.name);
            return { img, source };
        } catch (e) {
            lastError = e;
        }
    }
    if (api) setApiStatus(api, 'err', 'API gagal, pakai fallback');
    throw lastError || new Error('Semua API gagal');
}

async function nxPostImageFile(apiId, endpoints, file, options) {
    const fields = ['file', 'image', 'image_file', 'img'];
    const config = options || {};
    const timeoutMs = Math.max(3000, Math.min(20000, Number(config.timeoutMs) || 10000));
    const maxAttempts = Math.max(1, Math.min(endpoints.length * fields.length, Number(config.maxAttempts) || 8));
    let attempts = 0;
    let lastError = null;
    for (const endpoint of endpoints) {
        for (const field of fields) {
            if (attempts >= maxAttempts) break;
            attempts++;
            try {
                const form = new FormData();
                form.append(field, file, file.name || 'image.png');
                const res = await window.NexoraFetch(endpoint, {
                    method: 'POST',
                    body: form,
                    nexoraTimeoutMs: timeoutMs,
                    nexoraRetries: 0
                });
                const img = await nxImageFromResponse(res);
                const api = getApiById(apiId);
                if (api) setApiStatus(api, 'ok', 'Online via Upload');
                return img;
            } catch (e) {
                lastError = e;
            }
        }
        if (attempts >= maxAttempts) break;
    }
    const api = getApiById(apiId);
    if (api) setApiStatus(api, 'err', 'API gagal, fallback lokal diperlukan');
    throw lastError || new Error('Upload API gagal');
}

function nxImageEndpoints(type) {
    const file = type === 'removebg' ? 'removebg.php' : 'enhancer.php';
    const slug = type === 'removebg' ? 'removebg' : 'enhancer';
    return [
        'https://api-nanzz.my.id/docs/api/tools/image/' + file,
        'https://api-nanzz.my.id/docs/api/image/' + file,
        'https://api-nanzz.my.id/api/tools/image/' + slug,
        'https://api-nanzz.my.id/api/image/' + slug
    ];
}

function nxImageUrlSources(type, imageUrl) {
    return nxImageEndpoints(type).map((endpoint, i) => ({
        name: i === 0 ? 'Nanzz' : 'Backup ' + i,
        url: endpoint + '?url=' + encodeURIComponent(imageUrl)
    })).concat([{ name: 'Proxy Backup', url: nxProxyUrl(nxImageEndpoints(type)[0] + '?url=' + encodeURIComponent(imageUrl)) }]);
}

function nxNanzzMakerSources(kind, text) {
    const encoded = encodeURIComponent(text);
    const paths = kind === 'windows-quotes'
        ? [
            'docs/api/maker/windows-quotes.php',
            'docs/api/maker/windows-quotes',
            'api/maker/windows-quotes',
            'api/maker/windowsquotes',
            'maker/windows-quotes'
        ]
        : [
            'docs/api/maker/tanyaustadz.php',
            'docs/api/maker/tanyaustadz',
            'api/maker/tanyaustadz',
            'api/maker/tanya-ustadz',
            'maker/tanyaustadz'
        ];
    const base = 'https://api-nanzz.my.id/';
    const sources = paths.map((path, i) => ({
        name: i === 0 ? 'Nanzz' : 'Backup ' + i,
        url: base + path + '?text=' + encoded
    }));
    sources.push({ name: 'Proxy Backup', url: nxProxyUrl(base + paths[0] + '?text=' + encoded) });
    return sources;
}


async function nxRemoteImageBlob(imageUrl) {
    const clean = imageUrl.trim();
    const noProto = clean.replace(/^https?:\/\//i, '');
    const candidates = [
        clean,
        nxProxyUrl(clean),
        'https://api.allorigins.win/raw?url=' + encodeURIComponent(clean),
        'https://images.weserv.nl/?url=' + encodeURIComponent(noProto)
    ];
    let lastError = null;
    for (const u of candidates) {
        try {
            const res = await window.NexoraFetch(u);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const blob = await res.blob();
            if (blob && blob.size > 20 && (!blob.type || blob.type.startsWith('image/') || blob.type === 'application/octet-stream')) return blob;
        } catch (e) {
            lastError = e;
        }
    }
    throw lastError || new Error('Gagal mengambil gambar');
}

function nxLoadImageFromBlob(blob) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => resolve({ img, url });
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Gagal membaca gambar')); };
        img.src = url;
    });
}

async function nxLoadCanvasImage(file, imageUrl) {
    const blob = file || await nxRemoteImageBlob(imageUrl);
    return nxLoadImageFromBlob(blob);
}

function nxCanvasToUrl(canvas) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (!blob) reject(new Error('Gagal membuat gambar'));
            else resolve(URL.createObjectURL(blob));
        }, 'image/png', 0.96);
    });
}

const NX_LOCAL_ESRGAN_ASSETS = Object.freeze({
    tensorflow: '/assets/vendor/tfjs/tf.min.js',
    tensorflowFallback: 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js',
    upscaler: '/assets/vendor/upscaler/upscaler.min.js',
    upscalerFallback: 'https://cdn.jsdelivr.net/npm/upscaler@1.0.0/dist/browser/umd/upscaler.min.js',
    model: '/assets/vendor/esrgan-slim/x2/model.json',
    modelFallback: 'https://cdn.jsdelivr.net/npm/@upscalerjs/esrgan-slim@1.0.0-beta.10/models/x2/model.json',
    revision: '6318-hf20-image-enhancer1'
});

let nxEsrganReadyPromise = null;
let nxEsrganInstance = null;
let nxEsrganVendorSource = 'pending';
let nxEsrganModelSource = 'pending';
let nxEsrganLastEngine = 'pending';
let nxEsrganLastError = '';

function nxVendorRequestUrl(src) {
    if (!src || !src.startsWith('/')) return src;
    const join = src.includes('?') ? '&' : '?';
    return `${src}${join}nxv=${NX_LOCAL_ESRGAN_ASSETS.revision}`;
}

function nxForgetVendorScript(src) {
    const script = document.querySelector(`script[data-nexora-vendor="${src}"]`);
    if (script && script.parentNode) script.parentNode.removeChild(script);
}

function nxLoadVendorScript(src, ready) {
    if (typeof ready === 'function' && ready()) return Promise.resolve(src);
    const existing = document.querySelector(`script[data-nexora-vendor="${src}"]`);
    if (existing && existing.__nxPromise) return existing.__nxPromise;
    const script = existing || document.createElement('script');
    const requestUrl = nxVendorRequestUrl(src);
    script.src = requestUrl;
    script.async = true;
    script.dataset.nexoraVendor = src;
    if (/^https?:\/\//i.test(requestUrl)) script.crossOrigin = 'anonymous';
    script.__nxPromise = new Promise((resolve, reject) => {
        script.addEventListener('load', () => {
            if (typeof ready !== 'function' || ready()) resolve(src);
            else reject(Object.assign(new Error(`Vendor AI tidak mengekspos API yang diharapkan: ${src}`), { code: 'LOCAL_VENDOR_API_MISSING', vendor: src }));
        }, { once: true });
        script.addEventListener('error', () => reject(Object.assign(new Error(`Aset vendor AI gagal dimuat: ${src}`), { code: 'LOCAL_VENDOR_LOAD_FAILED', vendor: src })), { once: true });
    });
    if (!existing) document.head.appendChild(script);
    return script.__nxPromise;
}

async function nxLoadVendorWithFallback(primary, fallback, ready, label) {
    let primaryError = null;
    try {
        await nxLoadVendorScript(primary, ready);
        return { source: 'local', url: primary };
    } catch (error) {
        primaryError = error;
        nxForgetVendorScript(primary);
    }
    try {
        await nxLoadVendorScript(fallback, ready);
        return { source: 'cdn', url: fallback, primaryError };
    } catch (fallbackError) {
        nxForgetVendorScript(fallback);
        const error = new Error(`${label || 'Vendor AI'} gagal dimuat dari aset lokal dan CDN cadangan.`);
        error.code = 'LOCAL_VENDOR_ALL_SOURCES_FAILED';
        error.primaryError = primaryError;
        error.fallbackError = fallbackError;
        throw error;
    }
}

async function nxProbeEsrganModel(url) {
    const response = await fetch(nxVendorRequestUrl(url), { cache: 'no-store', credentials: 'omit' });
    if (!response.ok) throw new Error(`Model ESRGAN HTTP ${response.status}`);
    const type = String(response.headers.get('content-type') || '').toLowerCase();
    if (type && !type.includes('json') && !type.includes('octet-stream') && !type.includes('text/plain')) {
        throw new Error(`Model ESRGAN memiliki Content-Type tidak valid: ${type}`);
    }
    const model = await response.json();
    if (!model || !model.modelTopology || !Array.isArray(model.weightsManifest)) throw new Error('model.json ESRGAN tidak valid.');
    const paths = model.weightsManifest.flatMap(row => Array.isArray(row.paths) ? row.paths : []);
    if (!paths.length) throw new Error('weightsManifest ESRGAN kosong.');
    return nxVendorRequestUrl(url);
}

async function nxResolveEsrganModelPath() {
    try {
        const path = await nxProbeEsrganModel(NX_LOCAL_ESRGAN_ASSETS.model);
        nxEsrganModelSource = 'local';
        return path;
    } catch (localError) {
        try {
            const path = await nxProbeEsrganModel(NX_LOCAL_ESRGAN_ASSETS.modelFallback);
            nxEsrganModelSource = 'cdn';
            return path;
        } catch (fallbackError) {
            const error = new Error('Model ESRGAN lokal dan CDN cadangan sama-sama tidak tersedia.');
            error.code = 'LOCAL_ESRGAN_MODEL_UNAVAILABLE';
            error.localError = localError;
            error.fallbackError = fallbackError;
            throw error;
        }
    }
}

async function nxEnsureLocalEsrgan() {
    if (nxEsrganInstance) return nxEsrganInstance;
    if (nxEsrganReadyPromise) return nxEsrganReadyPromise;
    nxEsrganReadyPromise = (async () => {
        const tfVendor = await nxLoadVendorWithFallback(
            NX_LOCAL_ESRGAN_ASSETS.tensorflow,
            NX_LOCAL_ESRGAN_ASSETS.tensorflowFallback,
            () => Boolean(window.tf && typeof window.tf.ready === 'function' && typeof window.tf.setBackend === 'function'),
            'TensorFlow.js'
        );
        nxEsrganVendorSource = tfVendor.source;
        await window.tf.setBackend('webgl');
        await window.tf.ready();
        if (window.tf.getBackend() !== 'webgl') {
            throw Object.assign(new Error('WebGL tidak tersedia untuk ESRGAN lokal.'), { code: 'LOCAL_ESRGAN_WEBGL_UNAVAILABLE' });
        }
        const upscalerVendor = await nxLoadVendorWithFallback(
            NX_LOCAL_ESRGAN_ASSETS.upscaler,
            NX_LOCAL_ESRGAN_ASSETS.upscalerFallback,
            () => typeof window.Upscaler === 'function',
            'UpscalerJS'
        );
        if (upscalerVendor.source === 'cdn') nxEsrganVendorSource = 'cdn';
        const modelPath = await nxResolveEsrganModelPath();
        nxEsrganInstance = new window.Upscaler({
            model: {
                scale: 2,
                modelType: 'layers',
                path: modelPath,
                inputRange: [0, 255],
                outputRange: [0, 255]
            }
        });
        return nxEsrganInstance;
    })().catch(error => {
        nxEsrganReadyPromise = null;
        nxEsrganInstance = null;
        throw error;
    });
    return nxEsrganReadyPromise;
}

async function nxObjectUrlFromDataUrl(dataUrl) {
    const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(String(dataUrl || ''));
    if (!match) throw new Error('Hasil ESRGAN tidak dapat dibaca.');
    const mime = match[1] || 'image/png';
    const raw = match[2] ? atob(match[3]) : decodeURIComponent(match[3]);
    const bytes = new Uint8Array(raw.length);
    for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index);
    const blob = new Blob([bytes], { type: mime });
    if (!blob || blob.size < 32) throw new Error('Hasil ESRGAN kosong.');
    return URL.createObjectURL(blob);
}

function nxLoadImageFromUrl(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Hasil ESRGAN tidak dapat dibuka.'));
        img.src = url;
    });
}

async function nxNormalizeExact2x(resultUrl, sourceWidth, sourceHeight) {
    const expectedWidth = Math.max(1, sourceWidth * 2);
    const expectedHeight = Math.max(1, sourceHeight * 2);
    const resultImage = await nxLoadImageFromUrl(resultUrl);
    const resultWidth = resultImage.naturalWidth || resultImage.width;
    const resultHeight = resultImage.naturalHeight || resultImage.height;
    if (resultWidth === expectedWidth && resultHeight === expectedHeight) {
        return resultUrl;
    }
    const canvas = document.createElement('canvas');
    canvas.width = expectedWidth;
    canvas.height = expectedHeight;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(resultImage, 0, 0, expectedWidth, expectedHeight);
    URL.revokeObjectURL(resultUrl);
    return nxCanvasToUrl(canvas);
}

function nxCanvasUpscaleExact2x(img, sourceWidth, sourceHeight) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, sourceWidth * 2);
    canvas.height = Math.max(1, sourceHeight * 2);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw Object.assign(new Error('Canvas 2D tidak tersedia untuk fallback resize.'), { code: 'LOCAL_CANVAS_UNAVAILABLE' });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return nxCanvasToUrl(canvas);
}

async function nxLocalEnhance(file, imageUrl, strength = 55, onProgress, signal) {
    void strength;
    const loaded = await nxLoadCanvasImage(file, imageUrl);
    const img = loaded.img;
    const sw = img.naturalWidth || img.width;
    const sh = img.naturalHeight || img.height;
    if (!sw || !sh) {
        URL.revokeObjectURL(loaded.url);
        throw Object.assign(new Error('Dimensi sumber tidak valid.'), { code: 'LOCAL_ESRGAN_INVALID_INPUT' });
    }
    const profile = window.__NEXORA_PERFORMANCE__ || {};
    const patchSize = profile.lowPower ? 32 : (profile.mobileLike ? 48 : 64);
    const padding = 4;
    try {
        try {
            const upscaler = await nxEnsureLocalEsrgan();
            const dataUrl = await upscaler.upscale(img, {
                output: 'base64',
                patchSize,
                padding,
                awaitNextFrame: true,
                signal,
                progress: value => {
                    if (typeof onProgress !== 'function') return;
                    const raw = Number(value) || 0;
                    const percent = raw <= 1 ? raw * 100 : raw;
                    onProgress(Math.max(0, Math.min(100, percent)));
                }
            });
            if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
                throw Object.assign(new Error('ESRGAN mengembalikan hasil yang tidak valid.'), { code: 'LOCAL_ESRGAN_EMPTY_RESULT' });
            }
            const objectUrl = await nxObjectUrlFromDataUrl(dataUrl);
            const normalizedUrl = await nxNormalizeExact2x(objectUrl, sw, sh);
            nxEsrganLastEngine = 'esrgan';
            nxEsrganLastError = '';
            return normalizedUrl;
        } catch (error) {
            if ((signal && signal.aborted) || (error && error.name === 'AbortError')) throw error;
            nxEsrganLastEngine = 'canvas';
            nxEsrganLastError = String(error && (error.code || error.message) || 'LOCAL_ESRGAN_FAILED');
            console.warn('[Image Enhancer] ESRGAN tidak tersedia, memakai resize 2x:', nxEsrganLastError);
            if (typeof onProgress === 'function') onProgress(100);
            return await nxCanvasUpscaleExact2x(img, sw, sh);
        }
    } finally {
        URL.revokeObjectURL(loaded.url);
    }
}

window.NexoraLocalEnhance = nxLocalEnhance;
window.NexoraLocalEnhanceInfo = () => ({
    engine: 'LOCAL ESRGAN',
    model: 'ESRGAN Slim 2x',
    backend: window.tf && typeof window.tf.getBackend === 'function' ? window.tf.getBackend() : 'pending',
    scale: 2,
    tiled: true,
    vendorSource: nxEsrganVendorSource,
    modelSource: nxEsrganModelSource,
    lastEngine: nxEsrganLastEngine,
    lastError: nxEsrganLastError,
    runtimeRevision: NX_LOCAL_ESRGAN_ASSETS.revision
});

let nxBgRemovalModulePromise = null;
async function nxLoadBgRemovalModule() {
    if (nxBgRemovalModulePromise) return nxBgRemovalModulePromise;
    nxBgRemovalModulePromise = (async () => {
        const sources = [
            'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm',
            'https://esm.sh/@imgly/background-removal@1.7.0?bundle'
        ];
        let lastError = null;
        for (const source of sources) {
            try {
                const mod = await import(source);
                const fn = mod.default || mod.removeBackground || mod;
                if (typeof fn === 'function') return fn;
            } catch (error) {
                lastError = error;
            }
        }
        throw lastError || new Error('Modul AI Remove BG tidak tersedia');
    })().catch(error => {
        nxBgRemovalModulePromise = null;
        throw error;
    });
    return nxBgRemovalModulePromise;
}

async function nxPrepareBgInputBlob(file, imageUrl) {
    const blob = file || await nxRemoteImageBlob(imageUrl);
    if (!blob || blob.size < 20) throw new Error('File gambar kosong');
    // Ukuran file JPEG kecil tidak berarti dimensi fotonya kecil. Selalu baca
    // dimensinya agar foto kamera 12–50 MP tidak membuat tab Android kehabisan RAM.
    const loaded = await nxLoadImageFromBlob(blob);
    const img = loaded.img;
    const sw = img.naturalWidth || img.width;
    const sh = img.naturalHeight || img.height;
    const profile = window.__NEXORA_PERFORMANCE__ || {};
    const maxSide = profile.lowPower ? 1280 : (profile.mobileLike ? 1440 : 1800);
    if (Math.max(sw, sh) <= maxSide && blob.size <= 6 * 1024 * 1024) {
        URL.revokeObjectURL(loaded.url);
        return blob;
    }
    const scale = Math.min(1, maxSide / Math.max(sw, sh));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sw * scale));
    canvas.height = Math.max(1, Math.round(sh * scale));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(loaded.url);
    return await new Promise((resolve, reject) => canvas.toBlob(
        value => value ? resolve(value) : reject(new Error('Gagal mengoptimalkan gambar')),
        'image/jpeg',
        0.92
    ));
}

async function nxAiRemoveBackground(file, imageUrl, onProgress) {
    const inputBlob = await nxPrepareBgInputBlob(file, imageUrl);
    const removeBackground = await nxLoadBgRemovalModule();
    const task = removeBackground(inputBlob, {
        publicPath: 'https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/',
        device: 'cpu',
        model: 'isnet_quint8',
        progress: (key, current, total) => {
            if (typeof onProgress === 'function' && total) onProgress(Math.min(100, Math.round(current / total * 100)), key);
        },
        output: { format: 'image/png', quality: 1, type: 'foreground' }
    });
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Model AI terlalu lama merespons')), 75000));
    const result = await Promise.race([task, timeout]);
    if (!(result instanceof Blob) || result.size < 100) throw new Error('Hasil AI kosong');
    return URL.createObjectURL(result);
}

function nxColorDist(data, idx, rgb) {
    const dr = data[idx] - rgb[0], dg = data[idx + 1] - rgb[1], db = data[idx + 2] - rgb[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
}

async function nxLocalRemoveBg(file, imageUrl) {
    const loaded = await nxLoadCanvasImage(file, imageUrl);
    const img = loaded.img;
    const profile = window.__NEXORA_PERFORMANCE__ || {};
    const max = profile.lowPower ? 1100 : (profile.mobileLike ? 1280 : 1500);
    const sw = img.naturalWidth || img.width;
    const sh = img.naturalHeight || img.height;
    const scale = Math.min(1, max / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const d = imageData.data;
    const rgbAt = (x, y) => {
        const i = (y * w + x) * 4;
        return [d[i], d[i + 1], d[i + 2]];
    };
    const edgeColors = [
        rgbAt(0, 0), rgbAt(w - 1, 0), rgbAt(0, h - 1), rgbAt(w - 1, h - 1),
        rgbAt(Math.floor(w / 2), 0), rgbAt(Math.floor(w / 2), h - 1),
        rgbAt(0, Math.floor(h / 2)), rgbAt(w - 1, Math.floor(h / 2))
    ];
    const colorDistance = (idx, rgb) => {
        const dr = d[idx] - rgb[0], dg = d[idx + 1] - rgb[1], db = d[idx + 2] - rgb[2];
        return Math.sqrt(dr * dr + dg * dg + db * db);
    };
    const nearestEdgeDistance = idx => edgeColors.reduce((best, rgb) => Math.min(best, colorDistance(idx, rgb)), Infinity);
    // Sedikit lebih toleran untuk latar gradien, tetapi tetap hanya menghapus area yang terhubung ke tepi.
    const tol = 58;
    const soft = 44;
    const seen = new Uint8Array(w * h);
    const queue = new Uint32Array(w * h);
    let qHead = 0, qTail = 0;
    const push = (x, y) => {
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        const p = y * w + x;
        if (seen[p]) return;
        const i = p * 4;
        if (d[i + 3] < 8 || nearestEdgeDistance(i) <= tol + soft) {
            seen[p] = 1;
            queue[qTail++] = p;
        }
    };
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    while (qHead < qTail) {
        const p = queue[qHead++], x = p % w, y = Math.floor(p / w);
        const i = p * 4;
        const dist = nearestEdgeDistance(i);
        if (dist <= tol) d[i + 3] = 0;
        else d[i + 3] = Math.min(d[i + 3], Math.max(0, Math.min(255, Math.round((dist - tol) / soft * 255))));
        push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
    }
    ctx.putImageData(imageData, 0, 0);
    URL.revokeObjectURL(loaded.url);
    return nxCanvasToUrl(canvas);
}

async function nxRemoveBackgroundLocalFirst(file, imageUrl, onStatus) {
    const report = typeof onStatus === 'function' ? onStatus : () => {};
    let aiError = null;
    const profile = window.__NEXORA_PERFORMANCE__ || {};
    if (!profile.lowPower) {
        try {
            report('Menyiapkan model AI lokal…');
            const img = await nxAiRemoveBackground(file, imageUrl, (percent, key) => {
                report(`AI lokal ${percent}%${key ? ' · ' + key : ''}`);
            });
            return { img, engine: 'AI lokal', degraded: false };
        } catch (error) {
            aiError = error;
        }
    } else {
        aiError = new Error('Mode hemat memori aktif');
    }

    try {
        report('Model AI tidak tersedia. Menjalankan fallback lokal…');
        const img = await nxLocalRemoveBg(file, imageUrl);
        return {
            img,
            engine: 'Fallback lokal',
            degraded: true,
            warning: aiError && aiError.message ? aiError.message : ''
        };
    } catch (localError) {
        const error = new Error(
            'Pemrosesan lokal gagal' +
            (localError && localError.message ? ': ' + localError.message : '')
        );
        error.aiError = aiError;
        error.localError = localError;
        throw error;
    }
}

function nxRenderImageResult(target, imgUrl, filename, note) {
    target.innerHTML = `
        <div class="result-box">
            ${note ? `<div class="api-backup-note">${note}</div>` : ''}
            <img src="${nxEscape(imgUrl)}" style="width:100%;border-radius:12px;margin-bottom:12px;background:#12051f;">
            <a href="${nxEscape(imgUrl)}" download="${nxEscape(filename)}" style="text-decoration:none;">
                <button class="v-btn" style="background:rgba(168,85,247,0.12);"><i class="fas fa-download"></i> Download</button>
            </a>
        </div>
    `;
}

function nxWrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = String(text || '').split(/\s+/);
    let line = '', lines = [];
    words.forEach(word => {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width > maxWidth && line) {
            lines.push(line);
            line = word;
        } else line = test;
    });
    if (line) lines.push(line);
    lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
    return lines.length * lineHeight;
}

async function nxCanvasWindowsQuote(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 1100;
    canvas.height = 620;
    const ctx = canvas.getContext('2d');
    const grd = ctx.createLinearGradient(0,0,1100,620);
    grd.addColorStop(0,'#050816');
    grd.addColorStop(1,'#172554');
    ctx.fillStyle = grd;
    ctx.fillRect(0,0,1100,620);
    ctx.fillStyle = 'rgba(96,165,250,.16)';
    for (let i = 0; i < 22; i++) ctx.fillRect(i * 55, 0, 1, 620);
    for (let i = 0; i < 13; i++) ctx.fillRect(0, i * 55, 1100, 1);
    ctx.fillStyle = 'rgba(15,23,42,.88)';
    ctx.strokeStyle = 'rgba(147,197,253,.45)';
    ctx.lineWidth = 2;
    nxRoundRect(ctx, 145, 145, 810, 330, 30);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#60a5fa';
    ctx.fillRect(200, 205, 56, 56); ctx.fillRect(264, 205, 56, 56); ctx.fillRect(200, 269, 56, 56); ctx.fillRect(264, 269, 56, 56);
    ctx.fillStyle = '#e0f2fe';
    ctx.font = '800 42px Inter, Arial';
    ctx.fillText('Windows Quotes', 365, 220);
    ctx.fillStyle = '#bfdbfe';
    ctx.font = '700 34px Inter, Arial';
    nxWrapText(ctx, text, 365, 285, 510, 46);
    ctx.fillStyle = '#7dd3fc';
    ctx.font = '700 22px Inter, Arial';
    ctx.fillText('NEXUS TOOLS', 365, 410);
    return nxCanvasToUrl(canvas);
}

async function nxCanvasTanyaUstadz(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    const grd = ctx.createLinearGradient(0,0,1080,1080);
    grd.addColorStop(0,'#052e16');
    grd.addColorStop(1,'#0f172a');
    ctx.fillStyle = grd;
    ctx.fillRect(0,0,1080,1080);
    ctx.fillStyle = 'rgba(34,197,94,.12)';
    for (let r = 70; r < 650; r += 70) {
        ctx.beginPath(); ctx.arc(540, 540, r, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(34,197,94,.11)'; ctx.lineWidth = 3; ctx.stroke();
    }
    ctx.fillStyle = 'rgba(15,23,42,.78)';
    ctx.strokeStyle = 'rgba(74,222,128,.35)';
    ctx.lineWidth = 3;
    nxRoundRect(ctx, 95, 115, 890, 810, 42);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#22c55e';
    ctx.beginPath(); ctx.arc(540, 290, 98, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#052e16';
    ctx.font = '900 72px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('?', 540, 318);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#bbf7d0';
    ctx.font = '900 46px Inter, Arial';
    ctx.fillText('TANYA USTADZ', 250, 455);
    ctx.fillStyle = '#f0fdf4';
    ctx.font = '800 42px Inter, Arial';
    nxWrapText(ctx, text, 180, 535, 720, 58);
    ctx.fillStyle = '#86efac';
    ctx.font = '800 24px Inter, Arial';
    ctx.fillText('meme generator', 180, 835);
    return nxCanvasToUrl(canvas);
}

const DOWNLOAD_HISTORY_KEY = 'nexus_download_history_v1';
let downloadHistoryFilter = 'all';

function readDownloadHistory() {
    try {
        const data = JSON.parse(localStorage.getItem(DOWNLOAD_HISTORY_KEY) || '[]');
        return Array.isArray(data) ? data.map((item, index) => ({
            ...item,
            id: item.id || ((item.time || index) + '_' + (item.filename || 'download'))
        })) : [];
    } catch {
        return [];
    }
}

function writeDownloadHistory(list) {
    try {
        localStorage.setItem(DOWNLOAD_HISTORY_KEY, JSON.stringify(list.slice(0, 30)));
    } catch {}
}

function addDownloadHistory(item) {
    const now = Date.now();
    const list = readDownloadHistory().filter(x => !(x.url === item.url && x.filename === item.filename));
    list.unshift({
        id: item.id || (now + '_' + Math.random().toString(36).slice(2, 8)),
        tool: item.tool || 'Downloader',
        type: String(item.type || 'File').toUpperCase(),
        title: item.title || item.filename || 'Download',
        filename: item.filename || 'download',
        url: item.url || '',
        time: now
    });
    writeDownloadHistory(list);
    renderDownloadHistory();
}

function renderDownloadHistory() {
    const host = document.getElementById('downloadHistoryList');
    if (!host) return;
    const list = readDownloadHistory();
    const count = document.getElementById('downloadHistoryCount');
    if (count) count.textContent = list.length > 99 ? '99+' : list.length;
    const filtered = downloadHistoryFilter === 'all'
        ? list
        : list.filter(item => String(item.type || '').toUpperCase() === downloadHistoryFilter);
    document.querySelectorAll('[data-history-filter]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.historyFilter === downloadHistoryFilter);
    });
    if (!filtered.length) {
        host.innerHTML = `<div class="history-empty">${list.length ? 'Tidak ada history untuk filter ini.' : 'Belum ada riwayat. Download berhasil dari Terabox, Instagram, atau TikTok akan muncul di sini.'}</div>`;
        return;
    }
    host.innerHTML = filtered.slice(0, 12).map(item => {
        const time = new Date(item.time || Date.now()).toLocaleString('id-ID', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
        const type = String(item.type || 'File').toUpperCase();
        const typeClass = type.toLowerCase().replace(/[^a-z0-9]/g, '');
        const icon = type === 'MP3' ? 'fa-music' : (type === 'MP4' ? 'fa-video' : (type === 'JPG' || type === 'PNG' || type === 'WEBP' ? 'fa-image' : 'fa-file-arrow-down'));
        const file = item.filename || 'download';
        const actions = item.url
            ? `<button type="button" data-history-open="${nxEscape(item.url || '')}"><i class="fas fa-up-right-from-square"></i> Buka</button><button type="button" data-history-copy="${nxEscape(item.url || '')}"><i class="fas fa-copy"></i> Copy</button>`
            : `<button type="button" disabled><i class="fas fa-file"></i> Local</button><button type="button" disabled><i class="fas fa-copy"></i> Copy</button>`;
        return `<div class="history-item">
            <div class="history-icon ${nxEscape(typeClass)}"><i class="fas ${icon}"></i></div>
            <div class="history-info">
                <div class="history-title">${nxEscape(item.title || item.filename || 'Download')}</div>
                <div class="history-meta"><span class="history-badge">${nxEscape(type)}</span><span>${nxEscape(item.tool || 'Downloader')}</span><span class="history-file">${nxEscape(file)}</span></div>
                <div class="history-time">${time}</div>
            </div>
            <div class="history-actions">
                ${actions}
                <button class="danger" type="button" data-history-delete="${nxEscape(item.id || '')}"><i class="fas fa-trash"></i> Hapus</button>
            </div>
        </div>`;
    }).join('');
}

function initDownloadHistory() {
    renderDownloadHistory();
    const clear = document.getElementById('clearDownloadHistory');
    if (clear) clear.onclick = () => {
        localStorage.removeItem(DOWNLOAD_HISTORY_KEY);
        renderDownloadHistory();
    };
    document.querySelectorAll('[data-history-filter]').forEach(btn => {
        btn.onclick = () => {
            downloadHistoryFilter = btn.dataset.historyFilter || 'all';
            renderDownloadHistory();
        };
    });
}

function recordDownload(tool, type, url, filename, title) {
    addDownloadHistory({ tool, type, url, filename, title });
}

document.addEventListener('click', function(e) {
    const deleteBtn = e.target.closest('[data-history-delete]');
    if (deleteBtn) {
        const id = deleteBtn.getAttribute('data-history-delete');
        writeDownloadHistory(readDownloadHistory().filter(item => item.id !== id));
        renderDownloadHistory();
        return;
    }
    const openBtn = e.target.closest('[data-history-open]');
    if (openBtn) {
        const url = openBtn.getAttribute('data-history-open');
        if (url) window.open(url, '_blank');
        return;
    }
    const copyBtn = e.target.closest('[data-history-copy]');
    if (copyBtn) {
        const url = copyBtn.getAttribute('data-history-copy');
        if (url) navigator.clipboard.writeText(url).then(() => {
            const before = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i class="fas fa-check"></i> OK';
            setTimeout(() => copyBtn.innerHTML = before, 1200);
        });
    }
});

document.addEventListener('click', function(e) {
    const link = e.target.closest('a[download]');
    if (!link) return;
    if (link.dataset.historyRecorded === '1') return;
    const filename = link.getAttribute('download') || 'download';
    const ext = (filename.split('.').pop() || 'File').toUpperCase();
    recordDownload('Download', ext, link.href || '', filename, filename);
});


let toolsData = {
    downloader: [
        
        { id: 'terabox', icon: 'fa-solid fa-box-open', name: 'Terabox Downloader', desc: 'Ambil file dari link share Terabox', badge: 'FILE' },{ id: 'instagram', icon: 'fa-brands fa-instagram', name: 'Instagram', desc: 'Download video & foto', badge: 'HD' },
        { id: 'tiktok', icon: 'fa-brands fa-tiktok', name: 'TikTok', desc: 'Video, foto & audio', badge: 'MP4/MP3/JPG' },
        { id: 'youtube', icon: 'fa-brands fa-youtube', name: 'YouTube Metadata', desc: 'Metadata dan tautan resmi YouTube', badge: 'RESMI' },
        { id: 'spotify', icon: 'fa-brands fa-spotify', name: 'Spotify Downloader', desc: 'Audio provider dengan fallback resmi', badge: 'MP3' }
    ],
    maker: [{ id: 'fakebankjago', icon: 'fa-solid fa-building-columns', name: 'Fake Bank Jago', desc: 'Generator visual saldo Bank Jago', badge: 'SIMULASI' },{ id: 'brat', icon: 'fa-solid fa-wand-magic-sparkles', name: 'BRAT Generator', desc: 'Static + animated GIF', badge: 'GIF' },
        { id: 'iqc', icon: 'fa-solid fa-image', name: 'IQC Generator', desc: 'Buat gambar IQC — Operator, Image & Dark', badge: '3 STYLE' },
        { id: 'sertifikat', icon: 'fa-solid fa-certificate', name: 'Sertifikat Custom', desc: 'Buat sertifikat custom dari nama melalui API atau renderer lokal', badge: 'PNG' },

        { id: 'ektp', icon: 'fa-solid fa-id-card', name: 'E-KTP Generator', desc: 'Full form demo', badge: 'Full' },
        { id: 'fakedana', icon: 'fa-solid fa-money-bill-wave', name: 'Fake Dana', desc: 'Generate saldo Dana palsu', badge: 'Custom' },
        { id: 'fakedev', icon: 'fa-solid fa-laptop-code', name: 'FakeDev', desc: 'Buat profil developer dari nama, bio, dan foto', badge: 'API' },
        { id: 'fakelobby', icon: 'fa-solid fa-gamepad', name: 'Fake Lobby', desc: 'FF & ML lobby palsu', badge: 'Game' },
        { id: 'winquotes', icon: 'fa-brands fa-windows', name: 'Windows Quotes', desc: 'Quote ala Windows — 2 style', badge: '2 STYLE' },
        { id: 'nokiamsg', icon: 'fa-solid fa-mobile-retro', name: 'Nokia Message', desc: 'Buat gambar SMS jadul Nokia', badge: 'RETRO' },
        { id: 'tanyaustadz', icon: 'fa-solid fa-user-tie', name: 'Tanya Ustadz', desc: 'Meme generator', badge: 'Lucu' }
    ],
    tools: [{ id: 'mltools', icon: 'fa-solid fa-gamepad', name: 'ML Tools', desc: 'Script ML, Winrate dan Stalk MLBB', badge: 'MLBB' },{ id: 'comicreader', icon: 'fa-solid fa-book-open-reader', name: 'Baca Komik Full', desc: 'Manga, manhwa, manhua + reader', badge: 'FULL' },
        { id: 'promptgenerate', icon: 'fa-solid fa-wand-magic-sparkles', name: 'Prompt Generator', desc: 'Ubah gambar menjadi prompt deskriptif', badge: 'LOCAL' },
        { id: 'fakeovo', icon: 'fa-solid fa-wallet', name: 'Fake OVO', desc: 'Generator tampilan saldo OVO', badge: 'CANVAS' },
        { id: 'quotegenerator', icon: 'fa-solid fa-quote-left', name: 'Quote Generator', desc: 'Buat gambar quote monokrom', badge: 'JPG' },
        { id: 'carifakta', icon: 'fa-solid fa-magnifying-glass-chart', name: 'CariFakta', desc: 'Analisis klaim dan berita menggunakan AI', badge: 'AI' },
{ id: 'virusscan', icon: 'fa-solid fa-shield-virus', name: 'Virus Scan', desc: 'Scan URL, file, hash, domain & IP', badge: 'SECURITY' },
        { id: 'cryptomarket', icon: 'fa-solid fa-chart-line', name: 'Crypto Market Scanner', desc: 'Pantau harga, volume, market cap dan pergerakan crypto', badge: 'LIVE' },
        { id: 'webintel', icon: 'fa-solid fa-satellite-dish', name: 'Nexora Web Intelligence', desc: 'Audit SEO, security, performa, aksesibilitas dan teknologi website', badge: 'INTEL' },
        { id: 'ipintel', icon: 'fa-solid fa-network-wired', name: 'IP & ASN Intelligence', desc: 'Lookup IPv4/IPv6, ASN, organisasi, negara dan benua via IPinfo Lite', badge: 'IPINFO' },
        { id: 'bmkg', icon: 'fa-solid fa-cloud-sun-rain', name: 'BMKG Indonesia', desc: 'Gempa terkini, prakiraan cuaca 3 hari dan peringatan dini cuaca dari BMKG', badge: 'BMKG' },
        { id: 'spaceexplorer', icon: 'fa-solid fa-user-astronaut', name: 'Space Explorer', desc: 'APOD, galeri Mars, asteroid dekat Bumi dan cuaca antariksa NASA', badge: 'NASA' },
        { id: 'ocrintel', icon: 'fa-solid fa-file-lines', name: 'Nexora OCR Intelligence', desc: 'Ekstrak teks dari gambar dan PDF, analisis dokumen, lalu buat searchable PDF', badge: 'OCR' },
        { id: 'svgalight', icon: 'fa-solid fa-wand-magic-sparkles', name: 'SVG → Alight XML', desc: 'Konversi SVG ke XML Alight Motion dengan 4 mode: Lossless, Accurate, Balanced, Lightweight', badge: 'ANIME XML' },
        { id: 'alightpremium', icon: 'fa-solid fa-bolt', name: 'Alight Motion Premium 1 Tahun', desc: 'Request magic link lalu proses aktivasi Premium melalui API reseller', badge: '1 YEAR' },
        { id: 'imagevectorizer', icon: 'fa-solid fa-bezier-curve', name: 'Nexora Image Vectorizer', desc: 'Ubah PNG atau JPG menjadi SVG melalui FreeConvert Cloud', badge: 'SVG' },
        { id: 'calc', icon: 'fa-solid fa-calculator', name: 'Calculator', desc: 'Hitung cepat', badge: 'Math' },
        { id: 'pwgen', icon: 'fa-solid fa-key', name: 'Password Gen', desc: 'Password aman', badge: 'Secure' },
        { id: 'morse', icon: 'fa-solid fa-tower-broadcast', name: 'Morse Code', desc: 'Konversi morse', badge: 'Audio' },
        { id: 'removebg', icon: 'fa-solid fa-eraser', name: 'Remove BG', desc: 'Hapus background', badge: 'AI' },
        { id: 'enhancer', icon: 'fa-solid fa-magic', name: 'Image Enhancer', desc: 'Tingkatkan kualitas', badge: 'HD' }
    ],
    vault: [

        { id: 'ttquote', icon: 'fa-brands fa-tiktok', name: 'Quote TikTok Nexus', desc: 'Buat fake TikTok chat versi Nexus', badge: 'NEXUS' },
        { id: 'qrgen', icon: 'fa-solid fa-qrcode', name: 'QR Generator', desc: 'Buat QR langsung di sini', badge: 'QR' }
    ],
    external: [
        
        { id: 'tiktokhd', icon: 'fa-brands fa-tiktok', name: 'Upload TikTok HD', desc: 'Proses MP4 HD + TikTok Studio', badge: 'HD' },
{ id: 'getcode', icon: 'fa-solid fa-code', name: 'Get Code HTML', desc: 'Extract, preview, copy & download source', badge: 'PRO' },
        { id: 'vdeploy', icon: 'fa-solid fa-rocket', name: 'Deploy & Update Web', desc: 'Deploy Vercel atau Netlify + update project', badge: 'UPDATE' },
        { id: 'zxvai', icon: 'fa-solid fa-robot', name: 'ZxVAI', desc: 'AI tools & APK', link: 'https://zxvaiapk.netlify.app/' },
        { id: 'fotolink', icon: 'fa-solid fa-image', name: 'Foto To Link', desc: 'Upload & share', link: 'https://pixvault-bykz.netlify.app/' },
        { id: 'webencryption', icon: 'fa-solid fa-shield-halved', name: 'Web Encryption', desc: 'Encrypt & protect HTML', badge: 'SECURE' },
        { id: 'unbanwa', icon: 'fa-brands fa-whatsapp', name: 'Unban WhatsApp', desc: 'Tools & panduan unban WhatsApp', badge: 'WA' }
    ]
};

let allTools = [
    toolsData.tools.find(item => item.id === 'comicreader'),
    ...toolsData.downloader,
    ...toolsData.maker,
    ...toolsData.tools.filter(item => item.id !== 'comicreader'),
    ...toolsData.vault,
    ...toolsData.external
].filter(Boolean);

const ALL_PAGE_SIZE = 12;
const catalogGrids = {
    all: 'allGrid',
    downloader: 'downloaderGrid',
    maker: 'makerGrid',
    tools: 'toolsGrid',
    vault: 'vaultGrid',
    external: 'externalGrid'
};
let activeCatalogTab = 'all';
let allVisibleCount = ALL_PAGE_SIZE;
let allRenderedCount = 0;
let allLoadPending = false;

function toolCardMarkup(item, isExternal = false, category = '') {
    const escapeToolHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
    const safeId = escapeToolHtml(item.id);
    const safeIcon = escapeToolHtml(item.icon || 'fa-solid fa-cube');
    const safeLink = encodeURIComponent(String(item.link || '#')).replace(/'/g, '%27');
    const clickAttr = item.id === 'unbanwa' ?
        `onclick="window.openNexusUnban && window.openNexusUnban()"` :
        (item.id === 'vdeploy' ?
        `onclick="window.openDeploy && window.openDeploy()"` :
        (item.id === 'webencryption' ?
        `onclick="showTool('webencryption')"` :
        (item.id === 'tiktokhd' ?
            `onclick="window.openTikTokHdUpload && window.openTikTokHdUpload()"` :
            (item.link ?
                `onclick="window.open(decodeURIComponent('${safeLink}'),'_blank','noopener,noreferrer')"` :
                `onclick="showTool('${safeId}')"`))));
    const safeCategory = escapeToolHtml(category || (isExternal ? 'external' : 'tools'));
    const format = isExternal ? 'LINK' : (category === 'downloader' ? 'MEDIA' : category === 'maker' ? 'CREATE' : category === 'vault' ? 'VAULT' : 'UTILITY');
    return `
        <div class="tools-card" data-tool-id="${safeId}" data-nx-category="${safeCategory}" data-nx-format="${format}" role="button" tabindex="0" aria-label="Buka ${escapeToolHtml(item.name)}" ${clickAttr}>
            <div class="nx-card-top"><div class="icon"><i class="${safeIcon}"></i></div>${item.badge ? `<span class="badge">${escapeToolHtml(item.badge)}</span>` : ''}</div>
            <div class="nx-card-copy"><h4>${escapeToolHtml(item.name)}</h4><p>${escapeToolHtml(item.desc)}</p></div>
            <div class="nx-card-footer"><span class="nx-card-readiness" data-nx-status-slot="true"></span><span class="nx-card-format">${format}</span><div class="arrow"><i class="fas fa-arrow-right"></i></div></div>
        </div>
    `;
}

function renderGrid(containerId, items, isExternal = false, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const template = document.createElement('template');
    const category = options.category || (isExternal ? 'external' : containerId.replace(/Grid$/i, '').toLowerCase());
    template.innerHTML = items.map(item => toolCardMarkup(item, isExternal, category === 'all' ? (() => {
        const match = Object.entries(toolsData).find(([, rows]) => Array.isArray(rows) && rows.includes(item));
        return match ? match[0] : 'tools';
    })() : category)).join('');
    const fragment = template.content.cloneNode(true);
    if (options.append) {
        container.appendChild(fragment);
    } else {
        container.replaceChildren(fragment);
    }
    container.setAttribute('aria-busy', 'false');
}

function rebuildAllTools() {
    allTools = [
        toolsData.tools.find(item => item.id === 'comicreader'),
        ...toolsData.downloader,
        ...toolsData.maker,
        ...toolsData.tools.filter(item => item.id !== 'comicreader'),
        ...toolsData.vault,
        ...toolsData.external
    ].filter(Boolean);
    allRenderedCount = 0;
}

function normalizeCatalogToolId(value) {
    return String(value == null ? '' : value).trim().toLowerCase();
}

function catalogHasTool(toolId) {
    const targetId = normalizeCatalogToolId(toolId);
    if (!targetId) return false;
    return Object.values(toolsData).some(items =>
        Array.isArray(items) && items.some(item => normalizeCatalogToolId(item && item.id) === targetId)
    );
}

function catalogListTools() {
    return Object.entries(toolsData).flatMap(([category, items]) =>
        (Array.isArray(items) ? items : []).map(item => ({ ...item, category }))
    );
}

window.NexoraToolCatalog = Object.freeze({
    version: '6.3.18',
    has: catalogHasTool,
    list: catalogListTools
});
window.dispatchEvent(new CustomEvent('nexora:tool-catalog-ready'));

function removeAllLoadMore() {
    const current = document.getElementById('nxAllToolsMore');
    if (current) current.remove();
}

function loadMoreAllTools() {
    if (allLoadPending || allVisibleCount >= allTools.length) return;
    allLoadPending = true;
    const commit = () => {
        try {
            if (allVisibleCount >= allTools.length) return;
            allVisibleCount = Math.min(allTools.length, allVisibleCount + ALL_PAGE_SIZE);
            renderAllToolsGrid(false);
        } finally {
            allLoadPending = false;
        }
    };
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(commit);
    else setTimeout(commit, 0);
}

function ensureAllLoadMore() {
    const grid = document.getElementById('allGrid');
    if (!grid) return;
    let button = document.getElementById('nxAllToolsMore');
    const remaining = Math.max(0, allTools.length - allVisibleCount);
    if (!remaining) {
        removeAllLoadMore();
        return;
    }
    if (!button) {
        button = document.createElement('button');
        button.id = 'nxAllToolsMore';
        button.type = 'button';
        button.className = 'nx-all-tools-more';
        button.setAttribute('aria-controls', 'allGrid');
        button.addEventListener('click', loadMoreAllTools);
        grid.insertAdjacentElement('afterend', button);
    }
    const nextCount = Math.min(ALL_PAGE_SIZE, remaining);
    button.innerHTML = `<i class="fas fa-plus"></i><span>Tampilkan ${nextCount} tool lagi</span><small>${allVisibleCount}/${allTools.length}</small>`;
    button.setAttribute('aria-label', `Tampilkan ${nextCount} tool lagi`);
}

function renderAllToolsGrid(reset = false) {
    if (reset) {
        allVisibleCount = Math.min(ALL_PAGE_SIZE, allTools.length);
        allRenderedCount = 0;
    }
    const visible = allTools.slice(0, allVisibleCount);
    const appendOnly = !reset && allRenderedCount > 0 && visible.length >= allRenderedCount;
    const nextItems = appendOnly ? visible.slice(allRenderedCount) : visible;
    renderGrid('allGrid', nextItems, false, { append: appendOnly, category: 'all' });
    allRenderedCount = visible.length;
    ensureAllLoadMore();
    document.dispatchEvent(new CustomEvent('nexora:tools-rendered', {
        detail: { count: visible.length, total: allTools.length, tab: 'all', progressive: true }
    }));
}

function clearInactiveGrids(activeTab) {
    Object.entries(catalogGrids).forEach(([tab, gridId]) => {
        if (tab === activeTab) return;
        const grid = document.getElementById(gridId);
        if (grid && grid.childElementCount) grid.replaceChildren();
    });
}

function renderActiveTab(target, reset = false) {
    activeCatalogTab = Object.hasOwn(catalogGrids, target) ? target : 'all';
    clearInactiveGrids(activeCatalogTab);

    if (activeCatalogTab === 'all') {
        renderAllToolsGrid(reset);
        return;
    }

    removeAllLoadMore();
    const rows = Array.isArray(toolsData[activeCatalogTab]) ? toolsData[activeCatalogTab] : [];
    renderGrid(catalogGrids[activeCatalogTab], rows, activeCatalogTab === 'external');
    document.dispatchEvent(new CustomEvent('nexora:tools-rendered', {
        detail: { count: rows.length, total: rows.length, tab: activeCatalogTab, progressive: false }
    }));
}

async function applyDatabaseToolConfiguration() {
    try {
        const response = await window.NexoraFetch('/api/health?mode=database&resource=tools', {
            method: 'GET',
            cache: 'no-store',
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
            nexoraTimeoutMs: 6500,
            nexoraRetries: 0
        });
        if (!response.ok) return false;
        const payload = await response.json();
        const rows = Array.isArray(payload.data) ? payload.data : [];
        if (!rows.length) return false;

        const allowedCategories = new Set(['downloader', 'maker', 'tools', 'vault', 'external']);
        const baseById = new Map();
        for (const [category, items] of Object.entries(toolsData)) {
            for (const item of items) baseById.set(item.id, { ...item, category });
        }
        const nextTools = { downloader: [], maker: [], tools: [], vault: [], external: [] };
        const publicOverrides = {
            sertifikat: {
                name: 'Sertifikat Custom',
                description: 'Buat sertifikat custom dari nama melalui API atau renderer lokal',
                badge: 'PNG'
            }
        };
        // The source catalogue is authoritative for bundled tools. Replacing it
        // wholesale with database rows made new releases silently lose tools
  // whenever Supabase lags behind the local catalog.
        const databaseById = new Map(rows.map(row => [String(row.id || ''), row]));
        let bundledOrder = 0;
        for (const base of baseById.values()) {
            const row = databaseById.get(base.id) || null;
            databaseById.delete(base.id);
            if (row?.is_active === false) continue;
            const category = allowedCategories.has(row?.category) ? row.category : base.category;
            const publicOverride = publicOverrides[base.id] || null;
            nextTools[category].push({
                ...base,
                category,
                id: base.id,
                name: publicOverride?.name || row?.name || base.name,
                desc: publicOverride?.description || row?.description || base.desc || '',
                badge: publicOverride?.badge || row?.badge || base.badge || '',
                icon: row?.icon || base.icon || 'fa-solid fa-arrow-up-right-from-square',
                link: row?.external_url || base.link,
                sortOrder: Number.isFinite(Number(row?.sort_order)) ? Number(row.sort_order) : bundledOrder,
                custom: false
            });
            bundledOrder += 1;
        }

        // Database-only rows are allowed for external tools, but never create a
        // dead internal card without a bundled implementation.
        for (const row of databaseById.values()) {
            if (!row || row.is_active === false || !row.external_url) continue;
            const id = String(row.id || '').trim();
            if (!id) continue;
            const category = allowedCategories.has(row.category) ? row.category : 'external';
            nextTools[category].push({
                category,
                id,
                name: row.name || id,
                desc: row.description || '',
                badge: row.badge || '',
                icon: row.icon || 'fa-solid fa-arrow-up-right-from-square',
                link: row.external_url,
                sortOrder: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 999,
                custom: true
            });
        }
        for (const category of Object.keys(nextTools)) {
            nextTools[category].sort((left, right) => (left.sortOrder - right.sortOrder) || left.name.localeCompare(right.name, 'id'));
        }
        toolsData = nextTools;
        rebuildAllTools();
        return true;
    } catch (error) {
        console.warn('[Nexora tools] Konfigurasi database tidak tersedia:', error && error.message ? error.message : error);
        return false;
    }
}

function renderAll() {
    renderActiveTab(activeCatalogTab, true);
}

const catalogNavigation = document.getElementById('navTabs');
if (catalogNavigation) {
    catalogNavigation.addEventListener('click', event => {
        const tab = event.target.closest('.nav-tab');
        if (!tab || !catalogNavigation.contains(tab)) return;
        const target = tab.dataset.tab;
        if (!target) return;
        document.dispatchEvent(new CustomEvent('nexora:navigation-before', { detail: { tab: target } }));
        document.querySelectorAll('.nav-tab').forEach(item => item.classList.toggle('active', item === tab));
        document.querySelectorAll('.tab-content').forEach(panel => panel.classList.toggle('active', panel.id === 'tab-' + target));
        renderActiveTab(target, true);
        document.dispatchEvent(new CustomEvent('nexora:navigation-changed', { detail: { tab: target } }));
    });
}

// Kartu memakai elemen div agar layout lama tetap kompatibel. Jadikan seluruh
// kartu benar-benar dapat dibuka dengan keyboard, bukan hanya terlihat seperti tombol.
document.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target && event.target.closest ? event.target.closest('.tools-card[data-tool-id]') : null;
    if (!card) return;
    event.preventDefault();
    card.click();
});

function showTool(toolId) {
    const viewer = document.getElementById('toolViewer');
    const body = document.getElementById('toolViewerBody');
    viewer.classList.add('active');
    document.body.style.overflow = 'hidden';

    let tool = null;
    for (let cat of ['downloader', 'maker', 'tools', 'vault', 'external']) {
        const found = toolsData[cat].find(t => t.id === toolId);
        if (found) { tool = found; break; }
    }
    if (!tool) { closeTool(); return; }

    switch (toolId) {
        case 'instagram': renderInstagram(body); break;
        case 'tiktok': renderTiktok(body); break;
        case 'youtube': renderYoutube(body); break;
        case 'spotify': renderSpotify(body); break;
        case 'terabox': renderTerabox(body); break;
        case 'brat': renderBrat(body); break;
        case 'iqc': renderIqc2(body); break;
        case 'sertifikat': renderSertifikatTololSource(body); break;

        case 'ektp': renderEktp(body); break;
        case 'fakedana': renderFakeDana(body); break;
        case 'fakebankjago': renderFakeBankJago(body); break;
        case 'fakedev': renderFakeDev(body); break;
        case 'fakelobby': renderFakeLobby(body); break;
        case 'winquotes': renderWinquotes2(body); break;
        case 'nokiamsg': renderNokiaMsg(body); break;
        case 'tanyaustadz': renderTanyaUstadz(body); break;
        case 'getcode': window.openGetcode && window.openGetcode(); closeTool(); return;
        case 'virusscan': renderVirusScan(body); break;
        case 'cryptomarket': renderCryptoMarket(body); break;
        case 'webintel': renderWebIntelligence(body); break;
        case 'ipintel': renderIpIntelligence(body); break;
        case 'bmkg': renderBmkgIndonesia(body); break;
        case 'spaceexplorer': renderSpaceExplorer(body); break;
        case 'ocrintel': renderOcrIntelligence(body); break;
        case 'svgalight': renderSvgAlight(body); break;
        case 'alightpremium': renderAlightPremium(body); break;
        case 'imagevectorizer': renderImageVectorizer(body); break;
        case 'promptgenerate': renderPromptGenerator(body); break;
        case 'fakeovo': renderFakeOvo(body); break;
        case 'quotegenerator': renderQuoteGenerator(body); break;
        case 'carifakta': renderCariFakta(body); break;
                case 'mltools': renderMlTools(body); break;
        case 'saranide': closeTool(); window.openNexusReportRoom && window.openNexusReportRoom(); return;
case 'calc': renderCalc(body); break;
        case 'pwgen': renderPwgen(body); break;
        case 'morse': renderMorse(body); break;
        case 'removebg': renderRemovebg(body); break;
        case 'enhancer': renderEnhancer(body); break;
        case 'ttquote': renderTiktokQuote(body); break;
        case 'qrgen': renderQrGenerator(body); break;
        case 'webencryption': renderWebEncryption(body); break;
        default: closeTool();
    }
    mountToolApiStatus(body, toolId);
}

function closeTool() {
    const viewer =
      document.getElementById(
        'toolViewer'
      );

    if(viewer){
      viewer.classList.remove('active');
    }

    const body =
      document.getElementById(
        'toolViewerBody'
      );

    if(body){
      body.innerHTML = '';
    }

    document.body.style.overflow =
      'auto';
}

document.getElementById('toolViewer').addEventListener('click', function(e) {
    if (e.target === this) closeTool();
});
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeTool();
});

function renderInstagram(body) {
    const fmtNum = n => n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : (n||0).toString();
    const fmtSz  = b => b >= 1e6 ? (b/1e6).toFixed(1)+' MB' : b >= 1e3 ? (b/1e3).toFixed(0)+' KB' : (b||0)+' B';
    const dlT = (u, nm) => nxDownloadUrl(u, nm, { tool: 'Instagram', type: nm && nm.endsWith('.mp4') ? 'MP4' : 'JPG', title: 'Instagram Media' });

    body.innerHTML = `
        <h2><i class="fa-brands fa-instagram"></i> Instagram Downloader</h2>
        <p style="color:#8b7ab8;font-size:13px;margin-bottom:12px;">Video, Reels, Foto &amp; Carousel &mdash; info lengkap &amp; copy caption.</p>
        <input type="url" class="v-input" id="instaUrl" placeholder="Tempel link Instagram..." autocomplete="url" spellcheck="false">
        <button class="v-btn" id="instaBtn" style="width:100%;margin-top:8px;"><i class="fas fa-download"></i> Ambil Media</button>
        <div id="instaResult"></div>
    `;

    const run = async () => {
        const url = document.getElementById('instaUrl').value.trim();
        const target = document.getElementById('instaResult');
        const btn = document.getElementById('instaBtn');
        if (!url) return;
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengambil...';
        target.innerHTML = `<div class="dl-loading"><div class="dl-spin"></div><p>Mengambil info media...</p></div>`;
        try {
            const response = await window.NexoraDownloader.request('instagram', url);
            const data = response.data;
            const validMedia = Array.isArray(data.media) ? data.media.filter(m => m && m.url) : [];
            if (!validMedia.length) throw new Error('Tidak ada media ditemukan');
            const caption  = data.caption || '';
            const username = data.author || '';
            const likes    = data.stats && data.stats.likes || 0;
            const comments = data.stats && data.stats.comments || 0;
            const isVideo  = validMedia[0] && validMedia[0].type === 'MP4';
            let mediaHTML = '';
            if (validMedia.length === 1) {
                const m = validMedia[0]; const src2 = m.url||'';
                mediaHTML = isVideo ? `<video controls style="width:100%;border-radius:14px;max-height:300px;background:#0a0012;" src="${src2}"></video>` : `<img src="${src2}" style="width:100%;border-radius:14px;max-height:360px;object-fit:cover;">`;
            } else {
                mediaHTML = '<div class="dl-media-grid">' + validMedia.slice(0,6).map((m,i) => {
                    const s2=m.url||''; const isV=m.type==='MP4';
                    return `<div class="dl-media-item">${isV?`<video src="${s2}" style="width:100%;height:130px;object-fit:cover;"></video>`:`<img src="${s2}" alt="M${i+1}">`}<button class="dl-item-dl" onclick="(function(){var a=document.createElement('a');a.href='${s2}';a.target='_blank';a.download='insta_${i+1}.${isV?'mp4':'jpg'}';document.body.appendChild(a);a.click();a.remove();})()"><i class="fas fa-download"></i></button></div>`;
                }).join('') + '</div>';
            }
            target.innerHTML = `
                <div class="dl-header">
                    <div class="dl-thumb-placeholder"><i class="fa-brands fa-instagram"></i></div>
                    <div class="dl-header-info">
                        ${username ? `<div class="dl-author"><span class="dl-author-name">@${nxEscape(username)}</span></div>` : ''}
                        <div class="dl-title">${caption ? nxEscape(caption.slice(0,80)+(caption.length>80?'...':'')) : 'Instagram Media'}</div>
                        <span class="dl-badge ${isVideo?'hd':'music'}"><i class="fas fa-${isVideo?'video':'image'}"></i> ${validMedia.length>1?validMedia.length+' Media':isVideo?'Video/Reels':'Foto'}</span>
                    </div>
                </div>
                ${(likes||comments) ? `<div class="dl-stats" style="grid-template-columns:repeat(2,1fr);"><div class="dl-stat"><span class="st-val">${fmtNum(likes)}</span><span class="st-lbl"><i class="fas fa-heart"></i> Likes</span></div><div class="dl-stat"><span class="st-val">${fmtNum(comments)}</span><span class="st-lbl"><i class="fas fa-comment"></i> Komen</span></div></div>` : ''}
                <div style="margin:14px 0;">${mediaHTML}</div>
                ${caption ? `<div class="dl-caption"><div class="dl-caption-label">Caption</div><div class="dl-caption-text">${nxEscape(caption)}</div><div class="dl-caption-actions"><button class="dl-copy-btn" id="instaCopyCapBtn"><i class="fas fa-copy"></i> Copy Caption</button></div></div>` : ''}
                <hr class="dl-divider">
                <div class="dl-section-label"><i class="fas fa-download"></i> Download Media</div>
                <div class="dl-options">${validMedia.slice(0,4).map((m,i) => {
                    const s2=m.url||''; const isV=m.type==='MP4'; const sz=m.size?' &bull; '+fmtSz(m.size):'';
                    return `<div class="dl-option"><div class="dl-option-info"><div class="dl-option-icon ${isV?'mp4':'std'}"><i class="fas fa-${isV?'video':'image'}"></i></div><div><div class="dl-option-title">${isV?'Video':'Foto'} ${validMedia.length>1?'#'+(i+1):''}</div><div class="dl-option-desc">${isV?'MP4':'JPG'}${sz}</div></div></div><button class="dl-dl-btn ${isV?'mp4':'std'}" data-url="${s2}" data-name="insta_${i+1}.${isV?'mp4':'jpg'}">&#8595; Simpan</button></div>`;
                }).join('')}</div>
            `;
            if (caption && document.getElementById('instaCopyCapBtn')) {
                document.getElementById('instaCopyCapBtn').onclick = function() {
                    navigator.clipboard.writeText(caption).then(() => {
                        this.textContent = '\u2713 Tersalin!'; this.classList.add('copied');
                        setTimeout(() => { this.innerHTML = '<i class="fas fa-copy"></i> Copy Caption'; this.classList.remove('copied'); }, 2200);
                    });
                };
            }
            target.querySelectorAll('[data-url]').forEach(btn2 => { btn2.onclick = () => dlT(btn2.dataset.url, btn2.dataset.name); });
        } catch (e) {
            if (e && e.name === 'AbortError') return;
            target.innerHTML = `<div class="dl-error"><i class="fas fa-triangle-exclamation"></i><br><br>Gagal mengambil media.<br><span style="font-size:11px;opacity:.7;">${nxEscape(e.message)}</span></div>`;
        } finally {
            btn.disabled = false; btn.innerHTML = '<i class="fas fa-download"></i> Ambil Media';
        }
    };
    document.getElementById('instaBtn').onclick = run;
    document.getElementById('instaUrl').addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
}

function renderTiktok(body) {
    const fmtNum = n => n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : (n||0).toString();
    const fmtSz  = b => b >= 1e6 ? (b/1e6).toFixed(1)+' MB' : b >= 1e3 ? (b/1e3).toFixed(0)+' KB' : (b||0)+' B';
    const fmtDur = s => { const m=Math.floor(s/60),ss=s%60; return m+'m '+(ss<10?'0':'')+ss+'s'; };
    const dlTrigger = (u, n2) => nxDownloadUrl(u, n2, { tool: 'TikTok', type: n2 && n2.endsWith('.mp3') ? 'MP3' : (n2 && n2.endsWith('.jpg') ? 'JPG' : 'MP4'), title: 'TikTok Media' });

    body.innerHTML = `
        <h2><i class="fa-brands fa-tiktok"></i> TikTok Downloader</h2>
        <p style="color:#8b7ab8;font-size:13px;margin-bottom:12px;">Video MP4, foto/slide JPG, audio MP3 &bull; Info lengkap media.</p>
        <input type="url" class="v-input" id="ttUrl" placeholder="Tempel link TikTok..." autocomplete="url" spellcheck="false">
        <button class="v-btn" id="ttBtn" style="width:100%;margin-top:8px;"><i class="fas fa-download"></i> Ambil Media</button>
        <div id="ttResult"></div>
    `;

    const run = async () => {
        const url = document.getElementById('ttUrl').value.trim();
        const target = document.getElementById('ttResult');
        const btn = document.getElementById('ttBtn');
        if (!url) return;
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengambil...';
        target.innerHTML = `<div class="dl-loading"><div class="dl-spin"></div><p>Menghubungi server...</p></div>`;
        try {
            const fetched = await window.NexoraDownloader.request('tiktok', url);
            const json = window.NexoraDownloader.legacyTikTok(fetched);
            const d = json && json.data;
            if (!d) throw new Error('Data tidak ditemukan');
            const caption  = d.title || '';
            const author   = d.author || {};
            const hdUrl    = d.hdplay || d.play || '';
            const stdUrl   = d.play || '';
            const wmUrl    = d.wmplay || d.wm_video || '';
            const musicUrl = d.music || '';
            const cover    = d.cover || d.origin_cover || '';
            const avatar   = author.avatar || '';
            const nickname = author.nickname || author.unique_id || 'Unknown';
            const likes    = d.digg_count || 0;
            const comments = d.comment_count || 0;
            const shares   = d.share_count || 0;
            const plays    = d.play_count || 0;
            const duration = d.duration || 0;
            const hdSize   = d.size || 0;
            const wmSize   = d.wm_size || 0;
            const photoList = [];
            const addPhoto = item => {
                if (!item) return;
                if (typeof item === 'string' && /^https?:\/\//i.test(item)) {
                    photoList.push(item);
                    return;
                }
                if (Array.isArray(item)) {
                    item.forEach(addPhoto);
                    return;
                }
                if (typeof item === 'object') {
                    if (item.url_list) addPhoto(item.url_list);
                    else if (item.image_url) addPhoto(item.image_url);
                    else if (item.display_image) addPhoto(item.display_image);
                    else if (item.url) addPhoto(item.url);
                    else if (item.image) addPhoto(item.image);
                }
            };
            addPhoto(d.images);
            addPhoto(d.image_post_info && d.image_post_info.images);
            const photos = [...new Set(photoList)];
            const isPhotoPost = photos.length > 0 && !hdUrl;
            const photoPreview = photos.length ? `
                <div class="dl-media-grid" style="margin:14px 0;">
                    ${photos.slice(0,8).map((img,i)=>`<div class="dl-media-item"><img src="${nxEscape(img)}" alt="Foto ${i+1}"><button class="dl-item-dl" data-tt-photo="${nxEscape(img)}" data-name="tiktok_foto_${i+1}.jpg"><i class="fas fa-download"></i></button></div>`).join('')}
                </div>
            ` : '';
            target.innerHTML = `
                <div class="dl-header">
                    ${cover ? `<img class="dl-thumb" src="${cover}" alt="cover" onerror="this.style.display='none'">` : `<div class="dl-thumb-placeholder"><i class="fa-brands fa-tiktok"></i></div>`}
                    <div class="dl-header-info">
                        <div class="dl-author">
                            ${avatar ? `<img class="dl-author-avatar" src="${avatar}" onerror="this.style.display='none'">` : ''}
                            <span class="dl-author-name">@${nickname}</span>
                        </div>
                        <div class="dl-title">${caption || 'Tidak ada caption'}</div>
                        <span class="dl-badge ${isPhotoPost?'music':'hd'}"><i class="fas fa-${isPhotoPost?'image':'star'}"></i> ${isPhotoPost ? photos.length + ' Foto Tersedia' : 'HD Tersedia'}</span>
                    </div>
                </div>
                <div class="dl-stats">
                    <div class="dl-stat"><span class="st-val">${fmtNum(plays)}</span><span class="st-lbl"><i class="fas fa-play"></i> Plays</span></div>
                    <div class="dl-stat"><span class="st-val">${fmtNum(likes)}</span><span class="st-lbl"><i class="fas fa-heart"></i> Likes</span></div>
                    <div class="dl-stat"><span class="st-val">${fmtNum(comments)}</span><span class="st-lbl"><i class="fas fa-comment"></i> Komen</span></div>
                    <div class="dl-stat"><span class="st-val">${fmtNum(shares)}</span><span class="st-lbl"><i class="fas fa-share"></i> Share</span></div>
                </div>
                <div class="dl-meta-row">
                    ${duration ? `<span class="dl-meta-chip"><i class="fas fa-clock"></i> ${fmtDur(duration)}</span>` : ''}
                    ${photos.length ? `<span class="dl-meta-chip"><i class="fas fa-images"></i> ${photos.length} Foto</span>` : ''}
                    ${hdSize ? `<span class="dl-meta-chip"><i class="fas fa-file-video"></i> HD: ${fmtSz(hdSize)}</span>` : ''}
                    ${wmSize ? `<span class="dl-meta-chip"><i class="fas fa-droplet"></i> WM: ${fmtSz(wmSize)}</span>` : ''}
                </div>
                ${photoPreview}
                ${caption ? `<div class="dl-caption"><div class="dl-caption-label">Caption</div><div class="dl-caption-text">${caption}</div><div class="dl-caption-actions"><button class="dl-copy-btn" id="ttCopyCapBtn"><i class="fas fa-copy"></i> Copy Caption</button></div></div>` : ''}
                <hr class="dl-divider">
                <div class="dl-section-label"><i class="fas fa-download"></i> Pilih Download</div>
                <div class="dl-options">
                    ${photos.length ? photos.slice(0,8).map((img,i)=>`<div class="dl-option"><div class="dl-option-info"><div class="dl-option-icon std"><i class="fas fa-image"></i></div><div><div class="dl-option-title">Foto #${i+1}</div><div class="dl-option-desc">JPG / slide TikTok</div></div></div><button class="dl-dl-btn std" data-tt-photo="${nxEscape(img)}" data-name="tiktok_foto_${i+1}.jpg">&#8595; JPG</button></div>`).join('') : ''}
                    ${!isPhotoPost ? `<div class="dl-option">
                        <div class="dl-option-info"><div class="dl-option-icon hd"><i class="fas fa-crown"></i></div>
                        <div><div class="dl-option-title">HD Quality</div><div class="dl-option-desc">Tanpa watermark &bull; Resolusi tertinggi${hdSize?' &bull; '+fmtSz(hdSize):''}</div></div></div>
                        <button class="dl-dl-btn hd" id="ttHdBtn" ${!hdUrl?'disabled':''}>&#8595; HD</button>
                    </div>
                    <div class="dl-option">
                        <div class="dl-option-info"><div class="dl-option-icon std"><i class="fas fa-video"></i></div>
                        <div><div class="dl-option-title">Standar</div><div class="dl-option-desc">Tanpa watermark &bull; Ukuran lebih kecil</div></div></div>
                        <button class="dl-dl-btn std" id="ttStdBtn" ${!stdUrl?'disabled':''}>&#8595; Standar</button>
                    </div>
                    <div class="dl-option">
                        <div class="dl-option-info"><div class="dl-option-icon wm"><i class="fas fa-droplet"></i></div>
                        <div><div class="dl-option-title">Original (Watermark)</div><div class="dl-option-desc">Versi asli TikTok${wmSize?' &bull; '+fmtSz(wmSize):''}</div></div></div>
                        <button class="dl-dl-btn wm" id="ttWmBtn" ${!wmUrl?'disabled':''}>&#8595; WM</button>
                    </div>` : ''}
                    ${musicUrl ? `<div class="dl-option"><div class="dl-option-info"><div class="dl-option-icon mp3"><i class="fas fa-music"></i></div><div><div class="dl-option-title">Audio / Musik</div><div class="dl-option-desc">${(d.music_info&&d.music_info.title)||'Soundtrack video'}</div></div></div><button class="dl-dl-btn mp3" id="ttMusicBtn">&#8595; MP3</button></div>` : ''}
                </div>
            `;
            if (caption && document.getElementById('ttCopyCapBtn')) {
                document.getElementById('ttCopyCapBtn').onclick = function() {
                    navigator.clipboard.writeText(caption).then(() => {
                        this.textContent = '\u2713 Tersalin!'; this.classList.add('copied');
                        setTimeout(() => { this.innerHTML = '<i class="fas fa-copy"></i> Copy Caption'; this.classList.remove('copied'); }, 2200);
                    });
                };
            }
            if (hdUrl && document.getElementById('ttHdBtn'))   document.getElementById('ttHdBtn').onclick   = () => dlTrigger(hdUrl,    'tiktok_hd.mp4');
            if (stdUrl && document.getElementById('ttStdBtn')) document.getElementById('ttStdBtn').onclick  = () => dlTrigger(stdUrl,   'tiktok_std.mp4');
            if (wmUrl && document.getElementById('ttWmBtn'))   document.getElementById('ttWmBtn').onclick   = () => dlTrigger(wmUrl,    'tiktok_wm.mp4');
            const mmb = document.getElementById('ttMusicBtn');
            if (mmb && musicUrl) mmb.onclick = () => dlTrigger(musicUrl, 'tiktok_music.mp3');
            target.querySelectorAll('[data-tt-photo]').forEach(btn2 => {
                btn2.onclick = () => dlTrigger(btn2.getAttribute('data-tt-photo'), btn2.getAttribute('data-name') || 'tiktok_foto.jpg');
            });
        } catch (e) {
            target.innerHTML = `<div class="dl-error"><i class="fas fa-triangle-exclamation"></i><br><br>Gagal mengambil media.<br><span style="font-size:11px;opacity:.7;">${e.message}</span></div>`;
        }
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-download"></i> Ambil Media';
    };
    document.getElementById('ttBtn').onclick = run;
    document.getElementById('ttUrl').addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
}

function renderYoutube(body) {
    const fmtNum = n => n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : (n||0).toString();
    const fmtDur = s => { if(!s) return '--'; const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),ss=s%60; return h?(h+':'+(m<10?'0':'')+m+':'+(ss<10?'0':'')+ss):(m+':'+(ss<10?'0':'')+ss); };
    const dlT = (u, nm) => { recordDownload('YouTube', nm && nm.endsWith('.mp3') ? 'MP3' : 'MP4', u, nm, 'YouTube Media'); const a=document.createElement('a'); a.href=u; a.target='_blank'; a.download=nm; a.dataset.historyRecorded='1'; document.body.appendChild(a); a.click(); a.remove(); };

    body.innerHTML = `
        <h2><i class="fa-brands fa-youtube"></i> YouTube Downloader</h2>
        <p style="color:#8b7ab8;font-size:13px;margin-bottom:12px;">Video MP4 multi-resolusi &bull; Audio MP3 &bull; Info lengkap.</p>
        <input type="url" class="v-input" id="ytUrl" placeholder="Tempel URL YouTube..." autocomplete="url" spellcheck="false">
        <button class="v-btn" id="ytFetchBtn" style="width:100%;margin-top:8px;"><i class="fas fa-play"></i> Ambil Info</button>
        <div id="ytResult"></div>
    `;

    const run = async () => {
        const url = document.getElementById('ytUrl').value.trim();
        const target = document.getElementById('ytResult');
        const btn = document.getElementById('ytFetchBtn');
        if (!url) return;
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengambil...';
        target.innerHTML = `<div class="dl-loading"><div class="dl-spin"></div><p>Mengambil info video...</p></div>`;
        try {
            const ytInfoApi = 'https://api.nexray.eu.cc/downloader/ytmp4?url=' + encodeURIComponent(url) + '&resolusi=720';
            const { data } = await nxFetchJsonWithBackup('nexray', nxBackupSources('Nexray', ytInfoApi));
            if (!data.status || !data.result) throw new Error('Gagal ambil info');
            const d = data.result;
            const title   = d.title || 'YouTube Video';
            const thumb   = d.thumbnail || d.thumb || '';
            const durat   = d.duration || 0;
            const views   = d.viewCount || d.views || 0;
            const channel = d.channel || d.author || '';
            const baseUrl = d.url || '';
            target.innerHTML = `
                ${thumb ? `<img style="width:100%;border-radius:14px;max-height:200px;object-fit:cover;margin-bottom:14px;" src="${thumb}" alt="thumb" onerror="this.style.display='none'">` : ''}
                <div class="dl-yt-info">
                    <div class="dl-yt-title">${title}</div>
                    ${channel ? `<div class="dl-yt-channel"><i class="fas fa-circle-play"></i> ${channel}</div>` : ''}
                </div>
                <div class="dl-meta-row">
                    ${durat ? `<span class="dl-meta-chip"><i class="fas fa-clock"></i> ${fmtDur(durat)}</span>` : ''}
                    ${views ? `<span class="dl-meta-chip"><i class="fas fa-eye"></i> ${fmtNum(views)} views</span>` : ''}
                </div>
                <div class="dl-quality-tabs" id="ytModeTabs">
                    <button class="dl-quality-tab active" id="ytTabVideo" data-mode="video"><i class="fas fa-video"></i> Video MP4</button>
                    <button class="dl-quality-tab" id="ytTabAudio" data-mode="audio"><i class="fas fa-music"></i> Audio MP3</button>
                </div>
                <div class="dl-options" id="ytVideoOpts">
                    ${['360','480','720','1080'].map(r => `<div class="dl-option"><div class="dl-option-info"><div class="dl-option-icon ${r==='1080'?'hd':(r==='720'?'std':'wm')}"><i class="fas fa-film"></i></div><div><div class="dl-option-title">${r}p ${r==='1080'?'Full HD':(r==='720'?'HD':(r==='480'?'SD':'Low'))}</div><div class="dl-option-desc">MP4 &bull; ${r==='1080'?'Resolusi terbaik':(r==='720'?'Kualitas bagus':'Ukuran kecil')}</div></div></div><button class="dl-dl-btn ${r==='1080'?'hd':(r==='720'?'std':'wm')}" id="ytDlBtn${r}">&#8595; ${r}p</button></div>`).join('')}
                </div>
                <div class="dl-options" id="ytAudioOpts" style="display:none;">
                    <div class="dl-option">
                        <div class="dl-option-info"><div class="dl-option-icon mp3"><i class="fas fa-music"></i></div>
                        <div><div class="dl-option-title">Audio MP3</div><div class="dl-option-desc">Kualitas tinggi &bull; ${title.slice(0,40)}${title.length>40?'...':''}</div></div></div>
                        <button class="dl-dl-btn mp3" id="ytMp3Btn">&#8595; MP3</button>
                    </div>
                </div>
            `;
            document.getElementById('ytTabVideo').onclick = () => {
                document.querySelectorAll('#ytModeTabs .dl-quality-tab').forEach(b=>b.classList.remove('active'));
                document.getElementById('ytTabVideo').classList.add('active');
                document.getElementById('ytVideoOpts').style.display='flex';
                document.getElementById('ytAudioOpts').style.display='none';
            };
            document.getElementById('ytTabAudio').onclick = () => {
                document.querySelectorAll('#ytModeTabs .dl-quality-tab').forEach(b=>b.classList.remove('active'));
                document.getElementById('ytTabAudio').classList.add('active');
                document.getElementById('ytVideoOpts').style.display='none';
                document.getElementById('ytAudioOpts').style.display='flex';
            };
            ['360','480','720','1080'].forEach(r => {
                const b2 = document.getElementById('ytDlBtn'+r); if (!b2) return;
                b2.onclick = async () => {
                    b2.disabled=true; b2.textContent='...';
                    try {
                        const ytDlApi = 'https://api.nexray.eu.cc/downloader/ytmp4?url='+encodeURIComponent(url)+'&resolusi='+r;
                        const { data: d2 } = await nxFetchJsonWithBackup('nexray', nxBackupSources('Nexray', ytDlApi));
                        const u2 = (d2.result && d2.result.url) || baseUrl;
                        if (u2) dlT(u2, 'youtube_'+r+'p.mp4'); else throw new Error('URL tidak tersedia');
                    } catch(e2) { alert('Gagal: '+e2.message); }
                    b2.disabled=false; b2.innerHTML='&#8595; '+r+'p';
                };
            });
            document.getElementById('ytMp3Btn').onclick = async () => {
                const mb = document.getElementById('ytMp3Btn'); mb.disabled=true; mb.textContent='...';
                try {
                    const ytMp3Api = 'https://api.nexray.eu.cc/downloader/v1/ytmp3?url='+encodeURIComponent(url);
                    const { data: d3 } = await nxFetchJsonWithBackup('nexray', nxBackupSources('Nexray', ytMp3Api));
                    const u3 = (d3.result && d3.result.url) || d3.url;
                    if (u3) dlT(u3, 'youtube_audio.mp3'); else throw new Error('URL MP3 tidak tersedia');
                } catch(e3) { alert('Gagal MP3: '+e3.message); }
                mb.disabled=false; mb.innerHTML='&#8595; MP3';
            };
        } catch (e) {
            target.innerHTML = `<div class="dl-error"><i class="fas fa-triangle-exclamation"></i><br><br>Gagal ambil info YouTube.<br><span style="font-size:11px;opacity:.7;">${e.message}</span></div>`;
        }
        btn.disabled=false; btn.innerHTML='<i class="fas fa-bolt"></i> Ambil Info';
    };
    document.getElementById('ytFetchBtn').onclick = run;
    document.getElementById('ytUrl').addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
}

function nxEscape(v) {
    return String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

function nxRoundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
}

function nxWrapLines(ctx, text, maxWidth, maxLines) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    words.forEach(word => {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width > maxWidth && line) {
            lines.push(line);
            line = word;
        } else {
            line = test;
        }
    });
    if (line) lines.push(line);
    if (maxLines && lines.length > maxLines) {
        const clipped = lines.slice(0, maxLines);
        clipped[maxLines - 1] = clipped[maxLines - 1].replace(/\s+$/, '') + '...';
        return clipped;
    }
    return lines.length ? lines : [''];
}

function nxDrawWrapped(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    const lines = nxWrapLines(ctx, text, maxWidth, maxLines);
    lines.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight));
    return y + lines.length * lineHeight;
}

function nxCanvasDownload(canvas, filename) {
    recordDownload('Maker', 'PNG', '', filename, filename || 'Canvas PNG');
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = filename;
    a.dataset.historyRecorded = '1';
    document.body.appendChild(a);
    a.click();
    a.remove();
}

function nxTriggerDownload(url, filename, markHistory, openInNewTab) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    if (openInNewTab) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
    }
    if (markHistory) a.dataset.historyRecorded = '1';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { try { a.remove(); } catch (_) {} }, 1000);
}

function nxMediaDownloadEndpoint(url, filename, type, probe) {
    const params = new URLSearchParams();
    params.set('url', url);
    params.set('filename', filename);
    params.set('type', type);
    if (probe) params.set('probe', '1');
    return '/api/media-download?' + params.toString();
}

async function nxDownloadUrl(url, filename, meta) {
    const cleanName = filename || 'download';
    const type = cleanName.split('.').pop().toUpperCase();
    const tool = (meta && meta.tool) || 'Tools';
    const declaredType = String((meta && meta.type) || type || 'FILE').toUpperCase();
    const proxyDownload = ['instagram', 'terabox', 'tiktok'].includes(String(tool).toLowerCase()) && /^https:\/\//i.test(String(url || ''));

    if (!proxyDownload) {
        recordDownload(tool, declaredType, url, cleanName, (meta && meta.title) || cleanName);
        nxTriggerDownload(url, cleanName, true, true);
        return true;
    }

    const probeUrl = nxMediaDownloadEndpoint(url, cleanName, declaredType, true);
    const streamUrl = nxMediaDownloadEndpoint(url, cleanName, declaredType, false);
    const request = window.NexoraFetch || window.fetch.bind(window);
    const response = await request(probeUrl, {
        cache: 'no-store',
        credentials: 'same-origin',
        nexoraTimeoutMs: 24000,
        nexoraRetries: 0
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok || !payload.ready) {
        throw new Error(payload.message || ('Server download merespons HTTP ' + response.status));
    }

    nxTriggerDownload(streamUrl, payload.filename || cleanName, true, false);
    recordDownload(tool, declaredType, url, payload.filename || cleanName, (meta && meta.title) || cleanName);
    return true;
}

function nxShowCanvas(targetId, canvas, filename) {
    const target = document.getElementById(targetId);
    const img = canvas.toDataURL('image/png');
    target.innerHTML = `
        <div class="result-box">
            <img src="${img}" alt="preview" style="width:100%;border-radius:12px;">
            <button class="v-btn" id="${targetId}Dl" style="margin-top:12px;background:rgba(168,85,247,0.12);"><i class="fas fa-download"></i> Download PNG</button>
        </div>
    `;
    document.getElementById(targetId + 'Dl').onclick = () => nxCanvasDownload(canvas, filename);
}

function nxHexClean(value, fallback) {
    const clean = String(value || '').replace('#', '').trim();
    return /^[0-9a-f]{6}$/i.test(clean) ? clean : fallback;
}

function nxLoadLocalImage(file) {
    return new Promise((resolve, reject) => {
        if (!file) return resolve(null);
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}

function nxFindHttp(obj, preferKeys) {
    if (!obj || typeof obj !== 'object') return null;
    const keys = preferKeys || ['download', 'downloadUrl', 'download_url', 'audio', 'mp3', 'file', 'link', 'url'];
    for (const k of keys) {
        if (typeof obj[k] === 'string' && /^https?:\/\//i.test(obj[k]) && !/open\.spotify\.com/i.test(obj[k])) return obj[k];
    }
    for (const k of Object.keys(obj)) {
        if (obj[k] && typeof obj[k] === 'object') {
            const found = nxFindHttp(obj[k], keys);
            if (found) return found;
        }
    }
    return null;
}

function nxFindTitle(obj) {
    if (!obj || typeof obj !== 'object') return '';
    for (const k of ['title', 'name', 'judul', 'song', 'track']) {
        if (typeof obj[k] === 'string' && obj[k].trim()) return obj[k].trim();
    }
    for (const k of ['result', 'data', 'metadata', 'info']) {
        if (obj[k] && typeof obj[k] === 'object') {
            const found = nxFindTitle(obj[k]);
            if (found) return found;
        }
    }
    return '';
}

function renderSpotify(body) {
    if (typeof window.NexoraDownloaderRenderSpotify === 'function') return window.NexoraDownloaderRenderSpotify(body);
    body.innerHTML = '<div class="dl-error">Modul Spotify belum selesai dimuat. Tutup lalu buka kembali tool ini.</div>';
}

function renderBrat(body) {
    let mode = 'static';
    let lastUrl = '';
    body.innerHTML = `
        <h2><i class="fas fa-wand-magic-sparkles"></i> BRAT Generator</h2>
        <p style="color:#8b7ab8;font-size:13px;margin-bottom:12px;">Bisa static PNG atau animated GIF.</p>
        <input type="text" id="bratText" class="v-input" placeholder="Contoh: nexus tools" maxlength="120">
        <div class="provider-buttons" style="grid-template-columns:repeat(2,1fr);">
            <button class="provider-btn active" id="bratStaticBtn"><i class="fas fa-image"></i> Static</button>
            <button class="provider-btn" id="bratGifBtn"><i class="fas fa-film"></i> Animated GIF</button>
        </div>
        <button class="v-btn" id="bratBtn"><i class="fas fa-bolt"></i> Generate BRAT</button>
        <div id="bratResult"></div>
    `;
    document.getElementById('bratStaticBtn').onclick = () => {
        mode = 'static';
        document.getElementById('bratStaticBtn').classList.add('active');
        document.getElementById('bratGifBtn').classList.remove('active');
    };
    document.getElementById('bratGifBtn').onclick = () => {
        mode = 'gif';
        document.getElementById('bratGifBtn').classList.add('active');
        document.getElementById('bratStaticBtn').classList.remove('active');
    };
    function localBrat(text) {
        const canvas = document.createElement('canvas');
        canvas.width = 900;
        canvas.height = 900;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#8ace00';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#111';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        let fontSize = 132;
        const clean = text.toLowerCase();
        do {
            ctx.font = `900 ${fontSize}px Arial, Helvetica, sans-serif`;
            fontSize -= 6;
        } while (ctx.measureText(clean).width > 760 && fontSize > 56);
        const lines = nxWrapLines(ctx, clean, 760, 5);
        const lh = fontSize + 26;
        const start = canvas.height / 2 - ((lines.length - 1) * lh) / 2;
        lines.forEach((line, i) => ctx.fillText(line, canvas.width / 2, start + i * lh));
        ctx.font = '700 26px Arial, Helvetica, sans-serif';
        ctx.globalAlpha = 0.45;
        ctx.fillText('NEXUS BRAT', canvas.width / 2, 842);
        ctx.globalAlpha = 1;
        return canvas;
    }
    document.getElementById('bratBtn').onclick = async () => {
        const text = document.getElementById('bratText').value.trim();
        const target = document.getElementById('bratResult');
        const btn = document.getElementById('bratBtn');
        if (!text) return alert('Isi teks dulu!');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
        target.innerHTML = `<div class="dl-loading"><div class="dl-spin"></div><p>Merender BRAT...</p></div>`;
        const api = 'https://api.siputzx.my.id/api/m/brat?text=' + encodeURIComponent(text) + '&delay=500' + (mode === 'gif' ? '&isAnimated=true' : '');
        try {
            const { blob } = await nxFetchBlobWithBackup('siputzx', nxBackupSources('Siputzx', api));
            if (lastUrl) URL.revokeObjectURL(lastUrl);
            lastUrl = URL.createObjectURL(blob);
            target.innerHTML = `
                <div class="result-box">
                    <img src="${lastUrl}" alt="BRAT" style="width:100%;max-height:420px;object-fit:contain;border-radius:12px;">
                    <button class="v-btn" id="bratDl" style="margin-top:12px;background:rgba(168,85,247,0.12);"><i class="fas fa-download"></i> Download ${mode === 'gif' ? 'GIF' : 'PNG'}</button>
                </div>
            `;
            document.getElementById('bratDl').onclick = () => nxDownloadUrl(lastUrl, 'brat_' + Date.now() + (mode === 'gif' ? '.gif' : '.png'), { tool: 'BRAT', type: mode === 'gif' ? 'GIF' : 'PNG', title: 'BRAT Generator' });
        } catch (e) {
            if (mode === 'gif') {
                target.innerHTML = `<div class="dl-error">Animated GIF gagal dibuat dari API.<br><span style="font-size:11px;opacity:.7;">${nxEscape(e.message)}</span></div>`;
            } else {
                nxShowCanvas('bratResult', localBrat(text), 'brat_' + Date.now() + '.png');
            }
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-bolt"></i> Generate BRAT';
        }
    };
}


function renderEktp(body) {
    body.innerHTML = `
        <h2><i class="fas fa-id-card"></i> E-KTP Generator</h2>
        <p class="nx-note"><i class="fas fa-triangle-exclamation"></i> Mode demo/parodi. Data bawaan memakai contoh palsu dan hasil diberi watermark, bukan dokumen resmi.</p>
        <div class="nx-form-grid">
            <div class="nx-field"><label>Provinsi</label><input type="text" id="ektpProv" class="v-input" placeholder="PROVINSI DEMO" value="PROVINSI DEMO"></div>
            <div class="nx-field"><label>Kab/Kota</label><input type="text" id="ektpKota" class="v-input" placeholder="KOTA DEMO" value="KOTA DEMO"></div>
            <div class="nx-field nx-span-2"><label>NIK Dummy</label><input type="text" id="ektpNik" class="v-input" placeholder="0000000000000000" value="0000000000000000"></div>
            <div class="nx-field"><label>Nama Dummy</label><input type="text" id="ektpNama" class="v-input" placeholder="NAMA CONTOH" value="NAMA CONTOH"></div>
            <div class="nx-field"><label>Tempat/Tgl Lahir</label><input type="text" id="ektpTtl" class="v-input" placeholder="KOTA CONTOH, 01-01-2000" value="KOTA CONTOH, 01-01-2000"></div>
            <div class="nx-field"><label>Jenis Kelamin</label><input type="text" id="ektpJk" class="v-input" placeholder="LAKI-LAKI" value="LAKI-LAKI"></div>
            <div class="nx-field"><label>Gol. Darah</label><input type="text" id="ektpGol" class="v-input" placeholder="-" value="-"></div>
            <div class="nx-field nx-span-2"><label>Alamat Dummy</label><input type="text" id="ektpAlamat" class="v-input" placeholder="JL. CONTOH NO. 01" value="JL. CONTOH NO. 01"></div>
            <div class="nx-field"><label>RT/RW</label><input type="text" id="ektpRt" class="v-input" placeholder="000/000" value="000/000"></div>
            <div class="nx-field"><label>Kel/Desa</label><input type="text" id="ektpKel" class="v-input" placeholder="DESA CONTOH" value="DESA CONTOH"></div>
            <div class="nx-field"><label>Kecamatan</label><input type="text" id="ektpKec" class="v-input" placeholder="KECAMATAN CONTOH" value="KECAMATAN CONTOH"></div>
            <div class="nx-field"><label>Agama</label><input type="text" id="ektpAgama" class="v-input" placeholder="-" value="-"></div>
            <div class="nx-field"><label>Status</label><input type="text" id="ektpStatus" class="v-input" placeholder="-" value="-"></div>
            <div class="nx-field"><label>Pekerjaan</label><input type="text" id="ektpKerja" class="v-input" placeholder="CONTOH" value="CONTOH"></div>
            <div class="nx-field"><label>Kewarganegaraan</label><input type="text" id="ektpWarga" class="v-input" placeholder="WNI" value="WNI"></div>
            <div class="nx-field"><label>Berlaku Hingga</label><input type="text" id="ektpBerlaku" class="v-input" placeholder="DEMO" value="DEMO"></div>
            <div class="nx-field"><label>Tanggal Terbit</label><input type="text" id="ektpTerbit" class="v-input" placeholder="KOTA DEMO, 01-01-2026" value="KOTA DEMO, 01-01-2026"></div>
            <div class="nx-field nx-span-2"><label>Foto Demo Opsional</label><input type="file" id="ektpFoto" class="v-input" accept="image/*"></div>
        </div>
        <button class="v-btn" id="ektpBtn"><i class="fas fa-id-card"></i> Generate E-KTP Demo</button>
        <div id="ektpResult"></div>
    `;
    document.getElementById('ektpBtn').onclick = async () => {
        const v = id => (document.getElementById(id).value || '').trim();
        const photo = await nxLoadLocalImage(document.getElementById('ektpFoto').files[0]).catch(() => null);
        const canvas = document.createElement('canvas');
        canvas.width = 1050;
        canvas.height = 660;
        const ctx = canvas.getContext('2d');
        const bg = ctx.createLinearGradient(0, 0, 1050, 660);
        bg.addColorStop(0, '#a7f3ff');
        bg.addColorStop(0.45, '#dff9ff');
        bg.addColorStop(1, '#6ccde3');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, 1050, 660);
        ctx.fillStyle = 'rgba(255,255,255,.25)';
        for (let x = -100; x < 1100; x += 70) {
            ctx.beginPath();
            ctx.arc(x, 120 + (x % 180), 110, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.textAlign = 'center';
        ctx.fillStyle = '#13203a';
        ctx.font = '900 42px Arial, sans-serif';
        ctx.fillText('PROVINSI ' + (v('ektpProv') || 'PROVINSI DEMO').toUpperCase(), 525, 55);
        ctx.font = '900 34px Arial, sans-serif';
        ctx.fillText('KABUPATEN/KOTA ' + (v('ektpKota') || 'KOTA DEMO').toUpperCase(), 525, 96);
        ctx.textAlign = 'left';
        ctx.font = '900 38px Arial, sans-serif';
        ctx.fillText('NIK', 55, 156);
        ctx.font = '900 42px Arial, sans-serif';
        ctx.fillText(': ' + (v('ektpNik') || '0000000000000000'), 150, 156);
        const rows = [
            ['Nama', v('ektpNama') || 'NAMA CONTOH'],
            ['Tempat/Tgl Lahir', v('ektpTtl') || 'KOTA CONTOH, 01-01-2000'],
            ['Jenis Kelamin', (v('ektpJk') || 'LAKI-LAKI') + '    Gol. Darah: ' + (v('ektpGol') || '-')],
            ['Alamat', v('ektpAlamat') || 'JL. CONTOH NO. 01'],
            ['RT/RW', v('ektpRt') || '000/000'],
            ['Kel/Desa', v('ektpKel') || 'DESA CONTOH'],
            ['Kecamatan', v('ektpKec') || 'KECAMATAN CONTOH'],
            ['Agama', v('ektpAgama') || '-'],
            ['Status Perkawinan', v('ektpStatus') || '-'],
            ['Pekerjaan', v('ektpKerja') || 'CONTOH'],
            ['Kewarganegaraan', v('ektpWarga') || 'WNI'],
            ['Berlaku Hingga', v('ektpBerlaku') || 'DEMO']
        ];
        ctx.font = '700 24px Arial, sans-serif';
        let y = 215;
        rows.forEach(([label, val]) => {
            ctx.fillStyle = '#18223a';
            ctx.fillText(label, 55, y);
            ctx.fillText(':', 285, y);
            ctx.fillStyle = '#10192c';
            ctx.fillText(String(val).toUpperCase(), 310, y);
            y += 34;
        });
        nxRoundRect(ctx, 800, 190, 180, 230, 12);
        ctx.fillStyle = '#eef7fb';
        ctx.fill();
        ctx.save();
        nxRoundRect(ctx, 808, 198, 164, 214, 8);
        ctx.clip();
        if (photo) {
            const ratio = Math.max(164 / photo.width, 214 / photo.height);
            const w = photo.width * ratio, h = photo.height * ratio;
            ctx.drawImage(photo, 808 + (164 - w) / 2, 198 + (214 - h) / 2, w, h);
        } else {
            ctx.fillStyle = '#cbd5e1';
            ctx.fillRect(808, 198, 164, 214);
            ctx.fillStyle = '#64748b';
            ctx.beginPath();
            ctx.arc(890, 270, 42, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(890, 382, 70, Math.PI, 0);
            ctx.fill();
        }
        ctx.restore();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#111827';
        ctx.font = '700 22px Arial, sans-serif';
        ctx.fillText((v('ektpKota') || 'KOTA DEMO').toUpperCase(), 890, 470);
        ctx.font = '700 18px Arial, sans-serif';
        ctx.fillText(v('ektpTerbit') || 'KOTA DEMO, 01-01-2026', 890, 500);
        ctx.font = '900 22px Arial, sans-serif';
        ctx.fillText('DEMO', 890, 565);
        ctx.save();
        ctx.translate(525, 335);
        ctx.rotate(-0.45);
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = '#b91c1c';
        ctx.font = '900 60px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('PARODI - BUKAN DOKUMEN RESMI', 0, 0);
        ctx.restore();
        ctx.strokeStyle = 'rgba(15,23,42,.35)';
        ctx.lineWidth = 3;
        nxRoundRect(ctx, 15, 15, 1020, 630, 24);
        ctx.stroke();
        nxShowCanvas('ektpResult', canvas, 'ektp_demo_' + Date.now() + '.png');
    };
}

function renderFakeDev(body) {
    body.innerHTML = `
        <h2><i class="fas fa-laptop-code"></i> FakeDev Profile</h2>
        <p style="color:#8b7ab8;font-size:13px;line-height:1.6;margin-bottom:14px;">Bikin kartu profil developer palsu yang rapi. Data bawaan hanya contoh.</p>
        <div class="nx-form-grid">
            <div class="nx-field"><label>Nama</label><input type="text" id="fdName" class="v-input" placeholder="Demo Developer" value="Demo Developer"></div>
            <div class="nx-field"><label>Username</label><input type="text" id="fdUser" class="v-input" placeholder="@demo_dev" value="@demo_dev"></div>
            <div class="nx-field"><label>Role</label><input type="text" id="fdRole" class="v-input" placeholder="Full Stack Developer" value="Full Stack Developer"></div>
            <div class="nx-field"><label>Stack</label><input type="text" id="fdStack" class="v-input" placeholder="HTML, CSS, JS, Node" value="HTML, CSS, JS, Node"></div>
            <div class="nx-field"><label>Repositories</label><input type="text" id="fdRepo" class="v-input" placeholder="128" value="128"></div>
            <div class="nx-field"><label>Followers</label><input type="text" id="fdFollowers" class="v-input" placeholder="24.8K" value="24.8K"></div>
            <div class="nx-field"><label>Stars</label><input type="text" id="fdStars" class="v-input" placeholder="9.7K" value="9.7K"></div>
            <div class="nx-field"><label>Rank</label><input type="text" id="fdRank" class="v-input" placeholder="Senior" value="Senior"></div>
            <div class="nx-field nx-span-2"><label>Bio</label><textarea id="fdBio" class="v-textarea" style="height:76px;resize:none;" placeholder="Bio">Ngoding cepat, UI rapi, dan suka bikin project demo.</textarea></div>
        </div>
        <button class="v-btn" id="fdBtn"><i class="fas fa-user-astronaut"></i> Generate Profile</button>
        <div id="fdResult"></div>
    `;
    document.getElementById('fdBtn').onclick = () => {
        const g = id => (document.getElementById(id).value || '').trim();
        const name = g('fdName') || 'Demo Developer';
        const user = g('fdUser') || '@demo_dev';
        const canvas = document.createElement('canvas');
        canvas.width = 1200;
        canvas.height = 900;
        const ctx = canvas.getContext('2d');
        const bg = ctx.createLinearGradient(0, 0, 1200, 900);
        bg.addColorStop(0, '#050014');
        bg.addColorStop(0.55, '#16052c');
        bg.addColorStop(1, '#2d0a52');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, 1200, 900);
        ctx.fillStyle = 'rgba(168,85,247,.12)';
        for (let i = 0; i < 120; i++) {
            ctx.fillRect(Math.random() * 1200, Math.random() * 900, 2, 2);
        }
        nxRoundRect(ctx, 115, 110, 970, 680, 34);
        ctx.fillStyle = 'rgba(15,5,30,.86)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(192,132,252,.45)';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = 'rgba(168,85,247,.2)';
        nxRoundRect(ctx, 115, 110, 970, 160, 34);
        ctx.fill();
        ctx.fillStyle = '#c084fc';
        ctx.font = '900 34px Orbitron, Arial, sans-serif';
        ctx.fillText('FAKEDEV PROFILE', 155, 178);
        ctx.fillStyle = '#7dd3fc';
        ctx.font = '700 22px Poppins, Arial, sans-serif';
        ctx.fillText('NEXUS TOOLS CARD', 155, 218);
        const initials = name.split(/\s+/).slice(0, 2).map(s => s[0] || '').join('').toUpperCase();
        ctx.beginPath();
        ctx.arc(260, 365, 92, 0, Math.PI * 2);
        ctx.fillStyle = '#7c3aed';
        ctx.fill();
        ctx.strokeStyle = '#c084fc';
        ctx.lineWidth = 8;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.font = '900 64px Orbitron, Arial, sans-serif';
        ctx.fillText(initials || 'FD', 260, 387);
        ctx.textAlign = 'left';
        ctx.fillStyle = '#f5f3ff';
        ctx.font = '900 58px Poppins, Arial, sans-serif';
        ctx.fillText(name, 390, 340);
        ctx.fillStyle = '#a78bfa';
        ctx.font = '700 30px Poppins, Arial, sans-serif';
        ctx.fillText(user + ' - ' + (g('fdRole') || 'Full Stack Developer'), 390, 388);
        ctx.fillStyle = '#d8b4fe';
        ctx.font = '500 26px Poppins, Arial, sans-serif';
        nxDrawWrapped(ctx, g('fdBio') || 'Ngoding cepat, UI rapi, dan suka bikin project demo.', 390, 445, 620, 34, 3);
        const stats = [
            ['REPOS', g('fdRepo') || '128'],
            ['FOLLOWERS', g('fdFollowers') || '24.8K'],
            ['STARS', g('fdStars') || '9.7K'],
            ['RANK', g('fdRank') || 'Senior']
        ];
        stats.forEach((s, i) => {
            const x = 160 + i * 240;
            nxRoundRect(ctx, x, 610, 190, 105, 18);
            ctx.fillStyle = 'rgba(168,85,247,.10)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(168,85,247,.24)';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ffffff';
            ctx.font = '900 36px Orbitron, Arial, sans-serif';
            ctx.fillText(s[1], x + 95, 655);
            ctx.fillStyle = '#8b7ab8';
            ctx.font = '800 16px Poppins, Arial, sans-serif';
            ctx.fillText(s[0], x + 95, 690);
        });
        ctx.textAlign = 'left';
        ctx.fillStyle = '#7dd3fc';
        ctx.font = '700 24px Poppins, Arial, sans-serif';
        ctx.fillText('STACK: ' + (g('fdStack') || 'HTML, CSS, JS, Node'), 155, 765);
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(255,255,255,.36)';
        ctx.font = '700 20px Poppins, Arial, sans-serif';
        ctx.fillText('generated by Nexus Tools', 1048, 765);
        nxShowCanvas('fdResult', canvas, 'fakedev_' + Date.now() + '.png');
    };
}

function renderIqc(body) {
    let selectedProvider = 'Axis';
    let globalIqcBlob = '';
    body.innerHTML = `
        <h2><i class="fas fa-image"></i> IQC Generator</h2>
        <label>Pesan:</label>
        <input type="text" id="iqcText" class="v-input" value="Hai">
        <label>Pilih Operator:</label>
        <div class="provider-buttons">
            <button class="provider-btn active" onclick="window.setIqcProv(this,'Axis')">Axis</button>
            <button class="provider-btn" onclick="window.setIqcProv(this,'Telkomsel')">Telkomsel</button>
            <button class="provider-btn" onclick="window.setIqcProv(this,'Indosat')">Indosat</button>
            <button class="provider-btn" onclick="window.setIqcProv(this,'XL')">XL</button>
            <button class="provider-btn" onclick="window.setIqcProv(this,'Three')">Three</button>
            <button class="provider-btn" onclick="window.setIqcProv(this,'Smartfren')">Smartfren</button>
        </div>
        <div style="display:flex;gap:12px;">
            <div style="flex:1;"><label>Jam:</label><input type="number" id="iqcJam" class="v-input" value="12" min="0" max="23"></div>
            <div style="flex:1;"><label>Baterai (%):</label><input type="number" id="iqcBaterai" class="v-input" value="65" min="0" max="100"></div>
        </div>
        <button class="v-btn" id="iqcGenBtn">Generate</button>
        <div id="iqcResultDiv" style="display:none;">
            <div class="iqc-preview" id="iqcPreviewBox"></div>
            <div class="btn-group">
                <button class="v-btn" id="iqcDlBtn">Download PNG</button>
                <button class="v-btn" id="iqcCopyBtn">Copy URL</button>
            </div>
        </div>
    `;
    window.setIqcProv = (btn, prov) => {
        document.querySelectorAll('.provider-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedProvider = prov;
    };
    document.getElementById('iqcGenBtn').onclick = async () => {
        const text = document.getElementById('iqcText').value.trim() || 'Hai';
        const jam = document.getElementById('iqcJam').value || '12';
        const bat = document.getElementById('iqcBaterai').value || '65';
        const resDiv = document.getElementById('iqcResultDiv');
        const preview = document.getElementById('iqcPreviewBox');
        resDiv.style.display = 'block';
        preview.innerHTML = `<div style="color:#8b7ab8;">Menggambar...</div>`;
        try {
            const iqcApi = `https://api.nexray.eu.cc/maker/v1/iqc?text=${encodeURIComponent(text)}&provider=${encodeURIComponent(selectedProvider)}&jam=${jam}&baterai=${bat}`;
            const { blob } = await nxFetchBlobWithBackup('nexray', nxBackupSources('Nexray', iqcApi));
            if (globalIqcBlob) URL.revokeObjectURL(globalIqcBlob);
            globalIqcBlob = URL.createObjectURL(blob);
            preview.innerHTML = `<img src="${globalIqcBlob}" alt="IQC Result">`;
        } catch (e) {
            preview.innerHTML = `<span style="color:#ef4444;">Gagal: ${e.message}</span>`;
        }
    };
    document.getElementById('iqcDlBtn').onclick = () => { if (globalIqcBlob) { const a = document.createElement('a'); a.href = globalIqcBlob; a.download = `IQC_${Date.now()}.png`; a.click(); } };
    document.getElementById('iqcCopyBtn').onclick = () => { if (globalIqcBlob) { navigator.clipboard.writeText(globalIqcBlob); alert('URL disalin!'); } };
}

function renderFakeDana(body) {
    let danaBlobUrl = '';
    body.innerHTML = `
        <h2><i class="fas fa-money-bill-wave"></i> Fake Dana</h2>
        <label>Nominal (Rp):</label>
        <input type="number" id="danaNominal" class="v-input" placeholder="Contoh: 50000" value="10000">
        <button class="v-btn" id="danaGenBtn"><i class="fas fa-bolt"></i> Generate</button>
        <div id="danaResultDiv" style="display:none;">
            <div class="iqc-preview" id="danaPreviewBox"></div>
            <div class="btn-group" style="margin-top:10px;">
                <button class="v-btn" id="danaDlBtn"><i class="fas fa-download"></i> Download PNG</button>
            </div>
        </div>
    `;
    document.getElementById('danaGenBtn').onclick = async () => {
        const nominal = document.getElementById('danaNominal').value.trim() || '10000';
        const resDiv = document.getElementById('danaResultDiv');
        const preview = document.getElementById('danaPreviewBox');
        resDiv.style.display = 'block';
        preview.innerHTML = `<div style="color:#8b7ab8;padding:30px;text-align:center;"><i class="fas fa-spinner fa-spin" style="font-size:28px;"></i><br>Generating...</div>`;
        try {
            const danaApi = `https://api.nexray.eu.cc/maker/fakedana?nominal=${encodeURIComponent(nominal)}`;
            const { blob } = await nxFetchBlobWithBackup('nexray', nxBackupSources('Nexray', danaApi));
            if (danaBlobUrl) URL.revokeObjectURL(danaBlobUrl);
            danaBlobUrl = URL.createObjectURL(blob);
            preview.innerHTML = `<img src="${danaBlobUrl}" alt="Fake Dana" style="width:100%;border-radius:12px;">`;
        } catch (e) {
            preview.innerHTML = `<div style="color:#ef4444;padding:20px;text-align:center;"><i class="fas fa-exclamation-circle"></i> Gagal generate. Coba lagi!</div>`;
        }
    };
    document.getElementById('danaDlBtn').onclick = () => {
        if (!danaBlobUrl) return;
        const a = document.createElement('a');
        a.href = danaBlobUrl;
        a.download = `FakeDana_${Date.now()}.png`;
        a.click();
    };
}

function renderFakeLobby(body) {
    let lobbyBlobUrl = '';
    let lobbyType = 'ff';
    body.innerHTML = `
        <h2><i class="fas fa-gamepad"></i> Fake Lobby</h2>
        <label>Pilih Game:</label>
        <div class="provider-buttons" id="lobbyTypeBtn" style="margin-bottom:12px;">
            <button class="provider-btn active" data-type="ff"><i class="fas fa-fire"></i> Free Fire</button>
            <button class="provider-btn" data-type="ml"><i class="fas fa-sword"></i> Mobile Legends</button>
        </div>
        <label>Nickname:</label>
        <input type="text" id="lobbyNick" class="v-input" placeholder="Masukkan nickname..." value="DikaTools">
        <button class="v-btn" id="lobbyGenBtn"><i class="fas fa-bolt"></i> Generate</button>
        <div id="lobbyResultDiv" style="display:none;">
            <div class="iqc-preview" id="lobbyPreviewBox"></div>
            <div class="btn-group" style="margin-top:10px;">
                <button class="v-btn" id="lobbyDlBtn"><i class="fas fa-download"></i> Download PNG</button>
            </div>
        </div>
    `;
    document.querySelectorAll('#lobbyTypeBtn .provider-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('#lobbyTypeBtn .provider-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            lobbyType = this.dataset.type;
        });
    });
    document.getElementById('lobbyGenBtn').onclick = async () => {
        const nickname = document.getElementById('lobbyNick').value.trim() || 'DikaTools';
        const resDiv = document.getElementById('lobbyResultDiv');
        const preview = document.getElementById('lobbyPreviewBox');
        resDiv.style.display = 'block';
        preview.innerHTML = `<div style="color:#8b7ab8;padding:30px;text-align:center;"><i class="fas fa-spinner fa-spin" style="font-size:28px;"></i><br>Generating ${lobbyType === 'ff' ? 'Free Fire' : 'Mobile Legends'}...</div>`;
        const url = lobbyType === 'ff'
            ? `https://api.nexray.eu.cc/maker/fakelobyff?nickname=${encodeURIComponent(nickname)}`
            : `https://api.nexray.eu.cc/maker/fakelobyml?avatar=https%3A%2F%2Ffiles.catbox.moe%2Feoyme6.jpg&nickname=${encodeURIComponent(nickname)}`;
        try {
            const { blob } = await nxFetchBlobWithBackup('nexray', nxBackupSources('Nexray', url));
            if (lobbyBlobUrl) URL.revokeObjectURL(lobbyBlobUrl);
            lobbyBlobUrl = URL.createObjectURL(blob);
            preview.innerHTML = `<img src="${lobbyBlobUrl}" alt="Fake Lobby" style="width:100%;border-radius:12px;">`;
        } catch (e) {
            preview.innerHTML = `<div style="color:#ef4444;padding:20px;text-align:center;"><i class="fas fa-exclamation-circle"></i> Gagal generate. Coba lagi!</div>`;
        }
    };
    document.getElementById('lobbyDlBtn').onclick = () => {
        if (!lobbyBlobUrl) return;
        const a = document.createElement('a');
        a.href = lobbyBlobUrl;
        a.download = `FakeLobby_${Date.now()}.png`;
        a.click();
    };
}

function renderWinquotes(body) {
    body.innerHTML = `
        <h2><i class="fa-brands fa-windows"></i> Windows Quotes</h2>
        <p style="color:#8b7ab8;font-size:13px;margin-bottom:12px;">Buat gambar kutipan ala notifikasi Windows memakai API Nanzz, dengan backup/proxy otomatis.</p>
        <textarea id="wqText" class="v-textarea" maxlength="240" placeholder="Masukkan kutipan..." style="min-height:96px;"></textarea>
        <input id="wqAuthor" class="v-input" maxlength="50" placeholder="Nama / sumber (opsional)">
        <button class="v-btn" id="wqBtn"><i class="fas fa-magic"></i> Buat Gambar</button>
        <div id="wqResult"></div>`;
    document.getElementById('wqBtn').onclick = async () => {
        const text = document.getElementById('wqText').value.trim();
        const author = document.getElementById('wqAuthor').value.trim();
        const btn = document.getElementById('wqBtn');
        const target = document.getElementById('wqResult');
        if (!text) return alert('Isi teks quote terlebih dahulu!');
        const finalText = author ? `${text}\n— ${author}` : text;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menghubungi API...';
        target.innerHTML = `<div class="result-box"><i class="fas fa-spinner spin"></i><br>Merender lewat API...</div>`;
        try {
            const { img, source } = await nxFetchImageWithBackup('nanzz', nxNanzzMakerSources('windows-quotes', finalText));
            nxRenderImageResult(target, img, `windows_quote_${Date.now()}.png`, 'Dibuat lewat API Nanzz' + (source && source.name ? ' · ' + source.name : '') + '.');
        } catch (e) {
            target.innerHTML = `<div class="result-box" style="color:#ef4444;">Gagal membuat gambar lewat API: ${nxEscape(e.message)}</div>`;
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-magic"></i> Buat Gambar';
        }
    };
}

function renderTanyaUstadz(body) {
    body.innerHTML = `
        <h2><i class="fas fa-user-tie"></i> Tanya Ustadz</h2>
        <p style="color:#8b7ab8;font-size:13px;margin-bottom:12px;">Buat meme Tanya Ustadz memakai API Nanzz, dengan backup/proxy otomatis.</p>
        <textarea id="tuText" class="v-textarea" maxlength="260" placeholder="Contoh: Ustadz, apakah rebahan termasuk olahraga?" style="min-height:96px;"></textarea>
        <button class="v-btn" id="tuBtn"><i class="fas fa-magic"></i> Buat Meme</button>
        <div id="tuResult"></div>`;
    document.getElementById('tuBtn').onclick = async () => {
        const text = document.getElementById('tuText').value.trim();
        const btn = document.getElementById('tuBtn');
        const target = document.getElementById('tuResult');
        if (!text) return alert('Isi pertanyaan terlebih dahulu!');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menghubungi API...';
        target.innerHTML = `<div class="result-box"><i class="fas fa-spinner spin"></i><br>Merender lewat API...</div>`;
        try {
            const { img, source } = await nxFetchImageWithBackup('nanzz', nxNanzzMakerSources('tanyaustadz', text));
            nxRenderImageResult(target, img, `tanya_ustadz_${Date.now()}.png`, 'Dibuat lewat API Nanzz' + (source && source.name ? ' · ' + source.name : '') + '.');
        } catch (e) {
            target.innerHTML = `<div class="result-box" style="color:#ef4444;">Gagal membuat meme lewat API: ${nxEscape(e.message)}</div>`;
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-magic"></i> Buat Meme';
        }
    };
}

function renderQrGenerator(body) {
    body.innerHTML = `
        <h2><i class="fas fa-qrcode"></i> QR Generator</h2>
        <p style="color:#8b7ab8;font-size:13px;margin-bottom:12px;">Buat QR langsung dari teks atau link, tanpa pindah ke website lain.</p>
        <textarea id="qrText" class="v-textarea" style="height:86px;resize:none;" placeholder="Masukkan link atau teks...">https://nexus-tools.my.id</textarea>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:10px 0;">
            <div>
                <label>Warna QR</label>
                <input type="color" id="qrFg" class="v-input" value="#111111" style="height:46px;padding:6px;">
            </div>
            <div>
                <label>Background</label>
                <input type="color" id="qrBg" class="v-input" value="#ffffff" style="height:46px;padding:6px;">
            </div>
        </div>
        <button class="v-btn" id="qrBtn"><i class="fas fa-bolt"></i> Generate QR</button>
        <div id="qrResult"></div>
    `;
    function buildQrUrl() {
        const text = document.getElementById('qrText').value.trim() || 'NEXUS TOOLS';
        const fg = nxHexClean(document.getElementById('qrFg').value, '111111');
        const bg = nxHexClean(document.getElementById('qrBg').value, 'ffffff');
        return 'https://api.qrserver.com/v1/create-qr-code/?size=900x900&margin=24&color=' + fg + '&bgcolor=' + bg + '&data=' + encodeURIComponent(text);
    }
    document.getElementById('qrBtn').onclick = () => {
        const text = document.getElementById('qrText').value.trim();
        const target = document.getElementById('qrResult');
        if (!text) return alert('Isi teks atau link dulu!');
        const url = buildQrUrl();
        target.innerHTML = `
            <div class="result-box">
                <img src="${url}" alt="QR Code" style="width:100%;max-width:360px;display:block;margin:0 auto;border-radius:14px;background:#fff;padding:10px;">
                <div class="btn-group" style="margin-top:12px;">
                    <button class="v-btn" id="qrDownloadBtn"><i class="fas fa-download"></i> Download PNG</button>
                    <button class="v-btn" id="qrCopyBtn" style="background:rgba(168,85,247,0.12);"><i class="fas fa-copy"></i> Copy QR Link</button>
                </div>
            </div>
        `;
        document.getElementById('qrDownloadBtn').onclick = () => nxDownloadUrl(url, 'qr_' + Date.now() + '.png', { tool: 'QR Generator', type: 'PNG', title: 'QR Code' });
        document.getElementById('qrCopyBtn').onclick = () => navigator.clipboard.writeText(url).then(() => alert('Link QR disalin!'));
    };
}

function renderTiktokQuote(body) {
    body.innerHTML = `
        <h2><i class="fa-brands fa-tiktok"></i> TikTok Quote</h2>
        <p style="color:#8b7ab8;font-size:13px;margin-bottom:12px;">Buat quote style TikTok langsung dari canvas, bukan pindah link.</p>
        <div class="nx-form-grid">
            <div class="nx-field"><label>Nama</label><input type="text" id="ttqName" class="v-input" value="Dika Tools" placeholder="Nama"></div>
            <div class="nx-field"><label>Username</label><input type="text" id="ttqUser" class="v-input" value="@vyan_tools" placeholder="@username"></div>
            <div class="nx-field"><label>Likes</label><input type="text" id="ttqLikes" class="v-input" value="128.4K" placeholder="128.4K"></div>
            <div class="nx-field"><label>Komentar</label><input type="text" id="ttqComments" class="v-input" value="9.8K" placeholder="9.8K"></div>
            <div class="nx-field nx-span-2"><label>Quote</label><textarea id="ttqText" class="v-textarea" style="height:92px;resize:none;" placeholder="Tulis quote...">Jangan tunggu sempurna, yang penting jalan dulu lalu rapikan.</textarea></div>
        </div>
        <button class="v-btn" id="ttqBtn"><i class="fas fa-wand-magic-sparkles"></i> Generate Quote</button>
        <div id="ttqResult"></div>
    `;
    document.getElementById('ttqBtn').onclick = () => {
        const name = document.getElementById('ttqName').value.trim() || 'Dika Tools';
        const user = document.getElementById('ttqUser').value.trim() || '@vyan_tools';
        const likes = document.getElementById('ttqLikes').value.trim() || '0';
        const comments = document.getElementById('ttqComments').value.trim() || '0';
        const quote = document.getElementById('ttqText').value.trim() || 'Tulis quote kamu di sini.';
        const canvas = document.createElement('canvas');
        canvas.width = 1080;
        canvas.height = 1350;
        const ctx = canvas.getContext('2d');
        const bg = ctx.createLinearGradient(0, 0, 1080, 1350);
        bg.addColorStop(0, '#08080d');
        bg.addColorStop(0.48, '#14101f');
        bg.addColorStop(1, '#050508');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, 1080, 1350);
        ctx.fillStyle = 'rgba(37,244,238,.18)';
        ctx.beginPath();
        ctx.arc(160, 210, 180, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(254,44,85,.18)';
        ctx.beginPath();
        ctx.arc(900, 1120, 220, 0, Math.PI * 2);
        ctx.fill();
        nxRoundRect(ctx, 74, 92, 932, 1166, 44);
        ctx.fillStyle = 'rgba(255,255,255,.065)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.12)';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = '#25f4ee';
        ctx.font = '900 42px Arial, sans-serif';
        ctx.fillText('TikTok', 118, 170);
        ctx.fillStyle = '#fe2c55';
        ctx.fillText('Quote', 258, 170);
        ctx.fillStyle = 'rgba(255,255,255,.13)';
        nxRoundRect(ctx, 118, 224, 844, 720, 34);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 62px Poppins, Arial, sans-serif';
        ctx.textAlign = 'left';
        nxDrawWrapped(ctx, '"' + quote + '"', 164, 342, 750, 78, 7);
        ctx.fillStyle = 'rgba(255,255,255,.72)';
        ctx.font = '700 30px Poppins, Arial, sans-serif';
        ctx.fillText('- ' + name, 164, 872);
        ctx.fillStyle = '#0f1018';
        nxRoundRect(ctx, 118, 988, 844, 174, 34);
        ctx.fill();
        const avatarGrad = ctx.createLinearGradient(150, 1020, 260, 1130);
        avatarGrad.addColorStop(0, '#25f4ee');
        avatarGrad.addColorStop(1, '#fe2c55');
        ctx.fillStyle = avatarGrad;
        ctx.beginPath();
        ctx.arc(206, 1075, 56, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '900 38px Poppins, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText((name[0] || 'V').toUpperCase(), 206, 1089);
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 32px Poppins, Arial, sans-serif';
        ctx.fillText(name, 292, 1058);
        ctx.fillStyle = 'rgba(255,255,255,.58)';
        ctx.font = '700 24px Poppins, Arial, sans-serif';
        ctx.fillText(user.startsWith('@') ? user : '@' + user, 292, 1096);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 28px Arial, sans-serif';
        ctx.fillText(likes + ' likes', 920, 1058);
        ctx.fillStyle = 'rgba(255,255,255,.58)';
        ctx.font = '800 22px Arial, sans-serif';
        ctx.fillText(comments + ' comments', 920, 1096);
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,.28)';
        ctx.font = '800 22px Poppins, Arial, sans-serif';
        ctx.fillText('Generated by NEXUS TOOLS', 540, 1228);
        nxShowCanvas('ttqResult', canvas, 'tiktok_quote_' + Date.now() + '.png');
    };
}


function nxEvaluateMathExpression(expression) {
    const source = String(expression ?? '')
        .trim()
        .replace(/[\u00d7x]/gi, '*')
        .replace(/\u00f7/g, '/')
        .replace(/,/g, '.');

    if (!source || source.length > 160 || /[^0-9+\-*/%^().\s]/.test(source)) {
        throw new Error('INVALID_EXPRESSION');
    }

    let index = 0;
    const skipSpaces = () => {
        while (/\s/.test(source[index] || '')) index += 1;
    };

    const parseNumber = () => {
        skipSpaces();
        const match = source.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
        if (!match) throw new Error('NUMBER_EXPECTED');
        index += match[0].length;
        const value = Number(match[0]);
        if (!Number.isFinite(value)) throw new Error('INVALID_NUMBER');
        return value;
    };

    const parsePrimary = () => {
        skipSpaces();
        if (source[index] !== '(') return parseNumber();
        index += 1;
        const value = parseExpression();
        skipSpaces();
        if (source[index] !== ')') throw new Error('PARENTHESIS_EXPECTED');
        index += 1;
        return value;
    };

    const parsePower = () => {
        let value = parsePrimary();
        skipSpaces();
        if (source[index] === '^') {
            index += 1;
            value = Math.pow(value, parseUnary());
        }
        return value;
    };

    const parseUnary = () => {
        skipSpaces();
        if (source[index] === '+') {
            index += 1;
            return parseUnary();
        }
        if (source[index] === '-') {
            index += 1;
            return -parseUnary();
        }
        return parsePower();
    };

    const parseTerm = () => {
        let value = parseUnary();
        while (true) {
            skipSpaces();
            const operator = source[index];
            if (!['*', '/', '%'].includes(operator)) break;
            index += 1;
            const right = parseUnary();
            if (operator === '*') value *= right;
            else if (operator === '/') value /= right;
            else value %= right;
        }
        return value;
    };

    const parseExpression = () => {
        let value = parseTerm();
        while (true) {
            skipSpaces();
            const operator = source[index];
            if (operator !== '+' && operator !== '-') break;
            index += 1;
            const right = parseTerm();
            value = operator === '+' ? value + right : value - right;
        }
        return value;
    };

    const result = parseExpression();
    skipSpaces();
    if (index !== source.length || !Number.isFinite(result)) throw new Error('INVALID_RESULT');
    return Object.is(result, -0) ? 0 : result;
}

function renderCalc(body) {
    body.innerHTML = `
        <h2><i class="fas fa-calculator"></i> Calculator</h2>
        <input type="text" id="calcInput" class="v-input" placeholder="Contoh: (50*2)+20">
        <button class="v-btn" id="calcBtn"><i class="fas fa-equals"></i> Hitung</button>
        <div id="calcResult"></div>
    `;
    const input = document.getElementById('calcInput');
    const button = document.getElementById('calcBtn');
    const result = document.getElementById('calcResult');
    const calculate = () => {
        try {
            const value = nxEvaluateMathExpression(input.value);
            const output = document.createElement('div');
            output.className = 'result-box';
            output.style.cssText = 'font-weight:600;font-size:18px;color:#c084fc;';
            output.textContent = '= ' + new Intl.NumberFormat('id-ID', { maximumFractionDigits: 12 }).format(value);
            result.replaceChildren(output);
        } catch {
            const output = document.createElement('div');
            output.className = 'result-box';
            output.style.color = '#ef4444';
            output.textContent = 'Format tidak valid. Gunakan angka, kurung, dan operator + - \u00d7 \u00f7 % ^.';
            result.replaceChildren(output);
        }
    };
    button.addEventListener('click', calculate);
    input.addEventListener('keydown', event => {
        if (event.key === 'Enter') calculate();
    });
}

function nxSecureRandomString(length, pool) {
    const cryptoApi = window.crypto;
    if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') {
        throw new Error('SECURE_RANDOM_UNAVAILABLE');
    }
    const size = Math.max(8, Math.min(128, Number(length) || 14));
    const alphabet = String(pool || '');
    const unbiasedLimit = 256 - (256 % alphabet.length);
    let output = '';
    while (output.length < size) {
        const bytes = new Uint8Array(Math.min(64, (size - output.length) * 2));
        cryptoApi.getRandomValues(bytes);
        for (const byte of bytes) {
            if (byte >= unbiasedLimit) continue;
            output += alphabet[byte % alphabet.length];
            if (output.length === size) break;
        }
    }
    return output;
}

function renderPwgen(body) {
    body.innerHTML = `
        <h2><i class="fas fa-key"></i> Password Generator</h2>
        <label>Panjang: <span id="lengthVal" style="font-weight:bold;color:#c084fc;">14</span></label>
        <input type="range" id="pwLen" min="8" max="32" value="14" style="width:100%;margin:10px 0;accent-color:#7c3aed;">
        <button class="v-btn" id="genPwBtn"><i class="fas fa-shield-alt"></i> Generate</button>
        <div id="pwResult" aria-live="polite"></div>
    `;
    const lengthInput = document.getElementById('pwLen');
    const lengthValue = document.getElementById('lengthVal');
    lengthInput.addEventListener('input', () => { lengthValue.textContent = lengthInput.value; });
    document.getElementById('genPwBtn').onclick = () => {
        const len = parseInt(lengthInput.value, 10);
        const pool = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()";
        const target = document.getElementById('pwResult');
        try {
            const password = nxSecureRandomString(len, pool);
            const box = document.createElement('div');
            box.className = 'result-box';
            const output = document.createElement('input');
            output.type = 'text';
            output.className = 'v-input';
            output.readOnly = true;
            output.value = password;
            output.style.cssText = 'text-align:center;font-family:monospace;font-size:16px;background:rgba(168,85,247,0.04);';
            const copy = document.createElement('button');
            copy.type = 'button';
            copy.className = 'v-btn';
            copy.style.cssText = 'margin-top:8px;background:rgba(168,85,247,0.12);';
            copy.textContent = 'Salin';
            copy.addEventListener('click', async () => {
                try {
                    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') throw new Error('CLIPBOARD_UNAVAILABLE');
                    await navigator.clipboard.writeText(password);
                    copy.textContent = 'Tersalin!';
                    setTimeout(() => { copy.textContent = 'Salin'; }, 1400);
                } catch {
                    output.focus();
                    output.select();
                    copy.textContent = 'Pilih lalu salin';
                }
            });
            box.append(output, copy);
            target.replaceChildren(box);
        } catch {
            const error = document.createElement('div');
            error.className = 'result-box';
            error.style.color = '#ef4444';
            error.textContent = 'Generator acak aman tidak tersedia di browser ini.';
            target.replaceChildren(error);
        }
    };
}

function renderMorse(body) {
    body.innerHTML = `
        <h2><i class="fas fa-tower-broadcast"></i> Morse Converter</h2>
        <div style="display:flex;gap:8px;margin-bottom:12px;">
            <button class="provider-btn active" id="modeT2M" style="flex:1;"><i class="fas fa-keyboard"></i> Teks → Morse</button>
            <button class="provider-btn" id="modeM2T" style="flex:1;"><i class="fas fa-braille"></i> Morse → Teks</button>
        </div>
        <div style="position:relative;">
            <textarea id="morseIn" class="v-textarea" style="height:80px;resize:none;padding-right:40px;" placeholder="Ketik teks di sini..."></textarea>
            <button id="morseClearBtn" title="Hapus" style="position:absolute;top:8px;right:8px;background:rgba(239,68,68,0.12);border:none;border-radius:8px;width:28px;height:28px;color:#ef4444;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;"><i class="fas fa-times"></i></button>
        </div>
        <div id="morseVisual" style="display:flex;flex-wrap:wrap;gap:6px;padding:10px 0 4px;min-height:32px;"></div>
        <div id="morseResult" style="margin-top:6px;"></div>
        <div id="morseActions" style="display:none;gap:8px;margin-top:10px;display:none;">
            <button class="v-btn" id="morsePlayBtn" style="background:rgba(168,85,247,0.1);border:1px solid rgba(168,85,247,0.2);"><i class="fas fa-volume-up"></i> Putar Suara</button>
            <button class="v-btn" id="morseCopyBtn" style="background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.15);"><i class="fas fa-copy"></i> Salin Hasil</button>
        </div>
        <div id="morseSpeedWrap" style="margin-top:12px;display:none;">
            <label style="font-size:11px;color:#6a5a8a;font-weight:700;">KECEPATAN PUTAR</label>
            <input type="range" id="morseSpeed" min="1" max="5" value="3" style="width:100%;accent-color:#a855f7;margin-top:6px;">
            <div style="display:flex;justify-content:space-between;font-size:10px;color:#6a5a8a;font-weight:700;"><span>Lambat</span><span>Cepat</span></div>
        </div>
    `;
    const dict = { 'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.', 'G': '--.', 'H': '....', 'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..', 'M': '--', 'N': '-.', 'O': '---', 'P': '.--.', 'Q': '--.-', 'R': '.-.', 'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-', 'Y': '-.--', 'Z': '--..', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.', '0': '-----', ' ': '/' };
    const rev = {}; for (let k in dict) rev[dict[k]] = k;
    let currentMode = 't2m';
    let lastOut = '';
    let isPlaying = false;

    function updateVisualDots(morseStr) {
        const vis = document.getElementById('morseVisual');
        if (!morseStr) { vis.innerHTML = ''; return; }
        vis.innerHTML = morseStr.split('').map(c => {
            if (c === '.') return `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#a855f7;box-shadow:0 0 6px #a855f7;animation:morsePop 0.2s ease;"></span>`;
            if (c === '-') return `<span style="display:inline-block;width:26px;height:10px;border-radius:5px;background:#6366f1;box-shadow:0 0 6px #6366f1;animation:morsePop 0.2s ease;"></span>`;
            if (c === ' ') return `<span style="display:inline-block;width:10px;"></span>`;
            if (c === '/') return `<span style="display:inline-block;width:18px;height:10px;background:rgba(255,255,255,0.1);border-radius:3px;"></span>`;
            return '';
        }).join('');
    }

    if (!document.getElementById('morsePopStyle')) {
        const s = document.createElement('style');
        s.id = 'morsePopStyle';
        s.textContent = '@keyframes morsePop{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}';
        document.head.appendChild(s);
    }

    function doConvert() {
        const val = document.getElementById('morseIn').value.trim().toUpperCase();
        const resDiv = document.getElementById('morseResult');
        const actions = document.getElementById('morseActions');
        const speedWrap = document.getElementById('morseSpeedWrap');
        if (!val) { resDiv.innerHTML = ''; updateVisualDots(''); actions.style.display = 'none'; speedWrap.style.display = 'none'; lastOut = ''; return; }
        let out = '';
        if (currentMode === 't2m') {
            let arr = []; for (let c of val) { arr.push(dict[c] || '?'); } out = arr.join(' ');
            updateVisualDots(out);
        } else {
            let tokens = val.split(' ');
            for (let t of tokens) { if (rev[t]) out += rev[t]; else if (t === '/') out += ' '; else if (t === '') out += ''; else out += '?'; }
            updateVisualDots('');
        }
        lastOut = out;
        resDiv.innerHTML = `<div class="result-box" style="background:rgba(168,85,247,0.06);border:1px solid rgba(168,85,247,0.15);border-radius:14px;padding:14px;margin-top:4px;"><p style="font-size:10px;font-weight:900;color:#6a5a8a;letter-spacing:1px;margin-bottom:6px;">HASIL</p><p style="font-family:monospace;font-size:${currentMode==='t2m'?'17':'20'}px;font-weight:700;word-break:break-all;letter-spacing:${currentMode==='t2m'?'3':'1'}px;color:#c084fc;line-height:1.6;">${out}</p></div>`;
        actions.style.display = 'flex';
        if (currentMode === 't2m') speedWrap.style.display = 'block';
    }

    document.getElementById('morseIn').addEventListener('input', doConvert);
    document.getElementById('morseClearBtn').addEventListener('click', () => {
        document.getElementById('morseIn').value = '';
        doConvert();
    });
    document.getElementById('modeT2M').addEventListener('click', () => {
        currentMode = 't2m';
        document.getElementById('modeT2M').classList.add('active');
        document.getElementById('modeM2T').classList.remove('active');
        document.getElementById('morseIn').placeholder = 'Ketik teks di sini...';
        document.getElementById('morseIn').value = '';
        doConvert();
    });
    document.getElementById('modeM2T').addEventListener('click', () => {
        currentMode = 'm2t';
        document.getElementById('modeM2T').classList.add('active');
        document.getElementById('modeT2M').classList.remove('active');
        document.getElementById('morseIn').placeholder = 'Ketik kode morse (titik, strip, spasi)...';
        document.getElementById('morseIn').value = '';
        doConvert();
    });
    document.getElementById('morseCopyBtn').addEventListener('click', () => {
        if (!lastOut) return;
        navigator.clipboard.writeText(lastOut).then(() => {
            const btn = document.getElementById('morseCopyBtn');
            btn.innerHTML = '<i class="fas fa-check"></i> Tersalin!';
            setTimeout(() => { btn.innerHTML = '<i class="fas fa-copy"></i> Salin Hasil'; }, 1500);
        });
    });
    document.getElementById('morsePlayBtn').addEventListener('click', () => {
        if (!lastOut || currentMode !== 't2m' || isPlaying) return;
        const speed = parseInt(document.getElementById('morseSpeed').value);
        const dotDur = 0.22 - (speed - 1) * 0.04;
        isPlaying = true;
        const btn = document.getElementById('morsePlayBtn');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memutar...';
        const ctx = new(window.AudioContext || window.webkitAudioContext)();
        let time = ctx.currentTime;
        const dot = dotDur, dash = dot * 3;
        const dots = document.getElementById('morseVisual').children;
        let totalDur = 0;
        lastOut.split('').forEach(char => {
            if (char === '.') totalDur += dot + dot;
            else if (char === '-') totalDur += dash + dot;
            else if (char === ' ') totalDur += dash;
            else if (char === '/') totalDur += dot * 7;
        });
        lastOut.split('').forEach(char => {
            if (char === '.' || char === '-') {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(620, time);
                const dur = char === '.' ? dot : dash;
                osc.connect(gain); gain.connect(ctx.destination);
                gain.gain.setValueAtTime(0, time);
                gain.gain.linearRampToValueAtTime(0.18, time + 0.01);
                gain.gain.setValueAtTime(0.18, time + dur - 0.01);
                gain.gain.linearRampToValueAtTime(0, time + dur);
                osc.start(time); osc.stop(time + dur + 0.02);
                time += dur + dot;
            } else if (char === ' ') time += dash;
            else if (char === '/') time += dot * 7;
        });
        setTimeout(() => {
            isPlaying = false;
            btn.innerHTML = '<i class="fas fa-volume-up"></i> Putar Suara';
        }, totalDur * 1000 + 300);
    });
}

function renderRemovebg(body) {
    body.innerHTML = `
        <h2><i class="fas fa-eraser"></i> Remove Background</h2>
        <p style="color:#8b7ab8;font-size:13px;margin-bottom:12px;">Upload gambar dan hapus latar langsung di perangkat. Model AI memakai mode ringan untuk Android; fallback lokal tetap tersedia jika model gagal dimuat.</p>
        <input type="url" id="removebgUrl" class="v-input" placeholder="URL gambar (opsional)">
        <input type="file" id="removebgFile" accept="image/png,image/jpeg,image/webp,image/jpg" style="display:none">
        <label for="removebgFile" style="display:flex;justify-content:center;align-items:center;gap:8px;width:100%;padding:13px;margin:10px 0;background:rgba(168,85,247,.06);border:1px dashed rgba(168,85,247,.28);border-radius:14px;cursor:pointer;font-size:13px;color:#b9a0e9;">
            <i class="fas fa-cloud-arrow-up"></i> <span id="uploadText">Pilih Gambar</span>
        </label>
        <div id="fileName" style="text-align:center;color:#6a5a8a;font-size:12px;margin-bottom:12px;">Belum ada file</div>
        <button class="v-btn" id="removebgBtn"><i class="fas fa-wand-magic-sparkles"></i> Hapus Background</button>
        <div id="removebgResult"></div>`;
    const fileInput = document.getElementById('removebgFile');
    fileInput.onchange = () => {
        const file = fileInput.files[0];
        if (file && file.size > 12 * 1024 * 1024) {
            alert('Ukuran gambar maksimal 12 MB.');
            fileInput.value = '';
        }
        document.getElementById('uploadText').textContent = fileInput.files[0] ? 'Ganti Gambar' : 'Pilih Gambar';
        document.getElementById('fileName').textContent = fileInput.files[0] ? fileInput.files[0].name : 'Belum ada file';
    };

    document.getElementById('removebgBtn').onclick = async () => {
        const url = document.getElementById('removebgUrl').value.trim();
        const file = fileInput.files[0];
        const btn = document.getElementById('removebgBtn');
        const result = document.getElementById('removebgResult');
        if (!url && !file) return alert('Masukkan URL atau pilih gambar!');

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memproses AI…';
        const updateStatus = message => {
            result.innerHTML = `<div class="result-box"><i class="fas fa-spinner spin"></i><br>${nxEscape(message)}</div>`;
        };
        updateStatus('Menyiapkan gambar…');

        let localFailure = null;
        try {
            const output = await nxRemoveBackgroundLocalFirst(file, url, updateStatus);
            const api = getApiById('nanzz');
            if (api) setApiStatus(api, 'ok', 'Remove BG lokal siap');
            nxRenderImageResult(
                result,
                output.img,
                `removebg_${Date.now()}.png`,
                output.degraded
                    ? 'Selesai memakai fallback lokal. Hasil terbaik diperoleh pada background yang cukup seragam.'
                    : 'Selesai memakai AI lokal di perangkat. Gambar tidak dikirim ke API Nanzz.'
            );
            return;
        } catch (error) {
            localFailure = error;
        }

        updateStatus('AI lokal gagal. Mencoba API cadangan…');
        try {
            let img, sourceName = 'Upload API';
            if (url) {
                const response = await nxFetchImageWithBackup('nanzz', nxImageUrlSources('removebg', url), {
                    nexoraTimeoutMs: 10000,
                    nexoraRetries: 0
                });
                img = response.img;
                sourceName = response.source && response.source.name ? response.source.name : 'URL API';
            } else {
                img = await nxPostImageFile('nanzz', nxImageEndpoints('removebg'), file, {
                    timeoutMs: 10000,
                    maxAttempts: 6
                });
            }
            nxRenderImageResult(result, img, `removebg_${Date.now()}.png`, 'AI lokal tidak tersedia; hasil dibuat lewat ' + sourceName + '.');
        } catch (apiError) {
            const localMessage = localFailure && localFailure.message ? localFailure.message : 'AI lokal gagal';
            const apiMessage = apiError && apiError.message ? apiError.message : 'API gagal';
            result.innerHTML = `<div class="result-box" style="color:#fda4af;"><b>Remove Background gagal.</b><br>${nxEscape(localMessage)}<br>Cadangan API: ${nxEscape(apiMessage)}<br><small>Coba gambar JPG/PNG yang lebih kecil atau gunakan file upload, bukan URL.</small></div>`;
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> Hapus Background';
        }
    };
}

function renderEnhancer(body) {
    body.innerHTML = `
        <h2><i class="fas fa-magic"></i> Image Enhancer</h2>
        <p style="color:#8b7ab8;font-size:13px;margin-bottom:12px;">Perbesar, tajamkan detail, dan tingkatkan warna gambar langsung di browser.</p>
        <input type="url" id="enhancerUrl" class="v-input" placeholder="URL gambar (opsional)">
        <input type="file" id="enhancerFile" accept="image/png,image/jpeg,image/webp" style="display:none">
        <label for="enhancerFile" style="display:flex;justify-content:center;align-items:center;gap:8px;width:100%;padding:13px;margin:10px 0;background:rgba(168,85,247,.06);border:1px dashed rgba(168,85,247,.28);border-radius:14px;cursor:pointer;font-size:13px;color:#b9a0e9;">
            <i class="fas fa-cloud-arrow-up"></i> <span id="enhancerUploadText">Pilih Gambar</span>
        </label>
        <div id="enhancerFileName" style="text-align:center;color:#6a5a8a;font-size:12px;margin-bottom:10px;">Belum ada file</div>
        <label style="font-size:12px;color:#8b7ab8;">Kekuatan: <b id="enhancerStrengthLabel">55%</b></label>
        <input type="range" id="enhancerStrength" min="10" max="100" value="55" style="width:100%;margin:8px 0 16px;accent-color:#a855f7;">
        <button class="v-btn" id="enhancerBtn"><i class="fas fa-wand-magic-sparkles"></i> Tingkatkan Gambar</button>
        <div id="enhancerResult"></div>`;
    const fileInput = document.getElementById('enhancerFile');
    const strength = document.getElementById('enhancerStrength');
    strength.oninput = () => document.getElementById('enhancerStrengthLabel').textContent = strength.value + '%';
    fileInput.onchange = () => {
        const file = fileInput.files[0];
        if (file && file.size > 16 * 1024 * 1024) { alert('Ukuran gambar maksimal 16 MB.'); fileInput.value=''; }
        document.getElementById('enhancerUploadText').textContent = fileInput.files[0] ? 'Ganti Gambar' : 'Pilih Gambar';
        document.getElementById('enhancerFileName').textContent = fileInput.files[0] ? fileInput.files[0].name : 'Belum ada file';
    };
    document.getElementById('enhancerBtn').onclick = async () => {
        const url = document.getElementById('enhancerUrl').value.trim();
        const file = fileInput.files[0];
        const btn = document.getElementById('enhancerBtn');
        const result = document.getElementById('enhancerResult');
        if (!url && !file) return alert('Masukkan URL atau pilih gambar!');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Meningkatkan...';
        result.innerHTML = '<div class="result-box"><i class="fas fa-spinner spin"></i><br>Upscale dan mempertajam gambar...</div>';
        try {
            const img = await nxLocalEnhance(file, url, Number(strength.value));
            nxRenderImageResult(result, img, `enhanced_${Date.now()}.png`, 'Diproses lokal: upscale hingga 2×, koreksi warna, dan sharpening.');
        } catch (e) {
            result.innerHTML = `<div class="result-box" style="color:#ef4444;">Gagal meningkatkan gambar: ${nxEscape(e.message)}</div>`;
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> Tingkatkan Gambar';
        }
    };
}

(function bootToolCatalog(){
    // Render katalog lokal langsung agar halaman tidak menunggu Supabase/API.
    renderAll();
    var schedule = window.NexoraScheduleIdle || function(task){ setTimeout(task, 320); };
    schedule(async function(){
        var changed = await applyDatabaseToolConfiguration();
        if (changed) renderAll();
    }, { timeout: 1800 });
})();
initDownloadHistory();
