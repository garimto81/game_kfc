import 'dart:async';
import 'package:riverpod_annotation/riverpod_annotation.dart';
import '../models/card.dart' as ofc;
import '../models/board.dart';
import '../network/online_client.dart';

part 'online_game_provider.g.dart';

enum OnlineConnectionState {
  disconnected,
  connecting,
  inLobby,
  inRoom,
  playing,
  gameOver,
  reconnecting,
  error,
}

class OnlineState {
  final OnlineConnectionState connectionState;
  final String? playerId;
  final String? roomId;
  final String? errorMessage;
  final List<Map<String, dynamic>> rooms;
  final Map<String, dynamic>? gameState;
  final List<ofc.Card> hand;
  final int currentRound;
  final String phase;
  final int connectedPlayers;
  final String? sessionToken;
  final bool isInFantasyland;
  final int handNumber;

  final List<String> disconnectedPlayers;
  final int maxPlayers;

  const OnlineState({
    this.connectionState = OnlineConnectionState.disconnected,
    this.playerId,
    this.roomId,
    this.errorMessage,
    this.rooms = const [],
    this.gameState,
    this.hand = const [],
    this.currentRound = 0,
    this.phase = 'waiting',
    this.connectedPlayers = 0,
    this.sessionToken,
    this.isInFantasyland = false,
    this.handNumber = 1,
    this.disconnectedPlayers = const [],
    this.maxPlayers = 2,
  });

  OnlineState copyWith({
    OnlineConnectionState? connectionState,
    String? playerId,
    String? roomId,
    String? errorMessage,
    bool clearError = false,
    List<Map<String, dynamic>>? rooms,
    Map<String, dynamic>? gameState,
    List<ofc.Card>? hand,
    int? currentRound,
    String? phase,
    int? connectedPlayers,
    String? sessionToken,
    bool? isInFantasyland,
    int? handNumber,
    List<String>? disconnectedPlayers,
    int? maxPlayers,
  }) {
    return OnlineState(
      connectionState: connectionState ?? this.connectionState,
      playerId: playerId ?? this.playerId,
      roomId: roomId ?? this.roomId,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      rooms: rooms ?? this.rooms,
      gameState: gameState ?? this.gameState,
      hand: hand ?? this.hand,
      currentRound: currentRound ?? this.currentRound,
      phase: phase ?? this.phase,
      connectedPlayers: connectedPlayers ?? this.connectedPlayers,
      sessionToken: sessionToken ?? this.sessionToken,
      isInFantasyland: isInFantasyland ?? this.isInFantasyland,
      handNumber: handNumber ?? this.handNumber,
      disconnectedPlayers: disconnectedPlayers ?? this.disconnectedPlayers,
      maxPlayers: maxPlayers ?? this.maxPlayers,
    );
  }
}

@Riverpod(keepAlive: true)
class OnlineGameNotifier extends _$OnlineGameNotifier {
  OnlineClient? _client;
  StreamSubscription? _messageSubscription;
  StreamSubscription? _lobbySubscription;
  bool _isReconnecting = false;

  @override
  OnlineState build() {
    ref.onDispose(() => _cleanup());
    return const OnlineState();
  }

  /// 서버에 연결
  void setServer(String serverUrl) {
    _cleanup();
    _client = OnlineClient(serverUrl);
    _client!.connectLobby(serverUrl);
    _lobbySubscription = _client!.lobbyMessages.listen(_handleLobbyMessage);
    state = const OnlineState(
      connectionState: OnlineConnectionState.inLobby,
    );
  }

  /// 빠른 매치 — 대기 중인 방에 참가하거나, 없으면 새 방 생성 후 참가
  Future<void> quickMatch(
    String serverUrl,
    String playerName, {
    int maxPlayers = 2,
  }) async {
    try {
      // 1. 서버 연결
      setServer(serverUrl);

      // 2. 로비 연결 대기
      await Future.delayed(const Duration(milliseconds: 100));

      // 3. 방 목록 조회
      await refreshRooms();

      // 4. 참가 가능한 대기 방 검색
      String? targetRoomId;
      for (final room in state.rooms) {
        final status = room['status'] as String?;
        final roomMaxPlayers = room['maxPlayers'] as int? ?? 2;
        final playerCount = room['playerCount'] as int? ?? 0;
        if (status == 'waiting' &&
            roomMaxPlayers == maxPlayers &&
            playerCount < roomMaxPlayers) {
          targetRoomId = room['id'] as String?;
          break;
        }
      }

      // 5. 방이 없으면 새로 생성
      if (targetRoomId == null) {
        final autoName = 'Quick Match ${DateTime.now().millisecondsSinceEpoch % 10000}';
        targetRoomId = await createRoom(autoName, maxPlayers: maxPlayers);
        if (targetRoomId == null) return; // 생성 실패 시 createRoom에서 에러 처리됨
      }

      // 6. 방 참가
      await joinRoom(targetRoomId, playerName);
    } catch (e) {
      state = state.copyWith(
        connectionState: OnlineConnectionState.error,
        errorMessage: 'Quick match failed: $e',
      );
    }
  }

  /// 방 목록 조회
  Future<void> refreshRooms() async {
    if (_client == null) return;
    try {
      final rooms = await _client!.listRooms();
      state = state.copyWith(rooms: rooms);
    } catch (e) {
      state = state.copyWith(
        connectionState: OnlineConnectionState.error,
        errorMessage: 'Failed to fetch rooms: $e',
      );
    }
  }

  /// 방 생성
  Future<String?> createRoom(String name, {int maxPlayers = 2}) async {
    if (_client == null) return null;
    try {
      final room =
          await _client!.createRoom(name, maxPlayers: maxPlayers);
      final roomId = room['id'] as String;
      state = state.copyWith(roomId: roomId);
      return roomId;
    } catch (e) {
      state = state.copyWith(
        connectionState: OnlineConnectionState.error,
        errorMessage: 'Failed to create room: $e',
      );
      return null;
    }
  }

  /// 방 참가 + WebSocket 연결
  Future<void> joinRoom(String roomId, String playerName) async {
    if (_client == null) return;
    state = state.copyWith(
      connectionState: OnlineConnectionState.connecting,
    );
    try {
      await _client!.connectAndJoin(roomId, playerName);
      _client!.onUnexpectedDisconnect = () => _onConnectionLost();
      _messageSubscription = _client!.messageStream.listen(_handleMessage);
      state = state.copyWith(
        connectionState: OnlineConnectionState.inRoom,
        roomId: roomId,
      );
    } catch (e) {
      state = state.copyWith(
        connectionState: OnlineConnectionState.error,
        errorMessage: 'Failed to join room: $e',
      );
    }
  }

  void _handleLobbyMessage(Map<String, dynamic> msg) {
    final type = msg['type'] as String?;
    if (type == null) return;
    final payload = msg['payload'] as Map<String, dynamic>? ?? {};

    switch (type) {
      case 'roomList':
        final roomsList = payload['rooms'] as List<dynamic>?;
        if (roomsList == null) break;
        final rooms = roomsList
            .whereType<Map<String, dynamic>>()
            .toList();
        state = state.copyWith(rooms: rooms);
        break;
      case 'roomCreated':
        final room = payload['room'] as Map<String, dynamic>?;
        if (room == null) break;
        state = state.copyWith(rooms: [...state.rooms, room]);
        break;
      case 'roomUpdated':
        final room = payload['room'] as Map<String, dynamic>?;
        if (room == null) break;
        final roomId = room['id'] as String?;
        if (roomId == null) break;
        final updatedRooms = state.rooms.map((r) {
          return (r['id'] as String?) == roomId ? room : r;
        }).toList();
        state = state.copyWith(rooms: updatedRooms);
        break;
      case 'roomDeleted':
        final roomId = payload['roomId'] as String?;
        if (roomId == null) break;
        final filteredRooms =
            state.rooms.where((r) => (r['id'] as String?) != roomId).toList();
        state = state.copyWith(rooms: filteredRooms);
        break;
    }
  }

  void _handleMessage(Map<String, dynamic> msg) {
    final type = msg['type'] as String?;
    if (type == null) return;
    final payload = msg['payload'] as Map<String, dynamic>? ?? {};

    switch (type) {
      case 'joinAccepted':
        final playerId = payload['playerId'] as String?;
        if (playerId == null) break;
        state = state.copyWith(
          playerId: playerId,
          sessionToken: payload['sessionToken'] as String?,
          connectedPlayers: payload['playerCount'] as int? ?? 1,
          maxPlayers: payload['maxPlayers'] as int? ?? 2,
        );
        break;
      case 'playerJoined':
        state = state.copyWith(
          connectedPlayers: payload['playerCount'] as int? ?? state.connectedPlayers,
        );
        break;
      case 'gameStart':
        state = state.copyWith(
          connectionState: OnlineConnectionState.playing,
          gameState: payload,
          phase: 'placing',
        );
        break;
      case 'dealCards':
        final cardsList = payload['cards'] as List?;
        final round = payload['round'] as int?;
        if (cardsList == null || round == null) break;
        final cards = _parseCards(cardsList);
        final inFL = payload['inFantasyland'] as bool? ?? false;
        final dealHandNum = payload['handNumber'] as int?;
        state = state.copyWith(
          hand: cards,
          currentRound: round,
          isInFantasyland: inFL,
          handNumber: dealHandNum ?? state.handNumber,
        );
        break;
      case 'stateUpdate':
        // Sync hand from server state to recover from server rejections
        List<ofc.Card>? serverHand;
        bool? myFL;
        if (state.playerId != null) {
          final players = payload['players'] as Map<String, dynamic>?;
          final myData = players?[state.playerId] as Map<String, dynamic>?;
          final handJson = myData?['hand'] as List?;
          if (handJson != null) {
            serverHand = _parseCards(handJson);
          }
          myFL = myData?['inFantasyland'] as bool?;
        }
        final stateHandNum = payload['handNumber'] as int?;
        state = state.copyWith(
          gameState: payload,
          phase: payload['phase'] as String? ?? state.phase,
          hand: serverHand ?? state.hand,
          isInFantasyland: myFL ?? state.isInFantasyland,
          handNumber: stateHandNum ?? state.handNumber,
        );
        break;
      case 'handScored':
        // 핸드 간 점수 표시 — 서버가 자동으로 nextHand + 새 딜링 수행
        state = state.copyWith(
          gameState: payload,
          phase: 'handScored',
        );
        break;
      case 'gameOver':
        state = state.copyWith(
          connectionState: OnlineConnectionState.gameOver,
          gameState: payload,
        );
        break;
      case 'error':
        state = state.copyWith(
          errorMessage: payload['message'] as String?,
        );
        break;
      case 'reconnected':
        final reconnectGameState = payload['gameState'] as Map<String, dynamic>?;
        final reconnectPlayerId = payload['playerId'] as String?;
        if (reconnectPlayerId == null) break;
        List<ofc.Card>? reconnectHand;
        int? reconnectRound;
        String? reconnectPhase;
        bool? reconnectFL;
        int? reconnectHandNum;
        if (reconnectGameState != null) {
          reconnectPhase = reconnectGameState['phase'] as String?;
          reconnectRound = reconnectGameState['currentRound'] as int?;
          reconnectHandNum = reconnectGameState['handNumber'] as int?;
          final reconnectPlayers = reconnectGameState['players'] as Map<String, dynamic>?;
          final myReconnectData = reconnectPlayers?[reconnectPlayerId] as Map<String, dynamic>?;
          final handJson = myReconnectData?['hand'] as List?;
          if (handJson != null) {
            reconnectHand = _parseCards(handJson);
          }
          reconnectFL = myReconnectData?['inFantasyland'] as bool?;
        }
        state = state.copyWith(
          connectionState: OnlineConnectionState.playing,
          playerId: reconnectPlayerId,
          gameState: reconnectGameState,
          hand: reconnectHand ?? state.hand,
          currentRound: reconnectRound ?? state.currentRound,
          phase: reconnectPhase ?? state.phase,
          isInFantasyland: reconnectFL ?? state.isInFantasyland,
          handNumber: reconnectHandNum ?? state.handNumber,
          clearError: true,
        );
        break;
      case 'playerReconnected':
        final reconnectedId = payload['playerId'] as String?;
        if (reconnectedId != null) {
          state = state.copyWith(
            disconnectedPlayers: state.disconnectedPlayers
                .where((id) => id != reconnectedId)
                .toList(),
            clearError: true,
          );
        }
        break;
      case 'playerDisconnected':
        final disconnectedId = payload['playerId'] as String?;
        if (disconnectedId != null &&
            !state.disconnectedPlayers.contains(disconnectedId)) {
          state = state.copyWith(
            disconnectedPlayers: [...state.disconnectedPlayers, disconnectedId],
          );
        }
        break;
      case 'playerLeft':
        final reason = payload['reason'] as String?;
        state = state.copyWith(
          errorMessage: reason == 'timeout'
              ? 'Player left the game (timeout)'
              : 'Player left the game',
        );
        break;
    }
  }

  /// 카드 배치 (서버 형식으로 변환하여 전송)
  void placeCard(ofc.Card card, String line) {
    final cardJson = _cardToServerJson(card);
    _client?.sendPlaceCard(cardJson, line);
    // Optimistic update: 로컬 핸드에서 제거
    state = state.copyWith(
      hand: state.hand.where((c) => c != card).toList(),
    );
  }

  /// 카드 버림
  void discardCard(ofc.Card card) {
    final cardJson = _cardToServerJson(card);
    _client?.sendDiscardCard(cardJson);
    // Optimistic update: 로컬 핸드에서 제거
    state = state.copyWith(
      hand: state.hand.where((c) => c != card).toList(),
    );
  }

  /// 카드 배치 되돌리기 (Undo)
  void unplaceCard(ofc.Card card, String line) {
    final cardJson = _cardToServerJson(card);
    _client?.sendUnplaceCard(cardJson, line);
    // Optimistic update: 로컬 핸드에 카드 복원
    state = state.copyWith(
      hand: [...state.hand, card],
    );
  }

  /// 버린 카드 되돌리기 (Undo Discard)
  void undiscardCard(ofc.Card card) {
    final cardJson = _cardToServerJson(card);
    _client?.sendUnDiscardCard(cardJson);
    // Optimistic update: 로컬 핸드에 카드 복원
    state = state.copyWith(
      hand: [...state.hand, card],
    );
  }

  /// 배치 확정
  void confirmPlacement() {
    _client?.sendConfirmPlacement();
  }

  /// 게임 나가기
  void leaveGame() {
    _client?.sendLeaveGame();
    _cleanup();
    state = const OnlineState();
  }

  /// 서버 카드 JSON 리스트 → Flutter Card 리스트 변환
  /// 서버: {"rank":14,"suit":4,"rankName":"ace","suitName":"spade"}
  List<ofc.Card> _parseCards(List<dynamic> cardsJson) {
    final cards = <ofc.Card>[];
    for (final c in cardsJson) {
      final m = c as Map<String, dynamic>?;
      if (m == null) continue;
      final card = _parseCard(m);
      if (card != null) cards.add(card);
    }
    return cards;
  }

  /// 단일 서버 카드 JSON → Flutter Card 변환 (파싱 실패 시 null)
  ofc.Card? _parseCard(Map<String, dynamic> m) {
    final rankIdx =
        ofc.Rank.values.indexWhere((r) => r.name == m['rankName']);
    final suitIdx =
        ofc.Suit.values.indexWhere((s) => s.name == m['suitName']);
    if (rankIdx == -1 || suitIdx == -1) return null;
    return ofc.Card(rank: ofc.Rank.values[rankIdx], suit: ofc.Suit.values[suitIdx]);
  }

  /// Flutter Card → 서버 JSON 변환
  Map<String, dynamic> _cardToServerJson(ofc.Card card) {
    return {
      'rank': card.rank.value,
      'suit': card.suit.value,
      'rankName': card.rank.name,
      'suitName': card.suit.name,
    };
  }

  /// 서버 보드 JSON → OFCBoard 변환
  OFCBoard? parseBoard(Map<String, dynamic>? boardJson) {
    if (boardJson == null) return null;
    final top = (boardJson['top'] as List?)
            ?.where((c) => c != null)
            .map((c) => _parseCard(c as Map<String, dynamic>))
            .whereType<ofc.Card>()
            .toList() ??
        [];
    final mid = (boardJson['mid'] as List?)
            ?.where((c) => c != null)
            .map((c) => _parseCard(c as Map<String, dynamic>))
            .whereType<ofc.Card>()
            .toList() ??
        [];
    final bottom = (boardJson['bottom'] as List?)
            ?.where((c) => c != null)
            .map((c) => _parseCard(c as Map<String, dynamic>))
            .whereType<ofc.Card>()
            .toList() ??
        [];
    return OFCBoard(top: top, mid: mid, bottom: bottom);
  }

  /// 서버 보드에서 카드 수 추출 (상대방 보드 — null 카드 포함)
  ({int top, int mid, int bottom}) parseBoardCounts(
      Map<String, dynamic>? boardJson) {
    if (boardJson == null) {
      return (top: 0, mid: 0, bottom: 0);
    }
    return (
      top: boardJson['topCount'] as int? ?? 0,
      mid: boardJson['midCount'] as int? ?? 0,
      bottom: boardJson['bottomCount'] as int? ?? 0,
    );
  }

  void _onConnectionLost() {
    if (_isReconnecting) return;
    final cs = state.connectionState;
    if (cs == OnlineConnectionState.playing ||
        cs == OnlineConnectionState.inRoom) {
      _isReconnecting = true;
      _triggerAutoReconnect();
    }
  }

  Future<void> _triggerAutoReconnect() async {
    if (_client == null || state.roomId == null) {
      _isReconnecting = false;
      return;
    }
    state = state.copyWith(
      connectionState: OnlineConnectionState.reconnecting,
      clearError: true,
    );
    _messageSubscription?.cancel();
    _messageSubscription = null;

    final success = await _client!.autoReconnect(state.roomId!);
    _isReconnecting = false;
    if (success) {
      _messageSubscription = _client!.messageStream.listen(_handleMessage);
      _client!.onUnexpectedDisconnect = () => _onConnectionLost();
    } else {
      state = state.copyWith(
        connectionState: OnlineConnectionState.error,
        errorMessage: 'Connection lost. Tap retry to reconnect.',
      );
    }
  }

  /// 자동 재접속 (수동 retry 용)
  Future<void> autoReconnect() async {
    if (_client == null || state.roomId == null) return;
    if (_isReconnecting) return;
    _isReconnecting = true;
    _messageSubscription?.cancel();
    _messageSubscription = null;
    state = state.copyWith(
      connectionState: OnlineConnectionState.reconnecting,
      clearError: true,
    );
    final success = await _client!.autoReconnect(state.roomId!);
    _isReconnecting = false;
    if (success) {
      _messageSubscription = _client!.messageStream.listen(_handleMessage);
      _client!.onUnexpectedDisconnect = () => _onConnectionLost();
    } else {
      state = state.copyWith(
        connectionState: OnlineConnectionState.error,
        errorMessage: 'Failed to reconnect. Tap retry to try again.',
      );
    }
  }

  /// 연결 해제
  void disconnect() {
    _cleanup();
    state = const OnlineState();
  }

  void _cleanup() {
    _lobbySubscription?.cancel();
    _lobbySubscription = null;
    _messageSubscription?.cancel();
    _messageSubscription = null;
    _client?.dispose();
    _client = null;
  }
}
