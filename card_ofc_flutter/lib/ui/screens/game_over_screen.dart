import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/game_provider.dart';
import '../widgets/score_panel_widget.dart';
import 'game_screen.dart';

class GameOverScreen extends ConsumerWidget {
  const GameOverScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final gameState = ref.watch(gameNotifierProvider);

    // Find winner (highest score)
    final players = gameState.players;
    final winner = players.isNotEmpty
        ? players.reduce((a, b) => a.score >= b.score ? a : b)
        : null;

    final scores = {
      for (final p in players) p.name: p.score,
    };

    return Scaffold(
      backgroundColor: Colors.teal[900],
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Trophy icon
                Icon(Icons.emoji_events, size: 64, color: Colors.amber[400]),
                const SizedBox(height: 16),

                // Game Over title
                const Text(
                  'Game Over',
                  style: TextStyle(
                    fontSize: 32,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 12),

                // Winner announcement
                if (winner != null)
                  Text(
                    '${winner.name} Wins!',
                    style: TextStyle(
                      fontSize: 20,
                      color: Colors.amber[300],
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                const SizedBox(height: 24),

                // Score panel
                ScorePanelWidget(scores: scores),
                const SizedBox(height: 32),

                // Rematch button
                SizedBox(
                  width: 220,
                  height: 48,
                  child: ElevatedButton.icon(
                    onPressed: () {
                      final notifier = ref.read(gameNotifierProvider.notifier);
                      final currentNames =
                          players.map((p) => p.name).toList();
                      final withAI = currentNames.contains('AI');
                      final humanNames =
                          currentNames.where((n) => n != 'AI').toList();
                      notifier.startGame(humanNames, withAI: withAI, targetHands: gameState.targetHands);
                      Navigator.of(context).pushReplacement(
                        MaterialPageRoute(builder: (_) => const GameScreen()),
                      );
                    },
                    icon: const Icon(Icons.replay),
                    label:
                        const Text('Rematch', style: TextStyle(fontSize: 16)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.green[600],
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 12),

                // Home button
                SizedBox(
                  width: 220,
                  height: 48,
                  child: ElevatedButton.icon(
                    onPressed: () {
                      Navigator.of(context)
                          .popUntil((route) => route.isFirst);
                    },
                    icon: const Icon(Icons.home),
                    label: const Text('Home', style: TextStyle(fontSize: 16)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.teal[600],
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
