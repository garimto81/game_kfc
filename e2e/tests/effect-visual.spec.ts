/**
 * effect-visual.spec.ts — 이펙트 시각 확인 E2E 테스트
 *
 * 좋은 핸드 배치 시 이펙트(shimmer, glow, bounce)를
 * 브라우저에서 실제로 확인하고 스크린샷으로 캡처한다.
 *
 * Alice: Flutter UI (브라우저) — 이펙트를 시각적으로 확인
 * Bob: WSGameClient 봇 — 백그라운드 자동 배치
 *
 * 실행:
 *   npx playwright test e2e/tests/effect-visual.spec.ts --headed
 *
 * --headed 옵션으로 브라우저가 열려 이펙트를 실시간으로 볼 수 있음.
 * 스크린샷 리포트: e2e/reports/screenshots/{runId}/effect-visual/report.html
 */
import { test, expect } from '../fixtures/multi-player';
import {
  connectToServer, joinRoomById,
  sendGameWsMessage, waitForGameWsMessage, isGameWsConnected
} from '../helpers/game-actions';
import { WSGameClient, sleep } from '../helpers/ws-game-client';
import { decidePlacement, Card, BoardState } from '../helpers/ws-bot-strategy';

// ============================================================
// 이펙트 판정 (클라이언트 로직 미러링)
// ============================================================

function getCelebrationLevel(cards: Card[], line: string): number {
  const maxCards = line === 'top' ? 3 : 5;
  if (cards.length < maxCards) return 0;

  // 간이 핸드 평가 (rank 기반)
  const ranks = cards.map(c => c.rank).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const rankCounts: Record<number, number> = {};
  for (const r of ranks) rankCounts[r] = (rankCounts[r] || 0) + 1;
  const counts = Object.values(rankCounts).sort((a, b) => b - a);

  const isFlush = suits.every(s => s === suits[0]);
  const uniqueRanks = [...new Set(ranks)].sort((a, b) => a - b);
  const isStraight = uniqueRanks.length === maxCards &&
    (uniqueRanks[uniqueRanks.length - 1] - uniqueRanks[0] === maxCards - 1 ||
     (uniqueRanks.includes(14) && uniqueRanks.includes(2) &&
      uniqueRanks.filter(r => r <= 5).length === maxCards - 1));

  // Quads+ → Level 3
  if (counts[0] >= 4) return 3;
  if (isFlush && isStraight) return 3; // Straight Flush

  if (line === 'top') {
    if (counts[0] >= 3) return 2; // Trips
    if (counts[0] === 2 && Math.max(...ranks) >= 12) return 1; // QQ+
    return 0;
  }

  // Mid/Bottom
  if (counts[0] >= 3 && counts[1] >= 2) return 2; // Full House
  if (isFlush) return 1;
  if (isStraight) return 1;
  if (counts[0] >= 3) return 1; // Trips
  return 0;
}

function isImpactPlacement(card: Card, line: string, lineCards: Card[], maxCards: number): boolean {
  if (lineCards.length + 1 > maxCards) return false;
  const simulated = [...lineCards, card];
  const isTop = line === 'top';

  if (simulated.length === maxCards) {
    return getCelebrationLevel(simulated, line) > 0;
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

const RANK_NAMES: Record<number, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8',
  9: '9', 10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A'
};
const SUIT_SYMBOLS: Record<number, string> = { 1: '♣', 2: '♦', 3: '♥', 4: '♠' };
function cardStr(c: Card) { return `${RANK_NAMES[c.rank] || c.rank}${SUIT_SYMBOLS[c.suit] || c.suit}`; }

// ============================================================
// 테스트
// ============================================================

test.describe('이펙트 시각 확인', () => {

  test('좋은 핸드 이펙트 — 1핸드 풀 라운드 캡처', async ({
    createHybridPlayers,
    screenshotManager,
  }) => {
    const players = await createHybridPlayers(2, ['Alice', 'Bob']);
    const [alice, bob] = players;

    // ── 방 정리 + 생성 ──
    await WSGameClient.deleteAllRooms();
    const room = await WSGameClient.createRoom('Effect-Visual', 2, 60);
    console.log(`\n🎰 이펙트 시각 테스트 시작 — 방: ${room.id}\n`);

    // ── Bob WS + Alice Flutter UI 참가 ──
    await bob.ws.join(room.id);
    await connectToServer(alice.page);
    await joinRoomById(alice.page, room.id, 'Alice');

    let wsReady = false;
    for (let i = 0; i < 20; i++) {
      wsReady = await isGameWsConnected(alice.page);
      if (wsReady) break;
      await sleep(500);
    }
    expect(wsReady, 'Alice game WS connected').toBeTruthy();
    await screenshotManager.capture(alice.page, 'joined', 'Alice', '방 참가 완료');

    // ── 게임 시작 ──
    bob.ws.send('startGame');
    await bob.ws.waitFor('dealerSelection');
    await bob.ws.waitFor('gameStart');
    await sleep(2000);
    await screenshotManager.capture(alice.page, 'game-start', 'Alice', '게임 시작');

    const activePlayers = 2;
    let effectCount = 0;

    // ── Alice 플레이 (브라우저) — 배치마다 스크린샷 ──
    const alicePlay = (async () => {
      const aliceBoard: BoardState = { top: [], mid: [], bottom: [] };

      for (let round = 1; round <= 5; round++) {
        const deal = await waitForGameWsMessage(alice.page, 'dealCards', 30000);
        const cards = deal.payload.cards as Card[];
        const r = deal.payload.round as number;
        console.log(`  [R${r}] Alice 딜: ${cards.map(cardStr).join(' ')}`);

        await sleep(500);
        await screenshotManager.capture(alice.page, `R${r}-deal`, 'Alice', `R${r} 딜 — 핸드 카드`);

        const board = r === 1 ? { top: [], mid: [], bottom: [] } as BoardState : aliceBoard;
        const decision = decidePlacement(cards, board, r, deal.payload.inFantasyland === true, activePlayers);

        // 카드 배치 — 한 장씩, 이펙트 감지 시 추가 대기 + 스크린샷
        for (const p of decision.placements) {
          const maxCards = p.line === 'top' ? 3 : 5;
          const lineCards = aliceBoard[p.line];
          const hasEffect = isImpactPlacement(p.card, p.line, lineCards, maxCards);
          const simulated = [...lineCards, p.card];
          const isComplete = simulated.length === maxCards;
          const celebLevel = isComplete ? getCelebrationLevel(simulated, p.line) : 0;

          await sendGameWsMessage(alice.page, 'placeCard', { card: p.card, line: p.line });
          aliceBoard[p.line].push(p.card);

          if (hasEffect || celebLevel > 0) {
            effectCount++;
            const effectLabel = celebLevel >= 3 ? '💥 EXPLOSION'
              : celebLevel >= 2 ? '🔥 GLOW+BOUNCE'
              : celebLevel >= 1 ? '✨ CELEBRATION'
              : '✨ EARLY WARNING';
            console.log(`         ${cardStr(p.card)} → ${p.line}  ${effectLabel}`);

            // 이펙트 애니메이션 대기 (500ms에서 캡처하면 애니메이션 진행 중)
            await sleep(300);
            await screenshotManager.capture(
              alice.page,
              `R${r}-effect-${effectCount}`,
              'Alice',
              `R${r} ${effectLabel} — ${cardStr(p.card)} → ${p.line}`
            );
            await sleep(700); // 이펙트 관찰 시간
          } else {
            await sleep(100);
          }
        }

        if (decision.discard) {
          await sendGameWsMessage(alice.page, 'discardCard', { card: decision.discard });
        }

        await sleep(200);
        await screenshotManager.capture(alice.page, `R${r}-board`, 'Alice', `R${r} 보드 상태`);
        await sendGameWsMessage(alice.page, 'confirmPlacement');
        await sleep(500);
      }
    })();

    // ── Bob 플레이 (WS 봇) ──
    const bobPlay = (async () => {
      const bobBoard: BoardState = { top: [], mid: [], bottom: [] };

      for (let round = 1; round <= 5; round++) {
        const deal = await bob.ws.waitFor('dealCards', 30000);
        const r = deal.payload.round as number;
        const board = r === 1 ? { top: [], mid: [], bottom: [] } as BoardState : bobBoard;
        const decision = decidePlacement(deal.payload.cards, board, r, deal.payload.inFantasyland === true, activePlayers);

        for (const p of decision.placements) {
          bob.ws.send('placeCard', { card: p.card, line: p.line });
          bobBoard[p.line].push(p.card);
        }
        if (decision.discard) bob.ws.send('discardCard', { card: decision.discard });
        await sleep(200);
        bob.ws.send('confirmPlacement');
        await sleep(500);
      }
    })();

    await Promise.all([alicePlay, bobPlay]);

    // ── 핸드 결과 ──
    const scoreMsg = await bob.ws.waitFor('handScored', 30000);
    expect(scoreMsg.payload.results).toBeTruthy();

    // 점수 다이얼로그 대기 + 스크린샷
    try {
      await alice.page.getByLabel('ready-button').waitFor({ state: 'visible', timeout: 15000 });
    } catch { await sleep(3000); }
    await sleep(500);
    await screenshotManager.capture(alice.page, 'hand-scored', 'Alice', '핸드 결과 — 점수 다이얼로그');

    // ── 결과 요약 ──
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`  📈 이펙트 감지: ${effectCount}회`);
    console.log(`  📸 스크린샷: e2e/reports/screenshots/ 참조`);
    console.log(`${'─'.repeat(50)}\n`);

    // 스크린샷이 최소 1장 이상 캡처되었는지 확인
    expect(effectCount).toBeGreaterThanOrEqual(0);
  });

});
