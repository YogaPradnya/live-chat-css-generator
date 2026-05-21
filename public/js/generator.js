const $ = (id) => document.getElementById(id);
const baseFields = ['youtubeUrl','fontFamily','showAvatar','avatarSide','avatarOffset','ownerColor','moderatorColor','memberColor','userColor','messageColor','messageBg','nameBg','borderColor','nameSize','messageSize','radius','opacity','bubbleMaxWidth','chatWidth','chatHeight','bubbleBgImage','bubbleBgSize','bubbleBgPosition','bubbleBgOpacity'];
const samples = [
  {author:'Owner',role:'owner',text:'Halo semuanya, chat overlay sudah realtime!'},
  {author:'Moderator',role:'moderator',text:'Moderator warnanya bisa dicustom.'},
  {author:'Member',role:'member',text:'Membership juga beda warna.'},
  {author:'User',role:'user',text:'Tinggal copy link ini ke OBS Browser Source.'}
];
let decorCount = 1;
let currentPresetId = null; // ID preset yang sedang aktif/ter-load

const DEFAULT_CONFIG = {
  youtubeUrl: '', fontFamily: 'Imprima', showAvatar: '0', avatarSide: 'left', avatarOffset: '0',
  ownerColor: '#ffd600', moderatorColor: '#5eead4', memberColor: '#a78bfa', userColor: '#ffffff',
  messageColor: '#071952', messageBg: '#ffffff', nameBg: '#80b3ff', borderColor: '#525ceb',
  nameSize: '20', messageSize: '24', radius: '19', opacity: '90',
  bubbleMaxWidth: '760', chatWidth: '78', chatHeight: '100',
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

function resetGenerator() {
  Object.entries(DEFAULT_CONFIG).forEach(([id, value]) => { if ($(id)) $(id).value = value; });
  $('bubbleBgUpload').value = '';
  clearDecorations();
  currentPresetId = null;
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

// ─── Preset Name Modal ─────────────────────────────────────────────────────────
let _presetModalResolve = null;

function openPresetNameModal(defaultName = '') {
  return new Promise(resolve => {
    _presetModalResolve = resolve;
    $('presetNameInput').value = defaultName;
    $('presetNameError').textContent = '';
    $('presetNameModal').classList.add('show');
    $('presetNameInput').focus();
    $('presetNameSaveBtn').textContent = 'Simpan';
  });
}

function closePresetNameModal(result = null) {
  $('presetNameModal').classList.remove('show');
  if (_presetModalResolve) { _presetModalResolve(result); _presetModalResolve = null; }
}

$('presetNameCancelBtn').addEventListener('click', () => closePresetNameModal(null));
$('presetNameModal').addEventListener('click', (e) => { if (e.target === $('presetNameModal')) closePresetNameModal(null); });
$('presetNameSaveBtn').addEventListener('click', () => {
  const name = $('presetNameInput').value.trim();
  if (!name) { $('presetNameError').textContent = 'Nama preset wajib diisi.'; return; }
  closePresetNameModal(name);
});
$('presetNameInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { $('presetNameSaveBtn').click(); }
  if (e.key === 'Escape') closePresetNameModal(null);
});

// --- Delete Confirm Modal ---
let _deleteConfirmResolve = null;

function openDeleteConfirmModal(presetName) {
  return new Promise(resolve => {
    _deleteConfirmResolve = resolve;
    $('deleteConfirmText').textContent = `Apakah kamu yakin ingin menghapus preset "${presetName}"? Tindakan ini tidak bisa dibatalkan.`;
    $('deleteConfirmModal').classList.add('show');
  });
}

function closeDeleteConfirmModal(result = false) {
  $('deleteConfirmModal').classList.remove('show');
  if (_deleteConfirmResolve) { _deleteConfirmResolve(result); _deleteConfirmResolve = null; }
}

$('deleteCancelBtn').addEventListener('click', () => closeDeleteConfirmModal(false));
$('deleteConfirmModal').addEventListener('click', (e) => { if (e.target === $('deleteConfirmModal')) closeDeleteConfirmModal(false); });
$('deleteConfirmBtn').addEventListener('click', () => closeDeleteConfirmModal(true));

// ─── Preset List ───────────────────────────────────────────────────────────────
function setPresetSelectMessage(message) {
  $('presetSelect').innerHTML = `<option value="">${message}</option>`;
}

async function refreshPresetList() {
  $('presetSelect').innerHTML = '<option value="">Loading...</option>';
  try {
    const res = await fetch('/api/presets');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal mengambil preset.');
    const presets = data.presets || [];
    if (!presets.length) { setPresetSelectMessage('Belum ada preset tersimpan'); return; }
    $('presetSelect').innerHTML = '<option value="">— Pilih preset —</option>' + presets.map(p =>
      `<option value="${p.id}">${p.name || p.id}</option>`
    ).join('');
    // Jika ada preset aktif, pilih ulang di dropdown
    if (currentPresetId) {
      $('presetSelect').value = currentPresetId;
    }
  } catch (error) {
    setPresetSelectMessage(error.message || 'Gagal mengambil preset');
  }
}

// ─── Apply Config ──────────────────────────────────────────────────────────────
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

// ─── Load Preset ───────────────────────────────────────────────────────────────
async function loadSelectedPreset() {
  const presetId = $('presetSelect').value;
  if (!presetId) return;
  $('loadPresetBtn').textContent = 'Loading...';
  try {
    const res = await fetch(`/api/presets/${encodeURIComponent(presetId)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Preset gagal dimuat.');
    applyPresetConfig(data.config || {});
    currentPresetId = data.id;
    const url = `${location.origin}/overlay.html?preset=${encodeURIComponent(data.id)}`;
    $('resultUrl').value = url;
    $('openBtn').href = url;
    $('loadPresetBtn').textContent = 'Loaded!';
    setTimeout(() => $('loadPresetBtn').textContent = 'Load', 1200);
  } catch (error) {
    alert(error.message || 'Preset gagal dimuat.');
    $('loadPresetBtn').textContent = 'Load';
  }
}

// ─── Save Preset (baru) ────────────────────────────────────────────────────────
async function saveNewPreset() {
  const config = fullConfig();
  if (!config.videoId || !/^[\w-]{11}$/.test(config.videoId)) {
    return alert('Video ID belum valid. Paste link YouTube live/watch yang benar.');
  }

  // Tentukan nama default dari preset yang sedang aktif atau dari videoId
  const currentName = currentPresetId
    ? ($('presetSelect').selectedOptions[0]?.text || `Overlay ${config.videoId}`)
    : `Overlay ${config.videoId}`;

  const name = await openPresetNameModal(currentName);
  if (!name) return; // dibatal

  $('savePresetBtn').textContent = 'Saving...';
  try {
    const res = await fetch('/api/presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'public', name, config })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal menyimpan preset.');
    currentPresetId = data.id;
    const url = `${location.origin}${data.url}`;
    $('resultUrl').value = url;
    $('openBtn').href = url;
    await navigator.clipboard.writeText(url).catch(() => {});
    await refreshPresetList();
    $('presetSelect').value = data.id;
    $('savePresetBtn').textContent = 'Saved!';
    setTimeout(() => $('savePresetBtn').textContent = 'Save Preset', 1500);
  } catch (error) {
    alert(error.message || 'Gagal menyimpan preset.');
    $('savePresetBtn').textContent = 'Save Preset';
  }
}

// ─── Update Preset (yang sudah ada) ───────────────────────────────────────────
async function updateSelectedPreset() {
  const presetId = $('presetSelect').value;
  if (!presetId) return alert('Pilih preset yang ingin diupdate.');
  const config = fullConfig();
  if (!config.videoId || !/^[\w-]{11}$/.test(config.videoId)) {
    return alert('Video ID belum valid.');
  }

  const currentName = $('presetSelect').selectedOptions[0]?.text || 'Overlay Preset';
  const name = await openPresetNameModal(currentName);
  if (!name) return;

  $('updatePresetBtn').textContent = 'Updating...';
  try {
    const res = await fetch(`/api/presets/${encodeURIComponent(presetId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, config })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal update preset.');
    currentPresetId = presetId;
    const url = `${location.origin}/overlay.html?preset=${encodeURIComponent(presetId)}`;
    $('resultUrl').value = url;
    $('openBtn').href = url;
    await navigator.clipboard.writeText(url).catch(() => {});
    await refreshPresetList();
    $('presetSelect').value = presetId;
    $('updatePresetBtn').textContent = 'Updated!';
    setTimeout(() => $('updatePresetBtn').textContent = 'Update', 1500);
  } catch (error) {
    alert(error.message || 'Gagal update preset.');
    $('updatePresetBtn').textContent = 'Update';
  }
}

// ─── Delete Preset ────────────────────────────────────────────────────────────────────────
async function deleteSelectedPreset() {
  const presetId = $('presetSelect').value;
  const presetName = $('presetSelect').selectedOptions[0]?.text || presetId;
  if (!presetId) return alert('Pilih preset yang ingin dihapus.');

  const confirmed = await openDeleteConfirmModal(presetName);
  if (!confirmed) return;

  $('deletePresetBtn').textContent = 'Menghapus...';
  try {
    const res = await fetch(`/api/presets/${encodeURIComponent(presetId)}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal menghapus preset.');
    if (currentPresetId === presetId) {
      currentPresetId = null;
      $('resultUrl').value = '';
      $('openBtn').href = '#';
    }
    await refreshPresetList();
    $('deletePresetBtn').textContent = 'Dihapus!';
    setTimeout(() => $('deletePresetBtn').textContent = 'Hapus', 1500);
  } catch (error) {
    alert(error.message || 'Gagal menghapus preset.');
    $('deletePresetBtn').textContent = 'Hapus';
  }
}

// ─── URL & Preview ─────────────────────────────────────────────────────────────
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
  const avatarOnRight = c.avatarSide === 'right';
  const avatarOffsetPx = Number(c.avatarOffset || 0);
  const maxW = Number(c.bubbleMaxWidth || 760);
  box.style.fontFamily = c.fontFamily;
  box.innerHTML = samples.map(s => {
    const imgs = decorations.map(bubbleImgHtml).join('');
    const padClass = decorations.some(d => d.position === 'inside-bottom-left') ? ' pad-left' : decorations.some(d => d.position === 'inside-bottom-right') ? ' pad-right' : '';
    const avatarStyle = `transform:translateX(${avatarOffsetPx}px)`;
    const avatarHtml = c.showAvatar === '1' ? `<img src="https://api.dicebear.com/8.x/adventurer/svg?seed=${encodeURIComponent(s.author)}" alt="avatar" style="${avatarStyle}">` : '';
    const msg = `<span class="msg${padClass}" style="position:relative;display:block;min-height:${decorations.some(d => d.position.includes('inside')) ? '72px' : 'auto'};font-size:${c.messageSize}px;color:${c.messageColor};border-color:${c.borderColor};border-radius:${c.radius}px">${imgs}<span class="message-text" style="position:relative;z-index:2">${s.text}</span></span>`;
    const bubbleHtml = `<div class="bubble" style="max-width:${maxW}px"><span class="name" style="font-size:${c.nameSize}px;background:${c.nameBg};color:${c[s.role + 'Color'] || c.userColor}">${s.author}</span><div class="bubble-row">${msg}</div></div>`;
    const children = avatarOnRight ? `${bubbleHtml}${avatarHtml}` : `${avatarHtml}${bubbleHtml}`;
    return `<div class="sample ${c.showAvatar === '0' ? 'no-avatar' : ''} ${avatarOnRight ? 'avatar-right' : ''}">${children}</div>`;
  }).join('');
  box.querySelectorAll('.msg').forEach(el => applyMessageBackground(el, c));
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

// ─── Init ──────────────────────────────────────────────────────────────────────
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
$('generatorForm').addEventListener('submit', e => { e.preventDefault(); });

$('copyBtn').addEventListener('click', async () => {
  const url = updateGeneratedUrl();
  if (url) await navigator.clipboard.writeText(url);
  $('copyBtn').textContent = 'Copied!';
  setTimeout(() => $('copyBtn').textContent = 'Copy Link', 1200);
});

$('savePresetBtn').addEventListener('click', saveNewPreset);
$('updatePresetBtn').addEventListener('click', updateSelectedPreset);
$('deletePresetBtn').addEventListener('click', deleteSelectedPreset);
$('loadPresetBtn').addEventListener('click', loadSelectedPreset);
$('refreshPresetBtn').addEventListener('click', refreshPresetList);
$('presetSelect').addEventListener('change', () => { if ($('presetSelect').value) loadSelectedPreset(); });
$('resultUrl').addEventListener('click', () => $('resultUrl').select());

renderPreview();
updateGeneratedUrl();
refreshPresetList();
