import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../models/board.dart';
import '../../models/player.dart';
import '../../models/card.dart' as ofc;
import 'card_widget.dart';

class OpponentBoardWidget extends StatelessWidget {
  final Player opponent;
  final bool hideCards;
  final VoidCallback? onTap;
  final String? celebratingLine;
  final Map<String, int> celebLines;

  const OpponentBoardWidget({
    super.key,
    required this.opponent,
    this.hideCards = false,
    this.onTap,
    this.celebratingLine,
    this.celebLines = const {},
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
              _buildMiniLineWithCeleb(opponent.board.top, OFCBoard.topMaxCards, 'top'),
              const SizedBox(height: 1),
              _buildMiniLineWithCeleb(opponent.board.mid, OFCBoard.midMaxCards, 'mid'),
              const SizedBox(height: 1),
              _buildMiniLineWithCeleb(opponent.board.bottom, OFCBoard.bottomMaxCards, 'bottom'),
            ],
          ),
        ),
      ),
    ),
    );
  }

  Widget _buildMiniLineWithCeleb(List<ofc.Card> cards, int maxCards, String lineName) {
    Widget line = _buildMiniLine(cards, maxCards);
    final level = celebLines[lineName] ?? 0;

    if (level >= 2) {
      line = Container(
        key: const Key('opponent-celebration'),
        decoration: BoxDecoration(
          boxShadow: [
            BoxShadow(
              color: Colors.amber.withValues(alpha: level == 3 ? 0.6 : 0.3),
              blurRadius: level == 3 ? 12 : 8,
              spreadRadius: level == 3 ? 2 : 1,
            ),
          ],
        ),
        child: line,
      )
          .animate(onPlay: (c) => c.forward())
          .shimmer(duration: 600.ms, color: Colors.amber.withValues(alpha: 0.4));
    } else if (level == 1) {
      line = line
          .animate(onPlay: (c) => c.forward())
          .shimmer(duration: 600.ms, color: Colors.amber.withValues(alpha: 0.3));
    } else if (celebratingLine == lineName) {
      // Fallback: 기존 celebratingLine 호환
      line = DecoratedBox(
        key: const Key('opponent-celebration'),
        decoration: BoxDecoration(
          boxShadow: [
            BoxShadow(
              color: Colors.amber.withValues(alpha: 0.6),
              blurRadius: 12,
              spreadRadius: 2,
            ),
          ],
        ),
        child: line,
      );
    }
    return line;
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
