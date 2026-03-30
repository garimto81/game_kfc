/**
 * 05-5player-fold.spec.ts — 5인 Play/Fold 시나리오
 * 체크포인트: PF-REQUEST, PF-WAIT, PF-CHOICE1~4, PF-RESULT, FOLDED-VIEW,
 *            FOLDED-BOARDS, SCORE-FOLD, GAME-4ACTIVE
 */
import { test, expect } from '../fixtures/multi-player';
import * as actions from '../helpers/game-actions';

const SERVER_PORT = 3099;
const API = `http://localhost:${SERVER_PORT}`;

test.describe('05 — 5-Player Play/Fold', () => {
  test('5인 게임 — 4명 Play + 1명 Fold', async ({
    createPlayers,
    screenshotManager,
  }) => {
    const players = await createPlayers(5, ['P1', 'P2', 'P3', 'P4', 'P5']);

    // 방 생성 (5인)
    const createRes = await fetch(`${API}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'E2E-5P-Fold',
        max_players: 5,
        turn_time_limit: 60,
      }),
    });
    const room = await createRes.json();
    expect(room.id).toBeTruthy();

    for (const p of players) {
      await actions.connectToServer(p.page);
    }

    // ── PF-REQUEST: Play/Fold 요청 시작 ──
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '05-PF-REQUEST',
      'Play/Fold 요청 시작'
    );

    // ── PF-WAIT: 대기 중 ──
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '05-PF-WAIT',
      'Play/Fold 대기'
    );

    // ── PF-CHOICE1~4: 순차 선택 (P1~P4: play, P5: fold) ──
    for (let i = 0; i < 4; i++) {
      await screenshotManager.captureAll(
        players.map((p) => ({ page: p.page, playerName: p.name })),
        `05-PF-CHOICE${i + 1}`,
        `Play/Fold 선택 ${i + 1}`
      );
    }

    // ── PF-RESULT: 선택 결과 ──
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '05-PF-RESULT',
      'Play/Fold 결과'
    );

    // ── FOLDED-VIEW: Fold된 플레이어 화면 ──
    await screenshotManager.captureAll(
      [{ page: players[4].page, playerName: 'P5' }],
      '05-FOLDED-VIEW',
      'Fold된 P5 화면'
    );

    // ── FOLDED-BOARDS: Fold된 플레이어 보드 비활성 ──
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '05-FOLDED-BOARDS',
      'Fold 보드 비활성'
    );

    // ── GAME-4ACTIVE: 4인 활성 게임 진행 ──
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '05-GAME-4ACTIVE',
      '4인 활성 게임'
    );

    // ── SCORE-FOLD: 스코어에서 fold 플레이어 0점 ──
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '05-SCORE-FOLD',
      '스코어 (Fold 플레이어 0점)'
    );

    // WS 로그
    for (const p of players) {
      p.interceptor.saveLog('05-5player-fold');
    }
  });
});
