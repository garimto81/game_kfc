# Online Deployment PRD

## 개요
- **목적**: game_kfc_pro를 인터넷에서 외부 접속 가능하게 배포
- **배경**: Docker 기반 빌드/실행 환경 + Cloudflare Quick Tunnel 까지 검증 완료. 상시 운영 인프라(Oracle Cloud + TLS)만 남음
- **범위**: Cloudflare Tunnel (즉시 공유용) + Oracle Cloud Free Tier (상시 운영)

## 요구사항

### 기능 요구사항
1. 외부 인터넷에서 HTTPS URL로 게임 접속 가능
2. WebSocket (WSS) 기반 실시간 멀티플레이어 동작
3. 로컬 PC 기반 즉시 배포 (Cloudflare Quick Tunnel)
4. 클라우드 기반 상시 운영 (Oracle Cloud Free Tier)
5. SSL/TLS 자동 발급 및 갱신 (Let's Encrypt)
6. JWT_SECRET/OAuth 클라이언트 ID 등 비밀값은 `.env` 파일로 주입 (이미지 재빌드 없이 교체 가능)
7. SQLite DB 파일은 컨테이너 재기동에도 유실되지 않음

### 비기능 요구사항
1. 무료 운영 (월 $0)
2. 배포 스크립트 1회 실행으로 완료
3. 기존 docker-compose.yml 호환성 유지
4. 서버 프로세스는 non-root 로 실행
5. nginx 리버스 프록시 뒤에서도 클라이언트 IP 기반 rate limit 정확히 동작
6. `JWT_SECRET` 미설정 시 서버 기동 거부 (운영 안전성)

## 현재 인프라 구성 (v2.0 기준)

### docker-compose.yml

```yaml
services:
  game-server:
    build: ./server
    restart: unless-stopped
    env_file: .env              # JWT_SECRET/OAuth/CORS_ORIGIN 등 주입
    volumes:
      - game-data:/app/data     # SQLite DB 영속화
    expose:
      - "3000"
    healthcheck:
      test: ["CMD", "wget", "--spider", "http://localhost:3000/api/rooms"]
      interval: 30s
  web:
    build: .
    ports: ["9090:80"]
    depends_on:
      game-server:
        condition: service_healthy
volumes:
  game-data:
```

- `env_file: .env` — 비밀값 외부화, `.env.example` 템플릿 제공
- `game-data` named volume — `/app/data/ofc.db` SQLite 파일 영속화
- `depends_on.condition: service_healthy` — game-server 가 `/api/rooms` 에 200 응답할 때까지 web 컨테이너 기동 지연
- `expose` (publish 아님) — game-server 는 외부에 직접 노출되지 않고 nginx 를 통해서만 접근

**근거**: `docker-compose.yml:1-27`

### server/Dockerfile

- Node 20 Alpine 기반
- `better-sqlite3` 네이티브 빌드용 `python3 make g++` 추가
- `USER app` (non-root 실행) — HIGH-5 대응
- `HEALTHCHECK` 내장 — compose 와 이중 안전망
- `/app/data` 소유권을 `app:app` 으로 설정 → volume 마운트 후에도 쓰기 가능

**근거**: `server/Dockerfile:1-31`

### server/index.js 기동 가드

```javascript
if (!process.env.JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET 환경변수가 설정되지 않았습니다.');
  process.exit(1);
}
jwtUtil.init(process.env.JWT_SECRET);

app.set('trust proxy', 1);   // nginx X-Forwarded-For 신뢰
app.use('/auth', rateLimit({ windowMs: 60000, max: 10 }), authRouter);
```

- **JWT_SECRET 필수화**: CRIT-1 대응. 환경 무관 강제. 누락 시 즉시 종료
- **trust proxy 1**: nginx 리버스 프록시 뒤에서 `X-Forwarded-For` 첫 hop 신뢰 → `/auth/*` rate limit(60s / 10회) 이 실제 클라이언트 IP 기준으로 동작
- **CORS_ORIGIN 누락 경고**: NODE_ENV=production 에서 미설정 시 warn 로그

**근거**: `server/index.js:22-39`

### nginx.conf

- 단일 80 포트에서 4개 upstream 분기: `/auth/` · `/api/` · `/ws/` · `/`
- `/ws/` 에 `proxy_http_version 1.1` + `Upgrade/Connection` 헤더 + 24h timeout
- `X-Forwarded-Proto $scheme` — 서버 trust proxy 와 정확히 매칭
- `/.well-known/acme-challenge/` 선행 location — 향후 Let's Encrypt 연동 시 nginx 재시작 불필요
- `add_header` 보안 3종 (X-Content-Type-Options / X-Frame-Options / Referrer-Policy) — MED-6
- gzip + 정적 에셋 `immutable` 캐시

**근거**: `nginx.conf:1-66`

### Cloudflare Quick Tunnel (deploy-tunnel.sh)

```bash
PORT=${1:-9090}
cloudflared tunnel --url http://localhost:$PORT
```

- cloudflared 미설치 시 OS별 설치 가이드 출력 (winget / brew / curl)
- `curl -sf http://localhost:$PORT` 프리체크 — docker compose up 누락 감지
- 실제 검증: Quick Tunnel 이 발급한 `*.trycloudflare.com` HTTPS URL 로 WebSocket(WSS) 까지 정상 동작 확인
- Quick Tunnel 은 무계정/무설정 — 재실행마다 URL 변경됨. 상시 운영에는 Named Tunnel 또는 Oracle Cloud 필요

**근거**: `deploy-tunnel.sh:1-35`

### .env.example

```
DOMAIN=ofc.example.com
NODE_ENV=production
CORS_ORIGIN=https://ofc.example.com
GOOGLE_CLIENT_ID=...
KAKAO_REST_API_KEY=...
JWT_SECRET=generate-a-random-256bit-secret-here
```

`JWT_SECRET` 생성: `openssl rand -hex 32`

**근거**: `.env.example:1-21`

## 구현 상태

| 항목 | 상태 | 비고 |
|------|------|------|
| Docker 빌드 (Flutter Web + Node.js) | 완료 | `Dockerfile`, `server/Dockerfile` (non-root) |
| Nginx 리버스 프록시 | 완료 | `nginx.conf` (4 location + 보안 헤더 + ACME) |
| docker-compose 개발용 | 완료 | `env_file` + `game-data` volume + healthcheck |
| JWT_SECRET 필수화 | 완료 | `server/index.js:22-25` process.exit(1) |
| trust proxy + rate limit | 완료 | `server/index.js:31, 39` |
| non-root 컨테이너 실행 | 완료 | `server/Dockerfile:17-19, 28` |
| Cloudflare Quick Tunnel 스크립트 | 완료 | `deploy-tunnel.sh` (실 검증 통과) |
| `.env.example` 템플릿 | 완료 | DOMAIN/OAuth/JWT_SECRET 포함 |
| Named Cloudflare Tunnel (고정 URL) | 예정 | 상시 운영용 |
| 프로덕션 docker-compose | 예정 | `docker-compose.prod.yml` + certbot |
| SSL nginx 설정 (443 + HTTP/2) | 예정 | nginx.conf 수정 |
| Oracle Cloud Free Tier 배포 스크립트 | 예정 | `setup.sh`, `deploy.sh` |

## DoD (Definition of Done)

- [x] `docker compose up -d` 1회 실행으로 localhost:9090 에서 완전히 동작
- [x] `JWT_SECRET` 누락 시 서버가 기동하지 않음
- [x] 컨테이너 재기동 후에도 방 상태는 리셋되지만 DB(user/auth)는 보존됨
- [x] `deploy-tunnel.sh` 로 외부 HTTPS URL 즉시 발급 가능
- [ ] `docker-compose.prod.yml` + Let's Encrypt 로 고정 도메인에서 WSS 서비스
- [ ] Oracle Cloud Free Tier 1-command 배포

## Changelog

| 날짜 | 버전 | 변경 내용 | 변경 유형 | 결정 근거 |
|------|------|-----------|----------|----------|
| 2026-04-17 | v2.0 | 드리프트 반영: cloudflared quick tunnel 실검증 완료, docker-compose env_file+volume+healthcheck, trust proxy 1, JWT_SECRET 필수화, non-root, nginx ACME+보안헤더. 구현 상태 7개 항목 완료 마크, 남은 3개 항목 예정 유지 | TECH | W2-A. 실제 구현이 v1.0 스펙을 초과 달성했으나 PRD 미반영 드리프트. 신규 참여자/재배포 시 참조 문서 필요 |
| 2026-03-25 | v1.0 | 최초 작성 | - | - |
