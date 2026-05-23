const PRESET_CONFIG_FIELDS = new Set([
  'youtubeUrl', 'videoId', 'fontFamily', 'showAvatar', 'avatarSide', 'avatarOffset',
  'ownerColor', 'moderatorColor', 'memberColor', 'userColor', 'messageColor', 'messageBg',
  'nameBg', 'borderColor', 'nameSize', 'messageSize', 'radius', 'opacity',
  'bubbleMaxWidth', 'chatWidth', 'chatHeight', 'bubbleBgImage', 'bubbleBgSize',
  'bubbleBgPosition', 'bubbleBgOpacity', 'bubbleDecorations',
  'chatPosition', 'animationStyle',
]);
const COLOR_CONFIG_FIELDS = new Set(['ownerColor', 'moderatorColor', 'memberColor', 'userColor', 'messageColor', 'messageBg', 'nameBg', 'borderColor']);
const NUMBER_CONFIG_LIMITS = {
  avatarOffset: [-120, 120], nameSize: [14, 34], messageSize: [14, 38], radius: [0, 36],
  opacity: [35, 100], bubbleMaxWidth: [200, 2000], chatWidth: [20, 160], chatHeight: [20, 160], bubbleBgOpacity: [0, 100],
};
const VALID_CHAT_POSITIONS = new Set(['bottom-left', 'bottom-right', 'bottom-center', 'top-left', 'top-right']);
const VALID_ANIMATIONS = new Set(['pop', 'slide-up', 'fade', 'bounce', 'zoom', 'none']);

function presetUrl(id) { return `/overlay.html?preset=${encodeURIComponent(id)}`; }
function shortPresetUrl(idOrSlug) { return `/o/${encodeURIComponent(idOrSlug)}`; }
function sanitizePresetId(value) { return String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32); }
function sanitizeSlug(value) {
  const slug = String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return slug.length >= 3 ? slug : '';
}
function normalizePresetName(value) {
  const name = String(value || 'Overlay Preset').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 80);
  return name || 'Overlay Preset';
}
function clampStringNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return String(Math.min(max, Math.max(min, number)));
}
function normalizePresetConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const config = {};
  for (const [key, rawValue] of Object.entries(input)) {
    if (!PRESET_CONFIG_FIELDS.has(key)) continue;
    if (key === 'bubbleDecorations') {
      const decorations = Array.isArray(rawValue) ? rawValue : [];
      config.bubbleDecorations = decorations.slice(0, 8).map((decor) => ({
        image: String(decor?.image || '').trim().slice(0, 1200),
        show: decor?.show === '0' ? '0' : '1',
        position: String(decor?.position || 'inside-bottom-left').replace(/[^a-z-]/g, '').slice(0, 40) || 'inside-bottom-left',
        size: clampStringNumber(decor?.size, 20, 160) || '46',
        opacity: clampStringNumber(decor?.opacity, 0, 100) || '100',
      })).filter((decor) => decor.image);
      continue;
    }
    if (key === 'chatPosition') {
      config.chatPosition = VALID_CHAT_POSITIONS.has(rawValue) ? rawValue : 'bottom-left';
      continue;
    }
    if (key === 'animationStyle') {
      config.animationStyle = VALID_ANIMATIONS.has(rawValue) ? rawValue : 'pop';
      continue;
    }
    if (COLOR_CONFIG_FIELDS.has(key)) {
      const color = String(rawValue || '').trim();
      if (/^#[0-9a-f]{6}$/i.test(color)) config[key] = color;
      continue;
    }
    if (NUMBER_CONFIG_LIMITS[key]) {
      const [min, max] = NUMBER_CONFIG_LIMITS[key];
      const value = clampStringNumber(rawValue, min, max);
      if (value !== undefined) config[key] = value;
      continue;
    }
    config[key] = String(rawValue ?? '').trim().slice(0, 1200);
  }
  if (config.videoId && !/^[\w-]{11}$/.test(config.videoId)) return null;
  return config;
}

module.exports = {
  presetUrl, shortPresetUrl, sanitizePresetId, sanitizeSlug,
  normalizePresetName, normalizePresetConfig,
};
