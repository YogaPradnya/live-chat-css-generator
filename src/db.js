const { createClient } = require('@libsql/client');

const hasTurso = Boolean(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN);
const db = hasTurso ? createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN }) : null;

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
    slug TEXT,
    name TEXT NOT NULL DEFAULT 'Untitled Preset',
    config_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  try { await db.execute('ALTER TABLE overlay_presets ADD COLUMN user_id TEXT'); } catch (_) {}
  try { await db.execute('ALTER TABLE overlay_presets ADD COLUMN slug TEXT'); } catch (_) {}
  try { await db.execute('ALTER TABLE users ADD COLUMN username TEXT'); } catch (_) {}
  try { await db.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)'); } catch (_) {}
  try { await db.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_presets_slug ON overlay_presets(slug)'); } catch (_) {}
}

module.exports = { db, hasTurso, initDb };
