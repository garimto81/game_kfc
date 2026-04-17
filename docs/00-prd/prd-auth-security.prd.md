# 인증·세션·보안 PRD

## 개요

- **목적**: OAuth 기반 사용자 인증 → JWT 발급/검증 → WebSocket 세션 관리 → 방 보안(비밀번호 게이트) 전체 흐름을 단일 원천 문서로 공식화한다.
- **작성 동기**: 2026-04-17 `/check --all` 보안 감사에서 CRITICAL 2건(비밀번호 게이트 누락 / JWT_SECRET 하드코딩 fallback) 발견 → 기획 문서 부재 상태에서 구현된 인증·세션 로직을 체계적으로 문서화할 필요성 확인.
- **범위**: `server/auth/`, `server/index.js` (WS 인증 + rate limit + trust proxy), `server/game/room.js` (sessionToken + checkPassword), `server/db/database.js` (user 스키마).
- **범위 외**: 네트워크 메시지 포맷(→ `prd-realtime-protocol`), 게임 규칙(→ `prd-game-rules`), UI 화면 흐름(→ `prd-ux-flow`, 추후).

## OAuth Provider

OAuth 검증 진입점은 `server/auth/auth-router.js:27` `POST /auth/verify`. 모든 provider는 검증 후 `db.upsertUser()`로 사용자 레코드를 upsert하고 공통 JWT 응답을 반환한다.

### Google

- **구현**: `server/auth/auth-router.js:8` `verifyGoogle()`.
- **라이브러리**: `google-auth-library`의 `OAuth2Client.verifyIdToken({ idToken, audience: clientId })`.
- **환경변수**: `GOOGLE_CLIENT_ID` (필수). 미설정 시 `Error('GOOGLE_CLIENT_ID not configured')` 발생.
- **추출 필드**: `payload.sub` → `providerId`, `payload.name` → `name` (fallback `'Google User'`), `payload.picture` → `avatarUrl`.

### Kakao

- **구현**: `server/auth/auth-router.js:17` `verifyKakao()`.
- **검증 방식**: `https://kapi.kakao.com/v2/user/me` 에 Access 토큰을 `Authorization: Bearer` 헤더로 전달.
- **환경변수**: `KAKAO_REST_API_KEY` (클라이언트가 발급받은 Access 토큰을 서버로 전달하는 흐름 — 서버는 토큰을 위임 검증만 수행).
- **추출 필드**: `data.id` → `providerId`, `kakao_account.profile.nickname` → `name` (fallback `'Kakao User'`), `profile.profile_image_url` → `avatarUrl`.

### Guest

- **구현**: `server/auth/auth-router.js:36`.
- **ID 생성 규칙**: `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` — 서버에서 임시 발급하며 재로그인 시 새 ID.
- **이름 제한**: `name.slice(0, 20)` — 20자 초과 시 절단.

### 공통 응답 스키마

```
POST /auth/verify
{ provider: 'google'|'kakao'|'guest', token: string, name?: string }
→ 200 { jwt: string, user: { id, name, provider, avatarUrl } }
→ 400 { error: 'provider and token required' | 'unsupported provider' }
→ 401 { error: 'token verification failed' }
```

## JWT

- **라이브러리**: `jsonwebtoken` (`server/auth/jwt.js`).
- **서명 알고리즘**: HS256 (jsonwebtoken 기본값).
- **Payload**: `{ userId, name, provider }` — `auth-router.js:55`에서 생성.
- **만료**: `7d` (`server/auth/jwt.js:9` `expiresIn='7d'` 기본값).
- **발급 위치**: `auth-router.js:55` `/auth/verify` 성공 시.
- **검증 위치**:
  - `server/index.js:199` — WS upgrade 시 URL `?token=` (하위 호환, deprecated).
  - `server/index.js:369` — WS `auth` 메시지 핸들러 (현행 정규 경로).
- **검증 결과**: `jwtUtil.verify()`는 invalid/expired 시 `null` 반환 (`server/auth/jwt.js:13`).

### JWT_SECRET 정책 (2026-04-17 현행 규정)

- **필수 환경변수**: 서버 기동 시 `JWT_SECRET` 미설정이면 즉시 `process.exit(1)` (`server/index.js:22-25`).
- **fallback 금지**: 이전 하드코딩 `'dev-secret-change-in-production'` fallback은 2026-04-17 감사에서 제거됨. 개발/스테이징/프로덕션 모두 `.env` 또는 docker-compose env 파일에 명시 필수.
- **FATAL 메시지**: `[FATAL] JWT_SECRET 환경변수가 설정되지 않았습니다. .env 파일 또는 docker-compose env 를 확인하세요.`
- **권장 생성**: 32byte 이상 무작위 바이트(base64 인코딩).

## 세션 모델

### sessionToken

- **정의**: 방 참가 성공 시 서버가 UUID v4로 발급하는 재접속 전용 토큰 (`server/game/room.js:100`).
- **JWT와의 차이**: JWT는 사용자 인증용(`/auth/verify` 응답), sessionToken은 방 단위 재접속용(`joinAccepted` 응답). 서로 독립.
- **저장**: `Room.sessionTokens: Map<sessionToken, playerId>` (`room.js:36`).
- **발급 경로**: `addPlayer()` → `joinAccepted` 페이로드에 포함 (`server/index.js:471`).
- **정리**: `removePlayer()` 시 `sessionTokens.delete(player.sessionToken)` — 메모리 누수 방지 (`room.js:148-150`).

### Reconnect 흐름

- **요청**: 클라이언트 → `{type:'reconnect', payload:{sessionToken}}` (`server/index.js:489` `handleReconnect`).
- **검증**: `Room.reconnectPlayer(sessionToken)` → `sessionTokens.get(sessionToken)`로 playerId 복구 (`room.js:188`).
- **응답**:
  - 성공 → `reconnected` 이벤트 + `gameState` 재전송 + `playerReconnected` 브로드캐스트.
  - playerId는 있으나 player 삭제됨 → `{rejoinRequired: true}` 에러 → 클라이언트는 신규 `joinRequest` 재시도.
  - sessionToken 자체가 없음 → `null` → 재접속 실패 에러.

### Disconnect 유예

- **개별 유예**: `disconnectPlayer()` 시 `waiting: 30초`, `playing: 120초` 후 자동 퇴장 (`room.js:227`).
- **전원 이탈 유예**: 방의 모든 플레이어가 disconnect 상태가 되면 개별 타이머 취소 후 **10초 공통 유예** 타이머 작동 (`server/index.js:331`). 10초 내 재접속 없으면 전원 제거 → `empty` 이벤트 → 방 삭제.
- **Reconnect 시 타이머 취소**: `room.js:199-208`에서 개별 + 전원 이탈 타이머 모두 clear.

## 방 보안

### 비밀번호 방 게이트 (2026-04-17 CRITICAL 수정)

- **요구사항**: `hasPassword === true` 방(`room.password !== ''`)에 `joinRequest` 시 클라이언트는 `password` 필드를 반드시 전송해야 하며, 서버는 평문 비교로 검증한다.
- **검증 함수**: `Room.checkPassword(input)` — `password === ''` 이면 true, 아니면 문자열 일치 비교 (`server/game/room.js:79`).
- **호출 위치**: `handleJoinRequest` — `server/index.js:452-456`.
- **에러 코드**: `INVALID_PASSWORD` — `{type:'error', payload:{message:'방 비밀번호가 올바르지 않습니다.', code:'INVALID_PASSWORD'}}`.
- **수정 전 상태**: `handleJoinRequest`에서 `checkPassword` 호출이 누락되어 비밀번호 방에 누구나 joinRequest만으로 입장 가능한 우회 경로 존재. `hasPassword`는 UI 표시용이었고 실제 게이트가 없었음.
- **E2E 검증**: `server/test/password-gate.test.js` — PASS (비밀번호 불일치 시 `INVALID_PASSWORD` 수신 확인).

### Quick Match 필터

- **구현**: `server/index.js:130` — `room.password === ''` 인 waiting 방만 매칭 대상.
- **근거**: 비밀번호 방은 명시적으로 초대받은 사용자만 접근하도록 하여 사적 방에 비인가 매칭을 차단.
- **빈 방 없을 시**: 비밀번호 없는 신규 방을 자동 생성하여 반환.

## WebSocket 인증

### URL 토큰 (deprecated)

- **경로**: `server/index.js:194-202` — `wss://host/ws/game/{roomId}?token=<jwt>`.
- **처리**: upgrade 시 `jwtUtil.verify(token)` → `ws.authUser`, `ws.authCompleted = !!authUser`.
- **상태**: 하위 호환을 위해 유지하나, **로그/proxy access log에 JWT 전문 노출** 위험으로 deprecated. 향후 완전 제거 예정(미해결 이슈 참조).

### 메시지 기반 auth (현행)

- **경로**: `server/index.js:366-381`.
- **클라이언트 흐름**: 연결 수립 직후 `{type:'auth', payload:{token: <jwt>}}` 전송.
- **서버 응답**:
  - 성공 → `{type:'authResult', payload:{success:true, name}}` + `ws.authUser` / `ws.authCompleted = true` 설정.
  - 토큰 유효성 실패 → `{success:false, message:'유효하지 않은 토큰입니다.'}`.
  - 토큰 누락 → `{success:false, message:'토큰이 필요합니다.'}`.
- **연계**: `handleJoinRequest`는 `ws.authUser?.name`을 우선 사용하여 위·변조된 `playerName`을 차단(`server/index.js:441`).

## Rate Limiting

- **구현**: `express-rate-limit`, `/auth` 라우터에만 적용 — `server/index.js:39`.
- **설정**: `windowMs=60000`, `max=10` → IP당 1분에 10회.
- **trust proxy (필수 전제)**: `app.set('trust proxy', 1)` — `server/index.js:31`. nginx 리버스 프록시 뒤에서 `X-Forwarded-For`를 신뢰하여 **실제 클라이언트 IP**로 rate limit이 동작하도록 한다.
- **수정 전 상태 (2026-04-17 이전)**: `trust proxy` 미설정 → Express가 nginx 소켓 IP(127.0.0.1)를 모든 요청의 식별자로 사용 → 전 사용자 요청이 동일 IP로 집계되어 rate limit이 10회만에 전역 잠금 또는 무의미해짐. 이번 감사에서 `trust proxy: 1`로 수정.

## 로깅 규칙

- **토큰 노출 금지**: JWT/sessionToken 전문은 절대 로깅하지 않는다.
- **sessionToken prefix 로깅**: 진단용 로그에는 첫 8자 + `…` 형식만 허용 — 예: `sessionToken?.slice(0,8) + '…'` (`server/index.js:494, 500`).
- **/auth 경로 로깅**: 요청 경로와 결과(성공/실패)만 기록. body의 `token` 값 로깅 금지.
- **에러 로깅**: `auth-router.js:58`은 `err.message`만 로깅 — 스택/토큰 포함 금지.

## 환경변수 스키마

| 변수 | 필수 | 설명 | 기본값 |
|------|:----:|------|--------|
| `JWT_SECRET` | Y | JWT 서명용 시크릿. 미설정 시 server 기동 실패. | — |
| `GOOGLE_CLIENT_ID` | 조건부 | Google OAuth 사용 시 필수. | — |
| `KAKAO_REST_API_KEY` | 조건부 | Kakao OAuth 사용 시 클라이언트 Access token 발급용. | — |
| `CORS_ORIGIN` | 권장 | 프로덕션 허용 origin. 미설정 시 `cors({origin:true})`로 전 origin 허용. | `true` |
| `NODE_ENV` | 권장 | `production` 시 CORS_ORIGIN 미설정 경고. | undefined |
| `PORT` | N | Express listen 포트. | `3000` |
| `DB_PATH` | N | SQLite 파일 경로. | `./data/ofc.db` |

- **배포 파일**: `docker-compose.yml`의 `env_file: .env` 로드 전제. 프로덕션에서는 `.env`를 저장소에 커밋하지 않고 배포 파이프라인에서 주입.

## 위협 모델

| # | 위협 | 대응 구현 | 파일:라인 |
|---|------|-----------|-----------|
| T1 | JWT `alg: none` 우회 | `jsonwebtoken.verify()`는 기본적으로 서명 알고리즘 검증. HS256 시크릿 필수. | `auth/jwt.js:14` |
| T2 | `/auth` 브루트포스 | express-rate-limit 10/min + trust proxy로 실 IP 식별 | `index.js:31, 39` |
| T3 | CSRF (cross-origin POST) | `CORS_ORIGIN` 명시로 허용 origin 제한 | `index.js:37` |
| T4 | 비밀번호 방 우회 | `checkPassword` + `INVALID_PASSWORD` 에러 코드 | `room.js:79`, `index.js:453` |
| T5 | 세션 고정 (sessionToken 예측) | UUID v4 난수 발급, 참가 성공 시에만 할당 | `room.js:100` |
| T6 | 이름 위·변조 | `ws.authUser?.name` 우선, 클라 제공 `playerName`은 fallback | `index.js:441` |
| T7 | 토큰 로그 노출 | prefix 8자 `…`만 로깅, URL 토큰 경로 deprecated | `index.js:494, 500` |

## 미해결 이슈 (Known Issues)

1. **WS URL 토큰 완전 제거**: `server/index.js:194-202`의 `?token=` 파싱은 하위 호환 유지용. 메시지 기반 auth가 모든 클라이언트에서 안착한 후 제거 예정.
2. **CORS_ORIGIN production 강제 미적용**: 프로덕션에서 `CORS_ORIGIN` 미설정 시 경고만 출력하고 서버는 기동됨(`index.js:34-36`). `exit(1)`로 강제할지 운영 정책 결정 필요.
3. **방 비밀번호 시도 횟수 제한 없음**: `checkPassword` 실패는 에러만 반환하며 특정 방에 대한 시도 제한이 없음. `/auth` rate limit은 인증 경로에만 적용되어 WebSocket `joinRequest` 경로는 무제한.
4. **Kakao Access Token TTL 검증**: `kapi.kakao.com` 호출은 현재 유효한 토큰인지만 확인할 뿐, 만료 임박 여부를 JWT 재발급 주기(7d)와 동기화하지 않음.
5. **Guest 계정 재사용 불가**: `guest_*` ID가 매 로그인마다 새로 생성되므로 디바이스 식별자 기반 지속성 설계 필요 여부 검토.

## 구현 맵 (Implementation Map)

| 기능 | 파일 | 라인 |
|------|------|------|
| `/auth/verify` 라우터 | `server/auth/auth-router.js` | 27 |
| Google ID 토큰 검증 | `server/auth/auth-router.js` | 8 |
| Kakao Access 토큰 검증 | `server/auth/auth-router.js` | 17 |
| Guest ID 발급 | `server/auth/auth-router.js` | 36 |
| JWT sign/verify | `server/auth/jwt.js` | 9, 13 |
| JWT_SECRET 가드 | `server/index.js` | 22-25 |
| trust proxy | `server/index.js` | 31 |
| Rate limit (/auth) | `server/index.js` | 39 |
| WS URL 토큰(deprecated) | `server/index.js` | 194-202 |
| WS 메시지 auth | `server/index.js` | 366-381 |
| joinRequest 비밀번호 게이트 | `server/index.js` | 452-456 |
| `checkPassword` | `server/game/room.js` | 79 |
| sessionToken 발급 | `server/game/room.js` | 100 |
| reconnectPlayer | `server/game/room.js` | 188 |
| sessionToken 정리 | `server/game/room.js` | 148-150 |
| 전원 이탈 10초 유예 | `server/index.js` | 331 |
| Quick Match 비밀번호 필터 | `server/index.js` | 130 |
| users 스키마 | `server/db/database.js` | 14-25 |
| upsertUser | `server/db/database.js` | 28 |
| E2E: 비밀번호 게이트 | `server/test/password-gate.test.js` | — |

## DoD

- [x] 모든 섹션이 실제 코드 라인(`파일:라인`)을 근거로 인용.
- [x] 위협 모델의 각 항목이 대응 구현 라인에 매핑됨.
- [x] E2E 테스트 경로(`server/test/password-gate.test.js`) 명시.
- [x] 2026-04-17 감사 수정 내용(CRITICAL 2건 + trust proxy)이 "현행 규정"으로 반영됨.
- [x] 환경변수 스키마가 `docker-compose.yml` 배포 흐름과 일치.

## 범위 외

- **네트워크 프로토콜 상세**: WS 메시지 전체 계약은 `docs/00-prd/prd-realtime-protocol.prd.md` 참조.
- **게임 규칙**: OFC Pineapple 규칙/Royalty/Foul 판정은 `docs/00-prd/prd-game-rules.prd.md` 참조.
- **UI 화면 흐름**: 로그인/방 목록/에러 표시 UX는 `prd-ux-flow.prd.md`(추후 작성).

## Changelog

| 날짜 | 버전 | 변경 내용 | 변경 유형 | 결정 근거 |
|------|------|-----------|----------|----------|
| 2026-04-17 | v1.0 | 최초 작성 — `/check --all` 감사 결과 CRITICAL 2건 수정(비밀번호 게이트 + JWT_SECRET fallback 제거) + trust proxy 보강 + 전체 인증/세션/보안 흐름 공식화 | TECH | 2026-04-17 보안 감사 + `server/test/password-gate.test.js` PASS |
