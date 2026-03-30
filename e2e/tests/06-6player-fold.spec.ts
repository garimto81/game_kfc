/**
 * 06-6player-fold.spec.ts — 6인 Play/Fold (WS 하이브리드)
 *
 * Playwright: 스크린샷 캡처
 * WS: 게임 조작
 *
 * 핵심 검증:
 * - 6인 Play/Fold: 4명 play, 2명 auto-fold
 * - 2명 fold 후 4인 활성 게임 진행
 */
import { test, expect } from '../fixtures/multi-player';
import { connectToServer } from '../helpers/game-actions';
import { WSGameClient, sleep } from '../helpers/ws-game-client';
import { decidePlacement, extractBoard } from '../helpers/ws-bot-strategy';

test.describe('06 — 6-Player Play/Fold (WS Hybrid)', () => {
  test('6인 게임 — 4명 Play + 2명 Fold', async ({
    createHybridPlayers,
    screenshotManager,
  }) => {
    const players = await createHybridPlayers(6, ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
    const allPages = players.map((p) => ({ page: p.page, playerName: p.name }));

    // ── Playwright: Flutter 앱 로드 ──
    for (const p of players) {
      await connectToServer(p.page);
    }

    // ── WS: 6인 방 생성 + 참가 ──
    const room = await WSGameClient.createRoom('E2E-6P-Fold', 6, 60);
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

    await sleep(1500);
    await screenshotManager.captureAll(allPages, '06-PF-6P', '6인 Play/Fold 시작');

    // ── Play/Fold 응답: 모든 플레이어가 'play' 응답 ──
    // 서버가 4명 play 확보 후 나머지 auto-fold
    await Promise.all(players.map(async (p) => {
      try {
        await p.ws.waitFor('playOrFoldRequest', 20000);
        p.ws.send('playOrFoldResponse', { choice: 'play' });
      } catch {
        // auto-fold된 플레이어에게는 request가 오지 않음
      }
    }));

    // playOrFoldResult 대기
    const pfResult = await players[0].ws.waitFor('playOrFoldResult', 15000);
    expect(pfResult.payload.activePlayers).toBeTruthy();

    // activePlayers 목록에서 실제 active 클라이언트 결정
    const activePlayerIds: string[] = pfResult.payload.activePlayers;

    await sleep(2000);
    await screenshotManager.captureAll(allPages, '06-PF-4PLAY-2FOLD', '4명 Play + 2명 Fold');

    // Fold된 플레이어 스크린샷
    const foldedPages = players.filter(p => !activePlayerIds.includes(p.ws.playerId!));
    if (foldedPages.length > 0) {
      await screenshotManager.captureAll(
        foldedPages.map(p => ({ page: p.page, playerName: p.name })),
        '06-FOLD-VIEWS',
        'Fold된 플레이어들'
      );
    }

    // ── gameStart 대기 ──
    await Promise.all(players.map(p => p.ws.waitFor('gameStart')));

    const activeClients = players
      .filter(p => activePlayerIds.includes(p.ws.playerId!))
      .map(p => p.ws);
    const activePlayers = activeClients.length;

    await sleep(2000);
    await screenshotManager.captureAll(allPages, '06-GAME-4ACTIVE', '4인 활성 게임');

    // ── R1~R5: 활성 클라이언트가 동시에 dealCards 대기 ──
    for (let round = 1; round <= 5; round++) {
      await Promise.all(activeClients.map(async (client) => {
        const dealMsg = await client.waitFor('dealCards', 30000);
        const cards = dealMsg.payload.cards;
        const dealRound = dealMsg.payload.round as number;
        const isFL = dealMsg.payload.inFantasyland === true;
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
    }

    // ── handScored ──
    const scoreMsg = await players[0].ws.waitFor('handScored', 30000);
    expect(scoreMsg.payload.results).toBeTruthy();

    let totalScore = 0;
    for (const id of Object.keys(scoreMsg.payload.results)) {
      totalScore += scoreMsg.payload.results[id].score || 0;
    }
    expect(totalScore).toBe(0);

    await sleep(2000);
    await screenshotManager.captureAll(allPages, '06-SCORE-2FOLD', '스코어 (2명 Fold)');
  });
});
