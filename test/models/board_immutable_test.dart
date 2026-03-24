import 'package:flutter_test/flutter_test.dart';
import 'package:game_kfc/models/card.dart';
import 'package:game_kfc/models/board.dart';
import 'package:game_kfc/models/player.dart';

void main() {
  group('OFCBoard Immutable API', () {
    test('T1: placeCard 호출 후 원본 board 불변', () {
      final original = OFCBoard();
      final card = Card(rank: Rank.ace, suit: Suit.spade);
      original.placeCard('top', card);
      // 원본은 변경되지 않아야 함
      expect(original.top.length, 0);
    });

    test('T2: placeCard 반환값과 원본이 다른 참조', () {
      final original = OFCBoard();
      final card = Card(rank: Rank.ace, suit: Suit.spade);
      final result = original.placeCard('top', card);
      expect(identical(original, result), isFalse);
      expect(result.top.length, 1);
    });

    test('T2b: removeCard 호출 후 원본 불변', () {
      final board = OFCBoard(
        top: [Card(rank: Rank.ace, suit: Suit.spade)],
      );
      final card = board.top.first;
      board.removeCard('top', card);
      expect(board.top.length, 1);
    });

    test('T2c: removeCard 반환값은 카드가 제거된 새 board', () {
      final card = Card(rank: Rank.ace, suit: Suit.spade);
      final board = OFCBoard(top: [card]);
      final result = board.removeCard('top', card);
      expect(result.top.length, 0);
      expect(board.top.length, 1); // 원본 불변
    });

    test('T2d: canPlace - 빈 라인은 배치 가능', () {
      final board = OFCBoard();
      expect(board.canPlace('top'), isTrue);
      expect(board.canPlace('mid'), isTrue);
      expect(board.canPlace('bottom'), isTrue);
    });

    test('T2e: canPlace - 만석 라인은 배치 불가', () {
      var board = OFCBoard();
      for (int i = 0; i < 3; i++) {
        board = board.placeCard('top', Card(rank: Rank.values[i], suit: Suit.spade));
      }
      expect(board.canPlace('top'), isFalse);
      expect(board.canPlace('mid'), isTrue);
    });

    test('T3: Player.hand copyWith 전파 확인', () {
      final player = Player(
        id: 'p1',
        name: 'Player 1',
        board: OFCBoard(),
      );
      final card = Card(rank: Rank.ace, suit: Suit.spade);
      final updated = player.copyWith(hand: [card]);
      expect(updated.hand.length, 1);
      expect(updated.hand.first, card);
      expect(player.hand.length, 0); // 원본 불변
    });

    test('T5: 만석 라인에 placeCard 시도 → 자신 반환 (변경 없음)', () {
      var board = OFCBoard();
      for (int i = 0; i < 3; i++) {
        board = board.placeCard('top', Card(rank: Rank.values[i], suit: Suit.spade));
      }
      final extraCard = Card(rank: Rank.king, suit: Suit.heart);
      final result = board.placeCard('top', extraCard);
      expect(result.top.length, 3); // 여전히 3장
      expect(identical(result, board), isTrue); // 동일 참조
    });
  });
}
