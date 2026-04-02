import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../logic/hand_evaluator.dart';
import '../../logic/royalty_calculator.dart';
import '../../models/board.dart';
import '../../logic/effect_manager.dart';
import '../../models/card.dart' as ofc;
import '../../models/card_drag_data.dart';
import 'celebration_overlay.dart';
import 'line_slot_widget.dart';

class BoardWidget extends StatefulWidget {
  final OFCBoard board;
  final List<String> availableLines;
  final void Function(ofc.Card card, String line, {String? fromLine})?
      onCardPlaced;
  final List<({ofc.Card card, String line, bool impact})> currentTurnPlacements;
  final EffectManager? effectManager;
  final int handNumber;
  final void Function(ofc.Card card, String line)? onUndoCard;
  final bool hideCards;
  final bool showFoulAnimation;

  const BoardWidget({
    super.key,
    required this.board,
    this.availableLines = const ['top', 'mid', 'bottom'],
    this.onCardPlaced,
    this.currentTurnPlacements = const [],
    this.effectManager,
    this.handNumber = 0,
    this.onUndoCard,
    this.hideCards = false,
    this.showFoulAnimation = false,
  });

  @override
  State<BoardWidget> createState() => _BoardWidgetState();
}

class _BoardWidgetState extends State<BoardWidget> {
  final _topKey = GlobalKey();
  final _midKey = GlobalKey();
  final _bottomKey = GlobalKey();

  // Foul scatter용 랜덤 오프셋/회전 캐시
  final _scatterRng = Random();
  final Map<int, Offset> _scatterOffsets = {};
  final Map<int, double> _scatterAngles = {};

  Offset _getScatterOffset(int index) {
    return _scatterOffsets.putIfAbsent(
      index,
      () => Offset(
        _scatterRng.nextDouble() * 40 - 20, // -20 ~ +20
        _scatterRng.nextDouble() * 30 - 15, // -15 ~ +15
      ),
    );
  }

  double _getScatterAngle(int index) {
    return _scatterAngles.putIfAbsent(
      index,
      () => _scatterRng.nextDouble() * 0.6 - 0.3, // -0.3 ~ +0.3 rad
    );
  }

  @override
  void didUpdateWidget(covariant BoardWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Foul 애니메이션 해제 시 scatter 캐시 초기화
    if (oldWidget.showFoulAnimation && !widget.showFoulAnimation) {
      _scatterOffsets.clear();
      _scatterAngles.clear();
    }
  }

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
        Widget boardContent = Column(
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

        // Foul 연출: shake + scatter + 빨간 오버레이 + FOUL! 텍스트
        if (widget.showFoulAnimation) {
          boardContent = boardContent
              .animate(onPlay: (c) => c.forward())
              .shake(hz: 8, offset: const Offset(6, 3), duration: 600.ms);
        }

        return Stack(
          clipBehavior: Clip.none,
          children: [
            boardContent,
            if (widget.showFoulAnimation) ...[
              // 빨간 flash 오버레이
              Positioned.fill(
                child: IgnorePointer(
                  child: Container(
                    decoration: BoxDecoration(
                      color: Colors.red.withValues(alpha: 0.3),
                      borderRadius: BorderRadius.circular(8),
                    ),
                  )
                      .animate(onPlay: (c) => c.forward())
                      .fadeIn(duration: 200.ms)
                      .then(delay: 300.ms)
                      .fadeOut(duration: 500.ms),
                ),
              ),
              // FOUL! 텍스트
              Positioned.fill(
                child: Center(
                  child: Text(
                    'FOUL!',
                    style: TextStyle(
                      color: Colors.red[900],
                      fontSize: 36,
                      fontWeight: FontWeight.w900,
                      shadows: [
                        Shadow(color: Colors.red, blurRadius: 20),
                        Shadow(color: Colors.black, blurRadius: 10),
                      ],
                    ),
                  )
                      .animate(onPlay: (c) => c.forward())
                      .scale(
                          begin: const Offset(0, 0),
                          end: const Offset(1.3, 1.3),
                          duration: 300.ms,
                          curve: Curves.easeOut)
                      .then()
                      .scale(
                          end: const Offset(0.77, 0.77),
                          duration: 200.ms,
                          curve: Curves.elasticOut)
                      .then(delay: 500.ms)
                      .fadeOut(duration: 300.ms),
                ),
              ),
            ],
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

  /// 라인별 scatter 인덱스 오프셋 (top=0, mid=3, bottom=8)
  int _scatterBaseIndex(String lineName) {
    switch (lineName) {
      case 'top':
        return 0;
      case 'mid':
        return 3;
      default:
        return 8;
    }
  }

  Widget _buildLine(String label, List<ofc.Card> cards, int maxCards,
      String lineName, GlobalKey lineKey) {
    final canAccept = widget.availableLines.contains(lineName);
    final isFoul = widget.showFoulAnimation;
    // 라인 완성 시 축하 레벨 계산 (foul 시 비활성)
    int celebLevel;
    if (isFoul) {
      celebLevel = 0;
    } else if (widget.effectManager != null) {
      celebLevel = widget.effectManager!.getCelebration(widget.handNumber, lineName);
      if (celebLevel == 0) {
        celebLevel = getCelebrationLevel(cards, lineName);
      }
    } else {
      celebLevel = getCelebrationLevel(cards, lineName);
    }

    Widget lineWidget = Row(
      key: lineKey,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Tooltip(
          message: _lineHelp[lineName] ?? '',
          child: SizedBox(
            width: 52,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                      fontSize: 12, fontWeight: FontWeight.w500),
                ),
                _buildRoyaltyBadge(cards, lineName),
              ],
            ),
          ),
        ),
        ...List.generate(maxCards, (i) {
          final isUndoable = i < cards.length &&
              widget.currentTurnPlacements
                  .any((p) => p.card == cards[i] && p.line == lineName);
          // 새로 배치된 카드의 임팩트 또는 기존 카드의 라인 임팩트
          final isImpact = i < cards.length &&
              widget.effectManager != null &&
              widget.effectManager!.isEarlyWarningActive(widget.handNumber, lineName, cards[i]);

          // Foul scatter: 카드에 랜덤 오프셋 + 회전 적용
          Widget slotWidget = LineSlotWidget(
            // 임팩트 시 key 변경 → 리빌드 + 애니메이션 재생
            key: isImpact
                ? ValueKey('impact_${lineName}_$i')
                : celebLevel > 0
                    ? ValueKey('celeb_${lineName}_$i')
                    : null,
            card: i < cards.length ? cards[i] : null,
            lineName: lineName,
            canAccept: !isFoul && canAccept && i >= cards.length,
            onCardDropped: (card, sourceLine) => widget.onCardPlaced
                ?.call(card, lineName, fromLine: sourceLine),
            isUndoable: !isFoul && isUndoable,
            isImpact: !isFoul && isImpact,
            celebLevel: (!isFoul && !isImpact && i < cards.length) ? celebLevel : 0,
            onUndoTap: !isFoul && isUndoable
                ? () => widget.onUndoCard?.call(cards[i], lineName)
                : null,
            faceDown: widget.hideCards || isFoul,
          );

          if (isFoul && i < cards.length) {
            final scatterIdx = _scatterBaseIndex(lineName) + i;
            final offset = _getScatterOffset(scatterIdx);
            final angle = _getScatterAngle(scatterIdx);
            slotWidget = TweenAnimationBuilder<double>(
              tween: Tween(begin: 0.0, end: 1.0),
              duration: const Duration(milliseconds: 500),
              curve: Curves.easeOut,
              builder: (context, t, child) {
                return Transform.translate(
                  offset: offset * t,
                  child: Transform.rotate(
                    angle: angle * t,
                    child: child,
                  ),
                );
              },
              child: slotWidget,
            );
          }

          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 2),
            child: Semantics(
              label: 'slot-$lineName-$i',
              child: slotWidget,
            ),
          );
        }),
      ],
    );

    // Level 1 (Shimmer): 미묘한 shimmer만
    if (celebLevel == 1) {
      lineWidget = lineWidget
          .animate(onPlay: (c) => c.forward())
          .shimmer(duration: 800.ms, color: Colors.amber.withValues(alpha: 0.4));
    }
    // Level 2 (Burst): 강한 scale bounce + amber glow 확산
    // Level 3 (Explosion): 골든 flash + 큰 scale bounce + shimmer
    if (celebLevel >= 2) {
      lineWidget = Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            decoration: BoxDecoration(
              boxShadow: [
                BoxShadow(
                  color: Colors.amber.withValues(
                      alpha: celebLevel == 3 ? 0.8 : 0.4),
                  blurRadius: celebLevel == 3 ? 24 : 14,
                  spreadRadius: celebLevel == 3 ? 6 : 3,
                ),
              ],
            ),
            child: lineWidget,
          )
              .animate(onPlay: (c) => c.forward())
              .scale(
                begin: Offset(celebLevel == 3 ? 1.12 : 1.08,
                    celebLevel == 3 ? 1.12 : 1.08),
                end: const Offset(1.0, 1.0),
                duration: 500.ms,
                curve: Curves.elasticOut,
              )
              .shimmer(
                duration: 800.ms,
                color: Colors.amber.withValues(alpha: 0.5),
              ),
          Positioned.fill(
            child: IgnorePointer(
              child: CelebrationOverlay(level: celebLevel),
            ),
          ),
        ],
      );
    }

    return Semantics(
      label: 'board-line-$lineName',
      child: lineWidget,
    );
  }

  Widget _buildRoyaltyBadge(List<ofc.Card> cards, String lineName) {
    final maxCards = lineName == 'top' ? 3 : 5;
    if (cards.length < maxCards) return const SizedBox.shrink();

    final result = evaluateHand(cards);
    final royalty = RoyaltyCalculator.calculate(lineName, cards);
    final handName = RoyaltyCalculator.handLabel(result.handType);

    Color badgeColor;
    if (royalty >= 10) {
      badgeColor = Colors.amber;
    } else if (royalty >= 2) {
      badgeColor = Colors.grey[300]!;
    } else {
      badgeColor = Colors.grey[600]!;
    }

    return Container(
      margin: const EdgeInsets.only(top: 2),
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
      decoration: BoxDecoration(
        color: badgeColor.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: badgeColor.withValues(alpha: 0.5), width: 0.5),
      ),
      child: Text(
        royalty > 0 ? '$handName +$royalty' : handName,
        style: TextStyle(
          fontSize: 8,
          fontWeight: royalty > 0 ? FontWeight.bold : FontWeight.normal,
          color: badgeColor,
        ),
      ),
    );
  }
}
