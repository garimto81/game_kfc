/**
 * OFC Pineapple 로열티 점수 계산 모듈
 */

const { evaluateHand5, evaluateHand3, HAND_TYPE } = require('./evaluator');

/**
 * Bottom 라인 로열티 계산 (5장)
 * Straight=2, Flush=4, Full House=6, Quads=10, SF=15, Royal=25
 */
function calcBottomRoyalty(cards) {
  const hand = evaluateHand5(cards);

  switch (hand.handType) {
    case HAND_TYPE.ROYAL_FLUSH:
      return 25;
    case HAND_TYPE.STRAIGHT_FLUSH:
      return 15;
    case HAND_TYPE.FOUR_OF_A_KIND:
      return 10;
    case HAND_TYPE.FULL_HOUSE:
      return 6;
    case HAND_TYPE.FLUSH:
      return 4;
    case HAND_TYPE.STRAIGHT:
      return 2;
    default:
      return 0;
  }
}

/**
 * Mid 라인 로열티 계산 (5장)
 * Trips=2, Straight=4, Flush=8, Full House=12, Quads=20, SF=30, Royal=50
 */
function calcMidRoyalty(cards) {
  const hand = evaluateHand5(cards);

  switch (hand.handType) {
    case HAND_TYPE.ROYAL_FLUSH:
      return 50;
    case HAND_TYPE.STRAIGHT_FLUSH:
      return 30;
    case HAND_TYPE.FOUR_OF_A_KIND:
      return 20;
    case HAND_TYPE.FULL_HOUSE:
      return 12;
    case HAND_TYPE.FLUSH:
      return 8;
    case HAND_TYPE.STRAIGHT:
      return 4;
    case HAND_TYPE.THREE_OF_A_KIND:
      return 2;
    default:
      return 0;
  }
}

/**
 * Top 라인 로열티 계산 (3장)
 * Pair 66=1, 77=2, 88=3, 99=4, TT=5, JJ=6, QQ=7, KK=8, AA=9
 * Trips: 10 + (rank - 2)
 */
function calcTopRoyalty(cards) {
  const hand = evaluateHand3(cards);

  if (hand.handType === HAND_TYPE.THREE_OF_A_KIND) {
    const tripRank = hand.kickers[0];
    return 10 + (tripRank - 2);
  }

  if (hand.handType === HAND_TYPE.ONE_PAIR) {
    const pairRank = hand.kickers[0];
    // 66부터 시작 (rank=6 → 1점)
    if (pairRank >= 6) {
      return pairRank - 5; // 6→1, 7→2, ..., 14→9
    }
    return 0;
  }

  return 0;
}

/**
 * 전체 보드 로열티 합산
 * @param {Object} board - {top: [], mid: [], bottom: []}
 * @returns {{top: number, mid: number, bottom: number, total: number}}
 */
function calcTotalRoyalty(board) {
  const top = calcTopRoyalty(board.top);
  const mid = calcMidRoyalty(board.mid);
  const bottom = calcBottomRoyalty(board.bottom);

  return {
    top,
    mid,
    bottom,
    total: top + mid + bottom
  };
}

/**
 * Fantasyland 진입 조건 체크
 * Top에 QQ+ 완성 시 진입
 * @param {Array} topCards - Top 라인 3장
 * @returns {boolean}
 */
function checkFantasylandEntry(topCards) {
  const hand = evaluateHand3(topCards);

  if (hand.handType === HAND_TYPE.THREE_OF_A_KIND) {
    return true;
  }

  if (hand.handType === HAND_TYPE.ONE_PAIR) {
    const pairRank = hand.kickers[0];
    return pairRank >= 12; // QQ 이상
  }

  return false;
}

/**
 * Fantasyland 유지 조건 체크
 * Top Trips, Mid Quads+, Bottom Quads+
 * @param {Object} board - {top: [], mid: [], bottom: []}
 * @returns {boolean}
 */
function checkFantasylandStay(board) {
  // Top Trips
  const topHand = evaluateHand3(board.top);
  if (topHand.handType === HAND_TYPE.THREE_OF_A_KIND) {
    return true;
  }

  // Mid Quads+
  const midHand = evaluateHand5(board.mid);
  if (midHand.handType >= HAND_TYPE.FOUR_OF_A_KIND) {
    return true;
  }

  // Bottom Quads+
  const bottomHand = evaluateHand5(board.bottom);
  if (bottomHand.handType >= HAND_TYPE.FOUR_OF_A_KIND) {
    return true;
  }

  return false;
}

module.exports = {
  calcBottomRoyalty,
  calcMidRoyalty,
  calcTopRoyalty,
  calcTotalRoyalty,
  checkFantasylandEntry,
  checkFantasylandStay
};
