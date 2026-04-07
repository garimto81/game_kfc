# QA 체크리스트 — PRD 기반

> **기준 문서**: `docs/00-prd/prd-qa-automation.prd.md` (7-Level QA 계층, 12개 불변식)
> **PRD 갭**: 게임 기능 PRD (`prd-game-features.prd.md`)가 부재. 아래 체크리스트는 QA PRD + 코드 분석에서 도출.

## PRD 누락 사항 (QA에서 발견)

| 항목 | 설명 | 권장 조치 |
|------|------|----------|
| 게임 기능 PRD 부재 | 로비/방 관리, 카드 배치, Play/Fold, Fantasyland, 스코어링 UI 등 게임 기능에 대한 요구사항 문서 없음 | `prd-game-features.prd.md` 작성 필요 |
| UI 스코어링 표시 스펙 | 점수 다이얼로그에 표시할 항목(이름, 점수, Foul/Fold, 라인 상세, Royalty, 분해 공식)의 정의 없음 | 게임 PRD에 UI 스펙 섹션 추가 |
| Fold vs Foul 구분 정의 | PRD에 fold(선택적 기권)와 foul(보드 위반)의 구분이 명시되지 않음 | 용어 정의 + 표시 규칙 명시 |
| 4인+ 덱 소진 처리 | 4인 이상 게임에서 52장 덱 소진 시 처리 규칙 미정의 | 딜링 규칙 명시 |

---

## E2E QA 체크리스트

### QA-01: 로비 (01-lobby.spec.ts)

| # | PRD Level | 검증 항목 | 스크린샷 체크포인트 | 상태 |
|---|-----------|----------|-------------------|:----:|
| 1 | L4 | 빈 로비 렌더링 | `lobby-empty` | 미실행 |
| 2 | L5 | 방 생성 → 로비에 표시 | `room-created` | 미실행 |
| 3 | L5 | 방 참가 → 대기 화면 | `room-joined` | 미실행 |
| 4 | L5 | 게임 시작 → 딜러 선정 | `game-start` | 미실행 |

### QA-02: 2인 풀게임 (02-2player-game.spec.ts)

| # | PRD Level | 검증 항목 | 스크린샷 체크포인트 | 상태 |
|---|-----------|----------|-------------------|:----:|
| 1 | L4 | R1 카드 딜링 화면 | `R1` | ✅ |
| 2 | L4 | R5 완료 보드 | `R5` | ✅ |
| 3 | L4 | 점수 다이얼로그 — 이름 표시 (UUID 아님) | `score-dialog` | ✅ |
| 4 | L4 | 점수 다이얼로그 — 실제 점수값 | `score-dialog` | ✅ |
| 5 | L4 | 점수 다이얼로그 — 라인별 W/L/D | `score-dialog` | ✅ |
| 6 | L4 | 점수 다이얼로그 — Foul/Fold 구분 표시 | `score-dialog` | ✅ |
| 7 | L2 | INV1: zero-sum | WS payload | ✅ |
| 8 | L2 | INV2: 대칭 (A vs B = -(B vs A)) | WS payload | ✅ |
| 9 | L5 | Ready 클릭 → 2번째 핸드 시작 | `hand2-start` | ✅ |

### QA-03: 3인 턴 순서 (03-3player-game.spec.ts)

| # | PRD Level | 검증 항목 | 스크린샷 체크포인트 | 상태 |
|---|-----------|----------|-------------------|:----:|
| 1 | L2 | INV8: 턴 순서 일치 | WS payload | 미구현 |
| 2 | L4 | 턴 인디케이터 정확성 | `turn-order` | 미구현 |
| 3 | L4 | 3인 점수 다이얼로그 | `score-dialog` | 미구현 |

### QA-04: 4인 게임 (04-4player-game.spec.ts)

| # | PRD Level | 검증 항목 | 스크린샷 체크포인트 | 상태 |
|---|-----------|----------|-------------------|:----:|
| 1 | L2 | INV9: R5 딜 수 = 2장 | WS payload | ✅ |
| 2 | L4 | 4인 점수 다이얼로그 — 4명 표시 | `score-dialog` | ✅ |
| 3 | L4 | 점수 다이얼로그 — 이름/점수/라인상세 | `score-dialog` | ✅ |
| 4 | L2 | INV1+INV2: zero-sum + 대칭 | WS payload | ✅ |
| 5 | L2 | 6쌍 pair completeness | WS payload | ✅ |

### QA-05: 5인 Play/Fold (05-5player-fold.spec.ts)

| # | PRD Level | 검증 항목 | 스크린샷 체크포인트 | 상태 |
|---|-----------|----------|-------------------|:----:|
| 1 | L5 | Play/Fold 선택 UI | `fold-choice` | 미구현 |
| 2 | L4 | Fold 플레이어 뷰 (관전 화면) | `folded-view` | 미구현 |
| 3 | L4 | 점수 다이얼로그 — Fold 표시 | `score-dialog` | 미구현 |

### QA-06: 6인 Play/Fold (06-6player-fold.spec.ts)

| # | PRD Level | 검증 항목 | 스크린샷 체크포인트 | 상태 |
|---|-----------|----------|-------------------|:----:|
| 1 | L5 | 복수 Fold 선택 | `fold-views` | 미구현 |
| 2 | L4 | 점수 다이얼로그 — 다수 Fold | `score-dialog` | 미구현 |

### QA-07: Fantasyland (07-fantasyland.spec.ts)

| # | PRD Level | 검증 항목 | 스크린샷 체크포인트 | 상태 |
|---|-----------|----------|-------------------|:----:|
| 1 | L2 | FL 진입 조건 충족 시 진입 | `fl-entry` | 미구현 |
| 2 | L2 | INV9: FL = 14장 딜 | WS payload | 미구현 |
| 3 | L4 | FL 14장 배치 UI | `fl-board` | 미구현 |

### QA-08: Foul 감지 (08-foul.spec.ts)

| # | PRD Level | 검증 항목 | 스크린샷 체크포인트 | 상태 |
|---|-----------|----------|-------------------|:----:|
| 1 | L2 | INV3: Foul 시 royaltyTotal=0 | WS payload | 미구현 |
| 2 | L4 | Foul 애니메이션/표시 | `foul-detect` | 미구현 |
| 3 | L4 | Scoop 점수 표시 | `scoop-score` | 미구현 |

### QA-09: 재접속 (09-reconnect.spec.ts)

| # | PRD Level | 검증 항목 | 스크린샷 체크포인트 | 상태 |
|---|-----------|----------|-------------------|:----:|
| 1 | L6 | 연결 끊김 후 재접속 | `reconnect` | 미구현 |
| 2 | L6 | 보드/핸드 상태 복원 | `state-restored` | 미구현 |

### QA-10: 턴 타이머 (10-timer-timeout.spec.ts)

| # | PRD Level | 검증 항목 | 스크린샷 체크포인트 | 상태 |
|---|-----------|----------|-------------------|:----:|
| 1 | L5 | 타이머 표시 | `timer-warning` | 미구현 |
| 2 | L6 | 만료 → autoFold | `auto-fold` | 미구현 |

### QA-11: 멀티핸드 (11-multi-hand.spec.ts)

| # | PRD Level | 검증 항목 | 스크린샷 체크포인트 | 상태 |
|---|-----------|----------|-------------------|:----:|
| 1 | L2 | handNumber 증가 (1→2→3) | WS payload | ✅ |
| 2 | L2 | 매 핸드 zero-sum | WS payload | ✅ |
| 3 | L4 | 핸드별 점수 다이얼로그 | `hand1-score`, `hand2-score`, `hand3-score` | ✅ |

### QA-12: 엣지 케이스 (12-edge-cases.spec.ts)

| # | PRD Level | 검증 항목 | 스크린샷 체크포인트 | 상태 |
|---|-----------|----------|-------------------|:----:|
| 1 | L5 | Undo 동작 | `undo-action` | 미구현 |
| 2 | L5 | 이모트 전송/수신 | `emote` | 미구현 |
| 3 | L5 | Grid/Split View 토글 | `grid-view` | 미구현 |

---

## 스크린샷 검증 기준 (PRD L4)

`score-dialog` 체크포인트에서 확인할 6개 항목:

| # | 항목 | 합격 기준 | 불합격 예시 |
|---|------|----------|-----------|
| 1 | 이름 표시 | 실제 플레이어 이름 | UUID (`3dd7b2b8-...`) |
| 2 | 점수 값 | 비영 점수 (양쪽 플레이 시) | 전부 +0 |
| 3 | 상태 라벨 | Foul→"(Foul)", Fold→"(Fold)" | 정상 플레이어에 "(Foul)" |
| 4 | 라인 상세 | TOP/MID/BOT + 족보 + W/L/D | 상세 없음 |
| 5 | Royalty | 해당 시 ★ 표시 | 누락 |
| 6 | 분해 공식 | Lines ± Scoop ± Roy = Total | 누락 |

---

## 커버리지 요약

| 상태 | QA ID | 수 |
|:----:|-------|:--:|
| ✅ 완료 | QA-02, QA-04, QA-11 | 3 |
| 🔲 미구현 | QA-01, QA-03, QA-05~QA-10, QA-12 | 9 |

**현재 E2E QA 커버리지: 3/12 (25%)**
