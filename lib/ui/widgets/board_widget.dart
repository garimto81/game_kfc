import 'package:flutter/material.dart';
import '../../models/board.dart';
import '../../models/card.dart' as ofc;
import '../../models/card_drag_data.dart';
import 'line_slot_widget.dart';

class BoardWidget extends StatefulWidget {
  final OFCBoard board;
  final List<String> availableLines;
  final void Function(ofc.Card card, String line, {String? fromLine})?
      onCardPlaced;
  final List<({ofc.Card card, String line, bool impact})> currentTurnPlacements;
  final Set<({ofc.Card card, String line})> lineImpactCards;
  final void Function(ofc.Card card, String line)? onUndoCard;
  final bool hideCards;

  const BoardWidget({
    super.key,
    required this.board,
    this.availableLines = const ['top', 'mid', 'bottom'],
    this.onCardPlaced,
    this.currentTurnPlacements = const [],
    this.lineImpactCards = const {},
    this.onUndoCard,
    this.hideCards = false,
  });

  @override
  State<BoardWidget> createState() => _BoardWidgetState();
}

class _BoardWidgetState extends State<BoardWidget> {
  final _topKey = GlobalKey();
  final _midKey = GlobalKey();
  final _bottomKey = GlobalKey();

  /// 드롭 Y 좌표 기준으로 가장 가까운 배치 가능한 행을 찾는다.
  String? _findNearestLine(double dropY) {
    final keys = {'top': _topKey, 'mid': _midKey, 'bottom': _bottomKey};
    String? nearest;
    double minDist = double.infinity;

    for (final entry in keys.entries) {
      // 배치 가능한 행만 후보
      if (!widget.availableLines.contains(entry.key)) continue;
      // 해당 행에 빈 슬롯이 있는지 확인
      final cards = _cardsForLine(entry.key);
      final max = _maxForLine(entry.key);
      if (cards.length >= max) continue;

      final box =
          entry.value.currentContext?.findRenderObject() as RenderBox?;
      if (box == null) continue;
      final pos = box.localToGlobal(Offset.zero);
      final centerY = pos.dy + box.size.height / 2;
      final dist = (dropY - centerY).abs();
      if (dist < minDist) {
        minDist = dist;
        nearest = entry.key;
      }
    }
    return nearest;
  }

  List<ofc.Card> _cardsForLine(String line) {
    switch (line) {
      case 'top':
        return widget.board.top;
      case 'mid':
        return widget.board.mid;
      case 'bottom':
        return widget.board.bottom;
      default:
        return [];
    }
  }

  int _maxForLine(String line) {
    switch (line) {
      case 'top':
        return OFCBoard.topMaxCards;
      case 'mid':
        return OFCBoard.midMaxCards;
      case 'bottom':
        return OFCBoard.bottomMaxCards;
      default:
        return 0;
    }
  }

  @override
  Widget build(BuildContext context) {
    // 보드 전체를 fallback DragTarget으로 감싸서
    // 슬롯 밖에서 드롭해도 가장 가까운 행에 배치
    return DragTarget<CardDragData>(
      onWillAcceptWithDetails: (details) {
        if (widget.availableLines.isEmpty) return false;
        // 배치 가능한 행이 있을 때만 수락
        final feedbackY = details.offset.dy + 35;
        return _findNearestLine(feedbackY) != null;
      },
      onAcceptWithDetails: (details) {
        // 피드백 위젯 중심 Y 기준으로 가장 가까운 행 찾기
        final feedbackCenterY = details.offset.dy + 35; // 카드 높이 70의 절반
        final nearestLine = _findNearestLine(feedbackCenterY);
        if (nearestLine != null) {
          // 같은 라인으로의 이동 차단
          if (details.data.sourceLine == nearestLine) return;
          widget.onCardPlaced?.call(
            details.data.card,
            nearestLine,
            fromLine: details.data.sourceLine,
          );
        }
      },
      builder: (context, candidateData, rejectedData) {
        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _buildLine('Top', widget.board.top, OFCBoard.topMaxCards, 'top',
                _topKey),
            const SizedBox(height: 8),
            _buildLine('Mid', widget.board.mid, OFCBoard.midMaxCards, 'mid',
                _midKey),
            const SizedBox(height: 8),
            _buildLine('Bottom', widget.board.bottom,
                OFCBoard.bottomMaxCards, 'bottom', _bottomKey),
          ],
        );
      },
    );
  }

  static const _lineHelp = {
    'top': 'Top (3 cards): High Card, One Pair, Three of a Kind only.',
    'mid': 'Middle (5 cards): Any poker hand. Must be weaker than Bottom.',
    'bottom':
        'Bottom (5 cards): Any poker hand. Must be your strongest line.',
  };

  Widget _buildLine(String label, List<ofc.Card> cards, int maxCards,
      String lineName, GlobalKey lineKey) {
    final canAccept = widget.availableLines.contains(lineName);
    return Row(
      key: lineKey,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Tooltip(
          message: _lineHelp[lineName] ?? '',
          child: SizedBox(
            width: 52,
            child: Text(
              label,
              style: const TextStyle(
                  fontSize: 12, fontWeight: FontWeight.w500),
            ),
          ),
        ),
        ...List.generate(maxCards, (i) {
          final isUndoable = i < cards.length &&
              widget.currentTurnPlacements
                  .any((p) => p.card == cards[i] && p.line == lineName);
          // 새로 배치된 카드의 임팩트 또는 기존 카드의 라인 임팩트
          final isImpact = (isUndoable &&
                  widget.currentTurnPlacements.any((p) =>
                      p.card == cards[i] &&
                      p.line == lineName &&
                      p.impact)) ||
              (i < cards.length &&
                  widget.lineImpactCards.any(
                      (p) => p.card == cards[i] && p.line == lineName));
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 2),
            child: LineSlotWidget(
              // 임팩트 시 key 변경 → 리빌드 + 애니메이션 재생
              key: isImpact
                  ? ValueKey('impact_${lineName}_$i')
                  : null,
              card: i < cards.length ? cards[i] : null,
              lineName: lineName,
              canAccept: canAccept && i >= cards.length,
              onCardDropped: (card, sourceLine) => widget.onCardPlaced
                  ?.call(card, lineName, fromLine: sourceLine),
              isUndoable: isUndoable,
              isImpact: isImpact,
              onUndoTap: isUndoable
                  ? () => widget.onUndoCard?.call(cards[i], lineName)
                  : null,
              faceDown: widget.hideCards,
            ),
          );
        }),
      ],
    );
  }
}
