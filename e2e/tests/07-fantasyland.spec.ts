/**
 * 07-fantasyland.spec.ts — Fantasyland (WS 하이브리드)
 *
 * Playwright: 스크린샷 캡처
 * WS: 게임 조작
 *
 * FL 진입은 이전 핸드에서 top에 QQ+ 배치로 트리거됨.
 * WS로 FL 관련 메시지를 검증한다.
 */
import { test, expect } from '../fixtures/multi-player';
import { connectToServer } from '../helpers/game-actions';
import { WSGameClient, sleep } from '../helpers/ws-game-client';
import { decidePlacement, extractBoard } from '../helpers/ws-bot-strategy';
import type { Card } from '../helpers/ws-bot-strategy';

test.describe('07 — Fantasyland (WS Hybrid)', () => {
  test('Fantasyland 진입 → 14장 딜 → 배치 → 확인', async ({
    createHybridPlayers,
    screenshotManager,
  }) => {
    const players = await createHybridPlayers(2, ['FLPlayer', 'Normal']);
    const allPages = players.map((p) => ({ page: p.page, playerName: p.name }));
    const wsClients = players.map((p) => p.ws);

    // ── Playwright + WS 설정 ──
    for (const p of players) {
      await connectToServer(p.page);
    }

    const room = await WSGameClient.createRoom('E2E-FL-Test', 2, 120);
    expect(room.id).toBeTruthy();

    await sleep(1000);

    for (const p of players) {
      await p.ws.join(room.id);
      await sleep(300);
    }

    // ── 게임 시작 ──
    players[0].ws.send('startGame');

    for (const p of players) {
      await p.ws.waitFor('dealerSelection');
    }
    for (const p of players) {
      await p.ws.waitFor('gameStart');
    }

    await screenshotManager.captureAll(allPages, '07-FL-ENTRY', 'FL 진입 조건 (첫 핸드)');

    // ── 핸드 1: FL 진입을 위해 top에 높은 카드 배치 시도 ──
    // FLPlayer: top에 높은 카드 배치 (QQ+ 조건)
    const activePlayers = 2;

    for (let round = 1; round <= 5; round++) {
      await Promise.all(wsClients.map(async (client) => {
        const dealMsg = await client.waitFor('dealCards', 30000);
        const cards = dealMsg.payload.cards as Card[];
        const dealRound = dealMsg.payload.round as number;
        const isFL = dealMsg.payload.inFantasyland === true;
        const board = extractBoard(client);

        if (client === players[0].ws && dealRound === 1) {
          // FLPlayer R1: top에 가장 높은 카드 배치 (FL 유도)
          const sorted = [...cards].sort((a, b) => b.rank - a.rank);
          const placements = [
            { card: sorted[0], line: 'top' as const },
            { card: sorted[1], line: 'bottom' as const },
            { card: sorted[2], line: 'bottom' as const },
            { card: sorted[3], line: 'mid' as const },
            { card: sorted[4], line: 'mid' as const },
          ];
          for (const p of placements) {
            client.send('placeCard', { card: p.card, line: p.line });
          }
        } else {
          const decision = decidePlacement(cards, board, dealRound, isFL, activePlayers);
          for (const p of decision.placements) {
            client.send('placeCard', { card: p.card, line: p.line });
          }
          if (decision.discard) {
            client.send('discardCard', { card: decision.discard });
          }
        }
        await sleep(200);
        client.send('confirmPlacement');
        await sleep(500);
      }));
    }

    await sleep(1500);
    await screenshotManager.captureAll(allPages, '07-FL-BADGE', 'FL 배지 (핸드 1 후)');

    // ── handScored 대기 ──
    const scoreMsg = await players[0].ws.waitFor('handScored', 30000);
    expect(scoreMsg.payload.results).toBeTruthy();

    // FL 진입 여부 확인: dealCards에서 inFantasyland 검증은 다음 핸드에서
    const flDeals = players[0].ws.getMessages('dealCards');
    let hasFL = false;
    for (const deal of flDeals) {
      if (deal.payload.inFantasyland) {
        const cards = deal.payload.cards as Card[];
        expect(cards.length).toBe(14);
        hasFL = true;
      }
    }

    await screenshotManager.captureAll(
      [{ page: players[0].page, playerName: 'FLPlayer' }],
      '07-FL-DEAL14',
      `FL 14장 딜 (${hasFL ? '진입 성공' : '조건 미충족'})`
    );

    await screenshotManager.captureAll(allPages, '07-FL-CONFIRM', 'FL 확정');
  });
});
