const assert = require('assert');
const path = require('path');
const fs = require('fs');
const express = require('express');

// ── Database Tests ──

describe('Database', () => {
  let db;
  const testDbPath = path.join(__dirname, 'test-auth.db');

  before(() => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    db = require('../db/database');
    db.init(testDbPath);
  });

  after(() => {
    db.close();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  it('should upsert a new user', () => {
    const user = db.upsertUser({
      provider: 'google',
      providerId: 'g-123',
      name: 'TestUser',
      avatarUrl: 'https://example.com/avatar.jpg',
    });
    assert.ok(user.id);
    assert.strictEqual(user.provider, 'google');
    assert.strictEqual(user.name, 'TestUser');
  });

  it('should return same user on duplicate upsert', () => {
    const user1 = db.upsertUser({ provider: 'google', providerId: 'g-123', name: 'Updated', avatarUrl: null });
    const user2 = db.upsertUser({ provider: 'google', providerId: 'g-123', name: 'Updated2', avatarUrl: null });
    assert.strictEqual(user1.id, user2.id);
    assert.strictEqual(user2.name, 'Updated2');
  });

  it('should find user by id', () => {
    const user = db.upsertUser({ provider: 'kakao', providerId: 'k-456', name: 'KakaoUser', avatarUrl: null });
    const found = db.findUserById(user.id);
    assert.strictEqual(found.name, 'KakaoUser');
  });

  it('should return null for unknown user', () => {
    assert.strictEqual(db.findUserById('nonexistent'), null);
  });
});

// ── JWT Tests ──

describe('JWT', () => {
  const jwt = require('../auth/jwt');

  before(() => {
    jwt.init('test-secret-key-256bit-minimum-len!');
  });

  it('should sign and verify a token', () => {
    const token = jwt.sign({ userId: 'u-123', name: 'Test' });
    const payload = jwt.verify(token);
    assert.strictEqual(payload.userId, 'u-123');
    assert.strictEqual(payload.name, 'Test');
  });

  it('should reject invalid token', () => {
    assert.strictEqual(jwt.verify('invalid.token.here'), null);
  });

  it('should reject expired token', () => {
    const token = jwt.sign({ userId: 'u-123' }, '0s');
    assert.strictEqual(jwt.verify(token), null);
  });
});

// ── Auth Router Tests ──

describe('Auth Router', () => {
  let app, server, baseUrl;
  const routerDbPath = path.join(__dirname, 'test-router.db');

  before((done) => {
    if (fs.existsSync(routerDbPath)) fs.unlinkSync(routerDbPath);
    // Re-init DB for router tests (separate DB file)
    const dbMod = require('../db/database');
    dbMod.close();
    dbMod.init(routerDbPath);

    const jwtMod = require('../auth/jwt');
    jwtMod.init('test-secret-key-256bit-minimum-len!');

    const authRouter = require('../auth/auth-router');

    app = express();
    app.use(express.json());
    app.use('/auth', authRouter);

    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      done();
    });
  });

  after((done) => {
    server.close(() => {
      const dbMod = require('../db/database');
      dbMod.close();
      if (fs.existsSync(routerDbPath)) fs.unlinkSync(routerDbPath);
      done();
    });
  });

  it('should reject missing provider', async () => {
    const res = await fetch(`${baseUrl}/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'abc' }),
    });
    assert.strictEqual(res.status, 400);
  });

  it('should reject missing token', async () => {
    const res = await fetch(`${baseUrl}/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'google' }),
    });
    assert.strictEqual(res.status, 400);
  });

  it('should accept guest login', async () => {
    const res = await fetch(`${baseUrl}/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'guest', token: 'ignored', name: 'GuestPlayer' }),
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(body.jwt);
    assert.strictEqual(body.user.name, 'GuestPlayer');
    assert.strictEqual(body.user.provider, 'guest');
  });

  it('should reject unsupported provider', async () => {
    const res = await fetch(`${baseUrl}/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'facebook', token: 'abc' }),
    });
    assert.strictEqual(res.status, 400);
  });
});
