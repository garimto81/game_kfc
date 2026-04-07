/**
 * 02-2player-game.spec.ts — 2인 풀게임 자동 QA
 *
 * QA-02: 2인 풀게임 + 점수 다이얼로그 (PRD L2,L4)
 * 스크린샷 → e2e/reports/screenshots/02-2player-game/
 *
 * Alice: Flutter UI 참가 + Flutter WS 카드 배치
 * Bob: WSGameClient 봇
 */
import { test, expect } from '../fixtures/multi-player';
import {
  connectToServer, joinRoomById,
  sendGameWsMessage, waitForGameWsMessage, isGameWsConnected
} from '../helpers/game-actions';
import { WSGameClient, sleep } from '../helpers/ws-game-client';
import { decidePlacement } from '../helpers/ws-bot-strategy';
import { assertFullScoreValidity } from '../helpers/score-validator';

test.describe('02 — 2-Player Full Game', () => {
  test('2인 풀게임 + 정상 스코어링', async ({
    createHybridPlayers,
    screenshotManager,
  }) => {
    const players = await createHybridPlayers(2, ['Alice', 'Bob']);
    const [alice, bob] = players;

    // ── 방 정리 + 생성 ──
    await WSGameClient.deleteAllRooms();
    const room = await WSGameClient.createRoom('E2E-2P', 2, 60);

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
    await screenshotManager.capture(alice.page, 'joined', 'Alice', '방 참가');

    // ── 게임 시작 ──
    bob.ws.send('startGame');
    await bob.ws.waitFor('dealerSelection');
    await bob.ws.waitFor('gameStart');
    await sleep(1500);
    await screenshotManager.capture(alice.page, 'game-start', 'Alice', '게임 시작');

    // ── R1~R5 병렬 플레이 ──
    const activePlayers = 2;

    const alicePlay = (async () => {
      const aliceBoard = { top: [] as any[], mid: [] as any[], bottom: [] as any[] };
      for (let round = 1; round <= 5; round++) {
        const deal = await waitForGameWsMessage(alice.page, 'dealCards', 30000);
        const board = round === 1 ? { top: [], mid: [], bottom: [] } : aliceBoard;
        const decision = decidePlacement(deal.payload.cards, board, deal.payload.round, deal.payload.inFantasyland === true, activePlayers);
        for (const p of decision.placements) {
          await sendGameWsMessage(alice.page, 'placeCard', { card: p.card, line: p.line });
          (aliceBoard as any)[p.line].push(p.card);
        }
        if (decision.discard) await sendGameWsMessage(alice.page, 'discardCard', { card: decision.discard });
        await sleep(200);
        await sendGameWsMessage(alice.page, 'confirmPlacement');
        await sleep(500);
      }
    })();

    const bobPlay = (async () => {
      const bobBoard = { top: [] as any[], mid: [] as any[], bottom: [] as any[] };
      for (let round = 1; round <= 5; round++) {
        const deal = await bob.ws.waitFor('dealCards', 30000);
        const r = deal.payload.round as number;
        const board = r === 1 ? { top: [], mid: [], bottom: [] } : bobBoard;
        const decision = decidePlacement(deal.payload.cards, board, r, deal.payload.inFantasyland === true, activePlayers);
        for (const p of decision.placements) {
          bob.ws.send('placeCard', { card: p.card, line: p.line });
          (bobBoard as any)[p.line].push(p.card);
        }
        if (decision.discard) bob.ws.send('discardCard', { card: decision.discard });
        await sleep(200);
        bob.ws.send('confirmPlacement');
        await sleep(500);
        await screenshotManager.capture(alice.page, `R${round}`, 'Alice', `라운드 ${round}`);
      }
    })();

    await Promise.all([alicePlay, bobPlay]);

    // ── handScored + 검증 ──
    const scoreMsg = await bob.ws.waitFor('handScored', 30000);
    expect(scoreMsg.payload.results).toBeTruthy();
    expect(scoreMsg.payload.handNumber).toBe(1);
    assertFullScoreValidity(scoreMsg.payload.results, 2);

    // 이름 검증 (UUID가 아닌 실제 이름)
    for (const [, data] of Object.entries(scoreMsg.payload.results) as [string, any][]) {
      expect(data.name).toBeTruthy();
      expect(data.name.length).toBeLessThan(30);
    }

    // ── 스코어 다이얼로그 스크린샷 ──
    try {
      await alice.page.getByLabel('ready-button').waitFor({ state: 'visible', timeout: 15000 });
    } catch { await sleep(3000); }
    await sleep(500);
    await screenshotManager.capture(alice.page, 'score-dialog', 'Alice', '점수 결과');

    // ── Ready → 2번째 핸드 ──
    const readyBtn = alice.page.getByLabel('ready-button');
    if (await readyBtn.isVisible().catch(() => false)) await readyBtn.click();
    bob.ws.send('readyForNextHand');

    try {
      await bob.ws.waitFor('gameStart', 15000);
      await sleep(2000);
      await screenshotManager.capture(alice.page, 'hand2-start', 'Alice', '2번째 핸드');
    } catch {}
  });
});
