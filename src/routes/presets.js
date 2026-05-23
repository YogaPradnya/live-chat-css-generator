const express = require('express');
const { nanoid } = require('nanoid');
const { db } = require('../db');
const {
  presetUrl, shortPresetUrl, sanitizePresetId, sanitizeSlug,
  normalizePresetName, normalizePresetConfig,
} = require('../validation');

const router = express.Router();

function presetResponse(row, slug) {
  const identifier = slug || row.slug || row.id;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    url: presetUrl(row.id),
    shortUrl: shortPresetUrl(identifier),
  };
}

router.get('/', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Turso belum dikonfigurasi.' });
  const result = await db.execute({ sql: 'SELECT id, slug, name, created_at, updated_at FROM overlay_presets ORDER BY updated_at DESC LIMIT 100', args: [] });
  res.json({ presets: result.rows.map((row) => presetResponse(row)) });
});

router.get('/:id', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Turso belum dikonfigurasi.' });
  const presetId = sanitizePresetId(req.params.id);
  if (!presetId) return res.status(400).json({ error: 'Preset ID tidak valid.' });
  const result = await db.execute({ sql: 'SELECT id, slug, name, config_json, created_at, updated_at FROM overlay_presets WHERE id = ?', args: [presetId] });
  const row = result.rows[0];
  if (!row) return res.status(404).json({ error: 'Preset tidak ditemukan.' });
  res.json({ ...presetResponse(row), config: JSON.parse(row.config_json) });
});

router.post('/', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Turso belum dikonfigurasi. Isi TURSO_DATABASE_URL dan TURSO_AUTH_TOKEN di .env.' });
  const id = nanoid(10);
  const name = normalizePresetName(req.body?.name);
  const config = normalizePresetConfig(req.body?.config);
  if (!config) return res.status(400).json({ error: 'Config preset tidak valid.' });
  const rawSlug = sanitizeSlug(req.body?.slug);
  let slug = null;
  if (rawSlug) {
    const existing = await db.execute({ sql: 'SELECT id FROM overlay_presets WHERE slug = ?', args: [rawSlug] });
    if (existing.rows[0]) return res.status(409).json({ error: `Slug "${rawSlug}" sudah dipakai. Pilih slug lain.` });
    slug = rawSlug;
  }
  let userId = sanitizePresetId(req.body?.userId || 'public') || 'public';
  if (userId === 'public') {
    await db.execute({ sql: 'INSERT OR IGNORE INTO users (id, username, display_name) VALUES (?, ?, ?)', args: ['public', 'public', 'Public'] });
  } else {
    const user = await db.execute({ sql: 'SELECT id FROM users WHERE id = ?', args: [userId] });
    if (!user.rows[0]) return res.status(404).json({ error: 'User ID tidak ditemukan. Login ulang.' });
  }
  await db.execute({
    sql: 'INSERT INTO overlay_presets (id, user_id, slug, name, config_json) VALUES (?, ?, ?, ?, ?)',
    args: [id, userId, slug, name, JSON.stringify(config)],
  });
  const identifier = slug || id;
  res.json({ id, name, slug, url: presetUrl(id), shortUrl: shortPresetUrl(identifier) });
});

router.put('/:id', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Turso belum dikonfigurasi.' });
  const presetId = sanitizePresetId(req.params.id);
  if (!presetId) return res.status(400).json({ error: 'Preset ID tidak valid.' });
  const config = normalizePresetConfig(req.body?.config);
  if (!config) return res.status(400).json({ error: 'Config preset tidak valid.' });
  const name = normalizePresetName(req.body?.name);
  const rawSlug = sanitizeSlug(req.body?.slug);
  let slug = null;
  if (rawSlug) {
    const existing = await db.execute({ sql: 'SELECT id FROM overlay_presets WHERE slug = ? AND id != ?', args: [rawSlug, presetId] });
    if (existing.rows[0]) return res.status(409).json({ error: `Slug "${rawSlug}" sudah dipakai.` });
    slug = rawSlug;
  }
  const result = await db.execute({
    sql: 'UPDATE overlay_presets SET name = ?, slug = ?, config_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    args: [name, slug, JSON.stringify(config), presetId],
  });
  if (!result.rowsAffected) return res.status(404).json({ error: 'Preset tidak ditemukan.' });
  const identifier = slug || presetId;
  res.json({ id: presetId, name, slug, url: presetUrl(presetId), shortUrl: shortPresetUrl(identifier) });
});

router.delete('/:id', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Turso belum dikonfigurasi.' });
  const presetId = sanitizePresetId(req.params.id);
  if (!presetId) return res.status(400).json({ error: 'Preset ID tidak valid.' });
  const result = await db.execute({ sql: 'DELETE FROM overlay_presets WHERE id = ?', args: [presetId] });
  if (!result.rowsAffected) return res.status(404).json({ error: 'Preset tidak ditemukan.' });
  res.json({ ok: true });
});

module.exports = router;
