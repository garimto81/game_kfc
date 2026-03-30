/**
 * royalty.js 단위 테스트 — Node.js assert 기반
 * 실행: node server/game/royalty.test.js
 */
const assert = require('assert');
const {
  calcTopRoyalty,
  calcMidRoyalty,
  calcBottomRoyalty,
  calcTotalRoyalty,
  checkFantasylandEntry,
  checkFantasylandStay
} = require('./royalty');

function card(rank, suit) {
  return { rank, suit };
}

// ── Top 로열티 테스트 ──

function testTopRoyaltyPairsBelow6() {
  // 55 이하 pair → 0
  assert.strictEqual(calcTopRoyalty([card(5, 1), card(5, 2), card(3, 3)]), 0, '55 pair → 0');
  assert.strictEqual(calcTopRoyalty([card(2, 1), card(2, 2), card(3, 3)]), 0, '22 pair → 0');
  console.log('  PASS: testTopRoyaltyPairsBelow6');
}

function testTopRoyaltyPairs() {
  // 66=1, 77=2, 88=3, 99=4, TT=5, JJ=6, QQ=7, KK=8, AA=9
  const expected = { 6: 1, 7: 2, 8: 3, 9: 4, 10: 5, 11: 6, 12: 7, 13: 8, 14: 9 };
  for (const [rank, royalty] of Object.entries(expected)) {
    const r = parseInt(rank);
    const result = calcTopRoyalty([card(r, 1), card(r, 2), card(3, 3)]);
    assert.strictEqual(result, royalty, `${r}${r} pair → ${royalty}`);
  }
  console.log('  PASS: testTopRoyaltyPairs');
}

function testTopRoyaltyTrips() {
  // Trips: 10 + (rank - 2)
  // 22=10, 55=13, TT=18, AA=22
  assert.strictEqual(calcTopRoyalty([card(2, 1), card(2, 2), card(2, 3)]), 10, 'trips 22 → 10');
  assert.strictEqual(calcTopRoyalty([card(5, 1), card(5, 2), card(5, 3)]), 13, 'trips 55 → 13');
  assert.strictEqual(calcTopRoyalty([card(10, 1), card(10, 2), card(10, 3)]), 18, 'trips TT → 18');
  assert.strictEqual(calcTopRoyalty([card(14, 1), card(14, 2), card(14, 3)]), 22, 'trips AA → 22');
  console.log('  PASS: testTopRoyaltyTrips');
}

function testTopRoyaltyHighCard() {
  assert.strictEqual(calcTopRoyalty([card(14, 1), card(13, 2), card(12, 3)]), 0, 'High Card → 0');
  console.log('  PASS: testTopRoyaltyHighCard');
}

// ── Mid 로열티 테스트 ──

function testMidRoyaltyAllTiers() {
  // High Card, One Pair, Two Pair → 0
  assert.strictEqual(calcMidRoyalty([card(2, 1), card(5, 2), card(8, 3), card(10, 4), card(14, 1)]), 0, 'Mid HC → 0');
  assert.strictEqual(calcMidRoyalty([card(10, 1), card(10, 2), card(3, 3), card(7, 4), card(14, 1)]), 0, 'Mid Pair → 0');
  assert.strictEqual(calcMidRoyalty([card(9, 1), card(9, 2), card(5, 3), card(5, 4), card(13, 1)]), 0, 'Mid TwoPair → 0');

  // Trips=2
  assert.strictEqual(calcMidRoyalty([card(7, 1), card(7, 2), card(7, 3), card(10, 4), card(3, 1)]), 2, 'Mid Trips → 2');

  // Straight=4
  assert.strictEqual(calcMidRoyalty([card(5, 1), card(6, 2), card(7, 3), card(8, 4), card(9, 1)]), 4, 'Mid Straight → 4');

  // Flush=8
  assert.strictEqual(calcMidRoyalty([card(2, 3), card(5, 3), card(7, 3), card(9, 3), card(11, 3)]), 8, 'Mid Flush → 8');

  // Full House=12
  assert.strictEqual(calcMidRoyalty([card(10, 1), card(10, 2), card(10, 3), card(5, 1), card(5, 2)]), 12, 'Mid FH → 12');

  // Quads=20
  assert.strictEqual(calcMidRoyalty([card(8, 1), card(8, 2), card(8, 3), card(8, 4), card(3, 1)]), 20, 'Mid Quads → 20');

  // Straight Flush=30
  assert.strictEqual(calcMidRoyalty([card(5, 2), card(6, 2), card(7, 2), card(8, 2), card(9, 2)]), 30, 'Mid SF → 30');

  // Royal Flush=50
  assert.strictEqual(calcMidRoyalty([card(10, 1), card(11, 1), card(12, 1), card(13, 1), card(14, 1)]), 50, 'Mid Royal → 50');

  console.log('  PASS: testMidRoyaltyAllTiers');
}

// ── Bottom 로열티 테스트 ──

function testBottomRoyaltyAllTiers() {
  // HC, Pair, TwoPair, Trips → 0
  assert.strictEqual(calcBottomRoyalty([card(2, 1), card(5, 2), card(8, 3), card(10, 4), card(14, 1)]), 0, 'Bot HC → 0');
  assert.strictEqual(calcBottomRoyalty([card(7, 1), card(7, 2), card(7, 3), card(10, 4), card(3, 1)]), 0, 'Bot Trips → 0');

  // Straight=2
  assert.strictEqual(calcBottomRoyalty([card(5, 1), card(6, 2), card(7, 3), card(8, 4), card(9, 1)]), 2, 'Bot Straight → 2');

  // Flush=4
  assert.strictEqual(calcBottomRoyalty([card(2, 3), card(5, 3), card(7, 3), card(9, 3), card(11, 3)]), 4, 'Bot Flush → 4');

  // Full House=6
  assert.strictEqual(calcBottomRoyalty([card(10, 1), card(10, 2), card(10, 3), card(5, 1), card(5, 2)]), 6, 'Bot FH → 6');

  // Quads=10
  assert.strictEqual(calcBottomRoyalty([card(8, 1), card(8, 2), card(8, 3), card(8, 4), card(3, 1)]), 10, 'Bot Quads → 10');

  // Straight Flush=15
  assert.strictEqual(calcBottomRoyalty([card(5, 2), card(6, 2), card(7, 2), card(8, 2), card(9, 2)]), 15, 'Bot SF → 15');

  // Royal Flush=25
  assert.strictEqual(calcBottomRoyalty([card(10, 1), card(11, 1), card(12, 1), card(13, 1), card(14, 1)]), 25, 'Bot Royal → 25');

  console.log('  PASS: testBottomRoyaltyAllTiers');
}

// ── calcTotalRoyalty 테스트 ──

function testCalcTotalRoyalty() {
  const board = {
    top: [card(14, 1), card(14, 2), card(7, 3)],       // AA pair → 9
    mid: [card(5, 1), card(6, 2), card(7, 3), card(8, 4), card(9, 1)], // Straight → 4
    bottom: [card(10, 1), card(10, 2), card(10, 3), card(5, 1), card(5, 2)]  // FH → 6
  };
  const result = calcTotalRoyalty(board);
  assert.strictEqual(result.top, 9);
  assert.strictEqual(result.mid, 4);
  assert.strictEqual(result.bottom, 6);
  assert.strictEqual(result.total, 19, '합계 9+4+6=19');
  console.log('  PASS: testCalcTotalRoyalty');
}

// ── Fantasyland Entry 테스트 ──

function testFantasylandEntry() {
  // QQ+ → true
  assert.strictEqual(checkFantasylandEntry([card(12, 1), card(12, 2), card(3, 3)]), true, 'QQ → FL 진입');
  assert.strictEqual(checkFantasylandEntry([card(13, 1), card(13, 2), card(3, 3)]), true, 'KK → FL 진입');
  assert.strictEqual(checkFantasylandEntry([card(14, 1), card(14, 2), card(3, 3)]), true, 'AA → FL 진입');

  // JJ → false
  assert.strictEqual(checkFantasylandEntry([card(11, 1), card(11, 2), card(3, 3)]), false, 'JJ → FL 미진입');

  // Trips → true
  assert.strictEqual(checkFantasylandEntry([card(5, 1), card(5, 2), card(5, 3)]), true, 'Trips → FL 진입');

  // High Card → false
  assert.strictEqual(checkFantasylandEntry([card(14, 1), card(13, 2), card(12, 3)]), false, 'HC → FL 미진입');

  // Low pair → false
  assert.strictEqual(checkFantasylandEntry([card(6, 1), card(6, 2), card(3, 3)]), false, '66 → FL 미진입');

  console.log('  PASS: testFantasylandEntry');
}

// ── Fantasyland Stay 테스트 ──

function testFantasylandStay() {
  // Top Trips → true
  const boardTopTrips = {
    top: [card(5, 1), card(5, 2), card(5, 3)],
    mid: [card(6, 1), card(6, 2), card(6, 3), card(3, 1), card(3, 2)],
    bottom: [card(10, 1), card(10, 2), card(10, 3), card(10, 4), card(2, 1)]
  };
  assert.strictEqual(checkFantasylandStay(boardTopTrips), true, 'Top Trips → FL 유지');

  // Mid Quads → true
  const boardMidQuads = {
    top: [card(14, 1), card(14, 2), card(7, 3)],
    mid: [card(8, 1), card(8, 2), card(8, 3), card(8, 4), card(3, 1)],
    bottom: [card(10, 1), card(10, 2), card(10, 3), card(10, 4), card(14, 3)]
  };
  assert.strictEqual(checkFantasylandStay(boardMidQuads), true, 'Mid Quads → FL 유지');

  // Mid SF → true
  const boardMidSF = {
    top: [card(2, 1), card(2, 2), card(3, 3)],
    mid: [card(5, 2), card(6, 2), card(7, 2), card(8, 2), card(9, 2)],
    bottom: [card(10, 1), card(11, 1), card(12, 1), card(13, 1), card(14, 1)]
  };
  assert.strictEqual(checkFantasylandStay(boardMidSF), true, 'Mid SF → FL 유지');

  // Bottom Quads → true
  const boardBotQuads = {
    top: [card(14, 1), card(14, 2), card(7, 3)],
    mid: [card(5, 1), card(6, 2), card(7, 3), card(8, 4), card(9, 1)],
    bottom: [card(10, 1), card(10, 2), card(10, 3), card(10, 4), card(2, 1)]
  };
  assert.strictEqual(checkFantasylandStay(boardBotQuads), true, 'Bot Quads → FL 유지');

  // Bottom SF → true
  const boardBotSF = {
    top: [card(2, 1), card(2, 2), card(3, 3)],
    mid: [card(5, 1), card(6, 2), card(7, 3), card(8, 4), card(9, 1)],
    bottom: [card(5, 2), card(6, 2), card(7, 2), card(8, 2), card(9, 2)]
  };
  assert.strictEqual(checkFantasylandStay(boardBotSF), true, 'Bot SF → FL 유지');

  // 모두 해당 없음 → false
  const boardNoStay = {
    top: [card(14, 1), card(14, 2), card(7, 3)],
    mid: [card(5, 1), card(6, 2), card(7, 3), card(8, 4), card(9, 1)],
    bottom: [card(13, 1), card(13, 2), card(13, 3), card(3, 1), card(3, 2)]
  };
  assert.strictEqual(checkFantasylandStay(boardNoStay), false, '해당 없음 → FL 미유지');

  console.log('  PASS: testFantasylandStay');
}

// 실행
console.log('royalty.js 테스트 시작...');
testTopRoyaltyPairsBelow6();
testTopRoyaltyPairs();
testTopRoyaltyTrips();
testTopRoyaltyHighCard();
testMidRoyaltyAllTiers();
testBottomRoyaltyAllTiers();
testCalcTotalRoyalty();
testFantasylandEntry();
testFantasylandStay();
console.log('모든 테스트 통과!');
