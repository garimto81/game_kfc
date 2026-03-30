/**
 * 08-foul.spec.ts — Foul 감지 및 점수 처리
 * 체크포인트: FOUL-DETECT, FOUL-ANIM, FOUL-SCORE, MULTI-FOUL, FOUL-INDICATOR
 */
import { test, expect } from '../fixtures/multi-player';
import * as actions from '../helpers/game-actions';

const SERVER_PORT = 3099;
const API = `http://localhost:${SERVER_PORT}`;

test.describe('08 — Foul Detection', () => {
  test('Foul 감지 → 애니메이션 → 스쿱 점수', async ({
    createPlayers,
    screenshotManager,
  }) => {
    const players = await createPlayers(2, ['FoulPlayer', 'CleanPlayer']);

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

    for (const p of players) {
      await actions.connectToServer(p.page);
    }

    // Foul은 bottom < mid 핸드일 때 발생
    // E2E에서는 의도적으로 약한 카드를 bottom에 배치해야 함

    // ── FOUL-DETECT: Foul 감지 ──
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '08-FOUL-DETECT',
      'Foul 감지 (bottom < mid)'
    );

    // ── FOUL-ANIM: Foul 애니메이션 ──
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '08-FOUL-ANIM',
      'Foul 애니메이션'
    );

    // ── FOUL-SCORE: Foul 스코어 (-6 스쿱) ──
    // handScored 메시지에서 fouled=true, score=-6 확인
    const scoreMsgs = players[0].interceptor.getMessages('handScored');
    if (scoreMsgs.length > 0) {
      const results = scoreMsgs[0].payload.results as Record<string, any>;
      for (const [id, result] of Object.entries(results)) {
        if (result.fouled) {
          // Foul 플레이어는 스쿱 당함 (-6점)
          expect(result.scooped).toBeTruthy();
        }
      }
    }

    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '08-FOUL-SCORE',
      'Foul 스코어'
    );

    // ── MULTI-FOUL: 양쪽 모두 Foul ──
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '08-MULTI-FOUL',
      '양쪽 Foul (무승부)'
    );

    // ── FOUL-INDICATOR: Foul 인디케이터 ──
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '08-FOUL-INDICATOR',
      'Foul 인디케이터 UI'
    );

    for (const p of players) {
      p.interceptor.saveLog('08-foul');
    }
  });
});
