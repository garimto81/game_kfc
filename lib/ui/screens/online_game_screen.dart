import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../models/card.dart' as ofc;
import '../../models/board.dart';
import '../../models/player.dart';
import '../../logic/foul_checker.dart';
import '../../logic/hand_evaluator.dart';
import '../../logic/simple_ai.dart';
import '../../providers/online_game_provider.dart';
import '../../logic/effect_manager.dart';
import '../../services/audio_service.dart';
import '../../providers/settings_provider.dart';
import '../theme/player_colors.dart';
import '../theme/table_themes.dart';
import '../widgets/board_grid_view.dart';
import '../widgets/board_widget.dart';
import '../widgets/emote_picker.dart';
import '../widgets/emote_bubble.dart';
import '../widgets/opponent_page_view.dart';
import '../widgets/hand_widget.dart';

enum _ViewMode { split, grid }

enum _OnlineSortMode { none, byRank, bySuit }

class OnlineGameScreen extends ConsumerStatefulWidget {
  const OnlineGameScreen({super.key});

  @override
  ConsumerState<OnlineGameScreen> createState() => _OnlineGameScreenState();
}

class _OnlineGameScreenState extends ConsumerState<OnlineGameScreen>
    with TickerProviderStateMixin, WidgetsBindingObserver {
  bool _hasDiscarded = false;
  ofc.Card? _discardedCard;
  final List<({ofc.Card card, String line, bool impact})> _localPlacements = [];
  final EffectManager _effectManager = EffectManager();
  _OnlineSortMode _sortMode = _OnlineSortMode.none;
  _ViewMode _viewMode = _ViewMode.split;

  // Foul 연출 상태
  bool _foulTriggered = false;

  // Emote state
  bool _showEmotePicker = false;
  final Map<String, String> _activeEmotes = {}; // playerId -> emoteId
  DateTime? _lastEmoteSent;

  // Timer state
  Timer? _countdownTimer;
  double _timeRemaining = 0;
  double _totalTime = 0;
  double? _lastDeadline;

  // Turn highlight animation
  bool _turnHighlight = false;
  Timer? _turnHighlightTimer;
  Timer? _lineCelebTimer;
  late AnimationController _turnPulseController;

  // HandScored dialog tracking — store dialog's own BuildContext for safe pop
  BuildContext? _handScoredDialogContext;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    AudioService.instance.init();
    _turnPulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );
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
  void didChangeAppLifecycleState(AppLifecycleState state) {
    super.didChangeAppLifecycleState(state);
    if (state == AppLifecycleState.resumed) {
      // 포그라운드 복귀 시 연결 상태 확인 → 끊겼으면 즉시 reconnect
      final gs = ref.read(onlineGameNotifierProvider);
      final cs = gs.connectionState;
      if (cs == OnlineConnectionState.playing ||
          cs == OnlineConnectionState.inRoom) {
        // heartbeat 즉시 전송하여 연결 확인 — 실패 시 onDone/onError가 트리거됨
        ref.read(onlineGameNotifierProvider.notifier).pingConnection();
      } else if (cs == OnlineConnectionState.reconnecting ||
                 cs == OnlineConnectionState.error) {
        ref.read(onlineGameNotifierProvider.notifier).autoReconnect();
      }
    } else if (state == AppLifecycleState.paused) {
      AudioService.instance.stopBgm();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _countdownTimer?.cancel();
    _turnHighlightTimer?.cancel();
    _lineCelebTimer?.cancel();
    _turnPulseController.dispose();
    AudioService.instance.stopBgm();
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

  Widget _buildTurnIndicator(OnlineState onlineState) {
    if (onlineState.isMyTurn) {
      return Semantics(
        label: 'turn-indicator-my-turn',
        child: AnimatedBuilder(
        animation: _turnPulseController,
        builder: (context, child) {
          final color = _turnHighlight
              ? Color.lerp(Colors.green[700], Colors.green[300], _turnPulseController.value)!
              : Colors.green[700]!;
          return Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            color: color,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.play_arrow, color: Colors.white, size: 18),
                const SizedBox(width: 8),
                Text(onlineState.isInFantasyland ? 'Fantasyland' : 'Your Turn!',
                    style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold)),
              ],
            ),
          );
        },
      ),
      );
    }

    // Find current turn player name
    final players = onlineState.gameState?['players'] as Map<String, dynamic>?;
    final turnPid = onlineState.currentTurnPlayerId;
    final turnName = (players?[turnPid] as Map<String, dynamic>?)?['name'] ?? 'Opponent';
    final isDealer = turnPid != null && turnPid == onlineState.dealerButtonId;

    return Semantics(
      label: 'turn-indicator-waiting',
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        color: Colors.blueGrey[800],
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.hourglass_top, color: Colors.white70, size: 16),
            const SizedBox(width: 8),
            Text("Waiting for $turnName's turn...",
                style: const TextStyle(color: Colors.white70, fontSize: 13)),
            if (isDealer) ...[
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                decoration: BoxDecoration(
                  color: Colors.amber[700],
                  borderRadius: BorderRadius.circular(4),
                ),
                child: const Text('D', style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildTimerBar() {
    if (_totalTime <= 0 || _timeRemaining <= 0) {
      return const SizedBox.shrink();
    }
    final fraction = (_timeRemaining / _totalTime).clamp(0.0, 1.0);
    final isUrgent = _timeRemaining <= 5;
    final seconds = _timeRemaining.ceil();

    return Semantics(
      label: 'turn-timer',
      child: Padding(
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

  void _sendEmote(String emoteId) {
    final now = DateTime.now();
    if (_lastEmoteSent != null &&
        now.difference(_lastEmoteSent!) < const Duration(seconds: 3)) {
      return; // Rate limit: 1 emote per 3 seconds
    }
    _lastEmoteSent = now;
    final notifier = ref.read(onlineGameNotifierProvider.notifier);
    notifier.sendEmote(emoteId);
  }

  void _onEmoteReceived(String playerId, String emoteId) {
    setState(() {
      _activeEmotes[playerId] = emoteId;
    });
  }

  void _onCardPlaced(ofc.Card card, String line, {String? fromLine}) {
    final onlineState = ref.read(onlineGameNotifierProvider);
    if (!onlineState.isMyTurn) return; // Not my turn
    final notifier = ref.read(onlineGameNotifierProvider.notifier);
    if (fromLine != null) {
      // 보드 내 이동: 소스에서 unplace 후 새 라인에 place
      notifier.unplaceCard(card, fromLine);
      _localPlacements.removeWhere((p) => p.card == card && p.line == fromLine);
    }
    // 트립스+/QQ+ FL 완성 감지: 로컬 배치 반영한 effective 상태 사용
    final lineCards = _getEffectiveLineCards(line);
    final maxCards = line == 'top' ? 3 : 5;
    final isTripsImpact = isImpactPlacement(card, line, lineCards, maxCards);

    notifier.placeCard(card, line);

    // Sound & haptic
    final settings = ref.read(settingsNotifierProvider);
    AudioService.instance.enabled = settings.soundEnabled;
    AudioService.instance.playPlace();
    if (settings.hapticEnabled) HapticFeedback.lightImpact();

    // 로컬 state 변경은 반드시 setState로 감싸야 Flutter rebuild에 반영됨
    if (isTripsImpact) {
      _effectManager.addEarlyWarning(onlineState.handNumber, line, lineCards);
      setState(() {
        _localPlacements.add((card: card, line: line, impact: true));
      });
    } else {
      setState(() {
        _localPlacements.add((card: card, line: line, impact: false));
      });
    }

    _checkCelebration();
    _checkFoulAnimation();
    _tryAutoConfirm();
  }

  /// 라인 완성 시 핸드 강도에 따라 축하 사운드 재생
  void _checkCelebration() {
    final onlineState = ref.read(onlineGameNotifierProvider);
    final handNum = onlineState.handNumber;
    final board = _getMyBoard();
    final lines = {'top': board.top, 'mid': board.mid, 'bottom': board.bottom};

    for (final entry in lines.entries) {
      final maxCards = entry.key == 'top' ? 3 : 5;
      if (entry.value.length == maxCards && _effectManager.getCelebration(handNum, entry.key) == 0) {
        final level = getCelebrationLevel(entry.value, entry.key);
        if (level >= 2) {
          _effectManager.setCelebration(handNum, entry.key, level);
          if (_effectManager.markSoundPlayed(handNum, entry.key)) {
            if (level >= 3) {
              AudioService.instance.playScoop();
            } else {
              AudioService.instance.playWin();
            }
          }
          return;
        }
      }
    }
  }

  /// 보드 완성 시 Foul 감지 → 충격 연출 트리거
  void _checkFoulAnimation() {
    final board = _getMyBoard();
    if (board.isFull() && checkFoul(board) && !_foulTriggered) {
      setState(() => _foulTriggered = true);
      AudioService.instance.playFoul();
      Future.delayed(const Duration(milliseconds: 1500), () {
        if (mounted) setState(() => _foulTriggered = false);
      });
    }
  }

  void _onDiscard(ofc.Card card) {
    final onlineState = ref.read(onlineGameNotifierProvider);
    if (!onlineState.isMyTurn) return; // Not my turn
    final notifier = ref.read(onlineGameNotifierProvider.notifier);
    notifier.discardCard(card);
    AudioService.instance.playDiscard();
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

    // R1: 5장 모두 배치 → 즉시 auto-confirm (discard 불필요)
    if (onlineState.currentRound == 1 && onlineState.hand.isEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _onConfirm();
      });
      return;
    }

    // 4P R4: explicit confirm required, no auto-confirm
    if (_is4pR4(onlineState)) return;

    // R2~R5: 2장 배치 + 1장 버림 → auto-confirm
    if (onlineState.currentRound > 1 &&
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
          _effectManager.clearAll();
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
    _effectManager.clearAll();
    setState(() {
      _hasDiscarded = false;
      _discardedCard = null;
      _localPlacements.clear();
    });
  }

  bool _canConfirm() {
    final onlineState = ref.read(onlineGameNotifierProvider);
    if (!onlineState.isMyTurn) return false;
    if (onlineState.isInFantasyland) {
      // FL: 보드 13장 배치 완료 시 confirm 가능
      final board = _getMyBoard();
      return board.isFull();
    }

    // 4P R4: 2장 모두 배치하면 confirm (discard 불필요)
    final is4pR4 = _is4pR4(onlineState);
    if (is4pR4) {
      return onlineState.hand.isEmpty;
    }

    if (onlineState.hand.isNotEmpty) return false;
    // R1: 5장 모두 배치만 확인, R2+: discard 필수
    if (onlineState.currentRound > 1 && !_hasDiscarded) return false;
    return true;
  }

  bool _is4pR4(OnlineState onlineState) {
    final playerCount = (onlineState.gameState?['players'] as Map?)?.length ?? 0;
    return onlineState.currentRound == 5 && playerCount >= 4;
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

  /// 서버 보드 + 로컬 배치를 통합한 라인 카드 반환 (stale 상태 방지)
  List<ofc.Card> _getEffectiveLineCards(String line) {
    final board = _getMyBoard();
    final serverCards = line == 'top'
        ? board.top
        : line == 'mid'
            ? board.mid
            : board.bottom;
    final localOnLine = _localPlacements
        .where((p) => p.line == line)
        .map((p) => p.card);
    final effective = [...serverCards];
    for (final lc in localOnLine) {
      if (!effective.contains(lc)) effective.add(lc);
    }
    return effective;
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
        _effectManager.clearAll();
      }
      if (next.connectionState == OnlineConnectionState.gameOver &&
          prev?.connectionState != OnlineConnectionState.gameOver) {
        _showGameOverDialog(next.gameState);
      }
      // handScored: 핸드 간 점수 표시
      if (next.phase == 'handScored' && prev?.phase != 'handScored') {
        _showHandScoredDialog(next.gameState);
      }
      // === Audio & Haptic hooks ===
      final settings = ref.read(settingsNotifierProvider);
      AudioService.instance.enabled = settings.soundEnabled;

      // Turn notification sound
      if (next.isMyTurn && prev?.isMyTurn != true) {
        AudioService.instance.playTurnNotify();
        if (settings.hapticEnabled) HapticFeedback.mediumImpact();
      }
      // Hand scored
      if (next.phase == 'handScored' && prev?.phase != 'handScored') {
        AudioService.instance.playScore();
      }
      // New hand dealt
      if (prev?.hand.isEmpty == true && next.hand.isNotEmpty) {
        AudioService.instance.playDeal();
      }
      // Turn highlight animation — pulse for 3 seconds
      if (next.isMyTurn && prev?.isMyTurn != true) {
        setState(() => _turnHighlight = true);
        _turnPulseController.repeat(reverse: true);
        _turnHighlightTimer?.cancel();
        _turnHighlightTimer = Timer(const Duration(seconds: 3), () {
          if (mounted) {
            _turnPulseController.stop();
            _turnPulseController.value = 0;
            setState(() => _turnHighlight = false);
          }
        });
      }
      // lineCompleted: 상대 라인 완성 이펙트 — 2초 후 자동 클리어
      if (next.lastLineCompleted != null &&
          next.lastLineCompleted != prev?.lastLineCompleted) {
        _lineCelebTimer?.cancel();
        _lineCelebTimer = Timer(const Duration(seconds: 2), () {
          if (mounted) {
            ref.read(onlineGameNotifierProvider.notifier).clearLineCompleted();
          }
        });
      }
      // Auto-close handScored dialog when phase transitions away
      if (prev?.phase == 'handScored' && next.phase != 'handScored') {
        _closeHandScoredDialog();
      }
      if (prev?.currentRound != next.currentRound ||
          prev?.handNumber != next.handNumber) {
        _effectManager.clearAll();
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
    // 4인 R4: 2장 모두 배치 (버림 없음) → isPineapple=false로 DISCARD UI 비활성화
    final is4pR4 = _is4pR4(onlineState);
    final isPineapple = onlineState.currentRound > 1 && !onlineState.isInFantasyland && !is4pR4;
    final opponents = _buildOpponents(onlineState, notifier);

    final myColor = _getMyColor();

    return Scaffold(
      backgroundColor: Colors.black,
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
            icon: const Icon(Icons.emoji_emotions_outlined),
            tooltip: 'Emotes',
            onPressed: () => setState(() => _showEmotePicker = !_showEmotePicker),
          ),
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
            Semantics(
              label: 'fantasyland-badge',
              child: Container(
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
            ),
        ],
      ),
      body: Stack(
        children: [
          // Theme background
          Positioned.fill(
            child: Builder(builder: (context) {
              final themeId = ref.watch(settingsNotifierProvider).theme;
              final theme = TableThemes.getById(themeId);
              return Image.asset(
                theme.assetPath,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => Container(
                  color: Color.lerp(myColor.background, Colors.black, 0.4),
                ),
              );
            }),
          ),
          AnimatedContainer(
            duration: const Duration(milliseconds: 500),
            decoration: BoxDecoration(
              border: _turnHighlight
                  ? Border.all(color: Colors.greenAccent, width: 3)
                  : null,
            ),
            child: SafeArea(
            child: Column(
              children: [
                // Turn indicator
                if (onlineState.connectionState == OnlineConnectionState.playing && !onlineState.isFolded)
                  _buildTurnIndicator(onlineState),
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
              Semantics(
                label: 'folded-banner',
                child: Container(
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
              ),
            if (onlineState.isFolded) ...[
              // Spectator mode
              if (_viewMode == _ViewMode.split)
                Expanded(
                  child: OpponentPageView(
                    opponents: _buildAllPlayers(onlineState, notifier),
                    myIsInFL: onlineState.isInFantasyland,
                    opponentCelebLines: onlineState.opponentCelebLines,
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
                    myIsInFL: onlineState.isInFantasyland,
                    opponentCelebLines: onlineState.opponentCelebLines,
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
                    effectManager: _effectManager,
                    handNumber: onlineState.handNumber,
                    myIsInFL: onlineState.isInFantasyland,
                    foulWarning: _buildCompactFoulWarning(myBoard),
                    mySeatIndex: _getSeatIndex(onlineState.playerId),
                    showFoulAnimation: _foulTriggered,
                    celebratingPlayerId: onlineState.lastLineCompleted?['playerId'],
                    celebratingLine: onlineState.lastLineCompleted?['line'],
                  ),
                ),
              ],
              Padding(
                padding: EdgeInsets.symmetric(horizontal: isCompact ? 8 : 16),
                child: HandWidget(
                  cards: onlineState.isInFantasyland
                      ? _sortCards(onlineState.hand, _sortMode)
                      : onlineState.hand,
                  enabled: onlineState.isMyTurn,
                  excitedCards: _getExcitedCards(),
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
                      Semantics(
                        label: 'undo-button',
                        child: ElevatedButton.icon(
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
                    // Show confirm button: always for R0 and 4P R4, hide only when auto-confirmed in pineapple rounds
                    if (!(!_is4pR4(onlineState) && isPineapple &&
                        onlineState.hand.isEmpty &&
                        _canConfirm()))
                      Semantics(
                        label: 'confirm-button',
                        child: ElevatedButton(
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
                      ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
      ),
      if (onlineState.connectionState == OnlineConnectionState.reconnecting)
        _buildReconnectingOverlay(),
      if (onlineState.connectionState == OnlineConnectionState.error &&
          onlineState.errorMessage != null)
        _buildErrorOverlay(onlineState),
          // Emote picker overlay
          if (_showEmotePicker)
            Positioned(
              bottom: 120,
              right: 16,
              child: EmotePicker(
                onEmoteSelected: (emoteId) {
                  _sendEmote(emoteId);
                  setState(() => _showEmotePicker = false);
                },
              ),
            ),
          // Active emote bubbles
          for (final entry in _activeEmotes.entries)
            Positioned(
              top: 80,
              left: 16,
              child: EmoteBubble(
                key: ValueKey('emote_${entry.key}_${entry.value}'),
                emoteId: entry.value,
                onDismissed: () {
                  if (mounted) setState(() => _activeEmotes.remove(entry.key));
                },
              ),
            ),
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
                    ref.read(onlineGameNotifierProvider.notifier).leaveGame();
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

  Set<ofc.Card> _getExcitedCards() {
    final onlineState = ref.read(onlineGameNotifierProvider);
    if (!onlineState.isMyTurn || onlineState.hand.isEmpty) return {};
    // 로컬 배치 반영한 effective 라인 상태 사용
    return findExcitingCards(
      onlineState.hand,
      _getEffectiveLineCards('top'),
      _getEffectiveLineCards('mid'),
      _getEffectiveLineCards('bottom'),
    );
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
    _effectManager.clearAll();
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

    return Semantics(
      label: 'score-bar',
      child: Row(
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
            child: Semantics(
              label: 'score-chip-${entry.key}',
              value: '$score',
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
            ),
          );
        }).toList(),
      ),
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
                  effectManager: _effectManager,
                  handNumber: ref.read(onlineGameNotifierProvider).handNumber,
                  onUndoCard: _onTapPlacedCard,
                  showFoulAnimation: _foulTriggered,
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

  void _closeHandScoredDialog() {
    final ctx = _handScoredDialogContext;
    if (ctx != null && ctx.mounted) {
      Navigator.of(ctx).pop();
    }
    _handScoredDialogContext = null;
  }

  void _showHandScoredDialog(Map<String, dynamic>? payload) {
    if (payload == null) return;
    final results = payload['results'] as Map<String, dynamic>?;
    final handNumber = payload['handNumber'] as int? ?? 0;

    // Close any existing handScored dialog before showing new one
    _closeHandScoredDialog();

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) {
        _handScoredDialogContext = ctx;
        return AlertDialog(
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
                  final foul = data['foul'] as bool? ?? data['fouled'] as bool? ?? false;
                  final folded = data['folded'] as bool? ?? false;
                  final lineResults = data['lineResults'] as Map<String, dynamic>? ?? {};
                  final statusLabel = foul ? ' (Foul)' : (folded ? ' (Fold)' : '');

                  return Semantics(
                    label: 'score-player-${e.key}',
                    value: '$score',
                    child: ExpansionTile(
                    initiallyExpanded: e.key == ref.read(onlineGameNotifierProvider).playerId,
                    tilePadding: EdgeInsets.zero,
                    title: Text(
                      '$name: ${score >= 0 ? "+$score" : "$score"} pts$statusLabel',
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

                          // 라인별 로열티 (다이어그램 8-4)
                          final myRoyalties = data['royalties'] as Map<String, dynamic>? ?? {};
                          final oppRoyalties = (results[oppId] as Map<String, dynamic>?)?['royalties'] as Map<String, dynamic>? ?? {};
                          final myRoyaltyTotal = (myRoyalties['total'] as int?) ?? 0;
                          final oppRoyaltyTotal = (oppRoyalties['total'] as int?) ?? 0;

                          // 라인 점수 합계
                          int lineScoreSum = 0;
                          for (final l in ['top', 'mid', 'bottom']) {
                            if (lines.containsKey(l)) {
                              lineScoreSum += ((lines[l] as Map<String, dynamic>)['result'] as int?) ?? 0;
                            }
                          }

                          return Padding(
                            padding: const EdgeInsets.only(left: 8, bottom: 8),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('vs $oppName', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                                const SizedBox(height: 4),
                                // 라인별 결과 + 로열티
                                ...['top', 'mid', 'bottom'].where((l) => lines.containsKey(l)).map((l) {
                                  final ld = lines[l] as Map<String, dynamic>;
                                  final result = ld['result'] as int? ?? 0;
                                  final icon = result > 0 ? 'W' : (result < 0 ? 'L' : 'D');
                                  final color = result > 0 ? Colors.green : (result < 0 ? Colors.red : Colors.grey);
                                  final myR = (myRoyalties[l] as int?) ?? 0;
                                  return Padding(
                                    padding: const EdgeInsets.symmetric(vertical: 1),
                                    child: Row(
                                      children: [
                                        SizedBox(width: 46, child: Text(l.toUpperCase(), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w500))),
                                        Expanded(
                                          child: Text(ld['myHand'] as String? ?? '', style: const TextStyle(fontSize: 11)),
                                        ),
                                        const Text(' vs ', style: TextStyle(fontSize: 10, color: Colors.grey)),
                                        Expanded(
                                          child: Text(ld['oppHand'] as String? ?? '', style: const TextStyle(fontSize: 11)),
                                        ),
                                        Container(
                                          width: 20,
                                          alignment: Alignment.center,
                                          padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 1),
                                          decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(4)),
                                          child: Text(icon, style: const TextStyle(fontSize: 10, color: Colors.white, fontWeight: FontWeight.bold)),
                                        ),
                                        if (myR > 0) ...[
                                          const SizedBox(width: 4),
                                          Text('${myR}pt', style: TextStyle(fontSize: 10, color: Colors.purple[300], fontWeight: FontWeight.w600)),
                                        ],
                                      ],
                                    ),
                                  );
                                }),
                                const Divider(height: 8),
                                // 로열티 비교 행 (다이어그램 8-4 스타일)
                                if (myRoyaltyTotal > 0 || oppRoyaltyTotal > 0)
                                  Padding(
                                    padding: const EdgeInsets.only(bottom: 4),
                                    child: Row(
                                      children: [
                                        Icon(Icons.star, size: 12, color: Colors.purple[300]),
                                        const SizedBox(width: 2),
                                        Text(
                                          'Royalty $myRoyaltyTotal vs $oppRoyaltyTotal',
                                          style: TextStyle(fontSize: 11, color: Colors.purple[300]),
                                        ),
                                        if (royaltyDiff != 0)
                                          Text(
                                            ' (${royaltyDiff > 0 ? "+$royaltyDiff" : "$royaltyDiff"})',
                                            style: TextStyle(fontSize: 11, color: Colors.purple[300], fontWeight: FontWeight.bold),
                                          ),
                                      ],
                                    ),
                                  ),
                                // 점수 분해 공식: Lines ± Scoop ± Royalty = Total
                                Row(
                                  children: [
                                    Text(
                                      'Lines ${lineScoreSum >= 0 ? "+$lineScoreSum" : "$lineScoreSum"}',
                                      style: const TextStyle(fontSize: 11, color: Colors.blueGrey),
                                    ),
                                    if (scoopBonus != 0) Text('  Scoop ${scoopBonus > 0 ? "+$scoopBonus" : "$scoopBonus"}', style: TextStyle(fontSize: 11, color: Colors.amber[700])),
                                    if (royaltyDiff != 0) Text('  Roy ${royaltyDiff > 0 ? "+$royaltyDiff" : "$royaltyDiff"}', style: TextStyle(fontSize: 11, color: Colors.purple[300])),
                                    const Spacer(),
                                    Text('= ${total >= 0 ? "+$total" : "$total"}', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: total > 0 ? Colors.green : (total < 0 ? Colors.red : null))),
                                  ],
                                ),
                              ],
                            ),
                          );
                        }),
                    ],
                  ),
                  );
                }),
            ],
          ),
        ),
        actions: [
          Consumer(
            builder: (ctx, ref, _) {
              final readyState = ref.watch(onlineGameNotifierProvider);
              final readyText = readyState.waitingForReady && readyState.readyTotal > 0
                  ? 'Ready (${readyState.readyCount}/${readyState.readyTotal})'
                  : 'Ready';

              return Semantics(
                label: 'ready-button',
                child: ElevatedButton(
                  onPressed: () {
                    ref.read(onlineGameNotifierProvider.notifier).sendReadyForNextHand();
                  },
                  child: Text(readyText),
                ),
              );
            },
          ),
        ],
      );
      },
    ).then((_) {
      _handScoredDialogContext = null;
    });
  }

  void _showGameOverDialog(Map<String, dynamic>? gameState) {
    if (gameState == null) return;
    // Close handScored dialog if open
    _closeHandScoredDialog();

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
              ref.read(onlineGameNotifierProvider.notifier).leaveGame();
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
