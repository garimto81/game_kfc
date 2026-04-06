const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

let db;

function init(dbPath = './data/ofc.db') {
  const path = require('path');
  const dir = path.dirname(dbPath);
  const fs = require('fs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      provider    TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      name        TEXT NOT NULL,
      avatar_url  TEXT,
      created_at  INTEGER NOT NULL,
      last_login  INTEGER NOT NULL,
      UNIQUE(provider, provider_id)
    )
  `);
}

function upsertUser({ provider, providerId, name, avatarUrl }) {
  const now = Date.now();
  const existing = db.prepare(
    'SELECT * FROM users WHERE provider = ? AND provider_id = ?'
  ).get(provider, providerId);

  if (existing) {
    db.prepare(
      'UPDATE users SET name = ?, avatar_url = ?, last_login = ? WHERE id = ?'
    ).run(name, avatarUrl, now, existing.id);
    return { ...existing, name, avatar_url: avatarUrl, last_login: now };
  }

  const id = uuidv4();
  db.prepare(
    'INSERT INTO users (id, provider, provider_id, name, avatar_url, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, provider, providerId, name, avatarUrl, now, now);
  return { id, provider, provider_id: providerId, name, avatar_url: avatarUrl, created_at: now, last_login: now };
}

function findUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
}

function close() {
  if (db) db.close();
}

module.exports = { init, upsertUser, findUserById, close };
