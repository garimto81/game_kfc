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
6. 스크린샷 폴더: QA 리포트 파일명과 동일한 이름으로 생성 (`e2e/reports/screenshots/{qa-report-날짜-시간}/`), 이전 실행 결과 보존

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
| WS 4P+ R5 딜 수 버그 (INV9) | 완료 | fa6bc62, a71a0cb | 라운드별 검증 + Play/Fold 4명 강제 |
| 멀티 핸드 카드 중복 버그 (INV4) | 완료 | fa6bc62 | discardPile 재활용 대응 라운드별 검증 |
| 5인 보드 미완성 버그 (INV5) | 완료 | d17e969 | Play/Fold 항상 4명 play 강제 |
| Fine-tuning ML 파이프라인 | 완료 | e4bcada | PyTorch + ONNX + Self-play |
| QA 자동 학습 루프 | 완료 | 7ce3fd4 | Detect→Fix→Learn |
| 모델 성능 추이 시스템 | 완료 | 0ebba78 | registry.json + performance-history.json |
| QA→Fine-tune→ONNX 전체 루프 | 완료 | 657daae | End-to-End 자동화 |
| QA 체크리스트 리포트 | 완료 | ee0615a | Markdown 자동 생성 |
| 100핸드 상세 결과표 | 완료 | 624a0a3 | 카드/점수/로열티 상세 |
| CI/CD 파이프라인 통합 | 예정 | — | GitHub Actions |
| Dart smart_ai.dart | 예정 | — | 클라이언트 사이드 AI |
| npm qa scripts 추가 | 예정 | — | qa, qa:ws, qa:soak, qa:full |

## 커버리지 현황

| Level | 내용 | 시작 | v1.3 | v2.0 (현재) | 목표 |
|:-----:|------|:----:|:----:|:-----------:|:----:|
| L1 | 프로토콜 무결성 | 60% | 90% | 95% | 95% |
| L2 | 게임 로직 무결성 | 50% | 85% | 92% | 95% |
| L3 | 상태 동기화 | 5% | 80% | 88% | 90% |
| L4 | UI 정확성 | 5% | 60% | 75% | 80% |
| L5 | 상호작용 | 0% | 50% | 70% | 75% |
| L6 | 에러 복구 | 5% | 70% | 78% | 80% |
| L7 | 스트레스/엣지 | 15% | 55% | 70% | 75% |

> **커버리지 근거**: 241/241 WS 프로토콜 테스트 PASS (L1/L2), 12/12 E2E spec 완성 + CanvasKit Semantics 강제 (L4/L5 상향), Soak 100핸드 + Chaos PASS + 메모리 증가 0% (L7 상향). INV4/INV5/INV9 전부 해결로 L2 강화.

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

## ML 자동 학습 연동 (Detect → Fix → Learn)

> **분리 예고**: 이 섹션은 v3에서 `prd-ml-autolearn.prd.md`로 이관될 예정이다. QA PRD는 L1~L7 검증에 집중하고, ML 학습 루프는 별도 PRD에서 상세화한다.

### 개요

기존 Detect→Fix→Verify 루프를 확장하여, QA 실행에서 수집된 state-action-reward 데이터를 기반으로 모델을 자동 재학습한다. v1 ONNX 모델이 이미 학습되어 배포(`data/models/v1.onnx`, direction_acc 62.05%).

```
검증 → 버그 감지 → 수정 → 재검증 → 학습 데이터 수집 → Fine-tune → ONNX 변환 → 벤치마크 → registry 등록
```

### 학습 데이터 자동 수집

| 항목 | 값 |
|------|-----|
| 포맷 | JSONL (state-action-reward) |
| 위치 | `data/training/latest.jsonl` + `training-{ISO timestamp}.jsonl` |
| 수집 주체 | `server/game/training-logger.js` |
| 트리거 | `--log-training` 플래그로 Soak/벤치마크 실행 시 |
| 현재 데이터 | 149,990 샘플 (v1 학습 기준) |

### 모델 재학습 트리거 기준

| 조건 | 동작 |
|------|------|
| QA 루프 N회 완료 (기본 N=10) | Fine-tune 자동 트리거 |
| 신규 학습 데이터 ≥50K 샘플 누적 | 재학습 권장 |
| 버그 수정 후 재검증 PASS | 해당 수정 영향 상태-액션 샘플 우선 수집 |
| 벤치마크에서 v{N} < v{N-1} | 롤백 + 데이터 품질 재검토 |

### 모델 레지스트리

`data/models/registry.json`이 모든 버전의 학습 조건 + 벤치마크를 관리한다:

| 필드 | 설명 |
|------|------|
| version | 모델 ID (예: v0-smart-bot, v1, v2) |
| type | heuristic / ml |
| training | epochs, data_size, val_loss, direction_acc |
| benchmark | opponent, foul_rate, avg_royalty, fl_entry, avg_score, win_rate |
| latest / baseline | 현재 배포 / 비교 기준 |

### 성능 추이 시스템

`data/stats/performance-history.json`이 버전별 벤치마크를 시계열로 누적. 신규 버전이 baseline(v0-smart-bot) 대비 개선률이 5% 미만이면 승격 보류.

### 구현 커밋

| 커밋 | 내용 |
|------|------|
| e4bcada | Fine-tuning ML 파이프라인 (PyTorch + ONNX + Self-play) |
| 7ce3fd4 | QA 실행마다 자동 학습 (Detect→Fix→Learn) |
| 0ebba78 | 모델 성능 측정 + 버전별 개선 추적 |
| 657daae | QA→Fine-tune→ONNX→평가 전체 루프 완성 |

---

### 발견된 버그 자동 수정 이력

| 버그 | 불변식 | 수정 내용 | 커밋 |
|------|--------|----------|------|
| scorer.js 이중 카운팅 | INV1 | line 142-144 royaltyDiff만 적용 | 8ef96d2 |
| 멀티 핸드 카드 중복 | INV4 | discardPile 재활용 대응 — 라운드별 카드 고유성 검증 | fa6bc62 |
| 5인 보드 미완성 | INV5 | Play/Fold 항상 4명 play 강제 (서버 규칙) | d17e969 |
| 4P+ R5 딜 수 | INV9 | 라운드별 검증 + Play/Fold 4명 테스트 정합성 | fa6bc62, a71a0cb |
| INV10 상대 핸드 은닉 | INV10 | 라운드별 검증 전환 | a71a0cb |
| E2E CanvasKit Semantics | UI | Shadow DOM pierce 셀렉터 + 강제 활성화 | 841a555 |
| isFoul full comparison | INV3 | FL Stay Mid FH 판정 수정 | 060a77d |

---

## QA 리포트 파일명 규칙

매 QA 실행마다 리포트가 생성되며, 이전 실행은 보존된다. 파일명에 날짜 + 시간(HHMM)을 포함하여 동일 날짜 다중 실행을 구분한다.

| 유형 | 경로 | 비고 |
|------|------|------|
| 체크리스트 리포트 | `docs/04-report/qa-report-{YYYY-MM-DD}-{HHMM}.md` | 전체 PASS/FAIL 요약 + 소요 시간 |
| 핸드별 상세 | `docs/04-report/qa-hands-detail-{YYYY-MM-DD}-{HHMM}.md` | 100핸드 카드/점수/로열티 + 테스트별 시간 |
| 스크린샷 폴더 | `e2e/reports/screenshots/{qa-report-파일명}/` | 리포트와 1:1 매칭, 이력 보존 |

**생성 명령** (CLAUDE.md 참조):

```bash
node server/test/generate-qa-report.js    # 체크리스트
node server/test/detailed-qa-test.js      # 핸드별 상세 + ML fine-tune
node server/test/model-evaluator.js       # 모델 평가 + 추이 기록
```

> **관련 커밋**: 641f4c2 (HHMM 시간값 추가), 34e01cf (문서 링크 필수), ee0615a (리포트 자동 생성).

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
| 2026-04-17 | v2.0 | ML 자동 학습 루프 섹션 추가 (7ce3fd4, 0ebba78 반영), L4/L5/L7 커버리지 실측, INV 재검증, QA 리포트 파일명 규칙 추가 | PRODUCT | PRD v1.3 이후 4개월 Changelog 정지 해소 |
| 2026-03-31 | v1.3 | WS disconnect 시 빈 방 삭제 + 재접속 타이머 경쟁 조건 수정 | TECH | 브라우저 이탈 시 재접속 불가 + 빈 방 유지 버그 |
| 2026-03-31 | v1.2 | 스크린샷 폴더를 QA 리포트 파일명과 매칭, 이전 실행 보존 | PRODUCT | 매 실행마다 덮어쓰기 방지 + 이력 추적 |
| 2026-03-30 | v1.1 | 자동 검증→수정 워크플로우 (Detect→Fix→Verify) 추가 | TECH | 검증 후 수정까지 자동화 필요 |
| 2026-03-30 | v1.0 | 최초 작성 — 7-Level QA 계층 설계 + 전체 구현 | TECH | 기존 QA 한계 (프로토콜만 검증) + scorer 이중 카운팅 버그 발견 |
