/**
 * model-evaluator.js — 모델 성능 측정 + 버전별 개선 추적
 *
 * Room 클래스 직접 조작으로 봇 vs 봇 대전을 수행하고
 * 결과를 registry.json / performance-history.json에 저장한다.
 *
 * 실행: node server/test/model-evaluator.js [--hands N]
 */

const fs = require('fs');
const path = require('path');
const { Room } = require('../game/room');

// ============================================================
// CLI 옵션
// ============================================================

const args = process.argv.slice(2);
const NUM_HANDS = (() => {
  const idx = args.indexOf('--hands');
  return idx !== -1 && args[idx + 1] ? parseInt(args[idx + 1], 10) : 500;
})();

// ============================================================
// 경로
// ============================================================

const REGISTRY_PATH = path.resolve(__dirname, '../../data/models/registry.json');
const HISTORY_PATH = path.resolve(__dirname, '../../data/stats/performance-history.json');

// ============================================================
// 봇 로딩
// ============================================================

let SmartBot = null;
try {
  SmartBot = require('../game/smart-bot');
} catch {
  SmartBot = null;
}

// ============================================================
// 단순 봇 전략 (bot-benchmark.js 재사용)
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
// 핸드 시뮬레이션 (bot-benchmark.js 패턴 재사용)
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

      for (const placement of decision.placements) {
        const result = room.placeCard(currentId, placement.card, placement.line);
        if (result.error) {
          for (const alt of ['bottom', 'mid', 'top']) {
            const altResult = room.placeCard(currentId, placement.card, alt);
            if (!altResult.error) break;
          }
        }
      }

      if (decision.discard) {
        room.discardCard(currentId, decision.discard);
      }

      const confirmResult = room.confirmPlacement(currentId);
      if (confirmResult.error) {
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
// evaluate: botA vs botB 대전
// ============================================================

async function evaluate(botAFn, botBFn, numHands = 1000) {
  const stats = {
    botA: { totalScore: 0, fouls: 0, royalty: 0, flEntry: 0, hands: 0, wins: 0 },
    botB: { totalScore: 0, fouls: 0, royalty: 0, flEntry: 0, hands: 0, wins: 0 },
  };

  let errors = 0;

  for (let i = 0; i < numHands; i++) {
    try {
      // 3인 게임: botA 1명 vs botB 2명
      const room = new Room({ name: `Eval-${i}`, maxPlayers: 3, turnTimeLimit: 0 });

      const wsMap = {};
      const playerIds = [];
      const decideFnMap = {};
      const botTypes = {};

      for (let j = 0; j < 3; j++) {
        const ws = new MockWS();
        const result = room.addPlayer(j === 0 ? 'BotA' : `BotB-${j}`, ws);
        if (result.error) throw new Error(result.error);
        playerIds.push(result.playerId);
        wsMap[result.playerId] = ws;
        decideFnMap[result.playerId] = j === 0 ? botAFn : botBFn;
        botTypes[result.playerId] = j === 0 ? 'botA' : 'botB';
      }

      const startResult = room.startGame(playerIds[0]);
      if (startResult.error) throw new Error(startResult.error);

      room.phase = 'playing';
      room.handNumber = 1;
      room.startNewHand();

      const result = simulateHand(room, playerIds, wsMap, decideFnMap);

      if (result && result.results) {
        // botA 점수 합산 (1명)
        let botAScore = 0;
        let botBScore = 0;

        for (const [id, r] of Object.entries(result.results)) {
          const type = botTypes[id];
          if (!type) continue;
          stats[type].hands++;
          stats[type].totalScore += r.score || 0;
          if (r.fouled) stats[type].fouls++;
          stats[type].royalty += r.royaltyTotal || 0;
          if (r.inFantasyland) stats[type].flEntry++;

          if (type === 'botA') botAScore += r.score || 0;
          else botBScore += r.score || 0;
        }

        // 핸드 단위 승리 판정 (botA 기준)
        if (botAScore > 0) stats.botA.wins++;
        else if (botBScore > 0) stats.botB.wins++;
      }

      room.clearTurnTimer();
    } catch (err) {
      errors++;
      if (errors <= 5) {
        console.error(`  [ERROR] Hand ${i}: ${err.message}`);
      }
    }
  }

  // 통계 계산
  const aHands = stats.botA.hands || 1;
  const bHands = stats.botB.hands || 1;

  return {
    botA_foul_rate: parseFloat(((stats.botA.fouls / aHands) * 100).toFixed(2)),
    botA_avg_royalty: parseFloat((stats.botA.royalty / aHands).toFixed(2)),
    botA_fl_entry: parseFloat(((stats.botA.flEntry / aHands) * 100).toFixed(2)),
    botA_avg_score: parseFloat((stats.botA.totalScore / aHands).toFixed(2)),
    botB_foul_rate: parseFloat(((stats.botB.fouls / bHands) * 100).toFixed(2)),
    botB_avg_royalty: parseFloat((stats.botB.royalty / bHands).toFixed(2)),
    botB_fl_entry: parseFloat(((stats.botB.flEntry / bHands) * 100).toFixed(2)),
    botB_avg_score: parseFloat((stats.botB.totalScore / bHands).toFixed(2)),
    win_rate_A: parseFloat(((stats.botA.wins / numHands) * 100).toFixed(2)),
    total_hands: numHands,
    errors,
  };
}

// ============================================================
// 결과 포맷 출력
// ============================================================

function printReport(result, labelA, labelB, numHands) {
  const pad = (s, n) => String(s).padStart(n);

  console.log('');
  console.log('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557');
  console.log(`\u2551 Model Evaluation Report${' '.repeat(25)}\u2551`);
  console.log('\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563');
  console.log(`\u2551 ${labelA} vs ${labelB} (${numHands} hands)${' '.repeat(Math.max(0, 49 - 6 - labelA.length - labelB.length - String(numHands).length - 11))}\u2551`);
  console.log('\u2551                                                 \u2551');
  console.log(`\u2551 Metric        \u2502 ${labelA.padEnd(10)} \u2502 ${labelB.padEnd(10)}       \u2551`);
  console.log('\u2551\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2551');
  console.log(`\u2551 Foul Rate     \u2502 ${pad(result.botA_foul_rate + '%', 10)} \u2502 ${pad(result.botB_foul_rate + '%', 10)}       \u2551`);
  console.log(`\u2551 Avg Royalty   \u2502 ${pad(result.botA_avg_royalty, 10)} \u2502 ${pad(result.botB_avg_royalty, 10)}       \u2551`);
  console.log(`\u2551 FL Entry      \u2502 ${pad(result.botA_fl_entry + '%', 10)} \u2502 ${pad(result.botB_fl_entry + '%', 10)}       \u2551`);
  console.log(`\u2551 Win Rate      \u2502 ${pad(result.win_rate_A + '%', 10)} \u2502 ${pad((100 - result.win_rate_A).toFixed(2) + '%', 10)}       \u2551`);
  console.log(`\u2551 Avg Score     \u2502 ${pad(result.botA_avg_score > 0 ? '+' + result.botA_avg_score : result.botA_avg_score, 10)} \u2502 ${pad(result.botB_avg_score > 0 ? '+' + result.botB_avg_score : result.botB_avg_score, 10)}       \u2551`);
  console.log('\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d');
  console.log('');
}

// ============================================================
// 메인 실행
// ============================================================

async function main() {
  console.log('[model-evaluator] Starting...');

  // 1. registry.json 로드
  let registry;
  try {
    registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
  } catch (err) {
    console.error(`[ERROR] Cannot read registry.json: ${err.message}`);
    process.exit(1);
  }

  // 2. history.json 로드
  let history;
  try {
    history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
  } catch {
    history = [];
  }

  // 3. 봇 함수 준비
  let smartBotFn;
  if (SmartBot && typeof SmartBot.decide === 'function') {
    smartBotFn = (hand, board, round, isFL, activePlayers) => {
      return SmartBot.decide(hand, board, round, { isFantasyland: isFL, is4Plus: activePlayers >= 4 });
    };
    console.log('[INFO] smart-bot.js loaded');
  } else {
    console.error('[ERROR] smart-bot.js not found - cannot run evaluation');
    process.exit(1);
  }

  const simpleBotFn = simpleDecide;

  // 4. baseline 버전 찾기
  const baselineVersion = registry.versions.find(v => v.version === registry.baseline);

  if (baselineVersion && !baselineVersion.benchmark) {
    // baseline 벤치마크 수립: smart-bot vs simple
    console.log(`\n[EVAL] Establishing baseline: ${registry.baseline} (smart-bot vs simple, ${NUM_HANDS} hands)...`);

    const startTime = Date.now();
    const result = await evaluate(smartBotFn, simpleBotFn, NUM_HANDS);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`[EVAL] Completed in ${elapsed}s (errors: ${result.errors})`);

    // registry 업데이트
    baselineVersion.benchmark = {
      opponent: 'simple-bot',
      hands: NUM_HANDS,
      foul_rate: result.botA_foul_rate,
      avg_royalty: result.botA_avg_royalty,
      fl_entry: result.botA_fl_entry,
      avg_score: result.botA_avg_score,
      win_rate_vs_simple: result.win_rate_A,
      date: new Date().toISOString().slice(0, 10),
    };

    // history에 추가
    history.push({
      version: registry.baseline,
      date: new Date().toISOString().slice(0, 10),
      opponent: 'simple-bot',
      hands: NUM_HANDS,
      botA_foul_rate: result.botA_foul_rate,
      botA_avg_royalty: result.botA_avg_royalty,
      botA_fl_entry: result.botA_fl_entry,
      botA_avg_score: result.botA_avg_score,
      botB_foul_rate: result.botB_foul_rate,
      botB_avg_royalty: result.botB_avg_royalty,
      botB_fl_entry: result.botB_fl_entry,
      botB_avg_score: result.botB_avg_score,
      win_rate_A: result.win_rate_A,
    });

    printReport(result, 'Smart', 'Simple', NUM_HANDS);
    console.log('Baseline established. Results saved to:');

  } else if (baselineVersion && baselineVersion.benchmark) {
    console.log(`[INFO] Baseline already established (win_rate: ${baselineVersion.benchmark.win_rate_vs_simple}%)`);

    // 새 모델 대전 확인 (TODO: ML 모델이 추가되면 여기서 대전 실행)
    // 현재는 baseline만 존재하므로 re-eval
    console.log(`\n[EVAL] Re-evaluating baseline: ${registry.baseline} (${NUM_HANDS} hands)...`);

    const startTime = Date.now();
    const result = await evaluate(smartBotFn, simpleBotFn, NUM_HANDS);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`[EVAL] Completed in ${elapsed}s (errors: ${result.errors})`);

    baselineVersion.benchmark = {
      opponent: 'simple-bot',
      hands: NUM_HANDS,
      foul_rate: result.botA_foul_rate,
      avg_royalty: result.botA_avg_royalty,
      fl_entry: result.botA_fl_entry,
      avg_score: result.botA_avg_score,
      win_rate_vs_simple: result.win_rate_A,
      date: new Date().toISOString().slice(0, 10),
    };

    history.push({
      version: registry.baseline,
      date: new Date().toISOString().slice(0, 10),
      opponent: 'simple-bot',
      hands: NUM_HANDS,
      botA_foul_rate: result.botA_foul_rate,
      botA_avg_royalty: result.botA_avg_royalty,
      botA_fl_entry: result.botA_fl_entry,
      botA_avg_score: result.botA_avg_score,
      botB_foul_rate: result.botB_foul_rate,
      botB_avg_royalty: result.botB_avg_royalty,
      botB_fl_entry: result.botB_fl_entry,
      botB_avg_score: result.botB_avg_score,
      win_rate_A: result.win_rate_A,
    });

    printReport(result, 'Smart', 'Simple', NUM_HANDS);
    console.log('Results saved to:');
  }

  // 5. 파일 저장
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n', 'utf-8');
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2) + '\n', 'utf-8');

  console.log(`  ${REGISTRY_PATH}`);
  console.log(`  ${HISTORY_PATH}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
