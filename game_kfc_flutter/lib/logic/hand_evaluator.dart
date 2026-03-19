import '../models/card.dart';
import '../models/hand_result.dart';

/// 5장 또는 3장의 카드로 HandResult를 평가합니다.
/// Layer 0: 표준 OFC (수트 순환 우위 없음, 별 강화 없음)
HandResult evaluateHand(List<Card> cards) {
  if (cards.length == 3) {
    return _evaluate3(cards);
  } else if (cards.length == 5) {
    return _evaluate5(cards);
  }
  throw ArgumentError('evaluateHand: 3 또는 5장만 지원합니다. 받은 장수: ${cards.length}');
}

/// h1과 h2를 비교합니다.
/// 반환값: +1 (h1 승), -1 (h2 승), 0 (무승부)
int compareHands(HandResult h1, HandResult h2) {
  if (h1.handType.value != h2.handType.value) {
    return h1.handType.value > h2.handType.value ? 1 : -1;
  }
  // 같은 핸드 타입: 킥커 비교
  final k1 = h1.kickers;
  final k2 = h2.kickers;
  final len = k1.length < k2.length ? k1.length : k2.length;
  for (int i = 0; i < len; i++) {
    if (k1[i] != k2[i]) {
      return k1[i] > k2[i] ? 1 : -1;
    }
  }
  return 0;
}

// ─── 5장 평가 ───────────────────────────────────────────────────────────────

HandResult _evaluate5(List<Card> cards) {
  final ranks = cards.map((c) => c.rank.value).toList()..sort((a, b) => b.compareTo(a));
  final suits = cards.map((c) => c.suit).toSet();
  final isFlush = suits.length == 1;
  final isStraight = _isStraight5(ranks);
  final lowStraight = _isLowStraight5(ranks); // A-2-3-4-5

  if (isFlush && isStraight) {
    // 로얄 플러시: A K Q J T
    if (ranks.first == 14 && ranks[1] == 13) {
      return HandResult(handType: HandType.royalFlush, kickers: const []);
    }
    return HandResult(handType: HandType.straightFlush, kickers: [ranks.first]);
  }
  if (isFlush && lowStraight) {
    return HandResult(handType: HandType.straightFlush, kickers: [5]);
  }

  final groups = _groupByRank(ranks);
  final counts = groups.values.toList()..sort((a, b) => b.compareTo(a));
  final groupRanks = groups.entries.toList()
    ..sort((a, b) {
      if (b.value != a.value) return b.value.compareTo(a.value);
      return b.key.compareTo(a.key);
    });

  if (counts.first == 4) {
    final quadRank = groupRanks.first.key;
    final kicker = groupRanks.last.key;
    return HandResult(handType: HandType.fourOfAKind, kickers: [quadRank, kicker]);
  }

  if (counts.first == 3 && counts[1] == 2) {
    final tripsRank = groupRanks.first.key;
    final pairRank = groupRanks.last.key;
    return HandResult(handType: HandType.fullHouse, kickers: [tripsRank, pairRank]);
  }

  if (isFlush) {
    return HandResult(handType: HandType.flush, kickers: ranks);
  }

  if (isStraight) {
    return HandResult(handType: HandType.straight, kickers: [ranks.first]);
  }
  if (lowStraight) {
    return HandResult(handType: HandType.straight, kickers: [5]);
  }

  if (counts.first == 3) {
    final tripsRank = groupRanks.first.key;
    final kickers = ranks.where((r) => r != tripsRank).toList()..sort((a, b) => b.compareTo(a));
    return HandResult(handType: HandType.threeOfAKind, kickers: [tripsRank, ...kickers]);
  }

  if (counts.first == 2 && counts[1] == 2) {
    final highPair = groupRanks.first.key;
    final lowPair = groupRanks[1].key;
    final kicker = groupRanks.last.key;
    return HandResult(handType: HandType.twoPair, kickers: [highPair, lowPair, kicker]);
  }

  if (counts.first == 2) {
    final pairRank = groupRanks.first.key;
    final kickers = ranks.where((r) => r != pairRank).toList()..sort((a, b) => b.compareTo(a));
    return HandResult(handType: HandType.onePair, kickers: [pairRank, ...kickers]);
  }

  return HandResult(handType: HandType.highCard, kickers: ranks);
}

// ─── 3장 평가 (Top 라인) ────────────────────────────────────────────────────

HandResult _evaluate3(List<Card> cards) {
  final ranks = cards.map((c) => c.rank.value).toList()..sort((a, b) => b.compareTo(a));
  final groups = _groupByRank(ranks);
  final counts = groups.values.toList()..sort((a, b) => b.compareTo(a));
  final groupRanks = groups.entries.toList()
    ..sort((a, b) {
      if (b.value != a.value) return b.value.compareTo(a.value);
      return b.key.compareTo(a.key);
    });

  if (counts.first == 3) {
    return HandResult(handType: HandType.threeOfAKind, kickers: [groupRanks.first.key]);
  }

  if (counts.first == 2) {
    final pairRank = groupRanks.first.key;
    final kicker = groupRanks.last.key;
    return HandResult(handType: HandType.onePair, kickers: [pairRank, kicker]);
  }

  return HandResult(handType: HandType.highCard, kickers: ranks);
}

// ─── 유틸리티 ────────────────────────────────────────────────────────────────

bool _isStraight5(List<int> sortedDesc) {
  if (sortedDesc.length != 5) return false;
  for (int i = 0; i < 4; i++) {
    if (sortedDesc[i] - sortedDesc[i + 1] != 1) return false;
  }
  return true;
}

bool _isLowStraight5(List<int> sortedDesc) {
  // A-2-3-4-5: sorted desc = [14, 5, 4, 3, 2]
  if (sortedDesc.length != 5) return false;
  return sortedDesc[0] == 14 &&
      sortedDesc[1] == 5 &&
      sortedDesc[2] == 4 &&
      sortedDesc[3] == 3 &&
      sortedDesc[4] == 2;
}

Map<int, int> _groupByRank(List<int> ranks) {
  final map = <int, int>{};
  for (final r in ranks) {
    map[r] = (map[r] ?? 0) + 1;
  }
  return map;
}
