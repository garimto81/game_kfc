import 'dart:math';
import 'package:flutter/material.dart';

class CelebrationOverlay extends StatefulWidget {
  final int level; // 2 또는 3

  const CelebrationOverlay({
    super.key,
    required this.level,
  });

  @override
  State<CelebrationOverlay> createState() => _CelebrationOverlayState();
}

class _CelebrationOverlayState extends State<CelebrationOverlay>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final List<_Ring> _rings;
  late final List<_Sparkle> _sparkles;

  @override
  void initState() {
    super.initState();
    final isLevel3 = widget.level >= 3;
    final duration = isLevel3 ? 1000 : 800;

    _controller = AnimationController(
      vsync: this,
      duration: Duration(milliseconds: duration),
    );

    _rings = _buildRings(isLevel3);
    _sparkles = _buildSparkles(isLevel3);

    _controller.addListener(() {
      setState(() {});
    });

    _controller.forward();
  }

  List<_Ring> _buildRings(bool isLevel3) {
    if (isLevel3) {
      return [
        _Ring(maxRadius: 175, startBorderWidth: 4, delayFraction: 0.0),
        _Ring(maxRadius: 175, startBorderWidth: 4, delayFraction: 0.15),
      ];
    }
    return [
      _Ring(maxRadius: 140, startBorderWidth: 4, delayFraction: 0.0),
    ];
  }

  List<_Sparkle> _buildSparkles(bool isLevel3) {
    final random = Random();
    final count = isLevel3 ? 30 : 15;
    final minDist = isLevel3 ? 60.0 : 40.0;
    final maxDist = isLevel3 ? 140.0 : 120.0;
    final minSize = isLevel3 ? 3.0 : 2.0;
    final maxSize = isLevel3 ? 7.0 : 6.0;
    const colors = [Color(0xFFFFD700), Color(0xFFFFFFFF), Color(0xFFFFB300)];

    return List.generate(count, (_) {
      final angle = random.nextDouble() * 2 * pi;
      final distance = minDist + random.nextDouble() * (maxDist - minDist);
      final size = minSize + random.nextDouble() * (maxSize - minSize);
      final color = colors[random.nextInt(colors.length)];
      return _Sparkle(
        angle: angle,
        maxDistance: distance,
        size: size,
        color: color,
      );
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: RepaintBoundary(
        child: CustomPaint(
          painter: _CelebrationPainter(
            progress: _controller.value,
            rings: _rings,
            sparkles: _sparkles,
          ),
          size: Size.infinite,
        ),
      ),
    );
  }
}

class _Ring {
  final double maxRadius;
  final double startBorderWidth;
  final double delayFraction;

  const _Ring({
    required this.maxRadius,
    required this.startBorderWidth,
    required this.delayFraction,
  });
}

class _Sparkle {
  final double angle;
  final double maxDistance;
  final double size;
  final Color color;

  const _Sparkle({
    required this.angle,
    required this.maxDistance,
    required this.size,
    required this.color,
  });
}

class _CelebrationPainter extends CustomPainter {
  final double progress;
  final List<_Ring> rings;
  final List<_Sparkle> sparkles;

  _CelebrationPainter({
    required this.progress,
    required this.rings,
    required this.sparkles,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);

    // Draw rings
    for (final ring in rings) {
      final localProgress =
          ((progress - ring.delayFraction) / (1.0 - ring.delayFraction))
              .clamp(0.0, 1.0);
      if (localProgress <= 0) continue;

      final radius = ring.maxRadius * localProgress;
      final borderWidth =
          ring.startBorderWidth * (1.0 - localProgress) + 1.0 * localProgress;
      final opacity = (1.0 - localProgress).clamp(0.0, 1.0);

      final paint = Paint()
        ..color = const Color(0xFFFFD700).withValues(alpha: opacity)
        ..style = PaintingStyle.stroke
        ..strokeWidth = borderWidth;

      canvas.drawCircle(center, radius, paint);
    }

    // Draw sparkles
    for (final sparkle in sparkles) {
      final distance = sparkle.maxDistance * progress;
      final opacity = (1.0 - progress).clamp(0.0, 1.0);
      if (opacity <= 0) continue;

      final dx = center.dx + cos(sparkle.angle) * distance;
      final dy = center.dy + sin(sparkle.angle) * distance;

      final paint = Paint()
        ..color = sparkle.color.withValues(alpha: opacity)
        ..style = PaintingStyle.fill;

      canvas.drawCircle(Offset(dx, dy), sparkle.size, paint);
    }
  }

  @override
  bool shouldRepaint(_CelebrationPainter oldDelegate) {
    return oldDelegate.progress != progress;
  }
}
