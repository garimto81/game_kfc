import 'package:flutter_test/flutter_test.dart';
import 'package:game_kfc/models/card.dart';
import 'package:game_kfc/models/board.dart';
import 'package:game_kfc/logic/foul_checker.dart';

OFCBoard buildBoard({
  required List<Card> top,
  required List<Card> mid,
  required List<Card> bottom,
}) {
  return OFCBoard(top: top, mid: mid, bottom: bottom);
}

void main() {
  group('checkFoul', () {
    test('유효한 보드: Foul 없음 (bottom > mid > top)', () {
      // bottom: 플러시, mid: 스트레이트, top: 하이카드
      final board = buildBoard(
        top: [
          Card(rank: Rank.ace, suit: Suit.spade),
          Card(rank: Rank.king, suit: Suit.heart),
          Card(rank: Rank.queen, suit: Suit.diamond),
        ],
        mid: [
          Card(rank: Rank.nine, suit: Suit.spade),
          Card(rank: Rank.eight, suit: Suit.heart),
          Card(rank: Rank.seven, suit: Suit.diamond),
          Card(rank: Rank.six, suit: Suit.club),
          Card(rank: Rank.five, suit: Suit.spade),
        ],
        bottom: [
          Card(rank: Rank.ace, suit: Suit.club),
          Card(rank: Rank.ten, suit: Suit.club),
          Card(rank: Rank.eight, suit: Suit.club),
          Card(rank: Rank.six, suit: Suit.club),
          Card(rank: Rank.two, suit: Suit.club),
        ],
      );
      expect(checkFoul(board), isFalse);
    });

    test('bottom < mid: Foul 발생', () {
      // bottom: 하이카드 (약함), mid: 풀하우스 (강함)
      final board = buildBoard(
        top: [
          Card(rank: Rank.two, suit: Suit.spade),
          Card(rank: Rank.three, suit: Suit.heart),
          Card(rank: Rank.four, suit: Suit.diamond),
        ],
        mid: [
          Card(rank: Rank.jack, suit: Suit.spade),
          Card(rank: Rank.jack, suit: Suit.heart),
          Card(rank: Rank.jack, suit: Suit.diamond),
          Card(rank: Rank.nine, suit: Suit.spade),
          Card(rank: Rank.nine, suit: Suit.heart),
        ],
        bottom: [
          Card(rank: Rank.ace, suit: Suit.spade),
          Card(rank: Rank.king, suit: Suit.heart),
          Card(rank: Rank.queen, suit: Suit.diamond),
          Card(rank: Rank.ten, suit: Suit.club),
          Card(rank: Rank.eight, suit: Suit.spade),
        ],
      );
      // mid: 풀하우스 (7), bottom: 하이카드 (1) → bottom < mid = FOUL
      expect(checkFoul(board), isTrue);
    });

    test('mid < top: Foul 발생', () {
      // top: 쓰리오브어카인드, mid: 원페어 → mid < top = FOUL
      final board = buildBoard(
        top: [
          Card(rank: Rank.ace, suit: Suit.spade),
          Card(rank: Rank.ace, suit: Suit.heart),
          Card(rank: Rank.ace, suit: Suit.diamond),
        ],
        mid: [
          Card(rank: Rank.two, suit: Suit.spade),
          Card(rank: Rank.two, suit: Suit.heart),
          Card(rank: Rank.three, suit: Suit.diamond),
          Card(rank: Rank.four, suit: Suit.club),
          Card(rank: Rank.five, suit: Suit.spade),
        ],
        bottom: [
          Card(rank: Rank.six, suit: Suit.spade),
          Card(rank: Rank.seven, suit: Suit.heart),
          Card(rank: Rank.eight, suit: Suit.diamond),
          Card(rank: Rank.nine, suit: Suit.club),
          Card(rank: Rank.jack, suit: Suit.spade),
        ],
      );
      // top: 쓰리오브어카인드(4), mid: 원페어(2) → mid < top = FOUL
      expect(checkFoul(board), isTrue);
    });

    test('보드가 가득 차지 않은 경우: Foul 없음 (13장 미만)', () {
      final board = OFCBoard();
      final updated = board.placeCard('top', Card(rank: Rank.ace, suit: Suit.spade));
      expect(checkFoul(updated), isFalse);
    });

    test('bottom == mid: Foul 없음 (동등 허용)', () {
      final board = buildBoard(
        top: [
          Card(rank: Rank.two, suit: Suit.spade),
          Card(rank: Rank.three, suit: Suit.heart),
          Card(rank: Rank.four, suit: Suit.diamond),
        ],
        mid: [
          Card(rank: Rank.nine, suit: Suit.spade),
          Card(rank: Rank.eight, suit: Suit.heart),
          Card(rank: Rank.seven, suit: Suit.diamond),
          Card(rank: Rank.six, suit: Suit.club),
          Card(rank: Rank.five, suit: Suit.spade),
        ],
        bottom: [
          Card(rank: Rank.king, suit: Suit.spade),
          Card(rank: Rank.queen, suit: Suit.heart),
          Card(rank: Rank.jack, suit: Suit.diamond),
          Card(rank: Rank.ten, suit: Suit.club),
          Card(rank: Rank.nine, suit: Suit.heart),
        ],
      );
      expect(checkFoul(board), isFalse);
    });
  });
}
