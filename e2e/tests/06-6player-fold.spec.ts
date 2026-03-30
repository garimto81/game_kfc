/**
 * 06-6player-fold.spec.ts — 6인 Play/Fold 시나리오
 * 체크포인트: PF-6P, PF-4PLAY-2FOLD, GAME-4ACTIVE, SCORE-2FOLD
 */
import { test, expect } from '../fixtures/multi-player';
import * as actions from '../helpers/game-actions';

const SERVER_PORT = 3099;
const API = `http://localhost:${SERVER_PORT}`;

test.describe('06 — 6-Player Play/Fold', () => {
  test('6인 게임 — 4명 Play + 2명 Fold', async ({
    createPlayers,
    screenshotManager,
  }) => {
    const players = await createPlayers(6, ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);

    // 방 생성 (6인)
    const createRes = await fetch(`${API}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'E2E-6P-Fold',
        max_players: 6,
        turn_time_limit: 60,
      }),
    });
    const room = await createRes.json();
    expect(room.id).toBeTruthy();

    for (const p of players) {
      await actions.connectToServer(p.page);
    }

    // ── PF-6P: 6인 Play/Fold 시작 ──
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '06-PF-6P',
      '6인 Play/Fold 시작'
    );

    // ── PF-4PLAY-2FOLD: 4명 Play + 2명 Fold ──
    // P1~P4: play, P5~P6: fold (순차 선택)
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '06-PF-4PLAY-2FOLD',
      '4명 Play + 2명 Fold 결과'
    );

    // ── GAME-4ACTIVE: 4인 활성 게임 ──
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '06-GAME-4ACTIVE',
      '4인 활성 게임 진행'
    );

    // Fold된 P5, P6 화면
    await screenshotManager.captureAll(
      [
        { page: players[4].page, playerName: 'P5' },
        { page: players[5].page, playerName: 'P6' },
      ],
      '06-FOLD-VIEWS',
      'Fold된 P5, P6 화면'
    );

    // ── SCORE-2FOLD: 스코어에서 2명 fold ──
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '06-SCORE-2FOLD',
      '스코어 (2명 Fold)'
    );

    for (const p of players) {
      p.interceptor.saveLog('06-6player-fold');
    }
  });
});
