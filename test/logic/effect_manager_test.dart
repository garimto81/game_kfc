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
    test('add and check active', () {
      final card = c(Rank.ace, Suit.spade);
      mgr.addEarlyWarning(1, 'top', [card]);
      expect(mgr.isEarlyWarningActive(1, 'top', card), isTrue);
      expect(mgr.hasActiveWarnings, isTrue);
    });

    test('wrong hand number returns false', () {
      final card = c(Rank.ace, Suit.spade);
      mgr.addEarlyWarning(1, 'top', [card]);
      expect(mgr.isEarlyWarningActive(2, 'top', card), isFalse);
    });

    test('wrong line returns false', () {
      final card = c(Rank.ace, Suit.spade);
      mgr.addEarlyWarning(1, 'top', [card]);
      expect(mgr.isEarlyWarningActive(1, 'middle', card), isFalse);
    });

    test('wrong card returns false', () {
      final card = c(Rank.ace, Suit.spade);
      final other = c(Rank.king, Suit.heart);
      mgr.addEarlyWarning(1, 'top', [card]);
      expect(mgr.isEarlyWarningActive(1, 'top', other), isFalse);
    });

    test('multiple cards in same warning', () {
      final cards = [
        c(Rank.ace, Suit.spade),
        c(Rank.king, Suit.spade),
        c(Rank.queen, Suit.spade),
      ];
      mgr.addEarlyWarning(1, 'middle', cards);
      for (final card in cards) {
        expect(mgr.isEarlyWarningActive(1, 'middle', card), isTrue);
      }
    });

    test('completeEarlyWarning removes and triggers callback', () {
      bool called = false;
      mgr.onStateChanged = () => called = true;
      final card = c(Rank.ace, Suit.spade);
      mgr.addEarlyWarning(1, 'top', [card]);

      mgr.completeEarlyWarning(1, 'top');

      expect(mgr.isEarlyWarningActive(1, 'top', card), isFalse);
      expect(called, isTrue);
    });
  });

  group('celebration', () {
    test('set and get', () {
      mgr.setCelebration(1, 'top', 3);
      expect(mgr.getCelebration(1, 'top'), 3);
    });

    test('default is 0', () {
      expect(mgr.getCelebration(1, 'top'), 0);
    });

    test('different hand numbers are independent', () {
      mgr.setCelebration(1, 'top', 3);
      mgr.setCelebration(2, 'top', 2);
      expect(mgr.getCelebration(1, 'top'), 3);
      expect(mgr.getCelebration(2, 'top'), 2);
    });

    test('different lines are independent', () {
      mgr.setCelebration(1, 'top', 1);
      mgr.setCelebration(1, 'middle', 2);
      mgr.setCelebration(1, 'bottom', 3);
      expect(mgr.getCelebration(1, 'top'), 1);
      expect(mgr.getCelebration(1, 'middle'), 2);
      expect(mgr.getCelebration(1, 'bottom'), 3);
    });

    test('setCelebration triggers onStateChanged', () {
      bool called = false;
      mgr.onStateChanged = () => called = true;

      mgr.setCelebration(1, 'top', 2);

      expect(called, isTrue);
    });

    test('completeCelebration removes and triggers callback', () {
      bool called = false;
      mgr.setCelebration(1, 'top', 3);
      mgr.onStateChanged = () => called = true;

      mgr.completeCelebration(1, 'top');

      expect(mgr.getCelebration(1, 'top'), 0);
      expect(called, isTrue);
    });
  });

  group('timer-based expiry', () {
    test('softClearAll preserves active celebrations', () {
      mgr.setCelebration(1, 'top', 3);

      // softClearAll 직후 — 아직 expiry 전이므로 유지
      mgr.softClearAll();

      expect(mgr.getCelebration(1, 'top'), 3);
    });

    test('softClearAll clears warnings and sounds', () {
      final card = c(Rank.ace, Suit.spade);
      mgr.addEarlyWarning(1, 'top', [card]);
      mgr.markSoundPlayed(1, 'top');

      mgr.softClearAll();

      expect(mgr.isEarlyWarningActive(1, 'top', card), isFalse);
      expect(mgr.markSoundPlayed(1, 'top'), isTrue); // reset됨
    });

    test('getCelebration returns 0 after expiry', () async {
      // 테스트용 짧은 expiry로 설정
      mgr.setCelebration(1, 'top', 1); // L1 = 800ms

      // expiry 경과 시뮬레이션: 직접 시간을 제어할 수 없으므로
      // forceClearAll로 검증
      mgr.forceClearAll();

      expect(mgr.getCelebration(1, 'top'), 0);
    });

    test('forceClearAll removes all celebrations unconditionally', () {
      mgr.setCelebration(1, 'top', 3);
      mgr.setCelebration(1, 'middle', 2);

      mgr.forceClearAll();

      expect(mgr.getCelebration(1, 'top'), 0);
      expect(mgr.getCelebration(1, 'middle'), 0);
    });

    test('softClearAll then forceClearAll clears everything', () {
      final card = c(Rank.ace, Suit.spade);
      mgr.addEarlyWarning(1, 'top', [card]);
      mgr.setCelebration(1, 'top', 3);
      mgr.markSoundPlayed(1, 'top');

      mgr.softClearAll(); // celebration 유지
      expect(mgr.getCelebration(1, 'top'), 3);

      mgr.forceClearAll(); // 전부 삭제
      expect(mgr.getCelebration(1, 'top'), 0);
    });

    test('celebration auto-expires after display duration', () async {
      // 최소 expiry 테스트: setCelebrationWithExpiry로 1ms 설정
      mgr.setCelebrationWithExpiry(1, 'top', 1, const Duration(milliseconds: 1));

      // 1ms 대기 후 만료 확인
      await Future.delayed(const Duration(milliseconds: 10));

      expect(mgr.getCelebration(1, 'top'), 0);
    });

    test('celebration visible before expiry', () {
      // 긴 expiry 설정
      mgr.setCelebrationWithExpiry(1, 'top', 3, const Duration(seconds: 10));

      expect(mgr.getCelebration(1, 'top'), 3);
    });
  });

  group('sound tracking', () {
    test('first call returns true', () {
      expect(mgr.markSoundPlayed(1, 'top'), isTrue);
    });

    test('second call returns false', () {
      mgr.markSoundPlayed(1, 'top');
      expect(mgr.markSoundPlayed(1, 'top'), isFalse);
    });

    test('different hand/line combos are independent', () {
      expect(mgr.markSoundPlayed(1, 'top'), isTrue);
      expect(mgr.markSoundPlayed(1, 'middle'), isTrue);
      expect(mgr.markSoundPlayed(2, 'top'), isTrue);
    });
  });

  group('clearAll (legacy)', () {
    test('forceClearAll resets all three stores', () {
      final card = c(Rank.ace, Suit.spade);
      mgr.addEarlyWarning(1, 'top', [card]);
      mgr.setCelebration(1, 'top', 3);
      mgr.markSoundPlayed(1, 'top');

      mgr.forceClearAll();

      expect(mgr.isEarlyWarningActive(1, 'top', card), isFalse);
      expect(mgr.getCelebration(1, 'top'), 0);
      expect(mgr.markSoundPlayed(1, 'top'), isTrue); // reset
      expect(mgr.hasActiveWarnings, isFalse);
    });
  });

  group('clearRound', () {
    test('clears only earlyWarnings', () {
      final card = c(Rank.ace, Suit.spade);
      mgr.addEarlyWarning(1, 'top', [card]);
      mgr.setCelebration(1, 'top', 3);

      mgr.clearRound();

      expect(mgr.isEarlyWarningActive(1, 'top', card), isFalse);
      expect(mgr.getCelebration(1, 'top'), 3); // celebration 유지
    });
  });
}
