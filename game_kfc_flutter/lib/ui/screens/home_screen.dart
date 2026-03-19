import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/online_game_provider.dart';
import '../../providers/settings_provider.dart';
import 'online_game_screen.dart';
import 'settings_screen.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  bool _navigatedToGame = false;
  int _selectedMaxPlayers = 2;

  @override
  Widget build(BuildContext context) {
    final onlineState = ref.watch(onlineGameNotifierProvider);

    ref.listen<OnlineState>(onlineGameNotifierProvider, (prev, next) {
      if (next.connectionState == OnlineConnectionState.playing &&
          !_navigatedToGame) {
        _navigatedToGame = true;
        Navigator.of(context)
            .push(
              MaterialPageRoute(builder: (_) => const OnlineGameScreen()),
            )
            .then((_) => _navigatedToGame = false);
      }
      if (next.connectionState == OnlineConnectionState.error &&
          next.errorMessage != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(next.errorMessage!),
            backgroundColor: Colors.red[700],
          ),
        );
      }
    });

    final isLoading = onlineState.connectionState ==
            OnlineConnectionState.connecting ||
        onlineState.connectionState == OnlineConnectionState.inLobby ||
        onlineState.connectionState == OnlineConnectionState.inRoom;

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
                SegmentedButton<int>(
                  segments: const [
                    ButtonSegment(value: 2, label: Text('2P')),
                    ButtonSegment(value: 3, label: Text('3P')),
                    ButtonSegment(value: 4, label: Text('4P')),
                  ],
                  selected: {_selectedMaxPlayers},
                  onSelectionChanged: (selected) {
                    setState(() => _selectedMaxPlayers = selected.first);
                  },
                  style: ButtonStyle(
                    foregroundColor: WidgetStateProperty.resolveWith((states) {
                      if (states.contains(WidgetState.selected)) {
                        return Colors.white;
                      }
                      return Colors.teal[200];
                    }),
                    backgroundColor: WidgetStateProperty.resolveWith((states) {
                      if (states.contains(WidgetState.selected)) {
                        return Colors.teal[600];
                      }
                      return Colors.teal[800];
                    }),
                  ),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: 240,
                  height: 56,
                  child: ElevatedButton.icon(
                    onPressed: isLoading ? null : () => _onQuickPlay(),
                    icon: const Icon(Icons.play_arrow),
                    label: const Text('Quick Play',
                        style: TextStyle(fontSize: 18)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.teal[600],
                      foregroundColor: Colors.white,
                      disabledBackgroundColor: Colors.teal[800],
                      disabledForegroundColor: Colors.white54,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (isLoading) _buildLoadingOverlay(onlineState),
        ],
      ),
    );
  }

  Widget _buildLoadingOverlay(OnlineState onlineState) {
    String statusText;
    switch (onlineState.connectionState) {
      case OnlineConnectionState.connecting:
        statusText = 'Connecting...';
        break;
      case OnlineConnectionState.inLobby:
        statusText = 'Finding room...';
        break;
      case OnlineConnectionState.inRoom:
        statusText =
            'Waiting for players... (${onlineState.connectedPlayers}/${onlineState.maxPlayers})';
        break;
      default:
        statusText = 'Loading...';
    }

    return Positioned.fill(
      child: Container(
        color: Colors.black.withValues(alpha: 0.7),
        child: Center(
          child: Card(
            color: Colors.teal[800],
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const CircularProgressIndicator(color: Colors.white),
                  const SizedBox(height: 24),
                  Text(
                    statusText,
                    style: const TextStyle(color: Colors.white, fontSize: 16),
                  ),
                  const SizedBox(height: 24),
                  TextButton(
                    onPressed: () {
                      ref.read(onlineGameNotifierProvider.notifier).disconnect();
                    },
                    child: const Text(
                      'Cancel',
                      style: TextStyle(color: Colors.white70, fontSize: 14),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _onQuickPlay() async {
    String? serverUrl;

    if (kIsWeb) {
      serverUrl = Uri.base.origin;
    } else {
      serverUrl = ref.read(settingsNotifierProvider).serverUrl;
      if (serverUrl.isEmpty) {
        serverUrl = await _showServerUrlDialog();
        if (serverUrl == null || serverUrl.isEmpty) return;
        ref.read(settingsNotifierProvider.notifier).setServerUrl(serverUrl);
      }
    }

    final playerName = ref.read(settingsNotifierProvider).playerName;
    ref
        .read(onlineGameNotifierProvider.notifier)
        .quickMatch(serverUrl, playerName, maxPlayers: _selectedMaxPlayers);
  }

  Future<String?> _showServerUrlDialog() async {
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Colors.teal[800],
        title: const Text('Server URL', style: TextStyle(color: Colors.white)),
        content: TextField(
          controller: controller,
          autofocus: true,
          style: const TextStyle(color: Colors.white),
          decoration: InputDecoration(
            hintText: 'https://your-server.com',
            hintStyle: TextStyle(color: Colors.teal[300]),
            enabledBorder: UnderlineInputBorder(
              borderSide: BorderSide(color: Colors.teal[400]!),
            ),
            focusedBorder: const UnderlineInputBorder(
              borderSide: BorderSide(color: Colors.white),
            ),
          ),
          onSubmitted: (value) => Navigator.of(ctx).pop(value.trim()),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child:
                const Text('Cancel', style: TextStyle(color: Colors.white70)),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(controller.text.trim()),
            child:
                const Text('Connect', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }
}
