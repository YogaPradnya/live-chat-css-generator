const $ = (id) => document.getElementById(id);
const baseFields = ['youtubeUrl','fontFamily','showAvatar','ownerColor','moderatorColor','memberColor','userColor','messageColor','messageBg','nameBg','borderColor','nameSize','messageSize','radius','opacity','bubbleBgImage','bubbleBgSize','bubbleBgPosition','bubbleBgOpacity'];
const samples = [
  {author:'Owner',role:'owner',text:'Halo semuanya, chat overlay sudah realtime ✨'},
  {author:'Moderator',role:'moderator',text:'Moderator warnanya bisa dicustom.'},
  {author:'Member',role:'member',text:'Membership juga beda warna '},
  {author:'User',role:'user',text:'Tinggal copy link ini ke OBS Browser Source.'}
];
let decorCount = 1;
let currentUser = null;

const DEFAULT_CONFIG = {
  youtubeUrl: '', fontFamily: 'Imprima', showAvatar: '0',
  ownerColor: '#ffd600', moderatorColor: '#5eead4', memberColor: '#a78bfa', userColor: '#ffffff',
  messageColor: '#071952', messageBg: '#ffffff', nameBg: '#80b3ff', borderColor: '#525ceb',
  nameSize: '20', messageSize: '24', radius: '19', opacity: '90',
  bubbleBgImage: '', bubbleBgSize: 'cover', bubbleBgPosition: 'center', bubbleBgOpacity: '100'
};
function clearDecorations() {
  const list = $('bubbleDecorList');
  [...list.querySelectorAll('.decor-item')].slice(1).forEach(el => el.remove());
  const first = list.querySelector('.decor-item');
  if (first) {
    first.querySelector('[data-field="image"]').value = '';
    first.querySelector('[data-field="upload"]').value = '';
    first.querySelector('[data-field="show"]').value = '0';
    first.querySelector('[data-field="position"]').value = 'inside-bottom-left';
    first.querySelector('[data-field="size"]').value = '46';
    first.querySelector('[data-field="opacity"]').value = '100';
  }
  decorCount = 1;
}
function resetGeneratorForNewUser() {
  Object.entries(DEFAULT_CONFIG).forEach(([id, value]) => { if ($(id)) $(id).value = value; });
  $('bubbleBgUpload').value = '';
  clearDecorations();
  renderPreview();
  updateGeneratedUrl();
}

function videoIdFromUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^[\w-]{11}$/.test(raw)) return raw;
  const directMatch = raw.match(/[?&]v=([\w-]{11})/) || raw.match(/(?:youtu\.be\/|live\/|embed\/|shorts\/)([\w-]{11})/);
  if (directMatch) return directMatch[1];
  const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(normalized);
    const byQuery = url.searchParams.get('v') || url.searchParams.get('video_id');
    if (byQuery) return byQuery;
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.hostname.includes('youtu.be')) return parts[0] || '';
    if (parts[0] === 'live' && parts[1]) return parts[1];
    return parts.pop() || '';
  } catch {
    return '';
  }
}

function cfg() { return Object.fromEntries(baseFields.map(id => [id, $(id).value])); }
function updateUserUi() {
  const status = $('userStatus');
  if (status) status.textContent = currentUser?.username ? `Login sebagai @${currentUser.username}` : 'Login diperlukan';
  document.body.classList.toggle('logged-in', Boolean(currentUser?.id));
}
function setLoginMessage(text = '', isError = false) {
  $('loginConfirm').textContent = text;
  $('loginConfirm').classList.toggle('error', isError);
}
function openLoginModal() {
  $('loginModal').classList.add('show');
  $('loginConfirmBtn').style.display = 'none';
  $('loginUsername').focus();
}
function closeLoginModal() {
  $('loginModal').classList.remove('show');
}
async function submitLogin(create = false) {
  const cleanUsername = $('loginUsername').value.trim();
  if (!cleanUsername) return setLoginMessage('Username wajib diisi.', true);
  $('loginSubmitBtn').textContent = create ? 'Membuat...' : 'Checking...';
  try {
    const res = await fetch('/api/users/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: cleanUsername, create }) });
    const user = await res.json();
    if (!res.ok && user.needConfirm) {
      setLoginMessage(`Username @${user.username} belum ada. Login sebagai @${user.username} baru?`, false);
      $('loginConfirmBtn').style.display = 'block';
      $('loginConfirmBtn').dataset.username = user.username;
      return;
    }
    if (!res.ok) throw new Error(user.error || 'Login gagal.');
    currentUser = { id: user.id, username: user.username, displayName: user.displayName };
    setLoginMessage(user.created ? `User @${user.username} dibuat.` : `Login sebagai @${user.username}.`, false);
    if (user.created) resetGeneratorForNewUser();
    updateUserUi();
    await refreshPresetList();
    closeLoginModal();
  } catch (error) {
    setLoginMessage(error.message || 'Login gagal.', true);
  } finally {
    $('loginSubmitBtn').textContent = 'Login';
  }
}
async function loginUser() { openLoginModal(); }
function setPresetSelectMessage(message) {
  const select = $('presetSelect');
  select.innerHTML = `<option value="">${message}</option>`;
}
async function refreshPresetList() {
  if (!currentUser?.id) {
    setPresetSelectMessage('Login dulu untuk melihat preset');
    return;
  }
  const select = $('presetSelect');
  select.innerHTML = '<option value="">Loading preset...</option>';
  try {
    const res = await fetch(`/api/users/${encodeURIComponent(currentUser.id)}/presets`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal mengambil preset.');
    const presets = data.presets || [];
    if (!presets.length) {
      setPresetSelectMessage('Belum ada preset tersimpan');
      return;
    }
    select.innerHTML = '<option value="">Pilih ID preset...</option>' + presets.map((preset) => {
      const label = `${preset.id} — ${preset.name || 'Overlay Preset'}`;
      return `<option value="${preset.id}">${label}</option>`;
    }).join('');
  } catch (error) {
    setPresetSelectMessage(error.message || 'Gagal mengambil preset');
  }
}
function applyPresetConfig(config = {}) {
  Object.entries(DEFAULT_CONFIG).forEach(([id, fallback]) => {
    if ($(id)) $(id).value = config[id] ?? fallback;
  });
  if ($('youtubeUrl')) $('youtubeUrl').value = config.youtubeUrl || config.videoId || '';
  $('bubbleBgUpload').value = '';
  clearDecorations();
  const decorations = Array.isArray(config.bubbleDecorations) ? config.bubbleDecorations : [];
  const first = document.querySelector('.decor-item');
  decorations.forEach((decor, index) => {
    let item = index === 0 ? first : null;
    if (!item) {
      decorCount += 1;
      $('bubbleDecorList').insertAdjacentHTML('beforeend', decorationTemplate(decorCount));
      item = $('bubbleDecorList').lastElementChild;
      bindDynamicControls(item);
    }
    item.querySelector('[data-field="image"]').value = decor.image || '';
    item.querySelector('[data-field="show"]').value = decor.show || '1';
    item.querySelector('[data-field="position"]').value = decor.position || 'inside-bottom-left';
    item.querySelector('[data-field="size"]').value = decor.size || '46';
    item.querySelector('[data-field="opacity"]').value = decor.opacity || '100';
  });
  renderPreview();
  updateGeneratedUrl();
}
async function loadSelectedPreset() {
  const presetId = $('presetSelect').value;
  if (!presetId) return alert('Pilih ID preset dulu.');
  $('loadPresetBtn').textContent = 'Loading...';
  try {
    const res = await fetch(`/api/presets/${encodeURIComponent(presetId)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Preset gagal dimuat.');
    applyPresetConfig(data.config || {});
    const url = `${location.origin}/overlay.html?preset=${encodeURIComponent(data.id)}`;
    $('resultUrl').value = url;
    $('openBtn').href = url;
    $('loadPresetBtn').textContent = 'Loaded!';
    setTimeout(() => $('loadPresetBtn').textContent = 'Load Preset', 1200);
  } catch (error) {
    alert(error.message || 'Preset gagal dimuat.');
    $('loadPresetBtn').textContent = 'Load Preset';
  }
}
function hexA(hex, op) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${Number(op) / 100})`; }
function getDecorations() {
  return [...document.querySelectorAll('.decor-item')].map((item) => {
    const q = (name) => item.querySelector(`[data-field="${name}"]`)?.value || '';
    return { image: q('image'), show: q('show'), position: q('position'), size: q('size'), opacity: q('opacity') };
  }).filter(d => d.image);
}
function fullConfig() {
  const c = cfg();
  c.videoId = videoIdFromUrl(c.youtubeUrl);
  c.bubbleDecorations = getDecorations();
  return c;
}
function bubbleImgHtml(d) {
  if (!d.image) return '';
  return `<img class="bubble-img bubble-img-${d.position}" src="${d.image}" alt="bubble image" style="width:${d.size}px;height:${d.size}px;opacity:${Number(d.opacity) / 100}">`;
}
async function uploadImage(fileInput, targetInput) {
  const input = typeof fileInput === 'string' ? $(fileInput) : fileInput;
  const target = typeof targetInput === 'string' ? $(targetInput) : targetInput;
  const file = input.files && input.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { alert('File harus berupa gambar.'); input.value = ''; return; }
  if (file.size > 5 * 1024 * 1024) { alert('Ukuran gambar maksimal 5MB.'); input.value = ''; return; }
  const formData = new FormData();
  formData.append('image', file);
  const oldLabel = input.parentElement.firstChild.textContent;
  input.parentElement.firstChild.textContent = 'Uploading... ';
  try {
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload gagal.');
    target.value = data.url;
    renderPreview();
    updateGeneratedUrl();
  } catch (error) {
    alert(error.message || 'Upload gagal.');
  } finally {
    input.parentElement.firstChild.textContent = oldLabel;
  }
}
function buildOverlayUrl() {
  const c = fullConfig();
  const videoId = c.videoId;
  if (!videoId || !/^[\w-]{11}$/.test(videoId)) return '';
  const p = new URLSearchParams();
  p.set('videoId', videoId);
  Object.entries(c).forEach(([k, v]) => {
    if (['youtubeUrl','videoId','bubbleDecorations'].includes(k)) return;
    if (v) p.set(k, v);
  });
  const decorations = c.bubbleDecorations.filter(d => d.show === '1' && d.image);
  if (decorations.length) p.set('bubbleDecorations', JSON.stringify(decorations));
  return `${location.origin}/overlay.html?${p.toString()}`;
}
function updateGeneratedUrl() {
  const url = buildOverlayUrl();
  $('resultUrl').value = url;
  $('openBtn').href = url || '#';
  return url;
}
function applyMessageBackground(el, c) {
  const bgOpacity = Number(c.bubbleBgOpacity ?? 100) / 100;
  el.style.backgroundColor = hexA(c.messageBg, c.opacity);
  el.style.setProperty('--bubble-bg-image', c.bubbleBgImage ? `url("${c.bubbleBgImage}")` : 'none');
  el.style.setProperty('--bubble-bg-opacity', bgOpacity);
  el.style.setProperty('--bubble-bg-size', c.bubbleBgSize || 'cover');
  el.style.setProperty('--bubble-bg-position', c.bubbleBgPosition || 'center');
  el.classList.toggle('has-bg-image', Boolean(c.bubbleBgImage));
}
function renderPreview() {
  const c = cfg();
  const decorations = getDecorations();
  const box = $('chatPreview');
  box.style.fontFamily = c.fontFamily;
  box.innerHTML = samples.map(s => {
    const imgs = decorations.map(bubbleImgHtml).join('');
    const padClass = decorations.some(d => d.position === 'inside-bottom-left') ? ' pad-left' : decorations.some(d => d.position === 'inside-bottom-right') ? ' pad-right' : '';
    const msg = `<span class="msg${padClass}" style="position:relative;display:block;min-height:${decorations.some(d => d.position.includes('inside')) ? '72px' : 'auto'};font-size:${c.messageSize}px;color:${c.messageColor};border-color:${c.borderColor};border-radius:${c.radius}px">${imgs}<span style="position:relative;z-index:2">${s.text}</span></span>`;
    return `<div class="sample ${c.showAvatar === '0' ? 'no-avatar' : ''}">${c.showAvatar === '1' ? '<img src="https://api.dicebear.com/8.x/adventurer/svg?seed=' + encodeURIComponent(s.author) + '" alt="avatar">' : ''}<div class="bubble"><span class="name" style="font-size:${c.nameSize}px;background:${c.nameBg};color:${c[s.role + 'Color'] || c.userColor}">${s.author}</span><div class="bubble-row">${msg}</div></div></div>`;
  }).join('');
  box.querySelectorAll('.msg').forEach(el => applyMessageBackground(el, c));
}
function generate() {
  const url = updateGeneratedUrl();
  if (!url) alert('Video ID belum valid. Coba paste link YouTube live/watch/live_chat yang benar.');
}
function decorationTemplate(index) {
  return `<div class="decor-item" data-index="${index}"><button class="remove-decor" type="button">×</button><label>URL Gambar Bubble ${index}<input data-field="image" type="url" placeholder="https://.../stiker.png"></label><label>Upload Gambar Bubble ${index} dari Device<input data-field="upload" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"></label><div class="grid two"><label>Tampilkan Gambar Bubble<select data-field="show"><option value="1">Ya</option><option value="0">Tidak</option></select></label><label>Posisi Gambar Bubble<select data-field="position"><option value="inside-bottom-left">Kiri Bawah di Dalam Pesan</option><option value="inside-bottom-right">Kanan Bawah di Dalam Pesan</option><option value="left">Kiri Pesan</option><option value="right">Kanan Pesan</option><option value="top-right">Pojok Kanan Atas</option><option value="bottom-right">Pojok Kanan Bawah</option><option value="bottom-left">Pojok Kiri Bawah</option><option value="top-left">Pojok Kiri Atas</option></select></label><label>Ukuran Gambar Bubble <input data-field="size" type="range" min="20" max="160" value="46"></label><label>Opacity Gambar Bubble <input data-field="opacity" type="range" min="20" max="100" value="100"></label></div></div>`;
}
function normalizeFirstDecor() {
  const first = document.querySelector('.decor-item');
  first.querySelector('#bubbleImage').dataset.field = 'image';
  first.querySelector('#bubbleUpload').dataset.field = 'upload';
  first.querySelector('#showBubbleImage').dataset.field = 'show';
  first.querySelector('#bubbleImagePosition').dataset.field = 'position';
  first.querySelector('#bubbleImageSize').dataset.field = 'size';
  first.querySelector('#bubbleImageOpacity').dataset.field = 'opacity';
}
function bindDynamicControls(root = document) {
  root.querySelectorAll('input,select').forEach(el => {
    if (el.dataset.bound) return;
    el.dataset.bound = '1';
    el.addEventListener('input', () => { renderPreview(); updateGeneratedUrl(); });
    if (el.type === 'file') {
      el.addEventListener('change', () => uploadImage(el, el.closest('.decor-item')?.querySelector('[data-field="image"]') || $('bubbleBgImage')));
    }
  });
  root.querySelectorAll('.remove-decor').forEach(btn => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => { btn.closest('.decor-item').remove(); renderPreview(); updateGeneratedUrl(); });
  });
}

normalizeFirstDecor();
$('addBubbleDecorBtn').addEventListener('click', () => {
  decorCount += 1;
  $('bubbleDecorList').insertAdjacentHTML('beforeend', decorationTemplate(decorCount));
  bindDynamicControls($('bubbleDecorList').lastElementChild);
  renderPreview();
  updateGeneratedUrl();
});
$('bubbleBgUpload').addEventListener('change', () => uploadImage('bubbleBgUpload', 'bubbleBgImage'));
baseFields.forEach(id => $(id).addEventListener('input', () => { renderPreview(); updateGeneratedUrl(); }));
bindDynamicControls();
$('generatorForm').addEventListener('submit', e => { e.preventDefault(); generate(); });
$('copyBtn').addEventListener('click', async () => { const url = updateGeneratedUrl(); if (url) await navigator.clipboard.writeText(url); $('copyBtn').textContent = 'Copied!'; setTimeout(() => $('copyBtn').textContent = 'Copy', 1200); });
$('savePresetBtn').addEventListener('click', async () => {
  const config = fullConfig();
  if (!config.videoId || !/^[\w-]{11}$/.test(config.videoId)) return alert('Video ID belum valid.');
  $('savePresetBtn').textContent = 'Saving...';
  try {
    if (!currentUser?.id) await loginUser();
    if (!currentUser?.id) return alert('Login dulu untuk mendapatkan User ID.');
    const res = await fetch('/api/presets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: currentUser.id, name: `Overlay ${config.videoId}`, config }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal menyimpan preset.');
    const url = `${location.origin}${data.url}`;
    $('resultUrl').value = url;
    $('openBtn').href = url;
    await navigator.clipboard.writeText(url).catch(() => {});
    $('savePresetBtn').textContent = 'Saved!';
    setTimeout(() => $('savePresetBtn').textContent = 'Save Preset', 1400);
  } catch (error) {
    alert(error.message || 'Gagal menyimpan preset.');
    $('savePresetBtn').textContent = 'Save Preset';
  }
});
$('resultUrl').addEventListener('click', () => $('resultUrl').select());
$('loginSubmitBtn').addEventListener('click', () => submitLogin(false));
$('loginConfirmBtn').addEventListener('click', () => submitLogin(true));
$('refreshPresetBtn').addEventListener('click', refreshPresetList);
$('loadPresetBtn').addEventListener('click', loadSelectedPreset);
$('presetSelect').addEventListener('change', () => { if ($('presetSelect').value) loadSelectedPreset(); });
$('loginUsername').addEventListener('input', () => { $('loginConfirmBtn').style.display = 'none'; setLoginMessage(''); });
$('loginUsername').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitLogin(false); });
document.addEventListener('keydown', (e) => { if (e.ctrlKey && e.key.toLowerCase() === 'l') { e.preventDefault(); loginUser(); } });
updateUserUi();
renderPreview();
updateGeneratedUrl();
setTimeout(loginUser, 250);
