import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../models/card.dart' as ofc;
import '../../models/board.dart';
import '../../models/player.dart';
import '../../logic/foul_checker.dart';
import '../../providers/online_game_provider.dart';
import '../widgets/board_widget.dart';
import '../widgets/hand_widget.dart';
import '../widgets/opponent_board_widget.dart';

class OnlineGameScreen extends ConsumerStatefulWidget {
  const OnlineGameScreen({super.key});

  @override
  ConsumerState<OnlineGameScreen> createState() => _OnlineGameScreenState();
}

class _OnlineGameScreenState extends ConsumerState<OnlineGameScreen> {
  bool _hasDiscarded = false;
  ofc.Card? _discardedCard;
  final List<({ofc.Card card, String line})> _localPlacements = [];

  void _onCardPlaced(ofc.Card card, String line) {
    final notifier = ref.read(onlineGameNotifierProvider.notifier);
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
      }
    });

    final screenWidth = MediaQuery.of(context).size.width;
    final isCompact = screenWidth < 400;

    final myBoard = _getMyBoard();
    final availableLines = _getAvailableLines(myBoard);
    // FL이면 discard 버튼 필요 없음 (confirm 시 자동 discard)
    final isPineapple = onlineState.currentRound > 0 && !onlineState.isInFantasyland;
    final opponents = _buildOpponents(onlineState, notifier);

    return Scaffold(
      backgroundColor: Colors.teal[800],
      appBar: AppBar(
        title: Text('Hand ${onlineState.handNumber} - R${onlineState.currentRound}'),
        backgroundColor: Colors.teal[900],
        foregroundColor: Colors.white,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => _showLeaveConfirmation(),
        ),
        actions: [
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
                if (onlineState.opponentDisconnected)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    color: Colors.orange[800],
                    child: const Row(
                      children: [
                        Icon(Icons.person_off, color: Colors.white, size: 16),
                        SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Opponent disconnected. Waiting for reconnect...',
                            style: TextStyle(color: Colors.white, fontSize: 12),
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
            if (opponents.isNotEmpty)
              SizedBox(
                height: isCompact ? 100 : 120,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  children: opponents.map((opp) {
                    return Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: OpponentBoardWidget(
                        opponent: opp,
                        hideCards: opp.isInFantasyland,
                      ),
                    );
                  }).toList(),
                ),
              ),
            const Spacer(),
            _buildFoulWarning(myBoard),
            Padding(
              padding: EdgeInsets.symmetric(horizontal: isCompact ? 8 : 16),
              child: BoardWidget(
                board: myBoard,
                availableLines: availableLines,
                onCardPlaced: _onCardPlaced,
                currentTurnPlacements: _localPlacements,
              ),
            ),
            const SizedBox(height: 16),
            Padding(
              padding: EdgeInsets.symmetric(horizontal: isCompact ? 8 : 16),
              child: HandWidget(
                cards: onlineState.hand,
                showDiscardButtons: isPineapple,
                hasDiscarded: _hasDiscarded,
                onDiscard: _onDiscard,
                onCardTap: null,
                onConfirm: _canConfirm() ? _onConfirm : null,
                canConfirm: _canConfirm(),
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
    if (players == null) return [];

    final opponents = <Player>[];
    for (final entry in players.entries) {
      if (entry.key == onlineState.playerId) continue;
      final data = entry.value as Map<String, dynamic>;
      final boardJson = data['board'] as Map<String, dynamic>?;
      final board = notifier.parseBoard(boardJson) ?? OFCBoard();
      final name = data['name'] as String? ?? 'Opponent';
      final inFL = data['inFantasyland'] as bool? ?? false;
      opponents.add(Player(
        id: entry.key,
        name: name,
        board: board,
        isInFantasyland: inFL,
      ));
    }
    return opponents;
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

    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: scores.entries.map((entry) {
        final name = (players[entry.key]
                as Map<String, dynamic>?)?['name'] ??
            entry.key;
        final score = entry.value as int? ?? 0;
        final isMe = entry.key == onlineState.playerId;
        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Chip(
            backgroundColor: isMe ? Colors.teal[600] : Colors.teal[700],
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

  Widget _buildFoulWarning(OFCBoard board) {
    // 보드가 비어있거나 완성되지 않았으면 foul 체크 불필요
    if (board.top.isEmpty && board.mid.isEmpty && board.bottom.isEmpty) {
      return const SizedBox.shrink();
    }
    // 보드가 가득 찬 경우에만 정확한 foul 판정
    if (!board.isFull()) return const SizedBox.shrink();
    if (!checkFoul(board)) return const SizedBox.shrink();

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.red[800],
        borderRadius: BorderRadius.circular(8),
      ),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.warning_amber_rounded, color: Colors.yellow, size: 18),
          SizedBox(width: 6),
          Text(
            'FOUL! Back >= Mid >= Front violated',
            style: TextStyle(color: Colors.yellow, fontSize: 12),
          ),
        ],
      ),
    );
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
