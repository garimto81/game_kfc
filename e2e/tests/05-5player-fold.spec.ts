/**
 * 05-5player-fold.spec.ts — 5인 Play/Fold (WS 하이브리드)
 *
 * Playwright: 스크린샷 캡처
 * WS: 게임 조작 (joinRequest, playOrFoldResponse, placeCard 등)
 *
 * 5인+ 게임에서 Play/Fold 단계가 발생하며,
 * P1~P4 Play, P5 Fold 후 4인 활성 게임을 진행한다.
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
    // 5인+ 게임: 서버가 순차적으로 playOrFoldRequest 전송
    // P1~P4는 Play, P5는 Fold

    for (let i = 0; i < 5; i++) {
      const client = players[i].ws;
      // playOrFoldRequest가 오면 응답
      try {
        await client.waitFor('playOrFoldRequest', 15000);
        const choice = i < 4 ? 'play' : 'fold';
        client.send('playOrFoldResponse', { choice });

        await sleep(500);
        await screenshotManager.captureAll(
          allPages,
          `05-PF-CHOICE${i + 1}`,
          `${players[i].name} ${i < 4 ? 'Play' : 'Fold'} 선택`
        );
      } catch {
        // 이 플레이어의 차례가 아닐 수 있음
      }
    }

    // playOrFoldResult 대기
    const pfResult = await players[0].ws.waitFor('playOrFoldResult', 15000);
    expect(pfResult.payload.activePlayers).toBeTruthy();

    await sleep(2000);
    await screenshotManager.captureAll(allPages, '05-PF-RESULT', 'Play/Fold 결과');

    // ── Folded P5 스크린샷 ──
    await screenshotManager.captureAll(
      [{ page: players[4].page, playerName: 'P5' }],
      '05-FOLDED-VIEW',
      'Fold된 P5 화면'
    );

    // ── gameStart 대기 (Play/Fold 후 게임 시작) ──
    for (const p of players) {
      await p.ws.waitFor('gameStart');
    }

    const activeClients = players.slice(0, 4).map((p) => p.ws);
    const activePlayers = 4;

    await sleep(2000);
    await screenshotManager.captureAll(allPages, '05-GAME-4ACTIVE', '4인 활성 게임');

    // ── R1~R5: 4인 활성 플레이어만 카드 배치 ──
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

    // ── handScored 수신 ──
    const scoreMsg = await players[0].ws.waitFor('handScored', 30000);
    expect(scoreMsg.payload.results).toBeTruthy();

    // Fold 플레이어 점수 확인
    const results = scoreMsg.payload.results;
    const p5Id = players[4].ws.playerId;
    if (p5Id && results[p5Id]) {
      // Fold 플레이어는 scooped 또는 score === 특정 값
      expect(results[p5Id].folded ?? results[p5Id].scooped).toBeTruthy();
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
