# 실시간 프로토콜 PRD (REST + WebSocket)

## 개요

### 목적
OFC Pineapple 온라인 대전의 클라이언트-서버 실시간 통신 계약(REST + WebSocket)을 단일 출처로 정의한다. 메시지 타입, 발생 조건, 근거 코드 라인까지 1:1 매핑하여 클라이언트 재작성/확장 시 회귀를 방지한다.

### 범위
- REST API 5종 (방 관리 + 인증 verify)
- WebSocket 연결 수명주기 (로비/게임 분리)
- Client → Server 메시지 14종
- Server → Client 메시지 20+종
- 에러 코드 체계 + 불변식

### 범위 외
- 메시지의 게임 규칙적 의미 (→ `prd-game-rules.prd.md`)
- OAuth 제공자별 인증 흐름 상세 (→ `prd-auth-security.prd.md`)
- 배포/인프라 세부 (→ `prd-deployment.prd.md`)

---

## 네트워크 아키텍처

### 구성 요소

```
[Flutter Web]
      │ HTTPS (443)
      ▼
   [nginx]  ─── /auth/*  ─┐
            ─── /api/*   ─┼──▶ [game-server:3000]
            ─── /ws/*    ─┘      (Express + ws)
```

| 경로 | 프록시 타깃 | 참조 |
|------|------------|------|
| `/auth/*` | `http://game-server:3000` | `nginx.conf:25-31` |
| `/api/*` | `http://game-server:3000` | `nginx.conf:34-40` |
| `/ws/*` | `http://game-server:3000` (Upgrade) | `nginx.conf:43-54` |
| `/` | Flutter Web SPA (`try_files`) | `nginx.conf:57-59` |

### WebSocket 경로

| 경로 | 용도 | 핸들러 |
|------|------|-------|
| `/ws/lobby` | 로비 방 목록 구독 | `handleLobbyConnection` (`index.js:212`) |
| `/ws/game/{roomId}` | 게임방 세션 | `handleGameConnection` (`index.js:266`) |

### 인증 방식

- `/auth/*` → HTTP JSON + `JWT_SECRET` 서명 (`index.js:22-26`)
- `/ws/game/*` → **메시지 기반 `auth`** 권장 (`index.js:366-381`). URL 쿼리 `?token=` 은 deprecated — 로그 노출 이슈(CRIT-3, `index.js:196-202` 주석 참조).
- Rate limit: `/auth/*` 60초당 10회 (`index.js:39`).

---

## REST API

### RoomInfo 공통 스키마

`toRoomInfo()` 반환값 (`room.js:66-77`). 로비 목록·생성 응답·`roomCreated`/`roomUpdated` 브로드캐스트에 공통 사용.

```json
{
  "id": "string (uuid v4)",
  "name": "string",
  "max_players": "number (기본 3)",
  "turn_time_limit": "number (seconds, 기본 60)",
  "playerCount": "number",
  "players": "string[] (플레이어 이름 목록)",
  "phase": "string ('waiting'|'playOrFold'|'playing'|'scoring')",
  "hasPassword": "boolean"
}
```

### GET /api/rooms

로비 방 목록 조회. 참조: `index.js:97-100`.

**Request**: body 없음
**Response 200**: `RoomInfo[]` (빈 배열 가능)

### POST /api/rooms

방 생성. 참조: `index.js:105-122`.

**Request body**:
```json
{
  "name": "string (required, non-empty)",
  "max_players": "number (optional, default 3)",
  "turn_time_limit": "number (optional seconds, default 60)",
  "password": "string (optional, default '')"
}
```
**Response 201**: `RoomInfo` (생성된 방)
**Error 400**: `{ "error": "방 이름이 필요합니다." }` (`index.js:108-110`)
**부수효과**: `broadcastLobby('roomCreated', { room: RoomInfo })` (`index.js:87`)

### POST /api/quickmatch

빠른 매칭. 참조: `index.js:127-145`.

**Request**: body 없음
**Response 200**: `{ "roomId": "string (uuid)" }`
**매칭 로직**: `phase=='waiting' && players.size<maxPlayers && password===''` 인 방 우선 탐색, 없으면 3인 60초 방 신규 생성 (`index.js:136-140`).

### DELETE /api/rooms/:roomId

방 삭제. 참조: `index.js:150-164`.

**Request**: URL param `roomId`
**Response 200**: `{ "success": true }`
**Error 404**: `{ "error": "방을 찾을 수 없습니다." }`
**부수효과**: `broadcastLobby('roomDeleted', { roomId })` (`index.js:161`)

### POST /auth/verify (상세는 prd-auth-security 참조)

OAuth 토큰 검증 + JWT 발급. 참조: `server/auth/auth-router.js` (라우터 등록 `index.js:39`).

| 섹션 | 내용 |
|------|------|
| Request | `> TODO: provider별 payload 스키마 추출` (Google/Kakao) |
| Response 200 | `> TODO: JWT + user info 스키마 추출` |
| Error | `> TODO: 401/500 에러 스키마 추출` |

---

## WebSocket 연결 수명주기

### 연결 흐름 (Game)

```
  Client                              Server
    │                                   │
    │── GET /ws/game/{roomId} (Upgrade)─▶│  index.js:193-205
    │                                   │
    │── auth {token} (옵션, JWT) ──────▶│  index.js:366-381
    │◀── authResult {success, name}─────│
    │                                   │
    │── joinRequest {name, password}───▶│  handleJoinRequest :440
    │◀── joinAccepted {playerId, ...}───│  index.js:467-477
    │◀── playerJoined (to others) ──────│  index.js:480-483
    │                                   │
    │── heartbeat (25s 주기)───────────▶│  index.js:361-363
    │◀── pong ──────────────────────────│
    │                                   │
    │   (게임 진행: startGame/placeCard 등)
```

### Heartbeat & Ping/Pong

| 방향 | 주기 | 타임아웃 | 참조 |
|------|------|----------|------|
| Client → Server | 25s 애플리케이션 `heartbeat` | 3회 연속 pong 미수신 → `_handleUnexpectedDisconnect` | `online_client.dart:155-164, 286-293` |
| Server → Client | 30s WebSocket `ping` 프레임 | 2회 연속 응답 없으면 `terminate` | `index.js:173-184` |
| 게임 서버 응답 | `heartbeat` → `pong` 메시지 | — | `index.js:361-363`, lobby `index.js:225-228` |

### URL 토큰 deprecation

- **Deprecated**: `/ws/game/{roomId}?token=<JWT>` — CRIT-3 이슈로 단계적 폐지. URL은 nginx/프록시 로그·브라우저 히스토리에 노출됨.
- **권장**: 연결 후 `auth` 메시지로 토큰 전달 (`online_client.dart:148-150`, `index.js:366-381`).
- **하위 호환**: 서버는 URL 토큰 파싱 유지 (`index.js:196-202`), 클라이언트는 2026-04 이후 미사용.

### 재접속

| 조건 | 동작 | 참조 |
|------|------|------|
| `onDone` / `onError` | `_handleUnexpectedDisconnect` → `autoReconnect` 트리거 | `online_client.dart:136-143, 306-319` |
| `missedPongs >= 3` | dead connection 판정 → 재접속 | `online_client.dart:158-161` |
| 서버 `disconnectTimer` | waiting 30s / playing 120s 유예 후 제거 | `room.js:226-236` |
| 전원 이탈 유예 | 10s 내 미복귀 시 방 제거 | `index.js:331-342` |
| `sessionToken` 만료 | `error { rejoinRequired: true }` → 재입장 필요 | `index.js:499-502` |

---

## Client → Server 메시지 (14종)

> payload 세부 스키마는 Stage 2에서 채운다. 사전 조건과 근거 라인 우선.

| # | type | payload 요약 | 사전 조건 | 핸들러 | 예상 에러 |
|---|------|-------------|----------|--------|----------|
| 1 | `heartbeat` | `{}` | 연결 완료 | `index.js:361-363` | — (pong 응답) |
| 2 | `auth` | `{ token: JWT }` | 연결 완료 | `index.js:366-381` | `authResult {success:false}` |
| 3 | `joinRequest` | `{ playerName, password }` | 미참가 상태 | `handleJoinRequest` `index.js:440-487` | 이름 누락, 길이 초과, 방 가득, `INVALID_PASSWORD`, 진행 중 |
| 4 | `reconnect` | `{ sessionToken }` | 토큰 보유 | `handleReconnect` `index.js:489-517` | `rejoinRequired`, 재접속 실패 |
| 5 | `startGame` | `{}` | 호스트 본인, 2명+ | `handleStartGame` `index.js:519-556` | 호스트 아님, 인원 부족, 이미 진행 중 |
| 6 | `placeCard` | `{ card, line }` | 본인 턴(비FL), 손패 보유 | `handlePlaceCard` `index.js:583-601` | 턴 아님, 확정됨, 라인 가득, 카드 없음 |
| 7 | `unplaceCard` | `{ card, line }` | 이번 라운드 배치 카드 | `handleUnplaceCard` `index.js:603-615` | 확정됨, 이전 라운드 카드 |
| 8 | `discardCard` | `{ card }` | R2+ 또는 FL, 1장 한도 | `handleDiscardCard` `index.js:617-629` | R1 불가, 한도 초과, 카드 없음 |
| 9 | `unDiscardCard` | `{ card }` | 버린 카드 보유 | `handleUnDiscardCard` `index.js:631-643` | 확정됨, 카드 없음 |
| 10 | `confirmPlacement` | `{}` | 손패 0, 버림 유효, 라인 유효 | `handleConfirmPlacement` `index.js:645-656` | 이미 확정, 장수 불일치, 버림 불일치 |
| 11 | `playOrFoldResponse` | `{ choice: 'play' \| 'fold' }` | 5-6인, 본인 선택 차례 | `handlePlayOrFoldResponse` `index.js:745-788` | 유효하지 않은 선택, 순서 아님 |
| 12 | `readyForNextHand` | `{}` | `scoring` phase | `handleReadyForNextHand` `index.js:658-694` | — |
| 13 | `leaveGame` | `{}` | 참가 상태 | `handleLeaveGame` `index.js:696-743` | — |
| 14 | `emote` | `{ emote_id }` | 참가 상태 | `handleEmote` `index.js:790-793` | — |

**알 수 없는 타입**: `error { message: '알 수 없는 메시지 타입: ...' }` (`index.js:431-433`).

**Lobby WS**: `heartbeat` 만 허용, 그 외 무시 (`index.js:221-232`).

### C→S payload 스키마 (우선순위 9종)

#### auth

**Payload**:
```json
{
  "token": "string (required, JWT) — /auth/verify 로 발급된 토큰"
}
```
**근거**: `server/index.js:366-381`, `lib/network/online_client.dart:148-150`

#### joinRequest

**Payload**:
```json
{
  "playerName": "string (required unless ws.authUser 설정됨, 1~50자)",
  "password": "string (optional, hasPassword 방에서 필수, 빈 문자열 허용)"
}
```
**근거**: `server/index.js:440-456`, `server/game/room.js:79-82, 91-136`, `lib/network/online_client.dart:152`

> `ws.authUser.name` 이 있으면 `playerName` 은 서버에서 무시되고 인증된 이름이 사용된다 (`index.js:441`).

#### reconnect

**Payload**:
```json
{
  "sessionToken": "string (required, UUID v4) — joinAccepted 응답의 sessionToken"
}
```
**근거**: `server/index.js:489-517`, `server/game/room.js:188-214`, `lib/network/online_client.dart:232-302`

#### startGame

**Payload**: `{}` (빈 객체 — 호스트 검증은 ws.playerId 기반)

**근거**: `server/index.js:391-393, 519-556`, `server/game/room.js:241-256`

#### placeCard

**Payload**:
```json
{
  "card": {
    "rank": "number (required, 2~14)",
    "suit": "number (required, 1=club, 2=diamond, 3=heart, 4=spade)"
  },
  "line": "string (required, 'top' | 'mid' | 'bottom')"
}
```
**근거**: `server/index.js:583-601`, `server/game/room.js:498-537`, `server/game/deck.js:20-26`, `lib/network/online_client.dart:167-172`

#### unplaceCard

**Payload**:
```json
{
  "card": {
    "rank": "number (required, 2~14)",
    "suit": "number (required, 1~4)"
  },
  "line": "string (required, 'top' | 'mid' | 'bottom')"
}
```
**근거**: `server/index.js:603-615`, `server/game/room.js:542-568`, `lib/network/online_client.dart:181-186`

#### discardCard

**Payload**:
```json
{
  "card": {
    "rank": "number (required, 2~14)",
    "suit": "number (required, 1~4)"
  }
}
```
**근거**: `server/index.js:617-629`, `server/game/room.js:573-601`, `lib/network/online_client.dart:174-179`

#### confirmPlacement

**Payload**: `{}` (빈 객체 — 배치 상태는 서버가 보유)

**근거**: `server/index.js:411-413, 645-656`, `server/game/room.js:628-690`, `lib/network/online_client.dart:195-197`

#### playOrFoldResponse

**Payload**:
```json
{
  "choice": "string (required, 'play' | 'fold')"
}
```
**근거**: `server/index.js:745-788`, `server/game/room.js:313-369`, `lib/network/online_client.dart:223-225`

---

## Server → Client 메시지 (20+종)

> payload 세부 스키마는 Stage 2에서 채운다. 범위·발생 조건 우선.

### 로비 브로드캐스트 (`/ws/lobby`)

| # | type | payload 요약 | 범위 | 발생 조건 | 근거 |
|---|------|-------------|-----|-----------|------|
| 1 | `roomList` | `{ rooms: RoomInfo[] }` | 연결 직후 개인 | 로비 연결 완료 | `index.js:219` |
| 2 | `roomCreated` | `{ room: RoomInfo }` | 로비 전체 | `registerRoom` | `index.js:87` |
| 3 | `roomUpdated` | `{ room: RoomInfo }` | 로비 전체 | `broadcastRoomUpdate` (참가/이탈/호스트변경) | `index.js:258-260` |
| 4 | `roomDeleted` | `{ roomId }` | 로비 전체 | `empty` 이벤트, DELETE | `index.js:66, 161` |

### 게임 세션 개인 응답 (`/ws/game/*`)

| # | type | payload 요약 | 범위 | 발생 조건 | 근거 |
|---|------|-------------|-----|-----------|------|
| 5 | `authResult` | `{ success, name? , message? }` | 본인 | `auth` 응답 | `index.js:373-378` |
| 6 | `joinAccepted` | `{ playerId, sessionToken, playerCount, hostId, players, playerName }` | 본인 | `joinRequest` 성공 | `index.js:467-477` |
| 7 | `reconnected` | `{ playerId, gameState }` | 본인 | `reconnect` 성공 | `index.js:508-514` |
| 8 | `pong` | `{}` | 본인 | `heartbeat` 응답 | `index.js:362, 226` |
| 9 | `dealCards` | `{ cards, round, inFantasyland, handNumber, turnDeadline, turnTimeLimit, serverTime }` | 본인(현재 턴 or FL) | 턴 시작/라운드 전환 | `index.js:868-876, 883-891, 902-910` |
| 10 | `foldedThisHand` | `{ gameState }` | 본인 | 턴 타임아웃으로 auto-fold | `index.js:565-567, 677-679` |
| 11 | `playOrFoldRequest` | `{ requiredPlayers, totalPlayers, playCount?, foldCount? }` | 본인(선택 차례) | 5-6인 phase | `index.js:540-543, 781-786` |
| 12 | `error` | `{ message, code?, rejoinRequired? }` | 본인 | 검증 실패, 알 수 없는 타입 | `index.js:269, 285, 292, 432, ...` |

### 게임 세션 방 전체 브로드캐스트

| # | type | payload 요약 | 범위 | 발생 조건 | 근거 |
|---|------|-------------|-----|-----------|------|
| 13 | `playerJoined` | `{ playerCount, players }` | 방 전체(본인 제외) | 참가 수락 | `index.js:480-483` |
| 14 | `playerDisconnected` | `{ playerId }` | 방 전체(본인 제외) | WS 끊김 | `index.js:321` |
| 15 | `playerReconnected` | `{ playerId }` | 방 전체(본인 제외) | 재접속 성공 | `index.js:516` |
| 16 | `playerLeft` | `{ reason, players }` | 방 전체 | leaveGame, disconnectTimeout | `index.js:71, 708` |
| 17 | `hostChanged` | `{ hostId }` | 방 전체 | 호스트 이탈 | `index.js:704` |
| 18 | `dealerSelection` | `{ dealerCards, dealerId, playerOrder }` | 방 전체 | startGame 직후 | `index.js:529-533` |
| 19 | `playOrFoldUpdate` | `{ playCount, foldCount, remaining, currentPlayerId, lastChoice? }` | 방 전체 | POF 응답/초기화 | `index.js:545-549, 773-779` |
| 20 | `playOrFoldResult` | `{ choices, activePlayers }` | 방 전체 | POF 전원 결정 | `index.js:761-764` |
| 21 | `gameStart` | `{ turnTimeLimit, currentTurnPlayerId, dealerButtonId, ...gameState }` | 방 전체 | 새 핸드 시작 | `index.js:572-577, 683-688` |
| 22 | `turnChanged` | `{ currentTurnPlayerId, turnDeadline, turnTimeLimit }` | 방 전체 | confirmPlacement, advanceTurn | `index.js:807-811` |
| 23 | `stateUpdate` | `{ players, phase, handNumber, turnDeadline, turnTimeLimit, serverTime, currentTurnPlayerId }` | 방 전체(개별) | 카드 이동 후 | `broadcastStateUpdate` `index.js:917-930` (`room.broadcastIndividual` `room.js:1026-1033`) |
| 24 | `lineCompleted` | `{ playerId, line }` | 방 전체 | 라인 5/3장 완성 | `index.js:596`, `room.js:532-536` |
| 25 | `waitingForFL` | `{ message }` | 방 전체 | 비FL 완료·FL 대기 | `index.js:837-839` |
| 26 | `waitingReady` | `{ readyCount, totalCount }` | 방 전체 | readyForNextHand 부분 | `index.js:664-667` |
| 27 | `allPlayersReady` | `{}` | 방 전체 | 전원 ready | `index.js:670` |
| 28 | `handScored` | `{ results, handNumber }` | 방 전체 | endHand | `index.js:824-827` |
| 29 | `gameOver` | `{ results }` | 방 전체 | 게임 종료(1인 이하/leaveGame) | `index.js:76, 721, 851` |
| 30 | `emote` | `{ playerId, emote_id }` | 방 전체 | `emote` 메시지 | `index.js:792` |

> Room-level broadcast: `room.broadcast` `room.js:1015-1021` (excludeId 지원), 개별: `room.broadcastIndividual` `room.js:1026-1033`, 1:1: `room.sendToPlayer` `room.js:1005-1010`.

### S→C payload 스키마 (우선순위 9종)

#### joinAccepted

**Payload**:
```json
{
  "playerId": "string (required, UUID v4)",
  "sessionToken": "string (required, UUID v4) — 재접속 시 필요",
  "playerCount": "number (required, 현재 방 인원)",
  "hostId": "string (required, 호스트 playerId)",
  "players": "string[] (required, 방 내 플레이어 이름 배열)",
  "playerName": "string (required, 본인 확정된 이름)"
}
```
**근거**: `server/index.js:467-477`, `server/game/room.js:91-136`

#### reconnected

**Payload**:
```json
{
  "playerId": "string (required, UUID v4)",
  "gameState": "object (required) — getGameState(playerId) 결과 (players, phase, handNumber, turnDeadline, turnTimeLimit, currentTurnPlayerId 등 개별 시점 뷰)"
}
```
**근거**: `server/index.js:508-514`, `server/game/room.js:188-214, 968-985`

#### gameStart

**Payload**:
```json
{
  "turnTimeLimit": "number (required, 초 단위)",
  "currentTurnPlayerId": "string (required, 첫 턴 플레이어)",
  "dealerButtonId": "string (required, 딜러 버튼 보유자)",
  "players": "object[] (required, 개별 플레이어 상태 배열 — ...gameState spread)",
  "phase": "string (required, 'playing')",
  "handNumber": "number (required, 1부터 시작)",
  "turnDeadline": "number (required, epoch seconds)"
}
```
**근거**: `server/index.js:572-577, 683-688`, `server/game/room.js:startNewHand`

> `...handResult.gameState` 스프레드로 인해 `getGameState()` 의 모든 필드가 포함된다.

#### turnChanged

**Payload**:
```json
{
  "currentTurnPlayerId": "string (required, 다음 턴 플레이어)",
  "turnDeadline": "number (required, epoch seconds) — 턴 종료 시각",
  "turnTimeLimit": "number (required, 초 단위)"
}
```
**근거**: `server/index.js:807-811`, `server/game/room.js:advanceTurn`

#### handScored

**Payload**:
```json
{
  "handNumber": "number (required, 완료된 핸드 번호)",
  "results": {
    "<playerId>": {
      "name": "string (플레이어 이름)",
      "score": "number (이번 핸드 점수)",
      "totalScore": "number (= score, 클라이언트 호환 별칭)",
      "royalties": "object ({ top, mid, bottom, total }: 라인별 로열티 + 합계)",
      "royaltyTotal": "number (royalties.total 플랫 액세스)",
      "lineWins": "object ({ top, mid, bottom }: 각 라인 pair-wise 승리 카운트)",
      "lineResults": "object ({ <oppPlayerId>: { lines: { top: {result, myHand, oppHand}, mid, bottom }, scoopBonus, royaltyDiff, total } })",
      "fouled": "boolean",
      "foul": "boolean (= fouled, 클라이언트 호환 별칭)",
      "folded": "boolean (폴드 플레이어만 true)",
      "scooped": "boolean (상대에게 스쿱 당함)",
      "scoopedBy": "string[] (스쿱한 상대 playerId 배열)",
      "inFantasyland": "boolean (다음 핸드 FL 진입/유지 여부, 폴드/foul 시 미포함)"
    }
  }
}
```
**근거**: `server/index.js:823-828`, `server/game/scorer.js:14-175` (scoreHand), `server/game/room.js:841-924` (endHand, FL/폴드 병합)

#### dealCards

**Payload**:
```json
{
  "cards": "Card[] (현재 손에 든 카드 배열; Card = { rank: 2~14, suit: 1~4 })",
  "round": "number (1~5, 현재 라운드)",
  "inFantasyland": "boolean (FL 플레이어 여부)",
  "handNumber": "number (현재 핸드 번호)",
  "turnDeadline": "number (epoch seconds, 턴 종료 시각)",
  "turnTimeLimit": "number (초 단위, 턴당 제한 시간)",
  "serverTime": "number (epoch seconds, 딜 시점 서버 시각 — 클라이언트 시간 동기화용)"
}
```
**수신 대상**: 현재 턴 플레이어(비FL) + 모든 FL 플레이어. 순차 딜링이므로 다른 플레이어는 `handCount` 만 받음.
**근거**: `server/index.js:868-876` (현재 턴), `:883-891` (FL), `:902-910` (sendDealToPlayer)

#### stateUpdate

**Payload** (각 수신자별 개별화):
```json
{
  "phase": "string ('waiting'|'playOrFold'|'playing'|'scoring')",
  "handNumber": "number",
  "turnDeadline": "number (epoch seconds)",
  "turnTimeLimit": "number (초)",
  "serverTime": "number (epoch seconds)",
  "currentTurnPlayerId": "string|null",
  "players": {
    "<playerId>": {
      "name": "string",
      "board": "object ({ top: Card[3], mid: Card[5], bottom: Card[5] })",
      "hand": "Card[] (본인 + 현재 턴/confirmed/FL 조건 만족 시에만; 그 외는 [])",
      "handCount": "number (손패 개수, 타 플레이어도 확인 가능)",
      "inFantasyland": "boolean",
      "confirmed": "boolean (이번 라운드 배치 확정)",
      "fouled": "boolean",
      "folded": "boolean",
      "totalScore": "number",
      "connected": "boolean"
    }
  }
}
```
**프라이버시**: `hand` 필드는 `isMe && (현재턴 || confirmed || FL)` 조건일 때만 실제 카드, 그 외는 빈 배열 (`room.js:968-985`). 카드 누출 방지 불변식 INV-PR9.
**근거**: `server/index.js:917-930` (broadcastStateUpdate), `server/game/room.js:945-988` (getGameState), `:1026-1033` (broadcastIndividual)

#### playOrFoldRequest

**Payload**:
```json
{
  "requiredPlayers": "number (required, 4 고정 — play 인원 한도)",
  "totalPlayers": "number (required, 방 총 인원)",
  "playCount": "number (optional, 현재까지 play 선택 수 — 최초 요청엔 없음)",
  "foldCount": "number (optional, 현재까지 fold 선택 수 — 최초 요청엔 없음)"
}
```
**근거**: `server/index.js:540-543, 781-786`, `server/game/room.js:295-308`

#### error

**Payload**:
```json
{
  "message": "string (required, 사람 읽을 수 있는 한글 메시지)",
  "code": "string (optional, 현재 'INVALID_PASSWORD' 만 명시)",
  "rejoinRequired": "boolean (optional, true=세션 만료로 재참가 필요)"
}
```
**근거**: `server/index.js:432, 454, 495, 501`, `lib/network/online_client.dart:260-265`

---

## 에러 코드 체계

| code | 설명 | 발생 조건 | 클라이언트 대응 | 근거 |
|------|------|----------|----------------|------|
| `INVALID_PASSWORD` | 방 비밀번호 불일치 | `room.checkPassword` 실패 | 비밀번호 재입력 프롬프트 | `index.js:454`, `room.js:79-82` |
| `rejoinRequired` (flag) | 세션 만료/플레이어 제거 | `sessionTokens`에 없음, `players.get` null | `reconnect` 중단 → fresh `joinRequest` | `index.js:495, 499-502`, `online_client.dart:260-265` |
| `(메시지만)` 방 없음 | upgrade 후 방 삭제됨 | `rooms.get(roomId)` null | 로비로 복귀 | `index.js:267-271` |
| `(메시지만)` 잘못된 메시지 형식 | JSON parse 실패 | 비정상 바이트 | 무시 or 재연결 | `index.js:283-286` |
| `(메시지만)` 알 수 없는 메시지 타입 | `switch default` | 미구현 타입 | 로그 후 무시 | `index.js:431-433` |
| `(메시지만)` 서버 오류 | 핸들러 throw | 예외 | 재접속 | `index.js:290-293` |
| `(메시지만)` 이름/비밀번호/턴/확정 등 도메인 검증 | placeCard/confirmPlacement 등 | 규칙 위반 | UI 토스트 | `room.js:500-662` 전반 |

> 신규 코드 추가 시 위 테이블에 `code` 필드(문자열)를 공식 등록한다. 현재 `code`가 명시된 에러는 `INVALID_PASSWORD` 1건이다.

---

## 불변식 (Invariants)

| # | 불변식 | 구현 | 검증 대상 |
|---|--------|------|----------|
| INV-PR1 | `turnTimerGeneration` 증가 시 과거 세대 타이머는 작동하지 않는다 | `room.js:813, 818` | 턴 변경 레이스 컨디션 |
| INV-PR2 | WS 끊김 후 10s 내 전원 미복귀면 방이 제거된다 | `index.js:331-342` | 방 누수 방지 |
| INV-PR3 | `placeCard`는 `getCurrentTurnPlayerId() === playerId` 인 비FL 플레이어만 허용 | `room.js:507-509` | 턴 소유자 검증 |
| INV-PR4 | FL 플레이어는 턴 시스템과 독립적으로 `confirmPlacement` 가능 | `room.js:671-686` | FL/비FL 분리 |
| INV-PR5 | `sessionToken`은 `removePlayer` 시 즉시 `sessionTokens` 맵에서 제거된다 | `room.js:147-150` | 메모리 누수 방지 |
| INV-PR6 | 연결 해제 후 `waiting:30s / playing:120s` 내 미복귀면 플레이어 제거 | `room.js:226-236` | 좀비 플레이어 방지 |
| INV-PR7 | `JWT_SECRET` 미설정 시 서버 기동 거부 | `index.js:22-25` | 운영 안전성 |
| INV-PR8 | `joinRequest`는 `checkPassword` 통과 시에만 수락 | `index.js:452-456` | 방 비공개성 |
| INV-PR9 | `broadcastIndividual`은 각 플레이어별 뷰를 생성하여 손패 누출을 방지 | `room.js:1026-1033`, `getGameState` `room.js:968-985` | 카드 프라이버시 |
| INV-PR10 | `heartbeat` 3회 연속 pong 미수신 = dead connection | `online_client.dart:158-161` | 클라 재접속 트리거 |

> INV1~INV12 (게임 규칙 불변식)은 `prd-qa-automation.prd.md` 와 교차 참조. 위 INV-PR* 는 네트워크/프로토콜 계층 한정.

---

## 구현 맵

메시지 타입 ↔ 서버 코드 ↔ 클라이언트 코드 매핑.

| 메시지 | index.js | room.js | online_client.dart |
|--------|----------|---------|-------------------|
| `heartbeat`/`pong` | 361-363, 225-227 | — | 155-164, 286-293 |
| `auth`/`authResult` | 366-381 | — | 148-150 |
| `joinRequest`/`joinAccepted` | 383-384, 440-487 | `addPlayer` 91-136 | 152, 127-130 |
| `reconnect`/`reconnected` | 387-388, 489-517 | `reconnectPlayer` 188-214 | 232-302 |
| `startGame`/`dealerSelection`/`gameStart` | 391, 519-581 | `startGame` 241-256, `determineDealerButton` 261-290 | 215-217 |
| `placeCard`/`stateUpdate`/`lineCompleted` | 395, 583-601, 917-930 | `placeCard` 498-537 | 167-172 |
| `unplaceCard` | 399, 603-615 | `unplaceCard` 542-568 | 181-186 |
| `discardCard` | 403, 617-629 | `discardCard` 573-601 | 174-179 |
| `unDiscardCard` | 407, 631-643 | `unDiscardCard` 606-623 | 188-193 |
| `confirmPlacement`/`turnChanged`/`handScored` | 411, 645-656, 802-855 | `confirmPlacement` 628-690, `endHand` 841-924 | 195-197 |
| `playOrFoldResponse`/`playOrFoldRequest`/`playOrFoldUpdate`/`playOrFoldResult` | 415, 745-788, 540-549 | `initPlayOrFold` 295-308, `playOrFoldResponse` 313-369 | 223-225 |
| `readyForNextHand`/`waitingReady`/`allPlayersReady` | 419, 658-694 | `playerReady` 929-951 | 199-201 |
| `leaveGame`/`playerLeft`/`hostChanged`/`gameOver` | 423, 696-743 | `removePlayer` 141-183 | 203-213 |
| `emote` | 427, 790-793 | — | 219-221 |
| `dealCards` | 861-912 | `dealRound` 411-454 | (수신 처리: `online_game_provider.dart`) |
| `waitingForFL`/`foldedThisHand` | 835-841, 565-567 | `endHand` / auto-fold | (수신 처리) |
| `playerJoined`/`playerDisconnected`/`playerReconnected` | 321, 480-483, 516 | `disconnectPlayer` 219-236 | (수신 처리) |

---

## DoD (Definition of Done)

- [ ] REST 5개, C→S 14개, S→C 20+개 전 메시지의 payload 스키마가 확정되어 있다 (현재 `> TODO` placeholder)
- [ ] 클라이언트 `online_client.dart` / `online_game_provider.dart` 전 메시지 처리와 1:1 매핑이 검증된다
- [ ] 각 에러 코드가 `code` 필드를 갖는다 (현재 `INVALID_PASSWORD` 외는 메시지 기반)
- [ ] `INV-PR1~INV-PR10` 이 `prd-qa-automation` INV1~INV12 와 교차 참조된다
- [ ] nginx 프록시·docker-compose 수정 시 본 문서의 경로 테이블이 동기화된다

---

## Changelog

| 날짜 | 버전 | 변경 내용 | 변경 유형 | 결정 근거 |
|------|------|-----------|----------|----------|
| 2026-04-17 | v0.1 | skeleton 작성 (메시지 타입 목록 + 근거 라인 매핑, payload TODO) | - | prd-reinforcement-strategy §4.2 |
| 2026-04-17 | v0.2 | 핵심 15개 메시지 payload 스키마 실측 값으로 교체 (REST 4개 + RoomInfo + S→C 9개 상세: joinAccepted/reconnected/gameStart/turnChanged/handScored/dealCards/stateUpdate/playOrFoldRequest/error). handScored는 scorer.js 실제 필드(lineResults/royaltyTotal/scoopedBy 등)로 정정. | TECH | W1-B: prd-realtime-protocol payload 스키마 채움 |
