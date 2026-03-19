import 'package:flutter_test/flutter_test.dart';
import 'package:ofc_pineapple/models/card.dart';
import 'package:ofc_pineapple/models/hand_result.dart';
import 'package:ofc_pineapple/logic/hand_evaluator.dart';

Card c(Rank r, Suit s) => Card(rank: r, suit: s);

void main() {
  group('evaluateHand - 5장', () {
    test('로얄 플러시', () {
      final cards = [
        c(Rank.ace, Suit.spade),
        c(Rank.king, Suit.spade),
        c(Rank.queen, Suit.spade),
        c(Rank.jack, Suit.spade),
        c(Rank.ten, Suit.spade),
      ];
      final result = evaluateHand(cards);
      expect(result.handType, HandType.royalFlush);
      expect(result.kickers, isEmpty);
    });

    test('스트레이트 플러시 (9-high)', () {
      final cards = [
        c(Rank.nine, Suit.heart),
        c(Rank.eight, Suit.heart),
        c(Rank.seven, Suit.heart),
        c(Rank.six, Suit.heart),
        c(Rank.five, Suit.heart),
      ];
      final result = evaluateHand(cards);
      expect(result.handType, HandType.straightFlush);
      expect(result.kickers, [9]);
    });

    test('A-2-3-4-5 낮은 스트레이트 플러시 (휠)', () {
      final cards = [
        c(Rank.ace, Suit.club),
        c(Rank.two, Suit.club),
        c(Rank.three, Suit.club),
        c(Rank.four, Suit.club),
        c(Rank.five, Suit.club),
      ];
      final result = evaluateHand(cards);
      expect(result.handType, HandType.straightFlush);
      expect(result.kickers, [5]);
    });

    test('포카드', () {
      final cards = [
        c(Rank.king, Suit.spade),
        c(Rank.king, Suit.heart),
        c(Rank.king, Suit.diamond),
        c(Rank.king, Suit.club),
        c(Rank.ace, Suit.spade),
      ];
      final result = evaluateHand(cards);
      expect(result.handType, HandType.fourOfAKind);
      expect(result.kickers, [13, 14]);
    });

    test('풀하우스', () {
      final cards = [
        c(Rank.jack, Suit.spade),
        c(Rank.jack, Suit.heart),
        c(Rank.jack, Suit.diamond),
        c(Rank.nine, Suit.spade),
        c(Rank.nine, Suit.heart),
      ];
      final result = evaluateHand(cards);
      expect(result.handType, HandType.fullHouse);
      expect(result.kickers, [11, 9]);
    });

    test('플러시', () {
      final cards = [
        c(Rank.ace, Suit.diamond),
        c(Rank.ten, Suit.diamond),
        c(Rank.eight, Suit.diamond),
        c(Rank.six, Suit.diamond),
        c(Rank.two, Suit.diamond),
      ];
      final result = evaluateHand(cards);
      expect(result.handType, HandType.flush);
      expect(result.kickers, [14, 10, 8, 6, 2]);
    });

    test('스트레이트 (K-high)', () {
      final cards = [
        c(Rank.king, Suit.spade),
        c(Rank.queen, Suit.heart),
        c(Rank.jack, Suit.diamond),
        c(Rank.ten, Suit.club),
        c(Rank.nine, Suit.spade),
      ];
      final result = evaluateHand(cards);
      expect(result.handType, HandType.straight);
      expect(result.kickers, [13]);
    });

    test('A-2-3-4-5 낮은 스트레이트', () {
      final cards = [
        c(Rank.ace, Suit.spade),
        c(Rank.two, Suit.heart),
        c(Rank.three, Suit.diamond),
        c(Rank.four, Suit.club),
        c(Rank.five, Suit.spade),
      ];
      final result = evaluateHand(cards);
      expect(result.handType, HandType.straight);
      expect(result.kickers, [5]);
    });

    test('쓰리오브어카인드', () {
      final cards = [
        c(Rank.seven, Suit.spade),
        c(Rank.seven, Suit.heart),
        c(Rank.seven, Suit.diamond),
        c(Rank.king, Suit.spade),
        c(Rank.two, Suit.heart),
      ];
      final result = evaluateHand(cards);
      expect(result.handType, HandType.threeOfAKind);
      expect(result.kickers, [7, 13, 2]);
    });

    test('투페어', () {
      final cards = [
        c(Rank.ace, Suit.spade),
        c(Rank.ace, Suit.heart),
        c(Rank.king, Suit.diamond),
        c(Rank.king, Suit.club),
        c(Rank.queen, Suit.spade),
      ];
      final result = evaluateHand(cards);
      expect(result.handType, HandType.twoPair);
      expect(result.kickers, [14, 13, 12]);
    });

    test('원페어', () {
      final cards = [
        c(Rank.ace, Suit.spade),
        c(Rank.ace, Suit.heart),
        c(Rank.king, Suit.diamond),
        c(Rank.queen, Suit.club),
        c(Rank.jack, Suit.spade),
      ];
      final result = evaluateHand(cards);
      expect(result.handType, HandType.onePair);
      expect(result.kickers, [14, 13, 12, 11]);
    });

    test('하이카드', () {
      final cards = [
        c(Rank.ace, Suit.spade),
        c(Rank.king, Suit.heart),
        c(Rank.queen, Suit.diamond),
        c(Rank.jack, Suit.club),
        c(Rank.nine, Suit.spade),
      ];
      final result = evaluateHand(cards);
      expect(result.handType, HandType.highCard);
      expect(result.kickers, [14, 13, 12, 11, 9]);
    });
  });

  group('evaluateHand - 3장 (Top 라인)', () {
    test('쓰리오브어카인드 (3장)', () {
      final cards = [
        c(Rank.ace, Suit.spade),
        c(Rank.ace, Suit.heart),
        c(Rank.ace, Suit.diamond),
      ];
      final result = evaluateHand(cards);
      expect(result.handType, HandType.threeOfAKind);
      expect(result.kickers, [14]);
    });

    test('원페어 (3장)', () {
      final cards = [
        c(Rank.king, Suit.spade),
        c(Rank.king, Suit.heart),
        c(Rank.ace, Suit.diamond),
      ];
      final result = evaluateHand(cards);
      expect(result.handType, HandType.onePair);
      expect(result.kickers, [13, 14]);
    });

    test('하이카드 (3장)', () {
      final cards = [
        c(Rank.ace, Suit.spade),
        c(Rank.king, Suit.heart),
        c(Rank.queen, Suit.diamond),
      ];
      final result = evaluateHand(cards);
      expect(result.handType, HandType.highCard);
      expect(result.kickers, [14, 13, 12]);
    });
  });

  group('compareHands', () {
    test('다른 핸드 타입: 높은 쪽이 이긴다', () {
      final h1 = HandResult(handType: HandType.flush, kickers: [14, 10, 8, 6, 2]);
      final h2 = HandResult(handType: HandType.straight, kickers: [13]);
      expect(compareHands(h1, h2), 1);
      expect(compareHands(h2, h1), -1);
    });

    test('같은 핸드 타입: 킥커로 비교', () {
      final h1 = HandResult(handType: HandType.onePair, kickers: [14, 13, 12, 11]);
      final h2 = HandResult(handType: HandType.onePair, kickers: [13, 14, 12, 11]);
      expect(compareHands(h1, h2), 1);
    });

    test('완전히 동일한 핸드: 무승부', () {
      final h1 = HandResult(handType: HandType.highCard, kickers: [14, 13, 12, 11, 9]);
      final h2 = HandResult(handType: HandType.highCard, kickers: [14, 13, 12, 11, 9]);
      expect(compareHands(h1, h2), 0);
    });

    test('로얄 플러시 무승부', () {
      final h1 = HandResult(handType: HandType.royalFlush, kickers: []);
      final h2 = HandResult(handType: HandType.royalFlush, kickers: []);
      expect(compareHands(h1, h2), 0);
    });

    test('풀하우스 킥커 비교', () {
      final h1 = HandResult(handType: HandType.fullHouse, kickers: [11, 9]);
      final h2 = HandResult(handType: HandType.fullHouse, kickers: [10, 9]);
      expect(compareHands(h1, h2), 1);
    });
  });
}
