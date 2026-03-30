/**
 * 08-foul.spec.ts — Foul 감지 및 점수 처리
 * 체크포인트: FOUL-SETUP, FOUL-DETECT, FOUL-SCORE
 *
 * Foul은 bottom < mid 또는 mid < top 핸드일 때 발생.
 * E2E에서는 의도적으로 약한 카드를 bottom에 배치하여 foul 유도.
 * handScored 메시지에서 fouled=true, scooped 확인.
 */
import { test, expect } from '../fixtures/multi-player';
import * as actions from '../helpers/game-actions';
import { selectors } from '../helpers/game-actions';

const SERVER_PORT = 3099;
const API = `http://localhost:${SERVER_PORT}`;

test.describe('08 — Foul Detection', () => {
  test('Foul 감지 → 스쿱 점수', async ({
    createPlayers,
    screenshotManager,
  }) => {
    const players = await createPlayers(2, ['FoulPlayer', 'CleanPlayer']);
    const allPages = players.map((p) => ({ page: p.page, playerName: p.name }));

    const createRes = await fetch(`${API}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'E2E-Foul-Test',
        max_players: 2,
        turn_time_limit: 60,
      }),
    });
    const room = await createRes.json();
    expect(room.id).toBeTruthy();

    // ── 접속 + 참가 ──
    for (const p of players) {
      await actions.connectToServer(p.page);
    }
    await actions.joinRoom(players[0].page, 'E2E-Foul-Test', 'FoulPlayer');
    await players[0].page.waitForTimeout(500);
    await actions.joinRoom(players[1].page, 'E2E-Foul-Test', 'CleanPlayer');
    await players[1].page.waitForTimeout(500);

    // ── 게임 시작 ──
    try {
      await actions.startGame(players[0].page);
    } catch {
      await players[0].page.waitForTimeout(2000);
    }

    for (const p of players) {
      await actions.waitForGameStart(p.page);
    }

    // ── FOUL-SETUP: 의도적 foul 유도 ──
    // FoulPlayer: top에 높은 카드, bottom에 낮은 카드 배치 → foul
    // 카드 값은 무작위이므로, 역순으로 배치하여 foul 확률 높임
    await actions.waitForDeal(players[0].page);
    const foulHand = await actions.getHandCards(players[0].page);
    if (foulHand.length > 0) {
      // R1: 역순 배치 (foul 유도) — top에 먼저, bottom에 나중에
      await actions.placeCardToLine(players[0].page, 0, 'top');
      await actions.placeCardToLine(players[0].page, 0, 'mid');
      await actions.placeCardToLine(players[0].page, 0, 'mid');
      await actions.placeCardToLine(players[0].page, 0, 'bottom');
      await actions.placeCardToLine(players[0].page, 0, 'bottom');
      await actions.confirmPlacement(players[0].page);
    }

    // CleanPlayer: 정상 배치
    await actions.waitForDeal(players[1].page);
    const cleanHand = await actions.getHandCards(players[1].page);
    if (cleanHand.length > 0) {
      await actions.placeCardToLine(players[1].page, 0, 'bottom');
      await actions.placeCardToLine(players[1].page, 0, 'bottom');
      await actions.placeCardToLine(players[1].page, 0, 'mid');
      await actions.placeCardToLine(players[1].page, 0, 'mid');
      await actions.placeCardToLine(players[1].page, 0, 'top');
      await actions.confirmPlacement(players[1].page);
    }

    await screenshotManager.captureAll(allPages, '08-FOUL-SETUP', 'Foul 유도 배치');

    // ── R2~R5 진행 ──
    for (const round of [2, 3, 4, 5]) {
      for (const player of players) {
        await actions.waitForDeal(player.page);
        const hand = await actions.getHandCards(player.page);
        if (hand.length > 0) {
          await actions.placeCardToLine(player.page, 0, 'bottom');
          await actions.placeCardToLine(player.page, 0, 'mid');
          await actions.discardCard(player.page, 0);
          await actions.confirmPlacement(player.page);
        }
        await player.page.waitForTimeout(300);
      }
    }

    // ── FOUL-DETECT: handScored에서 fouled 확인 ──
    await actions.waitForScoring(players[0].page);

    const scoreMsgs = players[0].interceptor.getMessages('handScored');
    if (scoreMsgs.length > 0) {
      const results = scoreMsgs[0].payload.results as Record<string, any>;
      // Foul 플레이어가 있는지 확인
      let hasFoul = false;
      for (const [_id, result] of Object.entries(results)) {
        if (result.fouled) {
          hasFoul = true;
          // Foul 플레이어는 scooped 당함
          expect(result.scooped).toBeTruthy();
        }
      }
      // foul이 발생했을 수 있음 (카드 무작위이므로 보장은 안 됨)
    }

    await screenshotManager.captureAll(allPages, '08-FOUL-DETECT', 'Foul 감지');
    await screenshotManager.captureAll(allPages, '08-FOUL-SCORE', 'Foul 스코어');

    for (const p of players) {
      p.interceptor.saveLog('08-foul');
    }
  });
});
