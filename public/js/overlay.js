const params = new URLSearchParams(location.search);
const chatList = document.getElementById('chatList');
const statusEl = document.getElementById('status');
const maxMessages = 28;
const { escapeHtml, hexA, normalizeConfig } = window.LiveChatConfig;
let config = normalizeConfig(Object.fromEntries(params.entries()));
let roleColors = {};

function applyGlobalConfig() {
  roleColors = { owner: config.ownerColor, moderator: config.moderatorColor, member: config.memberColor, user: config.userColor };
  document.body.style.fontFamily = config.fontFamily || 'Imprima';
  document.body.classList.toggle('no-avatar', config.showAvatar === '0');
  document.body.classList.toggle('avatar-right', config.avatarSide === 'right');
  document.body.style.setProperty('--avatar-offset', `${Number(config.avatarOffset || 0)}px`);
  document.body.style.setProperty('--chat-width', `${Number(config.chatWidth || 78)}vw`);
  document.body.style.setProperty('--chat-height', `${Number(config.chatHeight || 100)}vh`);
  document.body.style.setProperty('--bubble-max-width', `${Number(config.bubbleMaxWidth || 760)}px`);
  document.body.dataset.position = config.chatPosition || 'bottom-left';
  document.body.dataset.animation = config.animationStyle || 'pop';
}

function setStatus(text, hide = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('hide', hide);
}

function renderParts(parts, fallback) {
  if (!Array.isArray(parts) || !parts.length) return escapeHtml(fallback || '');
  return parts.map((p) => p.type === 'image'
    ? `<img class="emoji" src="${escapeHtml(p.url)}" alt="${escapeHtml(p.alt)}">`
    : escapeHtml(p.text || '')).join('');
}

function bubbleImageHtml(d) {
  const src = escapeHtml(d.image || '');
  if (!src) return '';
  return `<img class="bubble-img bubble-img-${escapeHtml(d.position || 'inside-bottom-left')}" src="${src}" alt="" style="width:${Number(d.size || 46)}px;height:${Number(d.size || 46)}px;opacity:${Number(d.opacity || 100) / 100}">`;
}

function applyMessageBackground(message) {
  message.style.backgroundColor = hexA(config.messageBg, config.opacity);
  message.style.setProperty('--bubble-bg-image', config.bubbleBgImage ? `url("${config.bubbleBgImage}")` : 'none');
  message.style.setProperty('--bubble-bg-opacity', Number(config.bubbleBgOpacity ?? 100) / 100);
  message.style.setProperty('--bubble-bg-size', config.bubbleBgSize || 'cover');
  message.style.setProperty('--bubble-bg-position', config.bubbleBgPosition || 'center');
  message.classList.toggle('has-bg-image', Boolean(config.bubbleBgImage));
}

function addMessage(msg) {
  const item = document.createElement('article');
  item.className = `chat-item role-${escapeHtml(msg.role || 'user')}`;
  const avatar = msg.avatar || `https://api.dicebear.com/8.x/adventurer/svg?seed=${encodeURIComponent(msg.author || 'user')}`;
  const decos = config.bubbleDecorations.filter((d) => d.show === '1' && d.image);
  const imgs = decos.map(bubbleImageHtml).join('');
  const pad = decos.some((d) => d.position === 'inside-bottom-left') ? ' pad-left' : decos.some((d) => d.position === 'inside-bottom-right') ? ' pad-right' : '';
  const avatarHtml = `<img class="avatar" src="${escapeHtml(avatar)}" alt="">`;
  const contentHtml = `<div class="content"><span class="author">${escapeHtml(msg.author || 'Unknown')}</span><div class="bubble-row"><span class="message${pad}">${imgs}<span class="message-text">${renderParts(msg.parts, msg.text)}</span></span></div></div>`;
  item.innerHTML = config.avatarSide === 'right' ? `${contentHtml}${avatarHtml}` : `${avatarHtml}${contentHtml}`;
  if (config.avatarSide === 'right') item.classList.add('avatar-right');
  const author = item.querySelector('.author');
  const message = item.querySelector('.message');
  author.style.background = config.nameBg;
  author.style.color = roleColors[msg.role] || roleColors.user;
  author.style.fontSize = `${config.nameSize}px`;
  applyMessageBackground(message);
  message.style.color = config.messageColor;
  message.style.borderColor = config.borderColor;
  message.style.borderRadius = `${config.radius}px`;
  message.style.fontSize = `${config.messageSize}px`;
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
      config = normalizeConfig(data.config || {});
    } catch (error) { setStatus(error.message || 'Preset gagal dimuat.'); return; }
  }
  applyGlobalConfig();
  const videoId = config.videoId || params.get('videoId');
  if (!videoId) { setStatus('Video ID tidak ada. Generate link dari halaman utama.'); return; }
  const socket = io();
  socket.emit('join', { videoId });
  socket.on('status', (data) => {
    if (data.status === 'connected') setStatus('Connected', true);
    else setStatus(data.message || data.status || 'Connecting...');
  });
  socket.on('history', (messages) => {
    if (Array.isArray(messages)) messages.forEach(addMessage);
  });
  socket.on('chat', addMessage);
}

init();
