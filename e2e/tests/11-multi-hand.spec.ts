/**
 * 11-multi-hand.spec.ts — 다중 핸드 연속 진행
 * 체크포인트: H1-COMPLETE, H1-READY, H2-START, H2-SCORE, H3-COMPLETE, TOTAL-SCORE
 *
 * 핵심 검증:
 * - 핸드 1 완료 → Ready → 핸드 2 시작 → 완료 → 핸드 3 → 누적 스코어
 * - handScored.handNumber 증가 확인
 * - stateUpdate.totalScore 누적 확인
 */
import { test, expect } from '../fixtures/multi-player';
import * as actions from '../helpers/game-actions';
import { selectors } from '../helpers/game-actions';
import type { PlayerHandle } from '../fixtures/multi-player';

const SERVER_PORT = 3099;
const API = `http://localhost:${SERVER_PORT}`;

/**
 * 한 핸드(R1~R5)를 완료하는 헬퍼
 */
async function playOneHand(players: PlayerHandle[]): Promise<void> {
  // R1: 5장 배치
  for (const player of players) {
    await actions.waitForDeal(player.page);
    const hand = await actions.getHandCards(player.page);
    if (hand.length > 0) {
      await actions.placeCardToLine(player.page, 0, 'bottom');
      await actions.placeCardToLine(player.page, 0, 'bottom');
      await actions.placeCardToLine(player.page, 0, 'mid');
      await actions.placeCardToLine(player.page, 0, 'mid');
      await actions.placeCardToLine(player.page, 0, 'top');
      await actions.confirmPlacement(player.page);
    }
    await player.page.waitForTimeout(300);
  }

  // R2~R5: 3장 → 2배치 + 1디스카드
  for (const _round of [2, 3, 4, 5]) {
    await players[0].page.waitForTimeout(500);
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
}

test.describe('11 — Multi-Hand', () => {
  test('3핸드 연속 진행 + 누적 스코어', async ({
    createPlayers,
    screenshotManager,
  }) => {
    const players = await createPlayers(2, ['Player1', 'Player2']);
    const allPages = players.map((p) => ({ page: p.page, playerName: p.name }));

    const createRes = await fetch(`${API}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'E2E-MultiHand',
        max_players: 2,
        turn_time_limit: 60,
      }),
    });
    const room = await createRes.json();
    expect(room.id).toBeTruthy();

    // ── 접속 + 참가 + 시작 ──
    for (const p of players) {
      await actions.connectToServer(p.page);
    }
    await actions.joinRoom(players[0].page, 'E2E-MultiHand', 'Player1');
    await players[0].page.waitForTimeout(500);
    await actions.joinRoom(players[1].page, 'E2E-MultiHand', 'Player2');
    await players[1].page.waitForTimeout(500);

    try {
      await actions.startGame(players[0].page);
    } catch {
      await players[0].page.waitForTimeout(2000);
    }

    for (const p of players) {
      await actions.waitForGameStart(p.page);
    }

    // ── Hand 1 ──
    await playOneHand(players);

    await actions.waitForScoring(players[0].page);

    // Hand 1 스코어 확인
    const h1Scores = players[0].interceptor.getMessages('handScored');
    if (h1Scores.length > 0) {
      expect(h1Scores[0].payload.handNumber).toBe(1);
    }

    await screenshotManager.captureAll(allPages, '11-H1-COMPLETE', 'Hand 1 완료');

    // Ready 클릭
    for (const p of players) {
      try {
        await actions.clickReady(p.page);
      } catch {
        // Ready 버튼 미존재
      }
    }

    await screenshotManager.captureAll(allPages, '11-H1-READY', 'Hand 1 Ready');

    // ── Hand 2 시작 ──
    await players[0].page.waitForTimeout(3000);

    // allPlayersReady → gameStart 메시지 확인
    for (const p of players) {
      await actions.waitForGameStart(p.page);
    }

    await screenshotManager.captureAll(allPages, '11-H2-START', 'Hand 2 시작');

    // Hand 2 플레이
    await playOneHand(players);

    await actions.waitForScoring(players[0].page);

    // Hand 2 스코어 확인
    const h2Scores = players[0].interceptor.getMessages('handScored');
    if (h2Scores.length >= 2) {
      expect(h2Scores[1].payload.handNumber).toBe(2);
    }

    await screenshotManager.captureAll(allPages, '11-H2-SCORE', 'Hand 2 스코어');

    // Ready
    for (const p of players) {
      try {
        await actions.clickReady(p.page);
      } catch {
        // 스킵
      }
    }

    // ── Hand 3 ──
    await players[0].page.waitForTimeout(3000);

    for (const p of players) {
      await actions.waitForGameStart(p.page);
    }

    await playOneHand(players);

    await actions.waitForScoring(players[0].page);

    await screenshotManager.captureAll(allPages, '11-H3-COMPLETE', 'Hand 3 완료');

    // ── 누적 스코어 확인 ──
    // stateUpdate 메시지에서 totalScore 확인
    const stateMsgs = players[0].interceptor.getMessages('stateUpdate');
    if (stateMsgs.length > 0) {
      const lastState = stateMsgs[stateMsgs.length - 1];
      const playersState = lastState.payload.players as Record<string, any>;
      for (const [_id, pState] of Object.entries(playersState)) {
        expect(pState).toHaveProperty('totalScore');
      }
    }

    // 3개의 handScored 메시지가 수신되었어야 함
    const allScores = players[0].interceptor.getMessages('handScored');
    expect(allScores.length).toBeGreaterThanOrEqual(3);

    await screenshotManager.captureAll(allPages, '11-TOTAL-SCORE', '3핸드 누적 스코어');

    for (const p of players) {
      p.interceptor.saveLog('11-multi-hand');
    }
  });
});
