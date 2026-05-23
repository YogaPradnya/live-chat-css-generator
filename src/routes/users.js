const express = require('express');
const { nanoid } = require('nanoid');
const { db } = require('../db');
const { sanitizePresetId, presetUrl, shortPresetUrl } = require('../validation');

const router = express.Router();

router.get('/check/:username', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Turso belum dikonfigurasi.' });
  const username = String(req.params.username || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 32);
  if (!username || username.length < 3) return res.status(400).json({ error: 'Username minimal 3 karakter.' });
  const found = await db.execute({ sql: 'SELECT username, display_name FROM users WHERE username = ?', args: [username] });
  res.json({ exists: Boolean(found.rows[0]), username, displayName: found.rows[0]?.display_name || '' });
});

router.post('/login', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Turso belum dikonfigurasi.' });
  const rawName = String(req.body?.username || req.body?.displayName || '').trim();
  const username = rawName.toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 32);
  if (!username || username.length < 3) return res.status(400).json({ error: 'Username minimal 3 karakter.' });
  const displayName = rawName.slice(0, 50) || username;
  const found = await db.execute({ sql: 'SELECT id, display_name, username FROM users WHERE username = ?', args: [username] });
  if (found.rows[0]) return res.json({ id: found.rows[0].id, username: found.rows[0].username, displayName: found.rows[0].display_name, created: false });
  if (!req.body?.create) return res.status(404).json({ error: 'Username belum ada.', needConfirm: true, username });
  const id = `usr_${nanoid(10)}`;
  await db.execute({ sql: 'INSERT INTO users (id, username, display_name) VALUES (?, ?, ?)', args: [id, username, displayName] });
  res.json({ id, username, displayName, created: true });
});

router.get('/:id/presets', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Turso belum dikonfigurasi.' });
  const userId = sanitizePresetId(req.params.id);
  if (!userId) return res.status(400).json({ error: 'User ID tidak valid.' });
  const isPublic = userId === 'public';
  const result = await db.execute(isPublic
    ? { sql: 'SELECT id, slug, name, created_at, updated_at FROM overlay_presets ORDER BY updated_at DESC LIMIT 100', args: [] }
    : { sql: 'SELECT id, slug, name, created_at, updated_at FROM overlay_presets WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50', args: [userId] });
  res.json({
    presets: result.rows.map(row => ({
      id: row.id, name: row.name, slug: row.slug || null,
      createdAt: row.created_at, updatedAt: row.updated_at,
      url: presetUrl(row.id), shortUrl: shortPresetUrl(row.slug || row.id),
    })),
  });
});

module.exports = router;
