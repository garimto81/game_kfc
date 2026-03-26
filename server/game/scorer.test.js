/**
 * scorer.js 단위 테스트 — Node.js assert 기반
 * 실행: node server/game/scorer.test.js
 */
const assert = require('assert');
const { scoreHand } = require('./scorer');

// 헬퍼: 카드 생성
function card(rank, suit) {
  return { rank, suit };
}

// 정상 2인 비교 테스트
function testNormalComparison() {
  // Bottom >= Mid >= Top 유지 필수 (Foul 방지)
  const players = {
    p1: {
      board: {
        top: [card(14, 1), card(14, 2), card(7, 3)],       // AA7 → One Pair
        mid: [card(9, 2), card(10, 2), card(11, 2), card(12, 2), card(13, 2)], // Straight Flush (9-K)
        bottom: [card(10, 1), card(11, 1), card(12, 1), card(13, 1), card(14, 1)] // Royal Flush
      },
      fouled: false
    },
    p2: {
      board: {
        top: [card(6, 1), card(6, 2), card(3, 3)],         // 66 → One Pair
        mid: [card(7, 1), card(7, 2), card(8, 3), card(8, 4), card(10, 1)], // Two Pair (7,8)
        bottom: [card(4, 1), card(4, 2), card(4, 3), card(9, 1), card(9, 2)]  // Full House
      },
      fouled: false
    }
  };

  const results = scoreHand(players);

  // 별칭 존재 확인
  assert.strictEqual(results.p1.totalScore, results.p1.score, 'totalScore alias');
  assert.strictEqual(results.p1.foul, results.p1.fouled, 'foul alias');
  assert.strictEqual(results.p2.totalScore, results.p2.score, 'totalScore alias p2');
  assert.strictEqual(results.p2.foul, results.p2.fouled, 'foul alias p2');

  // nested lineResults 구조 확인
  const lr = results.p1.lineResults.p2;
  assert.ok(lr.lines, 'lines 객체 존재');
  assert.ok(lr.lines.top, 'lines.top 존재');
  assert.ok(lr.lines.mid, 'lines.mid 존재');
  assert.ok(lr.lines.bottom, 'lines.bottom 존재');

  // 각 라인에 result, myHand, oppHand 필드
  for (const line of ['top', 'mid', 'bottom']) {
    assert.ok('result' in lr.lines[line], `${line}.result 필드`);
    assert.ok(typeof lr.lines[line].myHand === 'string', `${line}.myHand 문자열`);
    assert.ok(typeof lr.lines[line].oppHand === 'string', `${line}.oppHand 문자열`);
  }

  // P1이 3라인 모두 승리 → scoop
  assert.strictEqual(lr.lines.top.result, 1, 'top: AA > 66');
  assert.strictEqual(lr.lines.mid.result, 1, 'mid: SF > Two Pair');
  assert.strictEqual(lr.lines.bottom.result, 1, 'bottom: Royal Flush > Full House');
  assert.strictEqual(lr.scoopBonus, 3, 'scoop bonus');

  // royaltyDiff, total 존재
  assert.ok(typeof lr.royaltyDiff === 'number', 'royaltyDiff 숫자');
  assert.ok(typeof lr.total === 'number', 'total 숫자');

  // 반전 대칭 확인
  const lr2 = results.p2.lineResults.p1;
  assert.strictEqual(lr2.lines.top.result, -1, '반전: top');
  assert.strictEqual(lr2.scoopBonus, -3, '반전: scoop');
  assert.strictEqual(lr2.royaltyDiff, -lr.royaltyDiff, '반전: royaltyDiff');
  assert.strictEqual(lr2.total, -lr.total, '반전: total');

  // handName 값 확인
  assert.strictEqual(lr.lines.top.myHand, 'One Pair');
  assert.strictEqual(lr.lines.top.oppHand, 'One Pair');
  assert.strictEqual(lr.lines.mid.myHand, 'Straight Flush');
  assert.strictEqual(lr.lines.mid.oppHand, 'Two Pair');

  console.log('  PASS: testNormalComparison');
}

// 한쪽 Foul 테스트
function testOneFoul() {
  const players = {
    p1: {
      board: {
        top: [card(14, 1), card(13, 1), card(12, 1)],
        mid: [card(2, 1), card(3, 2), card(5, 3), card(8, 4), card(10, 1)],
        bottom: [card(4, 1), card(4, 2), card(4, 3), card(9, 1), card(9, 2)]
      },
      fouled: true // 강제 Foul
    },
    p2: {
      board: {
        top: [card(6, 1), card(6, 2), card(3, 3)],          // 66 Pair
        mid: [card(7, 1), card(7, 2), card(8, 3), card(8, 4), card(10, 1)], // Two Pair
        bottom: [card(10, 2), card(11, 2), card(12, 2), card(13, 2), card(14, 2)] // Royal Flush
      },
      fouled: false
    }
  };

  const results = scoreHand(players);

  // P1 Foul → P2 +6점(3라인+스쿱3) + 로열티 차이
  assert.strictEqual(results.p1.score, -6 - results.p2.royalties.total, 'p1 score (foul + royalty)');
  assert.strictEqual(results.p1.foul, true, 'p1 foul alias');
  assert.strictEqual(results.p2.foul, false, 'p2 foul alias');

  // nested 구조 확인
  const lr = results.p1.lineResults.p2;
  assert.ok(lr.lines, 'Foul 케이스도 nested lines 존재');
  assert.strictEqual(lr.lines.top.result, -1, 'Foul: top -1');
  assert.strictEqual(lr.lines.mid.result, -1, 'Foul: mid -1');
  assert.strictEqual(lr.lines.bottom.result, -1, 'Foul: bottom -1');
  assert.strictEqual(lr.lines.top.myHand, 'Foul', 'Foul handName');
  assert.ok(lr.lines.top.oppHand.length > 0, 'oppHand 핸드명 존재');
  assert.strictEqual(lr.scoopBonus, -3, 'Foul scoop bonus');

  console.log('  PASS: testOneFoul');
}

// 양쪽 Foul 테스트
function testBothFoul() {
  const players = {
    p1: {
      board: {
        top: [card(14, 1), card(13, 1), card(12, 1)],
        mid: [card(2, 1), card(3, 2), card(5, 3), card(8, 4), card(10, 1)],
        bottom: [card(4, 1), card(4, 2), card(4, 3), card(9, 1), card(9, 2)]
      },
      fouled: true
    },
    p2: {
      board: {
        top: [card(6, 1), card(6, 2), card(3, 3)],
        mid: [card(2, 1), card(3, 2), card(5, 3), card(8, 4), card(10, 1)],
        bottom: [card(4, 1), card(4, 2), card(4, 3), card(9, 1), card(9, 2)]
      },
      fouled: true
    }
  };

  const results = scoreHand(players);

  assert.strictEqual(results.p1.score, 0, '양쪽 Foul: p1 score 0');
  assert.strictEqual(results.p2.score, 0, '양쪽 Foul: p2 score 0');

  const lr = results.p1.lineResults.p2;
  assert.ok(lr.lines, '양쪽 Foul: nested lines 존재');
  assert.strictEqual(lr.lines.top.result, 0, '양쪽 Foul: 무승부');
  assert.strictEqual(lr.scoopBonus, 0, '양쪽 Foul: scoop 0');
  assert.strictEqual(lr.lines.top.myHand, 'Foul');

  console.log('  PASS: testBothFoul');
}

// 3인 게임 테스트
function testThreePlayers() {
  const players = {
    p1: {
      board: {
        top: [card(14, 1), card(14, 2), card(7, 3)],        // AA7 Pair
        mid: [card(9, 2), card(10, 2), card(11, 2), card(12, 2), card(13, 2)], // SF 9-K
        bottom: [card(10, 1), card(11, 1), card(12, 1), card(13, 1), card(14, 1)] // Royal Flush
      },
      fouled: false
    },
    p2: {
      board: {
        top: [card(6, 1), card(6, 2), card(3, 3)],          // 66 Pair
        mid: [card(7, 1), card(7, 2), card(8, 3), card(8, 4), card(10, 2)], // Two Pair
        bottom: [card(4, 1), card(4, 2), card(4, 3), card(9, 1), card(9, 2)] // Full House
      },
      fouled: false
    },
    p3: {
      board: {
        top: [card(10, 1), card(10, 2), card(8, 3)],        // TT Pair
        mid: [card(5, 1), card(5, 2), card(5, 3), card(7, 1), card(7, 2)], // Full House
        bottom: [card(11, 1), card(11, 2), card(11, 3), card(11, 4), card(2, 1)] // Quads
      },
      fouled: false
    }
  };

  const results = scoreHand(players);

  // 모든 플레이어에 대해 상대별 lineResults 존재
  assert.ok(results.p1.lineResults.p2, 'p1 vs p2 존재');
  assert.ok(results.p1.lineResults.p3, 'p1 vs p3 존재');
  assert.ok(results.p2.lineResults.p1, 'p2 vs p1 존재');
  assert.ok(results.p2.lineResults.p3, 'p2 vs p3 존재');
  assert.ok(results.p3.lineResults.p1, 'p3 vs p1 존재');
  assert.ok(results.p3.lineResults.p2, 'p3 vs p2 존재');

  // 각각 nested 구조
  for (const pid of ['p1', 'p2', 'p3']) {
    assert.ok(results[pid].totalScore !== undefined, `${pid} totalScore`);
    assert.ok(results[pid].foul !== undefined, `${pid} foul`);
    for (const oppId of Object.keys(results[pid].lineResults)) {
      const lr = results[pid].lineResults[oppId];
      assert.ok(lr.lines, `${pid} vs ${oppId}: lines`);
      assert.ok(typeof lr.scoopBonus === 'number', `${pid} vs ${oppId}: scoopBonus`);
      assert.ok(typeof lr.total === 'number', `${pid} vs ${oppId}: total`);
    }
  }

  console.log('  PASS: testThreePlayers');
}

// 실행
console.log('scorer.js 테스트 시작...');
testNormalComparison();
testOneFoul();
testBothFoul();
testThreePlayers();
console.log('모든 테스트 통과!');
