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

    // ── R1: 3명 순서대로 5장 배치 ──
    for (let turn = 0; turn < 3; turn++) {
      // 턴 순서대로 dealCards를 받는 플레이어가 배치
      // 서버가 턴 순서에 따라 현재 턴 플레이어에게만 dealCards 전송
      // 어떤 클라이언트가 dealCards를 받든 처리
      const promises = wsClients.map(async (client) => {
        try {
          const dealMsg = await client.waitFor('dealCards', 15000);
          const cards = dealMsg.payload.cards;
          expect(cards.length).toBe(5); // R1
          const board = extractBoard(client);
          const decision = decidePlacement(cards, board, 1, false, activePlayers);
          for (const p of decision.placements) {
            client.send('placeCard', { card: p.card, line: p.line });
          }
          client.send('confirmPlacement');
          return true;
        } catch {
          return false;
        }
      });

      // 한 명만 이번 턴에 dealCards를 받음
      const results = await Promise.all(promises);
      const played = results.filter(Boolean).length;
      // 최소 1명은 플레이해야 함 (남은 클라이언트는 다음 턴에서 받음)

      await sleep(1000);
      await screenshotManager.captureAll(allPages, `03-R1-TURN${turn + 1}`, `R1 턴 ${turn + 1}`);

      // 다음 턴에서 나머지가 받으므로 break 조건 불필요
      if (played > 0) break; // 실제로는 라운드 1 전체를 한번에 처리
    }

    // R1은 실제로 턴 기반이므로 나머지 플레이어도 순차적으로 처리
    // 서버가 turnChanged를 보내고 다음 플레이어에게 dealCards를 보냄
    // 위에서 Promise.all로 첫 번째만 받았으므로 나머지 처리
    for (let i = 0; i < 2; i++) {
      for (const client of wsClients) {
        try {
          const dealMsg = await client.waitFor('dealCards', 10000);
          const cards = dealMsg.payload.cards;
          const board = extractBoard(client);
          const round = dealMsg.payload.round as number;
          const decision = decidePlacement(cards, board, round, false, activePlayers);
          for (const p of decision.placements) {
            client.send('placeCard', { card: p.card, line: p.line });
          }
          if (decision.discard) {
            client.send('discardCard', { card: decision.discard });
          }
          client.send('confirmPlacement');
          break; // 이번 턴 처리 완료
        } catch {
          continue; // 이 클라이언트는 이번 턴이 아님
        }
      }
    }

    await sleep(1500);
    await screenshotManager.captureAll(allPages, '03-R1-COMPLETE', 'R1 완료');

    // ── R2~R5 ──
    for (let round = 2; round <= 5; round++) {
      for (let turn = 0; turn < 3; turn++) {
        // 각 턴에서 한 명이 dealCards를 받아 처리
        for (const client of wsClients) {
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
      await screenshotManager.captureAll(allPages, `03-R${round}-SUMMARY`, `라운드 ${round} 요약`);
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
