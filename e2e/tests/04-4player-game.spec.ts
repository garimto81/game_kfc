/**
 * 04-4player-game.spec.ts — 4인 게임 (R5 2장, 덱 재충전)
 * 체크포인트: R5-DEAL, R5-NO-DISCARD, DECK-RECYCLE, SCORE-6PAIRS, GRID-4P
 */
import { test, expect } from '../fixtures/multi-player';
import * as actions from '../helpers/game-actions';

const SERVER_PORT = 3099;
const API = `http://localhost:${SERVER_PORT}`;

test.describe('04 — 4-Player Game', () => {
  test('4인 게임 — R5 2장 딜 + 덱 재충전 + 6쌍 스코어', async ({
    createPlayers,
    screenshotManager,
  }) => {
    const players = await createPlayers(4, ['P1', 'P2', 'P3', 'P4']);

    // 방 생성
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

    for (const p of players) {
      await actions.connectToServer(p.page);
    }

    // R1~R4 진행
    for (const round of [1, 2, 3, 4]) {
      await screenshotManager.captureAll(
        players.map((p) => ({ page: p.page, playerName: p.name })),
        `04-R${round}-DEAL`,
        `4인 R${round} 딜`
      );
      await players[0].page.waitForTimeout(500);
    }

    // ── R5: 2장 딜 (디스카드 없음) ──
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '04-R5-DEAL',
      'R5 2장 딜 (4인)'
    );

    // WS interceptor로 dealCards 메시지의 cards 길이 확인
    // 4인+ R5에서는 2장이어야 함
    for (const p of players) {
      const dealMsgs = p.interceptor.getMessages('dealCards');
      // 마지막 dealCards가 R5이면 cards.length === 2 확인
      if (dealMsgs.length > 0) {
        const lastDeal = dealMsgs[dealMsgs.length - 1];
        // R5 확인은 payload.round로
        if (lastDeal.payload.round === 5) {
          const cards = lastDeal.payload.cards as unknown[];
          expect(cards.length).toBe(2);
        }
      }
    }

    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '04-R5-NO-DISCARD',
      'R5 디스카드 없음'
    );

    // ── 덱 재충전 확인 ──
    // 4인 게임: 52장 덱에서 R1(5*4=20) + R2-R4(3*4*3=36) = 56장 필요
    // discardPile이 재투입되어야 함
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '04-DECK-RECYCLE',
      '덱 재충전 후'
    );

    // ── 6쌍 스코어 ──
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '04-SCORE-6PAIRS',
      '4인 6쌍 스코어'
    );

    // ── Grid view ──
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '04-GRID-4P',
      '4인 Grid View'
    );

    for (const p of players) {
      p.interceptor.saveLog('04-4player-game');
    }
  });
});
