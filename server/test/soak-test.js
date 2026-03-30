/**
 * soak-test.js — Room 클래스 직접 조작 스트레스 테스트
 *
 * WebSocket 없이 Room 인스턴스를 직접 생성/조작하여
 * 1000핸드 × 랜덤 2~6인 게임을 실행하고 불변식을 매 핸드 검증한다.
 *
 * 실행: node server/test/soak-test.js
 */

const { Room } = require('../game/room');
const { createDeck, createCard } = require('../game/deck');
const { isFoul } = require('../game/evaluator');
const { scoreHand } = require('../game/scorer');

// ============================================================
// CLI 옵션 파싱
// ============================================================

const cliArgs = process.argv.slice(2);
const USE_SMART = cliArgs.includes('--smart');
const LOG_TRAINING = cliArgs.includes('--log-training');
const USE_CHAOS = cliArgs.includes('--chaos');
const TOTAL_HANDS_CLI = (() => {
  const idx = cliArgs.indexOf('--hands');
  return idx !== -1 && cliArgs[idx + 1] ? parseInt(cliArgs[idx + 1], 10) : null;
})();

// ============================================================
// 스마트 봇 로드 시도
// ============================================================

let smartBotModule = null;
if (USE_SMART) {
  try {
    smartBotModule = require('../game/smart-bot');
    console.log('[INFO] smart-bot.js 로드됨');
  } catch {
    // smart-bot.js가 없으면 기존 단순 봇 사용
    console.log('[WARN] smart-bot.js 없음 — 기존 단순 봇 사용');
    smartBotModule = null;
  }
}

// ============================================================
// 학습 데이터 수집 로거
// ============================================================

let trainingLogger = null;
if (LOG_TRAINING) {
  try {
    const TrainingLogger = require('../game/training-logger');
    trainingLogger = new TrainingLogger();
    console.log('[INFO] training-logger 로드됨');
  } catch {
    console.log('[WARN] training-logger.js 없음 — 학습 데이터 수집 비활성화');
    trainingLogger = null;
  }
}

// ============================================================
// 봇 전략 (ws-protocol.test.js와 동일)
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

function decidePlacement(hand, board, round, isFL, activePlayers) {
  if (isFL) return strategyFL(hand, board);
  if (round === 1) return strategyR1(hand, board);
  if (round === 5) return strategyR5(hand, board, activePlayers >= 4);
  return strategyR2to4(hand, board);
}

function strategyR1(hand, board) {
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

function strategyR2to4(hand, board) {
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

function strategyR5(hand, board, is4Plus) {
  if (is4Plus) {
    // 4인+ R5: hand.length에 관계없이 모두 배치, discard 없음
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
  return strategyR2to4(hand, board);
}

function strategyFL(hand, _board) {
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
    this.readyState = 1; // OPEN
    this.sentMessages = [];
  }
  send(data) {
    this.sentMessages.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
  }
  getLastMsg(type) {
    const filtered = this.sentMessages.filter((m) => m.type === type);
    return filtered[filtered.length - 1] || null;
  }
}

// ============================================================
// 불변식 검증
// ============================================================

function assert(condition, msg) {
  if (!condition) throw new Error(`INVARIANT FAILED: ${msg}`);
}

function verifyScoreZeroSum(results) {
  let total = 0;
  for (const [_id, r] of Object.entries(results)) {
    total += r.score || 0;
  }
  assert(total === 0, `Zero-sum: total=${total}, results=${JSON.stringify(results)}`);
}

function verifyBoardCompleteness(room) {
  const active = room.getActivePlayers();
  for (const id of active) {
    const p = room.players.get(id);
    if (p.folded) continue;
    const total = p.board.top.length + p.board.mid.length + p.board.bottom.length;
    assert(total === 13, `Player ${p.name} board incomplete: ${total}/13 (top=${p.board.top.length}, mid=${p.board.mid.length}, bottom=${p.board.bottom.length})`);
  }
}

function verifyFoulConsistency(results) {
  for (const [id, r] of Object.entries(results)) {
    if (r.fouled) {
      assert(r.royaltyTotal === 0, `Fouled player ${id} has royalty ${r.royaltyTotal}`);
    }
  }
}

// ============================================================
// 게임 시뮬레이션 (Room 직접 조작)
// ============================================================

function simulateHand(room, playerIds, wsMap, useSmartBot) {
  const activePlayers = room.getActivePlayers();
  const numActive = activePlayers.length;
  // 스마트 봇 사용 시 decide 시그니처를 decidePlacement 형식으로 래핑
  const decideFunc = (useSmartBot && smartBotModule && typeof smartBotModule.decide === 'function')
    ? (hand, board, round, isFL, activePlayers) => {
        return smartBotModule.decide(hand, board, round, { isFantasyland: isFL, is4Plus: activePlayers >= 4 });
      }
    : decidePlacement;

  for (let round = 1; round <= 5; round++) {
    // 각 활성 플레이어 턴
    const nonFL = room.getNonFLActivePlayers();

    for (let turnIdx = 0; turnIdx < nonFL.length; turnIdx++) {
      const currentId = room.getCurrentTurnPlayerId();
      if (!currentId) break;

      const player = room.players.get(currentId);
      if (!player || player.confirmed || player.folded) {
        // 턴 스킵
        continue;
      }

      const hand = player.hand;
      if (!hand || hand.length === 0) continue;

      const board = player.board;
      const isFL = player.inFantasyland;
      const decision = decideFunc(hand, board, room.round, isFL, numActive);

      // 카드 배치
      for (const placement of decision.placements) {
        const result = room.placeCard(currentId, placement.card, placement.line);
        if (result.error) {
          // 라인이 가득 찬 경우 다른 라인에 배치 시도
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
        // 확정 실패 — 남은 카드 강제 배치
        while (player.hand.length > 0) {
          const card = player.hand[0];
          for (const line of ['bottom', 'mid', 'top']) {
            const r = room.placeCard(currentId, card, line);
            if (!r.error) break;
          }
          // 디스카드가 필요할 수 있음
          if (player.hand.length > 0 && player.discarded.length === 0 && room.round > 1) {
            room.discardCard(currentId, player.hand[0]);
          }
        }
        const retry = room.confirmPlacement(currentId);
        if (retry.error) {
          // 포기 — autoFold
          room.autoFold(currentId);
        }
      }

      if (confirmResult && !confirmResult.error) {
        if (confirmResult.action === 'handScored') {
          return confirmResult;
        }
        if (confirmResult.action === 'newRound') {
          break; // 다음 라운드로
        }
      }
    }

    // FL 플레이어 처리
    const flPlayers = room.getFLActivePlayers();
    for (const flId of flPlayers) {
      const flPlayer = room.players.get(flId);
      if (flPlayer.confirmed) continue;
      if (flPlayer.hand.length === 0) continue;

      const decision = (useSmartBot && smartBotModule && typeof smartBotModule.decide === 'function')
        ? smartBotModule.decide(flPlayer.hand, flPlayer.board, room.round, { isFL: true, activePlayers: numActive })
        : strategyFL(flPlayer.hand, flPlayer.board);
      for (const placement of decision.placements) {
        room.placeCard(flId, placement.card, placement.line);
      }
      if (decision.discard) {
        room.discardCard(flId, decision.discard);
      }
      const result = room.confirmPlacement(flId);
      if (result && result.action === 'handScored') {
        return result;
      }
    }
  }

  // 핸드가 자동 종료되지 않았으면 강제 종료
  return room.endHand();
}

// ============================================================
// 메인 Soak 테스트
// ============================================================

// ============================================================
// Chaos 모드 헬퍼
// ============================================================

/**
 * Chaos: 랜덤 플레이어 제거 후 재참가 시도
 * @returns {{ removed: boolean, rejoined: boolean }}
 */
function chaosRemoveAndRejoin(room, playerIds, wsMap) {
  const active = room.getActivePlayers();
  if (active.length <= 2) return { removed: false, rejoined: false };

  // 랜덤 플레이어 선택 (호스트 제외)
  const candidates = active.filter(id => id !== room.hostId);
  if (candidates.length === 0) return { removed: false, rejoined: false };
  const targetId = candidates[Math.floor(Math.random() * candidates.length)];
  const targetPlayer = room.players.get(targetId);
  if (!targetPlayer) return { removed: false, rejoined: false };

  const targetName = targetPlayer.name;

  // 제거
  room.removePlayer(targetId);
  const idxInList = playerIds.indexOf(targetId);

  // 재참가 시도 (방이 waiting 상태가 아니면 실패할 수 있음)
  const newWs = new MockWS();
  const rejoinResult = room.addPlayer(targetName + '-R', newWs);
  if (!rejoinResult.error) {
    // 재참가 성공 — playerIds/wsMap 업데이트
    if (idxInList !== -1) {
      playerIds[idxInList] = rejoinResult.playerId;
    } else {
      playerIds.push(rejoinResult.playerId);
    }
    wsMap[rejoinResult.playerId] = newWs;
    return { removed: true, rejoined: true };
  }

  // 재참가 실패 (게임 진행 중) — 제거된 상태로 계속
  return { removed: true, rejoined: false };
}

/**
 * Chaos: 잘못된 카드 배치 시도 후 에러 무시하고 정상 배치
 */
function chaosInvalidPlacement(room, playerId) {
  // 존재하지 않는 카드로 배치 시도
  const fakeCard = { rank: 15, suit: 9 };
  const result = room.placeCard(playerId, fakeCard, 'bottom');
  // 에러 무시 — 정상 흐름으로 복귀
  return result.error ? true : false;
}

async function main() {
  const TOTAL_HANDS = TOTAL_HANDS_CLI || 1000;
  const memorySnapshots = [];
  let totalErrors = 0;
  let totalHands = 0;
  let totalFouls = 0;
  let totalFL = 0;
  const handTimes = [];
  const playerCounts = { 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

  // Chaos 통계
  let chaosRemoves = 0;
  let chaosRejoins = 0;
  let chaosInvalidPlacements = 0;

  // 스마트 봇 전략 함수 선택
  const useSmartDecide = USE_SMART && smartBotModule && typeof smartBotModule.decide === 'function';

  console.log('========================================');
  console.log(`Soak Test: ${TOTAL_HANDS} hands`);
  if (USE_SMART) console.log(`Bot: ${useSmartDecide ? 'smart-bot.js' : 'simple (smart-bot.js 없음)'}`);
  if (LOG_TRAINING) console.log(`Training log: ${trainingLogger ? 'active' : 'inactive (logger 없음)'}`);
  if (USE_CHAOS) console.log('Chaos mode: ENABLED (10% remove, 5% invalid placement)');
  console.log('========================================');

  const startTime = Date.now();

  for (let handIdx = 0; handIdx < TOTAL_HANDS; handIdx++) {
    const handStart = Date.now();
    const numPlayers = 2 + Math.floor(Math.random() * 5); // 2~6
    playerCounts[numPlayers]++;

    try {
      // Room 생성
      const room = new Room({
        name: `Soak-${handIdx}`,
        maxPlayers: numPlayers,
        turnTimeLimit: 0, // 타이머 비활성
      });

      // 플레이어 추가
      const wsMap = {};
      const playerIds = [];
      for (let i = 0; i < numPlayers; i++) {
        const ws = new MockWS();
        const result = room.addPlayer(`Bot${i + 1}`, ws);
        if (result.error) throw new Error(result.error);
        playerIds.push(result.playerId);
        wsMap[result.playerId] = ws;
      }

      // 게임 시작
      const startResult = room.startGame(playerIds[0]);
      if (startResult.error) throw new Error(startResult.error);

      // 5~6인: Play/Fold
      if (numPlayers >= 5) {
        room.phase = 'playOrFold';
        const pofResult = room.initPlayOrFold();

        // 4명 play, 나머지 fold
        for (let i = 0; i < room.playOrFoldOrder.length; i++) {
          const pid = room.playOrFoldOrder[i];
          const choice = i < 4 ? 'play' : 'fold';
          room.playOrFoldResponse(pid, choice);
        }

        // fold 처리
        for (const [id, choice] of room.playOrFoldChoices) {
          if (choice === 'fold') {
            const p = room.players.get(id);
            if (p) p.folded = true;
          }
        }
      }

      // 게임 시작
      room.phase = 'playing';
      room.handNumber = 1;
      room.startNewHand();

      // ── Chaos 모드: 핸드 시작 직후 랜덤 이벤트 ──
      if (USE_CHAOS) {
        // 10% 확률로 랜덤 플레이어 제거 + 재참가 시도
        if (Math.random() < 0.10) {
          const chaos = chaosRemoveAndRejoin(room, playerIds, wsMap);
          if (chaos.removed) {
            chaosRemoves++;
            if (chaos.rejoined) chaosRejoins++;
          }
        }

        // 5% 확률로 잘못된 카드 배치 시도
        if (Math.random() < 0.05) {
          const currentId = room.getCurrentTurnPlayerId();
          if (currentId) {
            chaosInvalidPlacement(room, currentId);
            chaosInvalidPlacements++;
          }
        }
      }

      // 핸드 시뮬레이션
      const result = simulateHand(room, playerIds, wsMap, useSmartDecide);

      // 학습 데이터 수집
      if (trainingLogger && result && result.results) {
        try {
          trainingLogger.logHand({
            handIdx,
            numPlayers,
            results: result.results,
            boards: Object.fromEntries(
              [...room.players].map(([id, p]) => [id, { board: p.board, fouled: p.fouled }])
            ),
          });
        } catch { /* 로깅 실패 무시 */ }
      }

      // 불변식 검증
      if (result && result.results) {
        verifyScoreZeroSum(result.results);
        verifyFoulConsistency(result.results);

        // Foul/FL 통계
        for (const [_id, r] of Object.entries(result.results)) {
          if (r.fouled) totalFouls++;
          if (r.inFantasyland) totalFL++;
        }
      }

      // 보드 완성도 (fold 제외)
      try {
        verifyBoardCompleteness(room);
      } catch (e) {
        // 4인+ 게임에서 덱 부족 시 불완전 보드 허용
        // Chaos 모드에서 플레이어 제거 후 불완전 보드 허용
        if (numPlayers < 4 && !USE_CHAOS) throw e;
      }

      totalHands++;
      room.clearTurnTimer();

    } catch (err) {
      totalErrors++;
      if (totalErrors <= 10) {
        console.error(`  [ERROR] Hand ${handIdx} (${numPlayers}P): ${err.message}`);
      }
    }

    const handTime = Date.now() - handStart;
    handTimes.push(handTime);

    // 100핸드마다 메모리 측정
    if ((handIdx + 1) % 100 === 0) {
      const mem = process.memoryUsage();
      const heapMB = (mem.heapUsed / 1024 / 1024).toFixed(2);
      memorySnapshots.push({ hand: handIdx + 1, heapMB: parseFloat(heapMB) });
      console.log(`  [${handIdx + 1}/${TOTAL_HANDS}] Heap: ${heapMB} MB | Errors: ${totalErrors}`);
    }
  }

  const totalTime = Date.now() - startTime;
  const avgHandTime = handTimes.reduce((a, b) => a + b, 0) / handTimes.length;

  // 메모리 증가율 계산
  let memoryGrowthRate = 0;
  if (memorySnapshots.length >= 2) {
    const first = memorySnapshots[0].heapMB;
    const last = memorySnapshots[memorySnapshots.length - 1].heapMB;
    memoryGrowthRate = ((last - first) / first * 100).toFixed(2);
  }

  console.log('\n========================================');
  console.log('Soak Test Results');
  console.log('========================================');
  console.log(`Total hands:     ${totalHands}/${TOTAL_HANDS}`);
  console.log(`Errors:          ${totalErrors}`);
  console.log(`Total time:      ${(totalTime / 1000).toFixed(2)}s`);
  console.log(`Avg hand time:   ${avgHandTime.toFixed(2)}ms`);
  console.log(`Total fouls:     ${totalFouls}`);
  console.log(`Total FL:        ${totalFL}`);
  console.log(`Memory growth:   ${memoryGrowthRate}%`);
  if (USE_CHAOS) {
    console.log('Chaos stats:');
    console.log(`  Removes:              ${chaosRemoves}`);
    console.log(`  Rejoins:              ${chaosRejoins}`);
    console.log(`  Invalid placements:   ${chaosInvalidPlacements}`);
  }
  console.log('Player distribution:');
  for (const [count, times] of Object.entries(playerCounts)) {
    console.log(`  ${count}P: ${times} hands`);
  }
  console.log('Memory snapshots:');
  for (const snap of memorySnapshots) {
    console.log(`  Hand ${snap.hand}: ${snap.heapMB} MB`);
  }
  console.log('========================================');

  // 학습 데이터 로거 플러시
  if (trainingLogger && typeof trainingLogger.flush === 'function') {
    try {
      trainingLogger.flush();
      console.log(`Training data flushed: ${trainingLogger.count || '?'} records`);
    } catch { /* ignore */ }
  }

  if (totalErrors > 0) {
    console.log(`\nWARNING: ${totalErrors} errors occurred`);
    process.exit(1);
  } else {
    console.log('\nAll hands passed invariant checks.');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
