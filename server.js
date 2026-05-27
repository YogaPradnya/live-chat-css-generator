require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { actionToRenderer, parseData, usecToTime } = require('@freetube/youtube-chat/dist/parser');

const { db, hasTurso, initDb } = require('./src/db');
const { hasCloudinary, router: uploadRouter } = require('./src/routes/upload');
const presetsRouter = require('./src/routes/presets');
const usersRouter = require('./src/routes/users');
const { sanitizePresetId, presetUrl } = require('./src/validation');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;

initDb().catch((error) => console.error('Turso init error:', error.message));

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/users', usersRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/presets', presetsRouter);

app.get('/o/:idOrSlug', async (req, res) => {
  const raw = String(req.params.idOrSlug || '').trim().slice(0, 40);
  if (!raw) return res.status(400).send('ID tidak valid.');
  if (db) {
    const bySlug = await db.execute({ sql: 'SELECT id FROM overlay_presets WHERE slug = ?', args: [raw] });
    if (bySlug.rows[0]) return res.redirect(302, presetUrl(bySlug.rows[0].id));
  }
  const presetId = sanitizePresetId(raw);
  if (!presetId) return res.status(400).send('Preset ID tidak valid.');
  res.redirect(302, presetUrl(presetId));
});

// YouTube live chat
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
const crypto = require('crypto');
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 Edg/136.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
];
let uaIndex = 0;
function pickUserAgent() {
  uaIndex = (uaIndex + 1) % USER_AGENTS.length;
  return USER_AGENTS[uaIndex];
}

function getSapisidHash(sapisid, origin = 'https://www.youtube.com') {
  const now = Math.floor(Date.now() / 1000);
  const input = `${now} ${sapisid} ${origin}`;
  const hash = crypto.createHash('sha1').update(input).digest('hex');
  return `SAPISIDHASH ${now}_${hash}`;
}

function extractSapisid(cookieStr) {
  if (!cookieStr) return '';
  const match = cookieStr.match(/(?:^|;\s*)SAPISID=([^;]+)/);
  if (match) return match[1];
  const match3p = cookieStr.match(/(?:^|;\s*)__Secure-3PAPISID=([^;]+)/);
  return match3p ? match3p[1] : '';
}

function getPageHeaders(ua) {
  const headers = {
    'user-agent': ua,
    'accept-language': 'en-US,en;q=0.9,id;q=0.8',
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'cache-control': 'no-cache',
    'sec-ch-ua': '"Chromium";v="137", "Not/A)Brand";v="24", "Google Chrome";v="137"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
    'sec-fetch-user': '?1',
    'upgrade-insecure-requests': '1',
  };
  if (process.env.YOUTUBE_COOKIE) headers['cookie'] = process.env.YOUTUBE_COOKIE;
  return headers;
}

function getApiHeaders(session) {
  const headers = {
    'user-agent': session.userAgent,
    'accept': '*/*',
    'accept-language': 'en-US,en;q=0.9,id;q=0.8',
    'content-type': 'application/json',
    'origin': 'https://www.youtube.com',
    'referer': `https://www.youtube.com/live_chat?v=${session.videoId}`,
    'x-youtube-client-name': '1',
    'x-youtube-client-version': session.clientVersion,
    'sec-ch-ua': '"Chromium";v="137", "Not/A)Brand";v="24", "Google Chrome";v="137"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'same-origin',
    'sec-fetch-site': 'same-origin',
  };
  if (session.visitorData) headers['x-goog-visitor-id'] = session.visitorData;
  if (process.env.YOUTUBE_COOKIE) {
    headers['cookie'] = process.env.YOUTUBE_COOKIE;
    const sapisid = extractSapisid(process.env.YOUTUBE_COOKIE);
    if (sapisid) headers['authorization'] = getSapisidHash(sapisid);
  }
  return headers;
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

async function fetchYoutubeHtml(videoId, ua, retries = 4) {
  const headers = getPageHeaders(ua);
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`https://www.youtube.com/live_chat?v=${encodeURIComponent(videoId)}`, { headers });
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

async function createLiveChatSession(videoId, existingUa) {
  const ua = existingUa || pickUserAgent();
  const html = await fetchYoutubeHtml(videoId, ua);
  const key = extractFirst(html, [/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/]);
  const clientName = extractFirst(html, [/"clientName"\s*:\s*"([^"]+)"/]) || 'WEB';
  const clientVersion = extractFirst(html, [/"clientVersion"\s*:\s*"([^"]+)"/]);
  const visitorData = extractFirst(html, [/"visitorData"\s*:\s*"([^"]+)"/]);
  const continuation = extractChatContinuation(html);
  if (!key || !clientVersion) throw new Error('YouTube config tidak ditemukan.');
  if (!continuation) {
    if (/LIVE_STREAM_OFFLINE/.test(html)) throw new Error('Live chat belum tersedia / stream offline.');
    throw new Error('Continuation live chat tidak ditemukan.');
  }
  return { key, clientName, clientVersion, visitorData, continuation, userAgent: ua, videoId, prevTime: 0 };
}

async function fetchLiveChat(room) {
  const session = room.session;
  const headers = getApiHeaders(session);
  const body = {
    context: {
      client: {
        clientName: session.clientName,
        clientVersion: session.clientVersion,
        ...(session.visitorData ? { visitorData: session.visitorData } : {}),
      },
    },
    continuation: session.continuation,
  };
  const response = await fetch(`https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?key=${encodeURIComponent(session.key)}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (response.status === 429) {
    console.warn(`[YouTube] Polling 429 untuk ${room.videoId}, tunggu 15 detik...`);
    await sleep(15000);
    room.session = await createLiveChatSession(room.videoId, session.userAgent);
    return 2000;
  }
  if (response.status === 503) {
    console.warn(`[YouTube] Polling 503 untuk ${room.videoId}, tunggu 8 detik lalu refresh session...`);
    await sleep(8000);
    room.session = await createLiveChatSession(room.videoId, session.userAgent);
    return 3000;
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
    .filter((action) => { const r = actionToRenderer(action); return r && usecToTime(r.timestampUsec) > session.prevTime; })
    .map((action) => parseData(action)).filter(Boolean);
  const payloads = items.map(toPayload);
  payloads.forEach((p) => {
    if (!room.chatBuffer) room.chatBuffer = [];
    room.chatBuffer.push(p);
    if (room.chatBuffer.length > 50) room.chatBuffer.shift();
    io.to(room.videoId).emit('chat', p);
  });
  if (items.length) session.prevTime = items[items.length - 1].timestamp;
  return next?.timedContinuationData?.timeoutMs || next?.invalidationContinuationData?.timeoutMs || 1000;
}

function scheduleRoomPoll(room, delay = 1000) {
  room.pollTimer = setTimeout(async () => {
    if (!rooms.has(room.videoId)) return;
    try {
      const nextDelay = await fetchLiveChat(room);
      scheduleRoomPoll(room, Math.max(1000, Number(nextDelay) || 1000));
    } catch (error) {
      const msg = error?.message || String(error);
      const isRetryable = /fetch|network|econnreset|etimedout|socket|503|502|service unavailable/i.test(msg);
      if (isRetryable && room.retryCount < 5) {
        room.retryCount = (room.retryCount || 0) + 1;
        const backoff = Math.min(3000 * room.retryCount, 20000);
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
  const room = { videoId, clients: 0, session: null, status: 'starting', lastError: '', cleanupTimer: null, pollTimer: null, chatBuffer: [] };
  rooms.set(videoId, room);
  createLiveChatSession(videoId)
    .then((session) => {
      room.session = session; room.status = 'connected'; room.lastError = '';
      io.to(videoId).emit('status', { status: 'connected', videoId });
      scheduleRoomPoll(room, 300);
    })
    .catch((error) => {
      room.status = 'error'; room.lastError = error?.message || String(error);
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
    if (room.chatBuffer && room.chatBuffer.length) {
      socket.emit('history', room.chatBuffer);
    }
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
