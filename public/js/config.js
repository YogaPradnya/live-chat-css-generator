window.LiveChatConfig = (() => {
  const DEFAULT_CONFIG = Object.freeze({
    youtubeUrl: '', videoId: '', fontFamily: 'Imprima',
    showAvatar: '0', avatarSide: 'left', avatarOffset: '0',
    ownerColor: '#ffd600', moderatorColor: '#5eead4', memberColor: '#a78bfa', userColor: '#ffffff',
    messageColor: '#071952', messageBg: '#ffffff', nameBg: '#80b3ff', borderColor: '#525ceb',
    nameSize: '20', messageSize: '24', radius: '19', opacity: '90',
    bubbleMaxWidth: '760', chatWidth: '78', chatHeight: '100',
    bubbleBgImage: '', bubbleBgSize: 'cover', bubbleBgPosition: 'center', bubbleBgOpacity: '100',
    chatPosition: 'bottom-left', animationStyle: 'pop',
    bubbleDecorations: [],
  });

  const BASE_FIELDS = Object.freeze(Object.keys(DEFAULT_CONFIG).filter((k) => !['videoId', 'bubbleDecorations'].includes(k)));
  const COLOR_FIELDS = Object.freeze(['ownerColor', 'moderatorColor', 'memberColor', 'userColor', 'messageColor', 'messageBg', 'nameBg', 'borderColor']);
  const VALID_POSITIONS = ['bottom-left', 'bottom-right', 'bottom-center', 'top-left', 'top-right'];
  const VALID_ANIMATIONS = ['pop', 'slide-up', 'fade', 'bounce', 'zoom', 'none'];

  const SIZE_PRESETS = Object.freeze({
    compact:  { bubbleMaxWidth: '440',  chatWidth: '40',  chatHeight: '60',  nameSize: '14', messageSize: '16' },
    normal:   { bubbleMaxWidth: '760',  chatWidth: '78',  chatHeight: '100', nameSize: '20', messageSize: '24' },
    wide:     { bubbleMaxWidth: '1100', chatWidth: '100', chatHeight: '100', nameSize: '22', messageSize: '26' },
    fullscreen: { bubbleMaxWidth: '1400', chatWidth: '130', chatHeight: '130', nameSize: '24', messageSize: '28' },
    ultrawide:  { bubbleMaxWidth: '2000', chatWidth: '160', chatHeight: '160', nameSize: '28', messageSize: '32' },
  });

  const THEME_PRESETS = Object.freeze({
    'Clean Blue':     { ownerColor: '#ffd600', moderatorColor: '#5eead4', memberColor: '#a78bfa', userColor: '#ffffff', messageColor: '#071952', messageBg: '#ffffff', nameBg: '#80b3ff', borderColor: '#525ceb' },
    'Soft Pink':      { ownerColor: '#ff6b9d', moderatorColor: '#c084fc', memberColor: '#f9a8d4', userColor: '#fce7f3', messageColor: '#831843', messageBg: '#fdf2f8', nameBg: '#f9a8d4', borderColor: '#ec4899' },
    'Dark Neon':      { ownerColor: '#facc15', moderatorColor: '#22d3ee', memberColor: '#a78bfa', userColor: '#e2e8f0', messageColor: '#e2e8f0', messageBg: '#1e1b4b', nameBg: '#312e81', borderColor: '#6366f1' },
    'Minimal White':  { ownerColor: '#111111', moderatorColor: '#555555', memberColor: '#888888', userColor: '#333333', messageColor: '#111111', messageBg: '#ffffff', nameBg: '#f4f4f5', borderColor: '#d4d4d8' },
    'Gaming Purple':  { ownerColor: '#fbbf24', moderatorColor: '#34d399', memberColor: '#c084fc', userColor: '#e0e7ff', messageColor: '#e0e7ff', messageBg: '#2e1065', nameBg: '#581c87', borderColor: '#9333ea' },
    'Cute Pastel':    { ownerColor: '#fbbf24', moderatorColor: '#6ee7b7', memberColor: '#c4b5fd', userColor: '#fbcfe8', messageColor: '#4a044e', messageBg: '#faf5ff', nameBg: '#e9d5ff', borderColor: '#d8b4fe' },
  });

  function escapeHtml(t = '') {
    return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function clampNumber(v, min, max, fb) { const n = Number(v); return Number.isFinite(n) ? String(Math.min(max, Math.max(min, n))) : String(fb); }
  function normalizeColor(v, fb) { const t = String(v || '').trim(); return /^#[0-9a-f]{6}$/i.test(t) ? t : fb; }
  function normalizeDecorations(v) {
    let items = v;
    if (typeof v === 'string') { try { items = JSON.parse(v); } catch { items = []; } }
    if (!Array.isArray(items)) return [];
    return items.slice(0, 8).map((d) => ({
      image: String(d?.image || '').trim().slice(0, 1200), show: d?.show === '0' ? '0' : '1',
      position: String(d?.position || 'inside-bottom-left').replace(/[^a-z-]/g, '') || 'inside-bottom-left',
      size: clampNumber(d?.size, 20, 160, 46), opacity: clampNumber(d?.opacity, 0, 100, 100),
    })).filter((d) => d.image);
  }
  function normalizeConfig(input = {}) {
    const o = { ...DEFAULT_CONFIG };
    for (const k of BASE_FIELDS) { if (input[k] !== undefined && input[k] !== null) o[k] = String(input[k]); }
    for (const k of COLOR_FIELDS) o[k] = normalizeColor(o[k], DEFAULT_CONFIG[k]);
    o.avatarOffset = clampNumber(o.avatarOffset, -120, 120, 0);
    o.nameSize = clampNumber(o.nameSize, 14, 34, 20);
    o.messageSize = clampNumber(o.messageSize, 14, 38, 24);
    o.radius = clampNumber(o.radius, 0, 36, 19);
    o.opacity = clampNumber(o.opacity, 35, 100, 90);
    o.bubbleMaxWidth = clampNumber(o.bubbleMaxWidth, 200, 2000, 760);
    o.chatWidth = clampNumber(o.chatWidth, 20, 160, 78);
    o.chatHeight = clampNumber(o.chatHeight, 20, 160, 100);
    o.bubbleBgOpacity = clampNumber(o.bubbleBgOpacity, 0, 100, 100);
    o.showAvatar = o.showAvatar === '1' ? '1' : '0';
    o.avatarSide = o.avatarSide === 'right' ? 'right' : 'left';
    o.chatPosition = VALID_POSITIONS.includes(o.chatPosition) ? o.chatPosition : 'bottom-left';
    o.animationStyle = VALID_ANIMATIONS.includes(o.animationStyle) ? o.animationStyle : 'pop';
    o.videoId = String(input.videoId || '').trim();
    o.bubbleDecorations = normalizeDecorations(input.bubbleDecorations);
    return o;
  }
  function hexA(hex = '#ffffff', op = 90) {
    const h = normalizeColor(hex, '#ffffff'); const n = parseInt(h.slice(1), 16);
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${Number(op) / 100})`;
  }

  return { DEFAULT_CONFIG, BASE_FIELDS, VALID_POSITIONS, VALID_ANIMATIONS, SIZE_PRESETS, THEME_PRESETS, escapeHtml, hexA, normalizeConfig, normalizeDecorations };
})();
