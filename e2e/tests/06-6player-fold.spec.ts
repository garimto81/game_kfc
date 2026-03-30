/**
 * 06-6player-fold.spec.ts — 6인 Play/Fold (WS 하이브리드)
 *
 * Playwright: 스크린샷 캡처
 * WS: 게임 조작
 *
 * 핵심 검증:
 * - 6인 Play/Fold: P1~P4 play, P5~P6 fold
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

    // ── Play/Fold 응답: P1~P4 Play, P5~P6 Fold ──
    for (let i = 0; i < 6; i++) {
      try {
        await players[i].ws.waitFor('playOrFoldRequest', 15000);
        const choice = i < 4 ? 'play' : 'fold';
        players[i].ws.send('playOrFoldResponse', { choice });
        await sleep(500);
      } catch {
        // 이 플레이어 차례가 아님
      }
    }

    // playOrFoldResult 대기
    const pfResult = await players[0].ws.waitFor('playOrFoldResult', 15000);
    expect(pfResult.payload.activePlayers).toBeTruthy();

    await sleep(2000);
    await screenshotManager.captureAll(allPages, '06-PF-4PLAY-2FOLD', '4명 Play + 2명 Fold');

    // Fold된 P5, P6 스크린샷
    await screenshotManager.captureAll(
      [
        { page: players[4].page, playerName: 'P5' },
        { page: players[5].page, playerName: 'P6' },
      ],
      '06-FOLD-VIEWS',
      'Fold된 P5, P6'
    );

    // ── gameStart 대기 ──
    for (const p of players) {
      await p.ws.waitFor('gameStart');
    }

    const activeClients = players.slice(0, 4).map((p) => p.ws);
    const activePlayers = 4;

    await sleep(2000);
    await screenshotManager.captureAll(allPages, '06-GAME-4ACTIVE', '4인 활성 게임');

    // ── R1~R5 ──
    for (let round = 1; round <= 5; round++) {
      for (let turn = 0; turn < activePlayers; turn++) {
        for (const client of activeClients) {
          try {
            const dealMsg = await client.waitFor('dealCards', 15000);
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
            client.send('confirmPlacement');
            break;
          } catch {
            continue;
          }
        }
      }
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
