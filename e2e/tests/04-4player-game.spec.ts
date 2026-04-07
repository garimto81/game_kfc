/**
 * 04-4player-game.spec.ts — 4인 게임 자동 QA
 *
 * QA-04: 4인 R5 2장딜 + 6쌍 스코어 (PRD L2,L4)
 * 스크린샷 → e2e/reports/screenshots/04-4player-game/
 */
import { test, expect } from '../fixtures/multi-player';
import {
  connectToServer, joinRoomById,
  sendGameWsMessage, waitForGameWsMessage, isGameWsConnected
} from '../helpers/game-actions';
import { WSGameClient, sleep } from '../helpers/ws-game-client';
import { decidePlacement } from '../helpers/ws-bot-strategy';
import { assertFullScoreValidity } from '../helpers/score-validator';

test.describe('04 — 4-Player Game', () => {
  test('4인 게임 — 정상 스코어링 + 6쌍 검증', async ({
    createHybridPlayers,
    screenshotManager,
  }) => {
    const players = await createHybridPlayers(4, ['P1', 'P2', 'P3', 'P4']);
    const [p1, ...bots] = players;
    const botClients = bots.map((p) => p.ws);

    await WSGameClient.deleteAllRooms();
    const room = await WSGameClient.createRoom('E2E-4P', 4, 60);

    for (const bot of bots) { await bot.ws.join(room.id); await sleep(300); }
    await connectToServer(p1.page);
    await joinRoomById(p1.page, room.id, 'P1');

    let wsReady = false;
    for (let i = 0; i < 20; i++) { wsReady = await isGameWsConnected(p1.page); if (wsReady) break; await sleep(500); }
    expect(wsReady).toBeTruthy();
    await screenshotManager.capture(p1.page, 'joined', 'P1', '방 참가');

    bots[0].ws.send('startGame');
    for (const bot of bots) await bot.ws.waitFor('dealerSelection');
    for (const bot of bots) await bot.ws.waitFor('gameStart');
    await sleep(1500);
    await screenshotManager.capture(p1.page, 'game-start', 'P1', '게임 시작');

    const activePlayers = 4;

    const p1Play = (async () => {
      const board = { top: [] as any[], mid: [] as any[], bottom: [] as any[] };
      for (let round = 1; round <= 5; round++) {
        const deal = await waitForGameWsMessage(p1.page, 'dealCards', 30000);
        const b = round === 1 ? { top: [], mid: [], bottom: [] } : board;
        const decision = decidePlacement(deal.payload.cards, b, deal.payload.round, deal.payload.inFantasyland === true, activePlayers);
        for (const p of decision.placements) { await sendGameWsMessage(p1.page, 'placeCard', { card: p.card, line: p.line }); (board as any)[p.line].push(p.card); }
        if (decision.discard) await sendGameWsMessage(p1.page, 'discardCard', { card: decision.discard });
        await sleep(200); await sendGameWsMessage(p1.page, 'confirmPlacement'); await sleep(500);
      }
    })();

    const botsPlay = (async () => {
      const localBoards = new Map(botClients.map(c => [c, { top: [] as any[], mid: [] as any[], bottom: [] as any[] }]));
      for (let round = 1; round <= 5; round++) {
        await Promise.all(botClients.map(async (client) => {
          const deal = await client.waitFor('dealCards', 30000);
          const r = deal.payload.round as number;
          if (r === 5) expect(deal.payload.cards.length).toBe(2);
          const b = r === 1 ? { top: [], mid: [], bottom: [] } : localBoards.get(client)!;
          const decision = decidePlacement(deal.payload.cards, b, r, deal.payload.inFantasyland === true, activePlayers);
          for (const p of decision.placements) { client.send('placeCard', { card: p.card, line: p.line }); localBoards.get(client)![p.line].push(p.card); }
          if (decision.discard) client.send('discardCard', { card: decision.discard });
          await sleep(200); client.send('confirmPlacement'); await sleep(500);
        }));
        await screenshotManager.capture(p1.page, `R${round}`, 'P1', `R${round} 완료`);
      }
    })();

    await Promise.all([p1Play, botsPlay]);

    const scoreMsg = await bots[0].ws.waitFor('handScored', 30000);
    expect(scoreMsg.payload.results).toBeTruthy();
    assertFullScoreValidity(scoreMsg.payload.results, 4);

    for (const [, data] of Object.entries(scoreMsg.payload.results) as [string, any][]) {
      expect(data.name).toBeTruthy();
      expect(data.name.length).toBeLessThan(30);
    }

    try { await p1.page.getByLabel('ready-button').waitFor({ state: 'visible', timeout: 15000 }); } catch { await sleep(3000); }
    await sleep(500);
    await screenshotManager.capture(p1.page, 'score-dialog', 'P1', '4인 점수 결과');
  });
});
