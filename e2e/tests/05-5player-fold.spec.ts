/**
 * 05-5player-fold.spec.ts — 5인 Play/Fold (WS 하이브리드)
 *
 * Playwright: 스크린샷 캡처
 * WS: 게임 조작 (joinRequest, playOrFoldResponse, placeCard 등)
 *
 * 5인+ 게임에서 Play/Fold 단계가 발생하며,
 * 4명 Play 후 4인 활성 게임을 진행한다.
 */
import { test, expect } from '../fixtures/multi-player';
import { connectToServer } from '../helpers/game-actions';
import { WSGameClient, sleep } from '../helpers/ws-game-client';
import { decidePlacement, extractBoard } from '../helpers/ws-bot-strategy';

test.describe('05 — 5-Player Play/Fold (WS Hybrid)', () => {
  test('5인 게임 — 4명 Play + 1명 Fold', async ({
    createHybridPlayers,
    screenshotManager,
  }) => {
    const players = await createHybridPlayers(5, ['P1', 'P2', 'P3', 'P4', 'P5']);
    const allPages = players.map((p) => ({ page: p.page, playerName: p.name }));

    // ── Playwright: Flutter 앱 로드 ──
    for (const p of players) {
      await connectToServer(p.page);
    }

    // ── WS: 5인 방 생성 + 참가 ──
    const room = await WSGameClient.createRoom('E2E-5P-Fold', 5, 60);
    expect(room.id).toBeTruthy();

    await sleep(1000);

    for (const p of players) {
      await p.ws.join(room.id);
      await sleep(300); // 순차 참가
    }

    await sleep(1500);
    await screenshotManager.captureAll(allPages, '05-WAIT-5P', '5인 대기 화면');

    // ── WS: 게임 시작 → dealerSelection ──
    players[0].ws.send('startGame');

    for (const p of players) {
      await p.ws.waitFor('dealerSelection');
    }

    await sleep(1500);
    await screenshotManager.captureAll(allPages, '05-PF-REQUEST', 'Play/Fold 시작');

    // ── WS: Play/Fold 응답 ──
    // 모든 플레이어가 동시에 대기, 자기 request를 받으면 'play' 응답
    // 서버가 4명 play 확보 후 나머지 auto-fold
    await Promise.all(players.map(async (p) => {
      try {
        await p.ws.waitFor('playOrFoldRequest', 20000);
        p.ws.send('playOrFoldResponse', { choice: 'play' });
      } catch {
        // auto-fold된 플레이어에게는 request가 오지 않음
      }
    }));

    await sleep(1000);
    await screenshotManager.captureAll(allPages, '05-PF-CHOICES', 'Play/Fold 선택 완료');

    // playOrFoldResult 대기
    const pfResult = await players[0].ws.waitFor('playOrFoldResult', 15000);
    expect(pfResult.payload.activePlayers).toBeTruthy();

    await sleep(2000);
    await screenshotManager.captureAll(allPages, '05-PF-RESULT', 'Play/Fold 결과');

    // ── gameStart 대기 (Play/Fold 후 게임 시작) ──
    await Promise.all(players.map(p => p.ws.waitFor('gameStart')));

    // activePlayers 목록에서 실제 active 클라이언트 결정
    const activePlayerIds: string[] = pfResult.payload.activePlayers;
    const wsClients = players.map(p => p.ws);
    const activeClients = wsClients.filter(c => activePlayerIds.includes(c.playerId!));
    const activePlayers = activeClients.length;

    // Folded 플레이어 스크린샷
    const foldedClients = wsClients.filter(c => !activePlayerIds.includes(c.playerId!));
    const foldedPages = players.filter(p => !activePlayerIds.includes(p.ws.playerId!));
    if (foldedPages.length > 0) {
      await screenshotManager.captureAll(
        foldedPages.map(p => ({ page: p.page, playerName: p.name })),
        '05-FOLDED-VIEW',
        'Fold된 플레이어 화면'
      );
    }

    await sleep(2000);
    await screenshotManager.captureAll(allPages, '05-GAME-4ACTIVE', '4인 활성 게임');

    // ── R1~R5: 활성 플레이어가 동시에 dealCards 대기 ──
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

    // ── handScored 수신 ──
    const scoreMsg = await players[0].ws.waitFor('handScored', 30000);
    expect(scoreMsg.payload.results).toBeTruthy();

    // Fold 플레이어 점수 확인
    const results = scoreMsg.payload.results;
    for (const fc of foldedClients) {
      if (fc.playerId && results[fc.playerId]) {
        expect(results[fc.playerId].folded ?? results[fc.playerId].scooped).toBeTruthy();
      }
    }

    // zero-sum 검증
    let totalScore = 0;
    for (const id of Object.keys(results)) {
      totalScore += results[id].score || 0;
    }
    expect(totalScore).toBe(0);

    await sleep(2000);
    await screenshotManager.captureAll(allPages, '05-SCORE-FOLD', '스코어 (Fold 포함)');
  });
});
