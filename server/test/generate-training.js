/**
 * generate-training.js — smart-bot으로 N핸드 실행하여 JSONL 학습 데이터 생성
 *
 * soak-test.js의 Room 직접 조작 패턴 + feature-extractor로 벡터 변환
 * 각 결정마다 { features, action_index, reward } 형태로 기록
 *
 * 실행: node server/test/generate-training.js --hands 10000
 */

const fs = require('fs');
const path = require('path');
const { Room } = require('../game/room');
const { createDeck, createCard } = require('../game/deck');
const { isFoul } = require('../game/evaluator');
const { extractFeatures } = require('../game/feature-extractor');

// ── smart-bot 로드 ──
let smartBot;
try {
  smartBot = require('../game/smart-bot');
  console.log('[INFO] smart-bot.js 로드됨');
} catch (e) {
  console.error('[ERROR] smart-bot.js 로드 실패:', e.message);
  process.exit(1);
}

// ── CLI 옵션 ──
const cliArgs = process.argv.slice(2);
const TOTAL_HANDS = (() => {
  const idx = cliArgs.indexOf('--hands');
  return idx !== -1 && cliArgs[idx + 1] ? parseInt(cliArgs[idx + 1], 10) : 10000;
})();
const OUTPUT_DIR = (() => {
  const idx = cliArgs.indexOf('--output');
  return idx !== -1 && cliArgs[idx + 1] ? cliArgs[idx + 1] : path.join(__dirname, '..', '..', 'data', 'training');
})();

// ── Mock WebSocket ──
class MockWS {
  constructor() { this.readyState = 1; this.sentMessages = []; }
  send(data) { this.sentMessages.push(JSON.parse(data)); }
  close() { this.readyState = 3; }
}

// ── 간단한 봇 전략 (fallback) ──
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

// ── 액션 인코딩: placement → action_index ──
// line mapping: top=0, mid=1, bottom=2
// action_index = placement 조합의 해시 (간단: 각 카드의 line을 3진법으로 인코딩)
const LINE_INDEX = { top: 0, mid: 1, bottom: 2 };

function encodeAction(placements) {
  // 최대 5장 배치, 각 장에 대해 line index를 3진법으로 인코딩
  let index = 0;
  for (let i = 0; i < placements.length; i++) {
    const lineIdx = LINE_INDEX[placements[i].line] || 0;
    index += lineIdx * Math.pow(3, i);
  }
  return index;
}

// ── 데이터 수집 버퍼 ──
const trainingData = [];

/**
 * 한 핸드를 시뮬레이션하고 각 결정의 feature + action을 수집
 * 핸드 종료 후 reward(최종 점수)를 역전파
 */
function simulateHandWithLogging(room, playerIds, wsMap) {
  const activePlayers = room.getActivePlayers();
  const numActive = activePlayers.length;
  const handDecisions = new Map(); // playerId → [{features, action_index}]

  // 각 플레이어의 결정을 모을 배열 초기화
  for (const pid of activePlayers) {
    handDecisions.set(pid, []);
  }

  // 죽은 카드 수집
  const allDeadCards = [];

  for (let round = 1; round <= 5; round++) {
    const nonFL = room.getNonFLActivePlayers();

    for (let turnIdx = 0; turnIdx < nonFL.length; turnIdx++) {
      const currentId = room.getCurrentTurnPlayerId();
      if (!currentId) break;

      const player = room.players.get(currentId);
      if (!player || player.confirmed || player.folded) continue;

      const hand = player.hand;
      if (!hand || hand.length === 0) continue;

      const board = player.board;
      const isFL = player.inFantasyland;

      // ── Feature 추출 (결정 전 상태) ──
      const features = extractFeatures(board, hand, room.round, allDeadCards);

      // ── smart-bot 결정 ──
      let decision;
      try {
        decision = smartBot.decide(hand, board, room.round, {
          isFantasyland: isFL,
          is4Plus: numActive >= 4
        });
      } catch {
        // fallback
        decision = { placements: [], discard: null };
      }

      // ── 액션 인코딩 ──
      const actionIndex = encodeAction(decision.placements || []);

      // 결정 기록
      if (handDecisions.has(currentId)) {
        handDecisions.get(currentId).push({ features, action_index: actionIndex });
      }

      // ── 카드 배치 실행 ──
      for (const placement of (decision.placements || [])) {
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
        allDeadCards.push(decision.discard);
      }

      // 확정
      const confirmResult = room.confirmPlacement(currentId);
      if (confirmResult && confirmResult.error) {
        // 남은 카드 강제 배치
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
        if (retry && retry.error) {
          room.autoFold(currentId);
        }
      }

      if (confirmResult && !confirmResult.error) {
        if (confirmResult.action === 'handScored') {
          return assignRewards(confirmResult, handDecisions);
        }
        if (confirmResult.action === 'newRound') {
          break;
        }
      }
    }

    // FL 플레이어 처리
    const flPlayers = room.getFLActivePlayers();
    for (const flId of flPlayers) {
      const flPlayer = room.players.get(flId);
      if (flPlayer.confirmed) continue;
      if (flPlayer.hand.length === 0) continue;

      const features = extractFeatures(flPlayer.board, flPlayer.hand, room.round, allDeadCards);
      const decision = strategyFL(flPlayer.hand, flPlayer.board);
      const actionIndex = encodeAction(decision.placements || []);

      if (handDecisions.has(flId)) {
        handDecisions.get(flId).push({ features, action_index: actionIndex });
      }

      for (const placement of decision.placements) {
        room.placeCard(flId, placement.card, placement.line);
      }
      if (decision.discard) {
        room.discardCard(flId, decision.discard);
        allDeadCards.push(decision.discard);
      }
      const result = room.confirmPlacement(flId);
      if (result && result.action === 'handScored') {
        return assignRewards(result, handDecisions);
      }
    }
  }

  // 핸드 미종료 시 강제 종료
  const endResult = room.endHand();
  return assignRewards(endResult, handDecisions);
}

/**
 * 핸드 결과에서 reward를 각 결정에 할당
 */
function assignRewards(handResult, handDecisions) {
  const results = handResult && handResult.results ? handResult.results : {};
  let dataCount = 0;

  for (const [playerId, decisions] of handDecisions) {
    // 해당 플레이어의 최종 점수를 reward로 사용
    const playerResult = results[playerId];
    const reward = playerResult ? (playerResult.score || 0) : 0;

    for (const d of decisions) {
      trainingData.push({
        features: d.features,
        action_index: d.action_index,
        reward: reward
      });
      dataCount++;
    }
  }

  return { results, dataCount };
}

// ── 메인 ──
async function main() {
  console.log('========================================');
  console.log(`Training Data Generator: ${TOTAL_HANDS} hands`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log('========================================');

  // 출력 디렉토리 생성
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const startTime = Date.now();
  let totalErrors = 0;
  let totalDecisions = 0;

  for (let handIdx = 0; handIdx < TOTAL_HANDS; handIdx++) {
    const numPlayers = 2 + Math.floor(Math.random() * 3); // 2~4인 (학습 안정성)

    try {
      const room = new Room({
        name: `Train-${handIdx}`,
        maxPlayers: numPlayers,
        turnTimeLimit: 0,
      });

      const wsMap = {};
      const playerIds = [];
      for (let i = 0; i < numPlayers; i++) {
        const ws = new MockWS();
        const result = room.addPlayer(`Bot${i + 1}`, ws);
        if (result.error) throw new Error(result.error);
        playerIds.push(result.playerId);
        wsMap[result.playerId] = ws;
      }

      const startResult = room.startGame(playerIds[0]);
      if (startResult.error) throw new Error(startResult.error);

      room.phase = 'playing';
      room.handNumber = 1;
      room.startNewHand();

      const result = simulateHandWithLogging(room, playerIds, wsMap);
      if (result) totalDecisions += result.dataCount || 0;

      room.clearTurnTimer();
    } catch (err) {
      totalErrors++;
      if (totalErrors <= 5) {
        console.error(`  [ERROR] Hand ${handIdx}: ${err.message}`);
      }
    }

    // 진행률 표시
    if ((handIdx + 1) % 1000 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  [${handIdx + 1}/${TOTAL_HANDS}] Decisions: ${trainingData.length} | Errors: ${totalErrors} | ${elapsed}s`);
    }
  }

  // ── JSONL 파일 저장 ──
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `training-${timestamp}.jsonl`;
  const filepath = path.join(OUTPUT_DIR, filename);

  const lines = trainingData.map(d => JSON.stringify(d));
  fs.writeFileSync(filepath, lines.join('\n') + '\n', 'utf-8');

  // latest.jsonl 심볼릭 링크 (또는 복사)
  const latestPath = path.join(OUTPUT_DIR, 'latest.jsonl');
  try {
    if (fs.existsSync(latestPath)) fs.unlinkSync(latestPath);
    fs.copyFileSync(filepath, latestPath);
  } catch {
    // 심볼릭 링크 실패 시 무시
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  const fileSizeKB = (fs.statSync(filepath).size / 1024).toFixed(1);

  console.log('\n========================================');
  console.log('Training Data Generation Complete');
  console.log('========================================');
  console.log(`Total hands:      ${TOTAL_HANDS}`);
  console.log(`Total decisions:  ${trainingData.length}`);
  console.log(`Errors:           ${totalErrors}`);
  console.log(`Time:             ${totalTime}s`);
  console.log(`File:             ${filepath}`);
  console.log(`File size:        ${fileSizeKB} KB`);
  console.log(`Avg decisions/hand: ${(trainingData.length / TOTAL_HANDS).toFixed(1)}`);
  console.log('========================================');

  if (totalErrors > TOTAL_HANDS * 0.1) {
    console.log(`\nWARNING: ${totalErrors} errors (>${(TOTAL_HANDS * 0.1)} threshold)`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
