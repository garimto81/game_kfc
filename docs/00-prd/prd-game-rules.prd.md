# OFC Pineapple Poker 게임 규칙 PRD

## 개요

이 PRD는 game_kfc_pro 서버에 구현된 OFC Pineapple 변형 룰을 단일 근거 문서로 정리한다. 코드 동작을 기준으로 역공학(reverse-engineering) 된 skeleton이며, 세부 Royalty 표/엣지 케이스는 후속 Stage에서 채운다.

- **목적**: 게임 로직 불변식(INV) 회귀 방지 및 QA 자동화의 기준 명세.
- **범위**: 룸 단위 단일 핸드의 딜링, 배치, 채점, Fantasyland 전환.
- **이 PRD가 다루지 않는 것**: 이펙트/사운드(`prd-effect-system.prd.md`), WebSocket 프로토콜(`prd-realtime-protocol.prd.md`), 인증(`prd-auth-security.prd.md`), UI 플로우(`prd-ux-flow`, 추후).

## 카드 덱 및 덱 관리

표준 52장 덱(중복 없음)을 룸 단위로 생성해 셔플한다. 4인 이상 게임에서 덱이 고갈되면 버린 카드 풀(`discardPile`)을 셔플해 재투입한다.

- 덱 생성/셔플: `server/game/deck.js` 의 `createDeck`, `shuffle`, `dealCards` (`room.js:8`).
- 버린 카드 풀: `room.js:42` — `this.discardPile = []`.
- 덱 재투입 로직: `room.js:431-434` (4인+ AND `totalNeeded > deck.length` AND `discardPile.length > 0`).

> TODO: INV4(discardPile 재활용 조건)의 경계 케이스 표. 커밋 `fa6bc62` 참조.

## 플레이어 수별 딜링 규칙

활성 플레이어 수와 라운드에 따라 딜링 매수가 분기된다 (`room.js:411-454`, `dealRound()`).

| 플레이어 수 | R1 | R2 | R3 | R4 | R5 | 버림 |
|:-----------:|:--:|:--:|:--:|:--:|:--:|:----:|
| 2~4인 | 5장 | 3장 | 3장 | 3장 | 3장 | R2~R5 각 1장 |
| 5~6인 (play) | 5장 | 3장 | 3장 | 3장 | 2장 | R2~R4 각 1장, R5 없음 |
| Fantasyland | 14장 | - | - | - | - | 1장 |

- **R1=5장**: `room.js:421-422` (`cardCount = 5`).
- **4인+ R5=2장 (버림 없음)**: `room.js:423-424` — `is4p && round === 5 → cardCount = 2`.
- **나머지 R2~R4=3장 (2배치+1버림)**: `room.js:425-426` (`cardCount = 3`).
- **Fantasyland R1=14장**: `room.js:439-440` — `player.inFantasyland && round === 1 → dealCards(deck, 14)`.
- **is4p 판정**: `activePlayers.length >= 4` (`room.js:417`). 2~3인은 "4인+ 경로"를 타지 않음.

> TODO: 7인 이상 지원 여부 (현재는 `maxPlayers` 제한, `room.js:92` 근거로 실제 상한 확인).

## 라인 배치 규칙

플레이어 보드는 Top(3장) / Middle(5장) / Bottom(5장) 세 라인으로 구성된다. 라인 간 강도 순서는 `Bottom ≥ Middle ≥ Top` 이어야 한다.

- **Top Quads 불가**: Top은 3장이므로 구조적으로 4-of-a-kind 평가 경로가 존재하지 않는다. `evaluator.js:140-169` (`evaluateHand3`) — 핸드 타입은 `THREE_OF_A_KIND`, `ONE_PAIR`, `HIGH_CARD` 셋뿐.
- **강도 순서 검증**: `evaluator.js:210-228` (`isFoul`) — `compareHands(bottom, mid) >= 0` AND `compareHands(mid, top) >= 0`.
- **불완전 보드는 Foul**: `evaluator.js:211-213` — 3/5/5 아니면 즉시 true.

> TODO: 각 라운드별 배치 슬롯 수(R1=5배치, R2~R4=2배치+1버림, R5=2배치 or 3배치) 상세 표.

## 핸드 강도 평가

표준 포커 핸드 랭킹을 따른다. 5장 라인과 3장 라인을 각각 별도 평가한다.

- **5장 평가**: `evaluator.js:38-132` (`evaluateHand5`).
  - Flush/Straight 체크, Royal Flush 특수 판정, Wheel(A-2-3-4-5) 스트레이트 지원 (`evaluator.js:61-65`).
  - 핸드 타입 enum: `HIGH_CARD(0)` … `ROYAL_FLUSH(9)` (`evaluator.js:7-18`).
- **3장 평가**: `evaluator.js:140-169` (`evaluateHand3`).
- **라우터**: `evaluator.js:176-181` — `line === 'top' → evaluateHand3, else evaluateHand5`.
- **비교**: `evaluator.js:187-202` (`compareHands`) — handType 비교 후 kicker 순차 비교.

> TODO: Wheel 스트레이트 high card = 5 규칙에 대한 테스트 케이스 목록.

## Foul 판정 및 결과

Foul된 플레이어는 모든 라인을 상대에게 내주고 Royalty가 0으로 무효화된다.

- **판정**: `evaluator.js:210-228` (`isFoul`).
- **Royalty 무효화**: `scorer.js:21-22` — `fouled ? { top: 0, mid: 0, bottom: 0, total: 0 } : calcTotalRoyalty(...)`.
- **점수 결과**: `scorer.js:58-83` — 상대가 3라인 승리 + 스쿱 보너스 → `+6 / -6`.
- **양쪽 Foul**: `scorer.js:53-57` — 무승부 (0점).

> TODO: 부분 Foul (예: Mid가 Top보다 낮지만 Bottom은 정상) 상세 사례.

## Royalty 표

Royalty는 Foul이 아닌 플레이어에게만 합산된다 (`royalty.js:89-100`, `calcTotalRoyalty`).

### Top Royalty (3장)

| 핸드 | 포인트 | 조건/근거 |
|------|:------:|-----------|
| Pair 66 | 1 | Top 전용, `pairRank - 5` |
| Pair 77 | 2 | Top 전용 |
| Pair 88 | 3 | Top 전용 |
| Pair 99 | 4 | Top 전용 |
| Pair TT | 5 | Top 전용 |
| Pair JJ | 6 | Top 전용 |
| Pair QQ | 7 | Top 전용, FL 진입 기준 |
| Pair KK | 8 | Top 전용 |
| Pair AA | 9 | Top 전용 |
| Trips 222 | 10 | `10 + (rank - 2)` |
| Trips 333 | 11 | 공식 적용 |
| Trips 444 | 12 | 공식 적용 |
| Trips 555 | 13 | 공식 적용 |
| Trips 666 | 14 | 공식 적용 |
| Trips 777 | 15 | 공식 적용 |
| Trips 888 | 16 | 공식 적용 |
| Trips 999 | 17 | 공식 적용 |
| Trips TTT | 18 | 공식 적용 |
| Trips JJJ | 19 | 공식 적용 |
| Trips QQQ | 20 | 공식 적용 |
| Trips KKK | 21 | 공식 적용 |
| Trips AAA | 22 | 공식 적용, FL 유지 조건 |

> 근거: `server/game/royalty.js:64-82`. Pair 55 이하는 0점 (`pairRank >= 6` 가드), Trips는 `10 + (tripRank - 2)` 공식.

### Middle Royalty (5장)

| 핸드 | 포인트 | 조건/근거 |
|------|:------:|-----------|
| Three of a Kind | 2 | Mid 최저 득점 핸드 |
| Straight | 4 | Bottom의 2배 |
| Flush | 8 | Bottom의 2배 |
| Full House | 12 | Bottom의 2배, FL 유지 조건 |
| Four of a Kind | 20 | Bottom의 2배 |
| Straight Flush | 30 | Bottom의 2배 |
| Royal Flush | 50 | Bottom의 2배 |

> 근거: `server/game/royalty.js:36-57`. Trips 제외 모든 핸드는 Bottom 점수의 2배.

### Bottom Royalty (5장)

| 핸드 | 포인트 | 조건/근거 |
|------|:------:|-----------|
| Straight | 2 | Bottom 최저 득점 핸드 |
| Flush | 4 | - |
| Full House | 6 | - |
| Four of a Kind | 10 | FL 유지 조건 |
| Straight Flush | 15 | - |
| Royal Flush | 25 | Bottom 최고 득점 |

> 근거: `server/game/royalty.js:11-30`. Trips 이하는 0점 (Mid와 달리 Trips 가점 없음).

> TODO: Royalty 표가 국제 표준 OFC Pineapple 룰과 일치하는지 외부 레퍼런스(ABC Open Face, TonyBet 등) 교차 검증.

## Fantasyland

Top QQ+ 완성 시 다음 핸드에서 Fantasyland(FL)에 진입한다. FL 중에는 R1에 14장을 일괄로 받아 13장 배치 + 1장 버림한다.

- **진입 조건**: `royalty.js:108-121` (`checkFantasylandEntry`).
  - Top Trips 무조건 진입.
  - Top Pair는 `rank >= 12` (QQ 이상)만 진입.
- **유지 조건**: `royalty.js:129-149` (`checkFantasylandStay`).
  - Top Trips (`handType === THREE_OF_A_KIND`).
  - **Mid Full House+** (`handType >= FULL_HOUSE`) — `royalty.js:137-140`. *주석은 "Mid Quads+"이지만 코드는 FH부터 허용.*
  - Bottom Quads+ (`handType >= FOUR_OF_A_KIND`).
- **"FL Stay Mid FH" 예외**: 커밋 `060a77d` — isFoul 완전 비교 + FL Stay Mid FH 허용. 본 PRD의 유지 조건은 이 커밋 이후 동작이 정본.
- **FL 중 딜링**: R1에 14장 (`room.js:439-440`). 이후 라운드에는 카드 추가 없음 (단독 플레이).

> TODO: FL 유지 조건에 대한 코드 주석(`royalty.js:126`) vs 실제 동작의 불일치 — 주석 정정 또는 동작 재검토 필요.

## 점수 계산

플레이어 쌍(pair-wise)별로 라인 비교 + 스쿱 보너스 + Royalty 합산을 수행한다 (`scorer.js:14-176`).

- **라인 1:1 비교**: 이긴 라인마다 +1, 진 라인마다 -1 (`scorer.js:86-115`).
- **Scoop 보너스**: 3라인 모두 승리 시 +3 / -3 (`scorer.js:124-134`). Foul 상대 시 winsA=3으로 자동 스쿱 (`scorer.js:58-83`).
- **Royalty 합산**: pair-wise 차분으로 가산 (`scorer.js:139, 143-144`) — `royaltyDiffAB = A.total - B.total`.
- **최종 점수**: 모든 상대와의 pair-wise 합 (각 루프에서 누적).
- **클라이언트 호환 필드**: `totalScore`, `foul` 별칭 (`scorer.js:170-173`).

> TODO: N인 대전에서 "총점 = 0" 불변식(모든 플레이어 점수 합) 검증 테스트.

## 5~6인 Play/Fold 특수 규칙

5~6인 게임에서는 R1 딜링 전에 각 플레이어가 play/fold를 선택한다. 최대 4명만 실제 핸드를 플레이하고 나머지는 자동 fold된다.

- **선택 순서**: `room.js:296-306` — `playOrFoldOrder`, `playOrFoldCurrentIdx`.
- **4명 play 도달 → 나머지 자동 fold**: `room.js:326-333` (`playCount === 4 → 미선택자 fold`).
- **필요 fold 수 도달 → 나머지 자동 play**: `room.js:335-344` — `requiredFolds = players.size - 4` (5인→1, 6인→2).
- **Fold 결과 처리**: `room.js:346-368` — `folded = true` 로 활성 풀에서 제외. `startNewHand(foldedPlayerIds)` 로 다음 핸드 상태 유지 (`room.js:374-389`).

> TODO: "4명 강제 플레이" 관련 커밋 `d17e969` 의 정확한 의도 재확인. fold 선택 중 연결 끊김 / 타임아웃 경로.

## 특이 케이스

### discardPile 재활용 (INV4)

4인+ 게임의 R2 이후 덱이 고갈되면 `discardPile` 전체를 셔플해 덱에 재투입한다 (`room.js:431-434`). 이는 OFC 표준에서 비표준 변형이며, 커밋 `fa6bc62` 에서 도입.

### FL 단독 플레이 처리

모든 비FL 플레이어가 핸드를 완료해도 FL 플레이어가 남아 있으면 게임은 계속된다. 턴 로테이션은 비FL 플레이어만 포함 (`room.js:489-493`, `getCurrentTurnPlayerId`).

> TODO: FL 플레이어끼리만 남은 상태에서 점수 계산 엣지 케이스 (pair-wise 비교 대상 0 또는 1).

### 불완전 보드에서의 핸드명 표시

pair-wise 비교 시 상대 보드가 3/5/5가 아니면 핸드명을 `'Foul'` 로 대체해 UI에 표시한다 (`scorer.js:66-83`).

## 구현 맵 (Implementation Map)

| 개념 | 파일:함수 | 라인 |
|------|----------|:----:|
| 5장 핸드 평가 | `evaluator.js:evaluateHand5` | 38-132 |
| 3장 핸드 평가 | `evaluator.js:evaluateHand3` | 140-169 |
| 핸드 비교 | `evaluator.js:compareHands` | 187-202 |
| Foul 판정 | `evaluator.js:isFoul` | 210-228 |
| Top Royalty | `royalty.js:calcTopRoyalty` | 64-82 |
| Mid Royalty | `royalty.js:calcMidRoyalty` | 36-57 |
| Bottom Royalty | `royalty.js:calcBottomRoyalty` | 11-30 |
| FL 진입 | `royalty.js:checkFantasylandEntry` | 108-121 |
| FL 유지 | `royalty.js:checkFantasylandStay` | 129-149 |
| 스코어링 | `scorer.js:scoreHand` | 14-176 |
| 딜링 | `room.js:dealRound` | 411-454 |
| Play/Fold | `room.js:playOrFoldResponse` | 313-368 |
| 핸드 시작 | `room.js:startNewHand` | 374-403 |
| 턴 관리 | `room.js:getCurrentTurnPlayerId` | 489-493 |

## 미해결 이슈 (Known Issues)

PRD 부재 상태에서 구현이 진행된 만큼, 아래 항목은 "현재 코드 동작이 규칙적으로 올바른가" 를 재검증해야 한다.

1. **FL 유지 조건의 Mid 기준**: 주석 "Mid Quads+" vs 코드 "FH+" (`royalty.js:126` vs `:138`). 커밋 `060a77d` 로 FH 허용이 의도된 것이지만 주석 정정 누락.
2. **Royalty 표 국제 표준 일치성**: 특히 Mid Royal Flush = 50, Bot Royal Flush = 25 의 배율이 일반 OFC Pineapple 룰과 일치하는지 외부 레퍼런스 검증.
3. **Wheel 스트레이트 Royalty**: straightHighCard=5로 저장되는데, Royalty 계산에서 high card를 별도로 참조하지 않으므로 문제 없음. 단 UI 표기(`"5-high Straight"`) 일관성 재확인.
4. **5~6인 discardPile 재활용 타이밍**: R5에 2장만 주므로 고갈 가능성은 적지만, 6인 시뮬레이션으로 실제 발생 빈도 측정 필요.
5. **Top Quads 불가** 가 룰상 명문화되었는지 vs 단순히 3장 구조상 불가능한 것인지 재확인. (후자라면 PRD에서 "구조적으로 불가능" 으로만 서술).
6. **양쪽 Foul 시 Royalty 처리**: 현재 둘 다 0으로 무효화되어 무승부(0점). 일부 룰 변형은 이 경우에도 비교를 허용.

## 범위 외

- **이펙트/사운드**: `docs/00-prd/prd-effect-system.prd.md` 참조.
- **UI 화면/플로우**: `prd-ux-flow` (추후 작성).
- **네트워크 프로토콜**: `prd-realtime-protocol.prd.md` 참조.
- **인증/방 비밀번호**: `prd-auth-security.prd.md` 참조.

## DoD (완료 기준)

- [ ] 모든 Royalty 표가 `royalty.js` 와 1:1 검증됨 (자동화 테스트 존재).
- [ ] 모든 "TODO:" placeholder 가 Stage 2/3 에서 채워짐.
- [ ] "미해결 이슈" 6개 항목 모두 resolved / acknowledged.
- [ ] 4개 PR 승인: `prd-game-rules`, `prd-realtime-protocol`, `prd-auth-security`, `prd-ux-flow` — 교차 참조 링크 완성.
- [ ] QA 자동화 체크리스트(`docs/00-prd/prd-qa-automation.prd.md`) 의 불변식 12개가 본 PRD의 규칙과 정합함.

## Changelog

| 날짜 | 버전 | 변경 내용 | 변경 유형 | 결정 근거 |
|------|------|-----------|----------|----------|
| 2026-04-17 | v0.1 | skeleton 작성 (placeholder 다수, Stage 1). 코드 근거 라인 인용 완료. | - | 초기 작성 |
