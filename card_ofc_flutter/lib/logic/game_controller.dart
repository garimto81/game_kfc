import '../models/card.dart';
import '../models/game_state.dart';
import '../models/player.dart';
import '../models/board.dart';
import 'deck.dart';
import 'fantasyland.dart';
import 'scoring.dart';

/// OFC Pineapple GameController
///
/// 모든 public 메서드는 GameState를 반환한다. void 반환 금지.
/// Confirm 전 취소 가능 (§2.3): placeCard/discardCard 후 confirmPlacement 전까지 undo 허용
class GameController {
  GameState _state;
  final Deck _deck;
  List<({Card card, String line})> _currentTurnPlacements = [];
  Card? _currentTurnDiscard;

  GameController({Deck? deck})
      : _deck = deck ?? Deck(),
        _state = const GameState(players: []);

  GameState get state => _state;

  // ──────────────────────────────────────────────
  // 게임 시작
  // ──────────────────────────────────────────────

  /// 게임 시작: 덱 셔플, 플레이어 초기화 → 새 GameState 반환
  GameState startGame(List<String> playerNames, {int targetHands = 5}) {
    _deck.reset();
    final players = playerNames.asMap().entries.map((entry) {
      return Player(
        id: 'player_${entry.key}',
        name: entry.value,
        board: OFCBoard(),
        score: 0,
      );
    }).toList();

    _state = GameState(
      players: players,
      currentRound: 0,
      currentPlayerIndex: 0,
      phase: GamePhase.dealing,
      roundPhase: RoundPhase.initial,
      targetHands: targetHands,
    );
    return _state;
  }

  // ──────────────────────────────────────────────
  // 딜링
  // ──────────────────────────────────────────────

  /// Round 0: 5장 딜 → Player.hand 업데이트된 GameState 반환
  GameState dealInitial(String playerId) {
    final cards = _deck.deal(5);
    return _updatePlayerHand(playerId, cards);
  }

  /// Round 1~4: 3장 딜 → GameState 반환
  GameState dealPineapple(String playerId) {
    final cards = _deck.deal(3);
    return _updatePlayerHand(playerId, cards);
  }

  /// Fantasyland 플레이어에게 Progressive 딜링
  /// isInFantasyland=true이면 reEntryCardCount(14장)
  /// isInFantasyland=false이고 보드 완성이면 getEntryCardCount()
  /// 그 외 fallback=14장
  GameState dealFantasyland(String playerId) {
    final player = _getPlayer(playerId);
    int cardCount;
    if (player.isInFantasyland) {
      cardCount = FantasylandChecker.reEntryCardCount;
    } else if (player.board.isFull() &&
        FantasylandChecker.canEnter(player.board)) {
      cardCount = FantasylandChecker.getEntryCardCount(player.board);
    } else {
      cardCount = FantasylandChecker.reEntryCardCount; // fallback
    }
    final cards = _deck.deal(cardCount);
    return _updatePlayerHand(playerId, cards);
  }

  // ──────────────────────────────────────────────
  // 배치 (Confirm 전 취소 가능)
  // ──────────────────────────────────────────────

  /// 카드 배치: Confirm 전 취소 가능 (§2.3)
  /// 반환값: 성공 시 업데이트된 GameState, 실패 시 null (만석 라인, 핸드에 없는 카드 등)
  GameState? placeCard(String playerId, Card card, String line) {
    final player = _getPlayer(playerId);

    // 핸드에 카드가 있는지 확인
    if (!player.hand.contains(card)) return null;

    // 라인 배치 가능 여부 확인
    if (!player.board.canPlace(line)) return null;

    final newBoard = player.board.placeCard(line, card);
    final newHand = List<Card>.from(player.hand)..remove(card);
    final updatedPlayer = player.copyWith(board: newBoard, hand: newHand);

    _currentTurnPlacements.add((card: card, line: line));
    return _replacePlayer(updatedPlayer);
  }

  /// 카드 버림 (Round 1~4: 3장 중 1장 버림)
  /// 반환값: 성공 시 GameState, 실패 시 null (핸드에 없는 카드)
  GameState? discardCard(String playerId, Card card) {
    final player = _getPlayer(playerId);
    if (!player.hand.contains(card)) return null;

    final newHand = List<Card>.from(player.hand)..remove(card);
    final updatedPlayer = player.copyWith(hand: newHand);
    final newDiscard = [..._state.discardPile, card];

    _state = _replacePlayer(updatedPlayer)
        .copyWith(discardPile: newDiscard);
    _currentTurnDiscard = card;
    return _state;
  }

  /// FL 플레이어: 13장 배치 후 나머지 카드 자동 버림 (PRD 2.8)
  GameState discardFantasylandRemainder(String playerId) {
    final player = _getPlayer(playerId);
    final remainder = List<Card>.from(player.hand);
    final updatedPlayer = player.copyWith(hand: []);
    final newDiscard = [..._state.discardPile, ...remainder];

    _state = _replacePlayer(updatedPlayer)
        .copyWith(discardPile: newDiscard);
    return _state;
  }

  // ──────────────────────────────────────────────
  // Undo (Confirm 전 취소)
  // ──────────────────────────────────────────────

  /// 단일 카드 배치 취소: 보드에서 제거, 핸드에 복원
  /// 반환값: 성공 시 업데이트된 GameState, 실패 시 null
  GameState? undoPlaceCard(String playerId, Card card, String line) {
    final idx = _currentTurnPlacements.indexWhere(
      (p) => p.card == card && p.line == line,
    );
    if (idx == -1) return null;

    final player = _getPlayer(playerId);
    final newBoard = player.board.removeCard(line, card);
    final newHand = [...player.hand, card];
    final updatedPlayer = player.copyWith(board: newBoard, hand: newHand);

    _currentTurnPlacements.removeAt(idx);
    return _replacePlayer(updatedPlayer);
  }

  /// 버림 취소: discardPile에서 제거, 핸드에 복원
  /// 반환값: 성공 시 GameState, 실패 시 null
  GameState? undoDiscard(String playerId) {
    if (_currentTurnDiscard == null) return null;

    final card = _currentTurnDiscard!;
    final player = _getPlayer(playerId);
    final newHand = [...player.hand, card];
    final updatedPlayer = player.copyWith(hand: newHand);
    final newDiscard = List<Card>.from(_state.discardPile)..remove(card);

    _currentTurnDiscard = null;
    _state = _replacePlayer(updatedPlayer).copyWith(discardPile: newDiscard);
    return _state;
  }

  /// 현재 턴 모든 배치/버림 일괄 취소
  GameState undoAllCurrentTurn(String playerId) {
    // 먼저 discard 취소
    if (_currentTurnDiscard != null) {
      undoDiscard(playerId);
    }
    // 모든 placement를 역순으로 취소
    for (final p in _currentTurnPlacements.reversed.toList()) {
      undoPlaceCard(playerId, p.card, p.line);
    }
    _currentTurnPlacements = [];
    _currentTurnDiscard = null;
    return _state;
  }

  /// 현재 턴 배치 추적 (읽기 전용)
  List<({Card card, String line})> get currentTurnPlacements =>
      List.unmodifiable(_currentTurnPlacements);

  /// 현재 턴 버림 카드
  Card? get currentTurnDiscard => _currentTurnDiscard;

  // ──────────────────────────────────────────────
  // 배치 확정 및 페이즈 전환
  // ──────────────────────────────────────────────

  /// 현재 플레이어 배치 완료 확인 → 다음 플레이어/라운드 전환
  GameState confirmPlacement(String playerId) {
    _currentTurnPlacements = [];
    _currentTurnDiscard = null;
    final nextPlayerIndex =
        (_state.currentPlayerIndex + 1) % _state.players.length;
    final isLastPlayer = nextPlayerIndex == 0;

    if (!isLastPlayer) {
      _state = _state.copyWith(currentPlayerIndex: nextPlayerIndex);
      return _state;
    }

    // 모든 플레이어 완료 → 라운드 전환
    final nextRound = _state.currentRound + 1;
    if (nextRound > 4) {
      // 모든 라운드 완료 → 점수 계산
      return scoreRound();
    }

    _state = _state.copyWith(
      currentRound: nextRound,
      currentPlayerIndex: 0,
      roundPhase: RoundPhase.pineapple,
    );
    return _state;
  }

  // ──────────────────────────────────────────────
  // 점수 계산 및 Fantasyland 전환
  // ──────────────────────────────────────────────

  /// 모든 라운드 완료 후 점수 계산 → GameState(점수 업데이트) 반환
  GameState scoreRound() {
    final scores = calculateScores(_state.players);
    final updatedPlayers = _state.players.map((p) {
      return p.copyWith(score: p.score + (scores[p.id] ?? 0));
    }).toList();

    _state = _state.copyWith(
      players: updatedPlayers,
      phase: GamePhase.scoring,
    );
    return _state;
  }

  /// Fantasyland 진입자 확인 및 다음 핸드 FL 설정 → GameState 반환
  GameState checkFantasyland() {
    final updatedPlayers = _state.players.map((p) {
      if (FantasylandChecker.canEnter(p.board)) {
        final cardCount = FantasylandChecker.getEntryCardCount(p.board);
        return p.copyWith(
          isInFantasyland: true,
          fantasylandCardCount: cardCount,
        );
      }
      // Re-FL 유지 여부 확인
      if (p.isInFantasyland && FantasylandChecker.canMaintain(p.board)) {
        return p.copyWith(
          isInFantasyland: true,
          fantasylandCardCount: FantasylandChecker.reEntryCardCount,
        );
      }
      return p.copyWith(isInFantasyland: false, fantasylandCardCount: 0);
    }).toList();

    _state = _state.copyWith(
      players: updatedPlayers,
      phase: GamePhase.fantasyland,
    );
    return _state;
  }

  /// 핸드 종료: 점수 계산 → FL 확인 → gameOver 전환 (multi-hand 지원)
  GameState finishHand() {
    if (_state.phase != GamePhase.scoring) {
      scoreRound();
    }
    checkFantasyland();
    final hasFL = _state.players.any((p) => p.isInFantasyland);
    if (!hasFL && _state.handNumber >= _state.targetHands) {
      _state = _state.copyWith(phase: GamePhase.gameOver);
    }
    return _state;
  }

  /// 다음 핸드 시작: 보드/핸드 리셋, 누적 점수 유지, handNumber 증가
  GameState startNextHand() {
    _deck.reset();
    final resetPlayers = _state.players.map((p) {
      return p.copyWith(
        board: OFCBoard(),
        hand: [],
      );
    }).toList();
    _state = _state.copyWith(
      players: resetPlayers,
      currentRound: 0,
      currentPlayerIndex: 0,
      phase: GamePhase.dealing,
      roundPhase: RoundPhase.initial,
      handNumber: _state.handNumber + 1,
      discardPile: [],
    );
    return _state;
  }

  /// FL 플레이어 보드 공개: 비-FL 플레이어 배치 완료 후 호출 (PRD 2.8)
  GameState revealFantasylandBoard(String playerId) {
    // 현재 구현에서는 상태 변경 없음 (공개 여부는 UI 레이어에서 관리)
    return _state;
  }

  // ──────────────────────────────────────────────
  // Private Helpers
  // ──────────────────────────────────────────────

  Player _getPlayer(String playerId) {
    final idx = _state.players.indexWhere((p) => p.id == playerId);
    if (idx == -1) {
      throw StateError('Player not found: $playerId');
    }
    return _state.players[idx];
  }

  GameState _updatePlayerHand(String playerId, List<Card> cards) {
    final player = _getPlayer(playerId);
    final updatedPlayer = player.copyWith(
      hand: [...player.hand, ...cards],
    );
    _state = _replacePlayer(updatedPlayer);
    return _state;
  }

  GameState _replacePlayer(Player updatedPlayer) {
    final updatedPlayers = _state.players.map((p) {
      return p.id == updatedPlayer.id ? updatedPlayer : p;
    }).toList();
    _state = _state.copyWith(players: updatedPlayers);
    return _state;
  }
}
