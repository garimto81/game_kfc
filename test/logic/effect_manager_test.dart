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

    test('expired warning returns false', () {
      final card = c(Rank.ace, Suit.spade);
      mgr.addEarlyWarning(
        1,
        'top',
        [card],
        duration: Duration.zero,
      );
      // After zero duration, should be expired
      mgr.tick();
      expect(mgr.isEarlyWarningActive(1, 'top', card), isFalse);
      expect(mgr.hasActiveWarnings, isFalse);
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
  });

  group('earlyWarningCards', () {
    test('returns active cards for a line', () {
      final cards = [
        c(Rank.ace, Suit.spade),
        c(Rank.king, Suit.heart),
      ];
      mgr.addEarlyWarning(1, 'top', cards);
      final result = mgr.earlyWarningCards(1, 'top');
      expect(result, hasLength(2));
      expect(result, containsAll(cards));
    });

    test('returns empty for inactive line', () {
      expect(mgr.earlyWarningCards(1, 'top'), isEmpty);
    });

    test('returns empty after expiration', () {
      final cards = [c(Rank.ace, Suit.spade)];
      mgr.addEarlyWarning(1, 'top', cards, duration: Duration.zero);
      mgr.tick();
      expect(mgr.earlyWarningCards(1, 'top'), isEmpty);
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
      mgr.setCelebration(2, 'top', 5);
      expect(mgr.getCelebration(1, 'top'), 3);
      expect(mgr.getCelebration(2, 'top'), 5);
    });

    test('different lines are independent', () {
      mgr.setCelebration(1, 'top', 1);
      mgr.setCelebration(1, 'middle', 2);
      mgr.setCelebration(1, 'bottom', 3);
      expect(mgr.getCelebration(1, 'top'), 1);
      expect(mgr.getCelebration(1, 'middle'), 2);
      expect(mgr.getCelebration(1, 'bottom'), 3);
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

  group('clearAll', () {
    test('resets all three stores', () {
      final card = c(Rank.ace, Suit.spade);
      mgr.addEarlyWarning(1, 'top', [card]);
      mgr.setCelebration(1, 'top', 3);
      mgr.markSoundPlayed(1, 'top');

      mgr.clearAll();

      expect(mgr.isEarlyWarningActive(1, 'top', card), isFalse);
      expect(mgr.getCelebration(1, 'top'), 0);
      expect(mgr.markSoundPlayed(1, 'top'), isTrue); // reset, so first call again
      expect(mgr.hasActiveWarnings, isFalse);
    });
  });

  group('tick', () {
    test('removes only expired entries', () {
      final expiredCard = c(Rank.two, Suit.club);
      final activeCard = c(Rank.ace, Suit.spade);

      mgr.addEarlyWarning(1, 'top', [expiredCard], duration: Duration.zero);
      mgr.addEarlyWarning(1, 'middle', [activeCard],
          duration: const Duration(hours: 1));

      mgr.tick();

      expect(mgr.isEarlyWarningActive(1, 'top', expiredCard), isFalse);
      expect(mgr.isEarlyWarningActive(1, 'middle', activeCard), isTrue);
    });
  });
}
