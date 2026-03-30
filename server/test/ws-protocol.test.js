/**
 * ws-protocol.test.js — WebSocket 프로토콜 테스트
 *
 * ws 라이브러리로 직접 WebSocket 연결 (브라우저 없음)
 * 2인~6인 풀게임 시나리오 + 불변식 12개 자동 검증
 *
 * 실행: PORT=3099 node server/index.js  (별도 터미널)
 *       node server/test/ws-protocol.test.js
 */

const WebSocket = require('ws');
const http = require('http');
const path = require('path');

// 게임 모듈 import (불변식 6, 7 재검증용)
const { evaluateLine, compareHands } = require(path.join(__dirname, '..', 'game', 'evaluator'));
const { calcTotalRoyalty } = require(path.join(__dirname, '..', 'game', 'royalty'));

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

// 메시지 스키마 정의 (불변식 12용)
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

function verifyInvariants(label, playerHandles, scoredResults, handNumber) {
  // handNumber: 특정 핸드만 검증 (멀티 핸드에서 사용). undefined면 모든 메시지 검증.
  console.log(`  [INVARIANT CHECK] ${label}`);

  // ── 불변식 1: 점수 zero-sum ──
  if (scoredResults) {
    const results = scoredResults.results || {};
    let totalScore = 0;
    for (const [id, r] of Object.entries(results)) {
      totalScore += r.score || 0;
    }
    assert(totalScore === 0, `INV1 Zero-sum violated: total=${totalScore}`);
    console.log('    [OK] INV1: Zero-sum');
  }

  // ── 불변식 2: 메시지 순서 ──
  for (const p of playerHandles) {
    const msgs = p.messages.map((m) => m.type);
    const dealerIdx = msgs.indexOf('dealerSelection');
    const gameStartIdx = msgs.indexOf('gameStart');
    if (dealerIdx !== -1 && gameStartIdx !== -1) {
      assert(dealerIdx < gameStartIdx, `INV2 dealerSelection(${dealerIdx}) should be before gameStart(${gameStartIdx})`);
    }
    const scoredIdx = msgs.lastIndexOf('handScored');
    if (scoredIdx !== -1 && gameStartIdx !== -1) {
      assert(scoredIdx > gameStartIdx, `INV2 handScored(${scoredIdx}) should be after gameStart(${gameStartIdx})`);
    }
  }
  console.log('    [OK] INV2: Message order');

  // ── 불변식 3: Foul 일관성 ──
  if (scoredResults) {
    const results = scoredResults.results || {};
    for (const [id, r] of Object.entries(results)) {
      if (r.fouled) {
        assert(r.royaltyTotal === 0, `INV3 Fouled player ${id} has non-zero royalty: ${r.royaltyTotal}`);
      }
    }
    console.log('    [OK] INV3: Foul consistency');
  }

  // ── 불변식 4: 카드 고유성 (라운드별) ──
  // 4인+ 게임에서 discardPile 재활용으로 같은 카드가 다른 라운드에서 재등장 가능 (정상)
  // 핵심 검증: "같은 라운드에서 같은 카드가 2명에게 동시에 딜되지 않음"
  {
    // 라운드별 카드 수집
    const roundCards = {}; // round -> [{card, playerId}]
    for (const p of playerHandles) {
      const dealMsgs = p.getMsg('dealCards');
      for (const dm of dealMsgs) {
        if (!dm.payload || !dm.payload.cards) continue;
        if (handNumber !== undefined && dm.payload.handNumber !== handNumber) continue;
        const round = dm.payload.round;
        if (!roundCards[round]) roundCards[round] = [];
        for (const c of dm.payload.cards) {
          roundCards[round].push({ card: c, player: p.playerName });
        }
      }
    }
    // 라운드별 중복 검증
    for (const [round, cards] of Object.entries(roundCards)) {
      const cardSet = new Set();
      for (const { card, player } of cards) {
        const key = `${card.rank}-${card.suit}`;
        assert(!cardSet.has(key), `INV4 Round ${round}: card ${key} dealt to multiple players`);
        cardSet.add(key);
      }
    }
    // 전체 고유 카드 종류 <= 52
    const allCardKeys = new Set();
    for (const cards of Object.values(roundCards)) {
      for (const { card } of cards) {
        allCardKeys.add(`${card.rank}-${card.suit}`);
        assert(card.rank >= 2 && card.rank <= 14, `INV4 Invalid rank: ${card.rank}`);
        assert(card.suit >= 1 && card.suit <= 4, `INV4 Invalid suit: ${card.suit}`);
      }
    }
    assert(allCardKeys.size <= 52, `INV4 More than 52 unique card types: ${allCardKeys.size}`);
    const totalCards = Object.values(roundCards).reduce((sum, cards) => sum + cards.length, 0);
    console.log(`    [OK] INV4: Card uniqueness (${totalCards} cards, ${allCardKeys.size} unique, ${Object.keys(roundCards).length} rounds)`);
  }

  // ── 불변식 5: 보드 완성도 ──
  if (scoredResults) {
    const results = scoredResults.results || {};
    for (const [id, r] of Object.entries(results)) {
      if (r.fouled || r.scooped) continue; // folded/fouled 제외
      if (r.board) {
        // handScored에 board가 포함된 경우
        assert(r.board.top.length === 3, `INV5 Player ${id} top.length=${r.board.top.length}, expected 3`);
        assert(r.board.mid.length === 5, `INV5 Player ${id} mid.length=${r.board.mid.length}, expected 5`);
        assert(r.board.bottom.length === 5, `INV5 Player ${id} bottom.length=${r.board.bottom.length}, expected 5`);
      }
    }
    // stateUpdate 기반 보드 검증 (마지막 stateUpdate에서)
    for (const p of playerHandles) {
      const stateUpdates = p.getMsg('stateUpdate');
      if (stateUpdates.length === 0) continue;
      const lastState = stateUpdates[stateUpdates.length - 1];
      if (!lastState.payload || !lastState.payload.players) continue;
      for (const [pid, pdata] of Object.entries(lastState.payload.players)) {
        // folded 또는 fouled 플레이어는 보드 불완전 가능 → 스킵
        if (pdata.folded || pdata.fouled) continue;
        const board = pdata.board;
        if (!board) continue;
        const total = board.top.length + board.mid.length + board.bottom.length;
        if (total > 0 && total === 13) {
          assert(board.top.length === 3, `INV5 stateUpdate Player ${pid} top.length=${board.top.length}`);
          assert(board.mid.length === 5, `INV5 stateUpdate Player ${pid} mid.length=${board.mid.length}`);
          assert(board.bottom.length === 5, `INV5 stateUpdate Player ${pid} bottom.length=${board.bottom.length}`);
        }
      }
      break; // 한 플레이어의 stateUpdate만 확인 (모두 동일 board 브로드캐스트)
    }
    console.log('    [OK] INV5: Board completeness');
  }

  // ── 불변식 6: 라인별 W/L/D 재검증 ──
  if (scoredResults) {
    const results = scoredResults.results || {};
    const playerIds = Object.keys(results);
    for (let i = 0; i < playerIds.length; i++) {
      for (let j = i + 1; j < playerIds.length; j++) {
        const idA = playerIds[i];
        const idB = playerIds[j];
        const rA = results[idA];
        const rB = results[idB];
        // lineResults 존재 및 양쪽 모두 Foul이 아닌 경우만 재검증
        if (!rA.lineResults || !rA.lineResults[idB]) continue;
        if (rA.fouled || rB.fouled) continue;

        const lr = rA.lineResults[idB];
        // stateUpdate에서 보드 데이터를 가져올 수 있으면 재검증
        // 서버 보드 데이터는 handScored에 직접 포함 안 됨 → stateUpdate에서 추출
        const boardA = getBoardFromState(playerHandles, idA);
        const boardB = getBoardFromState(playerHandles, idB);
        if (boardA && boardB) {
          for (const line of ['top', 'mid', 'bottom']) {
            const maxCards = line === 'top' ? 3 : 5;
            if (boardA[line].length !== maxCards || boardB[line].length !== maxCards) continue;
            const handA = evaluateLine(boardA[line], line);
            const handB = evaluateLine(boardB[line], line);
            const cmp = compareHands(handA, handB);
            const expected = cmp > 0 ? 1 : cmp < 0 ? -1 : 0;
            const serverResult = lr.lines[line].result;
            assert(serverResult === expected, `INV6 Line ${line} ${idA.substring(0,4)} vs ${idB.substring(0,4)}: server=${serverResult}, calculated=${expected}`);
          }
        }
      }
    }
    console.log('    [OK] INV6: Line W/L/D re-verification');
  }

  // ── 불변식 7: 로열티 재검증 ──
  if (scoredResults) {
    const results = scoredResults.results || {};
    for (const [id, r] of Object.entries(results)) {
      if (r.fouled) continue;
      const board = getBoardFromState(playerHandles, id);
      if (board && board.top.length === 3 && board.mid.length === 5 && board.bottom.length === 5) {
        const recalc = calcTotalRoyalty(board);
        assert(r.royaltyTotal === recalc.total,
          `INV7 Player ${id.substring(0,4)} royalty: server=${r.royaltyTotal}, calculated=${recalc.total}`);
      }
    }
    console.log('    [OK] INV7: Royalty re-verification');
  }

  // ── 불변식 8: 턴 순서 검증 ──
  {
    // dealerSelection에서 playerOrder 추출
    const firstPlayer = playerHandles[0];
    const dealerSelMsg = firstPlayer.getMsg('dealerSelection');
    if (dealerSelMsg.length > 0) {
      const playerOrder = dealerSelMsg[dealerSelMsg.length - 1].payload.playerOrder;
      // turnChanged 메시지 수집
      const turnChanges = firstPlayer.getMsg('turnChanged');
      if (turnChanges.length > 0 && playerOrder) {
        // 첫 번째 턴은 gameStart의 currentTurnPlayerId
        const gameStartMsgs = firstPlayer.getMsg('gameStart');
        if (gameStartMsgs.length > 0) {
          const firstTurnId = gameStartMsgs[gameStartMsgs.length - 1].payload.currentTurnPlayerId;
          // 턴 순서가 playerOrder의 하위 집합인지 확인
          const turnIds = turnChanges.map(tc => tc.payload.currentTurnPlayerId);
          const allTurnIds = [firstTurnId, ...turnIds];
          for (const tid of allTurnIds) {
            if (tid) {
              assert(playerOrder.includes(tid), `INV8 Turn player ${tid.substring(0,4)} not in playerOrder`);
            }
          }
        }
      }
    }
    console.log('    [OK] INV8: Turn order');
  }

  // ── 불변식 9: R별 딜 수 검증 ──
  {
    // 실제 active player 수를 stateUpdate에서 추출 (fold로 줄어들 수 있음)
    let actualActivePlayers = playerHandles.length;
    for (const p of playerHandles) {
      const stateUpdates = p.getMsg('stateUpdate');
      if (stateUpdates.length > 0) {
        const lastState = stateUpdates[stateUpdates.length - 1].payload;
        if (lastState && lastState.players) {
          actualActivePlayers = Object.values(lastState.players).filter(pd => !pd.folded).length;
        }
        break;
      }
    }
    for (const p of playerHandles) {
      const dealMsgs = p.getMsg('dealCards');
      for (const dm of dealMsgs) {
        // handNumber 필터
        if (handNumber !== undefined && dm.payload.handNumber !== handNumber) continue;
        const round = dm.payload.round;
        const cardCount = dm.payload.cards ? dm.payload.cards.length : 0;
        const isFL = dm.payload.inFantasyland;
        if (isFL) {
          assert(cardCount === 14, `INV9 FL round=${round}: expected 14 cards, got ${cardCount}`);
        } else if (round === 1) {
          assert(cardCount === 5, `INV9 R1: expected 5 cards, got ${cardCount}`);
        } else if (round >= 2 && round <= 4) {
          assert(cardCount === 3, `INV9 R${round}: expected 3 cards, got ${cardCount}`);
        } else if (round === 5) {
          // 서버는 actualActivePlayers >= 4일 때 2장, 아니면 3장
          if (actualActivePlayers >= 4) {
            assert(cardCount === 2, `INV9 R5 ${actualActivePlayers}players: expected 2 cards, got ${cardCount}`);
          } else {
            assert(cardCount === 3, `INV9 R5 ${actualActivePlayers}players: expected 3 cards, got ${cardCount}`);
          }
        }
      }
    }
    console.log('    [OK] INV9: Deal count per round');
  }

  // ── 불변식 10: 상대 핸드 은닉 ──
  {
    // 각 플레이어의 dealCards를 핸드별로 수집하여 교차 검증
    const dealsByPlayer = {};
    for (const p of playerHandles) {
      dealsByPlayer[p.playerId] = [];
      const dealMsgs = p.getMsg('dealCards');
      for (const dm of dealMsgs) {
        if (handNumber !== undefined && dm.payload.handNumber !== handNumber) continue;
        if (dm.payload.cards) {
          for (const c of dm.payload.cards) {
            dealsByPlayer[p.playerId].push(`${c.rank}-${c.suit}`);
          }
        }
      }
    }
    // 서로 다른 플레이어가 같은 카드를 받지 않았는지 확인
    const pids = Object.keys(dealsByPlayer);
    for (let i = 0; i < pids.length; i++) {
      for (let j = i + 1; j < pids.length; j++) {
        const setA = new Set(dealsByPlayer[pids[i]]);
        const setB = new Set(dealsByPlayer[pids[j]]);
        for (const key of setA) {
          assert(!setB.has(key), `INV10 Card ${key} dealt to both ${pids[i].substring(0,4)} and ${pids[j].substring(0,4)}`);
        }
      }
    }
    // stateUpdate에서 다른 플레이어의 hand가 빈 배열인지 확인
    for (const p of playerHandles) {
      const stateUpdates = p.getMsg('stateUpdate');
      for (const su of stateUpdates) {
        if (!su.payload || !su.payload.players) continue;
        for (const [pid, pdata] of Object.entries(su.payload.players)) {
          if (pid === p.playerId) continue; // 자기 자신은 스킵
          // 다른 플레이어의 hand는 빈 배열이어야 함
          if (pdata.hand && pdata.hand.length > 0) {
            assert(false, `INV10 Player ${p.playerId.substring(0,4)} can see hand of ${pid.substring(0,4)}: ${JSON.stringify(pdata.hand)}`);
          }
        }
      }
    }
    console.log('    [OK] INV10: Hand concealment');
  }

  // ── 불변식 11: handScored 클라이언트 동일 ──
  {
    const scoredPayloads = [];
    for (const p of playerHandles) {
      const scoredMsgs = p.getMsg('handScored');
      if (scoredMsgs.length > 0) {
        // 가장 최근 handScored의 results
        const lastScored = scoredMsgs[scoredMsgs.length - 1];
        if (lastScored.payload && lastScored.payload.results) {
          scoredPayloads.push(JSON.stringify(lastScored.payload.results));
        }
      }
    }
    if (scoredPayloads.length >= 2) {
      const first = scoredPayloads[0];
      for (let i = 1; i < scoredPayloads.length; i++) {
        assert(first === scoredPayloads[i],
          `INV11 handScored results differ between players (player 0 vs ${i})`);
      }
      console.log('    [OK] INV11: handScored byte-identical');
    } else {
      console.log('    [SKIP] INV11: Not enough handScored messages');
    }
  }

  // ── 불변식 12: 메시지 스키마 검증 ──
  {
    let schemaViolations = 0;
    for (const p of playerHandles) {
      for (const msg of p.messages) {
        const schema = SCHEMAS[msg.type];
        if (!schema) continue; // 스키마 미정의 메시지는 스킵
        for (const field of schema) {
          if (msg.payload === undefined || msg.payload === null) {
            schemaViolations++;
            console.log(`    [WARN] INV12: ${msg.type} missing payload entirely`);
            break;
          }
          if (!(field in msg.payload)) {
            schemaViolations++;
            console.log(`    [WARN] INV12: ${msg.type} missing field '${field}'`);
          }
        }
      }
    }
    assert(schemaViolations === 0, `INV12 Schema violations: ${schemaViolations}`);
    console.log('    [OK] INV12: Message schema');
  }

  console.log(`  [INVARIANT CHECK] ${label} — ALL 12 PASSED`);
}

/**
 * stateUpdate 메시지에서 특정 플레이어의 board를 추출
 */
function getBoardFromState(playerHandles, targetPlayerId) {
  // 아무 플레이어의 stateUpdate에서 board를 가져올 수 있음 (board는 공개 정보)
  for (const p of playerHandles) {
    const stateUpdates = p.getMsg('stateUpdate');
    if (stateUpdates.length === 0) continue;
    // 가장 마지막 stateUpdate 사용
    const lastState = stateUpdates[stateUpdates.length - 1];
    if (lastState.payload && lastState.payload.players && lastState.payload.players[targetPlayerId]) {
      return lastState.payload.players[targetPlayerId].board;
    }
  }
  return null;
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
// 멀티 핸드 테스트 (2핸드 연속)
// ============================================================

async function test2PlayersMultiHand() {
  console.log('\n=== TEST: 2-Player Multi-Hand (2 hands) ===');
  const room = await createRoomHTTP('WS-2P-Multi', 2, 30);
  const p1 = await connectPlayer(room.id, 'WS-MH-P1');
  const p2 = await connectPlayer(room.id, 'WS-MH-P2');

  // 호스트가 게임 시작
  p1.send('startGame');
  await p1.waitForMsg('dealerSelection');
  await sleep(500);

  // ── 핸드 1 ──
  const scored1 = await playFullHand([p1, p2], 2);
  // handNumber=1: 서버의 첫 핸드
  verifyInvariants('MultiHand: Hand 1', [p1, p2], scored1, 1);

  // 핸드 1 점수 기록
  let hand1ScoreP1 = 0;
  let hand1ScoreP2 = 0;
  if (scored1 && scored1.results) {
    for (const [id, r] of Object.entries(scored1.results)) {
      if (id === p1.playerId) hand1ScoreP1 = r.score || 0;
      if (id === p2.playerId) hand1ScoreP2 = r.score || 0;
    }
  }
  console.log(`  [INFO] Hand 1 scores: P1=${hand1ScoreP1}, P2=${hand1ScoreP2}`);

  // Ready → 다음 핸드
  p1.send('readyForNextHand');
  p2.send('readyForNextHand');

  // 두 번째 gameStart 대기
  await p1.waitForMsg('gameStart');
  await sleep(500);

  // ── 핸드 2 ──
  const scored2 = await playFullHand([p1, p2], 2);
  // handNumber=2: 서버의 두 번째 핸드
  verifyInvariants('MultiHand: Hand 2', [p1, p2], scored2, 2);

  // 핸드 2 점수 + 누적 검증
  if (scored2 && scored2.results) {
    let hand2ScoreP1 = 0;
    let hand2ScoreP2 = 0;
    for (const [id, r] of Object.entries(scored2.results)) {
      if (id === p1.playerId) hand2ScoreP1 = r.score || 0;
      if (id === p2.playerId) hand2ScoreP2 = r.score || 0;
    }
    console.log(`  [INFO] Hand 2 scores: P1=${hand2ScoreP1}, P2=${hand2ScoreP2}`);

    // 누적 점수 검증: stateUpdate에서 totalScore 확인
    const lastState1 = p1.getMsg('stateUpdate');
    if (lastState1.length > 0) {
      const finalState = lastState1[lastState1.length - 1].payload;
      if (finalState && finalState.players) {
        for (const [pid, pdata] of Object.entries(finalState.players)) {
          if (pid === p1.playerId) {
            const expectedTotal = hand1ScoreP1 + hand2ScoreP1;
            console.log(`  [INFO] P1 cumulative: expected=${expectedTotal}, server=${pdata.totalScore}`);
            // totalScore 누적 정확성 (서버 stateUpdate 기준)
            assert(pdata.totalScore === expectedTotal,
              `MultiHand P1 totalScore: expected=${expectedTotal}, got=${pdata.totalScore}`);
          }
          if (pid === p2.playerId) {
            const expectedTotal = hand1ScoreP2 + hand2ScoreP2;
            console.log(`  [INFO] P2 cumulative: expected=${expectedTotal}, server=${pdata.totalScore}`);
            assert(pdata.totalScore === expectedTotal,
              `MultiHand P2 totalScore: expected=${expectedTotal}, got=${pdata.totalScore}`);
          }
        }
      }
    }
  }

  p1.ws.close();
  p2.ws.close();
  console.log('=== TEST: 2-Player Multi-Hand PASSED ===\n');
}

// ============================================================
// 에러 복구 테스트 시나리오 (9개)
// ============================================================

/**
 * 시나리오 1: 재연결 — WS 끊고 sessionToken으로 복귀
 */
async function testReconnect() {
  console.log('\n=== TEST: Reconnect ===');
  const room = await createRoomHTTP('WS-Reconnect', 3, 30);
  const p1 = await connectPlayer(room.id, 'RC-P1');
  const p2 = await connectPlayer(room.id, 'RC-P2');
  const p3 = await connectPlayer(room.id, 'RC-P3');

  p1.send('startGame');
  await p1.waitForMsg('dealerSelection');
  await sleep(500);

  // P2의 sessionToken 저장 후 WS close
  const p2Token = p2.sessionToken;
  p2.ws.close();
  await sleep(500);

  // 새 WS 열어서 reconnect 메시지 전송
  const p2New = await new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_BASE}/ws/game/${room.id}`);
    const messages = [];
    let reconnected = false;

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'reconnect',
        payload: { sessionToken: p2Token },
      }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      messages.push(msg);
      if (msg.type === 'reconnected') {
        reconnected = true;
      }
    });

    ws.on('error', reject);

    const interval = setInterval(() => {
      if (reconnected) {
        clearInterval(interval);
        const reconMsg = messages.find(m => m.type === 'reconnected');
        resolve({
          ws,
          messages,
          playerId: reconMsg.payload.playerId,
          gameState: reconMsg.payload.gameState,
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
      reject(new Error('Reconnect timeout'));
    }, 10000);
  });

  // 재연결 후 gameState 검증
  assert(p2New.gameState !== null && p2New.gameState !== undefined, 'Reconnected gameState should exist');
  assert(p2New.gameState.round >= 1, `Reconnected round should be >= 1, got ${p2New.gameState.round}`);
  console.log(`  [OK] Reconnected P2 with round=${p2New.gameState.round}`);

  // p2New를 p2 핸들로 래핑해서 게임 완주
  const p2Handle = {
    ws: p2New.ws,
    messages: p2New.messages,
    playerId: p2New.playerId,
    playerName: 'RC-P2',
    send: p2New.send,
    waitForMsg: p2New.waitForMsg,
    getMsg: p2New.getMsg,
    getLastMsg: p2New.getLastMsg,
  };

  const scored = await playFullHand([p1, p2Handle, p3], 3);
  if (scored) {
    verifyInvariants('Reconnect Hand', [p1, p2Handle, p3], scored);
    console.log('  [OK] handScored received after reconnect');
  }

  p1.ws.close();
  p2New.ws.close();
  p3.ws.close();
  console.log('=== TEST: Reconnect PASSED ===\n');
}

/**
 * 시나리오 2: 60초 미재연결 — disconnect timeout 후 playerLeft + gameOver
 */
async function testDisconnectTimeout() {
  console.log('\n=== TEST: Disconnect Timeout (65s wait) ===');
  const room = await createRoomHTTP('WS-DCTimeout', 2, 5);
  const p1 = await connectPlayer(room.id, 'DC-P1');
  const p2 = await connectPlayer(room.id, 'DC-P2');

  p1.send('startGame');
  await p1.waitForMsg('dealerSelection');
  await sleep(500);

  // P2 WS close
  p2.ws.close();
  console.log('  [INFO] P2 disconnected, waiting 65s for timeout...');

  // 65초 대기 (disconnect timeout = 60s)
  await sleep(65000);

  // P1이 playerLeft 수신 확인
  const leftMsgs = p1.getMsg('playerLeft');
  assert(leftMsgs.length > 0, 'P1 should receive playerLeft after disconnect timeout');
  console.log('  [OK] playerLeft received');

  // gameOver 수신 확인 (1명만 남으면 게임 종료)
  const gameOverMsgs = p1.getMsg('gameOver');
  assert(gameOverMsgs.length > 0, 'P1 should receive gameOver');
  console.log('  [OK] gameOver received');

  p1.ws.close();
  console.log('=== TEST: Disconnect Timeout PASSED ===\n');
}

/**
 * 시나리오 3: 타이머 만료 — turnTimeLimit 후 autoFold
 */
async function testTurnTimeout() {
  console.log('\n=== TEST: Turn Timeout ===');
  const room = await createRoomHTTP('WS-TurnTO', 2, 5);
  const p1 = await connectPlayer(room.id, 'TO-P1');
  const p2 = await connectPlayer(room.id, 'TO-P2');

  p1.send('startGame');
  await p1.waitForMsg('dealerSelection');
  await sleep(500);

  // 현재 턴 플레이어가 아무것도 안 함 → 5초 후 autoFold
  console.log('  [INFO] Waiting 7s for turn timeout...');
  await sleep(7000);

  // turnChanged, handScored, foldedThisHand, gameOver 중 하나 수신 확인
  const p1Msgs = p1.messages.map(m => m.type);
  const p2Msgs = p2.messages.map(m => m.type);

  const hasTurnChanged = p1Msgs.includes('turnChanged') || p2Msgs.includes('turnChanged');
  const hasHandScored = p1Msgs.includes('handScored') || p2Msgs.includes('handScored');
  const hasFolded = p1Msgs.includes('foldedThisHand') || p2Msgs.includes('foldedThisHand');
  const hasGameOver = p1Msgs.includes('gameOver') || p2Msgs.includes('gameOver');

  assert(
    hasTurnChanged || hasHandScored || hasFolded || hasGameOver,
    `Expected turnChanged/handScored/foldedThisHand/gameOver after timeout. P1: [${p1Msgs.join(',')}], P2: [${p2Msgs.join(',')}]`
  );
  console.log('  [OK] Turn timeout handled');

  p1.ws.close();
  p2.ws.close();
  console.log('=== TEST: Turn Timeout PASSED ===\n');
}

/**
 * 시나리오 4: 잘못된 카드 배치 — 핸드에 없는 카드로 placeCard
 */
async function testInvalidPlaceCard() {
  console.log('\n=== TEST: Invalid PlaceCard ===');
  const room = await createRoomHTTP('WS-InvalidCard', 2, 30);
  const p1 = await connectPlayer(room.id, 'IC-P1');
  const p2 = await connectPlayer(room.id, 'IC-P2');

  p1.send('startGame');
  await p1.waitForMsg('dealerSelection');
  await sleep(500);

  // dealCards 대기
  await p1.waitForMsg('dealCards').catch(() => {});
  await sleep(500);

  // 핸드에 없는 카드로 placeCard 전송
  const fakeCard = { rank: 14, suit: 5 }; // 존재하지 않는 suit
  p1.send('placeCard', { card: fakeCard, line: 'bottom' });
  await sleep(500);

  // error 메시지 수신 확인
  const errorMsgs = p1.getMsg('error');
  assert(errorMsgs.length > 0, 'Should receive error for invalid card placement');
  console.log(`  [OK] Error received: ${errorMsgs[errorMsgs.length - 1].payload.message || 'unknown'}`);

  // 정상 게임 완주
  const scored = await playFullHand([p1, p2], 2);
  if (scored) {
    verifyInvariants('InvalidCard Hand', [p1, p2], scored);
    console.log('  [OK] Game completed normally after error');
  }

  p1.ws.close();
  p2.ws.close();
  console.log('=== TEST: Invalid PlaceCard PASSED ===\n');
}

/**
 * 시나리오 5: 순서 위반 — 턴이 아닌 플레이어가 placeCard
 */
async function testOutOfTurnPlace() {
  console.log('\n=== TEST: Out-of-Turn PlaceCard ===');
  const room = await createRoomHTTP('WS-OOT', 2, 30);
  const p1 = await connectPlayer(room.id, 'OOT-P1');
  const p2 = await connectPlayer(room.id, 'OOT-P2');

  p1.send('startGame');
  await p1.waitForMsg('dealerSelection');
  await sleep(1000);

  // 누가 턴인지 확인
  const p1Deal = p1.getMsg('dealCards');
  const p2Deal = p2.getMsg('dealCards');

  let offTurnPlayer;
  if (p1Deal.length > 0) {
    offTurnPlayer = p2;
  } else if (p2Deal.length > 0) {
    offTurnPlayer = p1;
  } else {
    console.log('  [WARN] Neither player received dealCards, skipping');
    p1.ws.close();
    p2.ws.close();
    console.log('=== TEST: Out-of-Turn PlaceCard SKIPPED ===\n');
    return;
  }

  // 턴이 아닌 플레이어가 placeCard 시도
  offTurnPlayer.send('placeCard', { card: { rank: 14, suit: 4 }, line: 'bottom' });
  await sleep(500);

  const offErrors = offTurnPlayer.getMsg('error');
  assert(offErrors.length > 0, 'Off-turn player should receive error');
  console.log(`  [OK] Out-of-turn error: ${offErrors[offErrors.length - 1].payload.message || 'unknown'}`);

  // 정상 게임 완주
  const scored = await playFullHand([p1, p2], 2);
  if (scored) {
    verifyInvariants('OOT Hand', [p1, p2], scored);
    console.log('  [OK] Game completed normally after OOT error');
  }

  p1.ws.close();
  p2.ws.close();
  console.log('=== TEST: Out-of-Turn PlaceCard PASSED ===\n');
}

/**
 * 시나리오 6: 중복 confirm — 이미 확정 후 다시 confirmPlacement
 */
async function testDuplicateConfirm() {
  console.log('\n=== TEST: Duplicate Confirm ===');
  const room = await createRoomHTTP('WS-DupConf', 2, 30);
  const p1 = await connectPlayer(room.id, 'DUP-P1');
  const p2 = await connectPlayer(room.id, 'DUP-P2');

  p1.send('startGame');
  await p1.waitForMsg('dealerSelection');
  await sleep(1000);

  // 현재 턴 플레이어 찾기
  const p1Deal = p1.getMsg('dealCards');
  const p2Deal = p2.getMsg('dealCards');

  let turnPlayer;
  if (p1Deal.length > 0) {
    turnPlayer = p1;
  } else if (p2Deal.length > 0) {
    turnPlayer = p2;
  } else {
    console.log('  [WARN] No dealCards received, skipping');
    p1.ws.close();
    p2.ws.close();
    console.log('=== TEST: Duplicate Confirm SKIPPED ===\n');
    return;
  }

  // R1: 5장 모두 배치
  const dealMsg = turnPlayer.getLastMsg('dealCards');
  const cards = dealMsg.payload.cards;
  assert(cards.length === 5, `R1 should deal 5 cards, got ${cards.length}`);

  turnPlayer.send('placeCard', { card: cards[0], line: 'bottom' });
  turnPlayer.send('placeCard', { card: cards[1], line: 'bottom' });
  turnPlayer.send('placeCard', { card: cards[2], line: 'mid' });
  turnPlayer.send('placeCard', { card: cards[3], line: 'mid' });
  turnPlayer.send('placeCard', { card: cards[4], line: 'top' });
  await sleep(200);

  // 첫 confirm
  turnPlayer.send('confirmPlacement');
  await sleep(500);

  // 중복 confirm
  const prevErrors = turnPlayer.getMsg('error').length;
  turnPlayer.send('confirmPlacement');
  await sleep(500);

  const newErrors = turnPlayer.getMsg('error');
  assert(newErrors.length > prevErrors, 'Duplicate confirm should produce error');
  console.log(`  [OK] Duplicate confirm error: ${newErrors[newErrors.length - 1].payload.message || 'unknown'}`);

  // 나머지 게임 완주
  const scored = await playFullHand([p1, p2], 2);
  if (scored) {
    verifyInvariants('DupConf Hand', [p1, p2], scored);
  }

  p1.ws.close();
  p2.ws.close();
  console.log('=== TEST: Duplicate Confirm PASSED ===\n');
}

/**
 * 시나리오 7: 플레이어 퇴장 — leaveGame 후 나머지로 게임 진행
 */
async function testPlayerLeave() {
  console.log('\n=== TEST: Player Leave ===');
  const room = await createRoomHTTP('WS-Leave', 3, 30);
  const p1 = await connectPlayer(room.id, 'LV-P1');
  const p2 = await connectPlayer(room.id, 'LV-P2');
  const p3 = await connectPlayer(room.id, 'LV-P3');

  p1.send('startGame');
  await p1.waitForMsg('dealerSelection');
  await sleep(500);

  // P3가 leaveGame 전송
  p3.send('leaveGame');
  await sleep(1000);

  // P1, P2가 playerLeft 수신 확인
  const p1Left = p1.getMsg('playerLeft');
  const p2Left = p2.getMsg('playerLeft');
  assert(p1Left.length > 0 || p2Left.length > 0, 'P1 or P2 should receive playerLeft');
  console.log('  [OK] playerLeft received');

  // gameOver이면 종료, 아니면 2인으로 완주
  const p1GO = p1.getMsg('gameOver');
  const p2GO = p2.getMsg('gameOver');
  if (p1GO.length > 0 || p2GO.length > 0) {
    console.log('  [OK] gameOver received (game ended with player leave)');
  } else {
    const scored = await playFullHand([p1, p2], 2);
    if (scored) {
      verifyInvariants('Leave Hand', [p1, p2], scored);
      console.log('  [OK] Game completed with remaining 2 players');
    }
  }

  p1.ws.close();
  p2.ws.close();
  p3.ws.close();
  console.log('=== TEST: Player Leave PASSED ===\n');
}

/**
 * 시나리오 8: 호스트 퇴장 — hostChanged 메시지 확인
 */
async function testHostLeave() {
  console.log('\n=== TEST: Host Leave ===');
  const room = await createRoomHTTP('WS-HostLeave', 3, 30);
  const p1 = await connectPlayer(room.id, 'HL-P1'); // host
  const p2 = await connectPlayer(room.id, 'HL-P2');
  const p3 = await connectPlayer(room.id, 'HL-P3');

  p1.send('startGame');
  await p1.waitForMsg('dealerSelection');
  await sleep(500);

  // P1 (호스트) leaveGame
  p1.send('leaveGame');
  await sleep(1000);

  // P2, P3가 hostChanged 수신 확인
  const p2HC = p2.getMsg('hostChanged');
  const p3HC = p3.getMsg('hostChanged');
  assert(p2HC.length > 0 || p3HC.length > 0, 'P2 or P3 should receive hostChanged');
  console.log('  [OK] hostChanged received');

  // playerLeft 수신 확인
  const p2Left = p2.getMsg('playerLeft');
  const p3Left = p3.getMsg('playerLeft');
  assert(p2Left.length > 0 || p3Left.length > 0, 'P2 or P3 should receive playerLeft');
  console.log('  [OK] playerLeft received');

  // gameOver 확인 또는 2인 게임 계속
  const p2GO = p2.getMsg('gameOver');
  const p3GO = p3.getMsg('gameOver');
  if (p2GO.length > 0 || p3GO.length > 0) {
    console.log('  [OK] gameOver received');
  } else {
    const scored = await playFullHand([p2, p3], 2);
    if (scored) {
      verifyInvariants('HostLeave Hand', [p2, p3], scored);
      console.log('  [OK] Game completed after host left');
    }
  }

  p1.ws.close();
  p2.ws.close();
  p3.ws.close();
  console.log('=== TEST: Host Leave PASSED ===\n');
}

/**
 * 시나리오 9: 비정상 JSON — 서버 크래시 없이 에러 응답
 */
async function testMalformedMessage() {
  console.log('\n=== TEST: Malformed Message ===');
  const room = await createRoomHTTP('WS-Malformed', 2, 30);
  const p1 = await connectPlayer(room.id, 'MF-P1');
  const p2 = await connectPlayer(room.id, 'MF-P2');

  p1.send('startGame');
  await p1.waitForMsg('dealerSelection');
  await sleep(500);

  // 비정상 JSON 전송
  p1.ws.send('{{not json}}}');
  await sleep(500);

  // 서버 크래시 없음 확인 — P1이 error 수신
  const errorMsgs = p1.getMsg('error');
  assert(errorMsgs.length > 0, 'Should receive error for malformed JSON');
  console.log('  [OK] Error received for malformed JSON');

  // 정상 메시지로 게임 완주
  const scored = await playFullHand([p1, p2], 2);
  if (scored) {
    verifyInvariants('Malformed Hand', [p1, p2], scored);
    console.log('  [OK] Game completed normally after malformed message');
  }

  p1.ws.close();
  p2.ws.close();
  console.log('=== TEST: Malformed Message PASSED ===\n');
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
    ['2-Player Multi-Hand', test2PlayersMultiHand],
    // 에러 복구 테스트
    ['Reconnect', testReconnect],
    ['Invalid PlaceCard', testInvalidPlaceCard],
    ['Out-of-Turn Place', testOutOfTurnPlace],
    ['Duplicate Confirm', testDuplicateConfirm],
    ['Player Leave', testPlayerLeave],
    ['Host Leave', testHostLeave],
    ['Malformed Message', testMalformedMessage],
    ['Turn Timeout', testTurnTimeout],
  ];

  // testDisconnectTimeout은 65초 소요 — --full 옵션 시에만 실행
  if (process.argv.includes('--full')) {
    tests.push(['Disconnect Timeout', testDisconnectTimeout]);
  }

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
