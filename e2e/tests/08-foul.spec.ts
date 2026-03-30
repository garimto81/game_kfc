/**
 * 08-foul.spec.ts — Foul 감지 및 점수 처리 (WS 하이브리드)
 *
 * Playwright: 스크린샷 캡처
 * WS: 게임 조작 — 의도적 foul 유도
 *
 * Foul: bottom < mid 또는 mid < top 핸드.
 * FoulPlayer는 역순 배치 (낮은 카드 → bottom), CleanPlayer는 정상 배치.
 */
import { test, expect } from '../fixtures/multi-player';
import { connectToServer } from '../helpers/game-actions';
import { WSGameClient, sleep } from '../helpers/ws-game-client';
import { decidePlacement, extractBoard } from '../helpers/ws-bot-strategy';
import type { Card } from '../helpers/ws-bot-strategy';

test.describe('08 — Foul Detection (WS Hybrid)', () => {
  test('Foul 감지 → 스쿱 점수', async ({
    createHybridPlayers,
    screenshotManager,
  }) => {
    const players = await createHybridPlayers(2, ['FoulPlayer', 'CleanPlayer']);
    const allPages = players.map((p) => ({ page: p.page, playerName: p.name }));
    const wsClients = players.map((p) => p.ws);

    // ── Playwright + WS 설정 ──
    for (const p of players) {
      await connectToServer(p.page);
    }

    const room = await WSGameClient.createRoom('E2E-Foul-Test', 2, 60);
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

    const activePlayers = 2;

    // ── R1~R5: FoulPlayer는 역순 배치, CleanPlayer는 정상 배치 ──
    // 모든 클라이언트가 동시에 dealCards 대기
    for (let round = 1; round <= 5; round++) {
      await Promise.all(wsClients.map(async (client) => {
        const dealMsg = await client.waitFor('dealCards', 30000);
        const cards = dealMsg.payload.cards as Card[];
        const dealRound = dealMsg.payload.round as number;
        const isFL = dealMsg.payload.inFantasyland === true;
        const board = extractBoard(client);

        if (client === players[0].ws && dealRound === 1) {
          // FoulPlayer R1: 역순 배치 (낮은 카드 → bottom, 높은 → top)
          const sorted = [...cards].sort((a, b) => a.rank - b.rank); // 오름차순
          const placements = [
            { card: sorted[0], line: 'bottom' as const },
            { card: sorted[1], line: 'bottom' as const },
            { card: sorted[2], line: 'mid' as const },
            { card: sorted[3], line: 'mid' as const },
            { card: sorted[4], line: 'top' as const },
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

    await screenshotManager.captureAll(allPages, '08-FOUL-SETUP', 'Foul 유도 배치');

    // ── handScored에서 fouled 확인 ──
    const scoreMsg = await players[0].ws.waitFor('handScored', 30000);
    expect(scoreMsg.payload.results).toBeTruthy();

    const results = scoreMsg.payload.results as Record<string, any>;
    let hasFoul = false;
    for (const [_id, result] of Object.entries(results)) {
      if (result.fouled) {
        hasFoul = true;
        // Foul 플레이어는 royalty 0
        expect(result.royaltyTotal).toBe(0);
      }
    }

    // zero-sum
    let totalScore = 0;
    for (const id of Object.keys(results)) {
      totalScore += results[id].score || 0;
    }
    expect(totalScore).toBe(0);

    await sleep(2000);
    await screenshotManager.captureAll(allPages, '08-FOUL-DETECT', 'Foul 감지');
    await screenshotManager.captureAll(allPages, '08-FOUL-SCORE', 'Foul 스코어');
  });
});
