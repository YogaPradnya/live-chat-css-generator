const $ = (id) => document.getElementById(id);
const { DEFAULT_CONFIG, BASE_FIELDS, escapeHtml, hexA, normalizeConfig } = window.LiveChatConfig;

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

function readFormConfig() {
  const config = Object.fromEntries(BASE_FIELDS.map((id) => [id, $(id)?.value ?? DEFAULT_CONFIG[id] ?? '']));
  config.videoId = videoIdFromUrl(config.youtubeUrl);
  config.bubbleDecorations = decorManager?.values() || [];
  return normalizeConfig(config);
}

function writeFormConfig(input = {}) {
  const config = normalizeConfig(input);
  BASE_FIELDS.forEach((id) => { if ($(id)) $(id).value = config[id] ?? DEFAULT_CONFIG[id] ?? ''; });
  if ($('youtubeUrl')) $('youtubeUrl').value = input.youtubeUrl || input.videoId || '';
  $('bubbleBgUpload').value = '';
  decorManager.apply(config.bubbleDecorations);
  renderPreview();
  updateGeneratedUrl();
}

function resetGenerator() {
  currentPresetId = null;
  writeFormConfig(DEFAULT_CONFIG);
}

function openPresetNameModal(defaultName = '') {
  return new Promise((resolve) => {
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

function setPresetSelectMessage(message) {
  $('presetSelect').innerHTML = `<option value="">${escapeHtml(message)}</option>`;
}

async function refreshPresetList() {
  $('presetSelect').innerHTML = '<option value="">Loading...</option>';
  try {
    const res = await fetch('/api/presets');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal mengambil preset.');
    const presets = data.presets || [];
    if (!presets.length) { setPresetSelectMessage('Belum ada preset tersimpan'); return; }
    $('presetSelect').innerHTML = '<option value="">— Pilih preset —</option>' + presets.map((p) =>
      `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name || p.id)}</option>`
    ).join('');
    if (currentPresetId) $('presetSelect').value = currentPresetId;
  } catch (error) {
    setPresetSelectMessage(error.message || 'Gagal mengambil preset');
  }
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
    const url = `${location.origin}/o/${encodeURIComponent(data.id)}`;
    $('resultUrl').value = url;
    $('openBtn').href = url;
    $('loadPresetBtn').textContent = 'Loaded!';
    setTimeout(() => $('loadPresetBtn').textContent = 'Load', 1200);
  } catch (error) {
    alert(error.message || 'Preset gagal dimuat.');
    $('loadPresetBtn').textContent = 'Load';
  }
}

async function saveNewPreset() {
  const config = readFormConfig();
  if (!config.videoId || !/^[\w-]{11}$/.test(config.videoId)) return alert('Video ID belum valid. Paste link YouTube live/watch yang benar.');
  const currentName = currentPresetId ? ($('presetSelect').selectedOptions[0]?.text || `Overlay ${config.videoId}`) : `Overlay ${config.videoId}`;
  const name = await openPresetNameModal(currentName);
  if (!name) return;
  $('savePresetBtn').textContent = 'Saving...';
  try {
    const res = await fetch('/api/presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'public', name, config }),
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
  } catch (error) {
    alert(error.message || 'Gagal menyimpan preset.');
    $('savePresetBtn').textContent = 'Save Preset';
  }
}

async function updateSelectedPreset() {
  const presetId = $('presetSelect').value;
  if (!presetId) return alert('Pilih preset yang ingin diupdate.');
  const config = readFormConfig();
  if (!config.videoId || !/^[\w-]{11}$/.test(config.videoId)) return alert('Video ID belum valid.');
  const name = await openPresetNameModal($('presetSelect').selectedOptions[0]?.text || 'Overlay Preset');
  if (!name) return;
  $('updatePresetBtn').textContent = 'Updating...';
  try {
    const res = await fetch(`/api/presets/${encodeURIComponent(presetId)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, config }),
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
  } catch (error) {
    alert(error.message || 'Gagal update preset.');
    $('updatePresetBtn').textContent = 'Update';
  }
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

function bubbleImgHtml(decor) {
  if (!decor.image) return '';
  return `<img class="bubble-img bubble-img-${escapeHtml(decor.position)}" src="${escapeHtml(decor.image)}" alt="bubble image" style="width:${decor.size}px;height:${decor.size}px;opacity:${Number(decor.opacity) / 100}">`;
}

function buildOverlayUrl() {
  const config = readFormConfig();
  if (!config.videoId || !/^[\w-]{11}$/.test(config.videoId)) return '';
  if (currentPresetId) return `${location.origin}/o/${encodeURIComponent(currentPresetId)}`;
  const params = new URLSearchParams();
  params.set('videoId', config.videoId);
  Object.entries(config).forEach(([key, value]) => {
    if (['youtubeUrl', 'videoId', 'bubbleDecorations'].includes(key)) return;
    if (value && value !== DEFAULT_CONFIG[key]) params.set(key, value);
  });
  const decorations = config.bubbleDecorations.filter((decor) => decor.show === '1' && decor.image);
  if (decorations.length) params.set('bubbleDecorations', JSON.stringify(decorations));
  return `${location.origin}/overlay.html?${params.toString()}`;
}

function updateGeneratedUrl() {
  const url = buildOverlayUrl();
  $('resultUrl').value = url;
  $('openBtn').href = url || '#';
  return url;
}

function applyMessageBackground(el, config) {
  el.style.backgroundColor = hexA(config.messageBg, config.opacity);
  el.style.setProperty('--bubble-bg-image', config.bubbleBgImage ? `url("${config.bubbleBgImage}")` : 'none');
  el.style.setProperty('--bubble-bg-opacity', Number(config.bubbleBgOpacity ?? 100) / 100);
  el.style.setProperty('--bubble-bg-size', config.bubbleBgSize || 'cover');
  el.style.setProperty('--bubble-bg-position', config.bubbleBgPosition || 'center');
  el.classList.toggle('has-bg-image', Boolean(config.bubbleBgImage));
}

function renderPreview() {
  const config = readFormConfig();
  const decorations = config.bubbleDecorations;
  const box = $('chatPreview');
  const avatarOnRight = config.avatarSide === 'right';
  const avatarOffsetPx = Number(config.avatarOffset || 0);
  box.style.fontFamily = config.fontFamily;
  box.innerHTML = samples.map((sample) => {
    const imgs = decorations.map(bubbleImgHtml).join('');
    const padClass = decorations.some((decor) => decor.position === 'inside-bottom-left') ? ' pad-left' : decorations.some((decor) => decor.position === 'inside-bottom-right') ? ' pad-right' : '';
    const avatarStyle = `transform:translateX(${avatarOffsetPx}px)`;
    const avatarHtml = config.showAvatar === '1' ? `<img src="https://api.dicebear.com/8.x/adventurer/svg?seed=${encodeURIComponent(sample.author)}" alt="avatar" style="${avatarStyle}">` : '';
    const msg = `<span class="msg${padClass}" style="position:relative;display:block;min-height:${decorations.some((decor) => decor.position.includes('inside')) ? '72px' : 'auto'};font-size:${config.messageSize}px;color:${config.messageColor};border-color:${config.borderColor};border-radius:${config.radius}px">${imgs}<span class="message-text" style="position:relative;z-index:2">${escapeHtml(sample.text)}</span></span>`;
    const bubbleHtml = `<div class="bubble" style="max-width:${config.bubbleMaxWidth}px"><span class="name" style="font-size:${config.nameSize}px;background:${config.nameBg};color:${config[sample.role + 'Color'] || config.userColor}">${escapeHtml(sample.author)}</span><div class="bubble-row">${msg}</div></div>`;
    return `<div class="sample ${config.showAvatar === '0' ? 'no-avatar' : ''} ${avatarOnRight ? 'avatar-right' : ''}">${avatarOnRight ? `${bubbleHtml}${avatarHtml}` : `${avatarHtml}${bubbleHtml}`}</div>`;
  }).join('');
  box.querySelectorAll('.msg').forEach((el) => applyMessageBackground(el, config));
}

function onConfigChange() {
  currentPresetId = null;
  renderPreview();
  updateGeneratedUrl();
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
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closePresetNameModal(null); closeDeleteConfirmModal(false); }
  });

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
  bindEvents();
  resetGenerator();
  refreshPresetList();
}

init();
