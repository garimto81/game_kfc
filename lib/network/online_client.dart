import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:http/http.dart' as http;
import 'package:web_socket_channel/web_socket_channel.dart';

class OnlineClient {
  final String _serverUrl;
  WebSocketChannel? _channel;
  String? playerId;
  String? sessionToken;
  String? currentRoomId;
  bool get isConnected => _channel != null;
  Timer? _heartbeatTimer;
  void Function()? onUnexpectedDisconnect;
  bool _intentionalDisconnect = false;
  int _missedPongs = 0;

  final _messageController =
      StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get messageStream => _messageController.stream;

  // Lobby WebSocket
  WebSocketChannel? _lobbyChannel;
  Timer? _lobbyHeartbeatTimer;
  final _lobbyMessageController =
      StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get lobbyMessages =>
      _lobbyMessageController.stream;

  OnlineClient(this._serverUrl);

  /// REST: 방 목록 조회
  Future<List<Map<String, dynamic>>> listRooms() async {
    final uri = Uri.parse('$_serverUrl/api/rooms');
    final response = await http.get(uri).timeout(const Duration(seconds: 10));
    if (response.statusCode != 200) {
      throw Exception('Failed to list rooms: ${response.statusCode}');
    }
    final list = jsonDecode(response.body) as List<dynamic>;
    return list.cast<Map<String, dynamic>>();
  }

  /// REST: 방 생성
  Future<Map<String, dynamic>> createRoom(String name,
      {int maxPlayers = 6, int turnTimeLimit = 0}) async {
    final uri = Uri.parse('$_serverUrl/api/rooms');
    final response = await http.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'name': name,
        'max_players': maxPlayers,
        'turn_time_limit': turnTimeLimit,
      }),
    ).timeout(const Duration(seconds: 10));
    if (response.statusCode != 200 && response.statusCode != 201) {
      throw Exception('Failed to create room: ${response.statusCode}');
    }
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  /// REST: Quick Match — 서버가 대기 방 배정 또는 자동 생성
  Future<String> quickMatchRequest() async {
    final uri = Uri.parse('$_serverUrl/api/quickmatch');
    final response = await http.post(uri).timeout(const Duration(seconds: 10));
    if (response.statusCode != 200) {
      throw Exception('Quick match failed: ${response.statusCode}');
    }
    final data = jsonDecode(response.body) as Map<String, dynamic>;
    return data['roomId'] as String;
  }

  /// REST: 방 삭제
  Future<void> deleteRoom(String roomId) async {
    final uri = Uri.parse('$_serverUrl/api/rooms/$roomId');
    await http.delete(uri).timeout(const Duration(seconds: 10));
  }

  /// Convert HTTP(S) URL to WS(S) URL
  String _toWsUrl(String url) {
    if (url.startsWith('https://')) return url.replaceFirst('https://', 'wss://');
    if (url.startsWith('http://')) return url.replaceFirst('http://', 'ws://');
    return 'ws://$url';
  }

  void _handleUnexpectedDisconnect() {
    _heartbeatTimer?.cancel();
    _channel = null; // Don't call sink.close() — connection already dead
    if (!_intentionalDisconnect) {
      onUnexpectedDisconnect?.call();
    }
  }

  /// 포그라운드 복귀 시 연결 확인용 heartbeat 즉시 전송
  void sendHeartbeat() {
    _send({'type': 'heartbeat', 'payload': {}});
  }

  /// WebSocket: 연결 + 참가
  Future<void> connectAndJoin(String roomId, String playerName) async {
    _intentionalDisconnect = true;
    disconnect();
    _intentionalDisconnect = false;
    currentRoomId = roomId;
    final wsUrl = _toWsUrl(_serverUrl);
    _channel =
        WebSocketChannel.connect(Uri.parse('$wsUrl/ws/game/$roomId'));

    _channel!.stream.listen(
      (data) {
        final json = jsonDecode(data as String) as Map<String, dynamic>;
        if (json['type'] == 'pong') {
          _missedPongs = 0;
          return;
        }
        _messageController.add(json);
        if (json['type'] == 'joinAccepted') {
          playerId = json['payload']['playerId'] as String;
          sessionToken = json['payload']['sessionToken'] as String?;
        }
      },
      onDone: () => _handleUnexpectedDisconnect(),
      onError: (e) => _handleUnexpectedDisconnect(),
    );

    // Join request
    _send({'type': 'joinRequest', 'payload': {'playerName': playerName}});

    // Heartbeat every 25 seconds with pong validation
    _missedPongs = 0;
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 25), (_) {
      _missedPongs++;
      if (_missedPongs >= 3) {
        // 3회 연속 pong 미수신 → dead connection
        _handleUnexpectedDisconnect();
        return;
      }
      _send({'type': 'heartbeat', 'payload': {}});
    });
  }

  void sendPlaceCard(Map<String, dynamic> cardJson, String line) {
    _send({
      'type': 'placeCard',
      'payload': {'card': cardJson, 'line': line},
    });
  }

  void sendDiscardCard(Map<String, dynamic> cardJson) {
    _send({
      'type': 'discardCard',
      'payload': {'card': cardJson},
    });
  }

  void sendUnplaceCard(Map<String, dynamic> cardJson, String line) {
    _send({
      'type': 'unplaceCard',
      'payload': {'card': cardJson, 'line': line},
    });
  }

  void sendUnDiscardCard(Map<String, dynamic> cardJson) {
    _send({
      'type': 'unDiscardCard',
      'payload': {'card': cardJson},
    });
  }

  void sendConfirmPlacement() {
    _send({'type': 'confirmPlacement', 'payload': {}});
  }

  void sendReadyForNextHand() {
    _send({'type': 'readyForNextHand', 'payload': {}});
  }

  void sendLeaveGame() {
    _send({'type': 'leaveGame', 'payload': {}});
  }

  /// leaveGame 전송 후 flush delay를 두고 disconnect
  Future<void> sendLeaveGameAndDisconnect() async {
    _intentionalDisconnect = true;
    _send({'type': 'leaveGame', 'payload': {}});
    await Future.delayed(const Duration(milliseconds: 200));
    disconnect();
  }

  void sendStartGame() {
    _send({'type': 'startGame', 'payload': {}});
  }

  void sendEmote(String emoteId) {
    _send({'type': 'emote', 'payload': {'emote_id': emoteId}});
  }

  void sendPlayOrFoldResponse(String choice) {
    _send({'type': 'playOrFoldResponse', 'payload': {'choice': choice}});
  }

  void _send(Map<String, dynamic> msg) {
    _channel?.sink.add(jsonEncode(msg));
  }

  /// Reconnect to an existing game session using sessionToken
  Future<bool> reconnect(String roomId) async {
    if (sessionToken == null) return false;
    try {
      _intentionalDisconnect = true;
      _heartbeatTimer?.cancel();
      _heartbeatTimer = null;
      _channel?.sink.close();
      _channel = null;
      _intentionalDisconnect = false;

      final wsUrl = _toWsUrl(_serverUrl);
      _channel = WebSocketChannel.connect(Uri.parse('$wsUrl/ws/game/$roomId'));
      currentRoomId = roomId;

      final completer = Completer<bool>();
      _channel!.stream.listen(
        (data) {
          final json = jsonDecode(data as String) as Map<String, dynamic>;
          if (json['type'] == 'pong') {
            _missedPongs = 0;
            return;
          }
          _messageController.add(json);
          if (!completer.isCompleted) {
            if (json['type'] == 'reconnected') {
              completer.complete(true);
            } else if (json['type'] == 'error') {
              completer.complete(false);
            }
          }
        },
        onDone: () {
          if (!completer.isCompleted) completer.complete(false);
          _handleUnexpectedDisconnect();
        },
        onError: (e) {
          if (!completer.isCompleted) completer.complete(false);
          _handleUnexpectedDisconnect();
        },
      );

      _send({'type': 'reconnect', 'payload': {'sessionToken': sessionToken}});
      _missedPongs = 0;
      _heartbeatTimer = Timer.periodic(const Duration(seconds: 25), (_) {
        _missedPongs++;
        if (_missedPongs >= 3) {
          _handleUnexpectedDisconnect();
          return;
        }
        _send({'type': 'heartbeat', 'payload': {}});
      });

      return await completer.future.timeout(
        const Duration(seconds: 10),
        onTimeout: () => false,
      );
    } catch (e) {
      return false;
    }
  }

  /// Auto-reconnect with exponential backoff
  Future<bool> autoReconnect(String roomId, {int maxRetries = 5}) async {
    final random = Random();
    for (int i = 0; i < maxRetries; i++) {
      if (i > 0) {
        final baseDelay = Duration(seconds: 1 << i); // 2, 4, 8, 16
        final jitter = Duration(milliseconds: random.nextInt(500));
        await Future.delayed(baseDelay + jitter);
      }
      if (await reconnect(roomId)) return true;
    }
    return false;
  }

  /// Lobby WebSocket: 연결
  void connectLobby(String serverUrl) {
    disconnectLobby();
    final uri = Uri.tryParse(serverUrl);
    if (uri == null || uri.host.isEmpty) return;
    final wsUrl = _toWsUrl(serverUrl);
    _lobbyChannel =
        WebSocketChannel.connect(Uri.parse('$wsUrl/ws/lobby'));
    _lobbyChannel!.stream.listen(
      (data) {
        final json = jsonDecode(data as String) as Map<String, dynamic>;
        _lobbyMessageController.add(json);
      },
      onDone: () => disconnectLobby(),
      onError: (e) => disconnectLobby(),
    );
    _lobbyHeartbeatTimer =
        Timer.periodic(const Duration(seconds: 25), (_) {
      _lobbyChannel?.sink.add(jsonEncode({'type': 'heartbeat', 'payload': {}}));
    });
  }

  /// Lobby WebSocket: 연결 해제
  void disconnectLobby() {
    _lobbyHeartbeatTimer?.cancel();
    _lobbyHeartbeatTimer = null;
    _lobbyChannel?.sink.close();
    _lobbyChannel = null;
  }

  void disconnect() {
    _intentionalDisconnect = true;
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;
    _channel?.sink.close();
    _channel = null;
  }

  void dispose() {
    disconnect();
    disconnectLobby();
    _messageController.close();
    _lobbyMessageController.close();
    sessionToken = null;
    playerId = null;
  }
}
