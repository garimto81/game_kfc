import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../models/card.dart' as ofc;
import '../../models/card_drag_data.dart';

class CardWidget extends StatelessWidget {
  final ofc.Card card;
  final bool faceDown;
  final bool draggable;
  final bool miniMode;
  final bool excited;
  final VoidCallback? onTap;

  const CardWidget({
    super.key,
    required this.card,
    this.faceDown = false,
    this.draggable = false,
    this.miniMode = false,
    this.excited = false,
    this.onTap,
  });

  Color get _suitColor {
    switch (card.suit) {
      case ofc.Suit.spade:
        return const Color(0xFF212121); // 검정
      case ofc.Suit.heart:
        return const Color(0xFFD32F2F); // 빨강
      case ofc.Suit.diamond:
        return const Color(0xFF1565C0); // 파랑
      case ofc.Suit.club:
        return const Color(0xFF2E7D32); // 초록
    }
  }

  Widget _buildBackFace() {
    return Container(
      width: 50,
      height: 70,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.white24, width: 1),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF1565C0), Color(0xFF0D47A1)],
        ),
        boxShadow: const [
          BoxShadow(color: Colors.black26, blurRadius: 4, offset: Offset(1, 2)),
        ],
      ),
      child: Center(
        child: Container(
          width: 36,
          height: 54,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(4),
            border: Border.all(color: Colors.white24, width: 1),
          ),
          child: const Center(
            child: Text(
              '\u2660',
              style: TextStyle(color: Colors.white24, fontSize: 18),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildMiniCard() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(3),
        border: Border.all(color: Colors.grey[300]!, width: 0.5),
      ),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              card.rank.rankName,
              style: TextStyle(
                fontSize: 8,
                fontWeight: FontWeight.bold,
                color: _suitColor,
                height: 1.0,
              ),
            ),
            Text(
              card.suit.suitSymbol,
              style: TextStyle(fontSize: 8, color: _suitColor, height: 1.0),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFrontFace() {
    return Container(
      width: 50,
      height: 70,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.grey[300]!, width: 1),
        boxShadow: const [
          BoxShadow(color: Colors.black26, blurRadius: 4, offset: Offset(1, 2)),
        ],
      ),
      child: Stack(
        children: [
          // Top-left rank+suit
          Positioned(
            top: 3,
            left: 4,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Text(
                  card.rank.rankName,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: _suitColor,
                    height: 1.0,
                  ),
                ),
                Text(
                  card.suit.suitSymbol,
                  style: TextStyle(fontSize: 9, color: _suitColor, height: 1.0),
                ),
              ],
            ),
          ),
          // Center suit
          Center(
            child: Text(
              card.suit.suitSymbol,
              style: TextStyle(fontSize: 22, color: _suitColor),
            ),
          ),
          // Bottom-right rank+suit (upside-down effect via alignment)
          Positioned(
            bottom: 3,
            right: 4,
            child: RotatedBox(
              quarterTurns: 2,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Text(
                    card.rank.rankName,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      color: _suitColor,
                      height: 1.0,
                    ),
                  ),
                  Text(
                    card.suit.suitSymbol,
                    style: TextStyle(fontSize: 9, color: _suitColor, height: 1.0),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (miniMode) {
      if (faceDown) {
        return Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(2),
            color: const Color(0xFF1565C0),
            border: Border.all(color: Colors.white24, width: 0.5),
          ),
        );
      }
      return _buildMiniCard();
    }

    final cardContent = AnimatedSwitcher(
      duration: const Duration(milliseconds: 300),
      transitionBuilder: (child, animation) {
        return ScaleTransition(scale: animation, child: child);
      },
      child: faceDown
          ? _buildBackFace()
          : KeyedSubtree(
              key: ValueKey('${card.rank.name}_${card.suit.name}'),
              child: _buildFrontFace(),
            ),
    );

    // 트립스+ 완성 가능 카드: 흔들림 + 금색 글로우
    Widget displayContent = cardContent;
    if (excited && !faceDown) {
      displayContent = Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          boxShadow: [
            BoxShadow(
              color: Colors.amber.withValues(alpha: 0.6),
              blurRadius: 10,
              spreadRadius: 2,
            ),
          ],
        ),
        child: cardContent,
      )
          .animate(onPlay: (c) => c.repeat(reverse: true))
          .shimmer(
            duration: 1200.ms,
            color: Colors.amber.withValues(alpha: 0.3),
          )
          .shake(hz: 3, offset: const Offset(1.5, 0), duration: 800.ms);
    }

    if (draggable) {
      return Draggable<CardDragData>(
        data: CardDragData(card: card),
        feedback: Material(
          elevation: 8,
          borderRadius: BorderRadius.circular(8),
          child: Transform.scale(scale: 1.1, child: _buildFrontFace()),
        ),
        childWhenDragging: Opacity(opacity: 0.3, child: displayContent),
        child: GestureDetector(onTap: onTap, child: displayContent),
      );
    }

    return GestureDetector(onTap: onTap, child: displayContent);
  }
}
