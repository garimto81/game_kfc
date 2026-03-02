import '../models/board.dart';
import '../models/card.dart';
import '../models/hand_result.dart';
import 'hand_evaluator.dart';
import 'foul_checker.dart';

/// OFC Pineapple Fantasyland 진입/유지/딜링 판정 (PRD 2.8)
class FantasylandChecker {
  // ──────────────────────────────────────────────
  // 진입 조건
  // ──────────────────────────────────────────────

  /// 진입 조건 확인: Top QQ+ 핸드 + 보드 완성 + Foul 아님
  ///
  /// 조건:
  ///   1. board.isFull() == true (13장 모두 배치)
  ///   2. checkFoul(board) == false
  ///   3. evaluateHand(board.top) == ONE_PAIR, kicker rank >= QUEEN
  ///      OR evaluateHand(board.top) == THREE_OF_A_KIND
  static bool canEnter(OFCBoard board) {
    if (!board.isFull()) return false;
    if (checkFoul(board)) return false;
    return _isQQOrBetter(board.top);
  }

  /// Progressive 딜링 카드 수 결정 (PRD 2.8 테이블)
  ///
  /// 전제: canEnter(board) == true인 상태에서 호출
  /// QQ=14, KK=15, AA=16, Trips(any)=17
  static int getEntryCardCount(OFCBoard board) {
    final topResult = evaluateHand(board.top);

    if (topResult.handType == HandType.threeOfAKind) {
      return 17; // Trips
    }

    if (topResult.handType == HandType.onePair) {
      final pairRankValue = _getPairRankValue(topResult);
      if (pairRankValue == Rank.ace.value)  return 16; // AA
      if (pairRankValue == Rank.king.value) return 15; // KK
      return 14; // QQ (기본값, canEnter 통과했으므로 QQ 이상 보장)
    }

    return 14; // fallback (도달 불가)
  }

  // ──────────────────────────────────────────────
  // 유지 조건 (Re-Fantasyland)
  // ──────────────────────────────────────────────

  /// Re-Fantasyland 유지 조건 확인 (PRD 2.8)
  ///
  /// 조건 중 하나라도 충족 시 true:
  ///   - Top: Three of a Kind
  ///   - Mid: Four of a Kind 이상
  ///   - Bottom: Four of a Kind 이상
  static bool canMaintain(OFCBoard board) {
    if (!board.isFull()) return false;

    final topResult    = evaluateHand(board.top);
    final midResult    = evaluateHand(board.mid);
    final bottomResult = evaluateHand(board.bottom);

    if (topResult.handType == HandType.threeOfAKind) return true;
    if (midResult.handType.value >= HandType.fourOfAKind.value) return true;
    if (bottomResult.handType.value >= HandType.fourOfAKind.value) return true;

    return false;
  }

  /// Re-FL 카드 수: 항상 14장 (진입 조건과 무관)
  static const int reEntryCardCount = 14;

  // ──────────────────────────────────────────────
  // Private Helpers
  // ──────────────────────────────────────────────

  static bool _isQQOrBetter(List<Card> topCards) {
    final result = evaluateHand(topCards);
    if (result.handType == HandType.threeOfAKind) return true;
    if (result.handType == HandType.onePair) {
      final pairRankValue = _getPairRankValue(result);
      return pairRankValue != null && pairRankValue >= Rank.queen.value;
    }
    return false;
  }

  /// HandResult.kickers[0]이 페어의 랭크 값을 담고 있음 (hand_evaluator 규약)
  /// kickers는 int 리스트이므로 직접 int 반환
  static int? _getPairRankValue(HandResult result) {
    return result.kickers.isNotEmpty ? result.kickers[0] : null;
  }
}
