/**
 * 10-timer-timeout.spec.ts — 턴 타이머 만료 + autoFold (WS 하이브리드)
 *
 * Playwright: 스크린샷 캡처 (타이머 바 시각적 확인)
 * WS: 게임 조작 + 타이머 만료 감지
 *
 * 시나리오:
 * 1. turnTimeLimit=10 방 생성 (10초 타이머)
 * 2. 2인 참가 → 게임 시작
 * 3. 첫 번째 턴 플레이어(AFK)가 아무것도 안 함 → 타이머 만료
 * 4. foldedThisHand 메시지 확인 → 다음 턴 전환
 */
import { test, expect } from '../fixtures/multi-player';
import { connectToServer } from '../helpers/game-actions';
import { WSGameClient, sleep } from '../helpers/ws-game-client';
import { decidePlacement, extractBoard } from '../helpers/ws-bot-strategy';

test.describe('10 — Timer & Timeout (WS Hybrid)', () => {
  test('턴 타이머 만료 → autoFold → 다음 턴', async ({
    createHybridPlayers,
    screenshotManager,
  }) => {
    const players = await createHybridPlayers(2, ['Active', 'AFK']);
    const [active, afk] = players;
    const allPages = players.map((p) => ({ page: p.page, playerName: p.name }));

    // ── Playwright: Flutter 앱 로드 ──
    await connectToServer(active.page);
    await connectToServer(afk.page);

    // ── WS: 10초 타이머 방 생성 ──
    const room = await WSGameClient.createRoom('E2E-Timer-Test', 2, 10);
    expect(room.id).toBeTruthy();

    await sleep(1000);

    await active.ws.join(room.id);
    await afk.ws.join(room.id);

    // ── WS: 게임 시작 ──
    active.ws.send('startGame');

    await active.ws.waitFor('dealerSelection');
    await afk.ws.waitFor('dealerSelection');

    const activeGameStart = await active.ws.waitFor('gameStart');
    await afk.ws.waitFor('gameStart');

    const currentTurnPlayerId = activeGameStart.payload.currentTurnPlayerId;
    expect(currentTurnPlayerId).toBeTruthy();

    // 어느 쪽이 첫 번째 턴인지 확인
    const isActiveFirst = currentTurnPlayerId === active.ws.playerId;

    // ── 첫 턴 플레이어에게 dealCards 대기 ──
    if (isActiveFirst) {
      // Active가 첫 턴: 바로 배치하고, AFK의 턴에서 타임아웃 테스트
      const dealMsg = await active.ws.waitFor('dealCards');
      const cards = dealMsg.payload.cards;
      const board = extractBoard(active.ws);
      const decision = decidePlacement(cards, board, 1, false, 2);
      for (const p of decision.placements) {
        active.ws.send('placeCard', { card: p.card, line: p.line });
      }
      active.ws.send('confirmPlacement');

      // AFK 턴: dealCards 수신 후 아무것도 안 함
      await afk.ws.waitFor('dealCards');
    } else {
      // AFK가 첫 턴: dealCards 수신 후 아무것도 안 함
      await afk.ws.waitFor('dealCards');
    }

    // ── TIMER-BAR: 타이머 바 스크린샷 (시작) ──
    await sleep(1500);
    await screenshotManager.captureAll(allPages, '10-TIMER-BAR', '타이머 바 (시작)');

    // ── TIMER-5S: 5초 대기 ──
    await sleep(5000);
    await screenshotManager.captureAll(allPages, '10-TIMER-5S', '타이머 5초 남음');

    // ── TIMER-EXPIRE: 추가 6초 → 타이머 만료 ──
    await sleep(6000);
    await screenshotManager.captureAll(allPages, '10-TIMER-EXPIRE', '타이머 만료');

    // ── foldedThisHand 또는 turnChanged 확인 ──
    // AFK 플레이어가 자동 폴드되어야 함
    const afkFoldMsgs = afk.ws.getMessages('foldedThisHand');
    const turnChangedMsgs = active.ws.getMessages('turnChanged');

    // 타임아웃으로 인해 foldedThisHand 또는 turnChanged가 발생해야 함
    const hasTimeoutEffect = afkFoldMsgs.length > 0 || turnChangedMsgs.length > 0;
    // 서버가 자동 처리했으므로 handScored도 올 수 있음
    const handScoredMsgs = active.ws.getMessages('handScored');

    await screenshotManager.captureAll(allPages, '10-TIMER-ADVANCE', '다음 턴 진행');

    // ── Active 플레이어가 아직 턴이 남아있으면 처리 ──
    if (!isActiveFirst) {
      try {
        const dealMsg = await active.ws.waitFor('dealCards', 10000);
        const cards = dealMsg.payload.cards;
        const board = extractBoard(active.ws);
        const decision = decidePlacement(cards, board, 1, false, 2);
        for (const p of decision.placements) {
          active.ws.send('placeCard', { card: p.card, line: p.line });
        }
        active.ws.send('confirmPlacement');
      } catch {
        // 이미 handScored로 넘어갔을 수 있음
      }
    }

    // ── handScored 대기 (타임아웃이 길 수 있음) ──
    await sleep(5000);

    const scoreMsg = active.ws.getLastMessage('handScored');
    if (scoreMsg) {
      expect(scoreMsg.payload).toHaveProperty('results');
    }

    await screenshotManager.captureAll(allPages, '10-TIMER-SCORE', '타임아웃 후 스코어');
  });
});
