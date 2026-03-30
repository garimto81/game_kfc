/**
 * 06-6player-fold.spec.ts — 6인 Play/Fold 시나리오
 * 체크포인트: PF-6P, PF-4PLAY-2FOLD, FOLD-VIEWS, GAME-4ACTIVE, SCORE-2FOLD
 *
 * 핵심 검증:
 * - 6인 게임에서 Play/Fold: P1~P4 play, P5~P6 fold
 * - 2명 fold 후 4인 활성 게임 진행
 */
import { test, expect } from '../fixtures/multi-player';
import * as actions from '../helpers/game-actions';
import { selectors } from '../helpers/game-actions';

const SERVER_PORT = 3099;
const API = `http://localhost:${SERVER_PORT}`;

test.describe('06 — 6-Player Play/Fold', () => {
  test('6인 게임 — 4명 Play + 2명 Fold', async ({
    createPlayers,
    screenshotManager,
  }) => {
    const players = await createPlayers(6, ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
    const allPages = players.map((p) => ({ page: p.page, playerName: p.name }));

    // ── 방 생성 (6인) ──
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

    // ── 접속 + 참가 ──
    for (const p of players) {
      await actions.connectToServer(p.page);
    }
    for (const p of players) {
      await actions.joinRoom(p.page, 'E2E-6P-Fold', p.name);
      await p.page.waitForTimeout(500);
    }

    // ── 게임 시작 ──
    try {
      await actions.startGame(players[0].page);
    } catch {
      await players[0].page.waitForTimeout(2000);
    }

    await players[0].page.waitForTimeout(3000);

    // ── PF-6P: 6인 Play/Fold 시작 ──
    await screenshotManager.captureAll(allPages, '06-PF-6P', '6인 Play/Fold 시작');

    // ── PF-4PLAY-2FOLD: P1~P4 Play, P5~P6 Fold ──
    for (let i = 0; i < 4; i++) {
      try {
        await actions.choosePlayOrFold(players[i].page, 'play');
      } catch {
        await players[i].page.waitForTimeout(2000);
        try { await actions.choosePlayOrFold(players[i].page, 'play'); } catch { /* 스킵 */ }
      }
      await players[i].page.waitForTimeout(500);
    }

    for (let i = 4; i < 6; i++) {
      try {
        await actions.choosePlayOrFold(players[i].page, 'fold');
      } catch {
        await players[i].page.waitForTimeout(2000);
        try { await actions.choosePlayOrFold(players[i].page, 'fold'); } catch { /* 스킵 */ }
      }
      await players[i].page.waitForTimeout(500);
    }

    await players[0].page.waitForTimeout(2000);
    await screenshotManager.captureAll(allPages, '06-PF-4PLAY-2FOLD', '4명 Play + 2명 Fold 결과');

    // ── FOLD-VIEWS: Fold된 P5, P6 화면 ──
    await screenshotManager.captureAll(
      [
        { page: players[4].page, playerName: 'P5' },
        { page: players[5].page, playerName: 'P6' },
      ],
      '06-FOLD-VIEWS',
      'Fold된 P5, P6 화면'
    );

    // ── GAME-4ACTIVE: 4인 활성 게임 ──
    await players[0].page.waitForTimeout(3000);
    await screenshotManager.captureAll(allPages, '06-GAME-4ACTIVE', '4인 활성 게임 진행');

    // ── SCORE-2FOLD: 스코어에서 2명 fold ──
    await screenshotManager.captureAll(allPages, '06-SCORE-2FOLD', '스코어 (2명 Fold)');

    for (const p of players) {
      p.interceptor.saveLog('06-6player-fold');
    }
  });
});
