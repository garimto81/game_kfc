# Effect System Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 카드 배치 시 이펙트가 stateUpdate에 의해 소멸되는 버그를 근본 해결하고, 배타적 이펙트 적용 + 상대 보드 이펙트를 구현한다.

**Architecture:** EffectManager 클래스가 이펙트 생명주기를 전담하여 `_localPlacements`와 완전 분리. 미완성 라인은 Early Warning(impact), 완성 라인은 celebLevel만 적용하여 이중 애니메이션 방지. 서버는 라인 완성 사실만 알리고 이펙트 판정은 클라이언트 전담.

**Tech Stack:** Flutter/Dart (클라이언트), Node.js (서버), flutter_animate, freezed, riverpod

**Spec:** `docs/superpowers/specs/2026-04-02-effect-system-redesign.md`

---

## File Structure

| 파일 | 역할 | 변경 |
|------|------|------|
| `lib/logic/effect_manager.dart` | 이펙트 생명주기 중앙 관리 | **신규** |
| `test/logic/effect_manager_test.dart` | EffectManager 단위 테스트 | **신규** |
| `lib/logic/hand_evaluator.dart` | 미완성 Flush/Straight 패턴 감지 추가 | 수정 |
| `test/logic/hand_evaluator_test.dart` | 확장된 패턴 감지 테스트 추가 | 수정 |
| `lib/ui/widgets/board_widget.dart` | effectManager 기반 isImpact 판정 | 수정 |
| `lib/ui/widgets/opponent_board_widget.dart` | celebLines shimmer 이펙트 추가 | 수정 |
| `lib/ui/widgets/board_grid_view.dart` | effectManager 파라미터 전달 | 수정 |
| `lib/ui/screens/online_game_screen.dart` | 배타적 이펙트 로직 + clearAll 5곳 | 수정 |
| `lib/providers/online_game_provider.dart` | lineCompleted 메시지 핸들러 | 수정 |
| `server/game/room.js` | placeCard lineCompleted 반환 | 수정 |
| `server/index.js` | lineCompleted 브로드캐스트 | 수정 |

---

## Task 1: EffectManager 클래스 생성

**Files:**
- Create: `lib/logic/effect_manager.dart`
- Create: `test/logic/effect_manager_test.dart`

- [ ] **Step 1: 테스트 작성**

```dart
// test/logic/effect_manager_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:game_kfc/models/card.dart';
import 'package:game_kfc/logic/effect_manager.dart';

Card c(Rank r, Suit s) => Card(rank: r, suit: s);

void main() {
  late EffectManager mgr;

  setUp(() {
    mgr = EffectManager();
  });

  group('earlyWarning', () {
    test('추가 후 활성 상태 확인', () {
      final card = c(Rank.queen, Suit.spade);
      mgr.addEarlyWarning(1, 'top', [card]);
      expect(mgr.isEarlyWarningActive(1, 'top', card), isTrue);
    });

    test('다른 핸드 번호에서 비활성', () {
      final card = c(Rank.queen, Suit.spade);
      mgr.addEarlyWarning(1, 'top', [card]);
      expect(mgr.isEarlyWarningActive(2, 'top', card), isFalse);
    });

    test('다른 라인에서 비활성', () {
      final card = c(Rank.queen, Suit.spade);
      mgr.addEarlyWarning(1, 'top', [card]);
      expect(mgr.isEarlyWarningActive(1, 'mid', card), isFalse);
    });

    test('만료 후 비활성', () {
      final card = c(Rank.queen, Suit.spade);
      mgr.addEarlyWarning(1, 'top', [card],
          duration: const Duration(milliseconds: 0));
      // tick으로 만료 정리
      mgr.tick();
      expect(mgr.isEarlyWarningActive(1, 'top', card), isFalse);
    });

    test('여러 카드 동시 추가', () {
      final cards = [c(Rank.queen, Suit.spade), c(Rank.queen, Suit.heart)];
      mgr.addEarlyWarning(1, 'top', cards);
      expect(mgr.isEarlyWarningActive(1, 'top', cards[0]), isTrue);
      expect(mgr.isEarlyWarningActive(1, 'top', cards[1]), isTrue);
    });
  });

  group('celebration', () {
    test('설정 후 레벨 반환', () {
      mgr.setCelebration(1, 'top', 2);
      expect(mgr.getCelebration(1, 'top'), 2);
    });

    test('미설정 시 0 반환', () {
      expect(mgr.getCelebration(1, 'top'), 0);
    });

    test('다른 핸드 번호는 독립', () {
      mgr.setCelebration(1, 'top', 3);
      expect(mgr.getCelebration(2, 'top'), 0);
    });
  });

  group('sound tracking', () {
    test('첫 호출 true, 두번째 false', () {
      expect(mgr.markSoundPlayed(1, 'top'), isTrue);
      expect(mgr.markSoundPlayed(1, 'top'), isFalse);
    });
  });

  group('clearAll', () {
    test('모든 상태 초기화', () {
      final card = c(Rank.ace, Suit.spade);
      mgr.addEarlyWarning(1, 'top', [card]);
      mgr.setCelebration(1, 'mid', 2);
      mgr.markSoundPlayed(1, 'bottom');
      mgr.clearAll();
      expect(mgr.isEarlyWarningActive(1, 'top', card), isFalse);
      expect(mgr.getCelebration(1, 'mid'), 0);
      expect(mgr.markSoundPlayed(1, 'bottom'), isTrue); // 리셋됨
    });
  });

  group('earlyWarningCards', () {
    test('특정 라인의 활성 카드 목록 반환', () {
      final cards = [c(Rank.queen, Suit.spade), c(Rank.queen, Suit.heart)];
      mgr.addEarlyWarning(1, 'top', cards);
      final active = mgr.earlyWarningCards(1, 'top');
      expect(active, containsAll(cards));
    });

    test('빈 라인은 빈 리스트', () {
      expect(mgr.earlyWarningCards(1, 'mid'), isEmpty);
    });
  });
}
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `cd C:/claude/game_kfc_pro && flutter test test/logic/effect_manager_test.dart`
Expected: FAIL — `effect_manager.dart` 파일 미존재

- [ ] **Step 3: EffectManager 구현**

```dart
// lib/logic/effect_manager.dart
import '../models/card.dart';

class EffectManager {
  /// 미완성 라인 Early Warning — 카드별 만료 시간
  final Map<String, DateTime> _earlyWarnings = {};

  /// 라인 완성 celebration level 캐시
  final Map<String, int> _celebrations = {};

  /// 축하 소리 중복 방지
  final Set<String> _playedSounds = {};

  /// Early Warning 추가 (기본 1500ms 만료)
  void addEarlyWarning(int handNum, String line, List<Card> cards,
      {Duration duration = const Duration(milliseconds: 1500)}) {
    final expiry = DateTime.now().add(duration);
    for (final card in cards) {
      _earlyWarnings[_cardKey(handNum, line, card)] = expiry;
    }
  }

  /// Early Warning 활성 여부 (만료 체크 포함)
  bool isEarlyWarningActive(int handNum, String line, Card card) {
    final key = _cardKey(handNum, line, card);
    final expiry = _earlyWarnings[key];
    if (expiry == null) return false;
    if (DateTime.now().isAfter(expiry)) {
      _earlyWarnings.remove(key);
      return false;
    }
    return true;
  }

  /// 특정 라인의 활성 Early Warning 카드 목록
  List<Card> earlyWarningCards(int handNum, String line) {
    final prefix = 'h${handNum}_${line}_';
    final now = DateTime.now();
    final result = <Card>[];
    _earlyWarnings.removeWhere((k, v) => now.isAfter(v));
    for (final key in _earlyWarnings.keys) {
      if (key.startsWith(prefix)) {
        final card = _parseCardFromKey(key);
        if (card != null) result.add(card);
      }
    }
    return result;
  }

  /// Celebration level 설정
  void setCelebration(int handNum, String line, int level) {
    _celebrations['h${handNum}_$line'] = level;
  }

  /// Celebration level 반환 (미설정 시 0)
  int getCelebration(int handNum, String line) {
    return _celebrations['h${handNum}_$line'] ?? 0;
  }

  /// 소리 재생 마킹 — 첫 호출 true, 이후 false
  bool markSoundPlayed(int handNum, String line) {
    return _playedSounds.add('h${handNum}_$line');
  }

  /// 만료된 earlyWarning 정리
  void tick() {
    final now = DateTime.now();
    _earlyWarnings.removeWhere((_, expiry) => now.isAfter(expiry));
  }

  /// 모든 상태 초기화
  void clearAll() {
    _earlyWarnings.clear();
    _celebrations.clear();
    _playedSounds.clear();
  }

  /// 활성 early warning이 하나라도 있는지
  bool get hasActiveWarnings => _earlyWarnings.isNotEmpty;

  String _cardKey(int handNum, String line, Card card) =>
      'h${handNum}_${line}_${card.rank.value}_${card.suit.value}';

  Card? _parseCardFromKey(String key) {
    final parts = key.split('_');
    if (parts.length < 4) return null;
    final rankVal = int.tryParse(parts[parts.length - 2]);
    final suitVal = int.tryParse(parts[parts.length - 1]);
    if (rankVal == null || suitVal == null) return null;
    try {
      final rank = Rank.values.firstWhere((r) => r.value == rankVal);
      final suit = Suit.values.firstWhere((s) => s.value == suitVal);
      return Card(rank: rank, suit: suit);
    } catch (_) {
      return null;
    }
  }
}
```

- [ ] **Step 4: 테스트 실행하여 통과 확인**

Run: `cd C:/claude/game_kfc_pro && flutter test test/logic/effect_manager_test.dart -v`
Expected: All tests PASS

- [ ] **Step 5: 커밋**

```bash
cd C:/claude/game_kfc_pro
git add lib/logic/effect_manager.dart test/logic/effect_manager_test.dart
git commit -m "feat: EffectManager 클래스 — 이펙트 생명주기 중앙 관리"
```

---

## Task 2: isImpactPlacement 미완성 패턴 확장

**Files:**
- Modify: `lib/logic/hand_evaluator.dart:219-237`
- Modify: `test/logic/hand_evaluator_test.dart`

- [ ] **Step 1: 새 패턴 감지 테스트 추가**

`test/logic/hand_evaluator_test.dart` 하단에 추가:

```dart
  group('isImpactPlacement - 확장 패턴', () {
    test('미완성 Mid: 동일 suit 3장 → Flush 감지', () {
      final lineCards = [
        c(Rank.two, Suit.heart),
        c(Rank.seven, Suit.heart),
        c(Rank.jack, Suit.heart),
      ];
      final card = c(Rank.king, Suit.heart);
      expect(isImpactPlacement(card, 'mid', lineCards, 5), isTrue);
    });

    test('미완성 Mid: 동일 suit 2장 → Flush 미감지', () {
      final lineCards = [
        c(Rank.two, Suit.heart),
        c(Rank.seven, Suit.spade),
      ];
      final card = c(Rank.king, Suit.heart);
      expect(isImpactPlacement(card, 'mid', lineCards, 5), isFalse);
    });

    test('미완성 Bottom: 연속 rank 3장 → Straight 감지', () {
      final lineCards = [
        c(Rank.five, Suit.heart),
        c(Rank.six, Suit.spade),
      ];
      final card = c(Rank.seven, Suit.diamond);
      expect(isImpactPlacement(card, 'bottom', lineCards, 5), isTrue);
    });

    test('미완성 Bottom: 연속 rank 2장 → Straight 미감지', () {
      final lineCards = [
        c(Rank.five, Suit.heart),
      ];
      final card = c(Rank.seven, Suit.diamond);
      expect(isImpactPlacement(card, 'bottom', lineCards, 5), isFalse);
    });

    test('Top 라인은 Flush/Straight 패턴 감지 안 함 (3장 라인)', () {
      final lineCards = [
        c(Rank.five, Suit.heart),
        c(Rank.six, Suit.heart),
      ];
      final card = c(Rank.seven, Suit.heart);
      // Top은 3장 → 완성이므로 _isExcitingResult로 판정
      // Straight Flush이므로 true
      expect(isImpactPlacement(card, 'top', lineCards, 3), isTrue);
    });

    test('기존 트립 감지 유지', () {
      final lineCards = [
        c(Rank.ace, Suit.spade),
        c(Rank.ace, Suit.heart),
      ];
      final card = c(Rank.ace, Suit.diamond);
      expect(isImpactPlacement(card, 'mid', lineCards, 5), isTrue);
    });

    test('기존 Top QQ+ 감지 유지', () {
      final lineCards = [
        c(Rank.queen, Suit.spade),
      ];
      final card = c(Rank.queen, Suit.heart);
      expect(isImpactPlacement(card, 'top', lineCards, 3), isTrue);
    });
  });
```

- [ ] **Step 2: 테스트 실행하여 새 패턴 테스트 실패 확인**

Run: `cd C:/claude/game_kfc_pro && flutter test test/logic/hand_evaluator_test.dart -v`
Expected: Flush/Straight 감지 테스트 FAIL (기존 테스트는 PASS)

- [ ] **Step 3: isImpactPlacement 미완성 로직 확장**

`lib/logic/hand_evaluator.dart` 라인 219-237 수정:

```dart
/// 카드를 라인에 배치했을 때 트립스+/QQ+ FL/Flush/Straight가 완성되는지 판정 (배치 임팩트용).
bool isImpactPlacement(
    Card card, String line, List<Card> lineCards, int maxCards) {
  if (lineCards.length + 1 > maxCards) return false;
  final simulated = [...lineCards, card];
  final isTop = line == 'top';

  // 라인 완성 → 정확 판정
  if (simulated.length == maxCards) {
    final r = evaluateHand(simulated);
    return _isExcitingResult(r, isTop);
  }

  // 미완성 → 패턴 감지
  final sameRank = lineCards.where((c) => c.rank == card.rank).length;
  if (sameRank >= 2) return true; // 트립 형성 중
  if (isTop && sameRank >= 1 && card.rank.value >= 12) return true; // QQ+

  // 5장 라인만: Flush/Straight 패턴 감지
  if (!isTop && simulated.length >= 4) {
    // Flush: 동일 suit 4장+
    final sameSuit =
        simulated.where((c) => c.suit == card.suit).length;
    if (sameSuit >= 4) return true;

    // Straight: 연속 rank 3장+
    final ranks = simulated.map((c) => c.rank.value).toSet().toList()..sort();
    int maxConsecutive = 1;
    int current = 1;
    for (int i = 1; i < ranks.length; i++) {
      if (ranks[i] == ranks[i - 1] + 1) {
        current++;
        if (current > maxConsecutive) maxConsecutive = current;
      } else {
        current = 1;
      }
    }
    // Ace-low: A(14)를 1로도 체크
    if (ranks.contains(14) && ranks.contains(2)) {
      final lowRanks = [1, ...ranks.where((r) => r != 14)]..sort();
      int lowCurrent = 1;
      for (int i = 1; i < lowRanks.length; i++) {
        if (lowRanks[i] == lowRanks[i - 1] + 1) {
          lowCurrent++;
          if (lowCurrent > maxConsecutive) maxConsecutive = lowCurrent;
        } else {
          lowCurrent = 1;
        }
      }
    }
    if (maxConsecutive >= 3) return true;
  }

  return false;
}
```

- [ ] **Step 4: 테스트 실행하여 전체 통과 확인**

Run: `cd C:/claude/game_kfc_pro && flutter test test/logic/hand_evaluator_test.dart -v`
Expected: All tests PASS (기존 + 신규 모두)

- [ ] **Step 5: 커밋**

```bash
cd C:/claude/game_kfc_pro
git add lib/logic/hand_evaluator.dart test/logic/hand_evaluator_test.dart
git commit -m "feat: isImpactPlacement에 Flush/Straight 미완성 패턴 감지 추가"
```

---

## Task 3: BoardWidget — effectManager 기반으로 전환

**Files:**
- Modify: `lib/ui/widgets/board_widget.dart:12-30, 253-310, 346-380`

- [ ] **Step 1: BoardWidget 파라미터 변경**

`lib/ui/widgets/board_widget.dart` 파라미터를 수정한다.

기존 (라인 17-18):
```dart
  final List<({ofc.Card card, String line, bool impact})> currentTurnPlacements;
  final Set<({ofc.Card card, String line})> lineImpactCards;
```

수정:
```dart
  final List<({ofc.Card card, String line, bool impact})> currentTurnPlacements;
  final EffectManager? effectManager;
  final int handNumber;
```

import 추가 (라인 5 부근):
```dart
import '../../logic/effect_manager.dart';
```

생성자 수정 (라인 28-29):
```dart
    // lineImpactCards 제거, 아래 추가:
    this.effectManager,
    this.handNumber = 0,
```

- [ ] **Step 2: _buildLine 내 isImpact 판정 변경**

`lib/ui/widgets/board_widget.dart` _buildLine 메서드 (라인 286-293) 수정:

기존:
```dart
          final isImpact = (isUndoable &&
                  widget.currentTurnPlacements.any((p) =>
                      p.card == cards[i] &&
                      p.line == lineName &&
                      p.impact)) ||
              (i < cards.length &&
                  widget.lineImpactCards.any(
                      (p) => p.card == cards[i] && p.line == lineName));
```

수정:
```dart
          final isImpact = i < cards.length &&
              widget.effectManager != null &&
              widget.effectManager!
                  .isEarlyWarningActive(widget.handNumber, lineName, cards[i]);
```

- [ ] **Step 3: celebLevel 판정에 배타적 적용 보장**

`lib/ui/widgets/board_widget.dart` _buildLine 메서드 (라인 258) 수정:

기존:
```dart
    final celebLevel = isFoul ? 0 : getCelebrationLevel(cards, lineName);
```

수정:
```dart
    // 배타적 적용: EffectManager celebration 우선, 없으면 기존 getCelebrationLevel
    int celebLevel;
    if (isFoul) {
      celebLevel = 0;
    } else if (widget.effectManager != null) {
      celebLevel = widget.effectManager!.getCelebration(widget.handNumber, lineName);
      // EffectManager에 없으면 getCelebrationLevel fallback (라인 완성 시)
      if (celebLevel == 0) {
        celebLevel = getCelebrationLevel(cards, lineName);
      }
    } else {
      celebLevel = getCelebrationLevel(cards, lineName);
    }
```

- [ ] **Step 4: LineSlotWidget의 key 로직 유지 확인**

isImpact가 effectManager 기반으로 바뀌었으므로 key는 동일하게 작동:
```dart
            key: isImpact
                ? ValueKey('impact_${lineName}_$i')
                : null,
```

stateUpdate가 와도 effectManager의 earlyWarning이 만료 전까지 isImpact=true 유지 → key 변경 없음 → 애니메이션 유지됨.

- [ ] **Step 5: 기존 테스트 수정 (lineImpactCards 제거)**

`test/widgets/board_widget_test.dart` — BoardWidget 생성 시 `lineImpactCards` 파라미터를 제거. 기존 테스트에서 이 파라미터를 사용하지 않으므로 변경 없이 통과해야 함.

Run: `cd C:/claude/game_kfc_pro && flutter test test/widgets/board_widget_test.dart -v`
Expected: All tests PASS

- [ ] **Step 6: 커밋**

```bash
cd C:/claude/game_kfc_pro
git add lib/ui/widgets/board_widget.dart test/widgets/board_widget_test.dart
git commit -m "refactor: BoardWidget — effectManager 기반 isImpact 판정으로 전환"
```

---

## Task 4: BoardGridView 파라미터 전달 변경

**Files:**
- Modify: `lib/ui/widgets/board_grid_view.dart:18-48`

- [ ] **Step 1: BoardGridView 파라미터 변경**

`lib/ui/widgets/board_grid_view.dart` 수정:

기존 (라인 26-27):
```dart
  final List<({ofc.Card card, String line, bool impact})> currentTurnPlacements;
  final Set<({ofc.Card card, String line})> lineImpactCards;
```

수정:
```dart
  final List<({ofc.Card card, String line, bool impact})> currentTurnPlacements;
  final EffectManager? effectManager;
  final int handNumber;
```

import 추가:
```dart
import '../../logic/effect_manager.dart';
```

생성자 수정:
```dart
    // lineImpactCards 제거, 아래 추가:
    this.effectManager,
    this.handNumber = 0,
```

BoardWidget 사용부에서 `lineImpactCards:` → `effectManager:`, `handNumber:` 전달로 변경. (해당 파일 내에서 BoardWidget을 생성하는 곳 수정)

- [ ] **Step 2: 빌드 확인**

Run: `cd C:/claude/game_kfc_pro && flutter analyze lib/ui/widgets/board_grid_view.dart`
Expected: No errors (warning은 OK)

- [ ] **Step 3: 커밋**

```bash
cd C:/claude/game_kfc_pro
git add lib/ui/widgets/board_grid_view.dart
git commit -m "refactor: BoardGridView — effectManager 파라미터로 전환"
```

---

## Task 5: online_game_screen — 배타적 이펙트 + clearAll 5곳

**Files:**
- Modify: `lib/ui/screens/online_game_screen.dart:38-50, 338-384, 470-498, 583-666, 830-852, 1239-1286`

이 Task가 핵심이다. `_lineImpactCards`, `_celebratedLines`를 EffectManager로 교체하고 배타적 이펙트 로직을 적용한다.

- [ ] **Step 1: 상태 변수 교체**

`lib/ui/screens/online_game_screen.dart` 라인 38-50 수정:

기존:
```dart
  final List<({ofc.Card card, String line, bool impact})> _localPlacements = [];
  // 트립스+ 완성 시 관련 카드 전체 임팩트 (기존 카드 포함)
  Set<({ofc.Card card, String line})> _lineImpactCards = {};
  int _impactGeneration = 0; // 임팩트 리빌드 강제용
  ...
  // 축하 사운드 중복 방지 (라운드마다 초기화)
  final Set<String> _celebratedLines = {};
```

수정:
```dart
  final List<({ofc.Card card, String line, bool impact})> _localPlacements = [];
  final EffectManager _effectManager = EffectManager();
```

import 추가:
```dart
import '../../logic/effect_manager.dart';
```

- [ ] **Step 2: _onCardPlaced — 배타적 이펙트 로직**

`lib/ui/screens/online_game_screen.dart` `_onCardPlaced()` (라인 338-384) 전체 교체:

```dart
  void _onCardPlaced(ofc.Card card, String line, {String? fromLine}) {
    final onlineState = ref.read(onlineGameNotifierProvider);
    if (!onlineState.isMyTurn) return;
    final notifier = ref.read(onlineGameNotifierProvider.notifier);
    if (fromLine != null) {
      notifier.unplaceCard(card, fromLine);
      _localPlacements.removeWhere((p) => p.card == card && p.line == fromLine);
    }

    final lineCards = _getEffectiveLineCards(line);
    final maxCards = line == 'top' ? 3 : 5;
    final simulated = [...lineCards, card];
    final handNum = onlineState.handNumber;

    notifier.placeCard(card, line);

    // Sound & haptic
    final settings = ref.read(settingsNotifierProvider);
    AudioService.instance.enabled = settings.soundEnabled;
    AudioService.instance.playPlace();
    if (settings.hapticEnabled) HapticFeedback.lightImpact();

    // 배타적 이펙트: 완성 → celebLevel만, 미완성 → earlyWarning만
    if (simulated.length == maxCards) {
      // 라인 완성 → celebration level 설정 (impact 없음)
      final level = getCelebrationLevel(simulated, line);
      if (level > 0) {
        _effectManager.setCelebration(handNum, line, level);
      }
      setState(() {
        _localPlacements.add((card: card, line: line, impact: false));
      });
    } else {
      // 미완성 → Early Warning 판정
      final isEarlyWarning = isImpactPlacement(card, line, lineCards, maxCards);
      if (isEarlyWarning) {
        _effectManager.addEarlyWarning(handNum, line, simulated);
        setState(() {
          _localPlacements.add((card: card, line: line, impact: true));
        });
        // 1.5초 후 earlyWarning 만료 → 리빌드
        Future.delayed(const Duration(milliseconds: 1500), () {
          if (mounted) setState(() {});
        });
      } else {
        setState(() {
          _localPlacements.add((card: card, line: line, impact: false));
        });
      }
    }

    _checkCelebration();
    _checkFoulAnimation();
    _tryAutoConfirm();
  }
```

- [ ] **Step 3: _checkCelebration — EffectManager 기반으로 변경**

`lib/ui/screens/online_game_screen.dart` `_checkCelebration()` 수정:

```dart
  void _checkCelebration() {
    final board = _getMyBoard();
    final handNum = ref.read(onlineGameNotifierProvider).handNumber;
    final lines = {'top': board.top, 'mid': board.mid, 'bottom': board.bottom};

    for (final entry in lines.entries) {
      final maxCards = entry.key == 'top' ? 3 : 5;
      if (entry.value.length == maxCards) {
        final level = getCelebrationLevel(entry.value, entry.key);
        if (level >= 3 && _effectManager.markSoundPlayed(handNum, entry.key)) {
          AudioService.instance.playScoop();
          return;
        } else if (level >= 2 && _effectManager.markSoundPlayed(handNum, entry.key)) {
          AudioService.instance.playCelebration();
          return;
        } else if (level >= 1 && _effectManager.markSoundPlayed(handNum, entry.key)) {
          AudioService.instance.playCelebration();
        }
      }
    }
  }
```

- [ ] **Step 4: clearAll 5곳 추가**

`lib/ui/screens/online_game_screen.dart` ref.listen 내부 수정:

**① 라운드/핸드 전환 (라인 632-638):**
```dart
      if (prev?.currentRound != next.currentRound ||
          prev?.handNumber != next.handNumber) {
        setState(() {
          _hasDiscarded = false;
          _discardedCard = null;
          _localPlacements.clear();
          _effectManager.clearAll(); // 추가
        });
      }
```

**② reconnect 복구 (라인 586-589):**
```dart
      if (prev?.connectionState == OnlineConnectionState.reconnecting &&
          next.connectionState == OnlineConnectionState.playing) {
        _lastDeadline = null;
        setState(() {
          _localPlacements.clear(); // 추가
          _effectManager.clearAll(); // 추가
        });
      }
```

**③ FL 진입/탈출 (ref.listen 내, handScored 근처에 추가):**
```dart
      if (prev?.isInFantasyland != next.isInFantasyland) {
        _effectManager.clearAll();
      }
```

**④ confirm (FL) — 라인 480-486:**
기존 `_celebratedLines.clear();` → `_effectManager.clearAll();`

**⑤ confirm (일반) — 라인 492-497:**
기존 `_celebratedLines.clear();` → `_effectManager.clearAll();`

- [ ] **Step 5: BoardWidget 호출부 파라미터 변경**

`_buildMyBoardSection` 내 BoardWidget (라인 1271-1279):
```dart
                child: BoardWidget(
                  board: board,
                  availableLines: availableLines,
                  onCardPlaced: _onCardPlaced,
                  currentTurnPlacements: _localPlacements,
                  effectManager: _effectManager,
                  handNumber: ref.read(onlineGameNotifierProvider).handNumber,
                  onUndoCard: _onTapPlacedCard,
                  showFoulAnimation: _foulTriggered,
                ),
```

Grid View 호출부 (라인 838-851):
```dart
                  child: BoardGridView(
                    opponents: opponents,
                    myPlayerId: onlineState.playerId,
                    myBoard: myBoard,
                    availableLines: availableLines,
                    onCardPlaced: _onCardPlaced,
                    onUndoCard: _onTapPlacedCard,
                    currentTurnPlacements: _localPlacements,
                    effectManager: _effectManager,
                    handNumber: onlineState.handNumber,
                    myIsInFL: onlineState.isInFantasyland,
                    foulWarning: _buildCompactFoulWarning(myBoard),
                    mySeatIndex: _getSeatIndex(onlineState.playerId),
                    showFoulAnimation: _foulTriggered,
                  ),
```

- [ ] **Step 6: _getExcitedCards 내 lineImpactCards 참조 제거**

`_getExcitedCards()` (라인 1114-1121)에서 `_getEffectiveLineCards`를 호출하는데, 이는 변경 불필요. 단, `_lineImpactCards` 직접 참조가 있으면 제거.

- [ ] **Step 7: 빌드 확인**

Run: `cd C:/claude/game_kfc_pro && flutter analyze lib/ui/screens/online_game_screen.dart`
Expected: No errors

- [ ] **Step 8: 커밋**

```bash
cd C:/claude/game_kfc_pro
git add lib/ui/screens/online_game_screen.dart
git commit -m "feat: 배타적 이펙트 + EffectManager clearAll 5곳 적용"
```

---

## Task 6: 서버 — lineCompleted 브로드캐스트

**Files:**
- Modify: `server/game/room.js:508-513`
- Modify: `server/index.js:522-535`

- [ ] **Step 1: room.js placeCard 반환값 확장**

`server/game/room.js` 라인 512-513 수정:

기존:
```javascript
    return { success: true };
```

수정:
```javascript
    // 라인 완성 여부 반환 (이펙트 브로드캐스트용)
    const maxSize = line === 'top' ? 3 : 5;
    const lineCompleted = player.board[line].length === maxSize
        ? { playerId, line }
        : null;
    return { success: true, lineCompleted };
```

- [ ] **Step 2: index.js handlePlaceCard에 lineCompleted 브로드캐스트 추가**

`server/index.js` 라인 531-535 수정:

기존:
```javascript
  // 상태 업데이트 브로드캐스트
  broadcastStateUpdate(room);
```

수정:
```javascript
  // 라인 완성 이벤트 브로드캐스트 (stateUpdate 전에 전송)
  if (result.lineCompleted) {
    room.broadcast('lineCompleted', result.lineCompleted);
  }

  // 상태 업데이트 브로드캐스트
  broadcastStateUpdate(room);
```

- [ ] **Step 3: 서버 실행 확인**

Run: `cd C:/claude/game_kfc_pro && node -e "require('./server/game/room.js')"`
Expected: No errors

- [ ] **Step 4: 커밋**

```bash
cd C:/claude/game_kfc_pro
git add server/game/room.js server/index.js
git commit -m "feat(server): placeCard 시 lineCompleted 이벤트 브로드캐스트"
```

---

## Task 7: 클라이언트 — lineCompleted 수신 + 상대 보드 이펙트

**Files:**
- Modify: `lib/providers/online_game_provider.dart:333-455`
- Modify: `lib/ui/widgets/opponent_board_widget.dart:1-95`
- Modify: `lib/ui/screens/online_game_screen.dart` (OpponentBoardWidget 호출부)

- [ ] **Step 1: OnlineState에 opponentCelebLines 추가**

`lib/providers/online_game_provider.dart` OnlineState 클래스에 필드 추가:

```dart
  // 상대 보드 라인 완성 이펙트 (playerId_line → celebLevel)
  final Map<String, int> opponentCelebLines;
```

copyWith에 포함, 기본값 `const {}`.

- [ ] **Step 2: _handleMessage에 lineCompleted 핸들러 추가**

`lib/providers/online_game_provider.dart` switch문 (라인 338 부근)에 추가:

```dart
      case 'lineCompleted':
        final lcPlayerId = payload['playerId'] as String?;
        final lcLine = payload['line'] as String?;
        if (lcPlayerId != null && lcLine != null && lcPlayerId != state.playerId) {
          // 상대 보드에서 해당 라인 카드를 읽어 celebLevel 계산
          final players = state.gameState?['players'] as Map<String, dynamic>?;
          final playerData = players?[lcPlayerId] as Map<String, dynamic>?;
          final boardData = playerData?['board'] as Map<String, dynamic>?;
          if (boardData != null) {
            final board = parseBoard(boardData);
            if (board != null) {
              final cards = lcLine == 'top'
                  ? board.top
                  : lcLine == 'mid'
                      ? board.mid
                      : board.bottom;
              final level = getCelebrationLevel(cards, lcLine);
              if (level > 0) {
                final newMap = Map<String, int>.from(state.opponentCelebLines);
                newMap['${lcPlayerId}_$lcLine'] = level;
                state = state.copyWith(opponentCelebLines: newMap);
                // 2초 후 제거
                Future.delayed(const Duration(seconds: 2), () {
                  final updated = Map<String, int>.from(state.opponentCelebLines);
                  updated.remove('${lcPlayerId}_$lcLine');
                  state = state.copyWith(opponentCelebLines: updated);
                });
              }
            }
          }
        }
        break;
```

import 추가:
```dart
import '../logic/hand_evaluator.dart' show getCelebrationLevel;
```

- [ ] **Step 3: OpponentBoardWidget에 celebLines 파라미터 추가**

`lib/ui/widgets/opponent_board_widget.dart` 수정:

```dart
import 'package:flutter_animate/flutter_animate.dart';  // 추가

class OpponentBoardWidget extends StatelessWidget {
  final Player opponent;
  final bool hideCards;
  final VoidCallback? onTap;
  final Map<String, int> celebLines; // 추가: line → celebLevel

  const OpponentBoardWidget({
    super.key,
    required this.opponent,
    this.hideCards = false,
    this.onTap,
    this.celebLines = const {},  // 추가
  });
```

`_buildMiniLine` 메서드에 lineName 파라미터 추가:

```dart
  Widget _buildMiniLine(List<ofc.Card> cards, int maxCards, String lineName) {
    Widget lineWidget = Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(maxCards, (i) {
        if (i < cards.length) {
          return Padding(
            padding: const EdgeInsets.all(1),
            child: SizedBox(
              width: 18,
              height: 22,
              child: CardWidget(
                card: cards[i],
                faceDown: hideCards,
                miniMode: true,
              ),
            ),
          );
        }
        return Padding(
          padding: const EdgeInsets.all(1),
          child: Container(
            width: 18,
            height: 22,
            decoration: BoxDecoration(
              color: Colors.grey[100],
              borderRadius: BorderRadius.circular(2),
              border: Border.all(color: Colors.grey[300]!),
            ),
          ),
        );
      }),
    );

    // 라인 완성 이펙트
    final level = celebLines[lineName] ?? 0;
    if (level >= 2) {
      lineWidget = Container(
        decoration: BoxDecoration(
          boxShadow: [
            BoxShadow(
              color: Colors.amber.withValues(alpha: level == 3 ? 0.6 : 0.3),
              blurRadius: level == 3 ? 12 : 8,
              spreadRadius: level == 3 ? 2 : 1,
            ),
          ],
        ),
        child: lineWidget,
      )
          .animate(onPlay: (c) => c.forward())
          .shimmer(duration: 600.ms, color: Colors.amber.withValues(alpha: 0.4));
    } else if (level == 1) {
      lineWidget = lineWidget
          .animate(onPlay: (c) => c.forward())
          .shimmer(duration: 600.ms, color: Colors.amber.withValues(alpha: 0.3));
    }

    return lineWidget;
  }
```

build 메서드에서 _buildMiniLine 호출 변경:

```dart
              _buildMiniLine(opponent.board.top, OFCBoard.topMaxCards, 'top'),
              const SizedBox(height: 1),
              _buildMiniLine(opponent.board.mid, OFCBoard.midMaxCards, 'mid'),
              const SizedBox(height: 1),
              _buildMiniLine(opponent.board.bottom, OFCBoard.bottomMaxCards, 'bottom'),
```

- [ ] **Step 4: online_game_screen에서 OpponentBoardWidget에 celebLines 전달**

OpponentBoardWidget 사용부를 찾아 `celebLines` 전달:

```dart
OpponentBoardWidget(
  opponent: opponent,
  hideCards: ...,
  onTap: ...,
  celebLines: _getOpponentCelebLines(opponent.id),
)
```

헬퍼 메서드 추가:
```dart
  Map<String, int> _getOpponentCelebLines(String playerId) {
    final onlineState = ref.read(onlineGameNotifierProvider);
    final result = <String, int>{};
    for (final entry in onlineState.opponentCelebLines.entries) {
      if (entry.key.startsWith('${playerId}_')) {
        final line = entry.key.substring(playerId.length + 1);
        result[line] = entry.value;
      }
    }
    return result;
  }
```

- [ ] **Step 5: 빌드 확인**

Run: `cd C:/claude/game_kfc_pro && flutter analyze`
Expected: No errors

- [ ] **Step 6: 커밋**

```bash
cd C:/claude/game_kfc_pro
git add lib/providers/online_game_provider.dart lib/ui/widgets/opponent_board_widget.dart lib/ui/screens/online_game_screen.dart
git commit -m "feat: lineCompleted 수신 + 상대 보드 celebration 이펙트"
```

---

## Task 8: 전체 빌드 + 기존 테스트 통과 확인

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 테스트 실행**

Run: `cd C:/claude/game_kfc_pro && flutter test test/logic/effect_manager_test.dart test/logic/hand_evaluator_test.dart test/widgets/board_widget_test.dart -v`
Expected: All tests PASS

- [ ] **Step 2: flutter analyze**

Run: `cd C:/claude/game_kfc_pro && flutter analyze`
Expected: No errors

- [ ] **Step 3: flutter build web**

Run: `cd C:/claude/game_kfc_pro && flutter build web`
Expected: Build 성공

- [ ] **Step 4: Docker 리빌드**

Run: `cd C:/claude/game_kfc_pro && docker-compose up -d --build`
Expected: 서버 + 웹 정상 기동

- [ ] **Step 5: 최종 커밋 (필요 시)**

누락된 파일이 있으면 추가 커밋.
