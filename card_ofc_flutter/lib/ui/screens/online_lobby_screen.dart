import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/online_game_provider.dart';
import 'online_game_screen.dart';

class OnlineLobbyScreen extends ConsumerStatefulWidget {
  const OnlineLobbyScreen({super.key});

  @override
  ConsumerState<OnlineLobbyScreen> createState() => _OnlineLobbyScreenState();
}

class _OnlineLobbyScreenState extends ConsumerState<OnlineLobbyScreen> {
  final _serverController = TextEditingController();
  final _nameController = TextEditingController(text: 'Player');
  final _roomNameController = TextEditingController();
  bool _isServerConnected = false;

  @override
  void initState() {
    super.initState();
    if (kIsWeb) {
      final origin = Uri.base.origin;
      _serverController.text = origin;
      // Web에서 같은 서버일 때 자동 연결
      WidgetsBinding.instance.addPostFrameCallback((_) => _connectToServer());
    }
  }

  @override
  void dispose() {
    _serverController.dispose();
    _nameController.dispose();
    _roomNameController.dispose();
    super.dispose();
  }

  String get _serverUrl {
    final text = _serverController.text.trim();
    if (text.startsWith('http://') || text.startsWith('https://')) {
      return text;
    }
    return 'http://$text';
  }

  void _connectToServer() {
    final notifier = ref.read(onlineGameNotifierProvider.notifier);
    notifier.setServer(_serverUrl);
    setState(() => _isServerConnected = true);
  }

  Future<void> _createRoom() async {
    final roomName = await showDialog<String>(
      context: context,
      builder: (ctx) {
        _roomNameController.text =
            "${_nameController.text.trim()}'s Room";
        return AlertDialog(
          title: const Text('Create Room'),
          content: TextField(
            controller: _roomNameController,
            decoration: const InputDecoration(
              labelText: 'Room Name',
              border: OutlineInputBorder(),
            ),
            autofocus: true,
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () =>
                  Navigator.pop(ctx, _roomNameController.text.trim()),
              child: const Text('Create'),
            ),
          ],
        );
      },
    );
    if (roomName == null || roomName.isEmpty) return;

    final notifier = ref.read(onlineGameNotifierProvider.notifier);
    final roomId = await notifier.createRoom(roomName);
    if (roomId != null) {
      final playerName = _nameController.text.trim().isEmpty
          ? 'Player'
          : _nameController.text.trim();
      await notifier.joinRoom(roomId, playerName);
    }
  }

  Future<void> _joinRoom(String roomId) async {
    final notifier = ref.read(onlineGameNotifierProvider.notifier);
    final playerName = _nameController.text.trim().isEmpty
        ? 'Player'
        : _nameController.text.trim();
    await notifier.joinRoom(roomId, playerName);
  }

  @override
  Widget build(BuildContext context) {
    final onlineState = ref.watch(onlineGameNotifierProvider);

    // gameStart 수신 시 OnlineGameScreen으로 이동
    ref.listen(onlineGameNotifierProvider, (prev, next) {
      if (next.connectionState == OnlineConnectionState.playing &&
          prev?.connectionState != OnlineConnectionState.playing) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const OnlineGameScreen()),
        );
      }
    });

    final isInRoom =
        onlineState.connectionState == OnlineConnectionState.inRoom;
    final isConnecting =
        onlineState.connectionState == OnlineConnectionState.connecting;
    final hasError =
        onlineState.connectionState == OnlineConnectionState.error;

    return Scaffold(
      backgroundColor: Colors.teal[900],
      appBar: AppBar(
        title: const Text('Online Play'),
        backgroundColor: Colors.teal[800],
        foregroundColor: Colors.white,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () {
            ref.read(onlineGameNotifierProvider.notifier).disconnect();
            Navigator.of(context).pop();
          },
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Player name
            TextField(
              controller: _nameController,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                labelText: 'Your Name',
                labelStyle: TextStyle(color: Colors.teal[300]),
                border: const OutlineInputBorder(),
                enabledBorder: OutlineInputBorder(
                  borderSide: BorderSide(color: Colors.teal[400]!),
                ),
                focusedBorder: OutlineInputBorder(
                  borderSide: BorderSide(color: Colors.teal[200]!),
                ),
              ),
            ),
            const SizedBox(height: 12),

            // Server URL + Connect
            if (!_isServerConnected || hasError) ...[
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _serverController,
                      style: const TextStyle(color: Colors.white),
                      decoration: InputDecoration(
                        hintText: 'Server address (e.g., game.example.com:8000)',
                        hintStyle: TextStyle(color: Colors.teal[300]),
                        border: const OutlineInputBorder(),
                        enabledBorder: OutlineInputBorder(
                          borderSide:
                              BorderSide(color: Colors.teal[400]!),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderSide:
                              BorderSide(color: Colors.teal[200]!),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  ElevatedButton(
                    onPressed: _connectToServer,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.teal[600],
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 20, vertical: 16),
                    ),
                    child: const Text('Connect'),
                  ),
                ],
              ),
            ],

            // Error message
            if (hasError && onlineState.errorMessage != null) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.red[900],
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.error_outline, color: Colors.white),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        onlineState.errorMessage!,
                        style: const TextStyle(color: Colors.white),
                      ),
                    ),
                  ],
                ),
              ),
            ],

            const SizedBox(height: 16),

            // Waiting in room
            if (isInRoom) ...[
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.teal[700],
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  children: [
                    const Icon(Icons.hourglass_top,
                        color: Colors.white, size: 48),
                    const SizedBox(height: 12),
                    const Text(
                      'Waiting for opponent...',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Room: ${onlineState.roomId ?? ""}',
                      style: TextStyle(color: Colors.teal[200]),
                    ),
                    if (onlineState.connectedPlayers > 0) ...[
                      const SizedBox(height: 8),
                      Text(
                        'Players: ${onlineState.connectedPlayers}',
                        style: const TextStyle(
                            color: Colors.white, fontSize: 16),
                      ),
                    ],
                    const SizedBox(height: 16),
                    const CircularProgressIndicator(color: Colors.white),
                  ],
                ),
              ),
            ],

            // Connecting
            if (isConnecting) ...[
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.teal[700],
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Column(
                  children: [
                    CircularProgressIndicator(color: Colors.white),
                    SizedBox(height: 12),
                    Text(
                      'Connecting...',
                      style:
                          TextStyle(color: Colors.white, fontSize: 16),
                    ),
                  ],
                ),
              ),
            ],

            // Room list (when connected to server and not in a room)
            if (_isServerConnected &&
                !isInRoom &&
                !isConnecting &&
                !hasError) ...[
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: _createRoom,
                      icon: const Icon(Icons.add),
                      label: const Text('Create Room'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.teal[600],
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.all(14),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton(
                    onPressed: () => ref
                        .read(onlineGameNotifierProvider.notifier)
                        .refreshRooms(),
                    icon: const Icon(Icons.refresh, color: Colors.white),
                    tooltip: 'Refresh',
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Text(
                    'Available Rooms',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: Colors.teal[200],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: Colors.green[700],
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.circle,
                            color: Colors.greenAccent, size: 8),
                        SizedBox(width: 4),
                        Text('Live',
                            style: TextStyle(
                                color: Colors.white, fontSize: 12)),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Expanded(
                child: onlineState.rooms.isEmpty
                    ? Center(
                        child: Text(
                          'No rooms available.\nCreate one or refresh.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Colors.teal[300]),
                        ),
                      )
                    : ListView.builder(
                        itemCount: onlineState.rooms.length,
                        itemBuilder: (context, index) {
                          final room = onlineState.rooms[index];
                          final roomId = room['id'] as String? ?? '';
                          final roomName =
                              room['name'] as String? ?? 'Room';
                          final players =
                              room['players'] as List<dynamic>? ?? [];
                          final maxPlayers =
                              room['max_players'] as int? ?? 2;
                          final status =
                              room['status'] as String? ?? 'waiting';
                          final isFull =
                              players.length >= maxPlayers;

                          return Card(
                            color: Colors.teal[700],
                            child: ListTile(
                              leading: Icon(
                                status == 'waiting'
                                    ? Icons.meeting_room
                                    : Icons.lock,
                                color: Colors.white,
                              ),
                              title: Text(
                                roomName,
                                style: const TextStyle(
                                    color: Colors.white),
                              ),
                              subtitle: Text(
                                '${players.length}/$maxPlayers players - $status',
                                style:
                                    TextStyle(color: Colors.teal[200]),
                              ),
                              trailing: ElevatedButton(
                                onPressed: (status == 'waiting' &&
                                        !isFull)
                                    ? () => _joinRoom(roomId)
                                    : null,
                                child: const Text('Join'),
                              ),
                            ),
                          );
                        },
                      ),
              ),
            ] else if (!_isServerConnected && !hasError)
              const Spacer(),
          ],
        ),
      ),
    );
  }
}
