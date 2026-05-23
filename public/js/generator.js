const $ = (id) => document.getElementById(id);
const { DEFAULT_CONFIG, BASE_FIELDS, SIZE_PRESETS, THEME_PRESETS, escapeHtml, hexA, normalizeConfig } = window.LiveChatConfig;

const samples = [
  { author: 'Owner', role: 'owner', text: 'Halo semuanya, chat overlay sudah realtime!' },
  { author: 'Moderator', role: 'moderator', text: 'Moderator warnanya bisa dicustom.' },
  { author: 'Member', role: 'member', text: 'Membership juga beda warna.' },
  { author: 'User', role: 'user', text: 'Tinggal copy link ini ke OBS Browser Source.' },
];

let currentPresetId = null;
let decorManager = null;
let _presetModalResolve = null;
let _deleteConfirmResolve = null;

function videoIdFromUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^[\w-]{11}$/.test(raw)) return raw;
  const m = raw.match(/[?&]v=([\w-]{11})/) || raw.match(/(?:youtu\.be\/|live\/|embed\/|shorts\/)([\w-]{11})/);
  if (m) return m[1];
  const norm = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(norm);
    const q = url.searchParams.get('v') || url.searchParams.get('video_id');
    if (q) return q;
    const p = url.pathname.split('/').filter(Boolean);
    if (url.hostname.includes('youtu.be')) return p[0] || '';
    if (p[0] === 'live' && p[1]) return p[1];
    return p.pop() || '';
  } catch { return ''; }
}

function readFormConfig() {
  const c = Object.fromEntries(BASE_FIELDS.map((id) => [id, $(id)?.value ?? DEFAULT_CONFIG[id] ?? '']));
  c.videoId = videoIdFromUrl(c.youtubeUrl);
  c.bubbleDecorations = decorManager?.values() || [];
  return normalizeConfig(c);
}

function writeFormConfig(input = {}) {
  const c = normalizeConfig(input);
  BASE_FIELDS.forEach((id) => { if ($(id)) $(id).value = c[id] ?? DEFAULT_CONFIG[id] ?? ''; });
  if ($('youtubeUrl')) $('youtubeUrl').value = input.youtubeUrl || input.videoId || '';
  $('bubbleBgUpload').value = '';
  decorManager.apply(c.bubbleDecorations);
  updateRangeValues();
  renderPreview();
  updateGeneratedUrl();
}

function resetGenerator() { currentPresetId = null; writeFormConfig(DEFAULT_CONFIG); }

function updateRangeValues() {
  document.querySelectorAll('.range-value[data-for]').forEach((span) => {
    const input = $(span.dataset.for);
    if (input) span.textContent = input.value;
  });
}

function openPresetNameModal(defaultName = '', defaultSlug = '') {
  return new Promise((resolve) => {
    _presetModalResolve = resolve;
    $('presetNameInput').value = defaultName;
    $('presetSlugInput').value = defaultSlug;
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
function openDeleteConfirmModal(presetName) {
  return new Promise((resolve) => {
    _deleteConfirmResolve = resolve;
    $('deleteConfirmText').textContent = `Apakah kamu yakin ingin menghapus preset "${presetName}"? Tindakan ini tidak bisa dibatalkan.`;
    $('deleteConfirmModal').classList.add('show');
    $('deleteConfirmBtn').focus();
  });
}
function closeDeleteConfirmModal(result = false) {
  $('deleteConfirmModal').classList.remove('show');
  if (_deleteConfirmResolve) { _deleteConfirmResolve(result); _deleteConfirmResolve = null; }
}
function setPresetSelectMessage(msg) { $('presetSelect').innerHTML = `<option value="">${escapeHtml(msg)}</option>`; }

async function refreshPresetList() {
  $('presetSelect').innerHTML = '<option value="">Loading...</option>';
  try {
    const res = await fetch('/api/presets');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal mengambil preset.');
    const presets = data.presets || [];
    if (!presets.length) { setPresetSelectMessage('Belum ada preset tersimpan'); return; }
    $('presetSelect').innerHTML = '<option value="">-- Pilih preset --</option>' + presets.map((p) =>
      `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name || p.id)}${p.slug ? ` [${escapeHtml(p.slug)}]` : ''}</option>`
    ).join('');
    if (currentPresetId) $('presetSelect').value = currentPresetId;
  } catch (error) { setPresetSelectMessage(error.message || 'Gagal mengambil preset'); }
}

async function loadSelectedPreset() {
  const presetId = $('presetSelect').value;
  if (!presetId) return;
  $('loadPresetBtn').textContent = 'Loading...';
  try {
    const res = await fetch(`/api/presets/${encodeURIComponent(presetId)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Preset gagal dimuat.');
    writeFormConfig(data.config || {});
    currentPresetId = data.id;
    const url = `${location.origin}${data.shortUrl || data.url}`;
    $('resultUrl').value = url;
    $('openBtn').href = url;
    $('loadPresetBtn').textContent = 'Loaded!';
    setTimeout(() => $('loadPresetBtn').textContent = 'Load', 1200);
  } catch (error) { alert(error.message); $('loadPresetBtn').textContent = 'Load'; }
}

async function saveNewPreset() {
  const config = readFormConfig();
  if (!config.videoId || !/^[\w-]{11}$/.test(config.videoId)) return alert('Video ID belum valid.');
  const currentName = currentPresetId ? ($('presetSelect').selectedOptions[0]?.text || `Overlay ${config.videoId}`) : `Overlay ${config.videoId}`;
  const result = await openPresetNameModal(currentName, '');
  if (!result) return;
  const name = $('presetNameInput').value.trim();
  const slug = $('presetSlugInput').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
  if (!name) return;
  $('savePresetBtn').textContent = 'Saving...';
  try {
    const res = await fetch('/api/presets', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'public', name, slug: slug || undefined, config }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal menyimpan preset.');
    currentPresetId = data.id;
    const url = `${location.origin}${data.shortUrl || data.url}`;
    $('resultUrl').value = url;
    $('openBtn').href = url;
    await navigator.clipboard.writeText(url).catch(() => {});
    await refreshPresetList();
    $('presetSelect').value = data.id;
    $('savePresetBtn').textContent = 'Saved!';
    setTimeout(() => $('savePresetBtn').textContent = 'Save Preset', 1500);
  } catch (error) { alert(error.message); $('savePresetBtn').textContent = 'Save Preset'; }
}

async function updateSelectedPreset() {
  const presetId = $('presetSelect').value;
  if (!presetId) return alert('Pilih preset yang ingin diupdate.');
  const config = readFormConfig();
  if (!config.videoId || !/^[\w-]{11}$/.test(config.videoId)) return alert('Video ID belum valid.');
  const result = await openPresetNameModal($('presetSelect').selectedOptions[0]?.text || 'Overlay Preset', '');
  if (!result) return;
  const name = $('presetNameInput').value.trim();
  const slug = $('presetSlugInput').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
  if (!name) return;
  $('updatePresetBtn').textContent = 'Updating...';
  try {
    const res = await fetch(`/api/presets/${encodeURIComponent(presetId)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug: slug || undefined, config }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal update preset.');
    currentPresetId = presetId;
    const url = `${location.origin}${data.shortUrl || `/o/${encodeURIComponent(presetId)}`}`;
    $('resultUrl').value = url;
    $('openBtn').href = url;
    await navigator.clipboard.writeText(url).catch(() => {});
    await refreshPresetList();
    $('presetSelect').value = presetId;
    $('updatePresetBtn').textContent = 'Updated!';
    setTimeout(() => $('updatePresetBtn').textContent = 'Update', 1500);
  } catch (error) { alert(error.message); $('updatePresetBtn').textContent = 'Update'; }
}

async function deleteSelectedPreset() {
  const presetId = $('presetSelect').value;
  const presetName = $('presetSelect').selectedOptions[0]?.text || presetId;
  if (!presetId) return alert('Pilih preset yang ingin dihapus.');
  if (!await openDeleteConfirmModal(presetName)) return;
  $('deletePresetBtn').textContent = 'Menghapus...';
  try {
    const res = await fetch(`/api/presets/${encodeURIComponent(presetId)}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal menghapus preset.');
    if (currentPresetId === presetId) { currentPresetId = null; $('resultUrl').value = ''; $('openBtn').href = '#'; }
    await refreshPresetList();
    $('deletePresetBtn').textContent = 'Dihapus!';
    setTimeout(() => $('deletePresetBtn').textContent = 'Hapus', 1500);
  } catch (error) { alert(error.message); $('deletePresetBtn').textContent = 'Hapus'; }
}

function bubbleImgHtml(d) {
  if (!d.image) return '';
  return `<img class="bubble-img bubble-img-${escapeHtml(d.position)}" src="${escapeHtml(d.image)}" alt="" style="width:${d.size}px;height:${d.size}px;opacity:${Number(d.opacity) / 100}">`;
}

function buildOverlayUrl() {
  const c = readFormConfig();
  if (!c.videoId || !/^[\w-]{11}$/.test(c.videoId)) return '';
  if (currentPresetId) return `${location.origin}/o/${encodeURIComponent(currentPresetId)}`;
  const p = new URLSearchParams();
  p.set('videoId', c.videoId);
  Object.entries(c).forEach(([k, v]) => {
    if (['youtubeUrl', 'videoId', 'bubbleDecorations'].includes(k)) return;
    if (v && v !== DEFAULT_CONFIG[k]) p.set(k, v);
  });
  const ds = c.bubbleDecorations.filter((d) => d.show === '1' && d.image);
  if (ds.length) p.set('bubbleDecorations', JSON.stringify(ds));
  return `${location.origin}/overlay.html?${p.toString()}`;
}

function updateGeneratedUrl() {
  const url = buildOverlayUrl();
  $('resultUrl').value = url; $('openBtn').href = url || '#';
  return url;
}

function applyMessageBackground(el, c) {
  el.style.backgroundColor = hexA(c.messageBg, c.opacity);
  el.style.setProperty('--bubble-bg-image', c.bubbleBgImage ? `url("${c.bubbleBgImage}")` : 'none');
  el.style.setProperty('--bubble-bg-opacity', Number(c.bubbleBgOpacity ?? 100) / 100);
  el.style.setProperty('--bubble-bg-size', c.bubbleBgSize || 'cover');
  el.style.setProperty('--bubble-bg-position', c.bubbleBgPosition || 'center');
  el.classList.toggle('has-bg-image', Boolean(c.bubbleBgImage));
}

function renderPreview() {
  const c = readFormConfig();
  const decos = c.bubbleDecorations;
  const box = $('chatPreview');
  const right = c.avatarSide === 'right';
  const offset = Number(c.avatarOffset || 0);
  box.style.fontFamily = c.fontFamily;
  box.innerHTML = samples.map((s) => {
    const imgs = decos.map(bubbleImgHtml).join('');
    const pad = decos.some((d) => d.position === 'inside-bottom-left') ? ' pad-left' : decos.some((d) => d.position === 'inside-bottom-right') ? ' pad-right' : '';
    const av = c.showAvatar === '1' ? `<img src="https://api.dicebear.com/8.x/adventurer/svg?seed=${encodeURIComponent(s.author)}" alt="avatar" style="transform:translateX(${offset}px)">` : '';
    const msg = `<span class="msg${pad}" style="position:relative;display:block;min-height:${decos.some((d) => d.position.includes('inside')) ? '72px' : 'auto'};font-size:${c.messageSize}px;color:${c.messageColor};border-color:${c.borderColor};border-radius:${c.radius}px">${imgs}<span class="message-text" style="position:relative;z-index:2">${escapeHtml(s.text)}</span></span>`;
    const bub = `<div class="bubble" style="max-width:${c.bubbleMaxWidth}px"><span class="name" style="font-size:${c.nameSize}px;background:${c.nameBg};color:${c[s.role + 'Color'] || c.userColor}">${escapeHtml(s.author)}</span><div class="bubble-row">${msg}</div></div>`;
    return `<div class="sample ${c.showAvatar === '0' ? 'no-avatar' : ''} ${right ? 'avatar-right' : ''}">${right ? bub + av : av + bub}</div>`;
  }).join('');
  box.querySelectorAll('.msg').forEach((el) => applyMessageBackground(el, c));
}

function onConfigChange() { currentPresetId = null; updateRangeValues(); renderPreview(); updateGeneratedUrl(); }

function buildThemeButtons() {
  const container = $('themePresetButtons');
  Object.entries(THEME_PRESETS).forEach(([name, colors]) => {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'btn-theme'; btn.textContent = name;
    btn.style.background = `linear-gradient(135deg, ${colors.nameBg}, ${colors.borderColor})`;
    btn.style.color = colors.messageColor;
    btn.addEventListener('click', () => {
      Object.entries(colors).forEach(([k, v]) => { if ($(k)) $(k).value = v; });
      onConfigChange();
    });
    container.appendChild(btn);
  });
}

function buildSizeButtons() {
  const container = $('sizePresetButtons');
  const labels = { compact: 'Compact', normal: 'Normal', wide: 'Wide', fullscreen: 'Fullscreen', ultrawide: 'Ultra Wide' };
  Object.entries(SIZE_PRESETS).forEach(([key, values]) => {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'btn-size'; btn.textContent = labels[key] || key;
    btn.addEventListener('click', () => {
      Object.entries(values).forEach(([k, v]) => { if ($(k)) $(k).value = v; });
      onConfigChange();
    });
    container.appendChild(btn);
  });
}

function bindEvents() {
  $('presetNameCancelBtn').addEventListener('click', () => closePresetNameModal(null));
  $('presetNameModal').addEventListener('click', (e) => { if (e.target === $('presetNameModal')) closePresetNameModal(null); });
  $('presetNameSaveBtn').addEventListener('click', () => {
    const name = $('presetNameInput').value.trim();
    if (!name) { $('presetNameError').textContent = 'Nama preset wajib diisi.'; return; }
    closePresetNameModal(name);
  });
  $('presetNameInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('presetNameSaveBtn').click();
    if (e.key === 'Escape') closePresetNameModal(null);
  });
  $('deleteCancelBtn').addEventListener('click', () => closeDeleteConfirmModal(false));
  $('deleteConfirmModal').addEventListener('click', (e) => { if (e.target === $('deleteConfirmModal')) closeDeleteConfirmModal(false); });
  $('deleteConfirmBtn').addEventListener('click', () => closeDeleteConfirmModal(true));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closePresetNameModal(null); closeDeleteConfirmModal(false); } });
  BASE_FIELDS.forEach((id) => $(id)?.addEventListener('input', onConfigChange));
  $('generatorForm').addEventListener('submit', (e) => e.preventDefault());
  $('addBubbleDecorBtn').addEventListener('click', () => { decorManager.add(); onConfigChange(); });
  $('bubbleBgUpload').addEventListener('change', () => window.LiveChatUpload.uploadImage('bubbleBgUpload', 'bubbleBgImage', onConfigChange));
  $('copyBtn').addEventListener('click', async () => {
    const url = updateGeneratedUrl();
    if (url) await navigator.clipboard.writeText(url).catch(() => {});
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
}

function init() {
  decorManager = window.LiveChatDecorations.createManager({
    onChange: onConfigChange,
    onUpload: (input, target) => window.LiveChatUpload.uploadImage(input, target, onConfigChange),
  });
  buildThemeButtons();
  buildSizeButtons();
  bindEvents();
  resetGenerator();
  refreshPresetList();
}

init();
