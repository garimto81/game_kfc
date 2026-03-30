/**
 * 04-4player-game.spec.ts — 4인 게임 R5 2장 딜 (WS 하이브리드)
 *
 * Playwright: 스크린샷 캡처
 * WS: 게임 조작
 *
 * 핵심 검증:
 * - 4인 R5: dealCards 카드 수 === 2 (디스카드 없음)
 * - 6쌍 비교 스코어: C(4,2) = 6
 */
import { test, expect } from '../fixtures/multi-player';
import { connectToServer } from '../helpers/game-actions';
import { WSGameClient, sleep } from '../helpers/ws-game-client';
import { decidePlacement, extractBoard } from '../helpers/ws-bot-strategy';

test.describe('04 — 4-Player Game (WS Hybrid)', () => {
  test('4인 게임 — R5 2장 딜 + 6쌍 스코어', async ({
    createHybridPlayers,
    screenshotManager,
  }) => {
    const players = await createHybridPlayers(4, ['P1', 'P2', 'P3', 'P4']);
    const allPages = players.map((p) => ({ page: p.page, playerName: p.name }));
    const wsClients = players.map((p) => p.ws);

    // ── Playwright: Flutter 앱 로드 ──
    for (const p of players) {
      await connectToServer(p.page);
    }

    // ── WS: 방 생성 + 참가 ──
    const room = await WSGameClient.createRoom('E2E-4P-Game', 4, 60);
    expect(room.id).toBeTruthy();

    await sleep(1000);

    for (const p of players) {
      await p.ws.join(room.id);
      await sleep(300);
    }

    // ── WS: 게임 시작 ──
    players[0].ws.send('startGame');

    for (const p of players) {
      await p.ws.waitFor('dealerSelection');
    }
    for (const p of players) {
      await p.ws.waitFor('gameStart');
    }

    const activePlayers = 4;

    // ── R1~R5: 모든 클라이언트가 동시에 dealCards 대기 ──
    for (let round = 1; round <= 5; round++) {
      await Promise.all(wsClients.map(async (client) => {
        const dealMsg = await client.waitFor('dealCards', 30000);
        const cards = dealMsg.payload.cards;
        const dealRound = dealMsg.payload.round as number;
        const isFL = dealMsg.payload.inFantasyland === true;

        // 4인 R5: 2장 확인
        if (dealRound === 5) {
          expect(cards.length).toBe(2);
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
      if (round === 5) {
        await screenshotManager.captureAll(allPages, '04-R5-DEAL', 'R5 2장 딜 (4인)');
      } else {
        await screenshotManager.captureAll(allPages, `04-R${round}-DEAL`, `4인 R${round}`);
      }
    }

    // ── handScored 수신 ──
    const scoreMsg = await players[0].ws.waitFor('handScored', 30000);
    expect(scoreMsg.payload.results).toBeTruthy();

    // zero-sum
    const results = scoreMsg.payload.results;
    let totalScore = 0;
    for (const id of Object.keys(results)) {
      totalScore += results[id].score || 0;
    }
    expect(totalScore).toBe(0);

    await sleep(2000);
    await screenshotManager.captureAll(allPages, '04-SCORE-6PAIRS', '4인 6쌍 스코어');
  });
});
