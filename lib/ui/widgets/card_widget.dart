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

  static const double _cardWidth = 50;
  static const double _cardHeight = 70;
  static const double _miniCardWidth = 24;
  static const double _miniCardHeight = 34;


  const CardWidget({
    super.key,
    required this.card,
    this.faceDown = false,
    this.draggable = false,
    this.miniMode = false,
    this.excited = false,
    this.onTap,
  });

  Widget _buildFallbackCard(double w, double h) {
    return Container(
      width: w,
      height: h,
      decoration: BoxDecoration(
        color: const Color(0xFF1565C0),
        borderRadius: BorderRadius.circular(h * 0.08),
        border: Border.all(color: Colors.white24, width: 1),
      ),
      child: const Center(child: Text('?', style: TextStyle(color: Colors.white, fontSize: 16))),
    );
  }

  Widget _buildBackFace({double? width, double? height}) {
    final w = width ?? _cardWidth;
    final h = height ?? _cardHeight;
    return ClipRRect(
      borderRadius: BorderRadius.circular(h * 0.08),
      child: Image.asset(
        ofc.Card.backImagePath,
        width: w,
        height: h,
        fit: BoxFit.cover,
        filterQuality: FilterQuality.medium,
        errorBuilder: (_, __, ___) => _buildFallbackCard(w, h),
      ),
    );
  }

  Widget _buildFrontFace({double? width, double? height}) {
    final w = width ?? _cardWidth;
    final h = height ?? _cardHeight;
    return ClipRRect(
      borderRadius: BorderRadius.circular(h * 0.08),
      child: Image.asset(
        card.imagePath,
        width: w,
        height: h,
        fit: BoxFit.cover,
        filterQuality: FilterQuality.medium,
        errorBuilder: (_, __, ___) => _buildFallbackCard(w, h),
      ),
    );
  }

  Widget _buildMiniCard() {
    if (faceDown) {
      return _buildBackFace(width: _miniCardWidth, height: _miniCardHeight);
    }
    return _buildFrontFace(width: _miniCardWidth, height: _miniCardHeight);
  }

  @override
  Widget build(BuildContext context) {
    if (miniMode) {
      return Semantics(
        label: faceDown
            ? 'card-face-down'
            : 'card-${card.rank.name}-${card.suit.name}',
        child: _buildMiniCard(),
      );
    }

    final cardContent = AnimatedSwitcher(
      duration: const Duration(milliseconds: 300),
      transitionBuilder: (child, animation) {
        return ScaleTransition(scale: animation, child: child);
      },
      child: faceDown
          ? KeyedSubtree(
              key: const ValueKey('back'),
              child: _buildBackFace(),
            )
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
      return Semantics(
        label: faceDown
            ? 'card-face-down'
            : 'card-${card.rank.name}-${card.suit.name}',
        child: Draggable<CardDragData>(
          data: CardDragData(card: card),
          feedback: Material(
            elevation: 8,
            borderRadius: BorderRadius.circular(8),
            child: Transform.scale(
              scale: 1.1,
              child: faceDown ? _buildBackFace() : _buildFrontFace(),
            ),
          ),
          childWhenDragging: Opacity(opacity: 0.3, child: displayContent),
          child: GestureDetector(onTap: onTap, child: displayContent),
        ),
      );
    }

    return Semantics(
      label: faceDown
          ? 'card-face-down'
          : 'card-${card.rank.name}-${card.suit.name}',
      child: GestureDetector(onTap: onTap, child: displayContent),
    );
  }
}
