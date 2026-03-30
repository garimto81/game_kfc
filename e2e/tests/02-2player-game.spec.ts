/**
 * 02-2player-game.spec.ts — 2인 풀게임 (WS 하이브리드 방식)
 *
 * 아키텍처:
 * - Playwright 브라우저: Flutter 앱 로드 + 스크린샷 캡처 전용
 * - WS 클라이언트: 게임 조작 (joinRequest, placeCard, confirmPlacement 등)
 *
 * CanvasKit 렌더러에서 DOM 셀렉터가 동작하지 않으므로
 * 게임 로직은 WS로 직접 수행하고, UI는 시각적으로만 검증한다.
 */
import { test, expect } from '../fixtures/multi-player';
import { connectToServer } from '../helpers/game-actions';
import { WSGameClient, sleep } from '../helpers/ws-game-client';
import { decidePlacement, extractBoard, playBotTurn } from '../helpers/ws-bot-strategy';
import type { HybridPlayer } from '../fixtures/multi-player';

test.describe('02 — 2-Player Full Game (WS Hybrid)', () => {
  test('2인 5라운드 풀게임 + 스코어링 + 2번째 핸드 시작', async ({
    createHybridPlayers,
    screenshotManager,
  }) => {
    const players = await createHybridPlayers(2, ['Alice', 'Bob']);
    const [alice, bob] = players;
    const allPages = players.map((p) => ({ page: p.page, playerName: p.name }));

    // ── 1. Playwright: 두 브라우저에서 Flutter 앱 로드 (스크린샷용) ──
    await connectToServer(alice.page);
    await connectToServer(bob.page);

    // ── 2. WS: 방 생성 ──
    const room = await WSGameClient.createRoom('E2E-2P-Game', 2, 60);
    expect(room.id).toBeTruthy();

    // Flutter 앱이 로비 WS로 방 목록 수신할 시간
    await sleep(1500);

    // ── 3. WS: 방 참가 ──
    await alice.ws.join(room.id);
    await bob.ws.join(room.id);

    expect(alice.ws.playerId).toBeTruthy();
    expect(bob.ws.playerId).toBeTruthy();

    // Flutter 앱이 상태 반영할 시간
    await sleep(2000);
    await screenshotManager.captureAll(allPages, '02-LOBBY', '로비에서 방 표시');

    // ── 4. WS: 게임 시작 ──
    alice.ws.send('startGame');

    const aliceDealer = await alice.ws.waitFor('dealerSelection');
    await bob.ws.waitFor('dealerSelection');

    expect(aliceDealer.payload.dealerId).toBeTruthy();
    expect(aliceDealer.payload.playerOrder).toBeTruthy();

    await sleep(1500);
    await screenshotManager.captureAll(allPages, '02-DEALER', '딜러 선정');

    // gameStart 대기
    await alice.ws.waitFor('gameStart');
    await bob.ws.waitFor('gameStart');

    // ── 5. WS: R1~R5 카드 배치 (봇 전략) ──
    const wsClients = [alice.ws, bob.ws];
    const activePlayers = 2;

    for (let round = 1; round <= 5; round++) {
      for (const client of wsClients) {
        const dealMsg = await client.waitFor('dealCards');
        const cards = dealMsg.payload.cards;
        const dealRound = dealMsg.payload.round;
        const isFL = dealMsg.payload.inFantasyland === true;

        // R1: 5장, R2-R4: 3장, R5(2-3인): 3장
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
        client.send('confirmPlacement');
      }

      // Flutter 앱이 상태 반영할 시간
      await sleep(1500);
      await screenshotManager.captureAll(allPages, `02-R${round}`, `라운드 ${round} 완료`);
    }

    // ── 6. WS: handScored 수신 ──
    const aliceScored = await alice.ws.waitFor('handScored');
    const bobScored = await bob.ws.waitFor('handScored');

    expect(aliceScored.payload.results).toBeTruthy();
    expect(aliceScored.payload.handNumber).toBe(1);

    // zero-sum 검증
    const results = aliceScored.payload.results;
    let totalScore = 0;
    for (const id of Object.keys(results)) {
      totalScore += results[id].score || 0;
    }
    expect(totalScore).toBe(0);

    // ── 7. 스크린샷: 스코어 다이얼로그 ──
    await sleep(2000);
    await screenshotManager.captureAll(allPages, '02-SCORE', '스코어 다이얼로그');

    // ── 8. WS: readyForNextHand ──
    alice.ws.send('readyForNextHand');
    bob.ws.send('readyForNextHand');

    // 2번째 핸드 시작 대기
    const alice2ndGameStart = await alice.ws.waitFor('gameStart', 15000);
    expect(alice2ndGameStart.payload).toBeTruthy();

    await sleep(2000);
    await screenshotManager.captureAll(allPages, '02-HAND2-START', '2번째 핸드 시작');

    // ── 9. 정리 ──
    // (teardown은 fixture에서 자동 처리)
  });
});
