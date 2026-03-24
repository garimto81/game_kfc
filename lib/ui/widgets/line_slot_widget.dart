import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../models/card.dart' as ofc;
import '../../models/card_drag_data.dart';
import 'card_widget.dart';

class LineSlotWidget extends StatelessWidget {
  final ofc.Card? card;
  final String lineName;
  final bool canAccept;
  final void Function(ofc.Card card, String? sourceLine)? onCardDropped;
  final bool isUndoable;
  final VoidCallback? onUndoTap;
  final bool faceDown;
  final bool isImpact;

  const LineSlotWidget({
    super.key,
    this.card,
    required this.lineName,
    this.canAccept = true,
    this.onCardDropped,
    this.isUndoable = false,
    this.onUndoTap,
    this.faceDown = false,
    this.isImpact = false,
  });

  @override
  Widget build(BuildContext context) {
    if (card != null) {
      Widget cardWidget;
      if (isImpact) {
        // 트립스+ 완성: 큰 탄성 수축 + 진동 + 금색 shimmer
        cardWidget = Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            boxShadow: [
              BoxShadow(
                color: Colors.amber.withValues(alpha: 0.7),
                blurRadius: 14,
                spreadRadius: 4,
              ),
            ],
          ),
          child: CardWidget(card: card!, faceDown: faceDown),
        )
            .animate()
            .scale(
              begin: const Offset(1.6, 1.6),
              end: const Offset(1.0, 1.0),
              duration: 500.ms,
              curve: Curves.elasticOut,
            )
            .shake(hz: 5, offset: const Offset(3, 0), duration: 400.ms)
            .then(delay: 50.ms)
            .shimmer(
              duration: 700.ms,
              color: Colors.amber.withValues(alpha: 0.5),
            )
            .fadeIn(duration: 150.ms);
      } else {
        cardWidget = CardWidget(card: card!, faceDown: faceDown)
            .animate()
            .scale(
              begin: const Offset(0.8, 0.8),
              end: const Offset(1.0, 1.0),
              duration: 300.ms,
              curve: Curves.easeOutBack,
            )
            .fadeIn(duration: 200.ms);
      }

      if (isUndoable) {
        final undoableChild = Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: Colors.amber, width: 2),
          ),
          child: cardWidget,
        );
        return Draggable<CardDragData>(
          data: CardDragData(card: card!, sourceLine: lineName),
          feedback: Material(
            elevation: 8,
            borderRadius: BorderRadius.circular(8),
            child: Transform.scale(
              scale: 1.1,
              child: CardWidget(card: card!),
            ),
          ),
          childWhenDragging: Opacity(
            opacity: 0.3,
            child: undoableChild,
          ),
          child: GestureDetector(
            onTap: onUndoTap,
            child: undoableChild,
          ),
        );
      }
      return cardWidget;
    }

    return DragTarget<CardDragData>(
      onWillAcceptWithDetails: (details) {
        if (!canAccept) return false;
        // 같은 라인으로의 이동 차단
        if (details.data.sourceLine == lineName) return false;
        return true;
      },
      onAcceptWithDetails: (details) {
        onCardDropped?.call(details.data.card, details.data.sourceLine);
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
