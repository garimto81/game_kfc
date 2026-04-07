import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:game_kfc/models/board.dart';
import 'package:game_kfc/models/card.dart' as ofc;
import 'package:game_kfc/models/player.dart';
import 'package:game_kfc/ui/widgets/opponent_board_widget.dart';

Player _makeOpponent({String name = 'Bob', OFCBoard? board}) {
  return Player(
    id: 'p2',
    name: name,
    board: board ?? OFCBoard(),
  );
}

void main() {
  group('OpponentBoardWidget', () {
    testWidgets('기본 렌더링: 이름과 점수 표시', (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: OpponentBoardWidget(opponent: _makeOpponent()),
        ),
      ));
      expect(find.textContaining('Bob'), findsOneWidget);
    });

    testWidgets('celebLines level 2+ 시 celebration key 표시', (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: OpponentBoardWidget(
            opponent: _makeOpponent(),
            celebLines: const {'top': 2},
          ),
        ),
      ));
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.byKey(const Key('opponent-celebration')), findsOneWidget);
    });

    testWidgets('celebratingLine fallback 시 celebration key 표시', (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: OpponentBoardWidget(
            opponent: _makeOpponent(),
            celebratingLine: 'top',
          ),
        ),
      ));
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.byKey(const Key('opponent-celebration')), findsOneWidget);
    });

    testWidgets('celebLines 비어있고 celebratingLine null이면 celebration 없음', (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: OpponentBoardWidget(
            opponent: _makeOpponent(),
          ),
        ),
      ));
      await tester.pump();
      expect(find.byKey(const Key('opponent-celebration')), findsNothing);
    });
  });
}
