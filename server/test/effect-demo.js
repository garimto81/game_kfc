/**
 * effect-demo.js — 좋은 핸드 이펙트 확인 스크립트
 *
 * 2인 게임을 WS로 진행하며, 딜받은 카드 중 좋은 패 조합을
 * 자동으로 찾아 배치한다. 이펙트 트리거 시점을 콘솔에 출력.
 *
 * dealCards 이벤트 기반 폴링 (ws-protocol.test.js 패턴 사용)
 *
 * 실행:
 *   1) 서버 시작: PORT=3099 node server/index.js
 *   2) 스크립트: node server/test/effect-demo.js
 *
 * 옵션:
 *   --hands N    핸드 수 (기본 5)
 *   --port N     서버 포트 (기본 3099)
 */

const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const { evaluateLine, HAND_TYPE, HAND_TYPE_NAMES } = require('../game/evaluator');
const { calcTopRoyalty, calcMidRoyalty, calcBottomRoyalty } = require('../game/royalty');

// ============================================================
// CLI
// ============================================================

const args = process.argv.slice(2);
const NUM_HANDS = getArg('--hands', 1);
const PORT = getArg('--port', 3099);
const SERVER = `http://localhost:${PORT}`;
const WS_BASE = `ws://localhost:${PORT}`;

function getArg(name, def) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? parseInt(args[idx + 1], 10) : def;
}

// ============================================================
// 이펙트 판정 (클라이언트 로직 미러링)
// ============================================================

function getCelebrationLevel(cards, line) {
  const maxCards = line === 'top' ? 3 : 5;
  if (cards.length < maxCards) return 0;
  const result = evaluateLine(cards, line);
  if (result.handType >= HAND_TYPE.FOUR_OF_A_KIND) return 3;
  if (line === 'top') {
    if (result.handType === HAND_TYPE.THREE_OF_A_KIND) return 2;
    if (result.handType === HAND_TYPE.ONE_PAIR && result.kickers[0] >= 12) return 1;
    return 0;
  }
  if (result.handType >= HAND_TYPE.FULL_HOUSE) return 2;
  if (result.handType >= HAND_TYPE.STRAIGHT) return 1;
  return 0;
}

function isImpactPlacement(card, line, lineCards, maxCards) {
  if (lineCards.length + 1 > maxCards) return false;
  const simulated = [...lineCards, card];
  const isTop = line === 'top';

  if (simulated.length === maxCards) {
    const r = evaluateLine(simulated, line);
    if (r.handType >= HAND_TYPE.THREE_OF_A_KIND) return true;
    if (isTop && r.handType === HAND_TYPE.ONE_PAIR && r.kickers[0] >= 12) return true;
    return false;
  }

  const sameRank = lineCards.filter(c => c.rank === card.rank).length;
  if (sameRank >= 2) return true;
  if (isTop && sameRank >= 1 && card.rank >= 12) return true;

  if (!isTop && simulated.length >= 3) {
    const sameSuit = simulated.filter(c => c.suit === card.suit).length;
    if (sameSuit >= 4) return true;
    const ranks = [...new Set(simulated.map(c => c.rank))].sort((a, b) => a - b);
    let maxC = 1, cur = 1;
    for (let i = 1; i < ranks.length; i++) {
      if (ranks[i] === ranks[i - 1] + 1) { cur++; maxC = Math.max(maxC, cur); } else cur = 1;
    }
    if (maxC >= 3) return true;
  }
  return false;
}

// ============================================================
// 카드 유틸
// ============================================================

const RANK_NAMES = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8',
  9: '9', 10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A'
};
const SUIT_SYMBOLS = { 1: '♣', 2: '♦', 3: '♥', 4: '♠' };

function cardStr(c) { return `${RANK_NAMES[c.rank] || c.rank}${SUIT_SYMBOLS[c.suit] || c.suit}`; }
function cardsStr(cards) { return cards.map(cardStr).join(' '); }
function cardsEqual(a, b) { return a.rank === b.rank && a.suit === b.suit; }

const EFFECT_ICONS = { 0: '   ', 1: '✨ ', 2: '🔥 ', 3: '💥 ' };
const EFFECT_LABELS = {
  0: '',
  1: 'SHIMMER (Level 1)',
  2: 'GLOW+BOUNCE (Level 2)',
  3: 'EXPLOSION (Level 3)',
};

// ============================================================
// 스마트 배치 전략
// ============================================================

function sortDesc(cards) { return [...cards].sort((a, b) => b.rank - a.rank || b.suit - a.suit); }

function remainingSlots(board) {
  return { top: 3 - board.top.length, mid: 5 - board.mid.length, bottom: 5 - board.bottom.length };
}

function smartR1(hand, board) {
  const sorted = sortDesc(hand);
  const placements = [];
  const groups = {};
  for (const c of sorted) { groups[c.rank] = groups[c.rank] || []; groups[c.rank].push(c); }
  const pairs = Object.values(groups).filter(g => g.length >= 2).sort((a, b) => b[0].rank - a[0].rank);
  const trips = Object.values(groups).filter(g => g.length >= 3);

  if (trips.length > 0) {
    const t = trips[0];
    for (const c of t.slice(0, 3)) placements.push({ card: c, line: 'bottom' });
    const rest = sorted.filter(c => !t.slice(0, 3).some(x => cardsEqual(x, c)));
    if (rest[0]) placements.push({ card: rest[0], line: 'mid' });
    if (rest[1]) placements.push({ card: rest[1], line: 'top' });
    return { placements, discard: null };
  }

  if (pairs.length >= 2) {
    placements.push({ card: pairs[0][0], line: 'bottom' });
    placements.push({ card: pairs[0][1], line: 'bottom' });
    placements.push({ card: pairs[1][0], line: 'mid' });
    placements.push({ card: pairs[1][1], line: 'mid' });
    const used = [...pairs[0].slice(0, 2), ...pairs[1].slice(0, 2)];
    const rest = sorted.filter(c => !used.some(x => cardsEqual(x, c)));
    if (rest[0]) placements.push({ card: rest[0], line: 'top' });
    return { placements, discard: null };
  }

  if (pairs.length === 1 && pairs[0][0].rank >= 12) {
    placements.push({ card: pairs[0][0], line: 'top' });
    const rest = sorted.filter(c => !cardsEqual(c, pairs[0][0]));
    placements.push({ card: rest[0], line: 'bottom' });
    placements.push({ card: rest[1], line: 'bottom' });
    placements.push({ card: rest[2], line: 'mid' });
    placements.push({ card: rest[3], line: 'mid' });
    return { placements, discard: null };
  }

  let idx = 0;
  for (let i = 0; i < 2 && idx < sorted.length; i++, idx++) placements.push({ card: sorted[idx], line: 'bottom' });
  for (let i = 0; i < 2 && idx < sorted.length; i++, idx++) placements.push({ card: sorted[idx], line: 'mid' });
  if (idx < sorted.length) placements.push({ card: sorted[idx], line: 'top' });
  return { placements, discard: null };
}

function smartR2to4(hand, board) {
  const slots = remainingSlots(board);
  let bestScore = -1, bestPlacements = null, bestDiscard = null;

  for (let di = 0; di < hand.length; di++) {
    const discard = hand[di];
    const toPlace = hand.filter((_, i) => i !== di);
    const lines = ['top', 'mid', 'bottom'].filter(l => slots[l] > 0);

    for (const l1 of lines) {
      for (const l2 of lines) {
        if (l1 === l2 && slots[l1] < 2) continue;
        let score = 0;
        const tb = { top: [...board.top], mid: [...board.mid], bottom: [...board.bottom] };

        if (isImpactPlacement(toPlace[0], l1, tb[l1], l1 === 'top' ? 3 : 5)) score += 5;
        tb[l1].push(toPlace[0]);
        if (isImpactPlacement(toPlace[1], l2, tb[l2], l2 === 'top' ? 3 : 5)) score += 5;
        tb[l2].push(toPlace[1]);

        for (const ln of ['top', 'mid', 'bottom']) {
          const mx = ln === 'top' ? 3 : 5;
          if (tb[ln].length === mx) score += getCelebrationLevel(tb[ln], ln) * 10;
        }
        for (const ln of ['top', 'mid', 'bottom']) {
          const rc = {};
          for (const c of tb[ln]) { rc[c.rank] = (rc[c.rank] || 0) + 1; }
          for (const cnt of Object.values(rc)) {
            if (cnt >= 3) score += 8;
            else if (cnt >= 2) score += 3;
          }
        }

        if (score > bestScore) {
          bestScore = score;
          bestPlacements = [{ card: toPlace[0], line: l1 }, { card: toPlace[1], line: l2 }];
          bestDiscard = discard;
        }
      }
    }
  }
  return { placements: bestPlacements || [], discard: bestDiscard };
}

function smartR5(hand, board, is4p) {
  if (is4p && hand.length === 2) {
    const slots = remainingSlots(board);
    const lines = ['top', 'mid', 'bottom'].filter(l => slots[l] > 0);
    let bestScore = -1, bestP = null;
    for (const l1 of lines) {
      for (const l2 of lines) {
        if (l1 === l2 && slots[l1] < 2) continue;
        let score = 0;
        const tb = { top: [...board.top], mid: [...board.mid], bottom: [...board.bottom] };
        tb[l1].push(hand[0]); tb[l2].push(hand[1]);
        for (const ln of ['top', 'mid', 'bottom']) {
          const mx = ln === 'top' ? 3 : 5;
          if (tb[ln].length === mx) score += getCelebrationLevel(tb[ln], ln) * 10;
        }
        if (score > bestScore) { bestScore = score; bestP = [{ card: hand[0], line: l1 }, { card: hand[1], line: l2 }]; }
      }
    }
    return { placements: bestP || [], discard: null };
  }
  return smartR2to4(hand, board);
}

function smartDecide(hand, board, round, isFL, ap) {
  if (round === 1) return smartR1(hand, board);
  if (round === 5) return smartR5(hand, board, ap >= 4);
  return smartR2to4(hand, board);
}

// ============================================================
// HTTP / WS
// ============================================================

function httpReq(method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, SERVER);
    const req = http.request({
      method, hostname: url.hostname, port: url.port, path: url.pathname,
      headers: { 'Content-Type': 'application/json' },
    }, (res) => {
      let d = ''; res.on('data', ch => d += ch);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function connectPlayer(roomId, playerName) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_BASE}/ws/game/${roomId}`);
    const messages = [];
    let playerId = null;

    ws.on('open', () => ws.send(JSON.stringify({ type: 'joinRequest', payload: { playerName } })));
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      messages.push(msg);
      if (msg.type === 'joinAccepted') playerId = msg.payload.playerId;
    });
    ws.on('error', reject);

    const iv = setInterval(() => {
      if (playerId) {
        clearInterval(iv);
        resolve({
          ws, messages,
          get playerId() { return playerId; },
          playerName,
          send(type, payload = {}) { ws.send(JSON.stringify({ type, payload })); },
          getMsg(type) { return messages.filter(m => m.type === type); },
          getLastMsg(type) { return [...messages].reverse().find(m => m.type === type); },
        });
      }
    }, 100);
    setTimeout(() => { clearInterval(iv); reject(new Error(`Join timeout: ${playerName}`)); }, 10000);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ============================================================
// 메인: dealCards 이벤트 기반 폴링
// ============================================================

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('  🎰 좋은 핸드 이펙트 데모');
  console.log('  ' + '-'.repeat(56));
  console.log(`  핸드 수: ${NUM_HANDS} | 서버: ${SERVER}`);
  console.log('='.repeat(60) + '\n');

  const room = await httpReq('POST', '/api/rooms', { name: 'effect-demo', max_players: 2, turn_time_limit: 60 });
  console.log(`📌 방 생성: ${room.id}\n`);

  const p1 = await connectPlayer(room.id, 'EffectBot-1');
  const p2 = await connectPlayer(room.id, 'EffectBot-2');
  console.log(`👤 ${p1.playerName} 접속`);
  console.log(`👤 ${p2.playerName} 접속\n`);

  p1.send('startGame');
  await sleep(500);
  console.log('🎮 게임 시작!\n');

  const totals = { earlyWarning: 0, celeb1: 0, celeb2: 0, celeb3: 0 };
  let handsPlayed = 0;

  // 보드 추적
  const boards = {};
  boards[p1.playerId] = { top: [], mid: [], bottom: [] };
  boards[p2.playerId] = { top: [], mid: [], bottom: [] };

  // dealCards 기반 이벤트 루프
  const players = [p1, p2];
  let handScored = null;

  function playHand() {
    return new Promise((resolve) => {
      let resolveScored = resolve;

      const pollers = players.map(p => {
        // 마지막 handScored 또는 gameStart 직후부터 폴링
        let lastProcessed = 0;
        for (let i = p.messages.length - 1; i >= 0; i--) {
          if (p.messages[i].type === 'handScored') { lastProcessed = i + 1; break; }
          if (p.messages[i].type === 'gameStart') { lastProcessed = i + 1; break; }
        }
        if (lastProcessed === 0) lastProcessed = Math.max(0, p.messages.length - 10);

        return setInterval(() => {
          while (lastProcessed < p.messages.length) {
            const msg = p.messages[lastProcessed];
            lastProcessed++;

            if (msg.type === 'stateUpdate' || msg.type === 'gameStart') {
              const myData = msg.payload?.players?.[p.playerId];
              if (myData && myData.board) {
                boards[p.playerId] = myData.board;
              }
            }

            if (msg.type === 'dealCards') {
              const cards = msg.payload.cards;
              const round = msg.payload.round;
              if (!cards || cards.length === 0) continue;

              const board = boards[p.playerId];
              const decision = smartDecide(cards, board, round, false, 2);

              console.log(`  [R${round}] ${p.playerName}: 딜 ${cardsStr(cards)}`);

              // 배치 + 이펙트 감지
              for (const pl of decision.placements) {
                const ln = pl.line;
                const mx = ln === 'top' ? 3 : 5;
                const lineCards = board[ln];
                const simulated = [...lineCards, pl.card];
                let effect = '';

                if (simulated.length === mx) {
                  const level = getCelebrationLevel(simulated, ln);
                  if (level > 0) {
                    const hr = evaluateLine(simulated, ln);
                    effect = `${EFFECT_ICONS[level]}${EFFECT_LABELS[level]} — ${HAND_TYPE_NAMES[hr.handType]}`;
                    if (level === 1) totals.celeb1++;
                    if (level === 2) totals.celeb2++;
                    if (level === 3) totals.celeb3++;
                  }
                } else if (isImpactPlacement(pl.card, ln, lineCards, mx)) {
                  effect = '✨ EARLY WARNING';
                  totals.earlyWarning++;
                }

                p.send('placeCard', { card: pl.card, line: ln });
                board[ln].push(pl.card);

                if (effect) {
                  console.log(`         ${cardStr(pl.card)} → ${ln.padEnd(6)} ${effect}`);
                }
              }

              if (decision.discard) {
                p.send('discardCard', { card: decision.discard });
              }

              setTimeout(() => p.send('confirmPlacement'), 100);
            }

            if (msg.type === 'handScored') {
              resolveScored(msg.payload);
            }
          }
        }, 50);
      });

      // 타임아웃
      setTimeout(() => {
        for (const iv of pollers) clearInterval(iv);
        resolveScored(null);
      }, 30000);

      // resolve 시 폴러 정리
      const origResolve = resolveScored;
      resolveScored = (val) => {
        for (const iv of pollers) clearInterval(iv);
        origResolve(val);
      };
    });
  }

  for (let h = 0; h < NUM_HANDS; h++) {
    handsPlayed++;
    console.log(`${'─'.repeat(60)}`);
    console.log(`  📋 핸드 #${handsPlayed}`);
    console.log(`${'─'.repeat(60)}`);

    // 보드 리셋
    boards[p1.playerId] = { top: [], mid: [], bottom: [] };
    boards[p2.playerId] = { top: [], mid: [], bottom: [] };

    const scored = await playHand();

    // 핸드 결과: stateUpdate에서 최종 보드 가져오기
    await sleep(300);
    console.log();
    for (const p of players) {
      // handScored 또는 최신 stateUpdate에서 보드 가져오기
      const scoredMsg = p.getLastMsg('handScored');
      const stateMsg = p.getLastMsg('stateUpdate');
      const msg = scoredMsg || stateMsg;
      const myData = msg?.payload?.players?.[p.playerId];
      const board = myData?.board || boards[p.playerId];

      console.log(`  📊 ${p.playerName} 최종 보드:`);
      for (const ln of ['top', 'mid', 'bottom']) {
        const cards = board[ln] || [];
        const mx = ln === 'top' ? 3 : 5;
        if (cards.length === mx) {
          const result = evaluateLine(cards, ln);
          const level = getCelebrationLevel(cards, ln);
          const royalty = ln === 'top' ? calcTopRoyalty(cards)
            : ln === 'mid' ? calcMidRoyalty(cards) : calcBottomRoyalty(cards);
          const rStr = royalty > 0 ? ` (royalty: ${royalty})` : '';
          console.log(`    ${EFFECT_ICONS[level]}${ln.padEnd(6)} [${cardsStr(cards).padEnd(14)}] ${HAND_TYPE_NAMES[result.handType]}${rStr}`);
        } else {
          console.log(`       ${ln.padEnd(6)} [${cardsStr(cards).padEnd(14)}] ${cards.length}/${mx}장`);
        }
      }
      console.log();
    }

    // ready for next hand — handScored 수신 대기 후 ready 전송
    if (h < NUM_HANDS - 1) {
      await sleep(500);
      // 두 플레이어 모두 ready 전송
      for (const p of players) p.send('ready');
      // dealCards가 도착할 때까지 충분히 대기
      await sleep(2000);
    }
  }

  // 요약
  const total = totals.earlyWarning + totals.celeb1 + totals.celeb2 + totals.celeb3;
  console.log('='.repeat(60));
  console.log('  📈 이펙트 트리거 요약');
  console.log('  ' + '-'.repeat(56));
  console.log(`  ✨ Early Warning (미완성 패턴):    ${totals.earlyWarning}회`);
  console.log(`  ✨ Celebration Level 1 (shimmer):  ${totals.celeb1}회`);
  console.log(`  🔥 Celebration Level 2 (glow):     ${totals.celeb2}회`);
  console.log(`  💥 Celebration Level 3 (explosion): ${totals.celeb3}회`);
  console.log(`  ──────────────────────────────────────`);
  console.log(`  합계: ${total}회 / ${handsPlayed}핸드 (평균 ${(total / handsPlayed).toFixed(1)}회/핸드)`);
  console.log('='.repeat(60) + '\n');

  p1.ws.close();
  p2.ws.close();
  await httpReq('DELETE', `/api/rooms/${room.id}`);
  console.log('✅ 완료.\n');
}

main().catch(err => {
  console.error('❌ 에러:', err.message);
  process.exit(1);
});
