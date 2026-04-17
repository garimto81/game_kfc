import 'package:flutter_test/flutter_test.dart';
import 'package:game_kfc/models/card.dart';
import 'package:game_kfc/models/board.dart';
import 'package:game_kfc/ai/smart_ai.dart';
import 'package:game_kfc/logic/foul_checker.dart';

void main() {
  group('SmartAI', () {
    final ai = SmartAI();

    test('R0: 5장 → placements.length=5, discard=null', () {
      final hand = [
        Card(rank: Rank.ace, suit: Suit.spade),
        Card(rank: Rank.king, suit: Suit.heart),
        Card(rank: Rank.queen, suit: Suit.diamond),
        Card(rank: Rank.jack, suit: Suit.club),
        Card(rank: Rank.ten, suit: Suit.spade),
      ];
      final decision = ai.decide(hand, OFCBoard(), 0);
      expect(decision.placements.length, 5);
      expect(decision.discard, isNull);
    });

    test('R1~R4: 3장 → placements.length=2, discard != null', () {
      final hand = [
        Card(rank: Rank.ace, suit: Suit.spade),
        Card(rank: Rank.king, suit: Suit.heart),
        Card(rank: Rank.two, suit: Suit.diamond),
      ];
      final decision = ai.decide(hand, OFCBoard(), 1);
      expect(decision.placements.length, 2);
      expect(decision.discard, isNotNull);
      expect([...decision.placements.keys, decision.discard!].toSet().length, 3);
    });

    test('QQ 페어 있으면 Top Pair 전략 후보 생성', () {
      final hand = [
        Card(rank: Rank.queen, suit: Suit.spade),
        Card(rank: Rank.queen, suit: Suit.heart),
        Card(rank: Rank.five, suit: Suit.diamond),
        Card(rank: Rank.four, suit: Suit.club),
        Card(rank: Rank.three, suit: Suit.spade),
      ];
      final decision = ai.decide(hand, OFCBoard(), 0);
      expect(decision.placements.length, 5);
      // Top에 카드가 배치됐는지 확인 (QQ Top 전략이 발동되면 QQ가 Top에 있음)
      final topCards = decision.placements.entries.where((e) => e.value == 'top').toList();
      expect(topCards.isNotEmpty, true);
    });

    test('onnxAvailable is false (skeleton)', () {
      expect(ai.onnxAvailable, false);
    });

    test('Fantasyland 14장 배치', () {
      final hand = List.generate(14, (i) {
        final rank = Rank.values[i % Rank.values.length];
        final suit = Suit.values[i % Suit.values.length];
        return Card(rank: rank, suit: suit);
      });
      final decision = ai.decideFantasyland(hand, OFCBoard());
      expect(decision.placements.length, lessThanOrEqualTo(13));
    });
  });
}
