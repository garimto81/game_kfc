# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 프로젝트 개요

**OFC Pineapple** — Pure Open Face Chinese Poker (Pineapple) 정식 규칙 구현. Flutter 클라이언트 + Python 온라인 서버 (Docker 배포).

- **Layer 0 PRD**: `docs/00-prd/layer0-ofc.prd.md` (Pure OFC Pineapple 정식 규칙)
- **Online PRD**: `docs/00-prd/online-multiplayer.prd.md` (v3.2, 온라인 멀티플레이어)
- **기술 설계**: `docs/02-design/layer0-ofc.design.md`
- **현재 단계**: Layer 0 구현 완료 + 온라인 멀티플레이어 완료 (Docker 배포)

---

## 빌드/테스트 명령

```bash
# Python 의존성 설치 (dev 포함)
pip install -e ".[dev]"

# Python 전체 테스트 (397 tests)
pytest

# Python 개별 파일 테스트
pytest tests/test_hand.py -v
pytest tests/test_combat.py -v
pytest tests/test_online_server.py -v  # 온라인 서버 63 tests

# Python 린트
ruff check src/ --fix

# Docker 서버 실행
docker compose up -d          # 서버 시작 (port 8000)
docker compose down           # 서버 중지
docker compose up --build -d  # 재빌드 후 시작

# 외부 네트워크 접속 (ngrok 터널링)
ngrok http 8000               # 공개 HTTPS URL 생성 → 다른 네트워크에서 접속 가능

# Flutter Web 빌드
cd card_ofc_flutter && flutter build web --output=../web_build

# Flutter 테스트
cd card_ofc_flutter && flutter test
```

---

## 코드 아키텍처

### Python 게임 로직 (src/)

```
src/game.py          ← GameState, RoundManager (라운드/페이즈 관리)
src/combat.py        ← CombatResolver (3라인 전투 판정, 훌라, 데미지)
     |
src/board.py         ← OFCBoard (Front/Mid/Back 배치, Foul 감지)
src/hand.py          ← evaluate_hand(), compare_hands() (핸드 판정)
src/economy.py       ← Player (골드, 이자, 연승/연패, 별 강화)
src/card.py          ← Card, Rank, Suit (기반 도메인 모델)
src/pool.py          ← SharedCardPool (카드 풀 관리, 레벨별 드롭률)
```

### Python 온라인 서버 (server/)

```
server/main.py       ← FastAPI app, REST API, WebSocket endpoints, auto-cleanup
server/config.py     ← 환경변수 로드 (HOST, PORT, ALLOWED_ORIGINS 등)
server/models.py     ← Room, RoomStatus, CreateRoomRequest (Pydantic)
server/room_manager.py ← RoomManager (방 CRUD, 세션 토큰, 재접속, Lobby broadcast)
server/game_session.py ← GameSession (OFC Pineapple 게임 세션, src/ 모듈 활용)
```

### Flutter 클라이언트 (card_ofc_flutter/lib/)

```
lib/
├── main.dart
├── logic/           ← 게임 로직 (deck, hand_evaluator, foul_checker, scoring, AI 등)
├── models/          ← freezed 데이터 모델 (card, board, game_state, player 등)
├── network/         ← online_client.dart (REST + WebSocket 클라이언트)
├── providers/       ← Riverpod providers (game, online_game, score, settings 등)
├── services/        ← audio_service, stats_service
└── ui/
    ├── screens/     ← home, game, game_over, online_lobby, online_game, score, settings, tutorial
    └── widgets/     ← board, card, hand, line_slot, opponent_board, foul_warning 등
```

### 모듈별 책임 (Python src/)

| 모듈 | 핵심 클래스/함수 | 설명 |
|------|-----------------|------|
| `card.py` | `Card`, `Rank`, `Suit` | 수트 순환 우위: `(defender.suit % 4) + 1 == attacker.suit` |
| `hand.py` | `evaluate_hand()`, `compare_hands()` | Front(3장) = 스트레이트/플러시 불가. 비교: 핸드강도 → 강화카드수 → 수트우위 → 최고랭크 |
| `board.py` | `OFCBoard`, `FoulResult` | Back>=Mid>=Front 위반 감지. Foul 라인은 HandType -1 강등 |
| `economy.py` | `Player` | 이자=min(gold//10, 5), 연승/연패 보너스(2연=+1, 3~4연=+2, 5+연=+3) |
| `pool.py` | `SharedCardPool` | 52종 x 등급별 복사본. `random_draw_n(n, level)` = 레벨 기반 가중치 드로우 |
| `combat.py` | `CombatResolver` | Foul 적용 후 3라인 비교. 스쿠프(3:0)+2 추가. 훌라=winner>=2 + synergy>=3 -> x4 |
| `game.py` | `GameState`, `RoundManager` | 페이즈: prep->combat->result->prep. 라운드 종료 시 보드 리셋 |

### 모듈별 책임 (Python server/)

| 모듈 | 핵심 클래스/함수 | 설명 |
|------|-----------------|------|
| `main.py` | `app` (FastAPI) | REST API (rooms CRUD), WebSocket (game/lobby), SPA 정적 파일 서빙, auto-cleanup |
| `config.py` | `HOST`, `PORT`, `ALLOWED_ORIGINS` | 환경변수 기반 서버 설정 |
| `models.py` | `Room`, `RoomStatus`, `CreateRoomRequest` | Pydantic 모델 (waiting/playing/finished) |
| `room_manager.py` | `RoomManager` | 인메모리 방 관리, 세션 토큰 발급/검증, 재접속, Lobby WebSocket broadcast |
| `game_session.py` | `GameSession` | OFC Pineapple 라운드 진행 (R0: 5장, R1~R4: 3장), 보드 비교, 점수 계산 |

---

## 핵심 게임 메커니즘 (Layer 0 — Pure OFC Pineapple)

| 메커니즘 | 설명 |
|----------|------|
| **카드 시스템** | 52장 표준 덱, 랭크 2~A (A=최강), 수트 제외 (타이브레이커 없음) |
| **OFC 3라인 배치** | Back(5칸) >= Mid(5칸) >= Front(3칸) 강도 유지 의무, 위반 시 Foul |
| **Pineapple 딜링** | R0: 5장 전부 배치, R1~R4: 3장 딜 -> 2장 배치 + 1장 버림 |
| **Foul 패널티** | 위반 시 전 라인 무효, 상대에게 6점 고정 지급 |
| **Scoop 보너스** | 3라인 전승(3:0) 시 +3점 추가 (총 6점) |
| **Royalty** | 라인별 특정 핸드 달성 시 추가 점수 (Bottom/Mid/Top 각각 별도 테이블) |
| **Fantasyland** | Top QQ+ 달성 시 다음 핸드 14~17장 한번에 딜링 |
| **온라인 멀티플레이어** | Python 서버(Docker) + Flutter Web/Mobile, 실시간 WebSocket |

---

## 개발 환경 요구사항

| 도구 | 버전 | 용도 |
|------|------|------|
| Python | 3.12+ | 게임 로직 + 온라인 서버 |
| Flutter | 3.41+ | 클라이언트 앱 (Web/iOS/Android) |
| Docker | 29+ | 서버 컨테이너 배포 |
| Docker Compose | v5+ | 단일 명령 서버 실행 |
| ngrok | 3.20+ | 외부 네트워크 접속 터널링 (선택) |

---

## 개발 단계 순서

```
Phase 1 (완료): PRD 작성
Phase 2 (완료): 기술 설계
Phase 3 (완료): TDD 테스트 작성 → tests/
Phase 4 (완료): POC 구현 → src/
Phase 5 (완료): QA & 검증
Phase 6 (완료): Flutter OFC Pineapple 클라이언트 (144 tests)
Phase 7 (완료): 온라인 멀티플레이어 서버 (57 tests)
Phase 8 (완료): Docker 배포 + 재접속 + Public Room Listing
Phase 9 (완료): LAN 레거시 코드 제거
```

---

## 개발 규칙

- **언어**: 한글 출력, 기술 용어는 영어 유지
- **TDD**: 테스트 먼저 작성 (Red → Green → Refactor)
- **경로**: 절대 경로만 사용

---

## 문서 구조

| 문서 | 경로 | 설명 |
|------|------|------|
| Layer 0 PRD | `docs/00-prd/layer0-ofc.prd.md` | Pure OFC Pineapple 정식 규칙 |
| Online PRD | `docs/00-prd/online-multiplayer.prd.md` | 온라인 멀티플레이어 + Docker |
| Layer 0 설계 | `docs/02-design/layer0-ofc.design.md` | Flutter 클라이언트 기술 설계 |
| Layer 0 계획 | `docs/01-plan/layer0-ofc.plan.md` | 구현 계획 |
| 원본 PRD | `docs/01-plan/card-autochess.prd.md` | 원본 카드 오토체스 PRD (레거시) |

### 디렉토리 구조

```
C:\claude\card_ofc\
├── src/                    ← Python 게임 로직 (card, hand, board, combat 등)
├── server/                 ← Python 온라인 서버 (FastAPI + WebSocket)
├── tests/                  ← Python 테스트 (397 tests)
├── card_ofc_flutter/       ← Flutter 클라이언트 (Web/iOS/Android)
│   └── lib/
│       ├── logic/          ← Flutter 게임 로직
│       ├── models/         ← freezed 데이터 모델
│       ├── network/        ← online_client.dart
│       ├── providers/      ← Riverpod providers
│       ├── services/       ← audio, stats
│       └── ui/             ← screens + widgets
├── web_build/              ← Flutter Web 빌드 산출물
├── Dockerfile              ← Docker 빌드 설정
├── docker-compose.yml      ← Docker Compose 설정
├── .env.example            ← 환경변수 기본값
└── docs/                   ← PRD, 계획, 설계, 보고서
```
