import 'package:flutter_test/flutter_test.dart';
import 'package:game_kfc/models/card.dart';
import 'package:game_kfc/models/board.dart';
import 'package:game_kfc/logic/simple_ai.dart';
import 'package:game_kfc/logic/foul_checker.dart';

void main() {
  group('SimpleAI', () {
    test('T1: Round 0: 5장 → placements.length=5, discard=null', () {
      final ai = SimpleAI();
      final hand = [
        Card(rank: Rank.ace, suit: Suit.spade),
        Card(rank: Rank.king, suit: Suit.heart),
        Card(rank: Rank.queen, suit: Suit.diamond),
        Card(rank: Rank.jack, suit: Suit.club),
        Card(rank: Rank.ten, suit: Suit.spade),
      ];
      final board = OFCBoard();
      final decision = ai.decide(hand, board, 0);

      expect(decision.placements.length, 5);
      expect(decision.discard, isNull);
    });

    test('T2: Round 1~4: 3장 → placements.length=2, discard != null', () {
      final ai = SimpleAI();
      final hand = [
        Card(rank: Rank.ace, suit: Suit.spade),
        Card(rank: Rank.king, suit: Suit.heart),
        Card(rank: Rank.two, suit: Suit.diamond),
      ];
      final board = OFCBoard();
      final decision = ai.decide(hand, board, 1);

      expect(decision.placements.length, 2);
      expect(decision.discard, isNotNull);
    });

    test('T3: 모든 AI 결정 적용 후 보드 → checkFoul(board) == false', () {
      final ai = SimpleAI();
      // Round 0: 5장 배치
      final hand0 = [
        Card(rank: Rank.ace, suit: Suit.spade),
        Card(rank: Rank.king, suit: Suit.heart),
        Card(rank: Rank.queen, suit: Suit.diamond),
        Card(rank: Rank.three, suit: Suit.club),
        Card(rank: Rank.two, suit: Suit.spade),
      ];
      var board = OFCBoard();
      final d0 = ai.decide(hand0, board, 0);
      for (final entry in d0.placements.entries) {
        board = board.placeCard(entry.value, entry.key);
      }

      // Round 1~4: 3장씩 8장 추가 배치
      final hands = [
        [
          Card(rank: Rank.jack, suit: Suit.spade),
          Card(rank: Rank.ten, suit: Suit.heart),
          Card(rank: Rank.nine, suit: Suit.diamond),
        ],
        [
          Card(rank: Rank.eight, suit: Suit.club),
          Card(rank: Rank.seven, suit: Suit.spade),
          Card(rank: Rank.six, suit: Suit.heart),
        ],
        [
          Card(rank: Rank.five, suit: Suit.diamond),
          Card(rank: Rank.four, suit: Suit.club),
          Card(rank: Rank.three, suit: Suit.heart),
        ],
        [
          Card(rank: Rank.two, suit: Suit.heart),
          Card(rank: Rank.two, suit: Suit.club),
          Card(rank: Rank.two, suit: Suit.diamond),
        ],
      ];

      for (int r = 1; r <= 4; r++) {
        final d = ai.decide(hands[r - 1], board, r);
        for (final entry in d.placements.entries) {
          board = board.placeCard(entry.value, entry.key);
        }
      }

      if (board.isFull()) {
        expect(checkFoul(board), isFalse);
      }
    });

    test('T4: Top 3장 만석 상태에서 AI → Top에 배치 안 함', () {
      final ai = SimpleAI();
      // top이 이미 3장 배치된 보드
      final board = OFCBoard(
        top: [
          Card(rank: Rank.ace, suit: Suit.spade),
          Card(rank: Rank.king, suit: Suit.heart),
          Card(rank: Rank.queen, suit: Suit.diamond),
        ],
      );
      final hand = [
        Card(rank: Rank.jack, suit: Suit.spade),
        Card(rank: Rank.ten, suit: Suit.heart),
        Card(rank: Rank.two, suit: Suit.diamond),
      ];
      final decision = ai.decide(hand, board, 1);

      // top에 배치된 카드 없음
      expect(decision.placements.values.any((line) => line == 'top'), isFalse);
    });

    test('T5: 전체 게임 R0~R4 AI 자동 진행 → board.isFull() == true', () {
      final ai = SimpleAI();
      var board = OFCBoard();

      // R0: 5장
      final hand0 = [
        Card(rank: Rank.ace, suit: Suit.spade),
        Card(rank: Rank.ace, suit: Suit.heart),
        Card(rank: Rank.king, suit: Suit.spade),
        Card(rank: Rank.king, suit: Suit.heart),
        Card(rank: Rank.queen, suit: Suit.spade),
      ];
      final d0 = ai.decide(hand0, board, 0);
      for (final entry in d0.placements.entries) {
        board = board.placeCard(entry.value, entry.key);
      }

      // R1: 3장
      final hand1 = [
        Card(rank: Rank.queen, suit: Suit.heart),
        Card(rank: Rank.jack, suit: Suit.spade),
        Card(rank: Rank.jack, suit: Suit.heart),
      ];
      final d1 = ai.decide(hand1, board, 1);
      for (final entry in d1.placements.entries) {
        board = board.placeCard(entry.value, entry.key);
      }

      // R2: 3장
      final hand2 = [
        Card(rank: Rank.jack, suit: Suit.diamond),
        Card(rank: Rank.ten, suit: Suit.spade),
        Card(rank: Rank.ten, suit: Suit.heart),
      ];
      final d2 = ai.decide(hand2, board, 2);
      for (final entry in d2.placements.entries) {
        board = board.placeCard(entry.value, entry.key);
      }

      // R3: 3장
      final hand3 = [
        Card(rank: Rank.ten, suit: Suit.diamond),
        Card(rank: Rank.nine, suit: Suit.spade),
        Card(rank: Rank.nine, suit: Suit.heart),
      ];
      final d3 = ai.decide(hand3, board, 3);
      for (final entry in d3.placements.entries) {
        board = board.placeCard(entry.value, entry.key);
      }

      // R4: 3장
      final hand4 = [
        Card(rank: Rank.nine, suit: Suit.diamond),
        Card(rank: Rank.eight, suit: Suit.spade),
        Card(rank: Rank.eight, suit: Suit.heart),
      ];
      final d4 = ai.decide(hand4, board, 4);
      for (final entry in d4.placements.entries) {
        board = board.placeCard(entry.value, entry.key);
      }

      expect(board.isFull(), isTrue);
    });
  });
}
