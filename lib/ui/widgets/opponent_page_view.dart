import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../models/player.dart';
import '../theme/player_colors.dart';
import 'board_widget.dart';

class OpponentPageView extends StatefulWidget {
  final List<Player> opponents;
  final bool hideCardsForFL;
  final bool myIsInFL;
  final Map<String, int> opponentCelebLines;

  const OpponentPageView({
    super.key,
    required this.opponents,
    this.hideCardsForFL = true,
    this.myIsInFL = false,
    this.opponentCelebLines = const {},
  });

  @override
  State<OpponentPageView> createState() => _OpponentPageViewState();
}

class _OpponentPageViewState extends State<OpponentPageView> {
  final PageController _pageController = PageController();
  int _currentPage = 0;

  @override
  void didUpdateWidget(covariant OpponentPageView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_currentPage >= widget.opponents.length) {
      _currentPage = widget.opponents.isEmpty ? 0 : widget.opponents.length - 1;
      if (_pageController.hasClients) {
        _pageController.jumpToPage(_currentPage);
      }
    }
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.opponents.isEmpty) return const SizedBox.shrink();

    return Column(
      children: [
        // Name + score row with page dots
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          child: Row(
            children: [
              if (widget.opponents[_currentPage].isInFantasyland)
                Icon(Icons.auto_awesome, size: 16, color: Colors.amber[400]),
              if (widget.opponents[_currentPage].isInFantasyland)
                const SizedBox(width: 4),
              Text(
                '${widget.opponents[_currentPage].name} (${widget.opponents[_currentPage].score}pt)',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: PlayerColors.forSeat(widget.opponents[_currentPage].seatIndex).primary,
                ),
              ),
              const Spacer(),
              if (widget.opponents.length > 1) ..._buildDots(),
            ],
          ),
        ),
        // Full-size board PageView
        Expanded(
          child: PageView.builder(
            controller: _pageController,
            itemCount: widget.opponents.length,
            onPageChanged: (index) {
              setState(() => _currentPage = index);
            },
            itemBuilder: (context, index) {
              final opp = widget.opponents[index];
              final shouldHide = widget.hideCardsForFL &&
                  (opp.isInFantasyland || widget.myIsInFL);
              // Check if any line has a celebration for this opponent
              final hasCeleb = widget.opponentCelebLines.keys
                  .any((k) => k.startsWith('${opp.id}_'));
              Widget boardWidget = BoardWidget(
                board: opp.board,
                availableLines: const [],
                onCardPlaced: null,
                currentTurnPlacements: const [],
                hideCards: shouldHide,
              );
              if (hasCeleb) {
                // Find max level for shimmer intensity
                final maxLevel = widget.opponentCelebLines.entries
                    .where((e) => e.key.startsWith('${opp.id}_'))
                    .fold<int>(0, (max, e) => e.value > max ? e.value : max);
                if (maxLevel >= 2) {
                  boardWidget = Container(
                    decoration: BoxDecoration(
                      boxShadow: [
                        BoxShadow(
                          color: Colors.amber.withValues(alpha: maxLevel == 3 ? 0.6 : 0.3),
                          blurRadius: maxLevel == 3 ? 12 : 8,
                          spreadRadius: maxLevel == 3 ? 2 : 1,
                        ),
                      ],
                    ),
                    child: boardWidget,
                  )
                      .animate(onPlay: (c) => c.forward())
                      .shimmer(duration: 600.ms, color: Colors.amber.withValues(alpha: 0.4));
                } else if (maxLevel == 1) {
                  boardWidget = boardWidget
                      .animate(onPlay: (c) => c.forward())
                      .shimmer(duration: 600.ms, color: Colors.amber.withValues(alpha: 0.3));
                }
              }
              return FittedBox(
                fit: BoxFit.scaleDown,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: boardWidget,
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  List<Widget> _buildDots() {
    return List.generate(widget.opponents.length, (i) {
      return Container(
        margin: const EdgeInsets.symmetric(horizontal: 3),
        width: 8,
        height: 8,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: i == _currentPage
              ? Colors.white
              : Colors.white.withValues(alpha: 0.4),
        ),
      );
    });
  }
}
