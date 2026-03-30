# QA 자동화 PRD

## 개요

- **목적**: OFC Pineapple Poker 2~6인 멀티플레이어 게임의 자동화된 품질 보증 체계 구축
- **배경**: 기존 QA는 "봇이 WS 메시지로 1핸드 완주 + 점수 합 0"만 검증. 카드 중복, 보드 완성도, 라인별 점수 정확성, UI 렌더링, 상대 카드 은닉, 재연결, 턴 순서 등 미검증. scorer.js 이중 카운팅 등 실제 버그가 발견됨.
- **범위**: 7-Level QA 계층 전체 (프로토콜 → 게임 로직 → 상태 동기화 → UI → 상호작용 → 에러 복구 → 스트레스)

## 요구사항

### 기능 요구사항

1. **서버 단위 테스트** — scorer, evaluator, royalty, deck, smart-bot 모듈별 독립 검증 (77개+)
2. **WS 프로토콜 테스트** — 2~6인 풀게임 시나리오, 불변식 12개 자동 검증
3. **에러 복구 테스트** — 재연결, 타임아웃, 비정상 입력, 순서 위반, 중복 확정, 퇴장, 호스트 이전, 비정상 JSON (9개 시나리오)
4. **Soak 테스트** — 1000+ 핸드 연속 자동 플레이, Chaos 모드 (랜덤 끊김/잘못된 입력)
5. **E2E 스크린샷 테스트** — Playwright 멀티 브라우저, 12개 시나리오 (88 체크포인트), aria-label 셀렉터
6. **스마트 AI 봇** — 전수 탐색 + 로열티 EV + Fantasyland 진입 최적화 (Foul 70%→12%)
7. **학습 데이터 수집** — JSONL state-action-reward 형식, 향후 AI 대전 모드용
8. **봇 벤치마크** — Smart vs Simple 성능 비교 (Foul률, 로열티, FL 진입률, 승률)

### 비기능 요구사항

1. 테스트 실행 시간: 단위 <30초, WS 프로토콜 <5분, Soak <10분
2. CI/CD 통합: `npm test`, `npx playwright test`로 실행 가능
3. 메모리 누수 없음: 1000핸드 후 heap 증가 <50MB
4. 백그라운드 실행: worktree 격리 + 별도 포트로 개발 작업 무중단
5. 스크린샷 리포트: HTML 형식, 체크포인트별 모든 플레이어 side-by-side 비교

## 7-Level QA 계층

| Level | 검증 대상 | 핵심 검증 항목 | 도구 |
|:-----:|----------|--------------|------|
| L1 | 프로토콜 무결성 | 메시지 스키마, 순서, 필수 필드 | ws-protocol.test.js |
| L2 | 게임 로직 무결성 | 카드 52장 고유성, 보드 완성도, 라인 W/L/D, 로열티, 턴 순서 | ws-protocol.test.js + evaluator/royalty 재검증 |
| L3 | 상태 동기화 | handScored 동일성, 상대 핸드 은닉, 턴 표시 일치 | 다중 WS 클라이언트 비교 |
| L4 | UI 정확성 | 카드 이미지 렌더링, 스코어 표시, 뒷면/앞면 전환 | Playwright + aria-label |
| L5 | 상호작용 | 카드 배치, Confirm/Undo/Discard, 타이머, Play/Fold | Playwright + game-actions.ts |
| L6 | 에러 복구 | 재연결, 타임아웃, 비정상 입력, 퇴장, 호스트 이전 | ws-protocol.test.js 에러 시나리오 |
| L7 | 스트레스/엣지 | 1000핸드 연속, Chaos, 메모리 누수, 동시 재연결 | soak-test.js |

### 12개 불변식 (매 핸드 자동 검증)

| # | 불변식 | 검증 방법 |
|---|--------|----------|
| 1 | 점수 zero-sum | 모든 플레이어 점수 합 = 0 |
| 2 | 메시지 순서 | dealerSelection → gameStart → handScored |
| 3 | Foul 일관성 | fouled=true → royaltyTotal=0 |
| 4 | 카드 52장 고유성 | dealCards 카드 Set 크기 검증 |
| 5 | 보드 완성도 | top=3, mid=5, bottom=5 (활성 플레이어) |
| 6 | 라인 W/L/D 재검증 | evaluateLine() 독립 재계산 |
| 7 | 로열티 재검증 | calcTotalRoyalty() 독립 재계산 |
| 8 | 턴 순서 | turnChanged playerOrder 일치 |
| 9 | R별 딜 수 | R1=5, R2-4=3, R5=2or3, FL=14 |
| 10 | 상대 핸드 은닉 | 타 플레이어 핸드 미포함 |
| 11 | handScored 동일성 | 모든 클라이언트 byte-identical |
| 12 | 메시지 스키마 | 타입별 필수 필드 존재 |

## 구현 상태

| 항목 | 상태 | 커밋 | 비고 |
|------|:----:|------|------|
| scorer.js 이중 카운팅 수정 | 완료 | 8ef96d2 | Critical 버그 수정 |
| 서버 단위 테스트 60개 | 완료 | 8ef96d2 | scorer/evaluator/royalty/deck |
| 스마트 봇 (smart-bot.js) | 완료 | 8ef96d2 | 17개 테스트, Foul 12% |
| 학습 데이터 수집 (training-logger.js) | 완료 | 8ef96d2 | JSONL 형식 |
| 봇 벤치마크 (bot-benchmark.js) | 완료 | 8ef96d2 | Smart vs Simple |
| Playwright E2E 인프라 | 완료 | 8ef96d2 | 픽스처/헬퍼/설정 |
| 불변식 3→12개 확장 | 완료 | 3736e0a | L1+L2+L3 검증 |
| 에러 복구 8시나리오 | 완료 | 3736e0a | L6 검증 |
| Chaos soak 모드 | 완료 | 3736e0a | L7 검증 |
| Flutter Semantics 레이블 | 완료 | 7fa8bfc | 6개 위젯 파일 |
| E2E aria-label 셀렉터 | 완료 | 7fa8bfc | game-actions.ts |
| E2E spec 12개 게임 로직 | 완료 | 1b74f36 | 실제 UI 조작 + WS 검증 |
| WS 4P+ R5 딜 수 버그 | 발견 | — | room.js 조사 필요 |
| 멀티 핸드 카드 중복 버그 | 발견 | — | room.js 덱 리셋 조사 |
| 5인 보드 미완성 버그 | 발견 | — | Play/Fold 활성 플레이어 |
| CI/CD 파이프라인 통합 | 예정 | — | GitHub Actions |
| Dart smart_ai.dart | 예정 | — | 클라이언트 사이드 AI |
| 자동 검증→수정 워크플로우 | 예정 | — | Detect→Fix→Verify 파이프라인 |
| npm qa scripts 추가 | 예정 | — | qa, qa:ws, qa:soak, qa:full |

## 커버리지 현황

| Level | 내용 | 시작 | 현재 | 목표 |
|:-----:|------|:----:|:----:|:----:|
| L1 | 프로토콜 무결성 | 60% | 90% | 95% |
| L2 | 게임 로직 무결성 | 50% | 85% | 90% |
| L3 | 상태 동기화 | 5% | 80% | 85% |
| L4 | UI 정확성 | 5% | 60% | 70% |
| L5 | 상호작용 | 0% | 50% | 60% |
| L6 | 에러 복구 | 5% | 70% | 75% |
| L7 | 스트레스/엣지 | 15% | 55% | 65% |

## 자동 검증→수정 워크플로우 (Detect → Fix → Verify)

### 워크플로우 개요

```
검증 실행 → 불변식 위반 감지 → 근본 원인 분석 → 자동 수정 → 재검증 → 커밋
```

테스트에서 버그를 발견하면 **수동 개입 없이** 분석→수정→재검증까지 자동으로 진행한다.

### Phase 1: 자동 검증 실행

| 단계 | 명령 | 통과 조건 |
|------|------|----------|
| 1-1 | `cd server && npm test` | 단위 테스트 77개 전부 PASS |
| 1-2 | `node server/game/smart-bot.test.js` | 스마트 봇 17개 PASS |
| 1-3 | `PORT=3099 node server/index.js &` → `node server/test/ws-protocol.test.js` | 불변식 12개 × 2~6인 전부 PASS |
| 1-4 | `node server/test/soak-test.js --chaos --hands 200` | 200핸드 불변식 위반 0건 |
| 1-5 | `flutter build web --web-renderer html` → `cd e2e && npx playwright test` | E2E 12개 spec PASS |

**어느 단계라도 FAIL 시 → Phase 2로 진행**

### Phase 2: 자동 근본 원인 분석

FAIL 메시지에서 **불변식 번호 + 에러 내용**을 파싱하여 원인 영역 자동 분류:

| 불변식 | 실패 시 원인 영역 | 조사 대상 파일 |
|--------|----------------|--------------|
| INV1 (zero-sum) | 점수 계산 로직 | `server/game/scorer.js` |
| INV2 (메시지 순서) | 게임 상태 머신 | `server/game/room.js` (phase 전환) |
| INV3 (Foul 일관성) | Foul 판정 로직 | `server/game/evaluator.js` (isFoul) |
| INV4 (카드 고유성) | 덱 관리 / 핸드 리셋 | `server/game/room.js` (startNewHand, dealRound) |
| INV5 (보드 완성도) | 카드 배치 / 확정 로직 | `server/game/room.js` (confirmPlacement) |
| INV6 (라인 W/L/D) | 핸드 평가 로직 | `server/game/evaluator.js` (evaluateLine) |
| INV7 (로열티) | 로열티 계산 | `server/game/royalty.js` |
| INV8 (턴 순서) | 턴 관리 | `server/game/room.js` (advanceTurn) |
| INV9 (딜 수) | 딜링 로직 | `server/game/room.js` (dealRound) |
| INV10 (핸드 은닉) | 상태 브로드캐스트 | `server/game/room.js` (getGameState) |
| INV11 (결과 동일성) | 스코어링 브로드캐스트 | `server/game/room.js` + `server/index.js` |
| INV12 (스키마) | 메시지 구조 | `server/index.js` (핸들러) |
| E2E 실패 | UI 셀렉터 / 렌더링 | `lib/ui/widgets/*.dart` + `e2e/helpers/*.ts` |

### Phase 3: 자동 수정

1. **원인 파일 읽기** — Phase 2에서 식별된 파일의 해당 함수/라인 분석
2. **수정 적용** — 버그 패턴에 따라 코드 수정
3. **단위 테스트 추가** — 해당 버그를 재현하는 회귀 테스트 작성
4. **빌드 확인** — `npm test` + `flutter analyze` 통과

### Phase 4: 재검증 (수정 확인)

```
수정 후 → Phase 1 전체 재실행 → 전부 PASS 확인
```

- PASS: 커밋 생성 (`fix(server): INV{N} {설명}`)
- FAIL: 추가 분석 또는 사용자에게 보고

### Phase 5: 결과 리포트

```
╔══════════════════════════════════════════╗
║ QA 자동 검증→수정 리포트                   ║
╠══════════════════════════════════════════╣
║ 단위 테스트:    77/77 PASS               ║
║ WS 프로토콜:    14/14 PASS               ║
║ Soak 200핸드:   200/200 PASS             ║
║ E2E:           12/12 PASS               ║
║ 발견 버그:      2건                       ║
║ 자동 수정:      2건                       ║
║ 수동 필요:      0건                       ║
╚══════════════════════════════════════════╝
```

### 자동화 트리거

| 트리거 | 실행 범위 | 방법 |
|--------|----------|------|
| `git push` | Phase 1 전체 | GitHub Actions CI |
| `npm run qa` | Phase 1-1 ~ 1-4 (서버만) | npm script |
| `npm run qa:full` | Phase 1 전체 (E2E 포함) | npm script (Flutter 빌드 필요) |
| `npm run qa:fix` | Phase 1→2→3→4→5 (자동 수정 포함) | npm script + Claude Code 연동 |
| 수동 호출 | 선택적 | `/auto qa:fix` 또는 직접 실행 |

### npm scripts (추가 필요)

```json
{
  "scripts": {
    "qa": "npm test && node game/smart-bot.test.js",
    "qa:ws": "node test/ws-protocol.test.js",
    "qa:soak": "node test/soak-test.js --hands 1000",
    "qa:chaos": "node test/soak-test.js --chaos --hands 200",
    "qa:full": "npm run qa && npm run qa:ws && npm run qa:soak"
  }
}
```

### 발견된 버그 자동 수정 이력

| 버그 | 불변식 | 수정 내용 | 커밋 |
|------|--------|----------|------|
| scorer.js 이중 카운팅 | INV1 | line 142-144 royaltyDiff만 적용 | 8ef96d2 |
| 4P+ R5 딜 수 | INV9 | 조사 중 (봇 전략 vs 서버 로직) | — |
| 멀티 핸드 카드 중복 | INV4 | 조사 중 (덱 리셋 로직) | — |
| 5인 보드 미완성 | INV5 | 조사 중 (Play/Fold 활성 플레이어) | — |

---

## 테스트 실행 방법

```bash
# 서버 단위 테스트 (77개)
cd server && npm test && node game/smart-bot.test.js

# WS 프로토콜 + 불변식 12개 + 에러 복구
PORT=3099 node server/index.js &
node server/test/ws-protocol.test.js

# Soak + Chaos (1000핸드)
node server/test/soak-test.js --chaos --hands 1000

# 봇 벤치마크
node server/test/bot-benchmark.js --hands 1000

# 학습 데이터 수집 (10K 게임)
node server/test/soak-test.js --smart --log-training --hands 10000

# E2E 스크린샷 테스트 (Flutter 빌드 필요)
flutter build web --web-renderer html
cd e2e && npx playwright test
```

## 파일 구조

```
server/
├── game/
│   ├── scorer.js          # 점수 계산 (이중 카운팅 수정됨)
│   ├── scorer.test.js     # 10개 테스트
│   ├── evaluator.js       # 핸드 평가
│   ├── evaluator.test.js  # 25개 테스트
│   ├── royalty.js          # 로열티 계산
│   ├── royalty.test.js    # 9개 테스트
│   ├── deck.js            # 덱 관리
│   ├── deck.test.js       # 16개 테스트
│   ├── smart-bot.js       # 스마트 AI 봇 (38.9KB)
│   ├── smart-bot.test.js  # 17개 테스트
│   ├── training-logger.js # 학습 데이터 수집
│   └── room.js            # 게임 라이프사이클 (검증 대상)
├── test/
│   ├── ws-protocol.test.js # WS 프로토콜 + 불변식 12개 + 에러 복구
│   ├── soak-test.js       # Soak 1000핸드 + Chaos
│   └── bot-benchmark.js   # Smart vs Simple 벤치마크
e2e/
├── fixtures/multi-player.ts
├── helpers/
│   ├── bot-strategy.ts
│   ├── game-actions.ts    # aria-label 셀렉터
│   ├── screenshot-manager.ts
│   └── ws-interceptor.ts
├── tests/
│   ├── 01-lobby.spec.ts ~ 12-edge-cases.spec.ts
├── playwright.config.ts
└── package.json
data/
├── training/   # JSONL 학습 데이터
├── stats/      # 봇 성능 통계
└── models/     # 향후 ML 모델
```

## Changelog

| 날짜 | 버전 | 변경 내용 | 변경 유형 | 결정 근거 |
|------|------|-----------|----------|----------|
| 2026-03-30 | v1.1 | 자동 검증→수정 워크플로우 (Detect→Fix→Verify) 추가 | TECH | 검증 후 수정까지 자동화 필요 |
| 2026-03-30 | v1.0 | 최초 작성 — 7-Level QA 계층 설계 + 전체 구현 | TECH | 기존 QA 한계 (프로토콜만 검증) + scorer 이중 카운팅 버그 발견 |
