/**
 * evaluator.js 단위 테스트 — Node.js assert 기반
 * 실행: node server/game/evaluator.test.js
 */
const assert = require('assert');
const {
  HAND_TYPE,
  evaluateHand5,
  evaluateHand3,
  compareHands,
  isFoul
} = require('./evaluator');

function card(rank, suit) {
  return { rank, suit };
}

// ── evaluateHand5 테스트 ──

function testRoyalFlush() {
  const hand = evaluateHand5([card(10, 1), card(11, 1), card(12, 1), card(13, 1), card(14, 1)]);
  assert.strictEqual(hand.handType, HAND_TYPE.ROYAL_FLUSH, 'Royal Flush handType');
  assert.strictEqual(hand.handName, 'Royal Flush');
  console.log('  PASS: testRoyalFlush');
}

function testStraightFlush() {
  const hand = evaluateHand5([card(5, 2), card(6, 2), card(7, 2), card(8, 2), card(9, 2)]);
  assert.strictEqual(hand.handType, HAND_TYPE.STRAIGHT_FLUSH, 'SF handType');
  assert.deepStrictEqual(hand.kickers, [9], 'SF kicker');
  console.log('  PASS: testStraightFlush');
}

function testFourOfAKind() {
  const hand = evaluateHand5([card(8, 1), card(8, 2), card(8, 3), card(8, 4), card(3, 1)]);
  assert.strictEqual(hand.handType, HAND_TYPE.FOUR_OF_A_KIND);
  assert.deepStrictEqual(hand.kickers, [8, 3]);
  console.log('  PASS: testFourOfAKind');
}

function testFullHouse() {
  const hand = evaluateHand5([card(10, 1), card(10, 2), card(10, 3), card(5, 1), card(5, 2)]);
  assert.strictEqual(hand.handType, HAND_TYPE.FULL_HOUSE);
  assert.deepStrictEqual(hand.kickers, [10, 5]);
  console.log('  PASS: testFullHouse');
}

function testFlush() {
  const hand = evaluateHand5([card(2, 3), card(5, 3), card(7, 3), card(9, 3), card(11, 3)]);
  assert.strictEqual(hand.handType, HAND_TYPE.FLUSH);
  assert.deepStrictEqual(hand.kickers, [11, 9, 7, 5, 2]);
  console.log('  PASS: testFlush');
}

function testStraight() {
  const hand = evaluateHand5([card(5, 1), card(6, 2), card(7, 3), card(8, 4), card(9, 1)]);
  assert.strictEqual(hand.handType, HAND_TYPE.STRAIGHT);
  assert.deepStrictEqual(hand.kickers, [9]);
  console.log('  PASS: testStraight');
}

function testWheelStraight() {
  // A-2-3-4-5 (Wheel) — 가장 낮은 straight
  const hand = evaluateHand5([card(14, 1), card(2, 2), card(3, 3), card(4, 4), card(5, 1)]);
  assert.strictEqual(hand.handType, HAND_TYPE.STRAIGHT, 'Wheel은 Straight');
  assert.deepStrictEqual(hand.kickers, [5], 'Wheel high card = 5');
  console.log('  PASS: testWheelStraight');
}

function testWheelVsNormalStraight() {
  const wheel = evaluateHand5([card(14, 1), card(2, 2), card(3, 3), card(4, 4), card(5, 1)]);
  const normal = evaluateHand5([card(2, 1), card(3, 2), card(4, 3), card(5, 4), card(6, 1)]);
  const cmp = compareHands(wheel, normal);
  assert.ok(cmp < 0, 'Wheel(5) < Normal straight(6)');
  console.log('  PASS: testWheelVsNormalStraight');
}

function testThreeOfAKind() {
  const hand = evaluateHand5([card(7, 1), card(7, 2), card(7, 3), card(10, 4), card(3, 1)]);
  assert.strictEqual(hand.handType, HAND_TYPE.THREE_OF_A_KIND);
  assert.deepStrictEqual(hand.kickers, [7, 10, 3]);
  console.log('  PASS: testThreeOfAKind');
}

function testTwoPair() {
  const hand = evaluateHand5([card(9, 1), card(9, 2), card(5, 3), card(5, 4), card(13, 1)]);
  assert.strictEqual(hand.handType, HAND_TYPE.TWO_PAIR);
  assert.deepStrictEqual(hand.kickers, [9, 5, 13]);
  console.log('  PASS: testTwoPair');
}

function testOnePair() {
  const hand = evaluateHand5([card(11, 1), card(11, 2), card(3, 3), card(7, 4), card(14, 1)]);
  assert.strictEqual(hand.handType, HAND_TYPE.ONE_PAIR);
  assert.deepStrictEqual(hand.kickers, [11, 14, 7, 3]);
  console.log('  PASS: testOnePair');
}

function testHighCard() {
  const hand = evaluateHand5([card(2, 1), card(5, 2), card(8, 3), card(10, 4), card(14, 1)]);
  assert.strictEqual(hand.handType, HAND_TYPE.HIGH_CARD);
  assert.deepStrictEqual(hand.kickers, [14, 10, 8, 5, 2]);
  console.log('  PASS: testHighCard');
}

// ── evaluateHand3 테스트 ──

function testHand3Trips() {
  const hand = evaluateHand3([card(9, 1), card(9, 2), card(9, 3)]);
  assert.strictEqual(hand.handType, HAND_TYPE.THREE_OF_A_KIND);
  assert.deepStrictEqual(hand.kickers, [9]);
  console.log('  PASS: testHand3Trips');
}

function testHand3Pair() {
  const hand = evaluateHand3([card(12, 1), card(12, 2), card(5, 3)]);
  assert.strictEqual(hand.handType, HAND_TYPE.ONE_PAIR);
  assert.deepStrictEqual(hand.kickers, [12, 5]);
  console.log('  PASS: testHand3Pair');
}

function testHand3HighCard() {
  const hand = evaluateHand3([card(14, 1), card(10, 2), card(3, 3)]);
  assert.strictEqual(hand.handType, HAND_TYPE.HIGH_CARD);
  assert.deepStrictEqual(hand.kickers, [14, 10, 3]);
  console.log('  PASS: testHand3HighCard');
}

function testHand3Ranking() {
  const trips = evaluateHand3([card(5, 1), card(5, 2), card(5, 3)]);
  const pair = evaluateHand3([card(14, 1), card(14, 2), card(13, 3)]);
  const high = evaluateHand3([card(14, 1), card(13, 2), card(12, 3)]);

  assert.ok(compareHands(trips, pair) > 0, 'Trips > Pair');
  assert.ok(compareHands(pair, high) > 0, 'Pair > High Card');
  assert.ok(compareHands(trips, high) > 0, 'Trips > High Card');
  console.log('  PASS: testHand3Ranking');
}

// ── compareHands 테스트 ──

function testCompareHandsSameType() {
  const pairA = evaluateHand5([card(14, 1), card(14, 2), card(10, 3), card(8, 4), card(3, 1)]);
  const pairB = evaluateHand5([card(13, 1), card(13, 2), card(10, 3), card(8, 4), card(3, 1)]);
  assert.ok(compareHands(pairA, pairB) > 0, 'AA pair > KK pair');

  // 같은 pair, 다른 kicker
  const pairC = evaluateHand5([card(10, 1), card(10, 2), card(14, 3), card(8, 4), card(3, 1)]);
  const pairD = evaluateHand5([card(10, 3), card(10, 4), card(13, 3), card(8, 1), card(3, 2)]);
  assert.ok(compareHands(pairC, pairD) > 0, 'Same pair, higher kicker wins');
  console.log('  PASS: testCompareHandsSameType');
}

function testCompareHandsTie() {
  const a = evaluateHand5([card(10, 1), card(10, 2), card(8, 3), card(5, 4), card(3, 1)]);
  const b = evaluateHand5([card(10, 3), card(10, 4), card(8, 1), card(5, 2), card(3, 3)]);
  assert.strictEqual(compareHands(a, b), 0, '동일 핸드는 무승부');
  console.log('  PASS: testCompareHandsTie');
}

// ── isFoul 테스트 ──

function testIsFoulValid() {
  // bottom(FH) >= mid(Straight) >= top(Pair) → 유효
  const board = {
    top: [card(14, 1), card(14, 2), card(7, 3)],
    mid: [card(5, 1), card(6, 2), card(7, 3), card(8, 4), card(9, 1)],
    bottom: [card(13, 1), card(13, 2), card(13, 3), card(3, 1), card(3, 2)]
  };
  assert.strictEqual(isFoul(board), false, '유효한 보드는 foul 아님');
  console.log('  PASS: testIsFoulValid');
}

function testIsFoulMidEqualsTop() {
  // mid(OnePair) == top(OnePair) 같은 handType, mid kickers[0] >= top kickers[0]
  const board = {
    top: [card(6, 1), card(6, 2), card(3, 3)],
    mid: [card(6, 3), card(6, 4), card(10, 1), card(8, 2), card(3, 1)],
    bottom: [card(13, 1), card(13, 2), card(13, 3), card(5, 1), card(5, 2)]
  };
  assert.strictEqual(isFoul(board), false, 'mid == top 강도 → foul 아님');
  console.log('  PASS: testIsFoulMidEqualsTop');
}

function testIsFoulMidWeakerThanTop() {
  // mid(High Card) < top(Pair) → foul
  const board = {
    top: [card(14, 1), card(14, 2), card(7, 3)],
    mid: [card(2, 1), card(3, 2), card(5, 3), card(8, 4), card(10, 1)],
    bottom: [card(13, 1), card(13, 2), card(13, 3), card(5, 1), card(5, 2)]
  };
  assert.strictEqual(isFoul(board), true, 'mid < top → foul');
  console.log('  PASS: testIsFoulMidWeakerThanTop');
}

function testIsFoulBottomWeakerThanMid() {
  // bottom(Two Pair) < mid(Full House) → foul
  const board = {
    top: [card(6, 1), card(6, 2), card(3, 3)],
    mid: [card(10, 1), card(10, 2), card(10, 3), card(5, 1), card(5, 2)],
    bottom: [card(9, 1), card(9, 2), card(7, 3), card(7, 4), card(2, 1)]
  };
  assert.strictEqual(isFoul(board), true, 'bottom < mid → foul');
  console.log('  PASS: testIsFoulBottomWeakerThanMid');
}

function testIsFoulIncompleteBoard() {
  // 카드 수 부족 → foul
  const board = {
    top: [card(14, 1), card(14, 2)],  // 2장 (3장 필요)
    mid: [card(5, 1), card(6, 2), card(7, 3), card(8, 4), card(9, 1)],
    bottom: [card(13, 1), card(13, 2), card(13, 3), card(3, 1), card(3, 2)]
  };
  assert.strictEqual(isFoul(board), true, '불완전 보드 → foul');

  const board2 = {
    top: [card(14, 1), card(14, 2), card(7, 3)],
    mid: [card(5, 1), card(6, 2), card(7, 3)],  // 3장 (5장 필요)
    bottom: [card(13, 1), card(13, 2), card(13, 3), card(3, 1), card(3, 2)]
  };
  assert.strictEqual(isFoul(board2), true, 'mid 불완전 → foul');
  console.log('  PASS: testIsFoulIncompleteBoard');
}

function testEvaluateHand5ThrowsOnWrongCount() {
  try {
    evaluateHand5([card(2, 1), card(3, 2), card(4, 3)]);
    assert.fail('3장으로 evaluateHand5 호출 시 에러 발생해야 함');
  } catch (e) {
    assert.ok(e.message.includes('5장'), '에러 메시지에 5장 언급');
  }
  console.log('  PASS: testEvaluateHand5ThrowsOnWrongCount');
}

function testEvaluateHand3ThrowsOnWrongCount() {
  try {
    evaluateHand3([card(2, 1), card(3, 2)]);
    assert.fail('2장으로 evaluateHand3 호출 시 에러 발생해야 함');
  } catch (e) {
    assert.ok(e.message.includes('3장'), '에러 메시지에 3장 언급');
  }
  console.log('  PASS: testEvaluateHand3ThrowsOnWrongCount');
}

// 실행
console.log('evaluator.js 테스트 시작...');
testRoyalFlush();
testStraightFlush();
testFourOfAKind();
testFullHouse();
testFlush();
testStraight();
testWheelStraight();
testWheelVsNormalStraight();
testThreeOfAKind();
testTwoPair();
testOnePair();
testHighCard();
testHand3Trips();
testHand3Pair();
testHand3HighCard();
testHand3Ranking();
testCompareHandsSameType();
testCompareHandsTie();
testIsFoulValid();
testIsFoulMidEqualsTop();
testIsFoulMidWeakerThanTop();
testIsFoulBottomWeakerThanMid();
testIsFoulIncompleteBoard();
testEvaluateHand5ThrowsOnWrongCount();
testEvaluateHand3ThrowsOnWrongCount();
console.log('모든 테스트 통과!');
