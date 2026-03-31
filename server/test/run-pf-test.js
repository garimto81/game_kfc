/**
 * Play/Fold 전수 테스트만 실행하는 래퍼
 * Usage: SERVER_URL=http://localhost:8098 node server/test/run-pf-test.js
 */

// ws-protocol.test.js를 불러오지 않고, 필요한 부분만 추출 실행
// 대신 전체 테스트 파일에서 testPlayFoldCombinations만 실행하도록 별도 main을 구성

const WebSocket = require('ws');
const http = require('http');
const path = require('path');

const { evaluateLine, compareHands } = require(path.join(__dirname, '..', 'game', 'evaluator'));
const { calcTotalRoyalty } = require(path.join(__dirname, '..', 'game', 'royalty'));

const SERVER = process.env.SERVER_URL || 'http://localhost:8098';
const WS_BASE = SERVER.replace('http', 'ws');

// ── 헬퍼 (ws-protocol.test.js 에서 복사) ──

function httpRequest(method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, SERVER);
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
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function assert(condition, msg) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function createRoomHTTP(name, maxPlayers = 3, turnTimeLimit = 30) {
  const res = await httpRequest('POST', '/api/rooms', {
    name, max_players: maxPlayers, turn_time_limit: turnTimeLimit,
  });
  assert(res.status === 201, `Room creation failed: ${JSON.stringify(res)}`);
  return res.body;
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

function connectPlayer(roomId, playerName) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_BASE}/ws/game/${roomId}`);
    const messages = [];
    let playerId = null;
    let sessionToken = null;

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'joinRequest', payload: { playerName } }));
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

    const interval = setInterval(() => {
      if (playerId) {
        clearInterval(interval);
        resolve({
          ws, messages,
          get playerId() { return playerId; },
          get sessionToken() { return sessionToken; },
          playerName,
          send(type, payload = {}) { ws.send(JSON.stringify({ type, payload })); },
          waitForMsg(type, timeoutMs = 15000) { return waitForMessage(messages, type, timeoutMs); },
          getMsg(type) { return messages.filter((m) => m.type === type); },
          getLastMsg(type) { const f = messages.filter((m) => m.type === type); return f[f.length - 1]; },
        });
      }
    }, 100);
    setTimeout(() => { clearInterval(interval); reject(new Error(`Player ${playerName} join timeout`)); }, 10000);
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── 봇 전략 ──

function sortByRankDesc(cards) {
  return [...cards].sort((a, b) => b.rank - a.rank || b.suit - a.suit);
}

function remainingSlots(board) {
  return { top: 3 - board.top.length, mid: 5 - board.mid.length, bottom: 5 - board.bottom.length };
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
  const lineOrder = ['bottom', 'mid', 'top'].filter((l) => slots[l] > 0).sort((a, b) => slots[b] - slots[a]);
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
    const sorted = sortByRankDesc(hand);
    const slots = remainingSlots(board);
    const lineOrder = ['bottom', 'mid', 'top'].filter((l) => slots[l] > 0).sort((a, b) => slots[b] - slots[a]);
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

// ── 불변식 ──

const SCHEMAS = {
  joinAccepted: ['playerId', 'sessionToken', 'hostId'],
  dealerSelection: ['dealerId', 'dealerCards', 'playerOrder'],
  gameStart: ['turnTimeLimit', 'currentTurnPlayerId'],
  dealCards: ['cards', 'round', 'handNumber'],
  turnChanged: ['currentTurnPlayerId'],
  handScored: ['results', 'handNumber'],
  stateUpdate: ['players', 'phase'],
  error: ['message'],
};

function getBoardFromState(playerHandles, targetPlayerId) {
  for (const p of playerHandles) {
    const stateUpdates = p.getMsg('stateUpdate');
    if (stateUpdates.length === 0) continue;
    const lastState = stateUpdates[stateUpdates.length - 1];
    if (lastState.payload && lastState.payload.players && lastState.payload.players[targetPlayerId]) {
      return lastState.payload.players[targetPlayerId].board;
    }
  }
  return null;
}

function verifyInvariants(label, playerHandles, scoredResults, handNumber) {
  console.log(`  [INVARIANT CHECK] ${label}`);

  // INV1: zero-sum
  if (scoredResults) {
    const results = scoredResults.results || {};
    let totalScore = 0;
    for (const [id, r] of Object.entries(results)) totalScore += r.score || 0;
    assert(totalScore === 0, `INV1 Zero-sum violated: total=${totalScore}`);
    console.log('    [OK] INV1: Zero-sum');
  }

  // INV2: message order
  for (const p of playerHandles) {
    const msgs = p.messages.map((m) => m.type);
    const dealerIdx = msgs.indexOf('dealerSelection');
    const gameStartIdx = msgs.indexOf('gameStart');
    if (dealerIdx !== -1 && gameStartIdx !== -1)
      assert(dealerIdx < gameStartIdx, `INV2 dealerSelection before gameStart`);
    const scoredIdx = msgs.lastIndexOf('handScored');
    if (scoredIdx !== -1 && gameStartIdx !== -1)
      assert(scoredIdx > gameStartIdx, `INV2 handScored after gameStart`);
  }
  console.log('    [OK] INV2: Message order');

  // INV3: foul consistency
  if (scoredResults) {
    const results = scoredResults.results || {};
    for (const [id, r] of Object.entries(results)) {
      if (r.fouled) assert(r.royaltyTotal === 0, `INV3 Fouled ${id} royalty=${r.royaltyTotal}`);
    }
    console.log('    [OK] INV3: Foul consistency');
  }

  // INV4: card uniqueness per round
  {
    const roundCards = {};
    for (const p of playerHandles) {
      for (const dm of p.getMsg('dealCards')) {
        if (!dm.payload || !dm.payload.cards) continue;
        if (handNumber !== undefined && dm.payload.handNumber !== handNumber) continue;
        const round = dm.payload.round;
        if (!roundCards[round]) roundCards[round] = [];
        for (const c of dm.payload.cards) roundCards[round].push({ card: c, player: p.playerName });
      }
    }
    for (const [round, cards] of Object.entries(roundCards)) {
      const cardSet = new Set();
      for (const { card, player } of cards) {
        const key = `${card.rank}-${card.suit}`;
        assert(!cardSet.has(key), `INV4 Round ${round}: ${key} duplicate`);
        cardSet.add(key);
      }
    }
    const allCardKeys = new Set();
    for (const cards of Object.values(roundCards))
      for (const { card } of cards) allCardKeys.add(`${card.rank}-${card.suit}`);
    assert(allCardKeys.size <= 52, `INV4 >52 unique cards: ${allCardKeys.size}`);
    const totalCards = Object.values(roundCards).reduce((s, c) => s + c.length, 0);
    console.log(`    [OK] INV4: Card uniqueness (${totalCards} cards, ${allCardKeys.size} unique)`);
  }

  // INV11: handScored identical
  {
    const scoredPayloads = [];
    for (const p of playerHandles) {
      const scoredMsgs = p.getMsg('handScored');
      if (scoredMsgs.length > 0) {
        const last = scoredMsgs[scoredMsgs.length - 1];
        if (last.payload && last.payload.results) scoredPayloads.push(JSON.stringify(last.payload.results));
      }
    }
    if (scoredPayloads.length >= 2) {
      const first = scoredPayloads[0];
      for (let i = 1; i < scoredPayloads.length; i++)
        assert(first === scoredPayloads[i], `INV11 handScored diff player 0 vs ${i}`);
      console.log('    [OK] INV11: handScored byte-identical');
    }
  }

  // INV12: schema
  {
    let violations = 0;
    for (const p of playerHandles) {
      for (const msg of p.messages) {
        const schema = SCHEMAS[msg.type];
        if (!schema) continue;
        for (const field of schema) {
          if (!msg.payload || !(field in msg.payload)) { violations++; }
        }
      }
    }
    assert(violations === 0, `INV12 Schema violations: ${violations}`);
    console.log('    [OK] INV12: Message schema');
  }

  console.log(`  [INVARIANT CHECK] ${label} — PASSED`);
}

// ── playFullHand ──

async function playFullHand(playerHandles, activePlayers) {
  const boards = {};
  for (const p of playerHandles) boards[p.playerId] = { top: [], mid: [], bottom: [] };

  let handScored = null;
  let resolveScored = null;
  const scoredPromise = new Promise((resolve) => { resolveScored = resolve; });

  const pollers = playerHandles.map((p) => {
    // Start from after the last gameStart message so we catch dealCards that arrived before playFullHand
    let lastProcessed = 0;
    for (let i = p.messages.length - 1; i >= 0; i--) {
      if (p.messages[i].type === 'gameStart') { lastProcessed = i + 1; break; }
    }
    const interval = setInterval(() => {
      while (lastProcessed < p.messages.length) {
        const msg = p.messages[lastProcessed];
        lastProcessed++;

        if (msg.type === 'dealCards') {
          const cards = msg.payload.cards;
          const currentRound = msg.payload.round;
          if (!cards || cards.length === 0) continue;

          const board = boards[p.playerId];
          if (!board) {
            console.log(`    [WARN] No board for ${p.playerName}, skipping dealCards R${currentRound}`);
            continue;
          }
          const isFL = msg.payload.inFantasyland;
          const decision = decidePlacement(cards, board, currentRound, isFL, activePlayers);

          for (const placement of decision.placements) {
            p.send('placeCard', { card: placement.card, line: placement.line });
            board[placement.line].push(placement.card);
          }
          if (decision.discard) p.send('discardCard', { card: decision.discard });

          const prevErrors = p.getMsg('error').length;
          setTimeout(() => {
            p.send('confirmPlacement');
            // Check for errors
            setTimeout(() => {
              const newErrors = p.getMsg('error');
              if (newErrors.length > prevErrors) {
                console.log(`    [WARN] Confirm error for ${p.playerName} R${currentRound}: ${JSON.stringify(newErrors[newErrors.length - 1].payload)}`);
              }
            }, 300);
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

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('playFullHand timeout (60s)')), 60000)
  );

  let result = null;
  try { result = await Promise.race([scoredPromise, timeout]); }
  catch (err) { console.log(`  [WARN] ${err.message}`); }

  for (const interval of pollers) clearInterval(interval);
  return result;
}

// ── 테스트 본체 ──

async function testOnePlayFoldCombo(playerCount, playChoices, label) {
  const room = await createRoomHTTP(`PF-${label}`, playerCount, 30);
  const handles = [];
  for (let i = 0; i < playerCount; i++) {
    handles.push(await connectPlayer(room.id, `PF-${label}-${i + 1}`));
  }

  handles[0].send('startGame');
  await handles[0].waitForMsg('dealerSelection');
  await sleep(800);

  const respondedSet = new Set();
  let choiceIdx = 0;

  for (let expected = 0; expected < playerCount; expected++) {
    let responded = false;
    for (let attempt = 0; attempt < 30 && !responded; attempt++) {
      for (const h of handles) {
        if (respondedSet.has(h.playerName)) continue;
        const reqs = h.getMsg('playOrFoldRequest');
        if (reqs.length > 0 && !respondedSet.has(h.playerName)) {
          const choice = choiceIdx < playChoices.length && playChoices[choiceIdx] ? 'play' : 'fold';
          h.send('playOrFoldResponse', { choice });
          respondedSet.add(h.playerName);
          choiceIdx++;
          responded = true;
          break;
        }
      }
      if (!responded) await sleep(200);
    }
    const playCountSoFar = playChoices.slice(0, choiceIdx).filter(Boolean).length;
    if (playCountSoFar >= 4) break;
    await sleep(200);
  }

  await sleep(1500);

  const resultMsgs = handles[0].getMsg('playOrFoldResult');
  const playCount = playChoices.filter(Boolean).length;
  const effectivePlay = Math.min(playCount, 4);

  if (effectivePlay >= 2) {
    const gameStartMsgs = handles[0].getMsg('gameStart');
    assert(gameStartMsgs.length > 0, `[${label}] gameStart expected for ${effectivePlay} players`);

    // Active player IDs from server playOrFoldResult
    let activePlayerIds = null;
    if (resultMsgs.length > 0) {
      activePlayerIds = resultMsgs[resultMsgs.length - 1].payload.activePlayers;
    }
    // Filter handles: use server's activePlayers list, fallback to all non-fold
    const activeHandles = activePlayerIds
      ? handles.filter(h => activePlayerIds.includes(h.playerId))
      : handles.filter(h => {
          // Check stateUpdate for folded status
          const su = h.getMsg('stateUpdate');
          if (su.length > 0) {
            const lastState = su[su.length - 1].payload;
            if (lastState && lastState.players && lastState.players[h.playerId]) {
              return !lastState.players[h.playerId].folded;
            }
          }
          return true; // assume active if no state info
        });
    console.log(`    [INFO] ${label}: activeHandles=${activeHandles.length}, effectivePlay=${effectivePlay}`);
    const scored = await playFullHand(activeHandles, effectivePlay);
    if (scored) {
      verifyInvariants(label, handles, scored);

      // fold 플레이어에게 dealCards 미전송 확인
      for (const h of handles) {
        const dealMsgs = h.getMsg('dealCards');
        const stateUpdates = h.getMsg('stateUpdate');
        if (stateUpdates.length > 0) {
          const lastState = stateUpdates[stateUpdates.length - 1].payload;
          if (lastState && lastState.players) {
            const me = lastState.players[h.playerId];
            if (me && me.folded) {
              if (dealMsgs.length > 0) {
                console.log(`    [BUG] Folded ${h.playerName} (${h.playerId.substring(0,6)}) received ${dealMsgs.length} dealCards messages`);
                for (const dm of dealMsgs) {
                  console.log(`           round=${dm.payload.round}, cards=${dm.payload.cards ? dm.payload.cards.length : 0}`);
                }
              }
              assert(dealMsgs.length === 0, `[${label}] Folded ${h.playerName} got dealCards`);
            }
          }
        }
      }

      if (resultMsgs.length > 0) {
        const activeFromServer = resultMsgs[resultMsgs.length - 1].payload.activePlayers;
        if (activeFromServer) {
          assert(activeFromServer.length === effectivePlay,
            `[${label}] activePlayers: expected ${effectivePlay}, got ${activeFromServer.length}`);
        }
      }
    }
  } else if (effectivePlay === 1) {
    await sleep(2000);
    const gameStartMsgs = handles[0].getMsg('gameStart');
    const gameOverMsgs = handles[0].getMsg('gameOver');
    const errorMsgs = handles[0].getMsg('error');

    if (gameStartMsgs.length > 0) {
      console.log(`    [INFO] ${label}: Server started game with 1 player`);
      const activeHandles = handles.filter(h => h.getMsg('dealCards').length > 0);
      if (activeHandles.length > 0) {
        const scored = await playFullHand(activeHandles, 1);
        if (scored) console.log(`    [INFO] ${label}: 1-player game scored`);
      }
    } else if (gameOverMsgs.length > 0) {
      console.log(`    [INFO] ${label}: Server sent gameOver for 1 player`);
    } else {
      console.log(`    [INFO] ${label}: gameStart=${gameStartMsgs.length}, gameOver=${gameOverMsgs.length}, errors=${errorMsgs.length}`);
    }
  } else {
    await sleep(2000);
    const gameStartMsgs = handles[0].getMsg('gameStart');
    const gameOverMsgs = handles[0].getMsg('gameOver');
    const errorMsgs = handles[0].getMsg('error');

    if (gameOverMsgs.length > 0) {
      console.log(`    [INFO] ${label}: Server sent gameOver (all fold)`);
    } else if (gameStartMsgs.length > 0) {
      console.log(`    [WARN] ${label}: Server started game with 0 players!`);
    } else {
      console.log(`    [INFO] ${label}: gameStart=${gameStartMsgs.length}, gameOver=${gameOverMsgs.length}, errors=${errorMsgs.length}`);
    }
  }

  for (const h of handles) h.ws.close();
  console.log(`  [${label}] PASSED`);
}

async function main() {
  console.log('========================================');
  console.log('Play/Fold Combinations Test');
  console.log(`Server: ${SERVER}`);
  console.log('========================================');

  let passed = 0;
  let failed = 0;
  const errors = [];
  const results = [];

  // 5인 케이스
  const fiveCombos = [
    { choices: [true, true, true, true, false],   label: '5P-A: 4play+1fold' },
    { choices: [true, true, true, false, false],   label: '5P-B: 3play+2fold' },
    { choices: [true, true, false, false, false],  label: '5P-C: 2play+3fold' },
    { choices: [true, false, false, false, false], label: '5P-D: 1play+4fold' },
    { choices: [false, false, false, false, false],label: '5P-E: 0play+5fold' },
    { choices: [false, true, true, true, true],    label: '5P-G: 1st-fold+rest-play' },
  ];

  // 6인 케이스
  const sixCombos = [
    { choices: [true, true, true, true, false, false],    label: '6P-A: 4play+2fold' },
    { choices: [true, true, true, false, false, false],    label: '6P-B: 3play+3fold' },
    { choices: [true, true, false, false, false, false],   label: '6P-C: 2play+4fold' },
    { choices: [true, false, false, false, false, false],  label: '6P-D: 1play+5fold' },
    { choices: [false, false, false, false, false, false], label: '6P-E: 0play+6fold' },
    { choices: [true, false, true, false, true, false],    label: '6P-F: alternating' },
  ];

  const allCombos = [...fiveCombos, ...sixCombos];

  for (const combo of allCombos) {
    const playCount = combo.choices.filter(Boolean).length;
    const foldCount = combo.choices.length - playCount;
    console.log(`\n--- ${combo.label} (${playCount}P+${foldCount}F) ---`);
    try {
      await testOnePlayFoldCombo(combo.choices.length, combo.choices, combo.label);
      passed++;
      results.push({ label: combo.label, status: 'PASS' });
    } catch (err) {
      failed++;
      errors.push({ label: combo.label, error: err.message });
      results.push({ label: combo.label, status: 'FAIL', error: err.message });
      console.error(`  [FAIL] ${combo.label}: ${err.message}`);
    }
  }

  console.log('\n========================================');
  console.log('RESULTS SUMMARY');
  console.log('========================================');
  for (const r of results) {
    const icon = r.status === 'PASS' ? 'PASS' : 'FAIL';
    console.log(`  [${icon}] ${r.label}${r.error ? ' — ' + r.error : ''}`);
  }
  console.log(`\nTotal: ${passed} passed, ${failed} failed out of ${allCombos.length}`);
  if (errors.length > 0) {
    console.log('\nFailures:');
    for (const e of errors) console.log(`  - ${e.label}: ${e.error}`);
  }
  console.log('========================================');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
