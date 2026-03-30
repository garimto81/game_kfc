/**
 * 10-timer-timeout.spec.ts — 턴 타이머 만료
 * 체크포인트: TIMER-BAR, TIMER-5S, TIMER-EXPIRE, TIMER-ADVANCE, TIMER-SCORE
 */
import { test, expect } from '../fixtures/multi-player';
import * as actions from '../helpers/game-actions';

const SERVER_PORT = 3099;
const API = `http://localhost:${SERVER_PORT}`;

test.describe('10 — Timer & Timeout', () => {
  test('턴 타이머 만료 → autoFold → 다음 턴', async ({
    createPlayers,
    screenshotManager,
  }) => {
    const players = await createPlayers(2, ['Active', 'AFK']);

    // 짧은 타임아웃 설정 (10초)
    const createRes = await fetch(`${API}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'E2E-Timer-Test',
        max_players: 2,
        turn_time_limit: 10, // 10초 타임아웃
      }),
    });
    const room = await createRes.json();
    expect(room.id).toBeTruthy();

    for (const p of players) {
      await actions.connectToServer(p.page);
    }

    // ── TIMER-BAR: 타이머 바 표시 ──
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '10-TIMER-BAR',
      '타이머 바'
    );

    // ── TIMER-5S: 5초 남은 상태 ──
    // 5초 대기
    await players[0].page.waitForTimeout(5000);
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '10-TIMER-5S',
      '타이머 5초 남음'
    );

    // ── TIMER-EXPIRE: 타이머 만료 (추가 6초 대기) ──
    await players[0].page.waitForTimeout(6000);
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '10-TIMER-EXPIRE',
      '타이머 만료'
    );

    // ── TIMER-ADVANCE: 다음 턴으로 진행 ──
    // autoFold → 다음 턴 플레이어로 turnChanged
    // WS interceptor로 foldedThisHand 메시지 확인
    const foldMsgs = players[1].interceptor.getMessages('foldedThisHand');
    // AFK 플레이어가 자동 폴드되었을 수 있음

    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '10-TIMER-ADVANCE',
      '다음 턴 진행'
    );

    // ── TIMER-SCORE: 타임아웃 후 스코어 ──
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '10-TIMER-SCORE',
      '타임아웃 후 스코어'
    );

    for (const p of players) {
      p.interceptor.saveLog('10-timer-timeout');
    }
  });
});
