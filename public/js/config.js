window.LiveChatConfig = (() => {
  const DEFAULT_CONFIG = Object.freeze({
    youtubeUrl: '',
    videoId: '',
    fontFamily: 'Imprima',
    showAvatar: '0',
    avatarSide: 'left',
    avatarOffset: '0',
    ownerColor: '#ffd600',
    moderatorColor: '#5eead4',
    memberColor: '#a78bfa',
    userColor: '#ffffff',
    messageColor: '#071952',
    messageBg: '#ffffff',
    nameBg: '#80b3ff',
    borderColor: '#525ceb',
    nameSize: '20',
    messageSize: '24',
    radius: '19',
    opacity: '90',
    bubbleMaxWidth: '760',
    chatWidth: '78',
    chatHeight: '100',
    bubbleBgImage: '',
    bubbleBgSize: 'cover',
    bubbleBgPosition: 'center',
    bubbleBgOpacity: '100',
    bubbleDecorations: [],
  });

  const BASE_FIELDS = Object.freeze(Object.keys(DEFAULT_CONFIG).filter((key) => !['videoId', 'bubbleDecorations'].includes(key)));
  const NUMBER_FIELDS = Object.freeze(['avatarOffset', 'nameSize', 'messageSize', 'radius', 'opacity', 'bubbleMaxWidth', 'chatWidth', 'chatHeight', 'bubbleBgOpacity']);
  const COLOR_FIELDS = Object.freeze(['ownerColor', 'moderatorColor', 'memberColor', 'userColor', 'messageColor', 'messageBg', 'nameBg', 'borderColor']);

  function escapeHtml(text = '') {
    return String(text).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));
  }

  function clampNumber(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return String(fallback);
    return String(Math.min(max, Math.max(min, parsed)));
  }

  function normalizeColor(value, fallback) {
    const text = String(value || '').trim();
    return /^#[0-9a-f]{6}$/i.test(text) ? text : fallback;
  }

  function normalizeDecorations(value) {
    let items = value;
    if (typeof value === 'string') {
      try { items = JSON.parse(value); } catch { items = []; }
    }
    if (!Array.isArray(items)) return [];
    return items.slice(0, 8).map((decor) => ({
      image: String(decor?.image || '').trim().slice(0, 1200),
      show: decor?.show === '0' ? '0' : '1',
      position: String(decor?.position || 'inside-bottom-left').replace(/[^a-z-]/g, '') || 'inside-bottom-left',
      size: clampNumber(decor?.size, 20, 160, 46),
      opacity: clampNumber(decor?.opacity, 0, 100, 100),
    })).filter((decor) => decor.image);
  }

  function normalizeConfig(input = {}) {
    const out = { ...DEFAULT_CONFIG };
    for (const key of BASE_FIELDS) {
      if (input[key] !== undefined && input[key] !== null) out[key] = String(input[key]);
    }
    for (const key of COLOR_FIELDS) out[key] = normalizeColor(out[key], DEFAULT_CONFIG[key]);
    out.avatarOffset = clampNumber(out.avatarOffset, -120, 120, DEFAULT_CONFIG.avatarOffset);
    out.nameSize = clampNumber(out.nameSize, 14, 34, DEFAULT_CONFIG.nameSize);
    out.messageSize = clampNumber(out.messageSize, 14, 38, DEFAULT_CONFIG.messageSize);
    out.radius = clampNumber(out.radius, 0, 36, DEFAULT_CONFIG.radius);
    out.opacity = clampNumber(out.opacity, 35, 100, DEFAULT_CONFIG.opacity);
    out.bubbleMaxWidth = clampNumber(out.bubbleMaxWidth, 200, 2000, DEFAULT_CONFIG.bubbleMaxWidth);
    out.chatWidth = clampNumber(out.chatWidth, 20, 160, DEFAULT_CONFIG.chatWidth);
    out.chatHeight = clampNumber(out.chatHeight, 20, 160, DEFAULT_CONFIG.chatHeight);
    out.bubbleBgOpacity = clampNumber(out.bubbleBgOpacity, 0, 100, DEFAULT_CONFIG.bubbleBgOpacity);
    out.showAvatar = out.showAvatar === '1' ? '1' : '0';
    out.avatarSide = out.avatarSide === 'right' ? 'right' : 'left';
    out.videoId = String(input.videoId || '').trim();
    out.bubbleDecorations = normalizeDecorations(input.bubbleDecorations);
    return out;
  }

  function hexA(hex = '#ffffff', op = 90) {
    const safeHex = normalizeColor(hex, '#ffffff');
    const n = parseInt(safeHex.slice(1), 16);
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${Number(op) / 100})`;
  }

  return { DEFAULT_CONFIG, BASE_FIELDS, escapeHtml, hexA, normalizeConfig, normalizeDecorations };
})();
