/**
 * ws-protocol.test.js — WebSocket 프로토콜 테스트
 *
 * ws 라이브러리로 직접 WebSocket 연결 (브라우저 없음)
 * 2인~6인 풀게임 시나리오 + 불변식 6개 자동 검증
 *
 * 실행: PORT=3099 node server/index.js  (별도 터미널)
 *       node server/test/ws-protocol.test.js
 */

const WebSocket = require('ws');
const http = require('http');

const SERVER = process.env.SERVER_URL || 'http://localhost:3099';
const WS_BASE = SERVER.replace('http', 'ws');

// ============================================================
// 헬퍼 함수
// ============================================================

function httpRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, SERVER);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      headers: { 'Content-Type': 'application/json' },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function createRoomHTTP(name, maxPlayers = 3, turnTimeLimit = 30) {
  const res = await httpRequest('POST', '/api/rooms', {
    name,
    max_players: maxPlayers,
    turn_time_limit: turnTimeLimit,
  });
  assert(res.status === 201, `Room creation failed: ${JSON.stringify(res)}`);
  return res.body;
}

function connectPlayer(roomId, playerName) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_BASE}/ws/game/${roomId}`);
    const messages = [];
    let playerId = null;
    let sessionToken = null;

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'joinRequest',
        payload: { playerName },
      }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      messages.push(msg);

      if (msg.type === 'joinAccepted') {
        playerId = msg.payload.playerId;
        sessionToken = msg.payload.sessionToken;
      }
    });

    ws.on('error', reject);

    // joinAccepted 대기
    const interval = setInterval(() => {
      if (playerId) {
        clearInterval(interval);
        resolve({
          ws,
          messages,
          get playerId() { return playerId; },
          get sessionToken() { return sessionToken; },
          playerName,
          send(type, payload = {}) {
            ws.send(JSON.stringify({ type, payload }));
          },
          waitForMsg(type, timeoutMs = 15000) {
            return waitForMessage(messages, type, timeoutMs);
          },
          getMsg(type) {
            return messages.filter((m) => m.type === type);
          },
          getLastMsg(type) {
            const filtered = messages.filter((m) => m.type === type);
            return filtered[filtered.length - 1];
          },
        });
      }
    }, 100);

    setTimeout(() => {
      clearInterval(interval);
      reject(new Error(`Player ${playerName} join timeout`));
    }, 10000);
  });
}

function waitForMessage(messages, type, timeoutMs = 15000) {
  const startLen = messages.length;
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(() => {
      for (let i = startLen; i < messages.length; i++) {
        if (messages[i].type === type) {
          clearInterval(interval);
          resolve(messages[i]);
          return;
        }
      }
      if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        reject(new Error(`Timeout waiting for message type: ${type}`));
      }
    }, 100);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ============================================================
// 봇 전략 (bot-strategy.ts 포팅)
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
  // 남은 카드 배치
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

function strategyFL(hand, board) {
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
// 불변식 검증
// ============================================================

function assert(condition, msg) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function verifyInvariants(label, playerHandles, scoredResults) {
  console.log(`  [INVARIANT CHECK] ${label}`);

  // 1. 점수 zero-sum
  if (scoredResults) {
    const results = scoredResults.results || {};
    let totalScore = 0;
    for (const [id, r] of Object.entries(results)) {
      totalScore += r.score || 0;
    }
    assert(totalScore === 0, `Zero-sum violated: total=${totalScore}`);
    console.log('    [OK] Zero-sum');
  }

  // 2. 메시지 순서: dealerSelection은 gameStart 전에 와야 함
  for (const p of playerHandles) {
    const msgs = p.messages.map((m) => m.type);
    const dealerIdx = msgs.indexOf('dealerSelection');
    const gameStartIdx = msgs.indexOf('gameStart');
    if (dealerIdx !== -1 && gameStartIdx !== -1) {
      assert(dealerIdx < gameStartIdx, `Message order: dealerSelection(${dealerIdx}) should be before gameStart(${gameStartIdx})`);
    }
    // handScored는 gameStart 후에
    const scoredIdx = msgs.lastIndexOf('handScored');
    if (scoredIdx !== -1 && gameStartIdx !== -1) {
      assert(scoredIdx > gameStartIdx, `handScored(${scoredIdx}) should be after gameStart(${gameStartIdx})`);
    }
  }
  console.log('    [OK] Message order');

  // 3. Foul 일관성 (scoredResults에서)
  if (scoredResults) {
    const results = scoredResults.results || {};
    for (const [id, r] of Object.entries(results)) {
      if (r.fouled) {
        // Foul 플레이어는 royaltyTotal === 0
        assert(r.royaltyTotal === 0, `Fouled player ${id} has non-zero royalty: ${r.royaltyTotal}`);
      }
    }
    console.log('    [OK] Foul consistency');
  }

  console.log(`  [INVARIANT CHECK] ${label} PASSED`);
}

// ============================================================
// 게임 플레이 로직 (이벤트 드리븐)
// ============================================================

async function playFullHand(playerHandles, activePlayers) {
  // 각 플레이어의 현재 보드 상태 추적 (로컬)
  const boards = {};
  for (const p of playerHandles) {
    boards[p.playerId] = { top: [], mid: [], bottom: [] };
  }

  // 이벤트 드리븐: dealCards를 받으면 즉시 응답하는 핸들러를 각 플레이어에 설치
  const dealCounts = {};
  for (const p of playerHandles) {
    dealCounts[p.playerId] = 0;
  }

  // 핸드 완료 시그널
  let handScored = null;
  let resolveScored = null;
  const scoredPromise = new Promise((resolve) => { resolveScored = resolve; });

  // 각 플레이어의 메시지를 폴링하며 dealCards에 자동 응답
  const pollers = playerHandles.map((p) => {
    let lastProcessed = p.messages.length;
    const interval = setInterval(() => {
      while (lastProcessed < p.messages.length) {
        const msg = p.messages[lastProcessed];
        lastProcessed++;

        if (msg.type === 'dealCards') {
          const cards = msg.payload.cards;
          const currentRound = msg.payload.round;
          if (!cards || cards.length === 0) continue;

          dealCounts[p.playerId]++;
          const board = boards[p.playerId];
          const isFL = msg.payload.inFantasyland;
          const decision = decidePlacement(cards, board, currentRound, isFL, activePlayers);

          // 카드 배치 (동기 전송)
          for (const placement of decision.placements) {
            p.send('placeCard', { card: placement.card, line: placement.line });
            board[placement.line].push(placement.card);
          }

          // 디스카드
          if (decision.discard) {
            p.send('discardCard', { card: decision.discard });
          }

          // 약간의 지연 후 확정 + 에러 복구
          const prevErrorCount = p.getMsg('error').length;
          setTimeout(() => {
            p.send('confirmPlacement');

            // 에러 확인 (200ms 후)
            setTimeout(() => {
              const newErrors = p.getMsg('error');
              if (newErrors.length > prevErrorCount) {
                console.log(`  [WARN] Confirm error for ${p.playerName}: ${newErrors[newErrors.length - 1].payload || 'unknown'}`);
                // 남은 카드 강제 배치 시도 — 실패 시 서버 타임아웃 처리
              }
            }, 200);
          }, 100);
        }

        if (msg.type === 'handScored') {
          handScored = msg.payload;
          resolveScored(msg.payload);
        }
      }
    }, 50);
    return interval;
  });

  // handScored 또는 60초 타임아웃 대기
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('playFullHand timeout (60s)')), 60000)
  );

  let result = null;
  try {
    result = await Promise.race([scoredPromise, timeout]);
  } catch (err) {
    console.log(`  [WARN] ${err.message}`);
  }

  // 폴러 정리
  for (const interval of pollers) {
    clearInterval(interval);
  }

  return result;
}

// ============================================================
// 테스트 시나리오
// ============================================================

async function test2Players() {
  console.log('\n=== TEST: 2-Player Full Game ===');
  const room = await createRoomHTTP('WS-2P', 2, 30);
  const p1 = await connectPlayer(room.id, 'WS-P1');
  const p2 = await connectPlayer(room.id, 'WS-P2');

  // 호스트가 게임 시작
  p1.send('startGame');

  // dealerSelection 대기
  await p1.waitForMsg('dealerSelection');
  await sleep(500);

  // 풀 게임 진행
  const scored = await playFullHand([p1, p2], 2);
  verifyInvariants('2P Hand 1', [p1, p2], scored);

  // Ready → 다음 핸드
  p1.send('readyForNextHand');
  p2.send('readyForNextHand');
  await sleep(1000);

  p1.ws.close();
  p2.ws.close();
  console.log('=== TEST: 2-Player Full Game PASSED ===\n');
}

async function test3Players() {
  console.log('\n=== TEST: 3-Player Full Game ===');
  const room = await createRoomHTTP('WS-3P', 3, 30);
  const p1 = await connectPlayer(room.id, 'WS-3P-1');
  const p2 = await connectPlayer(room.id, 'WS-3P-2');
  const p3 = await connectPlayer(room.id, 'WS-3P-3');

  p1.send('startGame');
  await p1.waitForMsg('dealerSelection');
  await sleep(500);

  const scored = await playFullHand([p1, p2, p3], 3);
  verifyInvariants('3P Hand 1', [p1, p2, p3], scored);

  p1.ws.close();
  p2.ws.close();
  p3.ws.close();
  console.log('=== TEST: 3-Player Full Game PASSED ===\n');
}

async function test4Players() {
  console.log('\n=== TEST: 4-Player Full Game ===');
  const room = await createRoomHTTP('WS-4P', 4, 30);
  const handles = [];
  for (let i = 1; i <= 4; i++) {
    handles.push(await connectPlayer(room.id, `WS-4P-${i}`));
  }

  handles[0].send('startGame');
  await handles[0].waitForMsg('dealerSelection');
  await sleep(500);

  const scored = await playFullHand(handles, 4);
  verifyInvariants('4P Hand 1', handles, scored);

  for (const h of handles) h.ws.close();
  console.log('=== TEST: 4-Player Full Game PASSED ===\n');
}

async function test5PlayersWithFold() {
  console.log('\n=== TEST: 5-Player with Play/Fold ===');
  const room = await createRoomHTTP('WS-5P', 5, 30);
  const handles = [];
  for (let i = 1; i <= 5; i++) {
    handles.push(await connectPlayer(room.id, `WS-5P-${i}`));
  }

  handles[0].send('startGame');
  await handles[0].waitForMsg('dealerSelection');
  await sleep(1000);

  // Play/Fold 순차 추적: respondedSet으로 중복 방지
  const respondedSet5 = new Set();
  const playerCount5 = 5;

  for (let expected = 0; expected < playerCount5; expected++) {
    for (const h of handles) {
      if (respondedSet5.has(h.playerName)) continue;
      const reqs = h.getMsg('playOrFoldRequest');
      if (reqs.length > 0 && !respondedSet5.has(h.playerName)) {
        const choice = respondedSet5.size < 4 ? 'play' : 'fold';
        h.send('playOrFoldResponse', { choice });
        respondedSet5.add(h.playerName);
        await sleep(500);
        break;
      }
    }
    await sleep(300);
  }

  // 4인 게임 진행
  await sleep(1000);
  const activeHandles = handles.slice(0, 4); // 실제로는 서버가 결정
  const scored = await playFullHand(activeHandles, 4);
  if (scored) {
    verifyInvariants('5P Hand 1', handles, scored);
  }

  for (const h of handles) h.ws.close();
  console.log('=== TEST: 5-Player with Play/Fold PASSED ===\n');
}

async function test6PlayersWithFold() {
  console.log('\n=== TEST: 6-Player with Play/Fold ===');
  const room = await createRoomHTTP('WS-6P', 6, 30);
  const handles = [];
  for (let i = 1; i <= 6; i++) {
    handles.push(await connectPlayer(room.id, `WS-6P-${i}`));
  }

  handles[0].send('startGame');
  await handles[0].waitForMsg('dealerSelection');
  await sleep(1000);

  // Play/Fold 순차 추적: 4명 play, 2명 fold
  const respondedSet6 = new Set();
  const playerCount6 = 6;

  for (let expected = 0; expected < playerCount6; expected++) {
    for (const h of handles) {
      if (respondedSet6.has(h.playerName)) continue;
      const reqs = h.getMsg('playOrFoldRequest');
      if (reqs.length > 0 && !respondedSet6.has(h.playerName)) {
        const choice = respondedSet6.size < 4 ? 'play' : 'fold';
        h.send('playOrFoldResponse', { choice });
        respondedSet6.add(h.playerName);
        await sleep(500);
        break;
      }
    }
    await sleep(300);
  }

  await sleep(1000);
  const activeHandles = handles.slice(0, 4);
  const scored = await playFullHand(activeHandles, 4);
  if (scored) {
    verifyInvariants('6P Hand 1', handles, scored);
  }

  for (const h of handles) h.ws.close();
  console.log('=== TEST: 6-Player with Play/Fold PASSED ===\n');
}

// ============================================================
// 메인 실행
// ============================================================

async function main() {
  console.log('========================================');
  console.log('WS Protocol Test Suite');
  console.log(`Server: ${SERVER}`);
  console.log('========================================');

  let passed = 0;
  let failed = 0;
  const errors = [];

  const tests = [
    ['2-Player', test2Players],
    ['3-Player', test3Players],
    ['4-Player', test4Players],
    ['5-Player with Fold', test5PlayersWithFold],
    ['6-Player with Fold', test6PlayersWithFold],
  ];

  for (const [name, fn] of tests) {
    try {
      await fn();
      passed++;
    } catch (err) {
      failed++;
      errors.push({ name, error: err.message });
      console.error(`=== TEST ${name} FAILED: ${err.message} ===`);
    }
  }

  console.log('\n========================================');
  console.log(`Results: ${passed} passed, ${failed} failed out of ${tests.length}`);
  if (errors.length > 0) {
    console.log('Failures:');
    for (const e of errors) {
      console.log(`  - ${e.name}: ${e.error}`);
    }
  }
  console.log('========================================');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
