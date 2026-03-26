import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:game_kfc/models/card.dart' as ofc;
import 'package:game_kfc/models/card_drag_data.dart';
import 'package:game_kfc/ui/widgets/card_widget.dart';

void main() {
  group('CardWidget', () {
    testWidgets('T1: 앞면 카드 표시 - 올바른 이미지 에셋', (tester) async {
      const card = ofc.Card(rank: ofc.Rank.ace, suit: ofc.Suit.spade);
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(body: CardWidget(card: card)),
      ));
      final imageFinder = find.byWidgetPredicate(
        (w) => w is Image && w.image is AssetImage && (w.image as AssetImage).assetName == 'assets/cards/S_A_B.png',
      );
      expect(imageFinder, findsOneWidget);
    });

    testWidgets('T2: 뒷면 카드 표시 - 뒷면 이미지 사용', (tester) async {
      const card = ofc.Card(rank: ofc.Rank.ace, suit: ofc.Suit.spade);
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(body: CardWidget(card: card, faceDown: true)),
      ));
      final backImageFinder = find.byWidgetPredicate(
        (w) => w is Image && w.image is AssetImage && (w.image as AssetImage).assetName == 'assets/cards/card_back.png',
      );
      expect(backImageFinder, findsOneWidget);
      // 앞면 이미지가 없어야 함
      final frontImageFinder = find.byWidgetPredicate(
        (w) => w is Image && w.image is AssetImage && (w.image as AssetImage).assetName == 'assets/cards/S_A_B.png',
      );
      expect(frontImageFinder, findsNothing);
    });

    testWidgets('T3: draggable=true 시 Draggable 존재', (tester) async {
      const card = ofc.Card(rank: ofc.Rank.king, suit: ofc.Suit.heart);
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(body: CardWidget(card: card, draggable: true)),
      ));
      expect(find.byType(Draggable<CardDragData>), findsOneWidget);
    });

    testWidgets('T4: 하트 카드 올바른 이미지 경로', (tester) async {
      const card = ofc.Card(rank: ofc.Rank.queen, suit: ofc.Suit.heart);
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(body: CardWidget(card: card)),
      ));
      final imageFinder = find.byWidgetPredicate(
        (w) => w is Image && w.image is AssetImage && (w.image as AssetImage).assetName == 'assets/cards/H_Q_R.png',
      );
      expect(imageFinder, findsOneWidget);
    });

    testWidgets('T5: onTap 콜백 호출', (tester) async {
      bool tapped = false;
      const card = ofc.Card(rank: ofc.Rank.ten, suit: ofc.Suit.club);
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(body: CardWidget(card: card, onTap: () => tapped = true)),
      ));
      await tester.tap(find.byType(CardWidget));
      expect(tapped, isTrue);
    });
  });
}
