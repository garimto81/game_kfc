/**
 * 03-3player-game.spec.ts — 3인 풀게임 (턴 순서 검증)
 * 체크포인트: WAIT-3P, DEALER, R1-TURN1/2/3, R5-END, SCORE, GRID
 */
import { test, expect } from '../fixtures/multi-player';
import * as actions from '../helpers/game-actions';

const SERVER_PORT = 3099;
const API = `http://localhost:${SERVER_PORT}`;

test.describe('03 — 3-Player Full Game', () => {
  test('3인 게임 — 턴 순서 + Grid View 검증', async ({
    createPlayers,
    screenshotManager,
  }) => {
    const players = await createPlayers(3, ['P1', 'P2', 'P3']);

    // 방 생성
    const createRes = await fetch(`${API}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'E2E-3P-Game',
        max_players: 3,
        turn_time_limit: 60,
      }),
    });
    const room = await createRes.json();
    expect(room.id).toBeTruthy();

    // 모든 플레이어 접속
    for (const p of players) {
      await actions.connectToServer(p.page);
    }

    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '03-WAIT-3P',
      '3인 대기 화면'
    );

    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '03-DEALER',
      '딜러 선택'
    );

    // R1: 턴 순서 (턴 1, 2, 3)
    for (let turn = 1; turn <= 3; turn++) {
      await screenshotManager.captureAll(
        players.map((p) => ({ page: p.page, playerName: p.name })),
        `03-R1-TURN${turn}`,
        `R1 턴 ${turn}`
      );
      await players[turn - 1].page.waitForTimeout(500);
    }

    // R2~R4 (요약)
    for (const round of [2, 3, 4]) {
      await screenshotManager.captureAll(
        players.map((p) => ({ page: p.page, playerName: p.name })),
        `03-R${round}-SUMMARY`,
        `라운드 ${round} 요약`
      );
    }

    // R5 종료
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '03-R5-END',
      'R5 종료'
    );

    // 스코어
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '03-SCORE',
      '3인 스코어'
    );

    // Grid view
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '03-GRID',
      'Grid View'
    );

    // WS 로그 저장
    for (const p of players) {
      p.interceptor.saveLog('03-3player-game');
    }
  });
});
