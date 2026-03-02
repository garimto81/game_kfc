import '../models/card.dart';
import '../models/board.dart';
import 'foul_checker.dart';

class PlacementDecision {
  /// 카드 → 라인 매핑 (round 0: 5개, round 1~4: 2개)
  final Map<Card, String> placements;
  /// round 1~4에서 버릴 카드 (round 0에서는 null)
  final Card? discard;

  const PlacementDecision({
    required this.placements,
    this.discard,
  });
}

class SimpleAI {
  /// 주어진 핸드와 현재 보드 상태에서 배치 결정을 반환
  PlacementDecision decide(
    List<Card> hand,
    OFCBoard board,
    int round, // 0=initial, 1~4=pineapple
  ) {
    if (round == 0) {
      return _decideInitial(hand, board);
    } else {
      return _decidePineapple(hand, board);
    }
  }

  // ──────────────────────────────────────────────
  // Fantasyland: 14~17장 → 13장 배치
  // ──────────────────────────────────────────────

  /// FL 플레이어 배치: 14~17장 → 13장 배치 (Bottom→Mid→Top)
  PlacementDecision decideFantasyland(List<Card> hand, OFCBoard board) {
    final sorted = List<Card>.from(hand)
      ..sort((a, b) => b.rank.value.compareTo(a.rank.value));

    var placements = <Card, String>{};
    var tempBoard = board;

    // Bottom(5) → Mid(5) → Top(3) 순으로 greedy 배치
    int placed = 0;
    for (final card in sorted) {
      if (placed >= 13) break;
      final line = _chooseLine(card, tempBoard);
      if (tempBoard.canPlace(line)) {
        placements[card] = line;
        tempBoard = tempBoard.placeCard(line, card);
        placed++;
      }
    }

    // Foul 검사: Foul이면 safe 재배치
    if (tempBoard.isFull() && checkFoul(tempBoard)) {
      placements.clear();
      tempBoard = board;
      placed = 0;
      for (final card in sorted) {
        if (placed >= 13) break;
        String line;
        if (tempBoard.canPlace('bottom')) {
          line = 'bottom';
        } else if (tempBoard.canPlace('mid')) {
          line = 'mid';
        } else {
          line = 'top';
        }
        placements[card] = line;
        tempBoard = tempBoard.placeCard(line, card);
        placed++;
      }
    }

    // 나머지 카드는 discardFantasylandRemainder가 처리
    return PlacementDecision(placements: placements, discard: null);
  }

  // ──────────────────────────────────────────────
  // Round 0: 5장 초기 배치
  // ──────────────────────────────────────────────

  PlacementDecision _decideInitial(List<Card> hand, OFCBoard board) {
    // 랭크 내림차순 정렬
    final sorted = List<Card>.from(hand)
      ..sort((a, b) => b.rank.value.compareTo(a.rank.value));

    var placements = <Card, String>{};
    var tempBoard = board;

    // Foul 방지 시뮬레이션 포함 배치
    placements = _greedyPlace(sorted, tempBoard);

    // Foul 검사
    tempBoard = _applyPlacements(placements, board);
    if (tempBoard.isFull() && checkFoul(tempBoard)) {
      // 재배치 시도
      placements = _safePlace(sorted, board);
    }

    return PlacementDecision(placements: placements, discard: null);
  }

  // ──────────────────────────────────────────────
  // Round 1~4: 3장 파인애플 배치 (2장 배치, 1장 버림)
  // ──────────────────────────────────────────────

  PlacementDecision _decidePineapple(List<Card> hand, OFCBoard board) {
    // 버릴 카드 선택 (가장 낮은 랭크)
    final sorted = List<Card>.from(hand)
      ..sort((a, b) => b.rank.value.compareTo(a.rank.value));

    Card? discard;
    List<Card> toPlace;

    // 전략: 만석 라인에 배치할 수 없는 카드를 버림
    // 우선은 가장 낮은 랭크 카드를 버림 (단순 전략)
    discard = sorted.last;
    toPlace = sorted.sublist(0, sorted.length - 1);

    var placements = <Card, String>{};
    var tempBoard = board;

    placements = _greedyPlace(toPlace, tempBoard);
    tempBoard = _applyPlacements(placements, board);

    // Foul 발생 시 버릴 카드 변경
    if (_wouldCauseFoul(placements, board, toPlace)) {
      // 다른 카드를 버리는 시도
      for (int i = 0; i < sorted.length; i++) {
        final candidate = sorted[i];
        final remaining = List<Card>.from(sorted)..removeAt(i);
        final candidatePlacements = _greedyPlace(remaining, board);
        final simBoard = _applyPlacements(candidatePlacements, board);
        if (!simBoard.isFull() || !checkFoul(simBoard)) {
          discard = candidate;
          placements = candidatePlacements;
          break;
        }
      }
    }

    return PlacementDecision(placements: placements, discard: discard);
  }

  // ──────────────────────────────────────────────
  // Private: 탐욕 배치
  // ──────────────────────────────────────────────

  /// 탐욕적으로 카드를 배치 (랭크 내림차순 기준)
  Map<Card, String> _greedyPlace(List<Card> cards, OFCBoard board) {
    final placements = <Card, String>{};
    var tempBoard = board;

    for (final card in cards) {
      final line = _chooseLine(card, tempBoard);
      placements[card] = line;
      tempBoard = tempBoard.placeCard(line, card);
    }

    return placements;
  }

  /// Foul 방지를 위한 안전 배치 (순열 시도)
  Map<Card, String> _safePlace(List<Card> cards, OFCBoard board) {
    // 단순 전략: bottom 우선 → mid → top 순으로만 배치
    final placements = <Card, String>{};
    var tempBoard = board;

    for (final card in cards) {
      String line;
      if (tempBoard.canPlace('bottom')) {
        line = 'bottom';
      } else if (tempBoard.canPlace('mid')) {
        line = 'mid';
      } else {
        line = 'top';
      }
      placements[card] = line;
      tempBoard = tempBoard.placeCard(line, card);
    }

    return placements;
  }

  /// 라인 선택 우선순위 로직
  String _chooseLine(Card card, OFCBoard board) {
    // 우선순위 1: 페어 완성 시도
    final pairLine = _findPairCompletionLine(card, board);
    if (pairLine != null) return pairLine;

    // 우선순위 2: High cards (K, A) → Bottom 우선
    if (card.rank.value >= Rank.king.value) {
      if (board.canPlace('bottom')) return 'bottom';
      if (board.canPlace('mid')) return 'mid';
      if (board.canPlace('top')) return 'top';
    }

    // 우선순위 3: 빈 슬롯 가장 많은 라인 (Bottom → Mid → Top 순)
    return _lineWithMostSpace(board);
  }

  /// 같은 랭크 카드가 있는 라인 찾기 (페어 완성 시도)
  String? _findPairCompletionLine(Card card, OFCBoard board) {
    // bottom 확인
    if (board.canPlace('bottom') &&
        board.bottom.any((c) => c.rank == card.rank)) {
      return 'bottom';
    }
    // mid 확인
    if (board.canPlace('mid') &&
        board.mid.any((c) => c.rank == card.rank)) {
      return 'mid';
    }
    // top 확인
    if (board.canPlace('top') &&
        board.top.any((c) => c.rank == card.rank)) {
      return 'top';
    }
    return null;
  }

  /// 빈 슬롯이 가장 많은 라인 반환 (Bottom 우선)
  String _lineWithMostSpace(OFCBoard board) {
    final bottomSpace = OFCBoard.bottomMaxCards - board.bottom.length;
    final midSpace = OFCBoard.midMaxCards - board.mid.length;
    final topSpace = OFCBoard.topMaxCards - board.top.length;

    if (bottomSpace >= midSpace && bottomSpace >= topSpace && bottomSpace > 0) {
      return 'bottom';
    }
    if (midSpace >= topSpace && midSpace > 0) {
      return 'mid';
    }
    if (topSpace > 0) {
      return 'top';
    }
    // 모두 만석인 경우 (발생 불가)
    return 'bottom';
  }

  /// 배치 결과 시뮬레이션
  OFCBoard _applyPlacements(Map<Card, String> placements, OFCBoard board) {
    var tempBoard = board;
    for (final entry in placements.entries) {
      tempBoard = tempBoard.placeCard(entry.value, entry.key);
    }
    return tempBoard;
  }

  /// 배치가 Foul을 유발할지 확인
  bool _wouldCauseFoul(
    Map<Card, String> placements,
    OFCBoard board,
    List<Card> cards,
  ) {
    final simBoard = _applyPlacements(placements, board);
    return simBoard.isFull() && checkFoul(simBoard);
  }
}
