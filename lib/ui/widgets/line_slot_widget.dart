import 'package:flutter/material.dart';
import '../../models/card.dart' as ofc;
import '../../models/card_drag_data.dart';
import 'card_widget.dart';

class LineSlotWidget extends StatefulWidget {
  final ofc.Card? card;
  final String lineName;
  final bool canAccept;
  final void Function(ofc.Card card, String? sourceLine)? onCardDropped;
  final bool isUndoable;
  final VoidCallback? onUndoTap;
  final bool faceDown;
  final bool isImpact;
  final int celebLevel; // 0=없음, 1/2/3=celebration level
  final VoidCallback? onEffectComplete;

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
    this.celebLevel = 0,
    this.onEffectComplete,
  });

  @override
  State<LineSlotWidget> createState() => _LineSlotWidgetState();
}

class _LineSlotWidgetState extends State<LineSlotWidget>
    with TickerProviderStateMixin {
  // Celebration 전용 controller
  AnimationController? _celebController;
  Animation<double>? _scaleAnim;
  Animation<double>? _glowAnim;

  // Impact 전용 controller
  AnimationController? _impactController;
  Animation<double>? _impactScaleAnim;
  Animation<double>? _impactGlowAnim;

  // 카드 등장 애니메이션 controller
  AnimationController? _enterController;
  Animation<double>? _enterScaleAnim;
  Animation<double>? _enterOpacityAnim;

  @override
  void initState() {
    super.initState();
    if (widget.card != null && widget.celebLevel == 0 && !widget.isImpact) {
      _startEnterAnimation();
    }
    if (widget.celebLevel > 0) {
      _startCelebration(widget.celebLevel);
    } else if (widget.isImpact) {
      _startImpact();
    }
  }

  @override
  void didUpdateWidget(LineSlotWidget old) {
    super.didUpdateWidget(old);

    // 새 카드가 배치됐을 때 등장 애니메이션
    if (old.card == null && widget.card != null) {
      if (widget.celebLevel == 0 && !widget.isImpact) {
        _startEnterAnimation();
      }
    }

    // celebration 전환
    if (old.celebLevel == 0 && widget.celebLevel > 0) {
      _stopEnterAnimation();
      _startCelebration(widget.celebLevel);
    } else if (old.celebLevel > 0 && widget.celebLevel == 0) {
      _stopCelebration();
    }

    // impact 전환
    if (!old.isImpact && widget.isImpact) {
      _stopEnterAnimation();
      _startImpact();
    } else if (old.isImpact && !widget.isImpact) {
      _stopImpact();
    }
  }

  // ── Celebration ──

  void _startCelebration(int level) {
    _celebController?.dispose();
    final dur = level >= 3 ? 1500 : level >= 2 ? 1200 : 800;
    _celebController = AnimationController(
      vsync: this,
      duration: Duration(milliseconds: dur),
    );
    final beginScale = level >= 3 ? 1.8 : level >= 2 ? 1.4 : 1.15;
    _scaleAnim = Tween<double>(begin: beginScale, end: 1.0)
        .chain(CurveTween(curve: Curves.elasticOut))
        .animate(_celebController!);
    final glowAlpha = level >= 3 ? 1.0 : level >= 2 ? 0.8 : 0.6;
    _glowAnim = TweenSequence<double>([
      TweenSequenceItem(tween: ConstantTween(glowAlpha), weight: 55),
      TweenSequenceItem(
        tween: Tween(begin: glowAlpha, end: 0.0)
            .chain(CurveTween(curve: Curves.easeOut)),
        weight: 45,
      ),
    ]).animate(_celebController!);

    _celebController!.addStatusListener((status) {
      if (status == AnimationStatus.completed) {
        widget.onEffectComplete?.call();
      }
    });
    _celebController!.addListener(() => setState(() {}));
    _celebController!.forward();
  }

  void _stopCelebration() {
    _celebController?.stop();
    _celebController?.dispose();
    _celebController = null;
    _scaleAnim = null;
    _glowAnim = null;
  }

  // ── Impact (Early Warning) ──

  void _startImpact() {
    _impactController?.dispose();
    _impactController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    );
    // slam: 2.0→0.85→1.0 (첫 200ms 축소, 나머지 복원)
    _impactScaleAnim = TweenSequence<double>([
      TweenSequenceItem(
        tween: Tween(begin: 2.0, end: 0.85)
            .chain(CurveTween(curve: Curves.easeOut)),
        weight: 17, // ~200ms
      ),
      TweenSequenceItem(
        tween: Tween(begin: 0.85, end: 1.0)
            .chain(CurveTween(curve: Curves.elasticOut)),
        weight: 33, // ~400ms
      ),
      TweenSequenceItem(tween: ConstantTween(1.0), weight: 50), // hold
    ]).animate(_impactController!);
    // glow: hold 600ms → fade 600ms
    _impactGlowAnim = TweenSequence<double>([
      TweenSequenceItem(tween: ConstantTween(0.9), weight: 50),
      TweenSequenceItem(
        tween: Tween(begin: 0.9, end: 0.0)
            .chain(CurveTween(curve: Curves.easeOut)),
        weight: 50,
      ),
    ]).animate(_impactController!);

    _impactController!.addStatusListener((status) {
      if (status == AnimationStatus.completed) {
        widget.onEffectComplete?.call();
      }
    });
    _impactController!.addListener(() => setState(() {}));
    _impactController!.forward();
  }

  void _stopImpact() {
    _impactController?.stop();
    _impactController?.dispose();
    _impactController = null;
    _impactScaleAnim = null;
    _impactGlowAnim = null;
  }

  // ── Enter (카드 등장) ──

  void _startEnterAnimation() {
    _enterController?.dispose();
    _enterController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 300),
    );
    _enterScaleAnim = Tween<double>(begin: 0.8, end: 1.0)
        .chain(CurveTween(curve: Curves.easeOutBack))
        .animate(_enterController!);
    _enterOpacityAnim = Tween<double>(begin: 0.0, end: 1.0)
        .chain(CurveTween(curve: Curves.easeIn))
        .animate(_enterController!);
    _enterController!.addListener(() => setState(() {}));
    _enterController!.forward();
  }

  void _stopEnterAnimation() {
    _enterController?.stop();
    _enterController?.dispose();
    _enterController = null;
    _enterScaleAnim = null;
    _enterOpacityAnim = null;
  }

  @override
  void dispose() {
    _celebController?.dispose();
    _impactController?.dispose();
    _enterController?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.card == null) return _buildEmptySlot();

    // ── 항상 같은 CardWidget — 절대 파괴하지 않음 ──
    Widget cardWidget = CardWidget(card: widget.card!, faceDown: widget.faceDown);

    // celebration 이펙트 적용
    final celebActive = _celebController != null && _celebController!.isAnimating;
    if (celebActive || (widget.celebLevel > 0 && _scaleAnim != null)) {
      final scale = _scaleAnim?.value ?? 1.0;
      final glow = _glowAnim?.value ?? 0.0;
      final level = widget.celebLevel;
      cardWidget = Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          boxShadow: glow > 0.01
              ? [
                  BoxShadow(
                    color: const Color(0xFFFFD700).withValues(alpha: glow),
                    blurRadius: level >= 3 ? 40.0 : level >= 2 ? 25.0 : 16.0,
                    spreadRadius: level >= 3 ? 12.0 : level >= 2 ? 8.0 : 4.0,
                  ),
                ]
              : null,
        ),
        child: Transform.scale(
          scale: scale,
          child: cardWidget,
        ),
      );
    }
    // impact 이펙트 적용
    else if (_impactController != null && _impactController!.isAnimating) {
      final scale = _impactScaleAnim?.value ?? 1.0;
      final glow = _impactGlowAnim?.value ?? 0.0;
      cardWidget = Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          boxShadow: glow > 0.01
              ? [
                  BoxShadow(
                    color: Colors.amber.withValues(alpha: glow),
                    blurRadius: 30,
                    spreadRadius: 10,
                  ),
                ]
              : null,
        ),
        child: Transform.scale(
          scale: scale,
          child: cardWidget,
        ),
      );
    }
    // 등장 애니메이션
    else if (_enterController != null && _enterController!.isAnimating) {
      final scale = _enterScaleAnim?.value ?? 1.0;
      final opacity = _enterOpacityAnim?.value ?? 1.0;
      cardWidget = Opacity(
        opacity: opacity.clamp(0.0, 1.0),
        child: Transform.scale(
          scale: scale,
          child: cardWidget,
        ),
      );
    }

    // undoable 래핑
    if (widget.isUndoable) {
      final undoableChild = Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: Colors.amber, width: 2),
        ),
        child: cardWidget,
      );
      return Draggable<CardDragData>(
        data: CardDragData(card: widget.card!, sourceLine: widget.lineName),
        feedback: Material(
          elevation: 8,
          borderRadius: BorderRadius.circular(8),
          child: Transform.scale(
            scale: 1.1,
            child: CardWidget(card: widget.card!),
          ),
        ),
        childWhenDragging: Opacity(
          opacity: 0.3,
          child: undoableChild,
        ),
        child: GestureDetector(
          onTap: widget.onUndoTap,
          child: undoableChild,
        ),
      );
    }
    return cardWidget;
  }

  Widget _buildEmptySlot() {
    return DragTarget<CardDragData>(
      onWillAcceptWithDetails: (details) {
        if (!widget.canAccept) return false;
        if (details.data.sourceLine == widget.lineName) return false;
        return true;
      },
      onAcceptWithDetails: (details) {
        widget.onCardDropped?.call(details.data.card, details.data.sourceLine);
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
                : (widget.canAccept ? Colors.grey[200] : Colors.grey[100]),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: isHovering
                  ? Colors.green
                  : (widget.canAccept ? Colors.grey[400]! : Colors.grey[300]!),
              width: isHovering ? 2 : 1,
            ),
          ),
          child: Center(
            child: Text(
              widget.canAccept ? '+' : '',
              style: TextStyle(
                color: widget.canAccept ? Colors.grey[500] : Colors.grey[300],
                fontSize: 18,
              ),
            ),
          ),
        );
      },
    );
  }
}
