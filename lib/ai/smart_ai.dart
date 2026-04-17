import '../models/card.dart';
import '../models/board.dart';
import '../logic/simple_ai.dart';
import '../logic/foul_checker.dart';
import '../logic/hand_evaluator.dart';
import '../logic/royalty_calculator.dart';

/// SmartAI — Royalty 점수 기반 탐색 AI (오프라인/솔로 플레이용).
///
/// SimpleAI의 greedy 배치를 기반으로 하되, 각 후보 배치를 Royalty 점수로 평가하여
/// 최선의 배치를 선택한다. ONNX 모델 통합은 TODO (prd-ml-autolearn.prd.md §배포).
///
/// 근거:
/// - prd-qa-automation.prd.md B6 (smart_ai.dart 클라이언트 AI)
/// - prd-ml-autolearn.prd.md (Detect→Fix→Learn 루프)
/// - 서버 smart-bot.js (포팅 원본, 1222줄 — 현재 스켈레톤은 최소 기능)
class SmartAI {
  final SimpleAI _fallback = SimpleAI();

  /// 주어진 핸드·보드에서 최선의 배치 결정.
  ///
  /// 라운드별:
  /// - round 0 (R1): 5장 전수 배치 (Top 3 / Mid 5 / Bot 5 중 5장 선택)
  /// - round 1~4 (R2~R5): 3장 중 2장 배치 + 1장 discard
  PlacementDecision decide(
    List<Card> hand,
    OFCBoard board,
    int round,
  ) {
    if (round == 0) {
      return _decideInitial(hand, board);
    }
    return _decidePineapple(hand, board);
  }

  /// FL 플레이어 14~17장 → 13장 배치
  PlacementDecision decideFantasyland(List<Card> hand, OFCBoard board) {
    return _fallback.decideFantasyland(hand, board);
  }

  /// ONNX 모델 기반 추론 (TODO — 현재는 heuristic만 사용)
  ///
  /// 향후 `data/models/latest.onnx` 로드 후 feature vector 입력 → 배치 확률 반환 예정.
  /// prd-ml-autolearn.prd.md §배포(ONNX) 참조.
  bool get onnxAvailable => false;

  // ──────────────────────────────────────────────
  // Round 0: 5장 초기 배치
  // ──────────────────────────────────────────────

  PlacementDecision _decideInitial(List<Card> hand, OFCBoard board) {
    // R1에 5장 전수 배치. SimpleAI decide + Royalty 평가로 best 선택.
    final baseline = _fallback.decide(hand, board, 0);

    // Top Quads 불가 규칙(evaluator.js:210) + Foul 가드는 SimpleAI에서 처리.
    // SmartAI는 SimpleAI 결과를 기본으로 사용하되, Royalty 향상 여지가 있으면 교체.
    final baselineScore = _scoreBoard(_applyPlacements(board, baseline.placements));

    // 간단한 대안: 상위 2장을 Top으로 옮기는 시도 (Pair/Trips Royalty 확보)
    final alternative = _tryTopPairStrategy(hand, board);
    if (alternative != null) {
      final altScore = _scoreBoard(_applyPlacements(board, alternative.placements));
      if (altScore > baselineScore) return alternative;
    }

    return baseline;
  }

  // ──────────────────────────────────────────────
  // Round 1~4: 3장 중 2장 배치
  // ──────────────────────────────────────────────

  PlacementDecision _decidePineapple(List<Card> hand, OFCBoard board) {
    if (hand.length != 3) {
      return _fallback.decide(hand, board, 1);
    }

    PlacementDecision? best;
    double bestScore = double.negativeInfinity;

    for (int discardIdx = 0; discardIdx < 3; discardIdx++) {
      final kept = [for (int i = 0; i < 3; i++) if (i != discardIdx) hand[i]];
      final discard = hand[discardIdx];

      // kept 2장을 어느 라인에 놓을지 모든 조합 시도
      final lines = ['top', 'mid', 'bottom'];
      for (final l1 in lines) {
        for (final l2 in lines) {
          final placements = {kept[0]: l1, kept[1]: l2};
          if (!_isValidPlacement(board, placements)) continue;

          final candidate = _applyPlacements(board, placements);
          if (candidate.isFull() && checkFoul(candidate)) continue;

          final score = _scoreBoard(candidate);
          if (score > bestScore) {
            bestScore = score;
            best = PlacementDecision(placements: placements, discard: discard);
          }
        }
      }
    }

    return best ?? _fallback.decide(hand, board, 1);
  }

  // ──────────────────────────────────────────────
  // 평가·헬퍼
  // ──────────────────────────────────────────────

  /// Board full 여부에 따라 Royalty + potential을 합산한 점수 반환.
  double _scoreBoard(OFCBoard board) {
    if (board.isFull()) {
      if (checkFoul(board)) return -20.0; // Foul 회피 강한 페널티
      final topR = RoyaltyCalculator.calculate('top', board.top);
      final midR = RoyaltyCalculator.calculate('mid', board.mid);
      final botR = RoyaltyCalculator.calculate('bottom', board.bottom);
      return (topR + midR + botR).toDouble();
    }

    // 미완성 보드: 각 라인의 potential 점수 + 강도
    final topScore = _linePotential(board.top, 'top');
    final midScore = _linePotential(board.mid, 'mid');
    final botScore = _linePotential(board.bottom, 'bottom');
    return topScore + midScore + botScore;
  }

  /// 라인별 잠재 점수 (완성 전 평가용).
  double _linePotential(List<Card> cards, String line) {
    if (cards.isEmpty) return 0;
    final rankAvg = cards.map((c) => c.rank.value).reduce((a, b) => a + b) / cards.length;
    // evaluateHand는 3장/5장만 지원하므로 불완전 라인은 rank만 평가
    if (cards.length != 3 && cards.length != 5) return rankAvg;
    final eval = evaluateHand(cards);
    return (eval.handType.index * 5 + rankAvg).toDouble();
  }

  /// 배치 후보의 유효성 (canPlace 확인).
  bool _isValidPlacement(OFCBoard board, Map<Card, String> placements) {
    var tmp = board;
    final counts = <String, int>{};
    for (final e in placements.entries) {
      counts[e.value] = (counts[e.value] ?? 0) + 1;
      if (!tmp.canPlace(e.value)) return false;
      tmp = tmp.placeCard(e.value, e.key);
    }
    return true;
  }

  OFCBoard _applyPlacements(OFCBoard board, Map<Card, String> placements) {
    var tmp = board;
    for (final e in placements.entries) {
      if (tmp.canPlace(e.value)) {
        tmp = tmp.placeCard(e.value, e.key);
      }
    }
    return tmp;
  }

  /// Top Pair/Trips 전략 — 초기 라운드에 QQ+ 만들어 Fantasyland 노림.
  PlacementDecision? _tryTopPairStrategy(List<Card> hand, OFCBoard board) {
    if (board.top.isNotEmpty) return null; // 이미 배치 시작됐으면 스킵

    // 같은 rank 2장 이상이면서 Q+ 있으면 Top에 배치 시도
    final rankGroups = <int, List<Card>>{};
    for (final c in hand) {
      rankGroups.putIfAbsent(c.rank.value, () => []).add(c);
    }

    for (final entry in rankGroups.entries.toList()..sort((a, b) => b.key.compareTo(a.key))) {
      if (entry.value.length >= 2 && entry.key >= 12) {
        // Q+ Pair 발견
        final pair = entry.value.take(2).toList();
        final placements = <Card, String>{
          pair[0]: 'top',
          pair[1]: 'top',
        };
        // 나머지 3장은 강한 것 → Bottom, 약한 것 → Mid
        final rest = hand.where((c) => !pair.contains(c)).toList()
          ..sort((a, b) => b.rank.value.compareTo(a.rank.value));
        if (rest.length >= 3) {
          placements[rest[0]] = 'bottom';
          placements[rest[1]] = 'bottom';
          placements[rest[2]] = 'mid';
        }
        return PlacementDecision(placements: placements, discard: null);
      }
    }
    return null;
  }
}
