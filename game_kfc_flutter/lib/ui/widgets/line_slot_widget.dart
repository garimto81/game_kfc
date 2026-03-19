import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../models/card.dart' as ofc;
import 'card_widget.dart';

class LineSlotWidget extends StatelessWidget {
  final ofc.Card? card;
  final String lineName;
  final bool canAccept;
  final void Function(ofc.Card card)? onCardDropped;
  final bool isUndoable;
  final VoidCallback? onUndoTap;

  const LineSlotWidget({
    super.key,
    this.card,
    required this.lineName,
    this.canAccept = true,
    this.onCardDropped,
    this.isUndoable = false,
    this.onUndoTap,
  });

  @override
  Widget build(BuildContext context) {
    if (card != null) {
      Widget cardWidget = CardWidget(card: card!)
          .animate()
          .scale(
            begin: const Offset(0.8, 0.8),
            end: const Offset(1.0, 1.0),
            duration: 300.ms,
            curve: Curves.easeOutBack,
          )
          .fadeIn(duration: 200.ms);

      if (isUndoable) {
        return GestureDetector(
          onTap: onUndoTap,
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.amber, width: 2),
            ),
            child: cardWidget,
          ),
        );
      }
      return cardWidget;
    }

    return DragTarget<ofc.Card>(
      onWillAcceptWithDetails: (details) => canAccept,
      onAcceptWithDetails: (details) {
        onCardDropped?.call(details.data);
      },
      builder: (context, candidateData, rejectedData) {
        final isHovering = candidateData.isNotEmpty;
        return AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          width: 50,
          height: 70,
          decoration: BoxDecoration(
            color: isHovering
                ? Colors.green[100]
                : (canAccept ? Colors.grey[200] : Colors.grey[100]),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: isHovering
                  ? Colors.green
                  : (canAccept ? Colors.grey[400]! : Colors.grey[300]!),
              width: isHovering ? 2 : 1,
            ),
          ),
          child: Center(
            child: Text(
              canAccept ? '+' : '',
              style: TextStyle(
                color: canAccept ? Colors.grey[500] : Colors.grey[300],
                fontSize: 18,
              ),
            ),
          ),
        );
      },
    );
  }
}
