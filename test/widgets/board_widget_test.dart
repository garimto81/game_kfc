import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:game_kfc/models/board.dart';
import 'package:game_kfc/models/card.dart' as ofc;
import 'package:game_kfc/models/card_drag_data.dart';
import 'package:game_kfc/ui/widgets/board_widget.dart';
import 'package:game_kfc/ui/widgets/line_slot_widget.dart';

void main() {
  group('BoardWidget', () {
    testWidgets('T1: 빈 보드 → 13개 슬롯 표시', (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(body: BoardWidget(board: OFCBoard())),
      ));
      expect(find.byType(LineSlotWidget), findsNWidgets(13));
    });

    testWidgets('T2: Top/Mid/Bottom 라벨 표시', (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(body: BoardWidget(board: OFCBoard())),
      ));
      expect(find.text('Top'), findsOneWidget);
      expect(find.text('Mid'), findsOneWidget);
      expect(find.text('Bottom'), findsOneWidget);
    });

    testWidgets('T3: 카드 배치된 보드 표시', (tester) async {
      final board = OFCBoard(
        top: [const ofc.Card(rank: ofc.Rank.ace, suit: ofc.Suit.spade)],
      );
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(body: BoardWidget(board: board)),
      ));
      // Allow animate to complete
      await tester.pump(const Duration(milliseconds: 500));
      // New card design: rank in top-left + bottom-right (2), suit in top-left + center + bottom-right (3)
      expect(find.text('A'), findsNWidgets(2));
      expect(find.text('\u2660'), findsNWidgets(3));
    });

    testWidgets('T4: 만석 라인 비활성', (tester) async {
      final board = OFCBoard(
        top: [
          const ofc.Card(rank: ofc.Rank.ace, suit: ofc.Suit.spade),
          const ofc.Card(rank: ofc.Rank.king, suit: ofc.Suit.heart),
          const ofc.Card(rank: ofc.Rank.queen, suit: ofc.Suit.diamond),
        ],
      );
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: BoardWidget(board: board, availableLines: const ['mid', 'bottom']),
        ),
      ));
      // Allow animate to complete
      await tester.pump(const Duration(milliseconds: 500));
      expect(find.text('A'), findsNWidgets(2));
      expect(find.text('K'), findsNWidgets(2));
      expect(find.text('Q'), findsNWidgets(2));
    });

    testWidgets('T5: onCardPlaced 콜백 - DragTarget 존재', (tester) async {
      ofc.Card? placedCard;
      String? placedLine;
      final board = OFCBoard();
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: BoardWidget(
            board: board,
            onCardPlaced: (card, line, {String? fromLine}) {
              placedCard = card;
              placedLine = line;
            },
          ),
        ),
      ));
      expect(find.byType(DragTarget<CardDragData>), findsWidgets);
      // placedCard / placedLine 초기화 확인 (컴파일 경고 방지)
      expect(placedCard, isNull);
      expect(placedLine, isNull);
    });
  });
}
