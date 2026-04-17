# 이펙트 시스템 PRD

## 개요
- **목적**: 카드 배치 시 좋은 패 형성/완성을 시각+청각 피드백으로 전달하여 게임 몰입감 강화
- **배경**: 이펙트가 비정상 출력되는 버그(#13) 수정 과정에서 이펙트 기획이 코드에만 존재하고 PRD가 없음을 발견
- **범위**: 카드 배치 이펙트, 라인 완성 이펙트, 핸드 카드 흥분 상태, Foul 연출, 상대 보드 이펙트

## 요구사항

### 기능 요구사항

#### EFX-1. 배타적 이펙트 원칙

이펙트는 두 계층으로 분리되며, **동시 적용을 금지**한다.

| 계층 | 적용 조건 | 역할 |
|------|----------|------|
| **Early Warning** | 미완성 라인에 카드 배치 시 | 패턴 예고 (곧 좋은 패 완성 가능) |
| **Celebration** | 라인 완성 시 | 좋은 패 완성 축하 |

```
카드 배치 시:
  배치 후 라인 완성? → YES → Celebration만 (Early Warning 없음)
                    → NO  → Early Warning만 (Celebration 없음)
```

#### EFX-2. Early Warning 이펙트 (미완성 라인)

카드를 배치했을 때 좋은 패가 형성 중임을 알린다.

| # | 트리거 조건 | 대상 라인 | 시각 효과 | 사운드 | 지속 |
|---|-----------|----------|---------|--------|------|
| W1 | 같은 rank 2장 이상 보유 + 추가 배치 (Trips 감지) | 모든 라인 | scale 160%→100% (elasticOut) + shake 5Hz + amber shimmer 700ms + amber glow | 없음 | 1500ms |
| W2 | Top 라인에서 QQ+ 페어 형성 중 | Top | (W1과 동일) | 없음 | 1500ms |
| W3 | 동일 suit 4장+ (Flush 형성 중) | Mid, Bottom | (W1과 동일) | 없음 | 1500ms |
| W4 | 연속 rank 3장+ (Straight 형성 중) | Mid, Bottom | (W1과 동일) | 없음 | 1500ms |

**적용 대상 카드**: 해당 라인의 기존 카드 + 새로 배치한 카드 전체.
**자동 만료**: 1500ms 후 이펙트 자동 소멸.

#### EFX-3. Celebration 이펙트 (라인 완성)

라인이 maxCards에 도달하여 완성되었을 때, 핸드 강도에 따라 축하 이펙트를 표시한다.

| Level | 조건 (Top 3장) | 조건 (Mid/Bottom 5장) | 시각 효과 | 사운드 |
|-------|---------------|---------------------|---------|--------|
| **1** | QQ+ 페어 | Straight, Flush, Trips | 라인 전체 shimmer 800ms (amber 0.4) | playWin() |
| **2** | Trips | Full House+ | 라인 glow (amber) + shimmer 800ms + scale 1.1→1.0 bounce | playWin() |
| **3** | — | Quads+, Straight Flush+ | 강한 glow (amber 0.8) + shimmer + scale 1.15→1.0 bounce | playScoop() |

**사운드 중복 방지**: 동일 핸드 + 동일 라인에서 사운드는 1회만 재생.

#### EFX-4. 핸드 카드 흥분 상태 (Excited)

핸드(손패)에 있는 카드 중 보드에 배치하면 좋은 패를 만들 수 있는 카드를 시각적으로 강조한다.

| 트리거 | 시각 효과 | 지속 |
|--------|---------|------|
| `findExcitingCards()` 결과에 포함된 카드 | amber glow + shimmer 1200ms (무한 반복) + shake 3Hz | 핸드에 있는 동안 지속 |

#### EFX-5. Foul 연출

보드 완성(13장) 시 Foul(라인 강도 순서 위반)이 감지되면 경고 연출.

| 트리거 | 시각 효과 | 사운드 | 지속 |
|--------|---------|--------|------|
| `checkFoul(board) == true` | 보드 전체 shake 8Hz + 각 카드 scatter(랜덤 오프셋+회전) | playFoul() | 1500ms |

**우선순위**: Foul 중에는 모든 celebration/impact 이펙트 비활성.

#### EFX-6. 상대 보드 이펙트

상대방이 라인을 완성했을 때, 해당 라인에 이펙트를 표시한다.

| 트리거 | 시각 효과 | 사운드 | 지속 |
|--------|---------|--------|------|
| 서버 `lineCompleted` 이벤트 수신 + celebLevel >= 1 | mini shimmer 600ms (amber) | 없음 | 2초 |
| celebLevel >= 2 | mini glow + shimmer 600ms | 없음 | 2초 |

**판정 방식**: 클라이언트가 상대 보드 데이터(공개 정보)로 `getCelebrationLevel()` 로컬 계산.
**정보 보호**: 미완성 라인 Early Warning은 상대에게 표시하지 않음 (전략 정보 보호).

#### EFX-7. 일반 카드 배치

모든 카드 배치에 기본 피드백을 제공한다.

| 트리거 | 시각 효과 | 사운드 | 햅틱 |
|--------|---------|--------|------|
| 카드 배치 (모든) | scale 80%→100% (easeOutBack 300ms) + fadeIn 200ms | playPlace() | lightImpact |

### 비기능 요구사항

| 항목 | 요구사항 |
|------|---------|
| **이펙트 생명주기** | EffectManager 클래스가 중앙 관리. `clearAll()` 메서드로 전환 시점(라운드/핸드/reconnect/FL/confirm)에서 일괄 정리 |
| **핸드 간 격리** | 이펙트 key에 handNumber 포함하여 핸드 간 충돌 방지 |
| **stateUpdate 내성** | 서버 stateUpdate가 도착해도 이펙트 상태가 소멸하지 않음 (1500ms 타이머 기반 독립 만료) |
| **성능** | 이펙트 판정은 O(n) 이내. flutter_animate 기반 GPU 가속 애니메이션 |

## 구현 상태

| 항목 | 상태 | 근거 커밋 | 비고 |
|------|------|----------|------|
| EffectManager 클래스 | 완료 | 797439c | `lib/logic/effect_manager.dart` 중앙 관리 |
| isImpactPlacement 확장 | 완료 | 6b5fb4a | Flush/Straight 패턴 추가 |
| BoardWidget effectManager 연동 | 완료 | 6b5fb4a, 3c1e1fd | `lib/ui/widgets/board_widget.dart` |
| BUG A: 배타적 이펙트 중첩 방지 | **해결됨** | 87933c7, 35f9fd0 | celebLevel 적용 시 Early Warning 제외 + effective board로 배치 즉시 반영 |
| BUG B: Level 1 celebration 사운드 | **해결됨** | 87933c7, eafcdef | setCelebration 누락 수정 + 사운드 데드락 근본 해결 (#14) |
| BUG C: Early Warning 배치 카드 포함 | **해결됨** | 87933c7 | 트립 3번째 카드까지 이펙트 대상 포함 (#13) |
| 서버 lineCompleted | 완료 | ed6a670, d514648 | `server/game/room.js`, `server/index.js` |
| 상대 보드 이펙트 | 완료 | d514648 | `lib/ui/widgets/opponent_board_widget.dart` |
| EFX-4 Excited 판정 | 완료 | — | `findExcitingCards()` + `_getExcitedCards()` 연동 (`lib/logic/hand_evaluator.dart:202`, `lib/ui/screens/online_game_screen.dart:1217`) |
| EFX-4 Excited 시각 연출 | **부분** | — | amber glow + shake 연출 스펙 대비 HandWidget 적용 범위 미검증, 후속 QA 필요 |
| EFX-5 Foul 연출 (scatter + playFoul) | 완료 | ab0b102, b443c93, 060a77d | `_checkFoulAnimation()` + scatter 오프셋/회전 (`lib/ui/widgets/board_widget.dart:51`, `online_game_screen.dart:426`) |
| EFX-5 Foul 우선순위 차단 | **부분** | — | Foul 중 celebration/impact 비활성 로직 명시적 가드 확인 필요, 후속 작업 |
| W1~W4 사운드 정책 | **결정 필요** | — | 현재 스펙 "없음"이나 Trips/Flush/Straight 형성 피드백 오디오 추가 여부 재검토 필요 |

## 후속 작업

v1.0 → v2.0 드리프트 해소 과정에서 확인된 결정 보류 및 검증 항목.

### 사운드 정책 (W1~W4)

현재 Early Warning(W1~W4) 사운드는 모두 "없음"으로 스펙되어 있으나, Celebration 사운드와의 피드백 격차가 크다는 이슈가 잠재.

| 옵션 | 장점 | 단점 |
|------|------|------|
| 현행 유지 (무음) | Celebration 사운드 강조, 과도한 오디오 피로 방지 | 형성 단계 피드백 약함 |
| 저음량 chime 추가 | 패 형성 과정 체감 강화 | Trips/Flush 구분 설계 필요, 음원 추가 필요 |

**결정 필요자**: 기획 / **마감**: EFX-4 시각 연출 QA 시점과 병합.

### QA 대상 항목

- EFX-4 Excited: HandWidget에서 `_getExcitedCards()` 결과가 amber glow + shake 3Hz + 무한 shimmer 1200ms로 렌더링되는지 시각 확인 (PRD 스펙 60번 줄).
- EFX-5 Foul: Foul 트리거 중 `effectManager.clearAll()` 호출로 celebration/impact가 완전히 차단되는지 확인, 우선순위 가드 명시 코드 필요 시 추가.
- 관련 QA 리포트 경로: `docs/04-report/qa-report-{날짜}-{시간}.md`

## Changelog

| 날짜 | 버전 | 변경 내용 | 변경 유형 | 결정 근거 |
|------|------|-----------|----------|----------|
| 2026-04-17 | v2.0 | BUG A/B/C 최신 커밋 기준 재분류, EFX-4/5 미구현 명시, W1~W4 사운드 정책 결정 필요 | PRODUCT | PRD v1.0 이후 커밋 흐름 미반영 드리프트 해소 |
| 2026-04-02 | v1.0 | 최초 작성 — 이펙트 12가지 기획 명세 | PRODUCT | 이펙트 PRD 부재 발견, 코드 기반 역설계 |
