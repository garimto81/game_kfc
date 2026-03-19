import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../models/card.dart' as ofc;
import '../../models/board.dart';
import '../../models/player.dart';
import '../../logic/foul_checker.dart';
import '../../logic/simple_ai.dart';
import '../../providers/online_game_provider.dart';
import '../theme/player_colors.dart';
import '../widgets/board_grid_view.dart';
import '../widgets/board_widget.dart';
import '../widgets/opponent_page_view.dart';
import '../widgets/hand_widget.dart';

enum _ViewMode { split, grid }

enum _OnlineSortMode { none, byRank, bySuit }

class OnlineGameScreen extends ConsumerStatefulWidget {
  const OnlineGameScreen({super.key});

  @override
  ConsumerState<OnlineGameScreen> createState() => _OnlineGameScreenState();
}

class _OnlineGameScreenState extends ConsumerState<OnlineGameScreen> {
  bool _hasDiscarded = false;
  ofc.Card? _discardedCard;
  final List<({ofc.Card card, String line})> _localPlacements = [];
  _OnlineSortMode _sortMode = _OnlineSortMode.none;
  _ViewMode _viewMode = _ViewMode.split;

  // Timer state
  Timer? _countdownTimer;
  double _timeRemaining = 0;
  double _totalTime = 0;
  double? _lastDeadline;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final s = ref.read(onlineGameNotifierProvider);
      if (s.turnDeadline != null && s.turnTimeLimit > 0) {
        _startCountdown(s.turnDeadline!, s.turnTimeLimit);
      }
      // 300ms 딜레이 재확인 — race condition 방어
      Future.delayed(const Duration(milliseconds: 300), () {
        if (!mounted) return;
        final s2 = ref.read(onlineGameNotifierProvider);
        if (s2.turnDeadline != null && s2.turnTimeLimit > 0 && _totalTime <= 0) {
          _startCountdown(s2.turnDeadline!, s2.turnTimeLimit);
        }
      });
    });
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    super.dispose();
  }

  void _startCountdown(double deadline, int timeLimit) {
    _countdownTimer?.cancel();
    _totalTime = timeLimit.toDouble();
    _lastDeadline = deadline;

    // 서버-클라이언트 시간 오프셋 적용
    final offset = ref.read(onlineGameNotifierProvider).serverTimeOffset;

    // 즉시 초기값 계산 + setState → 첫 빌드에서 타이머 바 표시
    final nowInit = DateTime.now().millisecondsSinceEpoch / 1000.0;
    final adjustedNow = nowInit + offset;
    final initialRemaining = (deadline - adjustedNow).clamp(0.0, _totalTime);
    if (kDebugMode) {
      debugPrint('[TIMER] start: deadline=$deadline, ttl=$timeLimit, '
          'remaining=${initialRemaining.toStringAsFixed(1)}, offset=${offset.toStringAsFixed(2)}');
    }
    setState(() {
      _timeRemaining = initialRemaining;
    });

    if (initialRemaining <= 0) return;

    _countdownTimer = Timer.periodic(const Duration(milliseconds: 100), (_) {
      if (!mounted) {
        _countdownTimer?.cancel();
        return;
      }
      final now = DateTime.now().millisecondsSinceEpoch / 1000.0;
      final remaining = deadline - (now + offset);
      setState(() {
        _timeRemaining = remaining.clamp(0, _totalTime);
      });
      if (remaining <= 0) {
        _countdownTimer?.cancel();
      }
    });
  }

  void _stopCountdown() {
    if (kDebugMode) debugPrint('[TIMER] stop');
    _countdownTimer?.cancel();
    setState(() {
      _timeRemaining = 0;
      _totalTime = 0;
      _lastDeadline = null;
    });
  }

  Widget _buildTimerBar() {
    if (_totalTime <= 0 || _timeRemaining <= 0) {
      return const SizedBox.shrink();
    }
    final fraction = (_timeRemaining / _totalTime).clamp(0.0, 1.0);
    final isUrgent = _timeRemaining <= 5;
    final seconds = _timeRemaining.ceil();

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Expanded(
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  child: LinearProgressIndicator(
                    value: fraction,
                    minHeight: 8,
                    backgroundColor: Colors.grey[700],
                    valueColor: AlwaysStoppedAnimation(
                      isUrgent ? Colors.red : Colors.green[400]!,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                '${seconds}s',
                style: TextStyle(
                  color: isUrgent ? Colors.red : Colors.white70,
                  fontSize: 13,
                  fontWeight: isUrgent ? FontWeight.bold : FontWeight.normal,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  List<ofc.Card> _sortCards(List<ofc.Card> cards, _OnlineSortMode mode) {
    if (mode == _OnlineSortMode.none) return cards;
    final sorted = List<ofc.Card>.from(cards);
    if (mode == _OnlineSortMode.byRank) {
      sorted.sort((a, b) => b.rank.value.compareTo(a.rank.value));
    } else {
      sorted.sort((a, b) {
        final suitCmp = b.suit.value.compareTo(a.suit.value);
        if (suitCmp != 0) return suitCmp;
        return b.rank.value.compareTo(a.rank.value);
      });
    }
    return sorted;
  }

  void _onAutoArrange() {
    final onlineState = ref.read(onlineGameNotifierProvider);
    if (!onlineState.isInFantasyland) return;

    // 기존 배치가 있으면 Undo All
    if (_localPlacements.isNotEmpty || _hasDiscarded) {
      _onUndoAll();
    }

    final refreshedState = ref.read(onlineGameNotifierProvider);
    final board = _getMyBoard();
    final ai = SimpleAI();
    final decision = ai.decideFantasyland(refreshedState.hand, board);

    for (final entry in decision.placements.entries) {
      _onCardPlaced(entry.key, entry.value);
    }
  }

  void _onCardPlaced(ofc.Card card, String line, {String? fromLine}) {
    final notifier = ref.read(onlineGameNotifierProvider.notifier);
    if (fromLine != null) {
      // 보드 내 이동: 소스에서 unplace 후 새 라인에 place
      notifier.unplaceCard(card, fromLine);
      _localPlacements.removeWhere((p) => p.card == card && p.line == fromLine);
    }
    notifier.placeCard(card, line);
    _localPlacements.add((card: card, line: line));
    _tryAutoConfirm();
  }

  void _onDiscard(ofc.Card card) {
    final notifier = ref.read(onlineGameNotifierProvider.notifier);
    notifier.discardCard(card);
    setState(() {
      _hasDiscarded = true;
      _discardedCard = card;
    });
    _tryAutoConfirm();
  }

  void _tryAutoConfirm() {
    final onlineState = ref.read(onlineGameNotifierProvider);
    // FL: 보드가 가득 차면 자동 confirm (남은 카드 자동 discard)
    if (onlineState.isInFantasyland) {
      final board = _getMyBoard();
      if (board.isFull()) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _onConfirm();
        });
      }
      return;
    }
    if (onlineState.currentRound > 0 &&
        onlineState.hand.isEmpty &&
        _hasDiscarded) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _onConfirm();
      });
    }
  }

  void _onConfirm() {
    final onlineState = ref.read(onlineGameNotifierProvider);
    final notifier = ref.read(onlineGameNotifierProvider.notifier);

    if (onlineState.isInFantasyland && onlineState.hand.isNotEmpty) {
      // FL: 남은 핸드 카드 모두 discard
      for (final card in List.of(onlineState.hand)) {
        notifier.discardCard(card);
      }
      // 서버가 discard 처리할 시간 확보 후 confirm
      Future.delayed(const Duration(milliseconds: 300), () {
        if (mounted) {
          ref.read(onlineGameNotifierProvider.notifier).confirmPlacement();
          setState(() {
            _hasDiscarded = false;
            _discardedCard = null;
            _localPlacements.clear();
          });
        }
      });
      return;
    }

    notifier.confirmPlacement();
    setState(() {
      _hasDiscarded = false;
      _discardedCard = null;
      _localPlacements.clear();
    });
  }

  bool _canConfirm() {
    final onlineState = ref.read(onlineGameNotifierProvider);
    if (onlineState.isInFantasyland) {
      // FL: 보드 13장 배치 완료 시 confirm 가능
      final board = _getMyBoard();
      return board.isFull();
    }
    if (onlineState.hand.isNotEmpty) return false;
    if (onlineState.currentRound > 0 && !_hasDiscarded) return false;
    return true;
  }

  OFCBoard _getMyBoard() {
    final onlineState = ref.read(onlineGameNotifierProvider);
    final notifier = ref.read(onlineGameNotifierProvider.notifier);
    final gameState = onlineState.gameState;
    if (gameState == null || onlineState.playerId == null) return OFCBoard();

    final players = gameState['players'] as Map<String, dynamic>?;
    if (players == null) return OFCBoard();

    final myData = players[onlineState.playerId] as Map<String, dynamic>?;
    if (myData == null) return OFCBoard();

    return notifier.parseBoard(myData['board'] as Map<String, dynamic>?) ??
        OFCBoard();
  }

  int _getSeatIndex(String? playerId) {
    final onlineState = ref.read(onlineGameNotifierProvider);
    final activePlayers = onlineState.gameState?['activePlayers'] as List<dynamic>? ?? [];
    final idx = activePlayers.indexOf(playerId);
    return idx >= 0 ? idx : 0;
  }

  PlayerColorScheme _getMyColor() => PlayerColors.forSeat(_getSeatIndex(
      ref.read(onlineGameNotifierProvider).playerId));

  List<String> _getAvailableLines(OFCBoard board) {
    final lines = <String>[];
    if (board.top.length < OFCBoard.topMaxCards) lines.add('top');
    if (board.mid.length < OFCBoard.midMaxCards) lines.add('mid');
    if (board.bottom.length < OFCBoard.bottomMaxCards) lines.add('bottom');
    return lines;
  }

  @override
  Widget build(BuildContext context) {
    final onlineState = ref.watch(onlineGameNotifierProvider);
    final notifier = ref.watch(onlineGameNotifierProvider.notifier);

    ref.listen(onlineGameNotifierProvider, (prev, next) {
      if (!mounted) return;
      // Bug 2 fix: reconnect 후 _lastDeadline 리셋 — 동일 deadline도 재시작
      if (prev?.connectionState == OnlineConnectionState.reconnecting &&
          next.connectionState == OnlineConnectionState.playing) {
        _lastDeadline = null;
      }
      if (next.connectionState == OnlineConnectionState.gameOver &&
          prev?.connectionState != OnlineConnectionState.gameOver) {
        _showGameOverDialog(next.gameState);
      }
      // handScored: 핸드 간 점수 표시
      if (next.phase == 'handScored' && prev?.phase != 'handScored') {
        _showHandScoredDialog(next.gameState);
      }
      if (prev?.currentRound != next.currentRound ||
          prev?.handNumber != next.handNumber) {
        setState(() {
          _hasDiscarded = false;
          _discardedCard = null;
          _localPlacements.clear();
        });
        // 라운드/핸드 변경 시 deadline 재확인 (stateUpdate가 먼저 도착한 경우)
        if (next.turnDeadline != null && next.turnTimeLimit > 0) {
          _startCountdown(next.turnDeadline!, next.turnTimeLimit);
        }
      }
      // Timer deadline tracking
      if (next.turnDeadline != null && next.turnTimeLimit > 0 &&
          next.turnDeadline != _lastDeadline) {
        _startCountdown(next.turnDeadline!, next.turnTimeLimit);
      }
      // stateUpdate 기반 타이머 복구 안전장치
      if (next.turnDeadline != null && next.turnTimeLimit > 0 &&
          _totalTime <= 0 && _countdownTimer?.isActive != true) {
        _startCountdown(next.turnDeadline!, next.turnTimeLimit);
      }
      if (next.phase == 'handScored' || next.connectionState == OnlineConnectionState.gameOver) {
        _stopCountdown();
      }
      // My confirm → stop my countdown display
      if (next.gameState != null && next.playerId != null) {
        final players = next.gameState!['players'] as Map<String, dynamic>?;
        final myData = players?[next.playerId] as Map<String, dynamic>?;
        final myConfirmed = myData?['confirmed'] as bool? ?? false;
        if (myConfirmed && _countdownTimer?.isActive == true) {
          _stopCountdown();
        }
      }
    });

    final screenWidth = MediaQuery.of(context).size.width;
    final isCompact = screenWidth < 400;

    final myBoard = _getMyBoard();
    final availableLines = _getAvailableLines(myBoard);
    // FL이면 discard 버튼 필요 없음 (confirm 시 자동 discard)
    final isPineapple = onlineState.currentRound > 0 && !onlineState.isInFantasyland;
    final opponents = _buildOpponents(onlineState, notifier);

    final myColor = _getMyColor();

    return Scaffold(
      backgroundColor: Color.lerp(myColor.background, Colors.black, 0.4),
      appBar: AppBar(
        title: Text('Hand ${onlineState.handNumber} - R${onlineState.currentRound}'),
        backgroundColor: Color.lerp(myColor.background, Colors.black, 0.6),
        foregroundColor: Colors.white,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => _showLeaveConfirmation(),
        ),
        actions: [
          IconButton(
            icon: Icon(_viewMode == _ViewMode.split
                ? Icons.grid_view
                : Icons.view_stream),
            tooltip: _viewMode == _ViewMode.split ? 'Grid View' : 'Split View',
            onPressed: () => setState(() {
              _viewMode = _viewMode == _ViewMode.split
                  ? _ViewMode.grid : _ViewMode.split;
            }),
          ),
          if (onlineState.isInFantasyland)
            Container(
              margin: const EdgeInsets.symmetric(horizontal: 4),
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.amber[700],
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.auto_awesome, size: 14, color: Colors.white),
                  SizedBox(width: 4),
                  Text('FL', style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
        ],
      ),
      body: Stack(
        children: [
          SafeArea(
            child: Column(
              children: [
                // Opponent disconnect banner
                if (onlineState.disconnectedPlayers.isNotEmpty)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    color: Colors.orange[800],
                    child: Row(
                      children: [
                        const Icon(Icons.person_off, color: Colors.white, size: 16),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            '${onlineState.disconnectedPlayers.length} player(s) disconnected. Waiting for reconnect...',
                            style: const TextStyle(color: Colors.white, fontSize: 12),
                          ),
                        ),
                      ],
                    ),
                  ),
                // Score display
                if (onlineState.gameState != null) ...[
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                    child: _buildScoreBar(onlineState),
                  ),
                ],
                // Timer progress bar
                if (_totalTime > 0 && _timeRemaining > 0)
                  _buildTimerBar(),
            // Folded banner
            if (onlineState.isFolded)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                color: Colors.blueGrey[700],
                child: const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.visibility, color: Colors.white70, size: 16),
                    SizedBox(width: 8),
                    Text(
                      'Folded — Spectating',
                      style: TextStyle(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
              ),
            if (onlineState.isFolded) ...[
              // Spectator mode
              if (_viewMode == _ViewMode.split)
                Expanded(
                  child: OpponentPageView(
                    opponents: _buildAllPlayers(onlineState, notifier),
                  ),
                )
              else
                Expanded(
                  child: BoardGridView(
                    opponents: _buildAllPlayers(onlineState, notifier),
                  ),
                ),
            ] else ...[
              if (_viewMode == _ViewMode.split && opponents.length <= 1) ...[
                // Split View: 2인 전용 — opponent + my board
                Expanded(
                  child: OpponentPageView(
                    opponents: opponents,
                  ),
                ),
                Expanded(
                  child: _buildMyBoardSection(myBoard, availableLines),
                ),
              ] else ...[
                // Grid View: 3인+ 자동 전환 또는 수동 선택
                Expanded(
                  child: BoardGridView(
                    opponents: opponents,
                    myPlayerId: onlineState.playerId,
                    myBoard: myBoard,
                    availableLines: availableLines,
                    onCardPlaced: _onCardPlaced,
                    onUndoCard: _onTapPlacedCard,
                    currentTurnPlacements: _localPlacements,
                    foulWarning: _buildCompactFoulWarning(myBoard),
                    mySeatIndex: _getSeatIndex(onlineState.playerId),
                  ),
                ),
              ],
              Padding(
                padding: EdgeInsets.symmetric(horizontal: isCompact ? 8 : 16),
                child: HandWidget(
                  cards: onlineState.isInFantasyland
                      ? _sortCards(onlineState.hand, _sortMode)
                      : onlineState.hand,
                  showDiscardButtons: isPineapple,
                  hasDiscarded: _hasDiscarded,
                  onDiscard: _onDiscard,
                  onCardTap: null,
                  onConfirm: _canConfirm() ? _onConfirm : null,
                  canConfirm: _canConfirm(),
                  onSortByRank: onlineState.isInFantasyland && onlineState.hand.isNotEmpty
                      ? () => setState(() => _sortMode = _OnlineSortMode.byRank)
                      : null,
                  onSortBySuit: onlineState.isInFantasyland && onlineState.hand.isNotEmpty
                      ? () => setState(() => _sortMode = _OnlineSortMode.bySuit)
                      : null,
                  onAutoArrange: onlineState.isInFantasyland && onlineState.hand.isNotEmpty
                      ? _onAutoArrange
                      : null,
                ),
              ),
              Padding(
                padding: EdgeInsets.all(isCompact ? 8 : 16),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    if (_localPlacements.length > 1 || (_localPlacements.isNotEmpty && _hasDiscarded))
                      ElevatedButton.icon(
                        onPressed: _onUndoAll,
                        icon: const Icon(Icons.restart_alt, size: 18),
                        label: Text('Undo All',
                            style: TextStyle(fontSize: isCompact ? 13 : 15)),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.red[700],
                          foregroundColor: Colors.white,
                          padding: EdgeInsets.symmetric(
                              horizontal: isCompact ? 12 : 20, vertical: 10),
                        ),
                      ),
                    if (_localPlacements.length > 1 || (_localPlacements.isNotEmpty && _hasDiscarded)) const SizedBox(width: 8),
                    if (_localPlacements.isNotEmpty)
                      ElevatedButton.icon(
                        onPressed: _onUndoCard,
                        icon: const Icon(Icons.undo, size: 18),
                        label: Text('Undo',
                            style: TextStyle(fontSize: isCompact ? 13 : 15)),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.orange[700],
                          foregroundColor: Colors.white,
                          padding: EdgeInsets.symmetric(
                              horizontal: isCompact ? 12 : 20, vertical: 10),
                        ),
                      ),
                    if (_localPlacements.isNotEmpty) const SizedBox(width: 8),
                    if (_hasDiscarded && _discardedCard != null)
                      ElevatedButton.icon(
                        onPressed: _onUndoDiscard,
                        icon: const Icon(Icons.undo, size: 18),
                        label: Text('Undo Discard',
                            style: TextStyle(fontSize: isCompact ? 13 : 15)),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.deepOrange[700],
                          foregroundColor: Colors.white,
                          padding: EdgeInsets.symmetric(
                              horizontal: isCompact ? 12 : 20, vertical: 10),
                        ),
                      ),
                    if (_hasDiscarded && _discardedCard != null) const SizedBox(width: 8),
                    if (!(isPineapple &&
                        onlineState.hand.isEmpty &&
                        _canConfirm()))
                      ElevatedButton(
                        onPressed: _canConfirm() ? _onConfirm : null,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.green[600],
                          foregroundColor: Colors.white,
                          padding: EdgeInsets.symmetric(
                              horizontal: isCompact ? 16 : 24, vertical: 12),
                        ),
                        child: Text('Confirm',
                            style: TextStyle(fontSize: isCompact ? 14 : 16)),
                      ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
      if (onlineState.connectionState == OnlineConnectionState.reconnecting)
        _buildReconnectingOverlay(),
      if (onlineState.connectionState == OnlineConnectionState.error &&
          onlineState.errorMessage != null)
        _buildErrorOverlay(onlineState),
      ],
      ),
    );
  }

  Widget _buildReconnectingOverlay() {
    return Container(
      color: Colors.black54,
      child: const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(color: Colors.white),
            SizedBox(height: 16),
            Text('Reconnecting...', style: TextStyle(color: Colors.white, fontSize: 18)),
          ],
        ),
      ),
    );
  }

  Widget _buildErrorOverlay(OnlineState onlineState) {
    return Container(
      color: Colors.black54,
      child: Center(
        child: Card(
          margin: const EdgeInsets.all(32),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.wifi_off, size: 48, color: Colors.red),
                const SizedBox(height: 16),
                Text(
                  onlineState.errorMessage ?? 'Connection lost',
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 24),
                ElevatedButton.icon(
                  icon: const Icon(Icons.refresh),
                  label: const Text('Retry Connection'),
                  onPressed: () {
                    ref.read(onlineGameNotifierProvider.notifier).autoReconnect();
                  },
                ),
                const SizedBox(height: 8),
                TextButton(
                  child: const Text('Back to Home'),
                  onPressed: () {
                    ref.read(onlineGameNotifierProvider.notifier).disconnect();
                    Navigator.of(context).popUntil((route) => route.isFirst);
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  List<Player> _buildOpponents(
      OnlineState onlineState, OnlineGameNotifier notifier) {
    final gameState = onlineState.gameState;
    if (gameState == null || onlineState.playerId == null) return [];

    final players = gameState['players'] as Map<String, dynamic>?;
    final scores = gameState['scores'] as Map<String, dynamic>?;
    final activePlayers = gameState['activePlayers'] as List<dynamic>? ?? [];
    if (players == null) return [];

    final opponents = <Player>[];
    for (final entry in players.entries) {
      if (entry.key == onlineState.playerId) continue;
      final data = entry.value as Map<String, dynamic>;
      final boardJson = data['board'] as Map<String, dynamic>?;
      final board = notifier.parseBoard(boardJson) ?? OFCBoard();
      final name = data['name'] as String? ?? 'Opponent';
      final inFL = data['inFantasyland'] as bool? ?? false;
      final score = scores?[entry.key] as int? ?? 0;
      final seatIdx = activePlayers.indexOf(entry.key);
      opponents.add(Player(
        id: entry.key,
        name: name,
        board: board,
        isInFantasyland: inFL,
        score: score,
        seatIndex: seatIdx >= 0 ? seatIdx : 0,
      ));
    }
    return opponents;
  }

  /// Spectator mode: all players including self
  List<Player> _buildAllPlayers(
      OnlineState onlineState, OnlineGameNotifier notifier) {
    final gameState = onlineState.gameState;
    if (gameState == null) return [];

    final players = gameState['players'] as Map<String, dynamic>?;
    final scores = gameState['scores'] as Map<String, dynamic>?;
    final activePlayers = gameState['activePlayers'] as List<dynamic>? ?? [];
    if (players == null) return [];

    final allPlayers = <Player>[];
    for (final entry in players.entries) {
      final data = entry.value as Map<String, dynamic>;
      final boardJson = data['board'] as Map<String, dynamic>?;
      final board = notifier.parseBoard(boardJson) ?? OFCBoard();
      final name = data['name'] as String? ?? entry.key;
      final inFL = data['inFantasyland'] as bool? ?? false;
      final score = scores?[entry.key] as int? ?? 0;
      final seatIdx = activePlayers.indexOf(entry.key);
      allPlayers.add(Player(
        id: entry.key,
        name: name,
        board: board,
        isInFantasyland: inFL,
        score: score,
        seatIndex: seatIdx >= 0 ? seatIdx : 0,
      ));
    }
    return allPlayers;
  }

  void _onTapPlacedCard(ofc.Card card, String line) {
    final idx = _localPlacements.indexWhere(
      (p) => p.card == card && p.line == line,
    );
    if (idx == -1) return;
    _localPlacements.removeAt(idx);
    ref.read(onlineGameNotifierProvider.notifier).unplaceCard(card, line);
    setState(() {});
  }

  void _onUndoCard() {
    if (_localPlacements.isEmpty) return;
    final last = _localPlacements.removeLast();
    final notifier = ref.read(onlineGameNotifierProvider.notifier);
    notifier.unplaceCard(last.card, last.line);
    setState(() {});
  }

  void _onUndoDiscard() {
    if (_discardedCard == null) return;
    final notifier = ref.read(onlineGameNotifierProvider.notifier);
    notifier.undiscardCard(_discardedCard!);
    setState(() {
      _hasDiscarded = false;
      _discardedCard = null;
    });
  }

  void _onUndoAll() {
    final notifier = ref.read(onlineGameNotifierProvider.notifier);
    // 배치 역순으로 되돌리기
    for (final p in _localPlacements.reversed.toList()) {
      notifier.unplaceCard(p.card, p.line);
    }
    // 버림도 되돌리기
    if (_hasDiscarded && _discardedCard != null) {
      notifier.undiscardCard(_discardedCard!);
    }
    setState(() {
      _localPlacements.clear();
      _hasDiscarded = false;
      _discardedCard = null;
    });
  }

  void _showLeaveConfirmation() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Leave Game?'),
        content: const Text(
            'Are you sure you want to leave? This will forfeit the game.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () {
              ref.read(onlineGameNotifierProvider.notifier).leaveGame();
              Navigator.pop(ctx);
              Navigator.of(context).popUntil((route) => route.isFirst);
            },
            child:
                const Text('Leave', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  Widget _buildScoreBar(OnlineState onlineState) {
    final scores =
        onlineState.gameState?['scores'] as Map<String, dynamic>?;
    final players =
        onlineState.gameState?['players'] as Map<String, dynamic>?;
    if (scores == null || players == null) return const SizedBox.shrink();

    final activePlayers = onlineState.gameState?['activePlayers'] as List<dynamic>? ?? [];

    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: scores.entries.map((entry) {
        final name = (players[entry.key]
                as Map<String, dynamic>?)?['name'] ??
            entry.key;
        final score = entry.value as int? ?? 0;
        final isMe = entry.key == onlineState.playerId;
        final seatIdx = activePlayers.indexOf(entry.key);
        final color = PlayerColors.forSeat(seatIdx >= 0 ? seatIdx : 0);
        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Chip(
            backgroundColor: isMe ? color.primary : color.background,
            label: Text(
              '$name: $score',
              style: TextStyle(
                color: Colors.white,
                fontWeight: isMe ? FontWeight.bold : FontWeight.normal,
                fontSize: 12,
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildMyBoardSection(OFCBoard board, List<String> availableLines) {
    final myColor = _getMyColor();
    return Container(
      decoration: BoxDecoration(
        color: myColor.background.withValues(alpha: 0.3),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: myColor.border, width: 2),
      ),
      margin: const EdgeInsets.symmetric(horizontal: 8),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            child: Row(
              children: [
                const Icon(Icons.person, size: 14, color: Colors.white70),
                const SizedBox(width: 4),
                const Text('My Board',
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        color: Colors.white)),
                const Spacer(),
                _buildCompactFoulWarning(board) ?? const SizedBox.shrink(),
              ],
            ),
          ),
          Expanded(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Padding(
                padding: const EdgeInsets.all(4),
                child: BoardWidget(
                  board: board,
                  availableLines: availableLines,
                  onCardPlaced: _onCardPlaced,
                  currentTurnPlacements: _localPlacements,
                  onUndoCard: _onTapPlacedCard,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget? _buildCompactFoulWarning(OFCBoard board) {
    if (board.top.isEmpty && board.mid.isEmpty && board.bottom.isEmpty) {
      return null;
    }
    if (!board.isFull()) return null;
    if (!checkFoul(board)) return null;

    return const Icon(Icons.warning_amber_rounded, color: Colors.yellow, size: 14);
  }

  void _showHandScoredDialog(Map<String, dynamic>? payload) {
    if (payload == null) return;
    final results = payload['results'] as Map<String, dynamic>?;
    final handNumber = payload['handNumber'] as int? ?? 0;

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: Text('Hand $handNumber Results'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (results != null)
                ...results.entries.map((e) {
                  final data = e.value as Map<String, dynamic>;
                  final name = data['name'] as String? ?? e.key;
                  final score = data['totalScore'] as int? ?? 0;
                  final foul = data['foul'] as bool? ?? false;
                  final lineResults = data['lineResults'] as Map<String, dynamic>? ?? {};

                  return ExpansionTile(
                    initiallyExpanded: e.key == ref.read(onlineGameNotifierProvider).playerId,
                    tilePadding: EdgeInsets.zero,
                    title: Text(
                      '$name: ${score >= 0 ? "+$score" : "$score"} pts${foul ? ' (Foul)' : ''}',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 14,
                        color: foul ? Colors.red : (score > 0 ? Colors.green : null),
                      ),
                    ),
                    children: [
                      if (lineResults.isNotEmpty)
                        ...lineResults.entries.map((lr) {
                          final oppId = lr.key;
                          final detail = lr.value as Map<String, dynamic>;
                          final lines = detail['lines'] as Map<String, dynamic>? ?? {};
                          final oppName = (results[oppId] as Map<String, dynamic>?)?['name'] ?? oppId;
                          final scoopBonus = detail['scoopBonus'] as int? ?? 0;
                          final royaltyDiff = detail['royaltyDiff'] as int? ?? 0;
                          final total = detail['total'] as int? ?? 0;

                          return Padding(
                            padding: const EdgeInsets.only(left: 8, bottom: 8),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('vs $oppName', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                                const SizedBox(height: 4),
                                ...['top', 'mid', 'bottom'].where((l) => lines.containsKey(l)).map((l) {
                                  final ld = lines[l] as Map<String, dynamic>;
                                  final result = ld['result'] as int? ?? 0;
                                  final icon = result > 0 ? 'W' : (result < 0 ? 'L' : 'D');
                                  final color = result > 0 ? Colors.green : (result < 0 ? Colors.red : Colors.grey);
                                  return Padding(
                                    padding: const EdgeInsets.symmetric(vertical: 1),
                                    child: Row(
                                      children: [
                                        SizedBox(width: 50, child: Text(l.toUpperCase(), style: const TextStyle(fontSize: 11))),
                                        Text(ld['myHand'] as String? ?? '', style: const TextStyle(fontSize: 11)),
                                        const Text(' vs ', style: TextStyle(fontSize: 10, color: Colors.grey)),
                                        Expanded(child: Text(ld['oppHand'] as String? ?? '', style: const TextStyle(fontSize: 11))),
                                        Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                                          decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(4)),
                                          child: Text(icon, style: const TextStyle(fontSize: 10, color: Colors.white, fontWeight: FontWeight.bold)),
                                        ),
                                      ],
                                    ),
                                  );
                                }),
                                const Divider(height: 8),
                                Row(
                                  children: [
                                    if (scoopBonus != 0) Text('Scoop ${scoopBonus > 0 ? "+$scoopBonus" : "$scoopBonus"}  ', style: TextStyle(fontSize: 11, color: Colors.amber[700])),
                                    if (royaltyDiff != 0) Text('Royalty ${royaltyDiff > 0 ? "+$royaltyDiff" : "$royaltyDiff"}  ', style: TextStyle(fontSize: 11, color: Colors.purple[300])),
                                    const Spacer(),
                                    Text('Total: ${total >= 0 ? "+$total" : "$total"}', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: total > 0 ? Colors.green : (total < 0 ? Colors.red : null))),
                                  ],
                                ),
                              ],
                            ),
                          );
                        }),
                    ],
                  );
                }),
            ],
          ),
        ),
        actions: [
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Next Hand'),
          ),
        ],
      ),
    );
  }

  void _showGameOverDialog(Map<String, dynamic>? gameState) {
    if (gameState == null) return;

    final results = gameState['results'] as Map<String, dynamic>?;

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: const Text('Game Over'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (results != null)
              ...results.entries.map((e) {
                final data = e.value as Map<String, dynamic>;
                final name = data['name'] as String? ?? e.key;
                final score = data['totalScore'] as int? ?? 0;
                final foul = data['foul'] as bool? ?? false;
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Text(
                    '$name: $score points${foul ? ' (Foul)' : ''}',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: foul ? Colors.red : null,
                    ),
                  ),
                );
              }),
          ],
        ),
        actions: [
          ElevatedButton(
            onPressed: () {
              ref.read(onlineGameNotifierProvider.notifier).disconnect();
              Navigator.of(ctx).pop();
              Navigator.of(context).popUntil((route) => route.isFirst);
            },
            child: const Text('Back to Home'),
          ),
        ],
      ),
    );
  }
}
