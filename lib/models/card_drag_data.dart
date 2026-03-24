import 'card.dart' as ofc;

class CardDragData {
  final ofc.Card card;
  final String? sourceLine;

  const CardDragData({required this.card, this.sourceLine});
}
