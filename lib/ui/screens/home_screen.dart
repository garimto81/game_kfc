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

class _HomeScreenState extends ConsumerState<HomeScreen>
    with WidgetsBindingObserver {
  bool _navigatedToGame = false;
  bool _lobbyConnected = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _autoConnect();
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    super.didChangeAppLifecycleState(state);
    if (state == AppLifecycleState.resumed && !_navigatedToGame) {
      // 포그라운드 복귀 시 로비 재연결
      _lobbyConnected = false;
      _autoConnect();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  Future<void> _autoConnect() async {
    if (_lobbyConnected) return;

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

    _lobbyConnected = true;
    ref.read(onlineGameNotifierProvider.notifier).connectToLobby(serverUrl);
  }

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
            .then((_) {
          _navigatedToGame = false;
          // 게임에서 돌아오면 로비 재연결
          _lobbyConnected = false;
          _autoConnect();
        });
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
      // 연결이 끊어졌으면 재연결 플래그 리셋
      if (next.connectionState == OnlineConnectionState.disconnected) {
        _lobbyConnected = false;
      }
    });

    final isInRoom =
        onlineState.connectionState == OnlineConnectionState.inRoom ||
            onlineState.connectionState == OnlineConnectionState.connecting;

    return Scaffold(
      backgroundColor: Colors.teal[900],
      body: Stack(
        children: [
          Column(
            children: [
              // Top bar
              Padding(
                padding: const EdgeInsets.only(top: 16, left: 16, right: 16),
                child: Row(
                  children: [
                    IconButton(
                      icon: const Icon(Icons.settings, color: Colors.white),
                      onPressed: () => Navigator.of(context).push(
                        MaterialPageRoute(
                            builder: (_) => const SettingsScreen()),
                      ),
                    ),
                    const Expanded(
                      child: Text(
                        'OFC Pineapple',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                    ),
                    const SizedBox(width: 48), // Balance settings icon
                  ],
                ),
              ),
              const SizedBox(height: 8),
              // Room list header
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Row(
                  children: [
                    Text(
                      'Game Rooms',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                        color: Colors.teal[100],
                      ),
                    ),
                    const Spacer(),
                    if (onlineState.connectionState ==
                        OnlineConnectionState.inLobby)
                      TextButton.icon(
                        onPressed: () => _showCreateRoomDialog(),
                        icon: const Icon(Icons.add, size: 16, color: Colors.white),
                        label: const Text('Create', style: TextStyle(color: Colors.white, fontSize: 13)),
                        style: TextButton.styleFrom(
                          backgroundColor: Colors.teal[600],
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                      ),
                    const SizedBox(width: 8),
                    if (onlineState.connectionState ==
                        OnlineConnectionState.inLobby)
                      Icon(Icons.circle, size: 8, color: Colors.green[400])
                    else
                      Icon(Icons.circle, size: 8, color: Colors.grey[600]),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              // Room list
              Expanded(
                child: _buildRoomList(onlineState),
              ),
            ],
          ),
          if (isInRoom) _buildLoadingOverlay(onlineState),
        ],
      ),
    );
  }

  Widget _buildRoomList(OnlineState onlineState) {
    if (onlineState.connectionState == OnlineConnectionState.disconnected ||
        onlineState.connectionState == OnlineConnectionState.error) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Not connected',
              style: TextStyle(color: Colors.teal[300], fontSize: 16),
            ),
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: () {
                _lobbyConnected = false;
                _autoConnect();
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.teal[600],
                foregroundColor: Colors.white,
              ),
              child: const Text('Connect'),
            ),
          ],
        ),
      );
    }

    final rooms = onlineState.rooms;
    if (rooms.isEmpty) {
      return Center(
        child: Text(
          'No rooms available',
          style: TextStyle(color: Colors.teal[300], fontSize: 16),
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      itemCount: rooms.length,
      itemBuilder: (context, index) {
        final room = rooms[index];
        return _buildRoomCard(room);
      },
    );
  }

  Widget _buildRoomCard(Map<String, dynamic> room) {
    final roomId = room['id'] as String? ?? '';
    final name = room['name'] as String? ?? 'Game Room';
    final playerCount = room['playerCount'] as int? ?? 0;
    final maxPlayers = room['maxPlayers'] as int? ?? 6;
    final turnTimeLimit = room['turnTimeLimit'] as int? ?? 0;
    final status = room['status'] as String? ?? 'waiting';
    final isWaiting = status == 'waiting';

    final subtitle = turnTimeLimit > 0
        ? '$playerCount/$maxPlayers players · ${turnTimeLimit}s'
        : '$playerCount/$maxPlayers players';

    return Card(
      color: isWaiting ? Colors.teal[800] : Colors.teal[900],
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      child: ListTile(
        title: Text(
          name,
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w600,
          ),
        ),
        subtitle: Text(
          subtitle,
          style: TextStyle(color: Colors.teal[300], fontSize: 13),
        ),
        trailing: isWaiting
            ? ElevatedButton(
                onPressed: () => _onJoinRoom(roomId),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.teal[600],
                  foregroundColor: Colors.white,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8)),
                ),
                child: const Text('Join'),
              )
            : Text(
                '($status)',
                style: TextStyle(color: Colors.grey[500], fontSize: 13),
              ),
      ),
    );
  }

  void _onJoinRoom(String roomId) async {
    final currentName = ref.read(settingsNotifierProvider).playerName;
    final name = await _showNameInputDialog(currentName);
    if (name == null || name.isEmpty || !mounted) return;
    ref.read(settingsNotifierProvider.notifier).setPlayerName(name);
    ref.read(onlineGameNotifierProvider.notifier).joinRoom(roomId, name);
  }

  Widget _buildLoadingOverlay(OnlineState onlineState) {
    String statusText;
    switch (onlineState.connectionState) {
      case OnlineConnectionState.connecting:
        statusText = 'Connecting...';
        break;
      case OnlineConnectionState.inRoom:
        statusText =
            'Waiting for players... (${onlineState.connectedPlayers})';
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
              padding:
                  const EdgeInsets.symmetric(horizontal: 40, vertical: 32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (onlineState.connectionState !=
                      OnlineConnectionState.inRoom)
                    const CircularProgressIndicator(color: Colors.white),
                  if (onlineState.connectionState !=
                      OnlineConnectionState.inRoom)
                    const SizedBox(height: 24),
                  Text(
                    statusText,
                    style:
                        const TextStyle(color: Colors.white, fontSize: 16),
                  ),
                  if (onlineState.connectionState ==
                      OnlineConnectionState.inRoom) ...[
                    const SizedBox(height: 16),
                    ...onlineState.playerNames.map((name) => Padding(
                          padding: const EdgeInsets.symmetric(vertical: 2),
                          child: Text(
                            name,
                            style: TextStyle(
                                color: Colors.teal[200], fontSize: 14),
                          ),
                        )),
                    const SizedBox(height: 16),
                    if (onlineState.isHost)
                      ElevatedButton(
                        onPressed: onlineState.connectedPlayers >= 2
                            ? () => ref
                                .read(onlineGameNotifierProvider.notifier)
                                .startGame()
                            : null,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.teal[600],
                          foregroundColor: Colors.white,
                          disabledBackgroundColor: Colors.teal[800],
                          disabledForegroundColor: Colors.white54,
                        ),
                        child: const Text('Start Game'),
                      )
                    else
                      Text(
                        'Waiting for host to start...',
                        style:
                            TextStyle(color: Colors.teal[300], fontSize: 13),
                      ),
                  ],
                  // Dealer card reveal
                  if (onlineState.dealerCards != null) ...[
                    const SizedBox(height: 16),
                    Text('Dealer Selection', style: TextStyle(color: Colors.amber[400], fontSize: 16, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      children: onlineState.dealerCards!.entries.map((e) {
                        final isDealer = e.key == onlineState.dealerButtonId;
                        final card = e.value as Map<String, dynamic>;
                        final rankName = card['rankName'] as String? ?? '';
                        final suitName = card['suitName'] as String? ?? '';
                        final playersMap = onlineState.gameState?['players'] as Map<String, dynamic>?;
                        final playerName = (playersMap?[e.key] as Map<String, dynamic>?)?['name'] as String? ?? '???';
                        return Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(playerName, style: const TextStyle(color: Colors.white, fontSize: 12)),
                            Container(
                              padding: const EdgeInsets.all(8),
                              decoration: BoxDecoration(
                                color: isDealer ? Colors.amber[700] : Colors.teal[700],
                                borderRadius: BorderRadius.circular(8),
                                border: isDealer ? Border.all(color: Colors.amber, width: 2) : null,
                              ),
                              child: Text('${rankName.toUpperCase()} ${_suitSymbol(suitName)}',
                                style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold)),
                            ),
                            if (isDealer) Text('D', style: TextStyle(color: Colors.amber[400], fontSize: 12, fontWeight: FontWeight.bold)),
                          ],
                        );
                      }).toList(),
                    ),
                  ],
                  // Play/Fold selection UI
                  if (onlineState.isPlayOrFoldPhase) ...[
                    const SizedBox(height: 16),
                    Text('Play: ${onlineState.playOrFoldPlayCount}/4  Fold: ${onlineState.playOrFoldFoldCount}',
                      style: TextStyle(color: Colors.teal[300], fontSize: 14)),
                    if (onlineState.isMyPlayOrFoldTurn) ...[
                      const SizedBox(height: 8),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          ElevatedButton(
                            onPressed: () => ref.read(onlineGameNotifierProvider.notifier).sendPlayOrFold('play'),
                            style: ElevatedButton.styleFrom(backgroundColor: Colors.green[700]),
                            child: const Text('Play', style: TextStyle(color: Colors.white)),
                          ),
                          const SizedBox(width: 16),
                          ElevatedButton(
                            onPressed: () => ref.read(onlineGameNotifierProvider.notifier).sendPlayOrFold('fold'),
                            style: ElevatedButton.styleFrom(backgroundColor: Colors.red[700]),
                            child: const Text('Fold', style: TextStyle(color: Colors.white)),
                          ),
                        ],
                      ),
                    ] else ...[
                      const SizedBox(height: 8),
                      Text('Waiting for other players...', style: TextStyle(color: Colors.teal[400])),
                    ],
                  ],
                  const SizedBox(height: 24),
                  TextButton(
                    onPressed: () {
                      ref
                          .read(onlineGameNotifierProvider.notifier)
                          .disconnect();
                      _lobbyConnected = false;
                      _autoConnect();
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

  void _showCreateRoomDialog() {
    final nameController = TextEditingController(text: 'Game Room');
    final playerNameController = TextEditingController(
      text: ref.read(settingsNotifierProvider).playerName,
    );
    int selectedMaxPlayers = 6;
    int selectedTimeLimit = 0;

    final timeLimitOptions = <int, String>{
      0: 'No Limit',
      15: '15s',
      20: '20s',
      25: '25s',
      30: '30s',
      45: '45s',
      60: '60s',
      90: '90s',
      120: '120s',
    };

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          backgroundColor: Colors.teal[800],
          title: const Text('Create Room', style: TextStyle(color: Colors.white)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(
                controller: playerNameController,
                style: const TextStyle(color: Colors.white),
                maxLength: 20,
                decoration: InputDecoration(
                  labelText: 'Player Name',
                  labelStyle: TextStyle(color: Colors.teal[300]),
                  counterStyle: TextStyle(color: Colors.teal[400]),
                  enabledBorder: UnderlineInputBorder(
                    borderSide: BorderSide(color: Colors.teal[400]!),
                  ),
                  focusedBorder: const UnderlineInputBorder(
                    borderSide: BorderSide(color: Colors.white),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: nameController,
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(
                  labelText: 'Room Name',
                  labelStyle: TextStyle(color: Colors.teal[300]),
                  enabledBorder: UnderlineInputBorder(
                    borderSide: BorderSide(color: Colors.teal[400]!),
                  ),
                  focusedBorder: const UnderlineInputBorder(
                    borderSide: BorderSide(color: Colors.white),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Text('Players: ', style: TextStyle(color: Colors.teal[200], fontSize: 14)),
                  const SizedBox(width: 8),
                  DropdownButton<int>(
                    value: selectedMaxPlayers,
                    dropdownColor: Colors.teal[700],
                    style: const TextStyle(color: Colors.white),
                    items: [2, 3, 4, 5, 6].map((v) => DropdownMenuItem(
                      value: v,
                      child: Text('$v'),
                    )).toList(),
                    onChanged: (v) {
                      if (v != null) setDialogState(() => selectedMaxPlayers = v);
                    },
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Text('Time Limit: ', style: TextStyle(color: Colors.teal[200], fontSize: 14)),
                  const SizedBox(width: 8),
                  DropdownButton<int>(
                    value: selectedTimeLimit,
                    dropdownColor: Colors.teal[700],
                    style: const TextStyle(color: Colors.white),
                    items: timeLimitOptions.entries.map((e) => DropdownMenuItem(
                      value: e.key,
                      child: Text(e.value),
                    )).toList(),
                    onChanged: (v) {
                      if (v != null) setDialogState(() => selectedTimeLimit = v);
                    },
                  ),
                ],
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('Cancel', style: TextStyle(color: Colors.white70)),
            ),
            ElevatedButton(
              onPressed: () async {
                final name = nameController.text.trim();
                final pName = playerNameController.text.trim();
                if (name.isEmpty || pName.isEmpty) return;
                ref.read(settingsNotifierProvider.notifier).setPlayerName(pName);
                final notifier = ref.read(onlineGameNotifierProvider.notifier);
                final roomId = await notifier.createRoom(
                  name,
                  maxPlayers: selectedMaxPlayers,
                  turnTimeLimit: selectedTimeLimit,
                );
                if (!ctx.mounted) return;
                Navigator.of(ctx).pop();
                if (roomId != null && mounted) {
                  notifier.joinRoom(roomId, pName);
                }
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.teal[600],
                foregroundColor: Colors.white,
              ),
              child: const Text('Create'),
            ),
          ],
        ),
      ),
    );
  }

  Future<String?> _showNameInputDialog(String currentName) async {
    final controller = TextEditingController(text: currentName);
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Colors.teal[800],
        title: const Text('Enter Name',
            style: TextStyle(color: Colors.white)),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLength: 20,
          style: const TextStyle(color: Colors.white),
          decoration: InputDecoration(
            hintText: 'Your name',
            hintStyle: TextStyle(color: Colors.teal[300]),
            counterStyle: TextStyle(color: Colors.teal[400]),
            enabledBorder: UnderlineInputBorder(
              borderSide: BorderSide(color: Colors.teal[400]!),
            ),
            focusedBorder: const UnderlineInputBorder(
              borderSide: BorderSide(color: Colors.white),
            ),
          ),
          onSubmitted: (value) {
            final name = value.trim();
            if (name.isNotEmpty) Navigator.of(ctx).pop(name);
          },
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel',
                style: TextStyle(color: Colors.white70)),
          ),
          ElevatedButton(
            onPressed: () {
              final name = controller.text.trim();
              if (name.isNotEmpty) Navigator.of(ctx).pop(name);
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.teal[600],
              foregroundColor: Colors.white,
            ),
            child: const Text('Join'),
          ),
        ],
      ),
    );
  }

  Future<String?> _showServerUrlDialog() async {
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Colors.teal[800],
        title:
            const Text('Server URL', style: TextStyle(color: Colors.white)),
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
            child: const Text('Cancel',
                style: TextStyle(color: Colors.white70)),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(controller.text.trim()),
            child: const Text('Connect',
                style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  String _suitSymbol(String suitName) {
    switch (suitName) {
      case 'spade': return '\u2660';
      case 'heart': return '\u2665';
      case 'diamond': return '\u2666';
      case 'club': return '\u2663';
      default: return '';
    }
  }
}
