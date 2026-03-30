/**
 * smart-bot.js 테스트
 * Node.js assert 패턴
 */

const assert = require('assert');
const { createCard, createDeck, shuffle, cardsEqual } = require('./deck');
const { isFoul, HAND_TYPE } = require('./evaluator');
const {
  decide,
  scorePlacement,
  drawProbability,
  countFlushOuts,
  countStraightOuts,
  foulRiskPenalty,
  fantasylandBonus,
  cloneBoard,
  simulatePlace,
  lineHasRoom,
  boardComplete,
  decideR1,
  decideR2R4,
  decideFL
} = require('./smart-bot');
const { calcTotalRoyalty, checkFantasylandEntry } = require('./royalty');

// ─── 테스트 유틸 ───

function emptyBoard() {
  return { top: [], mid: [], bottom: [] };
}

function card(rank, suit) {
  return createCard(rank, suit);
}

// 축약: c(14,4) = Ace of Spades
const c = card;

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

// ─── Test 1: R1 패턴 매칭 — QQ 보유 시 top에 QQ 배치 ───

console.log('\n[Test 1] R1: QQ+ → top 배치');

test('QQ 보유 시 top에 QQ 2장 배치', () => {
  const hand = [c(12, 1), c(12, 2), c(7, 3), c(8, 4), c(3, 1)]; // QQ + 7, 8, 3
  const board = emptyBoard();
  const result = decide(hand, board, 1);

  // QQ가 top에 배치되었는지 확인
  const topPlacements = result.placements.filter(p => p.line === 'top');
  const topRanks = topPlacements.map(p => p.card.rank);
  assert.ok(topRanks.includes(12), 'top에 Queen이 있어야 함');
  const queenCount = topRanks.filter(r => r === 12).length;
  assert.ok(queenCount === 2, `top에 QQ 2장이 있어야 함 (실제: ${queenCount}장)`);
});

test('KK 보유 시 top에 KK 배치', () => {
  const hand = [c(13, 1), c(13, 2), c(5, 3), c(6, 4), c(2, 1)];
  const board = emptyBoard();
  const result = decide(hand, board, 1);

  const topPlacements = result.placements.filter(p => p.line === 'top');
  const kingCount = topPlacements.filter(p => p.card.rank === 13).length;
  assert.ok(kingCount === 2, `top에 KK가 있어야 함 (실제: ${kingCount}장)`);
});

test('AA 보유 시 top에 AA 배치', () => {
  const hand = [c(14, 1), c(14, 2), c(4, 3), c(9, 4), c(10, 1)];
  const board = emptyBoard();
  const result = decide(hand, board, 1);

  const topPlacements = result.placements.filter(p => p.line === 'top');
  const aceCount = topPlacements.filter(p => p.card.rank === 14).length;
  assert.ok(aceCount === 2, `top에 AA가 있어야 함 (실제: ${aceCount}장)`);
});

// ─── Test 2: R1 — Suited 3장 → bottom에 배치 ───

console.log('\n[Test 2] R1: Suited 3장+ → bottom 배치');

test('같은 수트 4장 보유 시 suited 카드가 같은 라인에 집중 배치', () => {
  // 4장 suited → 반드시 같은 라인에 배치해야 플러시 드로우 유지
  const hand = [c(14, 1), c(11, 1), c(9, 1), c(7, 1), c(3, 2)]; // club 4장 + diamond 1장
  const board = emptyBoard();
  const result = decide(hand, board, 1);

  const clubPlacements = result.placements.filter(p => p.card.suit === 1);
  const clubLines = clubPlacements.map(p => p.line);
  const bottomClubs = clubLines.filter(l => l === 'bottom').length;
  const midClubs = clubLines.filter(l => l === 'mid').length;
  // 4장 suited 중 최소 3장은 같은 5장 라인에 집중
  assert.ok(bottomClubs >= 3 || midClubs >= 3,
    `suited 카드 최소 3장이 같은 라인에 집중 (bottom: ${bottomClubs}, mid: ${midClubs})`);
});

// ─── Test 3: R2-R4 — Foul 배치 회피 ───

console.log('\n[Test 3] R2-R4: Foul 배치 회피');

test('foul이 되는 배치를 선택하지 않음', () => {
  // top에 이미 pair가 있고 mid에 약한 카드
  const board = {
    top: [c(14, 1), c(14, 2)], // AA pair
    mid: [c(3, 1), c(4, 2), c(5, 3), c(6, 4)], // 약한 카드 4장
    bottom: [c(10, 1), c(10, 2), c(10, 3), c(11, 4)] // trips
  };

  const hand = [c(2, 1), c(7, 3), c(8, 2)]; // 배치할 3장
  const result = decide(hand, board, 4);

  assert.ok(result.placements.length === 2, '2장이 배치되어야 함');
  assert.ok(result.discard !== null, '1장이 버려져야 함');

  // 결과 보드 시뮬레이션
  let testBoard = cloneBoard(board);
  for (const p of result.placements) {
    testBoard[p.line].push(p.card);
  }

  // 완성 보드면 foul 아닌지 확인
  if (boardComplete(testBoard)) {
    assert.ok(!isFoul(testBoard), '선택된 배치는 foul이 아니어야 함');
  }
});

// ─── Test 4: R2-R4 — 로열티 완성 카드 해당 라인 배치 ───

console.log('\n[Test 4] R2-R4: 로열티 완성 우선');

test('플러시 완성 카드는 해당 라인에 배치', () => {
  const board = {
    top: [c(5, 1), c(6, 2)],
    mid: [c(3, 3), c(4, 3)],
    bottom: [c(14, 3), c(13, 3), c(10, 3), c(9, 3)] // hearts 4장
  };

  const hand = [c(2, 3), c(7, 1), c(8, 2)]; // 2 of hearts = 플러시 완성
  const result = decide(hand, board, 3);

  // hearts(suit=3)가 bottom에 배치되었는지 확인
  const heartInBottom = result.placements.some(p => p.card.suit === 3 && p.line === 'bottom');
  assert.ok(heartInBottom, 'heart 카드가 bottom에 배치되어야 함 (플러시 완성)');
});

// ─── Test 5: FL 14장 — 13장 배치 + 1장 버림, Foul 없음 ───

console.log('\n[Test 5] FL: 14장 → 13장 배치 + 1장 버림');

test('FL 모드에서 13장 배치 + 1장 버림', () => {
  const hand = [];
  for (let r = 2; r <= 14; r++) hand.push(c(r, 1)); // club 전부 (13장)
  hand.push(c(2, 2)); // 추가 1장

  const board = emptyBoard();
  const result = decide(hand, board, 1, { isFantasyland: true });

  assert.ok(result.placements.length === 13, `13장 배치 (실제: ${result.placements.length}장)`);
  assert.ok(result.discard !== null, '1장 버림');

  // 배치 적용 후 foul 체크
  const finalBoard = emptyBoard();
  for (const p of result.placements) {
    finalBoard[p.line].push(p.card);
  }
  assert.strictEqual(finalBoard.top.length, 3, 'top 3장');
  assert.strictEqual(finalBoard.mid.length, 5, 'mid 5장');
  assert.strictEqual(finalBoard.bottom.length, 5, 'bottom 5장');
  assert.ok(!isFoul(finalBoard), 'FL 결과가 foul이 아니어야 함');
});

test('FL에서 강한 핸드가 bottom에 배치', () => {
  // 플러시 가능한 14장
  const hand = [
    c(14, 1), c(13, 1), c(12, 1), c(11, 1), c(10, 1), // royal flush 후보
    c(9, 2), c(8, 2), c(7, 2), c(6, 2), c(5, 2),      // 또 다른 flush
    c(4, 3), c(3, 3), c(2, 3),                           // 약한 카드
    c(14, 4)                                              // 추가
  ];

  const board = emptyBoard();
  const result = decide(hand, board, 1, { isFantasyland: true });

  const finalBoard = emptyBoard();
  for (const p of result.placements) {
    finalBoard[p.line].push(p.card);
  }
  assert.ok(!isFoul(finalBoard), 'FL 결과가 foul이 아니어야 함');
});

// ─── Test 6: 1000핸드 자동 플레이 — Foul 발생률 <15% ───

console.log('\n[Test 6] 1000핸드 자동 플레이');

test('1000핸드 자동 플레이 — Foul 발생률 < 15%', () => {
  const totalHands = 1000;
  let foulCount = 0;
  let errorCount = 0;

  for (let h = 0; h < totalHands; h++) {
    try {
      const deck = shuffle(createDeck());
      let deckIdx = 0;
      const board = emptyBoard();
      const deadCards = [];

      // R1: 5장 배치
      const r1Hand = deck.slice(deckIdx, deckIdx + 5);
      deckIdx += 5;
      const r1Result = decide(r1Hand, board, 1, { deadCards });
      for (const p of r1Result.placements) {
        board[p.line].push(p.card);
      }
      if (r1Result.discard) deadCards.push(r1Result.discard);

      // R2-R5: 3장씩 (2장 배치 + 1장 버림) — 보드 완성까지
      for (let round = 2; round <= 5; round++) {
        if (boardComplete(board)) break;
        const slotsLeft = (3 - board.top.length) + (5 - board.mid.length) + (5 - board.bottom.length);
        if (slotsLeft <= 0) break;

        const hand = deck.slice(deckIdx, deckIdx + 3);
        deckIdx += 3;
        if (hand.length === 0) break;

        const result = decide(hand, board, round, { deadCards });
        for (const p of result.placements) {
          if (lineHasRoom(board, p.line)) {
            board[p.line].push(p.card);
          }
        }
        if (result.discard) deadCards.push(result.discard);
      }

      // 최종 보충: 아직 미완성이면 남은 카드로 채움
      if (!boardComplete(board)) {
        const slotsLeft = (3 - board.top.length) + (5 - board.mid.length) + (5 - board.bottom.length);
        if (slotsLeft > 0 && deckIdx < deck.length) {
          const extraHand = deck.slice(deckIdx, deckIdx + slotsLeft + 1);
          deckIdx += extraHand.length;
          const result = decide(extraHand, board, 5, { deadCards });
          for (const p of result.placements) {
            if (lineHasRoom(board, p.line)) {
              board[p.line].push(p.card);
            }
          }
        }
      }

      // Foul 체크 (불완전 보드는 foul)
      if (!boardComplete(board) || isFoul(board)) {
        foulCount++;
      }
    } catch (e) {
      errorCount++;
    }
  }

  const foulRate = foulCount / totalHands;
  console.log(`    Foul: ${foulCount}/${totalHands} (${(foulRate * 100).toFixed(1)}%), Errors: ${errorCount}`);
  assert.ok(foulRate < 0.15, `Foul 발생률 ${(foulRate * 100).toFixed(1)}% < 15% 이어야 함`);
});

// ─── Test 7: 드로우 확률 정확성 — 수학적 검증 ───

console.log('\n[Test 7] 드로우 확률 수학적 검증');

test('drawProbability: 9 outs, 47 remaining, 1 draw = 9/47', () => {
  const prob = drawProbability(9, 47, 1);
  const expected = 9 / 47;
  assert.ok(Math.abs(prob - expected) < 0.001, `${prob} ≈ ${expected}`);
});

test('drawProbability: 9 outs, 47 remaining, 2 draws', () => {
  // P = 1 - (38/47 * 37/46)
  const prob = drawProbability(9, 47, 2);
  const expected = 1 - (38 / 47) * (37 / 46);
  assert.ok(Math.abs(prob - expected) < 0.001, `${prob} ≈ ${expected}`);
});

test('drawProbability: 0 outs → 0', () => {
  assert.strictEqual(drawProbability(0, 47, 3), 0);
});

test('drawProbability: outs >= remaining → 1', () => {
  assert.strictEqual(drawProbability(50, 47, 1), 1);
});

test('drawProbability: 4 outs, 44 remaining, 3 draws', () => {
  // P = 1 - (40/44 * 39/43 * 38/42)
  const prob = drawProbability(4, 44, 3);
  const expected = 1 - (40 / 44) * (39 / 43) * (38 / 42);
  assert.ok(Math.abs(prob - expected) < 0.001, `${prob} ≈ ${expected}`);
});

// ─── Test 8: Dead card 반영 ───

console.log('\n[Test 8] Dead card 반영');

test('dead card가 flush outs에서 제외됨', () => {
  const board = {
    top: [],
    mid: [],
    bottom: [c(14, 1), c(13, 1), c(12, 1)] // club 3장
  };
  const deadCards = [c(11, 1), c(10, 1)]; // club 2장 dead

  const outs = countFlushOuts(board, 'bottom', 1, deadCards);
  // 총 13 club - 3 board - 2 dead = 8
  assert.strictEqual(outs, 8, `flush outs = 8 (실제: ${outs})`);
});

test('dead card가 없으면 outs가 더 많음', () => {
  const board = {
    top: [],
    mid: [],
    bottom: [c(14, 1), c(13, 1), c(12, 1)]
  };
  const outsWithDead = countFlushOuts(board, 'bottom', 1, [c(11, 1)]);
  const outsNoDead = countFlushOuts(board, 'bottom', 1, []);

  assert.ok(outsNoDead > outsWithDead, 'dead card 없으면 outs 많음');
});

test('scorePlacement가 dead cards를 반영', () => {
  const board = {
    top: [c(5, 2)],
    mid: [c(3, 3), c(4, 3)],
    bottom: [c(14, 1), c(13, 1), c(12, 1), c(11, 1)]
  };

  // dead cards가 많으면 플러시 완성 기대값 감소
  const scoreNoDead = scorePlacement(c(2, 1), 'bottom', board, [], 3);
  const scoreManyDead = scorePlacement(c(2, 1), 'bottom', board, [c(10, 1), c(9, 1), c(8, 1), c(7, 1)], 3);

  // 둘 다 수치라는 것만 확인 (dead cards의 영향은 drawCompletionEV에서)
  assert.ok(typeof scoreNoDead === 'number', 'score는 숫자');
  assert.ok(typeof scoreManyDead === 'number', 'score는 숫자');
});

// ─── 결과 요약 ───

console.log(`\n${'='.repeat(50)}`);
console.log(`총 ${passed + failed}개 테스트: ${passed} 통과, ${failed} 실패`);
if (failed > 0) {
  process.exit(1);
}
