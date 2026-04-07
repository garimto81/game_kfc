/**
 * 포커 핸드 평가 모듈
 * 5장 핸드와 3장 핸드(Top) 모두 지원
 */

// 핸드 타입 값 (높을수록 강함)
const HAND_TYPE = {
  HIGH_CARD: 0,
  ONE_PAIR: 1,
  TWO_PAIR: 2,
  THREE_OF_A_KIND: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  FOUR_OF_A_KIND: 7,
  STRAIGHT_FLUSH: 8,
  ROYAL_FLUSH: 9
};

const HAND_TYPE_NAMES = {
  [HAND_TYPE.HIGH_CARD]: 'High Card',
  [HAND_TYPE.ONE_PAIR]: 'One Pair',
  [HAND_TYPE.TWO_PAIR]: 'Two Pair',
  [HAND_TYPE.THREE_OF_A_KIND]: 'Three of a Kind',
  [HAND_TYPE.STRAIGHT]: 'Straight',
  [HAND_TYPE.FLUSH]: 'Flush',
  [HAND_TYPE.FULL_HOUSE]: 'Full House',
  [HAND_TYPE.FOUR_OF_A_KIND]: 'Four of a Kind',
  [HAND_TYPE.STRAIGHT_FLUSH]: 'Straight Flush',
  [HAND_TYPE.ROYAL_FLUSH]: 'Royal Flush'
};

/**
 * 5장 핸드 평가
 * @param {Array} cards - 5장의 카드 배열
 * @returns {{handType: number, handName: string, kickers: number[]}}
 */
function evaluateHand5(cards) {
  if (cards.length !== 5) {
    throw new Error(`5장이 필요합니다. 현재: ${cards.length}장`);
  }

  const ranks = cards.map(c => c.rank).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);

  // 플러시 체크
  const isFlush = suits.every(s => s === suits[0]);

  // 스트레이트 체크
  let isStraight = false;
  let straightHighCard = 0;

  // 일반 스트레이트
  const uniqueRanks = [...new Set(ranks)].sort((a, b) => b - a);
  if (uniqueRanks.length === 5) {
    if (uniqueRanks[0] - uniqueRanks[4] === 4) {
      isStraight = true;
      straightHighCard = uniqueRanks[0];
    }
    // A-2-3-4-5 (Wheel) 스트레이트
    if (uniqueRanks[0] === 14 && uniqueRanks[1] === 5 && uniqueRanks[2] === 4 &&
        uniqueRanks[3] === 3 && uniqueRanks[4] === 2) {
      isStraight = true;
      straightHighCard = 5; // Wheel에서는 5가 하이
    }
  }

  // 랭크별 카운트
  const rankCount = {};
  for (const r of ranks) {
    rankCount[r] = (rankCount[r] || 0) + 1;
  }
  const counts = Object.entries(rankCount)
    .map(([rank, count]) => ({ rank: parseInt(rank), count }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);

  // 로열 플러시
  if (isFlush && isStraight && straightHighCard === 14) {
    return { handType: HAND_TYPE.ROYAL_FLUSH, handName: 'Royal Flush', kickers: [14] };
  }

  // 스트레이트 플러시
  if (isFlush && isStraight) {
    return { handType: HAND_TYPE.STRAIGHT_FLUSH, handName: 'Straight Flush', kickers: [straightHighCard] };
  }

  // 포카드
  if (counts[0].count === 4) {
    const quadRank = counts[0].rank;
    const kicker = counts[1].rank;
    return { handType: HAND_TYPE.FOUR_OF_A_KIND, handName: 'Four of a Kind', kickers: [quadRank, kicker] };
  }

  // 풀하우스
  if (counts[0].count === 3 && counts[1].count === 2) {
    return { handType: HAND_TYPE.FULL_HOUSE, handName: 'Full House', kickers: [counts[0].rank, counts[1].rank] };
  }

  // 플러시
  if (isFlush) {
    return { handType: HAND_TYPE.FLUSH, handName: 'Flush', kickers: ranks };
  }

  // 스트레이트
  if (isStraight) {
    return { handType: HAND_TYPE.STRAIGHT, handName: 'Straight', kickers: [straightHighCard] };
  }

  // 트립스
  if (counts[0].count === 3) {
    const tripRank = counts[0].rank;
    const kickers = counts.filter(c => c.count === 1).map(c => c.rank).sort((a, b) => b - a);
    return { handType: HAND_TYPE.THREE_OF_A_KIND, handName: 'Three of a Kind', kickers: [tripRank, ...kickers] };
  }

  // 투페어
  if (counts[0].count === 2 && counts[1].count === 2) {
    const pairs = [counts[0].rank, counts[1].rank].sort((a, b) => b - a);
    const kicker = counts[2].rank;
    return { handType: HAND_TYPE.TWO_PAIR, handName: 'Two Pair', kickers: [...pairs, kicker] };
  }

  // 원페어
  if (counts[0].count === 2) {
    const pairRank = counts[0].rank;
    const kickers = counts.filter(c => c.count === 1).map(c => c.rank).sort((a, b) => b - a);
    return { handType: HAND_TYPE.ONE_PAIR, handName: 'One Pair', kickers: [pairRank, ...kickers] };
  }

  // 하이카드
  return { handType: HAND_TYPE.HIGH_CARD, handName: 'High Card', kickers: ranks };
}

/**
 * 3장 핸드 평가 (Top 라인)
 * 3장: Three of a Kind > One Pair > High Card
 * @param {Array} cards - 3장의 카드 배열
 * @returns {{handType: number, handName: string, kickers: number[]}}
 */
function evaluateHand3(cards) {
  if (cards.length !== 3) {
    throw new Error(`3장이 필요합니다. 현재: ${cards.length}장`);
  }

  const ranks = cards.map(c => c.rank).sort((a, b) => b - a);

  const rankCount = {};
  for (const r of ranks) {
    rankCount[r] = (rankCount[r] || 0) + 1;
  }
  const counts = Object.entries(rankCount)
    .map(([rank, count]) => ({ rank: parseInt(rank), count }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);

  // 트립스
  if (counts[0].count === 3) {
    return { handType: HAND_TYPE.THREE_OF_A_KIND, handName: 'Three of a Kind', kickers: [counts[0].rank] };
  }

  // 원페어
  if (counts[0].count === 2) {
    const pairRank = counts[0].rank;
    const kicker = counts[1].rank;
    return { handType: HAND_TYPE.ONE_PAIR, handName: 'One Pair', kickers: [pairRank, kicker] };
  }

  // 하이카드
  return { handType: HAND_TYPE.HIGH_CARD, handName: 'High Card', kickers: ranks };
}

/**
 * 라인에 맞는 핸드 평가
 * @param {Array} cards - 카드 배열
 * @param {string} line - "top" | "mid" | "bottom"
 */
function evaluateLine(cards, line) {
  if (line === 'top') {
    return evaluateHand3(cards);
  }
  return evaluateHand5(cards);
}

/**
 * 두 핸드 결과 비교
 * @returns {number} 양수면 a 승리, 음수면 b 승리, 0이면 무승부
 */
function compareHands(handA, handB) {
  // 핸드 타입 비교
  if (handA.handType !== handB.handType) {
    return handA.handType - handB.handType;
  }

  // 킥커 순차 비교
  const maxLen = Math.max(handA.kickers.length, handB.kickers.length);
  for (let i = 0; i < maxLen; i++) {
    const a = handA.kickers[i] || 0;
    const b = handB.kickers[i] || 0;
    if (a !== b) return a - b;
  }

  return 0; // 완전 무승부
}

/**
 * 보드 Foul 체크
 * Bottom >= Mid >= Top (핸드 강도 순서)
 * @param {Object} board - {top: [], mid: [], bottom: []}
 * @returns {boolean} Foul이면 true
 */
function isFoul(board) {
  if (board.top.length !== 3 || board.mid.length !== 5 || board.bottom.length !== 5) {
    return true; // 불완전 보드는 Foul
  }

  const topHand = evaluateHand3(board.top);
  const midHand = evaluateHand5(board.mid);
  const bottomHand = evaluateHand5(board.bottom);

  // Bottom >= Mid 체크
  const bottomVsMid = compareHands(bottomHand, midHand);
  if (bottomVsMid < 0) return true;

  // Mid >= Top 체크 (5장 vs 3장이므로 handType + 전체 kicker 비교)
  const midVsTop = compareHands(midHand, topHand);
  if (midVsTop < 0) return true;

  return false;
}

module.exports = {
  HAND_TYPE,
  HAND_TYPE_NAMES,
  evaluateHand5,
  evaluateHand3,
  evaluateLine,
  compareHands,
  isFoul
};
