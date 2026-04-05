# App Deployment Design — OAuth + Private Rooms + Android

**Date**: 2026-04-05
**Status**: Approved
**Approach**: Minimal (방식 A) — 현재 서버 최대 활용, 최소 변경

---

## 1. 목표

현재 웹 전용 OFC 포커 게임을 **Web + Android 앱**으로 배포.
OAuth 인증, 비밀번호 방, Android APK 빌드를 추가한다.

## 2. 요구사항

| ID | 요구사항 | 우선순위 |
|----|----------|---------|
| R-01 | Google OAuth 로그인 | P0 |
| R-02 | Kakao OAuth 로그인 | P0 |
| R-03 | 게스트 모드 유지 (닉네임만) | P0 |
| R-04 | 비밀번호 방 생성/입장 | P0 |
| R-05 | Android APK 빌드 | P0 |
| R-06 | JWT 기반 인증 미들웨어 | P0 |
| R-07 | SQLite 사용자 DB | P0 |
| R-08 | 퀵매치에서 비밀번호 방 제외 | P1 |
| R-09 | API URL 빌드 시 주입 (--dart-define) | P1 |
| R-10 | SQLite 일간 백업 | P2 |

## 3. 아키텍처

```
Browser/App ──http/ws──→ nginx ──→ game-server (Express+WS)
                                   ├─ in-memory rooms
                                   ├─ JWT 미들웨어
                                   └─ SQLite (users)
```

### 3.1 인증 플로우

```
[Client]                [Server]               [OAuth Provider]
    │                      │                         │
    ├─ SDK 로그인 ────────────────────────────────→  │
    │← id_token ──────────────────────────────────  │
    │                      │                         │
    ├─ POST /auth/verify ─→│                         │
    │  {provider, token}   ├─ id_token 검증 ────────→│
    │                      │← 유효 확인 ─────────── │
    │                      ├─ DB upsert (users)      │
    │← {jwt, user} ───────│                         │
    │                      │                         │
    ├─ WS connect ────────→│ (query: token=jwt)      │
    │  joinRequest         ├─ JWT 검증               │
    │← joinAccepted ──────│                         │
```

- 클라이언트가 OAuth SDK로 id_token 획득
- 서버는 id_token 유효성만 검증 (콜백 URL 불필요)
- JWT 만료: 7일 (WS는 연결 시점만 검증)
- 게스트: JWT 없이 접속 가능, 비밀번호 방 생성 불가

### 3.2 토큰 역할 분리

| 토큰 | 용도 | 발급 시점 | 만료 |
|------|------|----------|------|
| JWT | 인증 (누구인가) | /auth/verify | 7일 |
| sessionToken | 세션 (어떤 방, 재접속) | joinAccepted | 방 삭제 시 |

### 3.3 DB 스키마 (SQLite)

```sql
CREATE TABLE users (
  id          TEXT PRIMARY KEY,          -- UUID
  provider    TEXT NOT NULL,             -- 'google' | 'kakao' | 'guest'
  provider_id TEXT NOT NULL,             -- OAuth sub/id
  name        TEXT NOT NULL,             -- 표시 이름
  avatar_url  TEXT,                      -- 프로필 이미지
  created_at  INTEGER NOT NULL,          -- Unix timestamp
  last_login  INTEGER NOT NULL,          -- Unix timestamp
  UNIQUE(provider, provider_id)
);
```

## 4. 서버 변경

### 4.1 새 파일

| 파일 | 내용 |
|------|------|
| `server/auth/auth-router.js` | POST /auth/verify — Google/Kakao id_token 검증 + JWT 발급 |
| `server/auth/jwt.js` | JWT 발급/검증 유틸 (jsonwebtoken) |
| `server/db/database.js` | SQLite 초기화 + users CRUD (better-sqlite3) |

### 4.2 기존 파일 수정

| 파일 | 변경 |
|------|------|
| `server/index.js` | auth-router 마운트, WS JWT 검증 (optional), 방 비밀번호 지원 |
| `server/game/room.js` | password 필드 추가, join 시 검증 |
| `server/package.json` | better-sqlite3, jsonwebtoken, google-auth-library 추가 |

### 4.3 API 변경

```
신규:
  POST /auth/verify       — {provider, id_token} → {jwt, user}

수정:
  POST /api/rooms          — body에 password 추가 (선택)
  POST /api/rooms/:id/join — body에 password 추가 (비공개 방)
  GET  /api/rooms          — 응답에서 password 제외, hasPassword: true 추가
  POST /api/quickmatch     — 비밀번호 방 제외 필터

WS:
  /ws/game/:roomId?token=jwt — JWT query param (선택, 게스트는 없음)
```

### 4.4 방 비밀번호

- 생성: `POST /api/rooms { ..., password: "1234" }` (빈 문자열 = 공개)
- 입장: `POST /api/rooms/:id/join { password: "1234" }` (비공개 시 필수)
- 저장: 평문 (방은 일시적, 삭제 시 소멸)
- 표시: 로비 목록에서 `hasPassword: true` → 🔒 아이콘
- 퀵매치: `password` 없는 방만 대상

## 5. 클라이언트 변경

### 5.1 새 화면

| 화면 | 내용 |
|------|------|
| `LoginScreen` | Google/Kakao 버튼 + 게스트 입장 버튼 |

### 5.2 기존 화면 수정

| 화면 | 변경 |
|------|------|
| `LobbyScreen` | 방 목록에 🔒 표시, 비밀번호 입장 다이얼로그 |
| `CreateRoomDialog` | 비밀번호 입력 필드 추가 |

### 5.3 새 파일

| 파일 | 내용 |
|------|------|
| `lib/services/auth_service.dart` | Google/Kakao SDK 래퍼 + /auth/verify 호출 |
| `lib/providers/auth_provider.dart` | 인증 상태 관리 (Riverpod) |
| `lib/ui/screens/login_screen.dart` | 로그인 화면 |

### 5.4 패키지 추가

```yaml
google_sign_in: ^6.2.0
kakao_flutter_sdk_user: ^1.9.0
flutter_secure_storage: ^9.0.0    # JWT 저장
```

### 5.5 API URL 주입

```bash
# 개발
flutter run --dart-define=API_URL=http://localhost:9090

# 프로덕션 웹
flutter build web --dart-define=API_URL=https://ofc.example.com

# Android
flutter build apk --dart-define=API_URL=https://ofc.example.com
```

코드: `const apiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://localhost:9090');`

## 6. 배포

### 6.1 Docker 변경

```yaml
# docker-compose.prod.yml 추가
volumes:
  sqlite-data:

services:
  game-server:
    volumes:
      - sqlite-data:/app/data    # SQLite 영속
    environment:
      - GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
      - KAKAO_REST_API_KEY=${KAKAO_REST_API_KEY}
      - JWT_SECRET=${JWT_SECRET}
```

### 6.2 환경 변수 (.env)

```bash
DOMAIN=ofc.example.com
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
KAKAO_REST_API_KEY=xxxx
JWT_SECRET=random-256bit-secret
```

### 6.3 Android 빌드

```bash
flutter build apk --release --dart-define=API_URL=https://ofc.example.com
# → build/app/outputs/flutter-apk/app-release.apk
```

### 6.4 SQLite 백업 (cron)

```bash
# /etc/cron.d/sqlite-backup
0 4 * * * root docker cp game_kfc_pro-game-server-1:/app/data/ofc.db /backup/ofc-$(date +\%F).db
```

## 7. 보안

| 항목 | 대응 |
|------|------|
| JWT 비밀키 | .env에만 저장, 코드에 포함 안 함 |
| OAuth 토큰 | 서버에서만 검증, 클라이언트에 저장 안 함 |
| 방 비밀번호 | 평문 (일시적 데이터), API 응답에서 제외 |
| CORS | 프로덕션 도메인만 허용 |
| Rate Limit | /auth/verify에 express-rate-limit (10req/min) |

## 8. 변경 규모 추정

| 영역 | 파일 수 | 줄 수 |
|------|--------|------|
| 서버 (auth, db, room) | 5 | ~300줄 |
| 클라이언트 (auth, login, lobby) | 6 | ~400줄 |
| 설정 (docker, env, pubspec) | 4 | ~50줄 |
| **합계** | **~15** | **~750줄** |

## 9. 구현 순서

```
Phase 1: 서버 인증 (~150줄)
  1. SQLite 초기화 + users 테이블
  2. /auth/verify 엔드포인트
  3. JWT 발급/검증 미들웨어
  4. WS 연결 시 JWT 검증 (optional)

Phase 2: 방 비밀번호 (~100줄)
  5. room.password 필드 추가
  6. join 시 비밀번호 검증
  7. 로비 API에서 hasPassword 표시
  8. quickmatch 비밀번호 방 제외

Phase 3: 클라이언트 인증 (~300줄)
  9. auth_service.dart (Google/Kakao SDK)
  10. auth_provider.dart (Riverpod)
  11. login_screen.dart
  12. 기존 화면에 인증 상태 연동

Phase 4: 클라이언트 방 기능 (~100줄)
  13. 방 생성 다이얼로그 비밀번호 필드
  14. 방 목록 🔒 표시
  15. 비밀번호 입장 다이얼로그

Phase 5: 배포 (~100줄)
  16. docker-compose volume + env
  17. Android APK 빌드 스크립트
  18. API URL dart-define 적용
  19. 운영 서버 배포 + 테스트
```

## 10. Critic 검증 결과 (10개 문제 해결)

| # | 문제 | 해결 |
|---|------|------|
| 1 | 모바일 OAuth 콜백 불가 | 클라이언트 SDK → /auth/verify 검증 방식 |
| 2 | SQLite 동시 쓰기 | 단일 프로세스 OK, better-sqlite3 동기 API |
| 3 | JWT + sessionToken 공존 | 역할 분리: JWT=인증, sessionToken=세션 |
| 4 | 웹/앱 OAuth SDK 차이 | google_sign_in (크로스플랫폼), kakao SDK |
| 5 | JWT 만료 시 WS 끊김 | 7일 만료, WS는 연결 시점만 검증 |
| 6 | 게스트 모드 필요 | JWT 없이 접속 가능, 비밀번호 방 생성만 제한 |
| 7 | 방 비밀번호 보안 | 평문 허용 (일시적), API 응답에서 제외 |
| 8 | API URL 하드코딩 | --dart-define으로 빌드 시 주입 |
| 9 | SQLite 백업 | 일간 cron 복사 |
| 10 | 퀵매치 비밀번호 방 | 필터로 제외 |
