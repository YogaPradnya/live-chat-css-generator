const params = new URLSearchParams(location.search);
const chatList = document.getElementById('chatList');
const statusEl = document.getElementById('status');
const maxMessages = 28;
let config = Object.fromEntries(params.entries());
let roleColors = {};

function applyGlobalConfig() {
  roleColors = { owner: config.ownerColor || '#ffd600', moderator: config.moderatorColor || '#5eead4', member: config.memberColor || '#a78bfa', user: config.userColor || '#ffffff' };
  document.body.style.fontFamily = config.fontFamily || 'Imprima';
  document.body.classList.toggle('no-avatar', config.showAvatar === '0');
  document.body.classList.toggle('avatar-right', config.avatarSide === 'right');
  const offset = Number(config.avatarOffset || 0);
  document.body.style.setProperty('--avatar-offset', `${offset}px`);
  document.body.style.setProperty('--chat-width', `${Number(config.chatWidth || 78)}vw`);
  document.body.style.setProperty('--chat-height', `${Number(config.chatHeight || 100)}vh`);
  document.body.style.setProperty('--bubble-max-width', `${Number(config.bubbleMaxWidth || 760)}px`);
}

function setStatus(text, hide = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('hide', hide);
}
function hexA(hex = '#ffffff', op = 90) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${Number(op) / 100})`;
}
function escapeHtml(text = '') {
  return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function renderParts(parts, fallback) {
  if (!Array.isArray(parts) || !parts.length) return escapeHtml(fallback || '');
  return parts.map((part) => part.type === 'image'
    ? `<img class="emoji" src="${escapeHtml(part.url)}" alt="${escapeHtml(part.alt)}">`
    : escapeHtml(part.text || '')).join('');
}
function decorations() {
  if (Array.isArray(config.bubbleDecorations)) return config.bubbleDecorations.filter(d => d.show === '1' && d.image);
  try { return JSON.parse(config.bubbleDecorations || '[]'); }
  catch { return []; }
}
function bubbleImageHtml(d) {
  const src = escapeHtml(d.image || '');
  if (!src) return '';
  const size = Number(d.size || 46);
  const opacity = Number(d.opacity || 100) / 100;
  const pos = escapeHtml(d.position || 'inside-bottom-left');
  return `<img class="bubble-img bubble-img-${pos}" src="${src}" alt="" style="width:${size}px;height:${size}px;opacity:${opacity}">`;
}
function applyMessageBackground(message) {
  message.style.backgroundColor = hexA(config.messageBg || '#ffffff', config.opacity || 90);
  const bgOpacity = Number(config.bubbleBgOpacity ?? 100) / 100;
  message.style.setProperty('--bubble-bg-image', config.bubbleBgImage ? `url("${config.bubbleBgImage}")` : 'none');
  message.style.setProperty('--bubble-bg-opacity', bgOpacity);
  message.style.setProperty('--bubble-bg-size', config.bubbleBgSize || 'cover');
  message.style.setProperty('--bubble-bg-position', config.bubbleBgPosition || 'center');
  message.classList.toggle('has-bg-image', Boolean(config.bubbleBgImage));
}
function addMessage(msg) {
  const item = document.createElement('article');
  item.className = `chat-item role-${msg.role || 'user'}`;
  const avatar = msg.avatar || `https://api.dicebear.com/8.x/adventurer/svg?seed=${encodeURIComponent(msg.author || 'user')}`;
  const decos = decorations();
  const imgs = decos.map(bubbleImageHtml).join('');
  const padClass = decos.some(d => d.position === 'inside-bottom-left') ? ' pad-left' : decos.some(d => d.position === 'inside-bottom-right') ? ' pad-right' : '';
  const avatarHtml = `<img class="avatar" src="${escapeHtml(avatar)}" alt="">`;
  const contentHtml = `<div class="content"><span class="author">${escapeHtml(msg.author || 'Unknown')}</span><div class="bubble-row"><span class="message${padClass}">${imgs}<span class="message-text">${renderParts(msg.parts, msg.text)}</span></span></div></div>`;
  const avatarOnRight = config.avatarSide === 'right';
  item.innerHTML = avatarOnRight ? `${contentHtml}${avatarHtml}` : `${avatarHtml}${contentHtml}`;
  if (avatarOnRight) item.classList.add('avatar-right');
  const author = item.querySelector('.author');
  const message = item.querySelector('.message');
  author.style.background = config.nameBg || '#80b3ff';
  author.style.color = roleColors[msg.role] || roleColors.user;
  author.style.fontSize = `${config.nameSize || 20}px`;
  applyMessageBackground(message);
  message.style.color = config.messageColor || '#071952';
  message.style.borderColor = config.borderColor || '#525ceb';
  message.style.borderRadius = `${config.radius || 19}px`;
  message.style.fontSize = `${config.messageSize || 24}px`;
  chatList.appendChild(item);
  while (chatList.children.length > maxMessages) chatList.removeChild(chatList.firstElementChild);
}

async function init() {
  const presetId = params.get('preset');
  if (presetId) {
    try {
      setStatus('Loading preset...');
      const res = await fetch(`/api/presets/${encodeURIComponent(presetId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Preset gagal dimuat.');
      config = data.config || {};
    } catch (error) {
      setStatus(error.message || 'Preset gagal dimuat.');
      return;
    }
  }
  applyGlobalConfig();
  const videoId = config.videoId || params.get('videoId');
  if (!videoId) {
    setStatus('Video ID tidak ada. Generate link dari halaman utama.');
    return;
  }
  const socket = io();
  socket.emit('join', { videoId });
  socket.on('status', (data) => {
    if (data.status === 'connected') setStatus('Connected', true);
    else setStatus(data.message || data.status || 'Connecting...');
  });
  socket.on('chat', addMessage);
}
init();
