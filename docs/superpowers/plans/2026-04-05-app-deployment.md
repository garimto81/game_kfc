# App Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** OAuth 인증 + 비밀번호 방 + Android APK 빌드로 앱 배포 준비 완료

**Architecture:** Express 서버에 JWT 인증 + SQLite 추가. Flutter 클라이언트에 로그인 화면 + 방 비밀번호 UI 추가. 기존 WebSocket/Room 구조는 최대한 유지.

**Tech Stack:** Node.js (better-sqlite3, jsonwebtoken, google-auth-library), Flutter (google_sign_in, kakao_flutter_sdk, flutter_secure_storage)

**Spec:** `docs/superpowers/specs/2026-04-05-app-deployment-design.md`

---

## File Map

### 서버 — 새 파일
| 파일 | 역할 |
|------|------|
| `server/db/database.js` | SQLite 초기화 + users CRUD |
| `server/auth/jwt.js` | JWT 발급/검증 유틸 |
| `server/auth/auth-router.js` | POST /auth/verify 라우터 |
| `server/test/auth.test.js` | 인증 + 방 비밀번호 테스트 |

### 서버 — 수정 파일
| 파일 | 변경 |
|------|------|
| `server/package.json` | 의존성 추가 |
| `server/index.js` | auth-router 마운트, 방 비밀번호 로직, WS JWT 검증 |
| `server/game/room.js` | password 필드, toRoomInfo에 hasPassword |

### 클라이언트 — 새 파일
| 파일 | 역할 |
|------|------|
| `lib/config/app_config.dart` | API URL dart-define 래퍼 |
| `lib/services/auth_service.dart` | Google/Kakao SDK + /auth/verify |
| `lib/providers/auth_provider.dart` | 인증 상태 Riverpod |
| `lib/ui/screens/login_screen.dart` | 로그인 화면 |
| `lib/ui/widgets/password_dialog.dart` | 방 비밀번호 입력 다이얼로그 |

### 클라이언트 — 수정 파일
| 파일 | 변경 |
|------|------|
| `pubspec.yaml` | 패키지 추가 |
| `lib/network/online_client.dart` | API URL config 사용, WS JWT query param |
| `lib/ui/screens/home_screen.dart` | 로그인 상태 연동, 방 비밀번호 UI |
| `lib/main.dart` | LoginScreen 라우트 추가 |

### 배포
| 파일 | 변경 |
|------|------|
| `.env.example` | OAuth + JWT 환경 변수 추가 |
| `docker-compose.prod.yml` | sqlite-data volume, env 변수 |
| `server/Dockerfile` | better-sqlite3 빌드 의존성 |

---

## Task 1: 서버 의존성 설치

**Files:**
- Modify: `server/package.json`

- [ ] **Step 1: 패키지 추가**

```bash
cd server && npm install better-sqlite3 jsonwebtoken google-auth-library express-rate-limit
```

- [ ] **Step 2: 설치 확인**

Run: `cd server && node -e "require('better-sqlite3'); require('jsonwebtoken'); console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add server/package.json server/package-lock.json
git commit -m "chore: add auth dependencies (better-sqlite3, jsonwebtoken, google-auth-library)"
```

---

## Task 2: SQLite 데이터베이스 모듈

**Files:**
- Create: `server/db/database.js`
- Test: `server/test/auth.test.js`

- [ ] **Step 1: 테스트 작성**

```javascript
// server/test/auth.test.js
const assert = require('assert');
const path = require('path');
const fs = require('fs');

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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd server && npx mocha test/auth.test.js --timeout 5000`
Expected: FAIL (module not found)

- [ ] **Step 3: database.js 구현**

```javascript
// server/db/database.js
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd server && npx mocha test/auth.test.js --timeout 5000`
Expected: 4 passing

- [ ] **Step 5: Commit**

```bash
git add server/db/database.js server/test/auth.test.js
git commit -m "feat: SQLite database module with users CRUD"
```

---

## Task 3: JWT 유틸

**Files:**
- Create: `server/auth/jwt.js`
- Modify: `server/test/auth.test.js`

- [ ] **Step 1: 테스트 추가**

`server/test/auth.test.js`에 추가:

```javascript
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
    // 즉시 만료
    assert.strictEqual(jwt.verify(token), null);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd server && npx mocha test/auth.test.js --timeout 5000`
Expected: JWT tests FAIL

- [ ] **Step 3: jwt.js 구현**

```javascript
// server/auth/jwt.js
const jsonwebtoken = require('jsonwebtoken');

let secret;

function init(jwtSecret) {
  secret = jwtSecret;
}

function sign(payload, expiresIn = '7d') {
  return jsonwebtoken.sign(payload, secret, { expiresIn });
}

function verify(token) {
  try {
    return jsonwebtoken.verify(token, secret);
  } catch {
    return null;
  }
}

module.exports = { init, sign, verify };
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd server && npx mocha test/auth.test.js --timeout 5000`
Expected: 7 passing

- [ ] **Step 5: Commit**

```bash
git add server/auth/jwt.js server/test/auth.test.js
git commit -m "feat: JWT sign/verify utility"
```

---

## Task 4: Auth Router (/auth/verify)

**Files:**
- Create: `server/auth/auth-router.js`
- Modify: `server/index.js:14-16` (미들웨어 마운트)
- Modify: `server/test/auth.test.js`

- [ ] **Step 1: 테스트 추가**

`server/test/auth.test.js`에 추가:

```javascript
const http = require('http');
const express = require('express');

describe('Auth Router', () => {
  let app, server, baseUrl;

  before((done) => {
    const dbMod = require('../db/database');
    const jwtMod = require('../auth/jwt');
    const authRouter = require('../auth/auth-router');
    
    dbMod.init(path.join(__dirname, 'test-router.db'));
    jwtMod.init('test-secret-key-256bit-minimum-len!');
    
    app = express();
    app.use(express.json());
    app.use('/auth', authRouter);
    
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      done();
    });
  });

  after((done) => {
    server.close(done);
    const testDb = path.join(__dirname, 'test-router.db');
    if (fs.existsSync(testDb)) fs.unlinkSync(testDb);
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
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd server && npx mocha test/auth.test.js --timeout 5000`
Expected: Auth Router tests FAIL

- [ ] **Step 3: auth-router.js 구현**

```javascript
// server/auth/auth-router.js
const { Router } = require('express');
const { OAuth2Client } = require('google-auth-library');
const db = require('../db/database');
const jwt = require('./jwt');

const router = Router();

// Google OAuth id_token 검증
async function verifyGoogle(idToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID not configured');
  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({ idToken, audience: clientId });
  const payload = ticket.getPayload();
  return { providerId: payload.sub, name: payload.name || 'Google User', avatarUrl: payload.picture || null };
}

// Kakao id_token 검증 (REST API)
async function verifyKakao(accessToken) {
  const res = await fetch('https://kapi.kakao.com/v2/user/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Kakao token invalid');
  const data = await res.json();
  const profile = data.kakao_account?.profile || {};
  return { providerId: String(data.id), name: profile.nickname || 'Kakao User', avatarUrl: profile.profile_image_url || null };
}

// POST /auth/verify
router.post('/verify', async (req, res) => {
  const { provider, token, name } = req.body;
  if (!provider || !token) {
    return res.status(400).json({ error: 'provider and token required' });
  }

  try {
    let providerData;

    if (provider === 'guest') {
      const guestName = (name || 'Guest').slice(0, 20);
      const guestId = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      providerData = { providerId: guestId, name: guestName, avatarUrl: null };
    } else if (provider === 'google') {
      providerData = await verifyGoogle(token);
    } else if (provider === 'kakao') {
      providerData = await verifyKakao(token);
    } else {
      return res.status(400).json({ error: 'unsupported provider' });
    }

    const user = db.upsertUser({
      provider,
      providerId: providerData.providerId,
      name: providerData.name,
      avatarUrl: providerData.avatarUrl,
    });

    const jwtToken = jwt.sign({ userId: user.id, name: user.name, provider });
    res.json({ jwt: jwtToken, user: { id: user.id, name: user.name, provider, avatarUrl: user.avatar_url } });
  } catch (err) {
    console.error('[AUTH] verify error:', err.message);
    res.status(401).json({ error: 'token verification failed' });
  }
});

module.exports = router;
```

- [ ] **Step 4: index.js에 마운트**

`server/index.js` line 16 (`app.use(express.json());`) 뒤에 추가:

```javascript
// Auth
const db = require('./db/database');
const jwtUtil = require('./auth/jwt');
const authRouter = require('./auth/auth-router');
const rateLimit = require('express-rate-limit');

db.init(process.env.DB_PATH || './data/ofc.db');
jwtUtil.init(process.env.JWT_SECRET || 'dev-secret-change-in-production');

app.use('/auth', rateLimit({ windowMs: 60000, max: 10 }), authRouter);
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd server && npx mocha test/auth.test.js --timeout 5000`
Expected: 10 passing

- [ ] **Step 6: Commit**

```bash
git add server/auth/auth-router.js server/index.js server/test/auth.test.js
git commit -m "feat: POST /auth/verify endpoint with Google/Kakao/Guest support"
```

---

## Task 5: 방 비밀번호 — 서버

**Files:**
- Modify: `server/game/room.js:22-59` (constructor), `server/game/room.js:64-74` (toRoomInfo), `server/game/room.js:83-128` (addPlayer)
- Modify: `server/index.js:82-121` (POST /api/rooms, POST /api/quickmatch)
- Modify: `server/test/auth.test.js`

- [ ] **Step 1: 테스트 추가**

`server/test/auth.test.js`에 추가:

```javascript
describe('Room Password', () => {
  const Room = require('../game/room');

  it('should create room with password', () => {
    const room = new Room({ name: 'Private', maxPlayers: 2, turnTimeLimit: 60, password: '1234' });
    assert.strictEqual(room.password, '1234');
  });

  it('should create room without password', () => {
    const room = new Room({ name: 'Public', maxPlayers: 2 });
    assert.strictEqual(room.password, '');
  });

  it('toRoomInfo should include hasPassword but not password', () => {
    const room = new Room({ name: 'Private', password: '1234' });
    const info = room.toRoomInfo();
    assert.strictEqual(info.hasPassword, true);
    assert.strictEqual(info.password, undefined);
  });

  it('toRoomInfo should show hasPassword false for public room', () => {
    const room = new Room({ name: 'Public' });
    const info = room.toRoomInfo();
    assert.strictEqual(info.hasPassword, false);
  });

  it('checkPassword should validate correctly', () => {
    const room = new Room({ name: 'Private', password: '1234' });
    assert.strictEqual(room.checkPassword('1234'), true);
    assert.strictEqual(room.checkPassword('wrong'), false);
    assert.strictEqual(room.checkPassword(''), false);
  });

  it('public room checkPassword should always pass', () => {
    const room = new Room({ name: 'Public' });
    assert.strictEqual(room.checkPassword(''), true);
    assert.strictEqual(room.checkPassword('anything'), true);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd server && npx mocha test/auth.test.js --timeout 5000`
Expected: Room Password tests FAIL

- [ ] **Step 3: room.js 수정**

`server/game/room.js` constructor (line 22):
```javascript
// 기존: constructor({ name, maxPlayers = 3, turnTimeLimit = 60 })
// 수정:
constructor({ name, maxPlayers = 3, turnTimeLimit = 60, password = '' })
```

constructor body에 추가:
```javascript
this.password = password || '';
```

toRoomInfo (line 64) 반환 객체에 추가:
```javascript
hasPassword: this.password !== '',
// password 필드는 포함하지 않음 (보안)
```

새 메서드 추가:
```javascript
checkPassword(input) {
  if (this.password === '') return true; // 공개방
  return input === this.password;
}
```

- [ ] **Step 4: index.js POST /api/rooms 수정 (line 82)**

```javascript
// 기존 body에서 password 추가 추출
const { name, max_players, turn_time_limit, password } = req.body;

// Room 생성 시 password 전달
const room = new Room({
  name: name || `Room ${rooms.size + 1}`,
  maxPlayers: max_players || 3,
  turnTimeLimit: turn_time_limit ?? 60,
  password: password || '',
});
```

- [ ] **Step 5: index.js POST /api/quickmatch 수정 (line 103)**

quickmatch에서 비밀번호 방 제외:
```javascript
// 기존: const waitingRoom = [...rooms.values()].find(r => r.phase === 'waiting' && r.players.size < r.maxPlayers);
// 수정:
const waitingRoom = [...rooms.values()].find(
  r => r.phase === 'waiting' && r.players.size < r.maxPlayers && r.password === ''
);
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd server && npx mocha test/auth.test.js --timeout 5000`
Expected: All passing

- [ ] **Step 7: Commit**

```bash
git add server/game/room.js server/index.js server/test/auth.test.js
git commit -m "feat: room password support with hasPassword in lobby"
```

---

## Task 6: WS JWT 검증 (optional)

**Files:**
- Modify: `server/index.js:393-402` (handleJoinRequest)

- [ ] **Step 1: WS 연결 시 JWT를 query param에서 추출 + 검증**

`server/index.js`의 WebSocket game connection handler에서:

```javascript
// WS 업그레이드 시 URL query에서 token 추출
const url = new URL(request.url, 'http://localhost');
const jwtToken = url.searchParams.get('token');
let authUser = null;
if (jwtToken) {
  authUser = jwtUtil.verify(jwtToken);
}
// authUser를 ws 객체에 첨부
ws.authUser = authUser;
```

handleJoinRequest에서 인증 사용자의 이름 자동 적용:

```javascript
// 인증 사용자면 JWT 이름 사용, 아니면 요청 이름 사용
const playerName = ws.authUser?.name || payload.playerName;
```

- [ ] **Step 2: 수동 테스트**

1. JWT 없이 WS 연결 → 기존처럼 playerName 사용 (게스트)
2. JWT와 함께 WS 연결 → JWT의 이름 사용

- [ ] **Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat: optional JWT auth on WebSocket connection"
```

---

## Task 7: 환경 변수 + Docker 설정

**Files:**
- Modify: `.env.example`
- Modify: `docker-compose.prod.yml`
- Modify: `server/Dockerfile`

- [ ] **Step 1: .env.example 업데이트**

기존 내용 뒤에 추가:

```bash
# Auth
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
KAKAO_REST_API_KEY=your-kakao-rest-api-key
JWT_SECRET=generate-a-random-256bit-secret-here
```

- [ ] **Step 2: docker-compose.prod.yml 수정**

game-server 서비스에 추가:

```yaml
game-server:
  volumes:
    - sqlite-data:/app/data
  environment:
    - GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
    - KAKAO_REST_API_KEY=${KAKAO_REST_API_KEY}
    - JWT_SECRET=${JWT_SECRET}

volumes:
  sqlite-data:  # 추가 (기존 volumes 섹션에)
```

- [ ] **Step 3: server/Dockerfile 수정**

better-sqlite3는 네이티브 모듈이므로 빌드 의존성 추가:

```dockerfile
# 기존: FROM node:20-alpine
FROM node:20-alpine
RUN apk add --no-cache python3 make g++
```

- [ ] **Step 4: Commit**

```bash
git add .env.example docker-compose.prod.yml server/Dockerfile
git commit -m "chore: Docker + env config for auth (SQLite volume, native deps)"
```

---

## Task 8: 클라이언트 — API URL Config + 패키지

**Files:**
- Create: `lib/config/app_config.dart`
- Modify: `pubspec.yaml`
- Modify: `lib/network/online_client.dart:109-111`

- [ ] **Step 1: app_config.dart 생성**

```dart
// lib/config/app_config.dart
class AppConfig {
  static const apiUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'http://localhost:9090',
  );
}
```

- [ ] **Step 2: online_client.dart에서 사용**

기존 하드코딩된 서버 URL 대신 `AppConfig.apiUrl` 사용하도록 호출부 확인 및 수정.

- [ ] **Step 3: pubspec.yaml에 패키지 추가**

```yaml
dependencies:
  google_sign_in: ^6.2.0
  kakao_flutter_sdk_user: ^1.9.0
  flutter_secure_storage: ^9.2.0
```

```bash
flutter pub get
```

- [ ] **Step 4: Commit**

```bash
git add lib/config/app_config.dart pubspec.yaml pubspec.lock lib/network/online_client.dart
git commit -m "feat: app config with dart-define API URL + auth packages"
```

---

## Task 9: 클라이언트 — Auth Service + Provider

**Files:**
- Create: `lib/services/auth_service.dart`
- Create: `lib/providers/auth_provider.dart`

- [ ] **Step 1: auth_service.dart 생성**

```dart
// lib/services/auth_service.dart
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config/app_config.dart';

class AuthService {
  static final AuthService instance = AuthService._();
  AuthService._();

  final _storage = const FlutterSecureStorage();
  String? _jwt;
  Map<String, dynamic>? _user;

  String? get jwt => _jwt;
  Map<String, dynamic>? get user => _user;
  bool get isLoggedIn => _jwt != null;

  Future<void> init() async {
    _jwt = await _storage.read(key: 'jwt');
    final userJson = await _storage.read(key: 'user');
    if (userJson != null) _user = jsonDecode(userJson);
  }

  Future<bool> signInWithGoogle() async {
    try {
      final googleUser = await GoogleSignIn().signIn();
      if (googleUser == null) return false;
      final auth = await googleUser.authentication;
      final idToken = auth.idToken;
      if (idToken == null) return false;
      return await _verify('google', idToken);
    } catch (e) {
      debugPrint('[AUTH] Google sign-in error: $e');
      return false;
    }
  }

  Future<bool> signInAsGuest(String name) async {
    return await _verify('guest', 'guest', name: name);
  }

  Future<bool> _verify(String provider, String token, {String? name}) async {
    try {
      final res = await http.post(
        Uri.parse('${AppConfig.apiUrl}/auth/verify'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'provider': provider, 'token': token, 'name': name}),
      );
      if (res.statusCode != 200) return false;
      final body = jsonDecode(res.body);
      _jwt = body['jwt'];
      _user = body['user'];
      await _storage.write(key: 'jwt', value: _jwt);
      await _storage.write(key: 'user', value: jsonEncode(_user));
      return true;
    } catch (e) {
      debugPrint('[AUTH] verify error: $e');
      return false;
    }
  }

  Future<void> signOut() async {
    _jwt = null;
    _user = null;
    await _storage.delete(key: 'jwt');
    await _storage.delete(key: 'user');
  }
}
```

- [ ] **Step 2: auth_provider.dart 생성**

```dart
// lib/providers/auth_provider.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/auth_service.dart';

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier();
});

class AuthState {
  final bool isLoggedIn;
  final String? userName;
  final String? provider;
  final bool isLoading;

  const AuthState({this.isLoggedIn = false, this.userName, this.provider, this.isLoading = false});

  AuthState copyWith({bool? isLoggedIn, String? userName, String? provider, bool? isLoading}) {
    return AuthState(
      isLoggedIn: isLoggedIn ?? this.isLoggedIn,
      userName: userName ?? this.userName,
      provider: provider ?? this.provider,
      isLoading: isLoading ?? this.isLoading,
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier() : super(const AuthState());

  Future<void> init() async {
    await AuthService.instance.init();
    if (AuthService.instance.isLoggedIn) {
      final user = AuthService.instance.user;
      state = AuthState(
        isLoggedIn: true,
        userName: user?['name'],
        provider: user?['provider'],
      );
    }
  }

  Future<bool> signInWithGoogle() async {
    state = state.copyWith(isLoading: true);
    final ok = await AuthService.instance.signInWithGoogle();
    if (ok) {
      final user = AuthService.instance.user;
      state = AuthState(isLoggedIn: true, userName: user?['name'], provider: user?['provider']);
    } else {
      state = state.copyWith(isLoading: false);
    }
    return ok;
  }

  Future<bool> signInAsGuest(String name) async {
    state = state.copyWith(isLoading: true);
    final ok = await AuthService.instance.signInAsGuest(name);
    if (ok) {
      state = AuthState(isLoggedIn: true, userName: name, provider: 'guest');
    } else {
      state = state.copyWith(isLoading: false);
    }
    return ok;
  }

  Future<void> signOut() async {
    await AuthService.instance.signOut();
    state = const AuthState();
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/services/auth_service.dart lib/providers/auth_provider.dart
git commit -m "feat: AuthService + AuthProvider for Google/Guest login"
```

---

## Task 10: 클라이언트 — 로그인 화면

**Files:**
- Create: `lib/ui/screens/login_screen.dart`
- Modify: `lib/main.dart` (라우팅)

- [ ] **Step 1: login_screen.dart 생성**

```dart
// lib/ui/screens/login_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/auth_provider.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _nameController = TextEditingController();

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);

    return Scaffold(
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 360),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Text('KFC Poker', style: TextStyle(fontSize: 32, fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                const Text('Open Face Chinese Poker', style: TextStyle(fontSize: 14, color: Colors.grey)),
                const SizedBox(height: 48),

                // Google 로그인
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: auth.isLoading ? null : () async {
                      final ok = await ref.read(authProvider.notifier).signInWithGoogle();
                      if (ok && mounted) Navigator.pushReplacementNamed(context, '/home');
                    },
                    icon: const Icon(Icons.login),
                    label: const Text('Google로 로그인'),
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                  ),
                ),
                const SizedBox(height: 12),

                // 구분선
                const Row(children: [Expanded(child: Divider()), Padding(padding: EdgeInsets.symmetric(horizontal: 12), child: Text('또는')), Expanded(child: Divider())]),
                const SizedBox(height: 12),

                // 게스트 입장
                TextField(
                  controller: _nameController,
                  decoration: const InputDecoration(
                    labelText: '닉네임',
                    hintText: '게스트 닉네임 입력',
                    border: OutlineInputBorder(),
                  ),
                  maxLength: 20,
                ),
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton(
                    onPressed: auth.isLoading ? null : () async {
                      final name = _nameController.text.trim();
                      if (name.isEmpty) return;
                      final ok = await ref.read(authProvider.notifier).signInAsGuest(name);
                      if (ok && mounted) Navigator.pushReplacementNamed(context, '/home');
                    },
                    child: const Text('게스트로 입장'),
                  ),
                ),

                if (auth.isLoading) ...[
                  const SizedBox(height: 16),
                  const CircularProgressIndicator(),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
```

- [ ] **Step 2: main.dart에 라우팅 추가**

초기 화면을 LoginScreen으로 변경하고, /home 라우트에 기존 HomeScreen 연결:

```dart
// MaterialApp의 routes에 추가:
'/': (context) => const LoginScreen(),
'/home': (context) => const HomeScreen(),
```

AuthProvider.init()을 앱 시작 시 호출하여 자동 로그인 처리.

- [ ] **Step 3: Commit**

```bash
git add lib/ui/screens/login_screen.dart lib/main.dart
git commit -m "feat: login screen with Google + guest entry"
```

---

## Task 11: 클라이언트 — 방 비밀번호 UI

**Files:**
- Create: `lib/ui/widgets/password_dialog.dart`
- Modify: `lib/ui/screens/home_screen.dart`

- [ ] **Step 1: password_dialog.dart 생성**

```dart
// lib/ui/widgets/password_dialog.dart
import 'package:flutter/material.dart';

class PasswordDialog extends StatefulWidget {
  final String roomName;
  const PasswordDialog({super.key, required this.roomName});

  @override
  State<PasswordDialog> createState() => _PasswordDialogState();
}

class _PasswordDialogState extends State<PasswordDialog> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('${widget.roomName}'),
      content: TextField(
        controller: _controller,
        obscureText: true,
        decoration: const InputDecoration(
          labelText: '비밀번호',
          border: OutlineInputBorder(),
        ),
        maxLength: 20,
        autofocus: true,
        onSubmitted: (_) => _submit(),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('취소')),
        ElevatedButton(onPressed: _submit, child: const Text('입장')),
      ],
    );
  }

  void _submit() {
    final pw = _controller.text.trim();
    if (pw.isNotEmpty) Navigator.pop(context, pw);
  }
}
```

- [ ] **Step 2: home_screen.dart 수정**

방 생성 다이얼로그에 비밀번호 필드 추가:
- TextField(obscureText: true, label: '비밀번호 (선택)')
- POST /api/rooms body에 password 포함

방 목록에서:
- `hasPassword: true`인 방에 🔒 아이콘 표시
- 🔒 방 클릭 시 PasswordDialog 표시
- 입력한 비밀번호를 join 요청에 포함

- [ ] **Step 3: online_client.dart 수정**

WS 연결 시 JWT query param 추가:
```dart
final token = AuthService.instance.jwt;
final query = token != null ? '?token=$token' : '';
final wsUrl = '$wsBaseUrl/ws/game/$roomId$query';
```

방 입장 시 비밀번호 포함:
```dart
// POST /api/rooms/:id/join body에 password 추가
```

- [ ] **Step 4: Commit**

```bash
git add lib/ui/widgets/password_dialog.dart lib/ui/screens/home_screen.dart lib/network/online_client.dart
git commit -m "feat: room password UI (create dialog, lock icon, join dialog)"
```

---

## Task 12: Android 빌드 + 최종 배포

**Files:**
- Modify: `android/app/build.gradle` (필요 시)

- [ ] **Step 1: Android APK 빌드 테스트**

```bash
flutter build apk --release --dart-define=API_URL=https://ofc.example.com
```

Expected: `build/app/outputs/flutter-apk/app-release.apk` 생성

- [ ] **Step 2: Docker 배포 테스트**

```bash
docker-compose -f docker-compose.prod.yml up -d --build
```

- [ ] **Step 3: E2E 검증**

1. 웹 브라우저에서 게스트 로그인 → 방 생성 (비밀번호 있음/없음)
2. 다른 브라우저에서 비밀번호 방 입장 (잘못된 비밀번호 → 거부, 맞는 비밀번호 → 입장)
3. 퀵매치 → 비밀번호 없는 방만 매칭
4. Android APK 설치 → 게스트 로그인 → 게임 플레이

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: app deployment ready (OAuth, room password, Android APK)"
```
