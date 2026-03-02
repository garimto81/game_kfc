import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/game_provider.dart';
import 'game_screen.dart';
import 'online_lobby_screen.dart';
import 'settings_screen.dart';
import 'tutorial_screen.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  int _selectedHands = 5;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.teal[900],
      body: Stack(
        children: [
          Align(
            alignment: Alignment.topRight,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: IconButton(
                icon: const Icon(Icons.settings, color: Colors.white),
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const SettingsScreen()),
                ),
              ),
            ),
          ),
          Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
            const Text(
              'OFC Pineapple',
              style: TextStyle(
                fontSize: 36,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Open Face Chinese Poker',
              style: TextStyle(fontSize: 16, color: Colors.teal[200]),
            ),
            const SizedBox(height: 32),
            // Hand count selector
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [3, 5, 10].map((count) {
                final isSelected = _selectedHands == count;
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: ChoiceChip(
                    label: Text('$count'),
                    selected: isSelected,
                    onSelected: (_) => setState(() => _selectedHands = count),
                    selectedColor: Colors.teal[400],
                    labelStyle: TextStyle(
                      color: isSelected ? Colors.white : Colors.teal[200],
                    ),
                  ),
                );
              }).toList(),
            ),
            Text('Hands',
                style: TextStyle(color: Colors.teal[300], fontSize: 12)),
            const SizedBox(height: 16),
            _buildMenuButton(
              context: context,
              label: 'VS AI',
              icon: Icons.smart_toy,
              onPressed: () {
                ref
                    .read(gameNotifierProvider.notifier)
                    .startGame(['You'],
                        withAI: true, targetHands: _selectedHands);
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const GameScreen()),
                );
              },
            ),
            const SizedBox(height: 16),
            _buildMenuButton(
              context: context,
              label: '2P Local',
              icon: Icons.people,
              onPressed: () {
                ref
                    .read(gameNotifierProvider.notifier)
                    .startGame(['Player 1', 'Player 2'],
                        targetHands: _selectedHands);
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const GameScreen()),
                );
              },
            ),
            const SizedBox(height: 16),
            _buildMenuButton(
              context: context,
              label: 'Online Play',
              icon: Icons.public,
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute(
                      builder: (_) => const OnlineLobbyScreen()),
                );
              },
            ),
            const SizedBox(height: 16),
            _buildMenuButton(
              context: context,
              label: 'How to Play',
              icon: Icons.help_outline,
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute(
                      builder: (_) => const TutorialScreen()),
                );
              },
            ),
          ],
        ),
      ),
        ],
      ),
    );
  }

  Widget _buildMenuButton({
    required BuildContext context,
    required String label,
    required IconData icon,
    required VoidCallback onPressed,
  }) {
    return SizedBox(
      width: 220,
      height: 48,
      child: ElevatedButton.icon(
        onPressed: onPressed,
        icon: Icon(icon),
        label: Text(label, style: const TextStyle(fontSize: 16)),
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.teal[600],
          foregroundColor: Colors.white,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
    );
  }
}
