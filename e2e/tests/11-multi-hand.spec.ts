/**
 * 11-multi-hand.spec.ts — 다중 핸드 자동 QA
 *
 * QA-11: 3핸드 누적 + 점수 증가 (PRD L2,L4)
 * 스크린샷 → e2e/reports/screenshots/11-multi-hand/
 */
import { test, expect } from '../fixtures/multi-player';
import {
  connectToServer, joinRoomById,
  sendGameWsMessage, waitForGameWsMessage, isGameWsConnected
} from '../helpers/game-actions';
import { WSGameClient, sleep } from '../helpers/ws-game-client';
import { decidePlacement } from '../helpers/ws-bot-strategy';
import { assertZeroSum } from '../helpers/score-validator';

async function playHandViaFlutterWs(page: any, activePlayers: number): Promise<void> {
  const board = { top: [] as any[], mid: [] as any[], bottom: [] as any[] };
  for (let round = 1; round <= 5; round++) {
    const deal = await waitForGameWsMessage(page, 'dealCards', 30000);
    const b = round === 1 ? { top: [], mid: [], bottom: [] } : board;
    const decision = decidePlacement(deal.payload.cards, b, deal.payload.round, deal.payload.inFantasyland === true, activePlayers);
    for (const p of decision.placements) { await sendGameWsMessage(page, 'placeCard', { card: p.card, line: p.line }); (board as any)[p.line].push(p.card); }
    if (decision.discard) await sendGameWsMessage(page, 'discardCard', { card: decision.discard });
    await sleep(200); await sendGameWsMessage(page, 'confirmPlacement'); await sleep(500);
  }
}

async function playHandViaWsBot(client: WSGameClient, activePlayers: number): Promise<void> {
  const board = { top: [] as any[], mid: [] as any[], bottom: [] as any[] };
  for (let round = 1; round <= 5; round++) {
    let deal; try { deal = await client.waitFor('dealCards', 30000); } catch { break; }
    const r = deal.payload.round as number;
    const b = r === 1 ? { top: [], mid: [], bottom: [] } : board;
    const decision = decidePlacement(deal.payload.cards, b, r, deal.payload.inFantasyland === true, activePlayers);
    for (const p of decision.placements) { client.send('placeCard', { card: p.card, line: p.line }); (board as any)[p.line].push(p.card); }
    if (decision.discard) client.send('discardCard', { card: decision.discard });
    await sleep(200); client.send('confirmPlacement'); await sleep(500);
  }
}

test.describe('11 — Multi-Hand', () => {
  test('3핸드 연속 + 누적 스코어', async ({ createHybridPlayers, screenshotManager }) => {
    const players = await createHybridPlayers(2, ['Player1', 'Player2']);
    const [p1, p2] = players;

    await WSGameClient.deleteAllRooms();
    const room = await WSGameClient.createRoom('E2E-Multi', 2, 60);
    await p2.ws.join(room.id);
    await sleep(300);
    await connectToServer(p1.page);
    await joinRoomById(p1.page, room.id, 'Player1');
    for (let i = 0; i < 20; i++) { if (await isGameWsConnected(p1.page)) break; await sleep(500); }

    await p2.ws.waitFor('playerJoined', 15000);
    await sleep(1000);
    p2.ws.send('startGame');
    await p2.ws.waitFor('dealerSelection');
    await p2.ws.waitFor('gameStart');
    await sleep(1500);

    for (let hand = 1; hand <= 3; hand++) {
      await Promise.all([playHandViaFlutterWs(p1.page, 2), playHandViaWsBot(p2.ws, 2)]);

      const score = await p2.ws.waitFor('handScored', 30000);
      expect(score.payload.handNumber).toBe(hand);
      assertZeroSum(score.payload.results);

      try { await p1.page.getByLabel('ready-button').waitFor({ state: 'visible', timeout: 15000 }); } catch { await sleep(3000); }
      await sleep(500);
      await screenshotManager.capture(p1.page, `hand${hand}-score`, 'Player1', `Hand ${hand} 점수`);

      if (hand < 3) {
        const readyBtn = p1.page.getByLabel('ready-button');
        if (await readyBtn.isVisible().catch(() => false)) await readyBtn.click();
        p2.ws.send('readyForNextHand');
        await p2.ws.waitFor('gameStart', 15000);
        await sleep(1000);
      }
    }
  });
});
