import 'package:flutter/material.dart';
import '../../models/board.dart';
import '../../models/card.dart' as ofc;
import '../../models/player.dart';
import '../theme/player_colors.dart';
import 'board_widget.dart';

/// Dynamic grid layout for up to 6 player boards.
///
/// Grid dimensions based on total cells:
///   - 2 cells: 2x1
///   - 3-4 cells: 2x2
///   - 5-6 cells: 3x2
///   - 7+ cells: 3x3
///
/// Player mode: my board placed at fixed position, opponents fill remaining slots.
/// Spectator mode (no myPlayerId): all boards fill sequentially.
class BoardGridView extends StatelessWidget {
  final List<Player> opponents;
  final String? myPlayerId;
  final OFCBoard? myBoard;
  final List<String> availableLines;
  final void Function(ofc.Card card, String line, {String? fromLine})? onCardPlaced;
  final void Function(ofc.Card card, String line)? onUndoCard;
  final List<({ofc.Card card, String line, bool impact})> currentTurnPlacements;
  final Set<({ofc.Card card, String line})> lineImpactCards;
  final bool hideCardsForFL;
  final bool myIsInFL;
  final Widget? foulWarning;
  final int mySeatIndex;
  final bool showFoulAnimation;

  const BoardGridView({
    super.key,
    required this.opponents,
    this.myPlayerId,
    this.myBoard,
    this.availableLines = const [],
    this.onCardPlaced,
    this.onUndoCard,
    this.currentTurnPlacements = const [],
    this.lineImpactCards = const {},
    this.hideCardsForFL = true,
    this.myIsInFL = false,
    this.foulWarning,
    this.mySeatIndex = 0,
    this.showFoulAnimation = false,
  });

  @override
  Widget build(BuildContext context) {
    final isSpectator = myPlayerId == null;
    final totalCells = isSpectator ? opponents.length : opponents.length + 1;
    final (cols, rows) = _gridDimensions(totalCells);
    final cellCount = cols * rows;

    // Build cells list
    final cells = List<Widget>.generate(
      cellCount,
      (_) => const SizedBox.shrink(),
    );

    if (isSpectator) {
      for (int i = 0; i < opponents.length && i < cellCount; i++) {
        cells[i] = _buildOpponentCell(opponents[i]);
      }
    } else {
      // Determine my board position based on grid size
      final myIndex = (cols == 3) ? 4 : (rows == 1 ? 1 : 2); // bottom-center for 3x2, right for 2x1, bottom-left for 2x2

      if (myIndex < cellCount) {
        cells[myIndex] = _buildMyBoardCell();
      }

      // Place opponents in remaining slots
      final oppSlots = switch (opponents.length) {
        1 => [1],
        2 => [0, 1],
        3 => [0, 1, 3],
        4 => [0, 1, 3, 4],
        5 => [0, 1, 3, 4, 5],
        _ => List.generate(opponents.length, (i) => i >= 2 ? i + 1 : i),
      };

      for (int i = 0; i < opponents.length && i < oppSlots.length; i++) {
        if (oppSlots[i] < cellCount) {
          cells[oppSlots[i]] = _buildOpponentCell(opponents[i]);
        }
      }
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final cellWidth = (constraints.maxWidth - 4 * (cols - 1)) / cols;
        final cellHeight = (constraints.maxHeight - 4 * (rows - 1)) / rows;
        final aspectRatio = cellWidth / cellHeight;

        return GridView.count(
          crossAxisCount: cols,
          childAspectRatio: aspectRatio.clamp(0.5, 3.0),
          mainAxisSpacing: 4,
          crossAxisSpacing: 4,
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          physics: const NeverScrollableScrollPhysics(),
          shrinkWrap: false,
          children: cells,
        );
      },
    );
  }

  /// Grid dimensions based on total cell count
  (int cols, int rows) _gridDimensions(int totalCells) {
    if (totalCells <= 2) return (2, 1);
    if (totalCells <= 4) return (2, 2);
    if (totalCells <= 6) return (3, 2);
    return (3, 3);
  }

  Widget _buildMyBoardCell() {
    final myColor = PlayerColors.forSeat(mySeatIndex);
    return Container(
      decoration: BoxDecoration(
        color: myColor.background.withValues(alpha: 0.3),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: myColor.border, width: 2),
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            child: Row(
              children: [
                const Icon(Icons.person, size: 12, color: Colors.white70),
                const SizedBox(width: 4),
                const Text(
                  'My Board',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                const Spacer(),
                if (foulWarning != null) foulWarning!,
              ],
            ),
          ),
          Expanded(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.center,
              child: Padding(
                padding: const EdgeInsets.all(4),
                child: BoardWidget(
                  board: myBoard ?? OFCBoard(),
                  availableLines: availableLines,
                  onCardPlaced: onCardPlaced,
                  currentTurnPlacements: currentTurnPlacements,
                  lineImpactCards: lineImpactCards,
                  onUndoCard: onUndoCard,
                  showFoulAnimation: showFoulAnimation,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildOpponentCell(Player opponent) {
    final shouldHide = hideCardsForFL && (opponent.isInFantasyland || myIsInFL);
    final color = PlayerColors.forSeat(opponent.seatIndex);
    return Container(
      decoration: BoxDecoration(
        color: color.background.withValues(alpha: 0.25),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.border.withValues(alpha: 0.6), width: 1),
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            child: Row(
              children: [
                if (opponent.isInFantasyland)
                  Icon(Icons.auto_awesome, size: 12, color: Colors.amber[400]),
                if (opponent.isInFantasyland)
                  const SizedBox(width: 2),
                Expanded(
                  child: Text(
                    '${opponent.name} (${opponent.score}pt)',
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.center,
              child: Padding(
                padding: const EdgeInsets.all(4),
                child: BoardWidget(
                  board: opponent.board,
                  availableLines: const [],
                  onCardPlaced: null,
                  currentTurnPlacements: const [],
                  hideCards: shouldHide,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
