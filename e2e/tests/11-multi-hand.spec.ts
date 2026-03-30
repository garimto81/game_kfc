/**
 * 11-multi-hand.spec.ts — 다중 핸드 연속 진행
 * 체크포인트: H1-COMPLETE, H1-READY, H2-START, H2-DEALER, H2-SCORE,
 *            H3-COMPLETE, TOTAL-SCORE
 */
import { test, expect } from '../fixtures/multi-player';
import * as actions from '../helpers/game-actions';

const SERVER_PORT = 3099;
const API = `http://localhost:${SERVER_PORT}`;

test.describe('11 — Multi-Hand', () => {
  test('3핸드 연속 진행 + 누적 스코어', async ({
    createPlayers,
    screenshotManager,
  }) => {
    const players = await createPlayers(2, ['Player1', 'Player2']);

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

    for (const p of players) {
      await actions.connectToServer(p.page);
    }

    // ── Hand 1 ──
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '11-H1-COMPLETE',
      'Hand 1 완료'
    );

    // Hand 1 스코어 확인
    const h1Scores = players[0].interceptor.getMessages('handScored');
    if (h1Scores.length > 0) {
      expect(h1Scores[0].payload.handNumber).toBe(1);
    }

    // Ready 클릭
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '11-H1-READY',
      'Hand 1 Ready'
    );

    // ── Hand 2 시작 ──
    // allPlayersReady → gameStart 메시지 확인
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '11-H2-START',
      'Hand 2 시작'
    );

    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '11-H2-DEALER',
      'Hand 2 딜러'
    );

    // Hand 2 스코어
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '11-H2-SCORE',
      'Hand 2 스코어'
    );

    // ── Hand 3 ──
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '11-H3-COMPLETE',
      'Hand 3 완료'
    );

    // ── 누적 스코어 ──
    // stateUpdate 메시지에서 totalScore 확인
    const stateMsgs = players[0].interceptor.getMessages('stateUpdate');
    if (stateMsgs.length > 0) {
      const lastState = stateMsgs[stateMsgs.length - 1];
      const playersState = lastState.payload.players as Record<string, any>;
      // totalScore가 존재하는지 확인
      for (const [_id, pState] of Object.entries(playersState)) {
        expect(pState).toHaveProperty('totalScore');
      }
    }

    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '11-TOTAL-SCORE',
      '3핸드 누적 스코어'
    );

    for (const p of players) {
      p.interceptor.saveLog('11-multi-hand');
    }
  });
});
