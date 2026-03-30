/**
 * 03-3player-game.spec.ts — 3인 풀게임 턴 순서 (WS 하이브리드)
 *
 * Playwright: 스크린샷 캡처
 * WS: 게임 조작 (joinRequest, placeCard, confirmPlacement)
 */
import { test, expect } from '../fixtures/multi-player';
import { connectToServer } from '../helpers/game-actions';
import { WSGameClient, sleep } from '../helpers/ws-game-client';
import { decidePlacement, extractBoard } from '../helpers/ws-bot-strategy';

test.describe('03 — 3-Player Full Game (WS Hybrid)', () => {
  test('3인 게임 — 턴 순서 검증', async ({
    createHybridPlayers,
    screenshotManager,
  }) => {
    const players = await createHybridPlayers(3, ['P1', 'P2', 'P3']);
    const allPages = players.map((p) => ({ page: p.page, playerName: p.name }));
    const wsClients = players.map((p) => p.ws);

    // ── Playwright: Flutter 앱 로드 ──
    for (const p of players) {
      await connectToServer(p.page);
    }

    // ── WS: 방 생성 + 참가 ──
    const room = await WSGameClient.createRoom('E2E-3P-Game', 3, 60);
    expect(room.id).toBeTruthy();

    await sleep(1000);

    for (const p of players) {
      await p.ws.join(room.id);
    }

    await sleep(2000);
    await screenshotManager.captureAll(allPages, '03-WAIT-3P', '3인 대기 화면');

    // ── WS: 게임 시작 ──
    players[0].ws.send('startGame');

    const dealerMsg = await players[0].ws.waitFor('dealerSelection');
    for (let i = 1; i < 3; i++) {
      await players[i].ws.waitFor('dealerSelection');
    }

    expect(dealerMsg.payload.playerOrder).toBeTruthy();
    const playerOrder = dealerMsg.payload.playerOrder as string[];
    expect(playerOrder.length).toBe(3);

    await sleep(1500);
    await screenshotManager.captureAll(allPages, '03-DEALER', '딜러 선택');

    // gameStart 대기
    for (const p of players) {
      await p.ws.waitFor('gameStart');
    }

    const activePlayers = 3;

    // ── R1~R5: 모든 클라이언트가 동시에 dealCards 대기 ──
    for (let round = 1; round <= 5; round++) {
      await Promise.all(wsClients.map(async (client) => {
        const dealMsg = await client.waitFor('dealCards', 30000);
        const cards = dealMsg.payload.cards;
        const dealRound = dealMsg.payload.round as number;
        const isFL = dealMsg.payload.inFantasyland === true;

        if (round === 1) {
          expect(cards.length).toBe(5);
        }

        const board = extractBoard(client);
        const decision = decidePlacement(cards, board, dealRound, isFL, activePlayers);
        for (const p of decision.placements) {
          client.send('placeCard', { card: p.card, line: p.line });
        }
        if (decision.discard) {
          client.send('discardCard', { card: decision.discard });
        }
        await sleep(200);
        client.send('confirmPlacement');
        await sleep(500);
      }));

      await sleep(1000);
      const label = round === 1 ? '03-R1-COMPLETE' : `03-R${round}-SUMMARY`;
      const desc = round === 1 ? 'R1 완료' : `라운드 ${round} 요약`;
      await screenshotManager.captureAll(allPages, label, desc);
    }

    // ── handScored 수신 ──
    const scoreMsg = await players[0].ws.waitFor('handScored');
    expect(scoreMsg.payload.results).toBeTruthy();

    // 3인 zero-sum
    const results = scoreMsg.payload.results;
    let totalScore = 0;
    for (const id of Object.keys(results)) {
      totalScore += results[id].score || 0;
    }
    expect(totalScore).toBe(0);

    await sleep(2000);
    await screenshotManager.captureAll(allPages, '03-SCORE', '3인 스코어');

    // ── Ready ──
    for (const p of players) {
      p.ws.send('readyForNextHand');
    }

    await sleep(1500);
    await screenshotManager.captureAll(allPages, '03-READY', 'Ready 후');
  });
});
