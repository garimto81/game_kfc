# 이펙트 시스템 근본 재설계 — 설계 문서

## Context

카드를 좋은 패로 배치할 때 시각 이펙트가 비정상 출력되는 버그.
근본 원인: `_localPlacements`가 배치 추적과 이펙트 상태를 겸하며, `stateUpdate` 도착 시 `clear()`로 이펙트 소멸.
추가로 `isImpactPlacement()`와 `getCelebrationLevel()` 판정 기준 불일치, 상대 화면 이펙트 미지원.

GitHub Issue: #13

## 설계 원칙

1. **이펙트 상태 완전 분리** — EffectManager 클래스가 이펙트 생명주기 전담
2. **배타적 이펙트** — 미완성 라인 → impact만, 완성 라인 → celebLevel만 (동시 적용 금지)
3. **서버 변경 최소화** — 서버는 "라인 완성 사실"만 알림, 이펙트 판정은 클라이언트 전담
4. **단일 정리 메서드** — `clearAll()` 하나로 모든 전환 시점 커버

## 수정 대상

### 클라이언트

| 파일 | 변경 | 범위 |
|------|------|------|
| `lib/logic/effect_manager.dart` | **신규** | ~60줄 |
| `lib/ui/screens/online_game_screen.dart` | 수정 | ~50줄 변경 |
| `lib/logic/hand_evaluator.dart` | 수정 | ~10줄 추가 |
| `lib/ui/widgets/board_widget.dart` | 수정 | ~20줄 변경 |
| `lib/ui/widgets/opponent_board_widget.dart` | 수정 | ~25줄 추가 |
| `lib/ui/widgets/board_grid_view.dart` | 수정 | ~5줄 변경 |
| `lib/providers/online_game_provider.dart` | 수정 | ~15줄 추가 |

### 서버

| 파일 | 변경 | 범위 |
|------|------|------|
| `server/game/room.js` | 수정 | ~5줄 추가 |
| `server/index.js` | 수정 | ~5줄 추가 |

## 상세 설계

### 1. EffectManager 클래스 (`lib/logic/effect_manager.dart`)

```dart
class EffectManager {
  // 미완성 라인 Early Warning (1500ms 자동 만료)
  final Map<String, DateTime> _earlyWarnings = {};
  // 라인 완성 celebration (라인별 level)
  final Map<String, int> _celebrations = {};
  // 축하 소리 중복 방지
  final Set<String> _playedSounds = {};

  // key 형식: "hand{N}_{line}_{rank}_{suit}" — 핸드 번호 포함으로 충돌 방지
  void addEarlyWarning(int handNum, String line, List<Card> cards, Duration duration);
  bool isEarlyWarningActive(int handNum, String line, Card card);
  void setCelebration(int handNum, String line, int level);
  int getCelebration(int handNum, String line);
  bool markSoundPlayed(int handNum, String line);
  void clearAll();  // 모든 전환 시점에서 호출
}
```

**clearAll() 호출 시점 5곳:**
- 라운드 전환 (`currentRound` 변경)
- 핸드 전환 (`handNumber` 변경)
- reconnect 복구
- FL 진입/탈출 (`isInFantasyland` 변경)
- confirm 후

### 2. 배타적 이펙트 로직 (`online_game_screen.dart`)

```
_onCardPlaced(card, line):
  simulated = effectiveLineCards + card
  if simulated.length == maxCards:
    // 라인 완성 → celebLevel만 (impact 없음)
    level = getCelebrationLevel(simulated, line)
    if level > 0:
      effectManager.setCelebration(handNum, line, level)
    // _localPlacements에 impact=false
  else:
    // 미완성 → Early Warning만 (celebLevel 없음)
    if isImpactPlacement(card, line, lineCards, maxCards):
      effectManager.addEarlyWarning(handNum, line, lineCards + [card], 1500ms)
      // _localPlacements에 impact=true
```

### 3. isImpactPlacement 미완성 패턴 확장 (`hand_evaluator.dart`)

기존 패턴 (유지):
- `sameRank >= 2` → 트립 감지
- `isTop && sameRank >= 1 && rank >= 12` → QQ+ 감지

추가 패턴:
- `sameSuit >= 3` (5장 라인) → Flush 진행 감지
- 연속 rank 3장+ → Straight 진행 감지

### 4. BoardWidget 변경 (`board_widget.dart`)

파라미터 변경:
- `currentTurnPlacements` → 유지 (undo 용도)
- `lineImpactCards` → `effectManager` 교체
- `handNumber` 추가

isImpact 판정 변경:
```
// 기존: currentTurnPlacements.any(impact) || lineImpactCards.any()
// 수정: effectManager.isEarlyWarningActive(handNum, line, card)
//       (라인 완성 시에는 항상 false → celebLevel이 담당)
```

### 5. 서버 변경 (`room.js`, `index.js`)

room.js placeCard() 반환값 확장:
```javascript
return {
  success: true,
  lineCompleted: lineCards.length === maxSize ? { playerId, line } : null
};
```

index.js handlePlaceCard():
```javascript
if (result.lineCompleted) {
  room.broadcast('lineCompleted', result.lineCompleted);
}
```

### 6. 상대 보드 이펙트

클라이언트가 `lineCompleted` 이벤트 수신 시:
1. gameState에서 해당 플레이어의 board 읽기 (공개 정보)
2. `getCelebrationLevel()` 로컬 계산
3. `OpponentBoardWidget`에 celebLines 전달
4. 미니 카드에 shimmer 애니메이션 표시

## Critic 문제 해결 매핑

| # | 문제 | 해결 |
|---|------|------|
| 1 | 로컬-only | lineCompleted 이벤트로 상대 보드 지원 |
| 2 | 4곳 clear 누락 | EffectManager.clearAll() 5곳 단일 호출 |
| 3 | 핸드 간 key 충돌 | key에 handNumber 포함 |
| 4 | 미완성 Str/Flush 감지 불가 | isImpactPlacement에 suit/연속rank 추가 |
| 5 | 이중 애니메이션 충돌 | 배타적 적용: 미완성→impact, 완성→celebLevel |
| 6 | 서버 미완성 평가 불가 | 서버는 완성 사실만 알림, 평가는 클라 전담 |
| 7 | 전략 정보 누수 | 완성 사실만 전송 (보드는 이미 공개) |
| 8 | 클라-서버 이중 판정 | 서버 판정 없음, 클라이언트 단일 판정 |

## 검증

1. **내 화면 이펙트**: 미완성 패턴 → Early Warning, 라인 완성 → celebLevel, 동시 미발생
2. **타이밍**: stateUpdate 후 이펙트 유지, 라운드 전환 시 정리
3. **상대 화면**: 라인 완성 시 shimmer, 미완성 미표시
4. **엣지 케이스**: reconnect/FL전환/핸드전환 후 유령 이펙트 없음
