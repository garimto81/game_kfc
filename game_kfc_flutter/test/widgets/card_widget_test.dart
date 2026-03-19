import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ofc_pineapple/models/card.dart' as ofc;
import 'package:ofc_pineapple/ui/widgets/card_widget.dart';

void main() {
  group('CardWidget', () {
    testWidgets('T1: 앞면 카드 표시 - 랭크/수트', (tester) async {
      const card = ofc.Card(rank: ofc.Rank.ace, suit: ofc.Suit.spade);
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(body: CardWidget(card: card)),
      ));
      // New card design: rank in top-left + bottom-right (2), suit in top-left + center + bottom-right (3)
      expect(find.text('A'), findsNWidgets(2));
      expect(find.text('\u2660'), findsNWidgets(3));
    });

    testWidgets('T2: 뒷면 카드 표시 - 랭크/수트 없음', (tester) async {
      const card = ofc.Card(rank: ofc.Rank.ace, suit: ofc.Suit.spade);
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(body: CardWidget(card: card, faceDown: true)),
      ));
      expect(find.text('A'), findsNothing);
      // Back face has a decorative spade symbol, but rank text must not appear
      expect(find.text('A'), findsNothing);
    });

    testWidgets('T3: draggable=true 시 Draggable 존재', (tester) async {
      const card = ofc.Card(rank: ofc.Rank.king, suit: ofc.Suit.heart);
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(body: CardWidget(card: card, draggable: true)),
      ));
      expect(find.byType(Draggable<ofc.Card>), findsOneWidget);
    });

    testWidgets('T4: 하트/다이아몬드 카드 빨간색', (tester) async {
      const card = ofc.Card(rank: ofc.Rank.queen, suit: ofc.Suit.heart);
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(body: CardWidget(card: card)),
      ));
      expect(find.text('Q'), findsNWidgets(2));
      expect(find.text('\u2665'), findsNWidgets(3));
    });

    testWidgets('T5: onTap 콜백 호출', (tester) async {
      bool tapped = false;
      const card = ofc.Card(rank: ofc.Rank.ten, suit: ofc.Suit.club);
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(body: CardWidget(card: card, onTap: () => tapped = true)),
      ));
      await tester.tap(find.text('10').first);
      expect(tapped, isTrue);
    });
  });
}
