import '../models/hand_result.dart';
import 'hand_evaluator.dart';
import '../models/card.dart';

/// OFC Pineapple Royalty point tables.
/// Returns the royalty points for a completed line.
class RoyaltyCalculator {
  /// Bottom line royalties (5 cards)
  static int bottomRoyalty(HandType handType) {
    switch (handType) {
      case HandType.straight: return 2;
      case HandType.flush: return 4;
      case HandType.fullHouse: return 6;
      case HandType.fourOfAKind: return 10;
      case HandType.straightFlush: return 15;
      case HandType.royalFlush: return 25;
      default: return 0;
    }
  }

  /// Middle line royalties (5 cards) — doubled vs bottom
  static int midRoyalty(HandType handType) {
    switch (handType) {
      case HandType.threeOfAKind: return 2;
      case HandType.straight: return 4;
      case HandType.flush: return 8;
      case HandType.fullHouse: return 12;
      case HandType.fourOfAKind: return 20;
      case HandType.straightFlush: return 30;
      case HandType.royalFlush: return 50;
      default: return 0;
    }
  }

  /// Top line royalties (3 cards) — pair of 6+ or trips
  static int topRoyalty(HandType handType, List<int> kickers) {
    if (handType == HandType.threeOfAKind) {
      // Trips: 10 + (rank - 2) bonus. e.g. trip 2s = 10, trip As = 22
      final tripRank = kickers.isNotEmpty ? kickers.first : 2;
      return 10 + (tripRank - 2);
    }
    if (handType == HandType.onePair) {
      // Pairs: 66=1, 77=2, 88=3, 99=4, TT=5, JJ=6, QQ=7, KK=8, AA=9
      final pairRank = kickers.isNotEmpty ? kickers.first : 0;
      if (pairRank >= 6) return pairRank - 5;
      return 0;
    }
    return 0;
  }

  /// Calculate royalty for a line given its cards and position.
  /// Returns 0 if the line is not complete.
  static int calculate(String lineName, List<Card> cards) {
    final maxCards = lineName == 'top' ? 3 : 5;
    if (cards.length < maxCards) return 0;

    final result = evaluateHand(cards);
    switch (lineName) {
      case 'top': return topRoyalty(result.handType, result.kickers);
      case 'mid': return midRoyalty(result.handType);
      case 'bottom': return bottomRoyalty(result.handType);
      default: return 0;
    }
  }

  /// Get display label for a hand type.
  static String handLabel(HandType type) {
    switch (type) {
      case HandType.highCard: return 'High';
      case HandType.onePair: return 'Pair';
      case HandType.twoPair: return '2 Pair';
      case HandType.threeOfAKind: return 'Trips';
      case HandType.straight: return 'Str8';
      case HandType.flush: return 'Flush';
      case HandType.fullHouse: return 'Full';
      case HandType.fourOfAKind: return 'Quads';
      case HandType.straightFlush: return 'SF';
      case HandType.royalFlush: return 'Royal';
    }
  }
}
