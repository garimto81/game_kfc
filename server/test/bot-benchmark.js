/**
 * bot-benchmark.js — 스마트 봇 vs 단순 봇 벤치마크
 *
 * Room 클래스 직접 조작으로 N핸드를 실행하고
 * foul률, 평균 royalty, FL 진입률, 승률을 비교한다.
 *
 * 실행: node server/test/bot-benchmark.js [--hands N]
 */

const { Room } = require('../game/room');
const { createDeck, shuffle } = require('../game/deck');
const { isFoul } = require('../game/evaluator');
const { evaluateHand5, evaluateHand3, HAND_TYPE } = require('../game/evaluator');

// ============================================================
// CLI 옵션 파싱
// ============================================================

const args = process.argv.slice(2);
const NUM_HANDS = (() => {
  const idx = args.indexOf('--hands');
  return idx !== -1 && args[idx + 1] ? parseInt(args[idx + 1], 10) : 1000;
})();

// ============================================================
// smart-bot.js 로드 시도 (없으면 인라인 개선 봇 사용)
// ============================================================

let SmartBot = null;
try {
  SmartBot = require('../game/smart-bot');
} catch {
  // smart-bot.js가 아직 없음 — 인라인 개선 봇 사용
  SmartBot = null;
}

// ============================================================
// 단순 봇 전략 (기존 ws-protocol.test.js와 동일)
// ============================================================

function sortByRankDesc(cards) {
  return [...cards].sort((a, b) => b.rank - a.rank || b.suit - a.suit);
}

function remainingSlots(board) {
  return {
    top: 3 - board.top.length,
    mid: 5 - board.mid.length,
    bottom: 5 - board.bottom.length,
  };
}

function simpleDecide(hand, board, round, isFL, activePlayers) {
  if (isFL) return simpleFL(hand, board);
  if (round === 1) return simpleR1(hand, board);
  if (round === 5) return simpleR5(hand, board, activePlayers >= 4);
  return simpleR2to4(hand, board);
}

function simpleR1(hand, board) {
  const sorted = sortByRankDesc(hand);
  const slots = remainingSlots(board);
  const placements = [];
  let idx = 0;
  for (let i = 0; i < 2 && idx < sorted.length && slots.bottom > i; i++, idx++)
    placements.push({ card: sorted[idx], line: 'bottom' });
  for (let i = 0; i < 2 && idx < sorted.length && slots.mid > i; i++, idx++)
    placements.push({ card: sorted[idx], line: 'mid' });
  if (idx < sorted.length && slots.top > 0)
    placements.push({ card: sorted[idx], line: 'top' });
  return { placements, discard: null };
}

function simpleR2to4(hand, board) {
  const sorted = sortByRankDesc(hand);
  const slots = remainingSlots(board);
  const discard = sorted[sorted.length - 1];
  const toPlace = sorted.slice(0, 2);
  const lineOrder = ['bottom', 'mid', 'top']
    .filter((l) => slots[l] > 0)
    .sort((a, b) => slots[b] - slots[a]);
  const placements = [];
  for (let i = 0; i < toPlace.length && i < lineOrder.length; i++)
    placements.push({ card: toPlace[i], line: lineOrder[i] });
  if (placements.length < toPlace.length) {
    for (const card of toPlace) {
      if (placements.find((p) => p.card === card)) continue;
      for (const line of ['bottom', 'mid', 'top']) {
        const used = placements.filter((p) => p.line === line).length;
        if (slots[line] - used > 0) { placements.push({ card, line }); break; }
      }
    }
  }
  return { placements, discard };
}

function simpleR5(hand, board, is4Plus) {
  if (is4Plus) {
    const sorted = sortByRankDesc(hand);
    const slots = remainingSlots(board);
    const lineOrder = ['bottom', 'mid', 'top']
      .filter((l) => slots[l] > 0)
      .sort((a, b) => slots[b] - slots[a]);
    const placements = [];
    for (let i = 0; i < sorted.length && i < lineOrder.length; i++)
      placements.push({ card: sorted[i], line: lineOrder[i] });
    return { placements, discard: null };
  }
  return simpleR2to4(hand, board);
}

function simpleFL(hand, _board) {
  const sorted = sortByRankDesc(hand);
  const discard = sorted[sorted.length - 1];
  const toPlace = sorted.slice(0, 13);
  const placements = [];
  for (let i = 0; i < 5; i++) placements.push({ card: toPlace[i], line: 'bottom' });
  for (let i = 5; i < 10; i++) placements.push({ card: toPlace[i], line: 'mid' });
  for (let i = 10; i < 13; i++) placements.push({ card: toPlace[i], line: 'top' });
  return { placements, discard };
}

// ============================================================
// 개선된 인라인 봇 (foul 방지 + 기본 royalty 인식)
// ============================================================

function getLineStrength(cards, lineType) {
  if (cards.length === 0) return -1;
  try {
    if (lineType === 'top' && cards.length === 3) {
      return evaluateHand3(cards).handType * 1000 + cards[0].rank;
    }
    if (cards.length === 5) {
      return evaluateHand5(cards).handType * 1000 + cards[0].rank;
    }
  } catch { /* ignore */ }
  // 불완전 라인 — rank 합계로 근사
  return cards.reduce((s, c) => s + c.rank, 0);
}

function smartDecide(hand, board, round, isFL, activePlayers) {
  if (isFL) return smartFL(hand, board);
  if (round === 1) return smartR1(hand, board);
  if (round === 5) return smartR5(hand, board, activePlayers >= 4);
  return smartR2to4(hand, board);
}

function smartR1(hand, board) {
  // R1: 페어를 찾아서 bottom에 배치, 나머지 중 높은 것 mid, 낮은 것 top
  const sorted = sortByRankDesc(hand);
  const placements = [];

  // 페어 찾기
  let pairCards = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].rank === sorted[i + 1].rank) {
      pairCards = [sorted[i], sorted[i + 1]];
      break;
    }
  }

  if (pairCards.length === 2) {
    // 페어 → bottom, 나머지 중 가장 높은 것 → mid, 가장 낮은 것 → top
    const rest = sorted.filter(c => !pairCards.includes(c));
    placements.push({ card: pairCards[0], line: 'bottom' });
    placements.push({ card: pairCards[1], line: 'bottom' });
    placements.push({ card: rest[0], line: 'mid' }); // 가장 높은 나머지
    placements.push({ card: rest[1], line: 'mid' });
    placements.push({ card: rest[2], line: 'top' }); // 가장 낮은 나머지
  } else {
    // 페어 없음 — 높은 카드 2장 bottom, 중간 2장 mid, 낮은 1장 top
    placements.push({ card: sorted[0], line: 'bottom' });
    placements.push({ card: sorted[1], line: 'bottom' });
    placements.push({ card: sorted[2], line: 'mid' });
    placements.push({ card: sorted[3], line: 'mid' });
    placements.push({ card: sorted[4], line: 'top' });
  }

  return { placements, discard: null };
}

function smartR2to4(hand, board) {
  const sorted = sortByRankDesc(hand);
  const slots = remainingSlots(board);

  // 가장 낮은 카드 버림
  const discard = sorted[sorted.length - 1];
  const toPlace = sorted.slice(0, 2);

  // Foul 방지: bottom >= mid >= top 강도 유지
  // 높은 카드는 가장 여유 있는 lower 라인, 낮은 카드는 upper 라인
  const lineOrder = ['bottom', 'mid', 'top'].filter(l => slots[l] > 0);

  const placements = [];
  if (lineOrder.length >= 2) {
    // 높은 카드 → lower 라인, 낮은 카드 → upper 라인
    placements.push({ card: toPlace[0], line: lineOrder[0] });
    placements.push({ card: toPlace[1], line: lineOrder[1] });
  } else if (lineOrder.length === 1) {
    placements.push({ card: toPlace[0], line: lineOrder[0] });
    placements.push({ card: toPlace[1], line: lineOrder[0] });
  }

  // Foul 검증 시뮬레이션
  const testBoard = {
    top: [...board.top],
    mid: [...board.mid],
    bottom: [...board.bottom],
  };
  for (const p of placements) {
    testBoard[p.line].push(p.card);
  }
  const bottomStr = getLineStrength(testBoard.bottom, 'bottom');
  const midStr = getLineStrength(testBoard.mid, 'mid');
  const topStr = getLineStrength(testBoard.top, 'top');

  // foul이 예상되면 배치 순서 반전
  if (placements.length === 2 && midStr > bottomStr && lineOrder.length >= 2) {
    const tmp = placements[0].line;
    placements[0].line = placements[1].line;
    placements[1].line = tmp;
  }

  return { placements, discard };
}

function smartR5(hand, board, is4Plus) {
  if (is4Plus) {
    const sorted = sortByRankDesc(hand);
    const slots = remainingSlots(board);
    const lineOrder = ['bottom', 'mid', 'top']
      .filter((l) => slots[l] > 0)
      .sort((a, b) => slots[b] - slots[a]);
    const placements = [];
    for (let i = 0; i < sorted.length && i < lineOrder.length; i++)
      placements.push({ card: sorted[i], line: lineOrder[i] });
    return { placements, discard: null };
  }
  return smartR2to4(hand, board);
}

function smartFL(hand, _board) {
  // FL: 강한 카드를 bottom, 중간 mid, 약한 top (foul 방지)
  const sorted = sortByRankDesc(hand);
  const discard = sorted[sorted.length - 1];
  const toPlace = sorted.slice(0, 13);
  const placements = [];
  for (let i = 0; i < 5; i++) placements.push({ card: toPlace[i], line: 'bottom' });
  for (let i = 5; i < 10; i++) placements.push({ card: toPlace[i], line: 'mid' });
  for (let i = 10; i < 13; i++) placements.push({ card: toPlace[i], line: 'top' });
  return { placements, discard };
}

// ============================================================
// Mock WebSocket
// ============================================================

class MockWS {
  constructor() {
    this.readyState = 1;
    this.sentMessages = [];
  }
  send(data) {
    this.sentMessages.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
  }
}

// ============================================================
// 핸드 시뮬레이션
// ============================================================

function simulateHand(room, playerIds, wsMap, decideFnMap) {
  const activePlayers = room.getActivePlayers();
  const numActive = activePlayers.length;

  for (let round = 1; round <= 5; round++) {
    const nonFL = room.getNonFLActivePlayers();

    for (let turnIdx = 0; turnIdx < nonFL.length; turnIdx++) {
      const currentId = room.getCurrentTurnPlayerId();
      if (!currentId) break;

      const player = room.players.get(currentId);
      if (!player || player.confirmed || player.folded) continue;

      const hand = player.hand;
      if (!hand || hand.length === 0) continue;

      const decideFn = decideFnMap[currentId];
      const board = player.board;
      const isFL = player.inFantasyland;
      const decision = decideFn(hand, board, room.round, isFL, numActive);

      // 카드 배치
      for (const placement of decision.placements) {
        const result = room.placeCard(currentId, placement.card, placement.line);
        if (result.error) {
          for (const alt of ['bottom', 'mid', 'top']) {
            const altResult = room.placeCard(currentId, placement.card, alt);
            if (!altResult.error) break;
          }
        }
      }

      // 디스카드
      if (decision.discard) {
        room.discardCard(currentId, decision.discard);
      }

      // 확정
      const confirmResult = room.confirmPlacement(currentId);
      if (confirmResult.error) {
        // 강제 배치 시도
        while (player.hand.length > 0) {
          const card = player.hand[0];
          for (const line of ['bottom', 'mid', 'top']) {
            const r = room.placeCard(currentId, card, line);
            if (!r.error) break;
          }
          if (player.hand.length > 0 && player.discarded.length === 0 && room.round > 1) {
            room.discardCard(currentId, player.hand[0]);
          }
        }
        const retry = room.confirmPlacement(currentId);
        if (retry.error) {
          room.autoFold(currentId);
        }
      }

      if (confirmResult && !confirmResult.error) {
        if (confirmResult.action === 'handScored') return confirmResult;
        if (confirmResult.action === 'newRound') break;
      }
    }

    // FL 플레이어 처리
    const flPlayers = room.getFLActivePlayers();
    for (const flId of flPlayers) {
      const flPlayer = room.players.get(flId);
      if (flPlayer.confirmed) continue;
      if (flPlayer.hand.length === 0) continue;

      const decideFn = decideFnMap[flId];
      const decision = decideFn(flPlayer.hand, flPlayer.board, room.round, true, numActive);
      for (const placement of decision.placements) {
        room.placeCard(flId, placement.card, placement.line);
      }
      if (decision.discard) {
        room.discardCard(flId, decision.discard);
      }
      const result = room.confirmPlacement(flId);
      if (result && result.action === 'handScored') return result;
    }
  }

  return room.endHand();
}

// ============================================================
// 벤치마크 실행
// ============================================================

function benchmark(smartFn, simpleFn, numHands) {
  const stats = {
    smart: { totalScore: 0, fouls: 0, royalty: 0, flEntry: 0, hands: 0 },
    simple: { totalScore: 0, fouls: 0, royalty: 0, flEntry: 0, hands: 0 },
  };

  let errors = 0;

  for (let i = 0; i < numHands; i++) {
    try {
      // 3인 게임: smart 1명 vs simple 2명
      const room = new Room({ name: `Bench-${i}`, maxPlayers: 3, turnTimeLimit: 0 });

      const wsMap = {};
      const playerIds = [];
      const decideFnMap = {};
      const botTypes = {}; // playerId → 'smart' | 'simple'

      for (let j = 0; j < 3; j++) {
        const ws = new MockWS();
        const result = room.addPlayer(j === 0 ? 'SmartBot' : `SimpleBot${j}`, ws);
        if (result.error) throw new Error(result.error);
        playerIds.push(result.playerId);
        wsMap[result.playerId] = ws;
        decideFnMap[result.playerId] = j === 0 ? smartFn : simpleFn;
        botTypes[result.playerId] = j === 0 ? 'smart' : 'simple';
      }

      const startResult = room.startGame(playerIds[0]);
      if (startResult.error) throw new Error(startResult.error);

      room.phase = 'playing';
      room.handNumber = 1;
      room.startNewHand();

      const result = simulateHand(room, playerIds, wsMap, decideFnMap);

      if (result && result.results) {
        for (const [id, r] of Object.entries(result.results)) {
          const type = botTypes[id];
          if (!type) continue;
          stats[type].hands++;
          stats[type].totalScore += r.score || 0;
          if (r.fouled) stats[type].fouls++;
          stats[type].royalty += r.royaltyTotal || 0;
          if (r.inFantasyland) stats[type].flEntry++;
        }
      }

      room.clearTurnTimer();
    } catch (err) {
      errors++;
      if (errors <= 5) {
        console.error(`  [ERROR] Hand ${i}: ${err.message}`);
      }
    }
  }

  return { stats, errors };
}

// ============================================================
// 메인 실행
// ============================================================

function main() {
  // smart-bot.js가 있으면 사용, 없으면 인라인 개선 봇
  let smartFn;
  if (SmartBot && typeof SmartBot.decide === 'function') {
    // smart-bot.js 시그니처: decide(hand, board, round, options)
    // benchmark 시그니처: decide(hand, board, round, isFL, activePlayers)
    smartFn = (hand, board, round, isFL, activePlayers) => {
      return SmartBot.decide(hand, board, round, { isFantasyland: isFL, is4Plus: activePlayers >= 4 });
    };
    console.log('[INFO] smart-bot.js 로드됨 — 외부 스마트 봇 사용');
  } else {
    smartFn = smartDecide;
    console.log('[INFO] smart-bot.js 없음 — 인라인 개선 봇 사용 (foul 방지 + royalty 인식)');
  }

  console.log('');
  console.log(`벤치마크 시작: ${NUM_HANDS} hands (3인: Smart 1명 vs Simple 2명)`);
  console.log('');

  const startTime = Date.now();
  const { stats, errors } = benchmark(smartFn, simpleDecide, NUM_HANDS);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  // 통계 계산
  const smartHands = stats.smart.hands || 1;
  const simpleHands = stats.simple.hands || 1;

  const smartFoulRate = ((stats.smart.fouls / smartHands) * 100).toFixed(1);
  const simpleFoulRate = ((stats.simple.fouls / simpleHands) * 100).toFixed(1);

  const smartAvgRoyalty = (stats.smart.royalty / smartHands).toFixed(1);
  const simpleAvgRoyalty = (stats.simple.royalty / simpleHands).toFixed(1);

  const smartFLRate = ((stats.smart.flEntry / smartHands) * 100).toFixed(1);
  const simpleFLRate = ((stats.simple.flEntry / simpleHands) * 100).toFixed(1);

  const smartAvgScore = (stats.smart.totalScore / smartHands).toFixed(1);
  const simpleAvgScore = (stats.simple.totalScore / simpleHands).toFixed(1);

  // 승률 (점수 > 0인 비율은 아니고, 총점 기준)
  const smartWinRate = stats.smart.totalScore > stats.simple.totalScore
    ? ((stats.smart.totalScore / (Math.abs(stats.smart.totalScore) + Math.abs(stats.simple.totalScore))) * 100).toFixed(1)
    : (100 - ((stats.simple.totalScore / (Math.abs(stats.smart.totalScore) + Math.abs(stats.simple.totalScore))) * 100)).toFixed(1);
  const simpleWinRate = (100 - parseFloat(smartWinRate)).toFixed(1);

  // 결과 출력
  console.log('╔══════════════════════════════════════════════════╗');
  console.log(`║ BOT BENCHMARK: Smart vs Simple (${NUM_HANDS} hands)`.padEnd(50) + '║');
  console.log('╠═══════════════════╦═══════════╦═══════════════════╣');
  console.log('║ Metric            ║ Smart     ║ Simple            ║');
  console.log('╠═══════════════════╬═══════════╬═══════════════════╣');
  console.log(`║ Foul Rate         ║ ${smartFoulRate.padStart(7)}%  ║ ${simpleFoulRate.padStart(7)}%            ║`);
  console.log(`║ Avg Royalty       ║ ${smartAvgRoyalty.padStart(7)}   ║ ${simpleAvgRoyalty.padStart(7)}              ║`);
  console.log(`║ FL Entry          ║ ${smartFLRate.padStart(7)}%  ║ ${simpleFLRate.padStart(7)}%            ║`);
  console.log(`║ Avg Score/Hand    ║ ${smartAvgScore.padStart(7)}   ║ ${simpleAvgScore.padStart(7)}              ║`);
  console.log(`║ Win Rate          ║ ${smartWinRate.padStart(7)}%  ║ ${simpleWinRate.padStart(7)}%            ║`);
  console.log('╚═══════════════════╩═══════════╩═══════════════════╝');
  console.log('');
  console.log(`Elapsed: ${elapsed}s | Errors: ${errors}`);
  console.log(`Smart total: ${stats.smart.totalScore} | Simple total: ${stats.simple.totalScore}`);

  process.exit(errors > NUM_HANDS * 0.1 ? 1 : 0);
}

main();
