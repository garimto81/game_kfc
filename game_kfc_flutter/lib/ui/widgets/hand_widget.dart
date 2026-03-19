import 'package:flutter/material.dart';
import '../../models/card.dart' as ofc;
import 'card_widget.dart';

class HandWidget extends StatelessWidget {
  final List<ofc.Card> cards;
  final void Function(ofc.Card card)? onCardTap;
  final bool showDiscardButtons;
  final bool hasDiscarded;
  final void Function(ofc.Card card)? onDiscard;
  final VoidCallback? onConfirm;
  final bool canConfirm;
  final VoidCallback? onSortByRank;
  final VoidCallback? onSortBySuit;
  final VoidCallback? onAutoArrange;

  const HandWidget({
    super.key,
    required this.cards,
    this.onCardTap,
    this.showDiscardButtons = false,
    this.hasDiscarded = false,
    this.onDiscard,
    this.onConfirm,
    this.canConfirm = false,
    this.onSortByRank,
    this.onSortBySuit,
    this.onAutoArrange,
  });

  @override
  Widget build(BuildContext context) {
    if (cards.isEmpty) {
      if (canConfirm && onConfirm != null) {
        return SizedBox(
          height: showDiscardButtons ? 104 : 80,
          child: Center(
            child: ElevatedButton(
              onPressed: onConfirm,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.green[600],
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              ),
              child: const Text('Confirm', style: TextStyle(fontSize: 16)),
            ),
          ),
        );
      }
      return const SizedBox(
        height: 70,
        child: Center(
          child: Text('No cards', style: TextStyle(color: Colors.grey)),
        ),
      );
    }

    // FL mode (>5 cards): use Wrap for multi-row layout
    if (cards.length > 5) {
      // 70px card height + 4px run spacing per row; 2 rows for up to 17 cards
      final rows = (cards.length / 9).ceil();
      final wrapHeight = rows * 74.0 + (rows - 1) * 4.0;
      final hasFlButtons = onSortByRank != null || onSortBySuit != null || onAutoArrange != null;
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (hasFlButtons)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (onSortByRank != null)
                    _FlButton(
                      icon: Icons.sort,
                      label: 'Rank',
                      onTap: onSortByRank!,
                    ),
                  if (onSortBySuit != null) ...[
                    const SizedBox(width: 6),
                    _FlButton(
                      icon: Icons.style,
                      label: 'Suit',
                      onTap: onSortBySuit!,
                    ),
                  ],
                  if (onAutoArrange != null) ...[
                    const SizedBox(width: 6),
                    _FlButton(
                      icon: Icons.auto_fix_high,
                      label: 'Auto',
                      onTap: onAutoArrange!,
                    ),
                  ],
                ],
              ),
            ),
          SizedBox(
            height: wrapHeight,
            child: Center(
              child: Wrap(
                alignment: WrapAlignment.center,
                spacing: 4,
                runSpacing: 4,
                children: cards.map((card) {
                  return CardWidget(
                    card: card,
                    draggable: true,
                    onTap: () => onCardTap?.call(card),
                  );
                }).toList(),
              ),
            ),
          ),
        ],
      );
    }

    return SizedBox(
      height: showDiscardButtons ? 104 : 80,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: cards.map((card) {
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CardWidget(
                  card: card,
                  draggable: true,
                  onTap: () => onCardTap?.call(card),
                ),
                if (showDiscardButtons)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: GestureDetector(
                      onTap: hasDiscarded ? null : () => onDiscard?.call(card),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color:
                              hasDiscarded ? Colors.grey[300] : Colors.red[400],
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          'Discard',
                          style: TextStyle(
                            color: hasDiscarded
                                ? Colors.grey[500]
                                : Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }
}

class _FlButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _FlButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 28,
      child: ElevatedButton.icon(
        onPressed: onTap,
        icon: Icon(icon, size: 14),
        label: Text(label, style: const TextStyle(fontSize: 11)),
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.amber[700],
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 0),
          minimumSize: Size.zero,
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(6),
          ),
        ),
      ),
    );
  }
}
