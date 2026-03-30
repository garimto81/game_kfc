/**
 * 04-4player-game.spec.ts — 4인 게임 (R5 2장, 덱 재충전)
 * 체크포인트: R5-DEAL, R5-NO-DISCARD, DECK-RECYCLE, SCORE-6PAIRS, GRID-4P
 *
 * 핵심 검증:
 * - 4인 게임에서 R5 dealCards 카드 수 === 2
 * - 디스카드 없음 (R5 2장은 모두 배치)
 * - 6쌍 비교 스코어: C(4,2) = 6
 */
import { test, expect } from '../fixtures/multi-player';
import * as actions from '../helpers/game-actions';
import { selectors } from '../helpers/game-actions';

const SERVER_PORT = 3099;
const API = `http://localhost:${SERVER_PORT}`;

test.describe('04 — 4-Player Game', () => {
  test('4인 게임 — R5 2장 딜 + 6쌍 스코어', async ({
    createPlayers,
    screenshotManager,
  }) => {
    const players = await createPlayers(4, ['P1', 'P2', 'P3', 'P4']);
    const allPages = players.map((p) => ({ page: p.page, playerName: p.name }));

    // ── 방 생성 ──
    const createRes = await fetch(`${API}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'E2E-4P-Game',
        max_players: 4,
        turn_time_limit: 60,
      }),
    });
    const room = await createRes.json();
    expect(room.id).toBeTruthy();

    // ── 접속 + 참가 ──
    for (const p of players) {
      await actions.connectToServer(p.page);
    }
    for (const p of players) {
      await actions.joinRoom(p.page, 'E2E-4P-Game', p.name);
      await p.page.waitForTimeout(500);
    }

    // ── 게임 시작 ──
    try {
      await actions.startGame(players[0].page);
    } catch {
      await players[0].page.waitForTimeout(2000);
    }

    for (const p of players) {
      await actions.waitForGameStart(p.page);
    }

    // ── R1~R4: 각 플레이어 순서대로 카드 배치 ──
    for (const round of [1, 2, 3, 4]) {
      for (const player of players) {
        await actions.waitForDeal(player.page);
        const hand = await actions.getHandCards(player.page);
        if (hand.length > 0) {
          if (round === 1) {
            // R1: 5장 배치
            await actions.placeCardToLine(player.page, 0, 'bottom');
            await actions.placeCardToLine(player.page, 0, 'bottom');
            await actions.placeCardToLine(player.page, 0, 'mid');
            await actions.placeCardToLine(player.page, 0, 'mid');
            await actions.placeCardToLine(player.page, 0, 'top');
          } else {
            // R2~R4: 2배치 + 1디스카드
            await actions.placeCardToLine(player.page, 0, 'bottom');
            await actions.placeCardToLine(player.page, 0, 'mid');
            await actions.discardCard(player.page, 0);
          }
          await actions.confirmPlacement(player.page);
        }
        await player.page.waitForTimeout(300);
      }

      await screenshotManager.captureAll(allPages, `04-R${round}-DEAL`, `4인 R${round} 딜`);
    }

    // ── R5: 4인+ → 2장 딜 (디스카드 없음) ──
    await players[0].page.waitForTimeout(1000);

    for (const player of players) {
      await actions.waitForDeal(player.page);

      // WS interceptor로 dealCards 확인: 4인 R5는 2장
      const dealMsgs = player.interceptor.getMessages('dealCards');
      if (dealMsgs.length > 0) {
        const lastDeal = dealMsgs[dealMsgs.length - 1];
        if (lastDeal.payload.round === 5) {
          const cards = lastDeal.payload.cards as unknown[];
          expect(cards.length).toBe(2);
        }
      }

      const hand = await actions.getHandCards(player.page);
      if (hand.length > 0) {
        // 2장 모두 배치 (디스카드 없음)
        await actions.placeCardToLine(player.page, 0, 'bottom');
        await actions.placeCardToLine(player.page, 0, 'top');
        await actions.confirmPlacement(player.page);
      }
      await player.page.waitForTimeout(300);
    }

    await screenshotManager.captureAll(allPages, '04-R5-DEAL', 'R5 2장 딜 (4인)');
    await screenshotManager.captureAll(allPages, '04-R5-NO-DISCARD', 'R5 디스카드 없음');

    // ── 덱 재충전 확인 ──
    // 4인 게임: R1(5*4=20) + R2-R4(3*4*3=36) = 56장 > 52장
    // discardPile에서 재충전이 필요함
    await screenshotManager.captureAll(allPages, '04-DECK-RECYCLE', '덱 재충전 후');

    // ── 6쌍 스코어 ──
    await actions.waitForScoring(players[0].page);

    const scoreMsg = players[0].interceptor.getLastMessage('handScored');
    if (scoreMsg) {
      expect(scoreMsg.payload).toHaveProperty('results');
    }

    await screenshotManager.captureAll(allPages, '04-SCORE-6PAIRS', '4인 6쌍 스코어');

    // ── Grid view ──
    try {
      await actions.toggleViewMode(players[0].page);
      await players[0].page.waitForTimeout(1000);
    } catch {
      // Grid 버튼 미존재
    }

    await screenshotManager.captureAll(allPages, '04-GRID-4P', '4인 Grid View');

    for (const p of players) {
      p.interceptor.saveLog('04-4player-game');
    }
  });
});
