import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/game_provider.dart';
import '../../providers/score_detail_provider.dart';
import '../../providers/score_provider.dart';
import '../widgets/score_breakdown_widget.dart';
import '../widgets/score_panel_widget.dart';
import 'game_over_screen.dart';
import 'game_screen.dart';

class ScoreScreen extends ConsumerWidget {
  const ScoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final gameState = ref.watch(gameNotifierProvider);
    final scores = ref.watch(roundScoresProvider);
    final details = ref.watch(scoreDetailsProvider);

    final hasFL = gameState.players.any((p) => p.isInFantasyland);
    final hasMoreHands = gameState.handNumber < gameState.targetHands || hasFL;

    return Scaffold(
      backgroundColor: Colors.teal[900],
      appBar: AppBar(
        title: const Text('Round Results'),
        backgroundColor: Colors.teal[800],
        foregroundColor: Colors.white,
      ),
      body: SingleChildScrollView(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Hand progress indicator
                Text(
                  'Hand ${gameState.handNumber} / ${gameState.targetHands}',
                  style: TextStyle(
                    fontSize: 16,
                    color: Colors.teal[200],
                    fontWeight: FontWeight.w500,
                  ),
                )
                    .animate()
                    .fadeIn(duration: 300.ms)
                    .slideY(begin: -0.2, end: 0),
                const SizedBox(height: 8),
                if (hasFL)
                  Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.amber[700],
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.auto_awesome,
                            size: 16, color: Colors.white),
                        const SizedBox(width: 4),
                        Text(
                          '${gameState.players.where((p) => p.isInFantasyland).map((p) => p.name).join(", ")} enters Fantasyland!',
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 13,
                              fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                  )
                      .animate()
                      .fadeIn(duration: 400.ms, delay: 100.ms)
                      .shimmer(duration: 1200.ms, delay: 500.ms),
                const SizedBox(height: 8),
                if (scores != null)
                  ScorePanelWidget(scores: scores)
                      .animate()
                      .fadeIn(duration: 400.ms, delay: 200.ms)
                      .slideY(begin: 0.1, end: 0)
                else
                  ScorePanelWidget(
                    scores: {
                      for (final p in gameState.players) p.name: p.score,
                    },
                  )
                      .animate()
                      .fadeIn(duration: 400.ms, delay: 200.ms)
                      .slideY(begin: 0.1, end: 0),
                const SizedBox(height: 16),
                // Score breakdown details
                ...details.map((d) => Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: ScoreBreakdownWidget(
                        player1Name: d.player1Name,
                        player2Name: d.player2Name,
                        lineResults: [
                          LineResult(
                            lineName: 'Top',
                            player1Hand: d.topResult1,
                            player2Hand: d.topResult2,
                            player1Points: d.topWinner > 0 ? 1 : 0,
                            player2Points: d.topWinner < 0 ? 1 : 0,
                          ),
                          LineResult(
                            lineName: 'Mid',
                            player1Hand: d.midResult1,
                            player2Hand: d.midResult2,
                            player1Points: d.midWinner > 0 ? 1 : 0,
                            player2Points: d.midWinner < 0 ? 1 : 0,
                          ),
                          LineResult(
                            lineName: 'Bottom',
                            player1Hand: d.bottomResult1,
                            player2Hand: d.bottomResult2,
                            player1Points: d.bottomWinner > 0 ? 1 : 0,
                            player2Points: d.bottomWinner < 0 ? 1 : 0,
                          ),
                        ],
                        player1Royalty: d.player1Royalty,
                        player2Royalty: d.player2Royalty,
                        isScoop: d.isScoop,
                        player1Total: d.player1Total,
                        player2Total: d.player2Total,
                      ),
                    )),
                const SizedBox(height: 32),
                // Primary action button: Next Hand or View Results
                if (hasMoreHands)
                  ElevatedButton.icon(
                    onPressed: () {
                      ref.read(gameNotifierProvider.notifier).nextHand();
                      Navigator.of(context).pushReplacement(
                        MaterialPageRoute(
                            builder: (_) => const GameScreen()),
                      );
                    },
                    icon: const Icon(Icons.arrow_forward),
                    label: const Text('Next Hand',
                        style: TextStyle(fontSize: 16)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.green[600],
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 32, vertical: 12),
                    ),
                  )
                      .animate()
                      .fadeIn(duration: 300.ms, delay: 500.ms)
                      .scale(
                          begin: const Offset(0.9, 0.9),
                          end: const Offset(1, 1))
                else
                  ElevatedButton.icon(
                    onPressed: () {
                      Navigator.of(context).pushReplacement(
                        MaterialPageRoute(
                            builder: (_) => const GameOverScreen()),
                      );
                    },
                    icon: const Icon(Icons.emoji_events),
                    label: const Text('View Results',
                        style: TextStyle(fontSize: 16)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.amber[700],
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 32, vertical: 12),
                    ),
                  )
                      .animate()
                      .fadeIn(duration: 300.ms, delay: 500.ms)
                      .scale(
                          begin: const Offset(0.9, 0.9),
                          end: const Offset(1, 1)),
                const SizedBox(height: 12),
                // Secondary: Home button
                TextButton(
                  onPressed: () {
                    Navigator.of(context)
                        .popUntil((route) => route.isFirst);
                  },
                  child: Text(
                    'Home',
                    style:
                        TextStyle(fontSize: 14, color: Colors.teal[300]),
                  ),
                )
                    .animate()
                    .fadeIn(duration: 300.ms, delay: 700.ms),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
