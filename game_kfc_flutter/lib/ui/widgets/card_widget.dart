import 'package:flutter/material.dart';
import '../../models/card.dart' as ofc;

class CardWidget extends StatelessWidget {
  final ofc.Card card;
  final bool faceDown;
  final bool draggable;
  final bool miniMode;
  final VoidCallback? onTap;

  const CardWidget({
    super.key,
    required this.card,
    this.faceDown = false,
    this.draggable = false,
    this.miniMode = false,
    this.onTap,
  });

  Color get _suitColor {
    switch (card.suit) {
      case ofc.Suit.heart:
      case ofc.Suit.diamond:
        return const Color(0xFFD32F2F);
      case ofc.Suit.spade:
      case ofc.Suit.club:
        return const Color(0xFF212121);
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

    if (draggable) {
      return Draggable<ofc.Card>(
        data: card,
        feedback: Material(
          elevation: 8,
          borderRadius: BorderRadius.circular(8),
          child: Transform.scale(scale: 1.1, child: _buildFrontFace()),
        ),
        childWhenDragging: Opacity(opacity: 0.3, child: cardContent),
        child: GestureDetector(onTap: onTap, child: cardContent),
      );
    }

    return GestureDetector(onTap: onTap, child: cardContent);
  }
}
