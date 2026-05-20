require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { createClient } = require('@libsql/client');
const { nanoid } = require('nanoid');
const { Server } = require('socket.io');
const { actionToRenderer, parseData, usecToTime } = require('@freetube/youtube-chat/dist/parser');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;

const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const hasCloudinary = Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
const hasTurso = Boolean(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN);
const db = hasTurso ? createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN }) : null;

if (hasCloudinary) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

async function initDb() {
  if (!db) return;
  await db.execute(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS overlay_presets (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT NOT NULL DEFAULT 'Untitled Preset',
    config_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  try { await db.execute('ALTER TABLE overlay_presets ADD COLUMN user_id TEXT'); } catch (_) {}
  try { await db.execute('ALTER TABLE users ADD COLUMN username TEXT'); } catch (_) {}
  try { await db.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)'); } catch (_) {}
}
initDb().catch((error) => console.error('Turso init error:', error.message));

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (/^image\/(png|jpe?g|gif|webp|svg\+xml)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('File harus berupa gambar png, jpg, gif, webp, atau svg.'));
  },
});

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/users/check/:username', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Turso belum dikonfigurasi.' });
  const username = String(req.params.username || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 32);
  if (!username || username.length < 3) return res.status(400).json({ error: 'Username minimal 3 karakter.' });
  const found = await db.execute({ sql: 'SELECT username, display_name FROM users WHERE username = ?', args: [username] });
  res.json({ exists: Boolean(found.rows[0]), username, displayName: found.rows[0]?.display_name || '' });
});

app.post('/api/users/login', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Turso belum dikonfigurasi.' });
  const rawName = String(req.body?.username || req.body?.displayName || '').trim();
  const username = rawName.toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 32);
  if (!username || username.length < 3) return res.status(400).json({ error: 'Username minimal 3 karakter. Gunakan huruf/angka.' });
  const displayName = rawName.slice(0, 50) || username;
  const found = await db.execute({ sql: 'SELECT id, display_name, username FROM users WHERE username = ?', args: [username] });
  if (found.rows[0]) return res.json({ id: found.rows[0].id, username: found.rows[0].username, displayName: found.rows[0].display_name, created: false });
  if (!req.body?.create) return res.status(404).json({ error: 'Username belum ada.', needConfirm: true, username });
  const id = `usr_${nanoid(10)}`;
  await db.execute({ sql: 'INSERT INTO users (id, username, display_name) VALUES (?, ?, ?)', args: [id, username, displayName] });
  res.json({ id, username, displayName, created: true });
});

app.get('/api/users/:id/presets', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Turso belum dikonfigurasi.' });
  const isPublic = req.params.id === 'public';
  const result = await db.execute(isPublic
    ? { sql: 'SELECT id, name, created_at, updated_at FROM overlay_presets ORDER BY updated_at DESC LIMIT 100', args: [] }
    : { sql: 'SELECT id, name, created_at, updated_at FROM overlay_presets WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50', args: [req.params.id] });
  res.json({ presets: result.rows.map(row => ({ id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at, url: `/overlay.html?preset=${row.id}` })) });
});

app.post('/api/upload', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File gambar tidak ditemukan.' });
  if (!hasCloudinary) return res.json({ url: `/uploads/${req.file.filename}`, storage: 'local' });
  try {
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: process.env.CLOUDINARY_FOLDER || 'live-chat-generator',
      resource_type: 'image',
    });
    fs.unlink(req.file.path, () => {});
    res.json({ url: result.secure_url, publicId: result.public_id, storage: 'cloudinary' });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Upload Cloudinary gagal.' });
  }
});

app.post('/api/presets', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Turso belum dikonfigurasi. Isi TURSO_DATABASE_URL dan TURSO_AUTH_TOKEN di .env.' });
  const id = nanoid(10);
  const name = String(req.body?.name || 'Overlay Preset').slice(0, 80);
  const config = req.body?.config;
  if (!config || typeof config !== 'object') return res.status(400).json({ error: 'Config preset tidak valid.' });
  let userId = String(req.body?.userId || 'public').trim() || 'public';
  if (userId === 'public') {
    await db.execute({
      sql: 'INSERT OR IGNORE INTO users (id, username, display_name) VALUES (?, ?, ?)',
      args: ['public', 'public', 'Public'],
    });
  } else {
    const user = await db.execute({ sql: 'SELECT id FROM users WHERE id = ?', args: [userId] });
    if (!user.rows[0]) return res.status(404).json({ error: 'User ID tidak ditemukan. Login ulang.' });
  }
  await db.execute({
    sql: 'INSERT INTO overlay_presets (id, user_id, name, config_json) VALUES (?, ?, ?, ?)',
    args: [id, userId, name, JSON.stringify(config)],
  });
  res.json({ id, name, url: `/overlay.html?preset=${id}` });
});

app.get('/api/presets/:id', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Turso belum dikonfigurasi.' });
  const result = await db.execute({ sql: 'SELECT id, name, config_json, created_at, updated_at FROM overlay_presets WHERE id = ?', args: [req.params.id] });
  const row = result.rows[0];
  if (!row) return res.status(404).json({ error: 'Preset tidak ditemukan.' });
  res.json({ id: row.id, name: row.name, config: JSON.parse(row.config_json), createdAt: row.created_at, updatedAt: row.updated_at });
});

app.put('/api/presets/:id', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Turso belum dikonfigurasi.' });
  const config = req.body?.config;
  if (!config || typeof config !== 'object') return res.status(400).json({ error: 'Config preset tidak valid.' });
  const name = String(req.body?.name || 'Overlay Preset').slice(0, 80);
  const result = await db.execute({
    sql: 'UPDATE overlay_presets SET name = ?, config_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    args: [name, JSON.stringify(config), req.params.id],
  });
  if (!result.rowsAffected) return res.status(404).json({ error: 'Preset tidak ditemukan.' });
  res.json({ id: req.params.id, name, url: `/overlay.html?preset=${req.params.id}` });
});

const rooms = new Map();

function normalizeVideoId(input = '') {
  const value = String(input).trim();
  if (!value) return '';
  if (/^[\w-]{11}$/.test(value)) return value;
  const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(normalized);
    const byQuery = url.searchParams.get('v') || url.searchParams.get('video_id');
    if (byQuery) return byQuery;
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.hostname.includes('youtu.be')) return parts[0] || '';
    if (parts[0] === 'live' && parts[1]) return parts[1];
    return parts.pop() || '';
  } catch {
    return value;
  }
}
function roleOf(comment) {
  const label = comment?.author?.badge?.label?.toLowerCase?.() || '';
  if (comment?.isOwner) return 'owner';
  if (label.includes('moderator')) return 'moderator';
  if (comment?.membership || label.includes('member')) return 'member';
  return 'user';
}
function textFromMessage(message = []) { return message.map((part) => part.text || part.alt || '').join(''); }
function htmlParts(message = []) {
  return message.map((part) => part.url ? { type: 'image', url: part.url, alt: part.alt || 'emoji', width: part.width || 24, height: part.height || 24 } : { type: 'text', text: part.text || '' });
}
function toPayload(comment) {
  const thumbs = comment?.author?.thumbnail;
  return {
    id: comment.id || `${comment.timestamp}-${comment.author?.channelId}`,
    author: comment.author?.name || 'Unknown',
    authorChannelId: comment.author?.channelId || '',
    avatar: thumbs?.url || '',
    role: roleOf(comment),
    text: textFromMessage(comment.message),
    parts: htmlParts(comment.message),
    timestamp: comment.timestamp || Date.now(),
    membership: Boolean(comment.membership),
    superchat: comment.superchat || null,
  };
}
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
];
let uaIndex = 0;
function getYoutubeHeaders() {
  uaIndex = (uaIndex + 1) % USER_AGENTS.length;
  return {
    'user-agent': USER_AGENTS[uaIndex],
    'accept-language': 'en-US,en;q=0.9,id;q=0.8',
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'cache-control': 'no-cache',
  };
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function extractFirst(html, patterns) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1].replace(/\\u0026/g, '&');
  }
  return '';
}

function extractChatContinuation(html) {
  return extractFirst(html, [
    /"continuation"\s*:\s*"([^"]+)"\s*,\s*"clickTrackingParams"\s*:\s*"[^"]+"\s*,\s*"playerSeekContinuationData"/,
    /"liveChatRenderer"[\s\S]*?"continuation"\s*:\s*"([^"]+)"/,
    /"reloadContinuationData"\s*:\s*\{\s*"continuation"\s*:\s*"([^"]+)"/,
    /"invalidationContinuationData"\s*:\s*\{\s*"continuation"\s*:\s*"([^"]+)"/,
    /"continuation"\s*:\s*"([^"]+)"/,
  ]);
}

async function fetchYoutubeHtml(videoId, retries = 4) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const headers = getYoutubeHeaders();
    try {
      const response = await fetch(
        `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&bpctr=9999999999&has_verified=1`,
        { headers }
      );
      if (response.status === 429) {
        const waitMs = Math.min(2000 * Math.pow(2, attempt), 30000);
        console.warn(`[YouTube] 429 rate limited (attempt ${attempt}/${retries}), retry in ${waitMs}ms...`);
        if (attempt < retries) { await sleep(waitMs); continue; }
        throw new Error('YouTube membatasi request server (429). Coba lagi dalam beberapa menit.');
      }
      if (!response.ok) throw new Error(`YouTube request gagal (${response.status}).`);
      return response.text();
    } catch (err) {
      if (attempt >= retries) throw err;
      const waitMs = 1500 * attempt;
      console.warn(`[YouTube] Fetch error attempt ${attempt}: ${err.message}, retry in ${waitMs}ms`);
      await sleep(waitMs);
    }
  }
}

async function createLiveChatSession(videoId) {
  const html = await fetchYoutubeHtml(videoId);
  const key = extractFirst(html, [/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/]);
  const clientName = extractFirst(html, [/"clientName"\s*:\s*"([^"]+)"/]) || 'WEB';
  const clientVersion = extractFirst(html, [/"clientVersion"\s*:\s*"([^"]+)"/]);
  const continuation = extractChatContinuation(html);

  if (!key || !clientVersion) throw new Error('YouTube config tidak ditemukan. Coba refresh atau cek apakah YouTube memblokir request server.');
  if (!continuation) {
    if (/LIVE_STREAM_OFFLINE/.test(html)) throw new Error('Live chat belum tersedia / stream terdeteksi offline oleh YouTube.');
    throw new Error('Continuation live chat tidak ditemukan. Chat mungkin disabled, member-only, age restricted, atau YouTube mengubah format halaman.');
  }

  return { key, clientName, clientVersion, continuation, prevTime: Date.now() };
}

async function fetchLiveChat(room) {
  const session = room.session;
  const response = await fetch(`https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?key=${encodeURIComponent(session.key)}`, {
    method: 'POST',
    headers: { ...getYoutubeHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify({
      context: { client: { clientName: session.clientName, clientVersion: session.clientVersion } },
      continuation: session.continuation,
    }),
  });
  if (response.status === 429) {
    console.warn(`[YouTube] Polling 429 untuk ${room.videoId}, tunggu 15 detik lalu reconnect...`);
    await sleep(15000);
    // Reconnect session
    const newSession = await createLiveChatSession(room.videoId);
    room.session = newSession;
    return 2000;
  }
  if (!response.ok) throw new Error(`Polling chat gagal (${response.status}).`);
  const data = await response.json();
  if (data.continuationContents?.messageRenderer) {
    throw new Error(data.continuationContents.messageRenderer.text?.runs?.map(r => r.text).join('') || 'Live stream selesai.');
  }
  const live = data.continuationContents?.liveChatContinuation;
  if (!live) throw new Error('Response live chat tidak valid.');

  const next = live.continuations?.[0];
  session.continuation = next?.invalidationContinuationData?.continuation
    || next?.timedContinuationData?.continuation
    || next?.reloadContinuationData?.continuation
    || session.continuation;

  const items = (live.actions || [])
    .filter((action) => {
      const renderer = actionToRenderer(action);
      return renderer && usecToTime(renderer.timestampUsec) > session.prevTime;
    })
    .map((action) => parseData(action))
    .filter(Boolean);

  items.forEach((item) => io.to(room.videoId).emit('chat', toPayload(item)));
  if (items.length) session.prevTime = items[items.length - 1].timestamp;
  return next?.timedContinuationData?.timeoutMs || next?.invalidationContinuationData?.timeoutMs || 1000;
}

function scheduleRoomPoll(room, delay = 1000) {
  room.pollTimer = setTimeout(async () => {
    if (!rooms.has(room.videoId)) return; // room sudah di-stop
    try {
      const nextDelay = await fetchLiveChat(room);
      scheduleRoomPoll(room, Math.max(1000, Number(nextDelay) || 1000));
    } catch (error) {
      const msg = error?.message || String(error);
      // Coba auto-reconnect untuk error jaringan, bukan error permanen
      const isRetryable = /fetch|network|econnreset|etimedout|socket/i.test(msg);
      if (isRetryable && room.retryCount < 5) {
        room.retryCount = (room.retryCount || 0) + 1;
        const backoff = Math.min(3000 * room.retryCount, 20000);
        console.warn(`[Room ${room.videoId}] Error retryable, reconnect ke-${room.retryCount} dalam ${backoff}ms: ${msg}`);
        io.to(room.videoId).emit('status', { status: 'reconnecting', message: `Reconnecting... (${room.retryCount}/5)` });
        scheduleRoomPoll(room, backoff);
      } else {
        room.status = 'error';
        room.lastError = msg;
        io.to(room.videoId).emit('status', { status: 'error', message: room.lastError });
      }
    }
  }, delay);
}

function startRoom(videoId) {
  if (rooms.has(videoId)) return rooms.get(videoId);
  const room = { videoId, clients: 0, session: null, status: 'starting', lastError: '', cleanupTimer: null, pollTimer: null };
  rooms.set(videoId, room);
  createLiveChatSession(videoId)
    .then((session) => {
      room.session = session;
      room.status = 'connected';
      room.lastError = '';
      io.to(videoId).emit('status', { status: 'connected', videoId });
      scheduleRoomPoll(room, 300);
    })
    .catch((error) => {
      room.status = 'error';
      room.lastError = error?.message || String(error);
      io.to(videoId).emit('status', { status: 'error', message: room.lastError });
    });
  return room;
}
function stopRoom(videoId) {
  const room = rooms.get(videoId);
  if (!room) return;
  if (room.pollTimer) clearTimeout(room.pollTimer);
  rooms.delete(videoId);
}
io.on('connection', (socket) => {
  socket.on('join', ({ videoId }) => {
    const id = normalizeVideoId(videoId);
    if (!id) { socket.emit('status', { status: 'error', message: 'Video ID tidak valid.' }); return; }
    socket.join(id);
    const room = startRoom(id);
    room.clients += 1;
    if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
    socket.data.videoId = id;
    socket.emit('status', { status: room.status, videoId: id, message: room.lastError });
  });
  socket.on('disconnect', () => {
    const id = socket.data.videoId;
    if (!id || !rooms.has(id)) return;
    const room = rooms.get(id);
    room.clients = Math.max(0, room.clients - 1);
    if (room.clients === 0) room.cleanupTimer = setTimeout(() => stopRoom(id), 30000);
  });
});
app.get('/health', (_, res) => res.json({ ok: true, rooms: rooms.size, turso: hasTurso, cloudinary: hasCloudinary }));
server.listen(PORT, () => { console.log(`Live Chat Generator running on http://localhost:${PORT}`); });
