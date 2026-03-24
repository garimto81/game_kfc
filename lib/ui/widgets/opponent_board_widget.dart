import 'package:flutter/material.dart';
import '../../models/board.dart';
import '../../models/player.dart';
import '../../models/card.dart' as ofc;
import 'card_widget.dart';

class OpponentBoardWidget extends StatelessWidget {
  final Player opponent;
  final bool hideCards;
  final VoidCallback? onTap;

  const OpponentBoardWidget({
    super.key,
    required this.opponent,
    this.hideCards = false,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: SizedBox(
      width: 130,
      child: Card(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(4),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (opponent.isInFantasyland)
                    Icon(Icons.auto_awesome, size: 10, color: Colors.amber[400]),
                  if (opponent.isInFantasyland) const SizedBox(width: 2),
                  Flexible(
                    child: Text(
                      '${opponent.name} (${opponent.score}pt)',
                      style: const TextStyle(
                          fontSize: 10, fontWeight: FontWeight.bold),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 2),
              _buildMiniLine(opponent.board.top, OFCBoard.topMaxCards),
              const SizedBox(height: 1),
              _buildMiniLine(opponent.board.mid, OFCBoard.midMaxCards),
              const SizedBox(height: 1),
              _buildMiniLine(opponent.board.bottom, OFCBoard.bottomMaxCards),
            ],
          ),
        ),
      ),
    ),
    );
  }

  Widget _buildMiniLine(List<ofc.Card> cards, int maxCards) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(maxCards, (i) {
        if (i < cards.length) {
          return Padding(
            padding: const EdgeInsets.all(1),
            child: SizedBox(
              width: 18,
              height: 22,
              child: CardWidget(
                card: cards[i],
                faceDown: hideCards,
                miniMode: true,
              ),
            ),
          );
        }
        return Padding(
          padding: const EdgeInsets.all(1),
          child: Container(
            width: 18,
            height: 22,
            decoration: BoxDecoration(
              color: Colors.grey[100],
              borderRadius: BorderRadius.circular(2),
              border: Border.all(color: Colors.grey[300]!),
            ),
          ),
        );
      }),
    );
  }
}
