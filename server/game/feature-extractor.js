/**
 * OFC Pineapple Feature Extractor
 * board + hand 상태를 수치 벡터로 변환 (ML 모델 입력용)
 */

/**
 * board, hand, round, deadCards → 정규화된 수치 벡터 (62차원)
 *
 * 구조:
 *   [0..25]  board cards: 13 slots × 2 (rank/14, suit/4)
 *   [26..53] hand cards: 14 slots × 2 (rank/14, suit/4)
 *   [54..56] 라인별 채움 비율 (top/3, mid/5, bottom/5)
 *   [57]     라운드 정보 (round/5)
 *   [58..61] dead card 수트별 카운트/13
 *
 * @param {Object} board - { top: [], mid: [], bottom: [] }
 * @param {Array} hand - 현재 손패 카드 배열
 * @param {number} round - 현재 라운드 (1~5)
 * @param {Array} deadCards - 죽은 카드 배열
 * @returns {number[]} 62차원 feature vector
 */
function extractFeatures(board, hand, round, deadCards) {
  const features = [];

  // ── Board cards (13 slots: top 3 + mid 5 + bottom 5) ──
  // 각 카드 → [rank/14, suit/4] (정규화)
  // 빈 슬롯 → [0, 0]
  for (const line of ['top', 'mid', 'bottom']) {
    const maxSlots = line === 'top' ? 3 : 5;
    for (let i = 0; i < maxSlots; i++) {
      if (board[line] && board[line][i]) {
        features.push(board[line][i].rank / 14);
        features.push(board[line][i].suit / 4);
      } else {
        features.push(0, 0);
      }
    }
  }
  // → 26 features (13 cards × 2)

  // ── Hand cards (최대 14장 — Fantasyland) ──
  for (let i = 0; i < 14; i++) {
    if (hand && hand[i]) {
      features.push(hand[i].rank / 14);
      features.push(hand[i].suit / 4);
    } else {
      features.push(0, 0);
    }
  }
  // → 28 features

  // ── 라인별 채움 상태 ──
  features.push((board.top ? board.top.length : 0) / 3);
  features.push((board.mid ? board.mid.length : 0) / 5);
  features.push((board.bottom ? board.bottom.length : 0) / 5);

  // ── 라운드 정보 ──
  features.push((round || 0) / 5);

  // ── Dead card 수트별 카운트 (suit: 1=club, 2=diamond, 3=heart, 4=spade) ──
  const suitCounts = [0, 0, 0, 0];
  if (deadCards) {
    for (const c of deadCards) {
      if (c.suit >= 1 && c.suit <= 4) {
        suitCounts[c.suit - 1]++;
      }
    }
  }
  features.push(...suitCounts.map(c => c / 13));

  // → 총 62 features
  return features;
}

module.exports = { extractFeatures };
