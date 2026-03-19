import 'package:flutter/material.dart';
import '../../models/board.dart';
import '../../models/card.dart' as ofc;
import 'line_slot_widget.dart';

class BoardWidget extends StatelessWidget {
  final OFCBoard board;
  final List<String> availableLines;
  final void Function(ofc.Card card, String line)? onCardPlaced;
  final List<({ofc.Card card, String line})> currentTurnPlacements;
  final void Function(ofc.Card card, String line)? onUndoCard;

  const BoardWidget({
    super.key,
    required this.board,
    this.availableLines = const ['top', 'mid', 'bottom'],
    this.onCardPlaced,
    this.currentTurnPlacements = const [],
    this.onUndoCard,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        _buildLine('Top', board.top, OFCBoard.topMaxCards, 'top'),
        const SizedBox(height: 8),
        _buildLine('Mid', board.mid, OFCBoard.midMaxCards, 'mid'),
        const SizedBox(height: 8),
        _buildLine('Bottom', board.bottom, OFCBoard.bottomMaxCards, 'bottom'),
      ],
    );
  }

  static const _lineHelp = {
    'top': 'Top (3 cards): High Card, One Pair, Three of a Kind only.',
    'mid': 'Middle (5 cards): Any poker hand. Must be weaker than Bottom.',
    'bottom': 'Bottom (5 cards): Any poker hand. Must be your strongest line.',
  };

  Widget _buildLine(
      String label, List<ofc.Card> cards, int maxCards, String lineName) {
    final canAccept = availableLines.contains(lineName);
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Tooltip(
          message: _lineHelp[lineName] ?? '',
          child: SizedBox(
            width: 52,
            child: Text(
              label,
              style:
                  const TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
            ),
          ),
        ),
        ...List.generate(maxCards, (i) {
          final isUndoable = i < cards.length &&
              currentTurnPlacements
                  .any((p) => p.card == cards[i] && p.line == lineName);
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 2),
            child: LineSlotWidget(
              card: i < cards.length ? cards[i] : null,
              lineName: lineName,
              canAccept: canAccept && i >= cards.length,
              onCardDropped: (card) => onCardPlaced?.call(card, lineName),
              isUndoable: isUndoable,
              onUndoTap: isUndoable
                  ? () => onUndoCard?.call(cards[i], lineName)
                  : null,
            ),
          );
        }),
      ],
    );
  }
}
