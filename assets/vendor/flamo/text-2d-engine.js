(() => {
  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const FONT_LABEL = { '300':'Light','400':'Regular','500':'Medium','600':'Semi Bold','700':'Bold','800':'Extra Bold','900':'Black' };
  const PAGE_QUERY = new URLSearchParams(location.search);
  const FONT_API = { ajaxUrl: PAGE_QUERY.get('ajax_url') || '', nonce: PAGE_QUERY.get('font_nonce') || '', loggedIn: PAGE_QUERY.get('logged_in') === '1' };
  const USER_ACCESS = PAGE_QUERY.get('user_access') || 'guest'; // 'guest' | 'free' | 'premium'
  function currentWpUser(){
    try {
      return window.flamoCurrentUser || (window.parent && window.parent.flamoCurrentUser) || {};
    } catch (error) {
      return window.flamoCurrentUser || {};
    }
  }
  const CURRENT_WP_USER = currentWpUser();
  const USERNAME = PAGE_QUERY.get('user_name') || CURRENT_WP_USER.name || CURRENT_WP_USER.login || '';
  let customFonts = [];
  const isCustomFont = value => String(value || '').startsWith('custom:');
  const customFontId = value => String(value || '').replace(/^custom:/, '');
  const findCustomFont = value => customFonts.find(font => font.id === customFontId(value)) || null;
  function customFontFamily(font){ return 'FlamoCustomFont_' + String(font && font.id || '').replace(/[^a-zA-Z0-9_-]/g, '_'); }
  function fontDisplayName(value){ const found = isCustomFont(value) ? findCustomFont(value) : null; return found ? (found.name || 'Custom Font') : String(value || 'Lexend'); }
  function escHtml(value){ return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch])); }
  function iconSvg(type){
    if(type === 'check') return '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path stroke="currentColor" d="M2 12a10 10 0 1 0 20 0 10 10 0 1 0 -20 0" stroke-width="1.5"></path><path d="m8.5 12.5 2 2 5 -5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"></path></svg>';
    if(type === 'danger') return '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path stroke="currentColor" d="M2 12a10 10 0 1 0 20 0 10 10 0 1 0 -20 0" stroke-width="1.5"></path><path d="M12 7v6" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"></path><path fill="currentColor" d="M11 16a1 1 0 1 0 2 0 1 1 0 1 0 -2 0" stroke-width="1.5"></path></svg>';
    if(type === 'arrow') return '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M6 18 18 6m0 0H9m9 0v9" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"></path></svg>';
    if(type === 'clock') return '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path stroke="currentColor" d="M2 12a10 10 0 1 0 20 0 10 10 0 1 0 -20 0" stroke-width="1.5"></path><path d="M12 8v4l2.5 2.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"></path></svg>';
    if(type === 'trash') return '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M20.5 6H3.49994" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"></path><path d="m18.8334 8.5 -0.46 6.8991c-0.177 2.6549 -0.2655 3.9824 -1.1305 4.7916C16.3779 21 15.0475 21 12.3867 21h-0.7734c-2.66076 0 -3.99116 0 -4.85617 -0.8093 -0.86501 -0.8092 -0.95351 -2.1367 -1.1305 -4.7916L5.16669 8.5" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"></path><path d="m9.5 11 0.5 5" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"></path><path d="m14.5 11 -0.5 5" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"></path><path d="M6.5 6c0.05588 0 0.08382 0 0.10915 -0.00064 0.82344 -0.02087 1.54987 -0.54445 1.83007 -1.31904 0.00862 -0.02383 0.01745 -0.05033 0.03512 -0.10335l0.09709 -0.29126c0.08288 -0.24863 0.12432 -0.37295 0.17928 -0.47851 0.2193 -0.42113 0.62503 -0.71356 1.0939 -0.78843C9.96213 3 10.0932 3 10.3553 3h3.2894c0.2621 0 0.3932 0 0.5107 0.01877 0.4689 0.07487 0.8746 0.3673 1.0939 0.78843 0.055 0.10556 0.0964 0.22988 0.1793 0.47851l0.0971 0.29126c0.0176 0.05295 0.0265 0.07954 0.0351 0.10335 0.2802 0.77459 1.0066 1.29817 1.8301 1.31904C17.4162 6 17.4441 6 17.5 6" stroke="currentColor" stroke-width="1.5"></path></svg>';
    return '';
  }
  function remainingLabel(expiresAt){ const ms = Number(expiresAt || 0) - Date.now(); if(ms <= 0) return 'kedaluwarsa'; const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000); return h + 'j ' + m + 'm tersisa'; }
  function setCustomStatus(message, mode){ const el = $('customFontStatus'); if(!el) return; el.classList.toggle('is-success', mode === 'success'); el.classList.toggle('is-error', mode === 'error'); el.innerHTML = message ? ((mode === 'success' ? iconSvg('check') : mode === 'error' ? iconSvg('danger') : '') + '<span>' + escHtml(message) + '</span>') : ''; }
  function setUploadStatus(message, mode, login){ const el = $('fontUploadStatus'); if(!el) return; el.classList.toggle('is-success', mode === 'success'); el.classList.toggle('is-error', mode === 'error'); const link = login ? ' <a href="/login" target="_top">Masuk ' + iconSvg('arrow') + '</a>' : ''; el.innerHTML = (mode === 'success' ? iconSvg('check') : mode === 'error' ? iconSvg('danger') : '') + '<span>' + escHtml(message || '') + link + '</span>'; }
  function fontApi(action, body){ if(!FONT_API.ajaxUrl || !FONT_API.nonce) return Promise.reject(new Error('Koneksi upload font belum siap.')); const data = body || new FormData(); data.set('action', action); data.set('nonce', FONT_API.nonce); return fetch(FONT_API.ajaxUrl, { method:'POST', credentials:'same-origin', body:data }).then(r => r.json().catch(() => null).then(json => { if(!json || !json.success) throw new Error((json && json.data && json.data.message) || 'Request font gagal.'); return json.data || {}; })); }
  function renderCustomFontOptions(selected){ const font = $('fontName'); if(!font) return; const current = selected || font.value; Array.from(font.querySelectorAll('optgroup[data-custom-fonts]')).forEach(g => g.remove()); if(customFonts.length){ const group = document.createElement('optgroup'); group.label = 'Font Custom · 24 jam'; group.dataset.customFonts = '1'; customFonts.forEach(item => group.append(new Option(item.name || 'Custom Font', 'custom:' + item.id))); font.append(group); } if(current && Array.from(font.options).some(o => o.value === current)) font.value = current; }
  function renderCustomFontList(){ const list = $('customFontList'); if(!list) return; if(!customFonts.length){ list.innerHTML = '<p class="flamo3d-engine-note">Belum ada font custom.</p>'; return; } list.innerHTML = customFonts.map(font => '<div class="flamo-temp-font-item"><div><p class="flamo-temp-font-name">' + escHtml(font.name || 'Custom Font') + '</p><p class="flamo-temp-font-time">' + iconSvg('clock') + '<span>' + escHtml(String(font.extension || '').toUpperCase()) + ' · ' + escHtml(remainingLabel(font.expiresAt)) + '</span></p></div><button class="flamo-temp-font-trash" type="button" data-delete-font="' + escHtml(font.id) + '" aria-label="Hapus font">' + iconSvg('trash') + '<span>Hapus</span></button></div>').join(''); }
  function loadCustomFonts(selectId){ if(!FONT_API.loggedIn){ setCustomStatus('Login diperlukan untuk upload font.', 'error'); renderCustomFontOptions(); return Promise.resolve([]); } return fontApi('flamo_temp_font_list', new FormData()).then(data => { customFonts = Array.isArray(data.fonts) ? data.fonts : []; renderCustomFontOptions(selectId); renderCustomFontList(); if(customFonts.length) setCustomStatus(customFonts.length + ' font custom aktif.', 'success'); else setCustomStatus('Belum ada font custom aktif.'); return customFonts; }).catch(error => { setCustomStatus(error.message, 'error'); return []; }); }
  function openFontUpload(){ window.parent?.postMessage({ type:'FLAMO_3D_FONT_UPLOAD_OPEN' }, '*'); }
  function closeFontUpload(){ $('fontUploadBackdrop')?.classList.remove('is-open'); $('fontUploadModal')?.classList.remove('is-open'); }
  function bindFontUpload(){ $('uploadFontBtn')?.addEventListener('click', openFontUpload); $('reloadFontsBtn')?.addEventListener('click', () => loadCustomFonts($('fontName')?.value).then(() => { renderFontStyleOptions(isCustomFont($('fontName')?.value) ? '' : ($('fontStyle')?.value || '400')); updateAll(); })); $('fontUploadClose')?.addEventListener('click', closeFontUpload); $('fontUploadCancel')?.addEventListener('click', closeFontUpload); $('fontUploadBackdrop')?.addEventListener('click', closeFontUpload); $('fontUploadSubmit')?.addEventListener('click', uploadCustomFont); $('customFontList')?.addEventListener('click', e => { const btn = e.target.closest('[data-delete-font]'); if(btn) deleteCustomFont(btn.dataset.deleteFont); }); const zone = $('fontDropZone'), input = $('fontFileInput'); if(zone && input){ ['dragenter','dragover'].forEach(t => zone.addEventListener(t, e => { e.preventDefault(); zone.classList.add('is-drag'); })); ['dragleave','drop'].forEach(t => zone.addEventListener(t, e => { e.preventDefault(); zone.classList.remove('is-drag'); })); zone.addEventListener('drop', e => { const file = e.dataTransfer && e.dataTransfer.files ? e.dataTransfer.files[0] : null; if(!file) return; const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files; setUploadStatus(file.name + ' · ' + (file.size / 1024 / 1024).toFixed(2) + 'MB'); }); input.addEventListener('change', () => { const file = input.files && input.files[0]; setUploadStatus(file ? file.name + ' · ' + (file.size / 1024 / 1024).toFixed(2) + 'MB' : 'Pilih file TTF atau OTF.'); }); } }
  function uploadCustomFont(){ const input = $('fontFileInput'), button = $('fontUploadSubmit'); const file = input && input.files ? input.files[0] : null; if(!FONT_API.loggedIn){ setUploadStatus('Login diperlukan untuk upload font.', 'error', true); return; } if(!file){ setUploadStatus('Pilih file font terlebih dahulu.', 'error'); return; } const body = new FormData(); body.set('font_file', file); if(button) button.disabled = true; setUploadStatus('Mengupload dan memvalidasi font...'); fontApi('flamo_temp_font_upload', body).then(data => { if(input) input.value = ''; setUploadStatus(data.message || 'Font berhasil diupload.', 'success'); return loadCustomFonts(data.font && data.font.id ? 'custom:' + data.font.id : '').then(() => { if(data.font && data.font.id && $('fontName')) $('fontName').value = 'custom:' + data.font.id; renderFontStyleOptions(''); updateAll(); markDirty(); }); }).catch(error => setUploadStatus(error.message, 'error')).finally(() => { if(button) button.disabled = false; }); }
  function deleteCustomFont(id){ const body = new FormData(); body.set('font_id', id || ''); setUploadStatus('Menghapus font...'); fontApi('flamo_temp_font_delete', body).then(data => { setUploadStatus(data.message || 'Font dihapus.', 'success'); return loadCustomFonts('Lexend').then(() => { renderFontStyleOptions(''); updateAll(); markDirty(); }); }).catch(error => setUploadStatus(error.message, 'error')); }
  function ensureCustomPreviewFont(value){ const font = findCustomFont(value); if(!font || !font.url || !('FontFace' in window)) return; const family = customFontFamily(font); if(document.fonts && Array.from(document.fonts).some(f => f.family === family)) return; const face = new FontFace(family, 'url("' + font.url + '")'); face.load().then(loaded => { document.fonts.add(loaded); updateAll(); }).catch(() => setCustomStatus('Font custom gagal dimuat di preview.', 'error')); }

  const DEFAULT_FONTS = ['Lexend','Exo','Inter','Poppins','Montserrat','Manrope','Plus Jakarta Sans','Sora','DM Sans','Space Grotesk','Outfit','Urbanist','Rubik','Raleway','Oswald','Bebas Neue','Anton','Archivo Black','League Spartan','Orbitron','Nunito Sans'];
  const DEFAULT_STYLES = [['300','Light'],['400','Regular'],['500','Medium'],['600','Semi Bold'],['700','Bold'],['800','Extra Bold'],['900','Black']];
  const FONT_STYLE_MAP = {
    'Lexend':['300','400','500','600','700','800','900'],
    'Exo':['300','400','500','600','700','800','900'],
    'Inter':['300','400','500','600','700','800','900'],
    'Poppins':['300','400','500','600','700','800','900'],
    'Montserrat':['300','400','500','600','700','800','900'],
    'Manrope':['300','400','500','600','700','800'],
    'Plus Jakarta Sans':['300','400','500','600','700','800'],
    'Sora':['300','400','500','600','700','800'],
    'DM Sans':['400','500','700'],
    'Space Grotesk':['300','400','500','600','700'],
    'Outfit':['300','400','500','600','700','800','900'],
    'Urbanist':['300','400','500','600','700','800','900'],
    'Rubik':['300','400','500','600','700','800','900'],
    'Raleway':['300','400','500','600','700','800','900'],
    'Oswald':['300','400','500','600','700'],
    'Bebas Neue':['400'],
    'Anton':['400'],
    'Archivo Black':['400'],
    'League Spartan':['300','400','500','600','700','800','900'],
    'Orbitron':['400','500','600','700','800','900'],
    'Nunito Sans':['300','400','500','600','700','800','900']
  };
  const GRAPH_CURVES = {
    linear: { p1: { x: .25, y: .25 }, p2: { x: .75, y: .75 } },
    smooth: { p1: { x: .33, y: 0 }, p2: { x: .67, y: 1 } },
    fastStart: { p1: { x: .18, y: .75 }, p2: { x: .55, y: 1 } },
    slowStart: { p1: { x: .45, y: 0 }, p2: { x: .82, y: .25 } },
    random: { p1: { x: .33, y: 0 }, p2: { x: .67, y: 1 } },
    custom: { p1: { x: .33, y: 0 }, p2: { x: .67, y: 1 } }
  };

  const COLOR_PALETTES = [
    { name:'Original Orange', colors:['#FFFFFF','#FEA800','#FF9300','#FF8C00','#AC2D2A'] },
    { name:'Cream Forest', colors:['#FFF6DE','#E9D8A6','#94A77B','#5B7755','#253B35'] },
    { name:'Neon Candy', colors:['#FFF3A3','#FF6F91','#FF2D75','#B725D9','#5D22A8'] },
    { name:'Ocean Lime', colors:['#D9FF64','#4CC9F0','#00A6FB','#F72585','#F35B04'] },
    { name:'Blue Night', colors:['#EDEDED','#7FB3FF','#3066BE','#1B2A6B','#090B3D'] },
    { name:'Mocha Gold', colors:['#FFF3D1','#F5D66B','#C9792B','#6E3218','#1B1008'] },
    { name:'Teal Peach', colors:['#FFE6D5','#74D3C6','#0E8B85','#FFB86B','#B4462D'] },
    { name:'Ruby Cream', colors:['#FFF1DB','#FFD166','#EF476F','#A40043','#5F0F2F'] },
    { name:'Mint Slate', colors:['#EAF8EA','#BEE3DB','#89B0AE','#555B6E','#1F2933'] },
    { name:'Purple Pop', colors:['#F6EEFF','#9B8CFF','#6C63FF','#7B2DCC','#3C096C'] },
    { name:'Cyber Mango', colors:['#F8FFF4','#F7FF00','#FFB000','#FF4D00','#151515'] },
    { name:'Ice Neon', colors:['#F7FFFF','#9BE7FF','#29B6F6','#006DCC','#001B44'] },
    { name:'Rose Shadow', colors:['#FFF7F8','#FFB3C6','#FF4D6D','#C9184A','#590D22'] },
    { name:'Lemon Ink', colors:['#FFFFF0','#F8F32B','#F7B801','#30343F','#0B090A'] },
    { name:'Aqua Lava', colors:['#EFFFFD','#00F5D4','#00BBF9','#F15BB5','#FEE440'] },
    { name:'Royal Copper', colors:['#F8F4FF','#B8B8FF','#5A4FCF','#C77D3A','#4A1F0E'] },
    { name:'Green Toxic', colors:['#F7FFE5','#CCFF33','#70E000','#38B000','#004B23'] },
    { name:'Sunset Grape', colors:['#FFF3E0','#FFB703','#FB8500','#8338EC','#3A0CA3'] },
    { name:'Cloud Steel', colors:['#F8FAFC','#CBD5E1','#94A3B8','#475569','#0F172A'] },
    { name:'Candy Flame', colors:['#FFF5F7','#FF8FAB','#FB2576','#FF7B00','#7B2CBF'] },
    { name:'Dark Ember', colors:['#FFF1D6','#FF6A00','#B83200','#3A0C00','#090403'] },
    { name:'Black Fire', colors:['#FFEAD0','#FF3D00','#9D0208','#370617','#050505'] },
    { name:'Smoke Flame', colors:['#F8F2E8','#FF9F1C','#C1121F','#3D1F1F','#111111'] },
    { name:'Ice Crystal', colors:['#FFFFFF','#CFFFFF','#7FDBFF','#2D9CDB','#063B63'] },
    { name:'Deep Ice', colors:['#F0FDFF','#9AE6FF','#38BDF8','#2563EB','#0B1026'] },
    { name:'Frozen Mint', colors:['#F8FFFF','#B8FFF9','#64DFDF','#5390D9','#102A43'] },
    { name:'Pink Pop', colors:['#FFF0F8','#FF9AD5','#FF4FB3','#D1008F','#4A0033'] },
    { name:'Pink Velvet', colors:['#FFF5FA','#F7A8C7','#E84A8A','#8A0F4D','#2B0618'] },
    { name:'Blue Orange Legend', colors:['#FFF7E8','#FF9F1C','#FF6B00','#0077FF','#001F54'] },
    { name:'Legend Night', colors:['#F8FAFF','#00A3FF','#0057FF','#FF7A00','#141414'] }
  ];
  let colorRoleState = { mode:'single', paletteIndex:0, repeatEvery:2, customPaletteId:null };
  let styleRoleState = { paletteIndex:0, colors:[], customPaletteId:null };
  let paletteTarget = 'character';
  function targetRoleState(){ return paletteTarget==='style' ? styleRoleState : colorRoleState; }
  function isMemberUser(){ return true; }

  let selectedStyle = (window.STYLE_META && window.STYLE_META[0] && window.STYLE_META[0].id) || 'pink1';
  let selectedPreset = (window.PRESETS && window.PRESETS.fadeBlur) ? 'fadeBlur' : (Object.keys(window.PRESETS || {})[0] || 'fadeBlur');
  let generatedXml = '';
  let graphMode = 'smooth';
  let curveHandles = structuredCloneSafe(GRAPH_CURVES.smooth);
  let suppressDirty = false;
  let closeGraphOtherPortal = () => {};

  function structuredCloneSafe(obj){ return JSON.parse(JSON.stringify(obj)); }
  function esc(s){ return String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&apos;','"':'&quot;'}[c])); }
  function slug(s){ return String(s || 'flamo-text-animation').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9#_-]+/g,'-').replace(/-+/g,'-').replace(/^-+|-+$/g,'') || 'flamo-text-animation'; }
  function post(type, payload){ const msg = { type }; if(type === 'FLAMO_3D_GENERATED') msg.payload = payload; else Object.assign(msg, payload || {}); parent.postMessage(msg, '*'); }
  function markDirty(){ if(suppressDirty) return; generatedXml = ''; if($('xmlOut')) $('xmlOut').value = ''; post('FLAMO_3D_DIRTY'); }
  function filename(){ return slug(($('filename') && $('filename').value) || 'flamo-text-animation').replace(/\.xml$/i,'') + '.xml'; }
  function prettyName(key){ return String(key || '').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[._-]+/g,' ').replace(/\b\w/g, m => m.toUpperCase()).trim(); }

  function availableFontStyles(fontName){
    if(isCustomFont(fontName)) return [];
    const name = String(fontName || 'Lexend').trim();
    const map = window.FONT_STYLE_MAP || FONT_STYLE_MAP;
    const raw = map[name] || map[name.replace(/\s+/g,' ')] || ['400'];
    return raw.map(v => String(v)).filter(v => FONT_LABEL[v]);
  }
  function defaultFontStyle(fontName){
    if(isCustomFont(fontName)) return '';
    const list = availableFontStyles(fontName);
    return list.includes('400') ? '400' : (list[0] || '400');
  }
  function renderFontStyleOptions(preferred){
    const font = $('fontName'), style = $('fontStyle');
    if(!style) return;
    const value = font && font.value;
    if(isCustomFont(value)){
      style.innerHTML = '<option value="">—</option>';
      style.value = '';
      style.disabled = true;
      style.classList.add('flamo-temp-font-style-empty');
      return;
    }
    style.classList.remove('flamo-temp-font-style-empty');
    const list = availableFontStyles(value);
    const keep = preferred && list.includes(String(preferred)) ? String(preferred) : defaultFontStyle(value);
    style.innerHTML = list.map(v => `<option value="${esc(v)}">${esc(FONT_LABEL[v] || v)}</option>`).join('');
    style.value = keep;
    style.disabled = list.length <= 1;
  }

  function currentPreset(){ const presets = window.PRESETS || {}; return presets[selectedPreset] || presets[Object.keys(presets)[0]] || {}; }

  function currentStyle(){ return (window.STYLE_META || []).find(s => s.id === selectedStyle) || (window.STYLE_META || [])[0] || {}; }
  function initStyleSelect(){
    const select=$('styleFx'); if(!select) return;
    select.innerHTML=''; (window.STYLE_META||[]).forEach(s=>select.append(new Option(s.name,s.id))); select.value=selectedStyle;
    renderStyleMenu(); renderStyleCurrent();
  }
  function renderStyleMenu(){ const menu=$('styleMenu'); if(!menu)return; menu.innerHTML=(window.STYLE_META||[]).map((s,i)=>`<button class="flamo3d-preset-option${s.id===selectedStyle?' is-active':''}" type="button" data-style-fx="${esc(s.id)}" style="--i:${i}">${s.gif?`<img src="${s.gif}" alt="">`:''}<span>${esc(s.name)}</span></button>`).join(''); }
  function renderStyleCurrent(){ const s=currentStyle(); if($('styleName'))$('styleName').textContent=s.name||'Style FX'; if($('styleSub'))$('styleSub').textContent=s.desc||'Style group'; if($('styleThumb'))$('styleThumb').src=s.gif||''; syncStyleRoleState(true); renderStyleRoles(); renderStyleMenu(); }
  function chooseStyle(id){ post('FLAMO_PRS_STATUS_CLOSE'); selectedStyle=id; if($('styleFx'))$('styleFx').value=id; renderStyleCurrent(); updateFileNameAuto(); markDirty(); toggleStyleMenu(false); }
  function toggleStyleMenu(force){ const picker=document.querySelector('.flamo-fx-style-picker'), trigger=$('styleTrigger'); if(!picker)return; const open=typeof force==='boolean'?force:!picker.classList.contains('is-open'); picker.classList.toggle('is-open',open); trigger?.setAttribute('aria-expanded',open?'true':'false'); }
  function initSelects(){
    const font = $('fontName'), preset = $('animPreset');
    if(font && !font.childElementCount) { const srcFonts = (window.FONTS && window.FONTS.length ? window.FONTS : DEFAULT_FONTS); const fonts = srcFonts.includes('Lexend') ? srcFonts : ['Lexend', ...srcFonts]; fonts.forEach(f => font.append(new Option(f, f))); }
    if(font) { const srcFonts = (window.FONTS && window.FONTS.length ? window.FONTS : DEFAULT_FONTS); const fonts = srcFonts.includes('Lexend') ? srcFonts : ['Lexend', ...srcFonts]; font.value = fonts.includes('Lexend') ? 'Lexend' : (fonts[0] || 'Lexend'); }
    renderFontStyleOptions('400');
    if(preset && !preset.childElementCount) Object.entries(window.PRESETS || {}).forEach(([key,p]) => preset.append(new Option(p.name || prettyName(key), key)));
  }

  // --- Preset status icons (inline SVG) ---
  const _icoKey = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M15.6807 14.5869c3.4901 0 6.3193-2.8177 6.3193-6.29346C22 4.81767 19.1708 2 15.6807 2c-3.49 0-6.3192 2.81767-6.3192 6.29344 0 1.60994.7348 2.78086.7348 2.78086l-7.64189 7.6106c-.34291.3415-.82298 1.2294 0 2.049l.88175.8782c.34289.2927 1.20503.7025 1.91044 0l1.02871-1.0245c1.02872 1.0245 2.20439.4391 2.64527-.1464.7348-1.0245-.14696-2.049-.14696-2.049l.29392-.2927c1.41076 1.405 2.64526.5854 3.08616 0 .7348-1.0245 0-2.049 0-2.049-.2939-.5855-.8817-.5855-.147-1.3172l.8818-.8782c.7054.5854 2.1554.7318 2.7922.7318Z" stroke="currentColor" stroke-linejoin="round" stroke-width="1.5"/><path d="M17.8851 8.29353c0 1.21248-.9869 2.19537-2.2044 2.19537-1.2174 0-2.2044-.98289-2.2044-2.19537s.987-2.19539 2.2044-2.19539c1.2175 0 2.2044.98291 2.2044 2.19539Z" stroke="currentColor" stroke-width="1.5"/></svg>';
  const _icoStar = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M9.15316 5.40838C10.4198 3.13613 11.0531 2 12 2c.9469 0 1.5802 1.13612 2.8468 3.40837l.3277.58786c.36.6457.5399.96856.8206 1.18158.2806.21302.63.29209 1.329.45024l.6364.14398c2.4596.55653 3.6895.83479 3.9821 1.7757.2926.94087-.5458 1.92137-2.2227 3.88217l-.4338.5073c-.4765.5572-.7148.8358-.822 1.1805-.1071.3447-.0711.7164.0009 1.4599l.0656.6768c.2535 2.6162.3803 3.9243-.3857 4.5058-.7661.5815-1.9176.0513-4.2206-1.009l-.5958-.2744c-.6544-.3013-.9816-.452-1.3285-.452s-.6741.1507-1.3285.452l-.5958.2744c-2.30302 1.0603-3.45452 1.5905-4.22055 1.009-.76603-.5815-.63927-1.8896-.38575-4.5058l.06558-.6768c.07205-.7435.10807-1.1152.00088-1.4599-.10718-.3447-.34543-.6233-.82194-1.1805l-.43382-.5073C2.63779 10.2131 1.79936 9.23257 2.09196 8.29173c.2926-.94091 1.52244-1.21917 3.98212-1.7757l.63635-.14398c.69896-.15815 1.04844-.23722 1.32905-.45024s.46059-.53587.82053-1.18158l.32769-.58785Z" stroke="currentColor" stroke-width="1.5"/></svg>';
  const _icoArrowUp = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M6 18 18 6m0 0H9m9 0v9" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"/></svg>';
  const _icoChevronDown = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function presetIsRestricted(item){
    const status = item.status || 'active';
    return status === 'soon' || status === 'donate';
  }
  function presetWrapClass(item){
    const status = item.status || 'active';
    if(status === 'soon') return 'is-soon';
    if(status === 'donate') return 'is-donate';
    return '';
  }
  function presetFooterHtml(item){
    const cls = presetWrapClass(item);
    if(!cls) return '';
    if(cls === 'is-member') return `<div class="flamo-prs-footer flamo-prs-footer--member">${_icoKey}<span>Member Only</span></div>`;
    if(cls === 'is-soon') return `<div class="flamo-prs-footer flamo-prs-footer--soon"><span>Segera Hadir</span>${_icoStar}</div>`;
    if(cls === 'is-donate'){
      const pct = item.supportProgress || 0;
      return `<div class="flamo-prs-footer flamo-prs-footer--donate"><span>Support Preset</span><span class="flamo-prs-donate-bar"><i style="width:${pct}%"></i></span>${_icoArrowUp}</div>`;
    }
    return '';
  }

  // --- Donate panel helpers ---
  function absUrl(u){ try { return new URL(u, location.href).href; } catch(e){ return u || ''; } }
  function donateFmtRp(n){ return 'Rp' + Math.round(n || 0).toLocaleString('id-ID'); }
  function donateProgressPixels(count = 1120){
    if(donateProgressPixels.cache) return donateProgressPixels.cache;
    donateProgressPixels.cache = Array.from({ length: count }, (_, i) => {
      const d = ((i % 82) * .022).toFixed(3);
      const o = (.29 + ((i * 5) % 15) / 100).toFixed(2);
      const peak = (.68 + ((i * 7) % 29) / 100).toFixed(2);
      return `<span style="--d:${d}s;--o:${o};--peak:${peak};--s:.78"></span>`;
    }).join('');
    return donateProgressPixels.cache;
  }
  function donateOverviewHtml(images){
    const list = Array.isArray(images) ? images.filter(Boolean) : [];
    if(!list.length) return '';
    return `<div class="flamo3d-prs-donate-overview" data-donate-slider>
      <div class="flamo3d-prs-donate-overview-frame" data-donate-slider-frame>
        <div class="flamo3d-prs-donate-overview-track" data-donate-slider-track>${list.map(src => `<div class="flamo3d-prs-donate-overview-slide"><img src="${esc(src)}" alt=""></div>`).join('')}</div>
      </div>
      <div class="flamo3d-prs-donate-dots" data-donate-slider-dots>${list.map((_, i) => `<button type="button" class="flamo3d-prs-donate-dot${i === 0 ? ' is-active' : ''}" aria-label="Slide ${i + 1}"></button>`).join('')}</div>
    </div>`;
  }
  function initDonateSliders(root){
    if(!root || !root.querySelectorAll) return;
    root.querySelectorAll('[data-donate-slider]').forEach(wrap => {
      const frame = wrap.querySelector('[data-donate-slider-frame]');
      const track = wrap.querySelector('[data-donate-slider-track]');
      const dots = Array.from(wrap.querySelectorAll('[data-donate-slider-dots] .flamo3d-prs-donate-dot'));
      const count = track ? track.children.length : 0;
      if(!frame || !track || count < 2) return;
      let index = 0, timer = null, startX = 0, currentX = 0, dragging = false, frameWidth = 1;
      const setTransition = active => { track.style.transition = active ? 'transform .34s cubic-bezier(.2,.8,.2,1)' : 'none'; };
      const render = (extra = 0) => { frameWidth = frame.clientWidth || 1; track.style.transform = `translateX(${(-index * frameWidth) + extra}px)`; dots.forEach((d, i) => d.classList.toggle('is-active', i === index)); };
      const go = next => { index = (next + count) % count; setTransition(true); render(); };
      const startLoop = () => { clearInterval(timer); timer = setInterval(() => go(index + 1), 3800); };
      const stopLoop = () => clearInterval(timer);
      frame.addEventListener('pointerdown', e => { dragging = true; startX = e.clientX; currentX = e.clientX; frame.classList.add('is-dragging'); frame.setPointerCapture(e.pointerId); stopLoop(); setTransition(false); });
      frame.addEventListener('pointermove', e => { if(!dragging) return; currentX = e.clientX; render(currentX - startX); });
      frame.addEventListener('pointerup', () => { if(!dragging) return; dragging = false; frame.classList.remove('is-dragging'); const diff = currentX - startX, threshold = frameWidth * .18; if(Math.abs(diff) > threshold) go(index + (diff < 0 ? 1 : -1)); else go(index); startLoop(); });
      frame.addEventListener('pointercancel', () => { dragging = false; frame.classList.remove('is-dragging'); go(index); startLoop(); });
      dots.forEach((dot, i) => dot.addEventListener('click', () => { go(i); startLoop(); }));
      render(); startLoop();
    });
  }
  function donateFormatRupiah(value){ const digits = String(value || '').replace(/\D/g, ''); return digits ? new Intl.NumberFormat('id-ID').format(Number(digits)) : ''; }
  function formatDonateNominal(input){ input.value = donateFormatRupiah(input.value); }
  function toggleDonateAnon(checkbox){
    const field = checkbox.closest('.flamo3d-prs-donate-field');
    const sender = field && field.querySelector('[data-donate-sender]');
    if(!sender) return;
    const ctx = checkbox.closest('[data-username]');
    const username = (ctx && ctx.dataset.username) || '';
    if(checkbox.checked){ sender.readOnly = false; sender.value = ''; sender.placeholder = 'Tulis nama bebas'; sender.focus(); }
    else { sender.readOnly = true; sender.value = username; sender.placeholder = 'Nama pengirim'; }
  }
  function updateDonateFileName(input){
    const nameEl = input.closest('label')?.querySelector('[data-donate-file-name]');
    if(!nameEl) return;
    const file = input.files && input.files[0];
    nameEl.textContent = file ? file.name : 'Upload bukti transfer';
  }
  function donateSenderName(form){
    const sender = form.querySelector('[data-donate-sender]');
    const ctx = form.closest('[data-username]');
    return (sender && sender.value.trim()) || (ctx && ctx.dataset.username) || 'User';
  }
  function donateConfig(){
    try {
      if(window.parent && window.parent !== window && window.parent.flamoDonateConfig) return window.parent.flamoDonateConfig;
    } catch(e) {}
    return window.flamoDonateConfig || {};
  }
  async function submitDonateForm(form, opts){
    opts = opts || {};
    const ctx = form.closest('[data-tool-name]');
    const toolName = (ctx && ctx.dataset.toolName) || 'Flamo Tools';
    const nominalInput = form.querySelector('[data-donate-nominal]');
    const messageInput = form.querySelector('[data-donate-message]');
    const fileInput = form.querySelector('[data-donate-file]');
    const noteEl = form.querySelector('[data-donate-note]');
    const config = donateConfig();
    const amount = String((nominalInput && nominalInput.value) || '').replace(/\D/g, '');
    if(!config.ajaxUrl || !config.nonce){
      alert('Config donasi belum siap. Refresh halaman dulu ya.');
      return null;
    }
    if(Number(amount || 0) < 1000){
      alert('Masukkan nominal minimal Rp1.000.');
      return null;
    }
    const fd = new FormData();
    fd.append('action', 'flamo_submit_donation');
    fd.append('nonce', config.nonce);
    fd.append('tool_id', '0');
    fd.append('subject_type', (ctx && ctx.dataset.subjectType) || 'preset');
    fd.append('subject_id', (ctx && ctx.dataset.subjectId) || '');
    fd.append('donor_name', donateSenderName(form));
    fd.append('amount', amount);
    fd.append('message', (messageInput && messageInput.value.trim()) || '');
    if(fileInput && fileInput.files && fileInput.files[0]) fd.append('proof', fileInput.files[0]);
    const submitter = form.querySelector('[type="submit"], button[data-donate-submit]');
    if(submitter) submitter.disabled = true;
    try {
      const res = await fetch(config.ajaxUrl, { method: 'POST', body: fd, credentials: 'same-origin' });
      const json = await res.json();
      if(!json || !json.success) throw new Error((json && json.data && json.data.msg) || 'Gagal menyimpan donasi.');
      if(noteEl){
        noteEl.textContent = 'Donasi masuk ke admin dengan status pending.';
        noteEl.classList.add('is-visible');
      }
      post('FLAMO_DONATE_CONFIRMED', { id: json.data && json.data.id, toolName });
      if(opts.openWa && json.data && json.data.waUrl) window.open(json.data.waUrl, '_blank');
      return json;
    } catch(error) {
      alert(error.message || 'Gagal menyimpan donasi.');
      return null;
    } finally {
      if(submitter) submitter.disabled = false;
    }
  }
  function sendDonateWaConfirm(btn){
    const ctx = btn.closest('[data-wa-number]');
    const waNumber = (ctx && ctx.dataset.waNumber) || '';
    const toolName = (ctx && ctx.dataset.toolName) || 'Flamo Tools';
    const scope = ctx || document;
    const nominalInput = scope.querySelector('[data-donate-nominal]');
    const messageInput = scope.querySelector('[data-donate-message]');
    const form = scope.querySelector('[data-donate-form]');
    const senderName = form ? donateSenderName(form) : ((ctx && ctx.dataset.username) || 'User');
    const nominalDisplay = nominalInput && nominalInput.value ? 'Rp' + nominalInput.value : '-';
    const message = `Terimakasih sudah membantu pengembangan tools - ${toolName}\n\nNominal:\n${nominalDisplay}\n\nPesan:\n${(messageInput && messageInput.value.trim()) || '-'}\n\nDari pengirim:\n${senderName}`;
    if(form){
      submitDonateForm(form, { openWa: true });
      return;
    }
    window.open('https://wa.me/' + waNumber + '?text=' + encodeURIComponent(message), '_blank');
  }

  // --- Member Only panel helpers ---
  function memberSliderHtml(images){
    const list = Array.isArray(images) ? images.filter(Boolean) : [];
    if(!list.length) return '';
    return `<div class="flamo3d-prs-member-slider" data-member-slider>
      <div class="flamo3d-prs-member-slider-frame" data-member-slider-frame>
        <div class="flamo3d-prs-member-slider-track" data-member-slider-track>${list.map(src => `<div class="flamo3d-prs-member-slide"><img src="${esc(src)}" alt=""></div>`).join('')}</div>
      </div>
      <div class="flamo3d-prs-member-dots" data-member-slider-dots>${list.map((_, i) => `<button type="button" class="flamo3d-prs-member-dot${i === 0 ? ' is-active' : ''}" aria-label="Slide ${i + 1}"></button>`).join('')}</div>
    </div>`;
  }
  function memberAccessInfoHtml(){
    return `<p class="flamo3d-prs-member-access-title">Yang Bisa Akses</p>
      <p class="flamo3d-prs-member-access-desc">Akses diberikan permanen setelah pembelian sekali atau melalui course tertentu.</p>
      <div class="flamo3d-prs-member-access-box">
        <div class="flamo3d-prs-member-access-group"><p class="flamo3d-prs-member-access-group-title">Member Course</p><ul class="flamo3d-prs-member-list"><li>Kelas Basic</li><li>Kelas Mastering</li></ul></div>
        <div class="flamo3d-prs-member-access-group"><p class="flamo3d-prs-member-access-group-title">Flamo Tools Lifetime</p><ul class="flamo3d-prs-member-list"><li>Sekali bayar, akses selamanya</li></ul></div>
      </div>`;
  }
  function memberBenefitBlockHtml(){
    return `<section class="flamo3d-prs-member-benefit-block">
      <h3 class="flamo3d-prs-member-benefit-title">Benefit Join</h3>
      <ul class="flamo3d-prs-member-list"><li>Akses tools premium selamanya.</li><li>Update fitur dan preset lebih dulu.</li><li>Workflow creative tools lebih cepat.</li></ul>
    </section>`;
  }
  function memberAccessLayerHtml(katalog){
    const pages = katalogPages(katalog);
    const katalogHtml = pages.length ? `
      <button class="flamo3d-prs-member-katalog-toggle" type="button" data-member-katalog-toggle><span data-member-katalog-label>Lihat Katalog</span> ${_icoChevronDown}</button>
      <div class="flamo3d-prs-member-katalog-morph" data-member-katalog-morph>
        <div class="flamo3d-prs-member-katalog-window" data-katalog-window>
          <div class="flamo3d-prs-member-katalog-track" data-katalog-track>${katalogTrackHtml(pages, 'flamo3d-prs-member-katalog')}</div>
        </div>
      </div>` : '';
    return `<div class="flamo3d-prs-member-access-layer" data-member-access-layer>
      <div class="flamo3d-prs-member-access-column">
        <div class="flamo3d-prs-member-access-top">${memberAccessInfoHtml()}</div>
        <div class="flamo3d-prs-member-access-bottom">
          ${katalogHtml}
          <div class="flamo3d-prs-member-actions">
            <button class="flamo3d-prs-member-btn" type="button" data-member-access-toggle>Balik</button>
            <a class="flamo3d-prs-member-btn primary" href="/marketplace" target="_top">Join Sekarang</a>
          </div>
        </div>
      </div>
    </div>`;
  }
  function initMemberSliders(root){
    if(!root || !root.querySelectorAll) return;
    root.querySelectorAll('[data-member-slider]').forEach(wrap => {
      const frame = wrap.querySelector('[data-member-slider-frame]');
      const track = wrap.querySelector('[data-member-slider-track]');
      const dots = Array.from(wrap.querySelectorAll('[data-member-slider-dots] .flamo3d-prs-member-dot'));
      const count = track ? track.children.length : 0;
      if(!frame || !track || count < 2) return;
      let index = 0, timer = null, startX = 0, currentX = 0, dragging = false, frameWidth = 1;
      const setTransition = active => { track.style.transition = active ? 'transform .34s cubic-bezier(.2,.8,.2,1)' : 'none'; };
      const render = (extra = 0) => { frameWidth = frame.clientWidth || 1; track.style.transform = `translateX(${(-index * frameWidth) + extra}px)`; dots.forEach((d, i) => d.classList.toggle('is-active', i === index)); };
      const go = next => { index = (next + count) % count; setTransition(true); render(); };
      const startLoop = () => { clearInterval(timer); timer = setInterval(() => go(index + 1), 3800); };
      const stopLoop = () => clearInterval(timer);
      frame.addEventListener('pointerdown', e => { dragging = true; startX = e.clientX; currentX = e.clientX; frame.classList.add('is-dragging'); frame.setPointerCapture(e.pointerId); stopLoop(); setTransition(false); });
      frame.addEventListener('pointermove', e => { if(!dragging) return; currentX = e.clientX; render(currentX - startX); });
      frame.addEventListener('pointerup', () => { if(!dragging) return; dragging = false; frame.classList.remove('is-dragging'); const diff = currentX - startX, threshold = frameWidth * .18; if(Math.abs(diff) > threshold) go(index + (diff < 0 ? 1 : -1)); else go(index); startLoop(); });
      frame.addEventListener('pointercancel', () => { dragging = false; frame.classList.remove('is-dragging'); go(index); startLoop(); });
      dots.forEach((dot, i) => dot.addEventListener('click', () => { go(i); startLoop(); }));
      render(); startLoop();
    });
  }
  function toggleMemberAccess(btn){
    const scope = btn.closest('.flamo3d-prs-member-body') || btn.parentElement;
    const layer = scope && scope.querySelector('[data-member-access-layer]');
    if(!layer) return;
    layer.classList.toggle('is-open');
  }
  function toggleMemberKatalog(btn){
    const scope = btn.closest('[data-member-access-layer]') || btn.parentElement;
    const morph = scope && scope.querySelector('[data-member-katalog-morph]');
    const label = btn.querySelector('[data-member-katalog-label]');
    if(!morph) return;
    const open = !morph.classList.contains('is-open');
    morph.classList.toggle('is-open', open);
    btn.classList.toggle('is-open', open);
    if(label) label.textContent = open ? 'Katalog Kami' : 'Lihat Katalog';
    if(open) initKatalogSlider(morph.querySelector('[data-katalog-window]'));
  }

  // --- Coming Soon panel helpers ---
  const SOON_PHASES = [
    { max: 14, label: 'Konsep', color: '#25bfe8', soft: '#dff7ff', text: '#2480a2', desc: 'Ide fitur dan alur utama sudah disiapkan.',
      icon: '<svg viewBox="0 0 24 24" fill="none"><path d="M14.5 19.5h-5m5 0c0-.7135 0-1.0703.0381-1.307.1228-.7634.1443-.8115.6311-1.4123.1509-.1862.7113-.688 1.832-1.6915C18.5349 13.7159 19.5 11.7206 19.5 9.5 19.5 5.35786 16.1421 2 12 2 7.85786 2 4.5 5.35786 4.5 9.5c0 2.2206.9651 4.2159 2.49876 5.5892 1.12069 1.0035 1.68111 1.5053 1.83206 1.6915.4868.6008.50828.6489.6311 1.4123C9.5 18.4297 9.5 18.7865 9.5 19.5m5 0c0 .9346 0 1.4019-.201 1.75-.1316.228-.321.4174-.549.549C13.4019 22 12.9346 22 12 22s-1.4019 0-1.75-.201c-.228-.1316-.41739-.321-.54904-.549C9.5 20.9019 9.5 20.4346 9.5 19.5" stroke-width="1.5"/><path d="M12 17v-2" stroke-linecap="round" stroke-width="1.5"/><path d="M13.7324 14c-.3458.5978-.9921 1-1.7324 1s-1.3866-.4022-1.7324-1" stroke-linecap="round" stroke-width="1.5"/></svg>' },
    { max: 34, label: 'Design', color: '#c36bea', soft: '#f4dcff', text: '#8d3bb0', desc: 'Tampilan dan experience sudah dibentuk.',
      icon: '<svg viewBox="0 0 48 48" fill="none"><path stroke-linecap="round" stroke-linejoin="round" d="M38.306 28.529c4.049-.001 7.065-3.332 6.48-7.338C43.33 11.236 34.652 3 24.005 3 12.403 3 3 12.402 3 24s9.404 21 21.005 21c3.143 0 5.48-.644 5.936-2.511.457-1.868-.165-2.37-2.283-7.532-1.083-2.64.094-5.07 1.827-5.935 1.646-.823 5.269-.492 8.821-.493Z" stroke-width="3"/><path stroke-linecap="round" stroke-linejoin="round" d="M23 14a5 5 0 1 0 10 0 5 5 0 1 0-10 0M10 21.5a4.5 4.5 0 1 0 9 0 4.5 4.5 0 1 0-9 0M15 34.5a3.5 3.5 0 1 0 7 0 3.5 3.5 0 1 0-7 0" stroke-width="3"/></svg>' },
    { max: 74, label: 'Build Code', color: '#23bf78', soft: '#dff7e9', text: '#24784d', desc: 'Fungsi utama sedang dibangun.',
      icon: '<svg viewBox="0 0 48 48" fill="none"><path stroke-linecap="round" stroke-linejoin="round" d="M12 23s8 4 8 6-8 6-8 6M26 34h10" stroke-width="3"/><path stroke-linejoin="round" d="M3.539 39.743c.208 2.555 2.163 4.51 4.718 4.718C11.485 44.723 16.636 45 24 45c7.364 0 12.515-.277 15.743-.539 2.555-.208 4.51-2.163 4.718-4.718C44.723 36.515 45 31.364 45 24c0-7.364-.277-12.515-.539-15.743-.208-2.555-2.163-4.51-4.718-4.718C36.515 3.277 31.364 3 24 3c-7.364 0-12.515.277-15.743.539-2.555.208-4.51 2.163-4.718 4.718C3.277 11.485 3 16.636 3 24c0 7.364.277 12.515.539 15.743Z" stroke-width="3"/><path stroke-linecap="round" d="m3.5 13.5 41 0" stroke-width="3"/><path stroke-linecap="round" stroke-linejoin="round" d="M10 8.5h2M18 8.5h2" stroke-width="3"/></svg>' },
    { max: 99, label: 'Testing', color: '#2196f3', soft: '#dff1ff', text: '#246da8', desc: 'Lagi dicek biar aman dipakai.',
      icon: '<svg viewBox="0 0 24 24" fill="none"><path d="m9.74872 2.49415 8.41068 4.82572M9.74872 2.49415 2.65093 14.7455c-1.34 2.3129-.54478 5.2704 1.77616 6.6058 2.32094 1.3354 5.28871.5429 6.62871-1.77l1.4953-2.581M9.74872 2.49415 8.91283 2m9.24657 5.31987L15.902 11.2163m2.2574-3.89643L19 7.80374m-3.098 3.41256-1.7134 2.9575m1.7134-2.9575-2.558-1.47179m.8446 4.42929-1.6375 2.8265m1.6375-2.8265-4.20292-2.4182m2.56542 5.2447-2.61272-1.5032" stroke-linecap="round" stroke-width="1.5"/><path d="M22 14.9167C22 16.0673 21.1046 17 20 17s-2-.9327-2-2.0833c0-.7199.783-1.6808 1.3691-2.2992.347-.3661.9148-.3661 1.2618 0C21.217 13.2359 22 14.1968 22 14.9167Z" stroke-width="1.5"/></svg>' },
    { max: 100, label: 'Done', color: '#0091ff', soft: '#dff2ff', text: '#0878ca', desc: 'Final check selesai dan siap dipakai.',
      icon: '<svg viewBox="-0.75 -0.75 24 24" fill="none"><path d="M18.53 9.39 13.05 14.86 8.89 14.86 7.6 13.57 7.6 9.43 13.08 3.97C13.83 3.22 14.33 2.7 15 2.43 15.66 2.16 16.39 2.17 17.45 2.17H17.98C18.82 2.17 19.52 2.17 20.07 2.25 21 2.32 21.52 2.49 21.94 2.91 22.36 3.33 22.53 3.85 22.61 4.42 22.68 4.97 22.68 5.67 22.68 6.51V7.04C22.68 8.09 22.69 8.82 22.42 9.48 22.15 10.14 21.63 10.65 20.88 11.4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.18 12.29 7.25 14.21 8.25 15.21 10.18 13.28" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M16.12 6.87C16.56 7.3 16.56 8.01 16.12 8.44 15.68 8.88 14.98 8.88 14.54 8.44 14.1 8.01 14.1 7.3 14.54 6.87 14.98 6.43 15.68 6.43 16.12 6.87Z" stroke-width="1.5"/></svg>' }
  ];
  function soonPhaseIndex(pct){
    const value = Math.max(0, Math.min(100, pct || 0));
    const idx = SOON_PHASES.findIndex(ph => value <= ph.max);
    return idx === -1 ? SOON_PHASES.length - 1 : idx;
  }
  function soonTaskListHtml(activeIndex){
    return '<div class="flamo3d-prs-soon-task-list">' + SOON_PHASES.map((ph, i) => {
      const state = i < activeIndex ? 'is-done' : i === activeIndex ? 'is-active' : 'is-disabled';
      return `<div class="flamo3d-prs-soon-task ${state}" style="--accent:${ph.color};--accent-soft:${ph.soft};--accent-text:${ph.text}"><span class="flamo3d-prs-soon-task-icon">${ph.icon}</span><span class="flamo3d-prs-soon-task-body"><b>${esc(ph.label)}</b><small>${esc(ph.desc)}</small></span></div>`;
    }).join('') + '</div>';
  }
  function soonOverviewHtml(images){
    const list = Array.isArray(images) ? images.filter(Boolean) : [];
    if(!list.length) return '';
    return `<div class="flamo3d-prs-soon-overview" data-soon-slider>
      <div class="flamo3d-prs-soon-overview-frame" data-soon-slider-frame>
        <div class="flamo3d-prs-soon-overview-track" data-soon-slider-track>${list.map(src => `<div class="flamo3d-prs-soon-overview-slide"><img src="${esc(src)}" alt=""></div>`).join('')}</div>
      </div>
      <div class="flamo3d-prs-soon-dots" data-soon-slider-dots>${list.map((_, i) => `<button type="button" class="flamo3d-prs-soon-dot${i === 0 ? ' is-active' : ''}" aria-label="Slide ${i + 1}"></button>`).join('')}</div>
    </div>`;
  }
  // Shared: sliding-window katalog carousel (Coming Soon + Member access panel)
  function katalogPages(images){
    const list = Array.isArray(images) ? images.filter(Boolean) : [];
    const n = list.length;
    if(n === 0) return [];
    if(n <= 3) return [list];
    return list.map((_, i) => [list[i], list[(i + 1) % n], list[(i + 2) % n]]);
  }
  function katalogTrackHtml(pages, photoClass){
    return pages.map(page => `<div class="${photoClass}-page">${page.map(src => `<article class="${photoClass}-photo"><img src="${esc(src)}" alt=""></article>`).join('')}</div>`).join('');
  }
  function initKatalogSlider(frame){
    if(!frame || frame.dataset.katalogInit) return;
    frame.dataset.katalogInit = '1';
    const track = frame.querySelector('[data-katalog-track]');
    const count = track ? track.children.length : 0;
    if(!track || count < 2) return;
    let index = 0, timer = null, startX = 0, currentX = 0, dragging = false, frameWidth = 1;
    const setTransition = active => { track.style.transition = active ? 'transform .34s cubic-bezier(.2,.8,.2,1)' : 'none'; };
    const render = (extra = 0) => { frameWidth = frame.clientWidth || 1; track.style.transform = `translateX(${(-index * frameWidth) + extra}px)`; };
    const go = next => { index = (next + count) % count; setTransition(true); render(); };
    const startLoop = () => { clearInterval(timer); timer = setInterval(() => go(index + 1), 2600); };
    const stopLoop = () => clearInterval(timer);
    frame.addEventListener('pointerdown', e => { dragging = true; startX = e.clientX; currentX = e.clientX; frame.classList.add('is-dragging'); frame.setPointerCapture(e.pointerId); stopLoop(); setTransition(false); });
    frame.addEventListener('pointermove', e => { if(!dragging) return; currentX = e.clientX; render(currentX - startX); });
    frame.addEventListener('pointerup', () => { if(!dragging) return; dragging = false; frame.classList.remove('is-dragging'); const diff = currentX - startX, threshold = frameWidth * .18; if(Math.abs(diff) > threshold) go(index + (diff < 0 ? 1 : -1)); else go(index); startLoop(); });
    frame.addEventListener('pointercancel', () => { dragging = false; frame.classList.remove('is-dragging'); go(index); startLoop(); });
    render(); startLoop();
  }
  function soonKatalogHtml(images){
    const pages = katalogPages(images);
    if(!pages.length) return '';
    return `<div class="flamo3d-prs-soon-katalog-window" data-katalog-window>
      <div class="flamo3d-prs-soon-katalog-track" data-katalog-track>${katalogTrackHtml(pages, 'flamo3d-prs-soon-katalog')}</div>
    </div>`;
  }
  function initSoonSliders(root){
    if(!root || !root.querySelectorAll) return;
    root.querySelectorAll('[data-soon-slider]').forEach(wrap => {
      const frame = wrap.querySelector('[data-soon-slider-frame]');
      const track = wrap.querySelector('[data-soon-slider-track]');
      const dots = Array.from(wrap.querySelectorAll('[data-soon-slider-dots] .flamo3d-prs-soon-dot'));
      const count = track ? track.children.length : 0;
      if(!frame || !track || count < 2) return;
      let index = 0, timer = null, startX = 0, currentX = 0, dragging = false, frameWidth = 1;
      const setTransition = active => { track.style.transition = active ? 'transform .34s cubic-bezier(.2,.8,.2,1)' : 'none'; };
      const render = (extra = 0) => { frameWidth = frame.clientWidth || 1; track.style.transform = `translateX(${(-index * frameWidth) + extra}px)`; dots.forEach((d, i) => d.classList.toggle('is-active', i === index)); };
      const go = next => { index = (next + count) % count; setTransition(true); render(); };
      const startLoop = () => { clearInterval(timer); timer = setInterval(() => go(index + 1), 3800); };
      const stopLoop = () => clearInterval(timer);
      frame.addEventListener('pointerdown', e => { dragging = true; startX = e.clientX; currentX = e.clientX; frame.classList.add('is-dragging'); frame.setPointerCapture(e.pointerId); stopLoop(); setTransition(false); });
      frame.addEventListener('pointermove', e => { if(!dragging) return; currentX = e.clientX; render(currentX - startX); });
      frame.addEventListener('pointerup', () => { if(!dragging) return; dragging = false; frame.classList.remove('is-dragging'); const diff = currentX - startX, threshold = frameWidth * .18; if(Math.abs(diff) > threshold) go(index + (diff < 0 ? 1 : -1)); else go(index); startLoop(); });
      frame.addEventListener('pointercancel', () => { dragging = false; frame.classList.remove('is-dragging'); go(index); startLoop(); });
      dots.forEach((dot, i) => dot.addEventListener('click', () => { go(i); startLoop(); }));
      render(); startLoop();
    });
  }
  function toggleSoonKatalog(btn){
    const wrap = btn.closest('[data-soon-left]') || btn.parentElement;
    const morph = wrap && wrap.querySelector('[data-soon-catalog-morph]');
    const label = btn.querySelector('[data-soon-catalog-label]');
    if(!morph) return;
    const open = !morph.classList.contains('is-open');
    morph.classList.toggle('is-open', open);
    btn.classList.toggle('is-open', open);
    if(open) initKatalogSlider(morph.querySelector('[data-katalog-window]'));
    if(label) label.textContent = open ? 'Katalog Kami' : 'Lihat Katalog';
  }

  function buildPresetPanelContent(key){
    const p = (window.PRESETS || {})[key] || {};
    const status = p.status || 'active', access = p.access || 'free';
    if(access === 'premium' && status === 'active'){
      const sliderHtml = memberSliderHtml(p.memberImages);
      const descHtml = p.memberDesc ? `<p class="flamo3d-prs-member-desc">${esc(p.memberDesc)}</p>` : '';
      const accessLayerHtml = memberAccessLayerHtml(p.memberKatalog);
      const mascotUrl = absUrl('../../assets/icons/flamo-login-mascot.png');
      if(!FONT_API.loggedIn){
        return { title: p.name || 'Premium Tool', titleIco: _icoKey, sub: 'Member Login · Login untuk cek akses premium.',
          body: `<div class="flamo3d-prs-member-body flamo3d-prs-member-body-guest">
            <div class="flamo3d-prs-member-login-col">
              <img class="flamo3d-prs-member-mascot" src="${esc(mascotUrl)}" alt="Flamo mascot">
              <div class="flamo3d-prs-member-form">
                <input class="flamo3d-prs-member-input" data-inline-login-identity type="text" placeholder="Email atau username" autocomplete="username">
                <input class="flamo3d-prs-member-input" data-inline-login-password type="password" placeholder="Password" autocomplete="current-password">
                <button class="flamo3d-prs-member-small-link" data-inline-forgot-open type="button">Lupa password?</button>
                <p class="flamo3d-prs-member-note" data-inline-auth-status aria-live="polite"></p>
              </div>
              <div class="flamo3d-prs-member-actions">
                <button class="flamo3d-prs-member-btn" type="button" data-member-access-toggle>Lihat Detail</button>
                <button class="flamo3d-prs-member-btn primary" data-inline-login-submit type="button">Login</button>
              </div>
              <a class="flamo3d-prs-member-btn" style="width:100%;height:44px;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:10px" href="#nexora-local-only/?flamo_google_login=1" target="_top"><img src="/wp-content/plugins/flamo-3d-tools-clean/assets/icons/google-login.svg" alt="" style="width:20px;height:20px;display:block"><span>Continue with Google</span></a>
              <p class="flamo3d-prs-member-note">Belum punya akun? <a href="/login" target="_top">Daftar disini</a></p>
            </div>
            <div class="flamo3d-prs-member-premium-col">
              <p class="flamo3d-prs-member-title-sm">Detail Premium</p>
              ${sliderHtml}
              ${descHtml}
              ${memberBenefitBlockHtml()}
              <button class="flamo3d-prs-member-text-link" type="button" data-member-access-toggle>Siapa aja yang bisa akses?</button>
              <div class="flamo3d-prs-member-actions">
                <button class="flamo3d-prs-member-btn" type="button" data-member-access-toggle>Lihat Detail</button>
                <a class="flamo3d-prs-member-btn primary" href="/marketplace" target="_top">Join Member</a>
              </div>
              ${accessLayerHtml}
            </div>
          </div>` };
      }
      return { title: p.name || 'Premium Tool', titleIco: _icoKey, sub: 'Member Only · Akun kamu belum punya akses premium.',
        body: `<div class="flamo3d-prs-member-body flamo3d-prs-member-body-user">
          <div class="flamo3d-prs-member-premium-col">
            <p class="flamo3d-prs-member-title-sm">Detail Premium</p>
            ${sliderHtml}
            ${descHtml}
            ${memberBenefitBlockHtml()}
            <button class="flamo3d-prs-member-text-link" type="button" data-member-access-toggle>Siapa aja yang bisa akses?</button>
            <div class="flamo3d-prs-member-actions">
              <button class="flamo3d-prs-member-btn" type="button" data-member-access-toggle>Lihat Detail</button>
              <a class="flamo3d-prs-member-btn primary" href="/marketplace" target="_top">Join Member</a>
            </div>
            ${accessLayerHtml}
          </div>
        </div>` };
    }
    if(status === 'soon'){
      const pct = p.soonProgress || 0;
      const activeIndex = soonPhaseIndex(pct);
      const detailUrl = p.detailUrl || '#';
      const overviewHtml = soonOverviewHtml(p.overviewImages);
      const descHtml = p.comingSoonDesc ? `<p class="flamo3d-prs-soon-desc">${esc(p.comingSoonDesc)}</p>` : '';
      const katalogHtml = soonKatalogHtml(p.katalogImages);
      const actionsHtml = !FONT_API.loggedIn
        ? `<div class="flamo3d-prs-soon-actions"><a class="flamo3d-prs-soon-btn" href="/login" target="_top">Login</a><a class="flamo3d-prs-soon-btn primary" href="/marketplace" target="_top">Market</a></div><a class="flamo3d-prs-soon-btn" style="width:100%;height:44px;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:10px" href="#nexora-local-only/?flamo_google_login=1" target="_top"><img src="/wp-content/plugins/flamo-3d-tools-clean/assets/icons/google-login.svg" alt="" style="width:20px;height:20px;display:block"><span>Continue with Google</span></a>`
        : `<div class="flamo3d-prs-soon-actions"><a class="flamo3d-prs-soon-btn" href="${esc(detailUrl)}" target="_top">Lihat Detail</a><a class="flamo3d-prs-soon-btn primary" href="/marketplace" target="_top">Market</a></div>`;
      return { title: p.name || 'Coming Soon', titleIco: _icoStar, sub: 'Coming Soon · by Flamo Creative',
        body: `<div class="flamo3d-prs-soon-popup">
          <div class="flamo3d-prs-soon-scroll">
            <div class="flamo3d-prs-soon-left" data-soon-left>
              ${overviewHtml}
              ${descHtml}
              <button class="flamo3d-prs-soon-katalog-toggle" type="button" data-soon-catalog-toggle><span data-soon-catalog-label>Lihat Katalog</span> ${_icoChevronDown}</button>
              <div class="flamo3d-prs-soon-katalog-morph" data-soon-catalog-morph>${katalogHtml}</div>
            </div>
            <aside class="flamo3d-prs-soon-right">
              <p class="flamo3d-prs-soon-right-title">Update pengerjaan</p>
              ${soonTaskListHtml(activeIndex)}
            </aside>
          </div>
          ${actionsHtml}
        </div>` };
    }
    if(status === 'donate'){
      const goal = Number(p.supportGoal || 500000);
      const raised = Number(p.supportCollected || p.donateCollected || 0);
      const pct = goal > 0 ? Math.max(0, Math.min(100, Math.round((raised / goal) * 100))) : Math.max(0, Math.min(100, Number(p.supportProgress || 0)));
      const overviewHtml = donateOverviewHtml(p.overviewImages);
      const descHtml = p.toolDescShort ? `<p class="flamo3d-prs-donate-desc">${esc(p.toolDescShort)}</p>` : '';
      const detailUrl = p.detailUrl || '#';
      if(!FONT_API.loggedIn){
        return { title: p.name || p.toolName || 'Support Tool', titleIco: '', sub: 'Support preset · by Flamo Creative',
          body: `<div class="flamo3d-prs-donate-body flamo3d-prs-donate-body-guest">
            <div class="flamo3d-prs-donate-preview">${overviewHtml}${descHtml}</div>
            <div class="flamo3d-prs-donate-detail-card">
              <h3 class="flamo3d-prs-donate-detail-title">Support detail</h3>
              <div class="flamo3d-prs-donate-actions">
                <a class="flamo3d-prs-donate-btn" href="${esc(detailUrl)}" target="_top">Lihat Tools</a>
                <a class="flamo3d-prs-donate-btn primary" href="/login" target="_top">Login</a>
              </div>
              <a class="flamo3d-prs-donate-btn" style="width:100%;height:44px;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:10px" href="#nexora-local-only/?flamo_google_login=1" target="_top"><img src="/wp-content/plugins/flamo-3d-tools-clean/assets/icons/google-login.svg" alt="" style="width:20px;height:20px;display:block"><span>Continue with Google</span></a>
              <p class="flamo3d-prs-donate-signup-note">Belum punya akun? <a href="/login" target="_top">Daftar disini</a></p>
            </div>
          </div>` };
      }
      const username = USERNAME;
      return { title: p.name || p.toolName || 'Support Tool', titleIco: '', sub: 'Support preset · by Flamo Creative',
        body: `<div class="flamo3d-prs-donate-body flamo3d-prs-donate-body-user" data-tool-name="${esc(p.toolName || 'Flamo Tools')}" data-subject-type="${esc(p.subjectType || 'preset')}" data-subject-id="${esc(p.subjectId || '')}" data-wa-number="${esc(p.waNumber || '')}" data-username="${esc(username)}" data-detail-url="${esc(detailUrl)}">
          <div class="flamo3d-prs-donate-scroll">
            <div class="flamo3d-prs-donate-left">
              <div class="flamo3d-prs-donate-preview">${overviewHtml}${descHtml}</div>
              <div class="flamo3d-prs-donate-progress-large" aria-label="Donation progress">
                <div class="flamo3d-prs-donate-large-track">
                  <div class="flamo3d-prs-donate-large-fill" style="width:${pct}%">
                    <div class="flamo3d-prs-donate-large-pixels" aria-hidden="true">${donateProgressPixels()}</div>
                    <span class="flamo3d-prs-donate-large-badge">${pct}</span>
                  </div>
                </div>
                <div class="flamo3d-prs-donate-large-status"><span>Terkumpul :</span><b>${donateFmtRp(raised)} / ${donateFmtRp(goal)}</b></div>
              </div>
            </div>
            <aside class="flamo3d-prs-donate-right">
              <h3 class="flamo3d-prs-donate-right-title">Panel Donasi</h3>
              <figure class="flamo3d-prs-donate-qris-frame"><img src="${esc(p.qrisImage || '')}" alt="QRIS ${esc(p.merchantName || '')}"></figure>
              <div class="flamo3d-prs-donate-qris-meta"><p class="flamo3d-prs-donate-qris-name">${esc(p.merchantName || '')}</p><p class="flamo3d-prs-donate-qris-nmid">NMID: ${esc(p.merchantNmid || '')}</p></div>
              <form id="flamoDonateDesktopForm" class="flamo3d-prs-donate-form" data-donate-form>
                <label class="flamo3d-prs-donate-field">
                  <span class="flamo3d-prs-donate-label">Nominal</span>
                  <input class="flamo3d-prs-donate-input" type="text" inputmode="numeric" placeholder="Contoh: 50000" data-donate-nominal required>
                </label>
                <div class="flamo3d-prs-donate-field">
                  <div class="flamo3d-prs-donate-field-row">
                    <span class="flamo3d-prs-donate-label">Nama pengirim</span>
                    <label class="flamo3d-prs-donate-anon"><input type="checkbox" data-donate-anon><span>Kirim sebagai anonim</span></label>
                  </div>
                  <input class="flamo3d-prs-donate-input" type="text" value="${esc(username)}" placeholder="Tulis nama bebas" data-donate-sender readonly>
                </div>
                <label class="flamo3d-prs-donate-field">
                  <span class="flamo3d-prs-donate-label">Pesan untuk dev</span>
                  <textarea class="flamo3d-prs-donate-textarea" placeholder="Tulis pesan singkat untuk dev" data-donate-message></textarea>
                </label>
                <label class="flamo3d-prs-donate-file">
                  <span class="flamo3d-prs-donate-file-name" data-donate-file-name>Upload bukti transfer</span>
                  <span class="flamo3d-prs-donate-file-chip">Pilih file</span>
                  <input type="file" accept="image/*,.pdf" data-donate-file>
                </label>
              </form>
            </aside>
          </div>
          <div class="flamo3d-prs-donate-actionbar">
            <div class="flamo3d-prs-donate-actions">
              <a class="flamo3d-prs-donate-btn" href="${esc(detailUrl)}" target="_top">Lihat Tools</a>
              <button class="flamo3d-prs-donate-btn primary" type="button" data-donate-wa>Konfirmasi WA</button>
            </div>
            <button class="flamo3d-prs-donate-confirm" type="submit" form="flamoDonateDesktopForm">Konfirmasi</button>
          </div>
        </div>` };
    }
    return null;
  }

  let _prsPanelKey = null;
  function showPresetStatusPanel(key){
    const p = (window.PRESETS || {})[key] || {};
    const content = buildPresetPanelContent(key);
    if(!content) return;
    const prsType = p.status === 'soon' ? 'soon' : p.status === 'donate' ? 'donate' : 'member';
    // Always hand off to the shared parent-shell status panel (matches every
    // other Flamo tool) instead of the old desktop-only local panel, which
    // used to render different markup and could silently no-op if its
    // #prsPanelEl/#prsPanelBd elements weren't present.
    const payload = { key, prsType, title: content.title, sub: content.sub, loggedIn: !!FONT_API.loggedIn };
    if(prsType === 'member'){
      payload.memberDesc = p.memberDesc || '';
      payload.memberImages = (Array.isArray(p.memberImages) ? p.memberImages : []).map(absUrl);
      payload.memberKatalog = (Array.isArray(p.memberKatalog) ? p.memberKatalog : []).map(item => ({ name: item.name || '', image: item.image ? absUrl(item.image) : '' }));
    }
    if(prsType === 'soon'){
      payload.progress = p.soonProgress || 0;
      payload.detailUrl = p.detailUrl || '#';
      payload.comingSoonDesc = p.comingSoonDesc || '';
      payload.overviewImages = (Array.isArray(p.overviewImages) ? p.overviewImages : []).map(absUrl);
      payload.katalogImages = (Array.isArray(p.katalogImages) ? p.katalogImages : []).map(absUrl);
    }
    if(prsType === 'donate'){
      const mobileGoal = Number(p.supportGoal || 500000);
      const mobileRaised = Number(p.supportCollected || p.donateCollected || 0);
      payload.pct = mobileGoal > 0 ? Math.max(0, Math.min(100, Math.round((mobileRaised / mobileGoal) * 100))) : (p.supportProgress || 0);
      payload.goal = mobileGoal;
      payload.collected = mobileRaised;
      payload.subjectType = p.subjectType || 'preset';
      payload.subjectId = p.subjectId || '';
      payload.detailUrl = p.detailUrl || '#';
      payload.toolName = p.toolName || 'Flamo Tools';
      payload.toolDescShort = p.toolDescShort || '';
      payload.overviewImages = (Array.isArray(p.overviewImages) ? p.overviewImages : []).map(absUrl);
      payload.supporters = FONT_API.loggedIn ? (Array.isArray(p.supporters) ? p.supporters : []) : [];
      payload.merchantName = p.merchantName || '';
      payload.merchantNmid = p.merchantNmid || '';
      payload.qrisImage = p.qrisImage ? absUrl(p.qrisImage) : '';
      payload.waNumber = p.waNumber || '';
      payload.username = FONT_API.loggedIn ? USERNAME : '';
    }
    post('FLAMO_PRS_STATUS_OPEN', payload);
  }
  window.flamoOpenDbStatusPanel = function(item){
    item = item || {};
    const key = String(item.engineKey || item.slug || ('db-' + item.id));
    const status = item.prsType === 'soon' ? 'soon' : item.prsType === 'donate' ? 'donate' : 'active';
    window.PRESETS = window.PRESETS || {};
    window.PRESETS[key] = Object.assign({}, window.PRESETS[key] || {}, {
      name: item.name || key,
      status,
      access: item.prsType === 'member' ? 'premium' : (item.access === 'member_only' ? 'premium' : 'free'),
      soonProgress: Number(item.progress || 0),
      supportProgress: Number(item.progress || 0),
      supportGoal: Number(item.donateTarget || 500000),
      supportCollected: Number(item.donateCollected || 0),
      donateCollected: Number(item.donateCollected || 0),
      subjectType: item.subjectType || item.itemType || 'preset',
      subjectId: Number(item.subjectId || item.id || 0),
      detailUrl: item.detailUrl || '#',
      comingSoonDesc: item.description || item.shortDescription || '',
      toolDescShort: item.description || item.shortDescription || '',
      toolName: item.toolName || item.name || 'Flamo Tools',
      overviewImages: Array.isArray(item.overviewImages) ? item.overviewImages : [],
      katalogImages: Array.isArray(item.katalogImages) ? item.katalogImages : []
    });
    showPresetStatusPanel(key);
  };
  document.addEventListener('flamo:db-status-open', function(event){
    window.flamoOpenDbStatusPanel(event.detail || {});
  });
  function closePresetStatusPanel(){
    $('prsPanelEl')?.classList.remove('is-open');
    $('prsPanelBd')?.classList.remove('is-open');
    _prsPanelKey = null;
    post('FLAMO_DONATE_PANEL_TOGGLE', { open: false });
    post('FLAMO_SOON_PANEL_TOGGLE', { open: false });
  }

  function initPresetCardWrap(){
    const picker = document.querySelector('.flamo3d-preset-picker');
    const card = picker && picker.querySelector('.flamo3d-preset-card');
    if(!picker || !card || $('presetCardWrap')) return;
    const wrap = document.createElement('div');
    wrap.id = 'presetCardWrap';
    wrap.className = 'flamo-prs-wrap';
    picker.insertBefore(wrap, card);
    wrap.appendChild(card);
    const footer = document.createElement('div');
    footer.id = 'presetCardFooter';
    footer.className = 'flamo-prs-footer';
    footer.style.display = 'none';
    wrap.appendChild(footer);
  }
  function updatePresetCardStatus(){
    const wrap = $('presetCardWrap'), footer = $('presetCardFooter');
    if(!wrap || !footer) return;
    const p = currentPreset();
    const cls = presetWrapClass(p);
    wrap.className = 'flamo-prs-wrap' + (cls ? ' ' + cls : '');
    if(cls){
      footer.className = 'flamo-prs-footer flamo-prs-footer--' + cls.replace('is-','');
      footer.innerHTML = presetFooterHtml(p).replace(/^<div[^>]*>|<\/div>$/g,'');
      footer.style.display = '';
    } else {
      footer.style.display = 'none';
      footer.innerHTML = '';
    }
  }

  function bindPresetPanelEvents(){
    $('prsPanelBd')?.addEventListener('click', closePresetStatusPanel);
    $('prsPanelEl')?.addEventListener('click', e => {
      if(e.target.closest('[data-prs-close]')){ closePresetStatusPanel(); return; }
      const waBtn = e.target.closest('[data-donate-wa]');
      if(waBtn){ sendDonateWaConfirm(waBtn); return; }
      const katalogToggle = e.target.closest('[data-soon-catalog-toggle]');
      if(katalogToggle){ toggleSoonKatalog(katalogToggle); return; }
      const accessToggle = e.target.closest('[data-member-access-toggle]');
      if(accessToggle){ toggleMemberAccess(accessToggle); return; }
      const memberKatalogToggle = e.target.closest('[data-member-katalog-toggle]');
      if(memberKatalogToggle) toggleMemberKatalog(memberKatalogToggle);
      const inlineLogin = e.target.closest('[data-inline-login-submit]');
      if(inlineLogin){ submitInlineLogin(inlineLogin); return; }
      const forgotOpen = e.target.closest('[data-inline-forgot-open]');
      if(forgotOpen){ showInlineForgot(forgotOpen); return; }
      const forgotBack = e.target.closest('[data-inline-forgot-back]');
      if(forgotBack && _prsPanelKey){ showPresetStatusPanel(_prsPanelKey); return; }
      const forgotSubmit = e.target.closest('[data-inline-forgot-submit]');
      if(forgotSubmit){ submitInlineForgot(forgotSubmit); return; }
    });
    $('prsPanelEl')?.addEventListener('submit', e => {
      const form = e.target.closest('[data-donate-form]');
      if(!form) return;
      e.preventDefault();
      submitDonateForm(form);
    });
    $('prsPanelEl')?.addEventListener('input', e => {
      if(e.target.matches('[data-donate-nominal]')) formatDonateNominal(e.target);
    });
    $('prsPanelEl')?.addEventListener('change', e => {
      if(e.target.matches('[data-donate-anon]')) toggleDonateAnon(e.target);
      if(e.target.matches('[data-donate-file]')) updateDonateFileName(e.target);
    });
    $('prsPanelClose')?.addEventListener('click', closePresetStatusPanel);
  }

  function inlineAuthConfig(){
    try {
      return (window.parent && window.parent.flamoInlineAuth) || window.flamoInlineAuth || {};
    } catch(e) {
      return window.flamoInlineAuth || {};
    }
  }
  function inlineAuthPost(action, identity, password){
    const config = inlineAuthConfig();
    if(!config.ajaxUrl || !config.nonce) return Promise.reject(new Error('Sistem login belum siap.'));
    const body = new FormData();
    body.set('action', action);
    body.set('nonce', config.nonce);
    body.set('identity', identity || '');
    if(password !== undefined) body.set('password', password || '');
    return fetch(config.ajaxUrl,{method:'POST',body,credentials:'same-origin'})
      .then(r => r.json())
      .then(result => {
        if(!result.success) throw new Error(result.data && result.data.message ? result.data.message : 'Permintaan gagal.');
        return result.data || {};
      });
  }
  function setInlineAuthStatus(panel, message, success){
    const status = panel && panel.querySelector('[data-inline-auth-status]');
    if(!status) return;
    status.textContent = message || '';
    status.style.color = success ? '#21b878' : (message ? '#ff607c' : '');
  }
  function submitInlineLogin(button){
    const panel = button.closest('.flamo3d-prs-panel');
    const identity = panel && panel.querySelector('[data-inline-login-identity]');
    const password = panel && panel.querySelector('[data-inline-login-password]');
    button.disabled = true;
    setInlineAuthStatus(panel,'Memeriksa akun…');
    inlineAuthPost('flamo_inline_login',identity && identity.value,password && password.value)
      .then(data => {
        setInlineAuthStatus(panel,data.message || 'Login berhasil.',true);
        setTimeout(() => window.top.location.reload(),450);
      })
      .catch(error => {
        setInlineAuthStatus(panel,error.message);
        button.disabled = false;
      });
  }
  function showInlineForgot(button){
    const col = button.closest('.flamo3d-prs-member-login-col');
    if(!col) return;
    col.innerHTML = `<div class="flamo3d-prs-member-form">
      <p class="flamo3d-prs-member-title-sm">Lupa Password</p>
      <p class="flamo3d-prs-member-note">Masukkan email atau username. Link reset dikirim oleh WordPress ke email akunmu.</p>
      <input class="flamo3d-prs-member-input" data-inline-forgot-identity type="text" placeholder="Email atau username" autocomplete="username">
      <p class="flamo3d-prs-member-note" data-inline-auth-status aria-live="polite"></p>
    </div>
    <div class="flamo3d-prs-member-actions">
      <button class="flamo3d-prs-member-btn" data-inline-forgot-back type="button">Kembali</button>
      <button class="flamo3d-prs-member-btn primary" data-inline-forgot-submit type="button">Kirim Link</button>
    </div>`;
  }
  function submitInlineForgot(button){
    const panel = button.closest('.flamo3d-prs-panel');
    const identity = panel && panel.querySelector('[data-inline-forgot-identity]');
    button.disabled = true;
    setInlineAuthStatus(panel,'Mengirim link reset…');
    inlineAuthPost('flamo_inline_forgot',identity && identity.value)
      .then(data => {
        setInlineAuthStatus(panel,data.message || 'Link reset sudah dikirim.',true);
        button.disabled = false;
      })
      .catch(error => {
        setInlineAuthStatus(panel,error.message);
        button.disabled = false;
      });
  }

  function renderPresetMenu(open = false){
    const menu = $('presetMenu');
    if(!menu) return;
    menu.innerHTML = Object.entries(window.PRESETS || {}).map(([key, item], index) => {
      const img = (window.GIFS || {})[item.gif] || '';
      const cls = presetWrapClass(item);
      const imgEl = img ? `<img src="${img}" alt="">` : `<div class="flamo-prs-thumb-ph"></div>`;
      const inner = `${imgEl}<span>${esc(item.name || prettyName(key))}</span>`;
      const btn = `<button class="flamo3d-preset-option${key === selectedPreset ? ' is-active' : ''}" type="button" data-preset="${esc(key)}">${inner}</button>`;
      if(cls) return `<div class="flamo-prs-wrap ${cls}" style="--i:${index}" data-status-preset="${esc(key)}">${btn}${presetFooterHtml(item)}</div>`;
      return `<button class="flamo3d-preset-option${key === selectedPreset ? ' is-active' : ''}" type="button" data-preset="${esc(key)}" style="--i:${index}">${inner}</button>`;
    }).join('');
    menu.classList.toggle('is-open', !!open);
  }

  function togglePresetMenu(force){
    const picker = document.querySelector('.flamo3d-preset-picker');
    const menu = $('presetMenu');
    const trigger = $('presetTrigger');
    const open = force == null ? !(menu && menu.classList.contains('is-open')) : !!force;
    renderPresetMenu(open);
    if(picker) picker.classList.toggle('is-open', open);
    if(trigger) trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function choosePreset(key){
    const item = (window.PRESETS || {})[key];
    if(!item) return;
    if(presetIsRestricted(item)){ showPresetStatusPanel(key); return; }
    // Kalau status panel (coming soon/donate) lagi kebuka dari klik preset
    // sebelumnya, dan user malah milih preset normal, panel itu ga pernah
    // dikasih tau buat nutup — akibatnya tombol Generate ketutup widget
    // pixel-grid selamanya sampe user nemu tombol close kecilnya sendiri.
    post('FLAMO_PRS_STATUS_CLOSE');
    selectedPreset = key;
    const p = currentPreset();
    if($('animPreset')) $('animPreset').value = selectedPreset;
    if($('presetName')) $('presetName').textContent = p.name || prettyName(selectedPreset);
    if($('presetThumb')) { const src = (window.GIFS || {})[p.gif] || ''; if(src) $('presetThumb').src = src; else $('presetThumb').removeAttribute('src'); $('presetThumb').style.display = 'block'; }
    if($('presetSub')) $('presetSub').textContent = '';
    updatePresetCardStatus();
    updateFileNameAuto();
    updateAll();
    markDirty();
  }

  function syncRange(id, suffix = ''){
    const el = $(id), v = $(id + 'Value') || (id === 'randomAmount' ? $('randomValue') : null);
    if(!el) return;
    const min = Number(el.min || 0), max = Number(el.max || 100), val = Number(el.value || 0);
    const pct = max === min ? 0 : Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
    el.style.setProperty('--fill', pct + '%');
    if(v) v.textContent = (id === 'layerDuration' ? Number(el.value).toFixed(1) : el.value) + suffix;
  }

  function syncLabels(){
    syncRange('fontSize','px'); syncRange('spacing',''); syncRange('lineHeight',''); syncRange('spread','ms'); syncRange('stagger','ms'); syncRange('randomAmount','%'); syncRange('seed',''); syncRange('layerDuration','s');
    const font = ($('fontName') && $('fontName').value) || 'Lexend';
    const weight = ($('fontStyle') && $('fontStyle').value) || '700';
  }

  function setCurvePreset(mode){
    graphMode = mode || 'smooth';
    if(mode !== 'custom') curveHandles = structuredCloneSafe(GRAPH_CURVES[graphMode] || GRAPH_CURVES.smooth);
    $$('[data-graph-choice]').forEach(b => b.classList.toggle('is-active', (b.dataset.graphChoice === graphMode) || (graphMode === 'random' && b.dataset.graphChoice === 'random')));
    updateAll();
    markDirty();
  }

  function cubicY(t){ const u=1-t, p1=curveHandles.p1, p2=curveHandles.p2; return 3*u*u*t*p1.y + 3*u*t*t*p2.y + t*t*t; }
  function seeded(i){ const seed = +($('seed')?.value || 1); const x = Math.sin((i + 1) * 999 + seed * 77) * 10000; return x - Math.floor(x); }

  function getUnits(){
    const target = $('timingTarget')?.value || 'char';
    const spacing = +($('spacing')?.value || 40);
    const lh = +($('lineHeight')?.value || 80);
    const lines = (($('inputText')?.value || '')).split('\n');
    const units = [];
    let wordSeq = 0;
    lines.forEach((line, li) => {
      const y = (li - (lines.length - 1) / 2) * lh;
      if(target === 'word'){
        const matches = line.match(/\S+/g) || [];
        const widths = matches.map(w => Math.max(spacing * 1.2, w.length * spacing * .72));
        const totalWidth = widths.reduce((a,b)=>a+b,0) + Math.max(0, matches.length - 1) * spacing;
        let x = -totalWidth / 2;
        matches.forEach((word, wi) => { const w = widths[wi]; units.push({ ch: word, x: x + w / 2, y, line: li, word: wordSeq++ }); x += w + spacing; });
      } else {
        let totalWidth = 0;
        [...line].forEach(ch => totalWidth += ch === ' ' ? spacing * .55 : spacing);
        let x = -totalWidth / 2 + spacing / 2;
        let curWord = wordSeq++;
        [...line].forEach(ch => { if(ch === ' '){ x += spacing * .55; curWord = wordSeq++; return; } units.push({ ch, x, y, line: li, word: curWord }); x += spacing; });
      }
    });
    return units;
  }

  function calcStarts(n){
    if(!n) return [];
    const spread = +($('spread')?.value || 0), stagger = +($('stagger')?.value || 0), randomAmt = (+($('randomAmount')?.value || 0)) / 100;
    const maxBase = Math.max(spread, stagger * Math.max(0, n - 1));
    return Array.from({ length: n }, (_, i) => {
      const t = n === 1 ? 0 : i / (n - 1);
      let base;
      if(graphMode === 'random') base = Math.round(seeded(i) * maxBase);
      else base = Math.round(cubicY(t) * maxBase);
      base += Math.round((seeded(i + 31) - .5) * randomAmt * stagger * 2);
      return Math.max(0, base);
    });
  }

  function layerDurationMs(){ return Math.max(200, Math.round((+($('layerDuration')?.value || 4)) * 1000)); }
  function timingPlan(units){
    const starts=calcStarts(units.length), duration=layerDurationMs();
    const finalEnd=Math.max(duration,...starts.map(v=>v+duration));
    const extend=!!$('extendToEnd')?.checked;
    return { starts, ends:starts.map(v=>extend?finalEnd:v+duration), total:Math.max(1000,finalEnd) };
  }
  function hexToRgb(hex){ const h=String(hex||'#ffffff').replace('#','').padEnd(6,'f').slice(0,6); return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; }
  function rgbToHex(rgb){ return '#'+rgb.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('').toUpperCase(); }
  function interpolatePalette(colors,t){ if(!colors.length)return $('textColor')?.value||'#ffffff'; if(colors.length===1)return colors[0]; const x=Math.max(0,Math.min(1,t))*(colors.length-1),i=Math.min(colors.length-2,Math.floor(x)),f=x-i,a=hexToRgb(colors[i]),b=hexToRgb(colors[i+1]); return rgbToHex(a.map((v,k)=>v+(b[k]-v)*f)); }
  function activePalette(){ if(Array.isArray(colorRoleState.runtimeColors)&&colorRoleState.runtimeColors.length) return { colors:colorRoleState.runtimeColors }; if(colorRoleState.customPaletteId){ const cp=(window.FlamoCustomPalette?window.FlamoCustomPalette.list():[]).find(p=>p.id===colorRoleState.customPaletteId); if(cp) return { colors:cp.colors }; } return COLOR_PALETTES[colorRoleState.paletteIndex]||COLOR_PALETTES[0]; }
  function roleColor(index,count){ const mode=colorRoleState.mode,colors=activePalette().colors;if(mode==='single')return $('textColor')?.value||'#ffffff';if(mode==='repeat')return colors[Math.floor(index/Math.max(1,colorRoleState.repeatEvery))%colors.length];const t=count<=1?0:index/(count-1);return interpolatePalette(colors,mode==='mirror'?(t<=.5?t*2:(1-t)*2):t); }
  function styleRoles(){ return Array.isArray(currentStyle().roles) ? currentStyle().roles : []; }
  function normalizeHex(value){ const v=String(value||'').trim(); const m=v.match(/^#(?:FF)?([0-9a-f]{6})$/i); return m ? '#'+m[1].toUpperCase() : '#FFFFFF'; }
  function syncStyleRoleState(reset=false){ const roles=styleRoles(); if(reset || styleRoleState.colors.length!==roles.length) styleRoleState.colors=roles.map(r=>normalizeHex(r.default)); }
  function renderStyleRoles(){ const holder=$('styleColorRoles'); if(!holder)return; syncStyleRoleState(); const roles=styleRoles(); holder.innerHTML=roles.map((role,i)=>{ const value=normalizeHex(styleRoleState.colors[i]); return `<div class="flamo3d-color-item"><span class="flamo3d-color-dot" style="--c:${value}"></span><span><b>${esc(role.name||('Role '+(i+1)))}</b><small>${value}</small></span><input type="color" data-style-role-index="${i}" value="${value}" aria-label="${esc(role.name||'Style color')}"></div>`; }).join('') || '<p class="flamo3d-engine-note">Style ini tidak memiliki color role yang aman.</p>'; }
  function styleArgb(hex){ return '#FF'+normalizeHex(hex).slice(1).toUpperCase(); }
  function applyStyleColorsToDocument(doc){ const roles=styleRoles(); syncStyleRoleState(); roles.forEach((role,i)=>{ const replacement=styleArgb(styleRoleState.colors[i]); const oldValues=(role.old||[]).map(v=>String(v).toUpperCase()); Array.from(doc.querySelectorAll('*')).forEach(el=>{ if(el.closest('text')) return; Array.from(el.attributes||[]).forEach(attr=>{ if(oldValues.includes(String(attr.value).toUpperCase())) el.setAttribute(attr.name,replacement); }); }); }); }

  function renderRoleStrip(){ const strip=$('colorRoleStrip');if(!strip)return;const colors=colorRoleState.mode==='single'?[($('textColor')?.value||'#fff')]:activePalette().colors;strip.innerHTML=colors.map(c=>`<i style="background:${c}"></i>`).join(''); }
  function ensurePreviewFont(font, weight){
    if(isCustomFont(font)){ ensureCustomPreviewFont(font); return; }
  }
  function renderPreview(){
    const raw=$('inputText')?.value||'',preview=$('previewText');if(!preview)return;
    const fontValue=String($('fontName')?.value||'Lexend').trim()||'Lexend',weight=isCustomFont(fontValue)?'400':($('fontStyle')?.value||'700');
    const font=fontDisplayName(fontValue).replace(/[\"']/g,'').trim()||'Lexend';
    const family=isCustomFont(fontValue) ? `"${customFontFamily(findCustomFont(fontValue))}", "${font}", Lexend, "Plus Jakarta Sans", Inter, Arial, sans-serif` : `"${font}", Lexend, "Plus Jakarta Sans", Inter, Arial, sans-serif`;
    const count=[...raw].filter(ch=>!/[\n\r ]/.test(ch)).length;let ci=0;
    ensurePreviewFont(fontValue,weight);
    preview.innerHTML=[...raw].map(ch=>ch==='\n'?'<br>':ch===' '?' ':`<span class="flamo2d-preview-char" style="--char-color:${roleColor(ci++,count)}">${esc(ch)}</span>`).join('')||'Text preview';
    const rs=preview.style;
    rs.setProperty('--flamo2d-preview-font',family);
    rs.setProperty('--flamo2d-preview-weight',weight);
    rs.setProperty('--flamo2d-preview-size',`clamp(26px, ${Math.max(2.8,(+($('fontSize')?.value||10))*.42)}vw, 54px)`);
    rs.setProperty('--flamo2d-preview-spacing',Math.max(0,(+($('spacing')?.value||40)-40)/12)+'px');
    rs.setProperty('--flamo2d-preview-line-height',Math.max(.85,(+($('lineHeight')?.value||80))/80).toFixed(2));
    preview.style.fontFamily=family;
    preview.style.fontWeight=weight;
    renderRoleStrip();
  }
  function renderTimeline(){
    const units=getUnits(),plan=timingPlan(units),total=plan.total,ruler=$('timeRuler'),inner=$('timelineInner'),info=$('timelineInfo');if(!ruler||!inner)return;
    const seconds=Math.max(1,Math.ceil(total/1000));ruler.innerHTML=Array.from({length:seconds+1},(_,i)=>{const left=i/seconds*100;return `<span style="left:${left}%"></span><b style="left:${left}%">${i}s</b>`}).join('');
    inner.innerHTML=units.slice(0,80).map((u,i)=>{const start=plan.starts[i],end=plan.ends[i],left=start/total*100,width=Math.max(2,(end-start)/total*100),color=roleColor(i,units.length);return `<div class="flamo3d-tl-row"><span class="flamo3d-tl-label"><i class="flamo2d-layer-swatch" style="--layer-color:${color}" aria-hidden="true"></i><b>${esc(u.ch)}</b></span><span class="flamo3d-tl-track"><i style="left:${left}%;width:${Math.min(100-left,width)}%"></i><em style="left:${left}%"></em></span><span class="flamo3d-tl-time">${start}ms</span></div>`}).join('');if(info)info.textContent=`${units.length} layer`;
  }

  function curveToSvgPoint(p){ return { x: 20 + p.x * 260, y: 130 - p.y * 110 }; }
  function svgPointToCurve(x,y){ return { x: Math.max(0, Math.min(1, (x - 20) / 260)), y: Math.max(0, Math.min(1, (130 - y) / 110)) }; }
  function drawCurve(){
    const svg = $('curveSvg');
    if(!svg) return;
    const p1 = curveToSvgPoint(curveHandles.p1), p2 = curveToSvgPoint(curveHandles.p2);
    svg.innerHTML = '<path class="grid" d="M20 20H280M20 52H280M20 84H280M20 116H280M20 20V130M72 20V130M124 20V130M176 20V130M228 20V130M280 20V130"/>' +
      `<path class="helper" d="M20 130L${p1.x} ${p1.y}M280 20L${p2.x} ${p2.y}"/>` +
      `<path class="curve" d="M20 130 C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, 280 20"/>` +
      '<circle class="endpoint" cx="20" cy="130" r="5"/><circle class="endpoint" cx="280" cy="20" r="5"/>' +
      `<circle class="handle" data-point="p1" cx="${p1.x}" cy="${p1.y}" r="8"/>` +
      `<circle class="handle" data-point="p2" cx="${p2.x}" cy="${p2.y}" r="8"/>`;
  }

  function updateAll(){ syncLabels(); renderPreview(); renderTimeline(); drawCurve(); }
  function updateFileNameAuto(){ if(!$('filename') || $('filename').dataset.touched) return; const first = (($('inputText')?.value || 'flamo-text').split('\n').find(x => x.trim()) || 'flamo-text'); const styleTag = styleFxOn() ? ('#' + (currentStyle().name || 'style')) : ''; $('filename').value = slug(first + '#' + (currentPreset().name || 'preset') + styleTag); }
  function colorArgb(hex){ const h = String(hex || '#ffffff').replace('#',''); return '#FF' + (h.length === 6 ? h : 'FFFFFF').toUpperCase(); }
  function fontFileName(){ const value=$('fontName')?.value || 'Lexend'; if(isCustomFont(value)) return `${fontDisplayName(value)}.ttf`.replace(/\s+/g,''); return `${fontDisplayName(value)}-${FONT_LABEL[$('fontStyle')?.value || '700'] || 'Bold'}.ttf`.replace(/\s+/g,''); }
  const RANDOM_INOUT_OFFSETS = [
    { start:[178.667,112.667], elbowIn:[5,112.667], elbowOut:[0,-120], elbowOutE:'cubicBezier 0.8724189 0.0 0.57743365 0.9631579', exit:[-92.336,-116.333], exitE:'cubicBezier 0.7979351 0.0 0.4461652 1.0' },
    { start:[-124.664,-93.669], elbowIn:[-1.858,-93.669], elbowOut:[-82.333,2], elbowOutE:'cubicBezier 0.7337758 0.0 0.41666666 1.0', exit:[-81.91,104.333], exitE:'cubicBezier 0.6983776 0.0 0.49041298 1.0' },
    { start:[118.938,98.338], elbowIn:[5.332,109.768], elbowOut:[-0.026,-122.296], elbowOutE:'cubicBezier 0.5980826 0.0 0.37241888 1.0', exit:[130.333,-134.667], exitE:'cubicBezier 0.6246313 0.0 0.5317109 1.0' },
    { start:[118.938,-110.329], elbowIn:[-1.291,-96.228], elbowOut:[0.333,96], elbowOutE:'cubicBezier 0.649705 0.0 0.4181416 1.0', exit:[-145.667,101.333], exitE:'cubicBezier 0.7352507 0.0 0.42846608 1.0' },
    { start:[-101.298,85.602], elbowIn:[-1.298,78.106], elbowOut:[0,-118.89], elbowOutE:'cubicBezier 0.64675516 0.0 0.3561947 1.0', exit:[0,-10.223], exitE:'cubicBezier 0.7721239 0.0 0.42256638 1.0' },
    { start:[178.667,112.667], elbowIn:[5,112.667], elbowOut:[-269,1.885], elbowOutE:'cubicBezier 0.8207965 0.0 0.39159292 1.0', exit:[-269,-139.451], exitE:'cubicBezier 0.7116519 0.023684211 0.41961652 1.0' },
    { start:[-124.664,-93.669], elbowIn:[-1.858,-93.669], elbowOut:[0,97.12], elbowOutE:'cubicBezier 0.7632743 0.0 0.46828908 1.0', exit:[135,95.453], exitE:'cubicBezier 0.7912979 0.0 0.59513277 0.95526314' },
    { start:[118.938,98.338], elbowIn:[5.332,109.768], elbowOut:[5.332,-128.333], elbowOutE:'cubicBezier 0.7219764 0.0 0.38569322 1.0', exit:[-161.333,-128.333], exitE:'cubicBezier 0.7632743 0.0 0.45501474 1.0' },
    { start:[118.938,-110.329], elbowIn:[-1.291,-96.228], elbowOut:[9,99], elbowOutE:'cubicBezier 0.6143068 0.05263158 0.41519174 1.0', exit:[307.333,99], exitE:'cubicBezier 0.7794985 0.0 0.41961652 0.9894737' },
    { start:[-101.298,85.602], elbowIn:[-1.298,78.106], elbowOut:[6.021,-128.333], elbowOutE:'cubicBezier 0.6423304 0.0 0.29277286 0.92368424', exit:[161.354,-128.333], exitE:'cubicBezier 0.7912979 0.0 0.47566372 1.0' },
    { start:[138.702,-90.583], elbowIn:[-1.605,-90.158], elbowOut:[-197.025,0], elbowOutE:'cubicBezier 0.66297936 0.0 0.4358407 1.0', exit:[-197.025,-152], exitE:'cubicBezier 0.66150445 0.0 0.5140118 1.0' },
    { start:[104.336,78.106], elbowIn:[-1.298,78.106], elbowOut:[-103.576,0], elbowOutE:'cubicBezier 0.8119469 0.0 0.4019174 1.0', exit:[-103.576,-134.4], exitE:'cubicBezier 0.60103244 0.0 0.49778762 1.0' },
    { start:[-105.601,-81.239], elbowIn:[0.97,-81.239], elbowOut:[0.97,95.453], elbowOutE:'cubicBezier 0.7632743 0.0 0.39749262 1.0', exit:[-146.364,95.453], exitE:'cubicBezier 0.8045723 0.0 0.36651918 1.0' }
  ];
  function randomInLocation(i){
    const o = RANDOM_INOUT_OFFSETS[i % RANDOM_INOUT_OFFSETS.length];
    return [
      { t: 0, off: [o.start[0], o.start[1], 0] },
      { t: .114820, off: [o.elbowIn[0], o.elbowIn[1], 0], e: 'cubicBezier 0.42 0.0 0.15227138 1.0' },
      { t: .235405, off: [0, 0, 0], e: 'cubicBezier 0.67330384 0.015789473 0.32669616 1.0' }
    ];
  }
  function endAnchoredFraction(dur, refDuration, gapMs, minFraction){
    return Math.max(minFraction, 1 - gapMs / dur) * dur / refDuration;
  }
  function randomInOutLocation(i, dur, refDuration){
    const o = RANDOM_INOUT_OFFSETS[i % RANDOM_INOUT_OFFSETS.length];
    const holdT = endAnchoredFraction(dur, refDuration, 540, .40);
    const elbowOutT = endAnchoredFraction(dur, refDuration, 297, .45);
    const exitT = endAnchoredFraction(dur, refDuration, 40, .50);
    return [
      { t: 0, off: [o.start[0], o.start[1], 0] },
      { t: .114820, off: [o.elbowIn[0], o.elbowIn[1], 0], e: 'cubicBezier 0.42 0.0 0.15227138 1.0' },
      { t: .235405, off: [0, 0, 0], e: 'cubicBezier 0.67330384 0.015789473 0.32669616 1.0' },
      { t: holdT, off: [0, 0, 0] },
      { t: elbowOutT, off: [o.elbowOut[0], o.elbowOut[1], 0], e: o.elbowOutE },
      { t: exitT, off: [o.exit[0], o.exit[1], 0], e: o.exitE }
    ];
  }
  function randomInOutOpacity(dur, refDuration){
    const holdT = endAnchoredFraction(dur, refDuration, 297, .45);
    const exitT = endAnchoredFraction(dur, refDuration, 40, .50);
    return [
      { t: 0, v: '0.000000' },
      { t: .06, v: '1.000000' },
      { t: holdT, v: '1.000000' },
      { t: exitT, v: '0.000000' }
    ];
  }
  function textLayer(unit, id, parent, start, end, p, fillColor, index){
    const dur = Math.max(1, end - start), size = (+($('fontSize')?.value || 10)).toFixed(6), refDuration = p.duration || 1999;
    const scaleT = t => (t * refDuration / dur).toFixed(6);
    const kf = (k,val) => `<kf t="${scaleT(k.t)}" v="${val}"${k.e ? ` e="${k.e}"` : ''}/>`;
    const prop = (name,list) => list ? `      <${name}>\n        ${list.map(k => kf(k,k.v)).join('\n        ')}\n      </${name}>\n` : '';
    const loc = p.randomIn ? randomInLocation(index || 0) : p.randomInOut ? randomInOutLocation(index || 0, dur, refDuration) : (p.location || [{t:0,off:[0,0,0]}]);
    const opacityList = p.randomInOut ? randomInOutOpacity(dur, refDuration) : p.opacity;
    let out = `  <text id="${id}" label="${esc(unit.ch)}" parent="${parent}" startTime="${start}" endTime="${end}" fillType="color" size="${size}" font="imported?name=${esc(fontFileName())}" wrapWidth="1200" align="center">\n    <transform>\n      <location>\n        ${loc.map(k => kf(k, `${(unit.x + (k.off?.[0] || 0)).toFixed(6)},${(unit.y + (k.off?.[1] || 0)).toFixed(6)},0.000000`)).join('\n        ')}\n      </location>\n      <pivot value="${p.pivot || '0.000000,0.000000'}"/>\n`;
    if(p.scaleValue) out += `      <scale value="${p.scaleValue}"/>\n`; else out += prop('scale', p.scale);
    out += prop('rotation', p.rotation) + prop('opacity', opacityList) + `    </transform>\n    <fillColor value="${colorArgb(fillColor || $('textColor')?.value)}"/>\n`;
    if(p.blur) out += `    <effect id="com.alightcreative.effects.gaussianblur" locallyApplied="true">\n      <property name="strength" type="float">\n        ${p.blur.map(k => kf(k,k.v)).join('\n        ')}\n      </property>\n    </effect>\n`;
    out += `    <content>${esc(unit.ch)}</content>\n  </text>`;
    return out;
  }
  function wordNullLayer(id, parent, anchorX, anchorY, start, end, wn){
    const dur = Math.max(1, end - start);
    const scaleT = t => (t * (wn.duration || 1999) / dur).toFixed(6);
    const kf = (k,val) => `<kf t="${scaleT(k.t)}" v="${val}"${k.e ? ` e="${k.e}"` : ''}/>`;
    const loc = wn.location || [{t:0,off:[0,0,0]}];
    return `  <nullobj id="${id}" label="Null 1" parent="${parent}" startTime="${start}" endTime="${end}" fillType="none">\n    <transform>\n      <location>\n        ${loc.map(k => kf(k, `${(anchorX + (k.off?.[0] || 0)).toFixed(6)},${(anchorY + (k.off?.[1] || 0)).toFixed(6)},0.000000`)).join('\n        ')}\n      </location>\n    </transform>\n  </nullobj>`;
  }
  function generateFlatXml(){
    const units = getUnits();
    if(!units.length) throw new Error('Text kosong.');
    const plan = timingPlan(units), total = plan.total, parent = 8, p = currentPreset(); let id = 9;
    let layers;
    if(p.wordNull){
      const groups = new Map();
      units.forEach((u,i) => { if(!groups.has(u.word)) groups.set(u.word, []); groups.get(u.word).push(i); });
      layers = [];
      groups.forEach(indices => {
        const nullId = id++;
        const anchorX = units[indices[0]].x, anchorY = units[indices[0]].y;
        const wordStart = Math.min(...indices.map(i => plan.starts[i]));
        layers.push(wordNullLayer(nullId, parent, anchorX, anchorY, wordStart, total, p.wordNull));
        indices.forEach(i => {
          const u = units[i], local = { ch: u.ch, x: u.x - anchorX, y: u.y - anchorY };
          layers.push(textLayer(local, id++, nullId, plan.starts[i], plan.ends[i], p, roleColor(i, units.length), i));
        });
      });
    } else {
      layers = units.map((u,i) => textLayer(u, id++, parent, plan.starts[i], plan.ends[i], p, roleColor(i, units.length), i));
    }
    layers.push(`  <nullobj id="${parent}" label="Null 1" startTime="0" endTime="${total}" fillType="none">\n    <transform>\n      <location value="540.000000,540.000000,0.000000"/>\n    </transform>\n  </nullobj>`);
    return `<?xml version='1.0' encoding='UTF-8' ?>\n<!-- Generated by Flamo 2D Text Animate Clean -->\n<scene title="${esc(slug($('filename')?.value))}" width="1080" height="1080" exportWidth="1920" exportHeight="1080" bgcolor="#FF000000" totalTime="${total}" fps="60" modifiedTime="${Date.now()}" amver="859" ffver="107" am="com.alightcreative.motion/6.2.53" amplatform="ios" precompose="dynamicResolution" retime="freeze">\n  <bookmark t="0"/>\n${layers.join('\n')}\n</scene>\n`;
  }
  function parseXmlFragment(xml){ return new DOMParser().parseFromString(xml,'application/xml'); }
  function styleFxOn(){ return !!$('styleFxSwitch')?.classList.contains('is-on'); }
  function generateXml(){
    const template = styleFxOn() ? (window.STYLE_XMLS||{})[selectedStyle] : null;
    if(!template) return generateFlatXml();
    const units=getUnits(); if(!units.length) throw new Error('Text kosong.');
    const plan=timingPlan(units), preset=currentPreset(), doc=parseXmlFragment(template);
    if(doc.querySelector('parsererror')) throw new Error('Template Style FX rusak.');
    applyStyleColorsToDocument(doc);
    let nextId=1000;
    const scenes=Array.from(doc.querySelectorAll('scene')).filter(sc=>Array.from(sc.children).some(x=>x.tagName==='text'));
    scenes.forEach(sc=>{
      const direct=Array.from(sc.children), samples=direct.filter(x=>x.tagName==='text'); if(!samples.length)return;
      const nullSample=direct.find(x=>x.tagName==='nullobj');
      samples.forEach(x=>x.remove()); if(nullSample)nullSample.remove();
      const nullId=nextId++;
      units.forEach((u,i)=>{
        const el=samples[Math.min(i,samples.length-1)].cloneNode(true); el.setAttribute('id',String(nextId++)); el.setAttribute('parent',String(nullId)); el.setAttribute('label',u.ch); el.setAttribute('startTime',String(plan.starts[i])); el.setAttribute('endTime',String(plan.ends[i])); el.setAttribute('size',String(+($('fontSize')?.value||10))); el.setAttribute('font','imported?name='+fontFileName());
        const content=el.querySelector('content'); if(content) content.textContent=u.ch;
        const temp=parseXmlFragment(textLayer(u,9,8,plan.starts[i],plan.ends[i],preset,roleColor(i,units.length),i));
        const fresh=temp.querySelector('transform'); const oldTr=el.querySelector('transform'); if(fresh&&oldTr) oldTr.replaceWith(doc.importNode(fresh,true));
        let fill=el.querySelector(':scope > fillColor'); if(!fill){fill=doc.createElement('fillColor');el.appendChild(fill);} fill.setAttribute('value',colorArgb(roleColor(i,units.length)));
        sc.appendChild(el);
      });
      const n=nullSample?nullSample.cloneNode(true):doc.createElement('nullobj'); n.setAttribute('id',String(nullId)); n.setAttribute('label','Null 1'); n.setAttribute('startTime','0'); n.setAttribute('endTime',String(plan.total)); n.setAttribute('hidden','true'); n.setAttribute('fillType','none'); if(!n.querySelector('transform')){const tr=doc.createElement('transform'),loc=doc.createElement('location');loc.setAttribute('value','540.000000,540.000000,0.000000');tr.appendChild(loc);n.appendChild(tr);} sc.appendChild(n); sc.setAttribute('totalTime',String(plan.total));
    });
    const root=doc.documentElement; root.setAttribute('totalTime',String(plan.total)); root.setAttribute('title',slug($('filename')?.value||'text-fx')); root.setAttribute('modifiedTime',String(Date.now()));
    return `<?xml version='1.0' encoding='UTF-8' ?>\n<!-- Generated by Flamo 2D Text Animate Clean -->\n`+new XMLSerializer().serializeToString(root);
  }

  function doGenerate(){
    try{
      if($('status')) $('status').textContent = 'Generating XML...';
      generatedXml = generateXml();
      if($('xmlOut')) $('xmlOut').value = generatedXml;
      if($('status')) $('status').textContent = 'XML siap. Tombol utama berubah jadi Download File.';
      post('FLAMO_3D_GENERATED', { filename: filename(), content: generatedXml, createdAt: Date.now(), tool: '2D Text Animate' });
    }catch(err){ post('FLAMO_3D_GENERATE_ERROR', { message: err.message || 'XML gagal dibuat.' }); }
  }
  function setTheme(theme){ const root = document.querySelector('.flamo3d-tool'); const clean = theme === 'dark' ? 'dark' : 'light'; if(root) root.dataset.theme = clean; document.querySelector('.flamo2d-other-menu')?.setAttribute('data-theme', clean); }
  function openHelp(){ $('modalBackdrop')?.classList.add('is-open'); $('helpModal')?.classList.add('is-open'); post('FLAMO_3D_CHILD_PANEL_OPEN'); if(innerWidth <= 760) window.parent?.postMessage({ type: 'FLAMO_3D_HELP_OPEN', helpTitle: '2D Text Animate', helpLabel: 'Tutorial & FAQ 2D Text Animate' }, '*'); }
  function closeHelp(){ $('modalBackdrop')?.classList.remove('is-open'); $('helpModal')?.classList.remove('is-open'); }

  function targetPaletteIndex(){ return paletteTarget==='style' ? styleRoleState.paletteIndex : colorRoleState.paletteIndex; }
  function targetPaletteColors(){ return paletteTarget==='style' ? styleRoleState.colors : activePalette().colors; }
  function renderPaletteGrid(){ const grid=$('paletteGrid');if(!grid)return;grid.innerHTML=COLOR_PALETTES.map((p,i)=>`<button type="button" class="flamo2d-palette-card${i===targetPaletteIndex()&&!targetRoleState().customPaletteId?' is-active':''}" data-palette-index="${i}"><span>${esc(p.name)}</span><span class="flamo2d-palette-swatches">${p.colors.map(c=>`<i style="background:${c}"></i>`).join('')}</span></button>`).join(''); }
  function applyPalette(index){ index=Math.max(0,Math.min(COLOR_PALETTES.length-1,+index||0)); const palette=COLOR_PALETTES[index]; if(paletteTarget==='style'){ styleRoleState.paletteIndex=index; styleRoleState.customPaletteId=null; syncStyleRoleState(); styleRoleState.colors=styleRoles().map((r,i)=>palette.colors[i%palette.colors.length]); renderStyleRoles(); }else{ colorRoleState.paletteIndex=index; colorRoleState.customPaletteId=null; } renderPaletteGrid(); renderCustomPaletteStrip(); updateAll(); markDirty(); post('FLAMO_3D_ACTIVE_ROLE_COLORS',{colors:targetPaletteColors(),target:paletteTarget}); }
  function openPalette(target='character'){ paletteTarget=target; if($('paletteTitle'))$('paletteTitle').textContent=target==='style'?'Style FX Color Palette':'Character Color Palette'; if($('paletteSubtitle'))$('paletteSubtitle').textContent=target==='style'?'Terapkan palette ke Color Roles Style FX.':'Terapkan palette ke warna tiap huruf.'; if(matchMedia('(max-width:760px)').matches){post('FLAMO_3D_PALETTE_OPEN',{palettes:COLOR_PALETTES,activeColors:targetPaletteColors(),target:paletteTarget,title:target==='style'?'Style FX Color Palette':'Character Color Palette',customPalettes:(window.FlamoCustomPalette?window.FlamoCustomPalette.list():[]),customPaletteLimit:(window.FlamoCustomPalette?window.FlamoCustomPalette.limitFor(isMemberUser()):2),activeCustomPaletteId:targetRoleState().customPaletteId});return;}renderPaletteGrid();renderCustomPaletteStrip();toggleCustomPaletteForm(false);$('paletteBackdrop')?.classList.add('is-open');$('paletteModal')?.classList.add('is-open'); }
  function closePalette(){ $('paletteBackdrop')?.classList.remove('is-open');$('paletteModal')?.classList.remove('is-open'); }

  function renderCustomPaletteStrip(){
    const strip=$('customPaletteStrip'); if(!strip) return;
    const member=isMemberUser();
    const list=window.FlamoCustomPalette ? window.FlamoCustomPalette.list() : [];
    const limit=window.FlamoCustomPalette ? window.FlamoCustomPalette.limitFor(member) : (member?15:2);
    const quota=$('customPaletteQuota'); if(quota) quota.textContent=list.length+'/'+limit;
    const activeId=targetRoleState().customPaletteId;
    const cards=list.map(p=>`<div class="flamo2d-custom-palette-card${p.id===activeId?' is-active':''}" data-custom-palette-id="${esc(p.id)}"><button type="button" class="flamo2d-custom-palette-remove" data-remove-custom="${esc(p.id)}" aria-label="Hapus palet">&times;</button><span>${esc(p.name)}</span><span class="flamo2d-palette-swatches">${p.colors.map(c=>`<i style="background:${c}"></i>`).join('')}</span></div>`).join('');
    const addCard=list.length<limit ? `<button type="button" class="flamo2d-custom-palette-add" id="customPaletteAddBtn">+ Import</button>` : `<div class="flamo2d-custom-palette-locked">Penuh (${limit})</div>`;
    strip.innerHTML=cards+addCard;
  }
  function toggleCustomPaletteForm(show){ const form=$('customPaletteForm'); if(!form) return; form.hidden = show===undefined ? !form.hidden : !show; const err=$('customPaletteError'); if(err){ err.hidden=true; err.textContent=''; } if(!form.hidden) $('customPaletteInput')?.focus(); }
  function submitCustomPalette(){
    if(!window.FlamoCustomPalette) return;
    const input=$('customPaletteInput'); const err=$('customPaletteError'); if(!input) return;
    const parsed=window.FlamoCustomPalette.parse(input.value);
    if(!parsed.ok){ if(err){ err.hidden=false; err.textContent=parsed.message; } return; }
    const added=window.FlamoCustomPalette.add('', parsed.colors, isMemberUser());
    if(!added.ok){ if(err){ err.hidden=false; err.textContent=added.message; } return; }
    input.value='';
    toggleCustomPaletteForm(false);
    renderCustomPaletteStrip();
    applyCustomPalette(added.palette.id);
  }
  function applyCustomPalette(id){
    const list=window.FlamoCustomPalette ? window.FlamoCustomPalette.list() : [];
    const cp=list.find(p=>p.id===id); if(!cp) return;
    const roleState=targetRoleState(); roleState.customPaletteId=id;
    if(paletteTarget==='style'){ syncStyleRoleState(); styleRoleState.colors=styleRoles().map((r,i)=>cp.colors[i%cp.colors.length]); renderStyleRoles(); }
    renderPaletteGrid(); renderCustomPaletteStrip(); updateAll(); markDirty();
    post('FLAMO_3D_ACTIVE_ROLE_COLORS',{colors:targetPaletteColors(),target:paletteTarget});
    closePalette();
  }
  function removeCustomPalette(id){ window.FlamoCustomPalette?.remove(id); if(colorRoleState.customPaletteId===id) colorRoleState.customPaletteId=null; if(styleRoleState.customPaletteId===id) styleRoleState.customPaletteId=null; renderCustomPaletteStrip(); }

  window.addEventListener('message', e => { const d = e.data || {}; if(d.type === 'FLAMO_3D_THEME') setTheme(d.theme); if(d.type === 'FLAMO_3D_GENERATE') doGenerate(); if(d.type === 'FLAMO_PRS_STATUS_REQUEST' && d.key) showPresetStatusPanel(d.key); if(d.type === 'FLAMO_3D_CLOSE_MODALS') { closeHelp(); closePalette(); closeFontUpload(); closePresetStatusPanel(); togglePresetMenu(false); closeGraphOtherPortal(); } if(d.type === 'FLAMO_3D_APPLY_PALETTE') applyPalette(d.index); if(d.type === 'FLAMO_3D_APPLY_CUSTOM_PALETTE') applyCustomPalette(d.id); if(d.type === 'FLAMO_VECTOR_CUSTOM_FONTS_UPDATED') loadCustomFonts(d.selectId || $('fontName')?.value).then(() => { renderFontStyleOptions(isCustomFont($('fontName')?.value) ? '' : ($('fontStyle')?.value || '400')); updateAll(); }); });
  function standaloneSet(id, value, checked){
    const el=$(id);
    if(!el) throw new Error('Kontrol engine 2D tidak lengkap: '+id);
    if(typeof checked==='boolean') el.checked=checked;
    else el.value=String(value == null ? '' : value);
  }
  function standaloneGenerate(options){
    const opts=options||{};
    const presets=window.PRESETS||{};
    const requested=String(opts.preset||'fadeBlur');
    const candidate=presets[requested];
    selectedPreset=candidate&&candidate.status==='active'?requested:(Object.keys(presets).find(key=>presets[key]&&presets[key].status==='active')||'fadeBlur');
    const styles=window.STYLE_META||[];
    if(styles.some(item=>item.id===opts.style)) selectedStyle=opts.style;
    colorRoleState={
      mode:['single','repeat','gradient','mirror'].includes(opts.colorMode)?opts.colorMode:'single',
      paletteIndex:Math.max(0,Math.min(COLOR_PALETTES.length-1,Number(opts.paletteIndex)||0)),
      repeatEvery:Math.max(1,Number(opts.repeatEvery)||2),
      customPaletteId:null,
      runtimeColors:Array.isArray(opts.colors)?opts.colors.slice(0,8):null
    };
    styleRoleState={paletteIndex:colorRoleState.paletteIndex,colors:[],customPaletteId:null};
    graphMode=['smooth','fast','slow','random'].includes(opts.graphMode)?opts.graphMode:'smooth';
    curveHandles=structuredCloneSafe(GRAPH_CURVES[graphMode]||GRAPH_CURVES.smooth);
    standaloneSet('inputText',opts.text||'NEXORA CREATIVE');
    standaloneSet('timingTarget',opts.timingTarget==='word'?'word':'char');
    standaloneSet('spacing',Number(opts.spacing)||40);
    standaloneSet('lineHeight',Number(opts.lineHeight)||80);
    standaloneSet('spread',Math.max(0,Number(opts.spread)||700));
    standaloneSet('stagger',Math.max(0,Number(opts.stagger)||70));
    standaloneSet('randomAmount',Math.max(0,Number(opts.randomAmount)||0));
    standaloneSet('seed',Number(opts.seed)||12);
    standaloneSet('layerDuration',Math.max(.2,Number(opts.layerDuration)||2));
    standaloneSet('extendToEnd','',opts.extendToEnd!==false);
    standaloneSet('fontSize',Math.max(8,Number(opts.fontSize)||18));
    standaloneSet('fontName',opts.fontName||'Lexend');
    standaloneSet('fontStyle',opts.fontStyle||'700');
    standaloneSet('textColor',opts.textColor||'#ffffff');
    standaloneSet('filename',opts.filename||'nexora-text-2d');
    const styleSwitch=$('styleFxSwitch');
    if(styleSwitch) styleSwitch.classList.toggle('is-on',opts.styleEnabled===true);
    syncStyleRoleState(true);
    if(Array.isArray(opts.styleColors)) styleRoleState.colors=styleRoleState.colors.map((color,index)=>opts.styleColors[index]||color);
    const xml=generateXml();
    if(!xml||!/<scene\b/.test(xml)) throw new Error('XML 2D Text Animate gagal dibuat.');
    return xml;
  }
  window.Flamo2DTextEngine=Object.freeze({
    ready:true,
    generate:standaloneGenerate,
    presets:Object.keys(window.PRESETS||{}).filter(key=>window.PRESETS[key]&&window.PRESETS[key].status==='active'),
    styles:(window.STYLE_META||[]).map(item=>item.id)
  });

  document.addEventListener('DOMContentLoaded', () => {
    suppressDirty = true;
    bindPresetPanelEvents();
    initPresetCardWrap();
    initSelects();
    bindFontUpload();
    loadCustomFonts();
    initStyleSelect();
    choosePreset(selectedPreset);
    setCurvePreset('smooth');
    updateAll();
    renderPresetMenu(false);
    suppressDirty = false;

    $('presetTrigger')?.addEventListener('click', () => togglePresetMenu());
    $('presetMenu')?.addEventListener('click', e => {
      const b = e.target.closest('[data-preset]');
      if(!b) return;
      togglePresetMenu(false);
      choosePreset(b.dataset.preset);
    });
    $('animPreset')?.addEventListener('change', e => choosePreset(e.target.value));

    $('styleFxSwitch')?.addEventListener('click', () => {
      const btn = $('styleFxSwitch');
      const on = !btn.classList.contains('is-on');
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      if($('styleFxPanel')) $('styleFxPanel').hidden = !on;
      if($('styleFxColorsSection')) $('styleFxColorsSection').hidden = !on;
      updateFileNameAuto();
      updateAll();
      markDirty();
    });
    $('styleTrigger')?.addEventListener('click',()=>toggleStyleMenu());
    $('styleFx')?.addEventListener('change',e=>chooseStyle(e.target.value));
    $('styleMenu')?.addEventListener('click',e=>{const b=e.target.closest('[data-style-fx]');if(b)chooseStyle(b.dataset.styleFx);});
    document.addEventListener('click', e => { if(!e.target.closest('.flamo3d-preset-picker')) togglePresetMenu(false); if(!e.target.closest('.flamo-fx-style-picker')) toggleStyleMenu(false); });

    $('textColor')?.addEventListener('input', () => {
      $('textColorText').value = $('textColor').value;
      updateAll();
      markDirty();
    });
    $('textColorText')?.addEventListener('input', () => {
      if(/^#[0-9a-f]{6}$/i.test($('textColorText').value)) $('textColor').value = $('textColorText').value;
      updateAll();
      markDirty();
    });
    $('filename')?.addEventListener('input', () => { $('filename').dataset.touched = '1'; markDirty(); });
    $('colorRolesOpen')?.addEventListener('click', () => openPalette('character'));
    $('stylePaletteOpen')?.addEventListener('click', () => openPalette('style'));
    $('styleColorRoles')?.addEventListener('input', e => { const input=e.target.closest('[data-style-role-index]'); if(!input)return; syncStyleRoleState(); const i=+input.dataset.styleRoleIndex; styleRoleState.colors[i]=normalizeHex(input.value); const item=input.closest('.flamo3d-color-item'); if(item){ item.querySelector('.flamo3d-color-dot')?.style.setProperty('--c',styleRoleState.colors[i]); const small=item.querySelector('small'); if(small)small.textContent=styleRoleState.colors[i]; } markDirty(); });
    $('paletteClose')?.addEventListener('click', closePalette);
    $('paletteBackdrop')?.addEventListener('click', closePalette);
    $('paletteGrid')?.addEventListener('click', e => { const b=e.target.closest('[data-palette-index]'); if(b) applyPalette(b.dataset.paletteIndex); });
    $('customPaletteStrip')?.addEventListener('click', e => {
      const rm=e.target.closest('[data-remove-custom]'); if(rm){ e.stopPropagation(); removeCustomPalette(rm.dataset.removeCustom); return; }
      const addBtn=e.target.closest('#customPaletteAddBtn'); if(addBtn){ toggleCustomPaletteForm(true); return; }
      const card=e.target.closest('[data-custom-palette-id]'); if(card) applyCustomPalette(card.dataset.customPaletteId);
    });
    $('customPaletteSubmit')?.addEventListener('click', submitCustomPalette);
    $('customPaletteInput')?.addEventListener('keydown', e => { if(e.key==='Enter'){ e.preventDefault(); submitCustomPalette(); } });
    $('customPaletteCancel')?.addEventListener('click', () => toggleCustomPaletteForm(false));
    function syncColorRoleControls(){
      const repeatField=$('repeatEveryField'),single=colorRoleState.mode==='single';
      if(repeatField) repeatField.hidden=colorRoleState.mode!=='repeat';
      if($('colorRolesOpen')) $('colorRolesOpen').classList.toggle('is-muted',single);
    }
    $('colorRoleMode')?.addEventListener('change', () => { colorRoleState.mode=$('colorRoleMode').value; syncColorRoleControls(); updateAll(); markDirty(); });
    $('repeatEvery')?.addEventListener('input', () => { colorRoleState.repeatEvery=Math.max(1,+$('repeatEvery').value||1); updateAll(); markDirty(); });


    const rangeSuffix = { fontSize:'px', spacing:'', lineHeight:'', spread:'ms', stagger:'ms', randomAmount:'%', seed:'', layerDuration:'s' };
    const controlIds = ['inputText','timingTarget','fontName','fontStyle','fontSize','lineHeight','spacing','spread','stagger','randomAmount','seed','layerDuration','extendToEnd'];
    function syncControl(id){
      if(id === 'inputText') updateFileNameAuto();
      if(id === 'fontName') renderFontStyleOptions(isCustomFont($('fontName')?.value) ? '' : ($('fontStyle')?.value || '400'));
      if(rangeSuffix[id] !== undefined) syncRange(id, rangeSuffix[id]);
      updateAll();
      markDirty();
    }
    controlIds.forEach(id => {
      const el = $(id);
      if(!el) return;
      const fn = () => syncControl(id);
      el.addEventListener('input', fn);
      el.addEventListener('change', fn);
    });
    Object.keys(rangeSuffix).forEach(id => syncRange(id, rangeSuffix[id]));
    syncColorRoleControls();

    const otherWrap = document.querySelector('.flamo3d-graph-other');
    const otherToggle = document.querySelector('[data-graph-other-toggle]');
    const toolRoot = document.querySelector('.flamo3d-tool');
    const presetPanel = document.querySelector('.flamo3d-graph-preset-panel');
    const otherMenu = document.createElement('div');
    otherMenu.className = 'flamo2d-other-menu';
    otherMenu.setAttribute('data-theme', toolRoot?.dataset.theme || 'light');
    otherMenu.innerHTML = ['smooth','linear','custom'].map(key => `<button type="button" data-graph-choice="${key}">${key.charAt(0).toUpperCase()+key.slice(1)}</button>`).join('');
    document.body.appendChild(otherMenu);

    function graphPresetIsMobile(){
      if(!presetPanel || !toolRoot) return window.matchMedia('(max-width:760px)').matches;
      const cols = getComputedStyle(presetPanel).gridTemplateColumns.split(' ').filter(Boolean).length;
      return cols > 1 || toolRoot.getBoundingClientRect().width <= 760;
    }
    function positionGraphOtherMenu(){
      if(!otherToggle || !otherMenu.classList.contains('is-open')) return;
      const r = otherToggle.getBoundingClientRect();
      const isMobile = graphPresetIsMobile();
      const width = Math.max(118, Math.min(Math.round(r.width), 146));
      const leftBase = r.left + (r.width - width) / 2;
      otherMenu.style.width = `${width}px`;
      otherMenu.style.left = `${Math.round(Math.max(8, Math.min(leftBase, window.innerWidth - width - 8)))}px`;
      otherMenu.style.visibility = 'hidden';
      otherMenu.style.pointerEvents = 'none';
      const h = otherMenu.offsetHeight || 135;
      otherMenu.style.visibility = '';
      otherMenu.style.pointerEvents = '';
      if(isMobile){
        otherMenu.style.top = `${Math.max(8, Math.round(r.top - h - 8))}px`;
        otherMenu.style.transformOrigin = 'bottom center';
      }else{
        otherMenu.style.top = `${Math.round(r.bottom + 8)}px`;
        otherMenu.style.transformOrigin = 'top center';
      }
    }
    function closeGraphOther(){
      otherWrap?.classList.remove('is-open');
      otherMenu.classList.remove('is-open');
      otherToggle?.setAttribute('aria-expanded','false');
    }
    closeGraphOtherPortal = closeGraphOther;
    function bindGraphChoiceButtons(){
      $$('[data-graph-choice]').forEach(b => {
        if(b.dataset.boundGraphChoice === '1') return;
        b.dataset.boundGraphChoice = '1';
        b.addEventListener('click', () => {
          setCurvePreset(b.dataset.graphChoice);
          closeGraphOther();
        });
      });
    }
    bindGraphChoiceButtons();
    otherToggle?.addEventListener('click', e => {
      e.stopPropagation();
      const open = !otherMenu.classList.contains('is-open');
      otherWrap?.classList.toggle('is-open', open);
      otherMenu.classList.toggle('is-open', open);
      otherToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if(open) requestAnimationFrame(positionGraphOtherMenu);
    });
    document.addEventListener('click', e => {
      if(!e.target.closest('.flamo3d-graph-other') && !e.target.closest('.flamo2d-other-menu')) closeGraphOther();
    });
    window.addEventListener('resize', positionGraphOtherMenu);
    window.addEventListener('scroll', positionGraphOtherMenu, true);

    let dragging = null;
    function pointFromEvent(event){ const rect = $('curveSvg').getBoundingClientRect(); const x = ((event.clientX - rect.left) / rect.width) * 300; const y = ((event.clientY - rect.top) / rect.height) * 150; return svgPointToCurve(Math.max(20, Math.min(280, x)), Math.max(20, Math.min(130, y))); }
    $('curveSvg')?.addEventListener('pointerdown', event => { const h = event.target.closest('.handle'); if(!h) return; dragging = h.dataset.point; $('curveSvg').setPointerCapture(event.pointerId); });
    $('curveSvg')?.addEventListener('pointermove', event => { if(!dragging) return; const p = pointFromEvent(event); curveHandles[dragging] = p; graphMode = 'custom'; $$('[data-graph-choice]').forEach(b => b.classList.toggle('is-active', b.dataset.graphChoice === 'custom')); drawCurve(); renderTimeline(); markDirty(); });
    $('curveSvg')?.addEventListener('pointerup', () => { dragging = null; });
    $('curveSvg')?.addEventListener('pointercancel', () => { dragging = null; });

    $('helpOpen')?.addEventListener('click', openHelp);
    $('modalClose')?.addEventListener('click', closeHelp);
    $('modalBackdrop')?.addEventListener('click', closeHelp);
    $$('[data-tab]').forEach(b => b.addEventListener('click', () => { $$('[data-tab]').forEach(x => x.classList.remove('is-active')); $$('[data-panel]').forEach(x => x.classList.remove('is-active')); b.classList.add('is-active'); document.querySelector(`[data-panel="${b.dataset.tab}"]`)?.classList.add('is-active'); }));
    $$('.flamo3d-faq button').forEach(b => b.addEventListener('click', () => b.parentElement.classList.toggle('is-open')));
    renderPaletteGrid(); renderRoleStrip();
    post('FLAMO_3D_ACTIVE_ROLE_COLORS', { colors: activePalette().colors });
  });
})();
