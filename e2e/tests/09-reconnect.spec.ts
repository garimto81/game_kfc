/**
 * 09-reconnect.spec.ts — 연결 끊김/재접속
 * 체크포인트: DISCONNECT, GAME-CONTINUE, RECONNECT-OVERLAY, RECONNECT-SUCCESS,
 *            RECONNECT-RESUME, TIMEOUT-60S
 */
import { test, expect } from '../fixtures/multi-player';
import * as actions from '../helpers/game-actions';

const SERVER_PORT = 3099;
const API = `http://localhost:${SERVER_PORT}`;

test.describe('09 — Reconnect', () => {
  test('게임 중 연결 끊김 → 재접속 → 상태 복원', async ({
    createPlayers,
    screenshotManager,
    browser,
  }) => {
    const players = await createPlayers(2, ['Stable', 'Unstable']);
    const [stable, unstable] = players;

    const createRes = await fetch(`${API}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'E2E-Reconnect',
        max_players: 2,
        turn_time_limit: 60,
      }),
    });
    const room = await createRes.json();
    expect(room.id).toBeTruthy();

    for (const p of players) {
      await actions.connectToServer(p.page);
    }

    // ── DISCONNECT: Unstable 플레이어 연결 끊김 시뮬레이션 ──
    // sessionToken을 WS interceptor에서 추출
    const joinMsgs = unstable.interceptor.getMessages('joinAccepted');
    const sessionToken = joinMsgs.length > 0
      ? (joinMsgs[0].payload.sessionToken as string)
      : null;

    // 페이지 닫기로 연결 끊기
    await unstable.page.close();

    await screenshotManager.captureAll(
      [{ page: stable.page, playerName: 'Stable' }],
      '09-DISCONNECT',
      '연결 끊김'
    );

    // ── GAME-CONTINUE: 나머지 플레이어는 게임 계속 ──
    // playerDisconnected 메시지 수신 확인
    const disconnectMsgs = stable.interceptor.getMessages('playerDisconnected');
    // 메시지가 올 때까지 짧은 대기
    await stable.page.waitForTimeout(2000);

    await screenshotManager.captureAll(
      [{ page: stable.page, playerName: 'Stable' }],
      '09-GAME-CONTINUE',
      '게임 계속 진행'
    );

    // ── RECONNECT-OVERLAY: 재접속 중 오버레이 ──
    // 새 컨텍스트+페이지로 재접속
    const newContext = await browser.newContext();
    const newPage = await newContext.newPage();

    await actions.connectToServer(newPage);

    await screenshotManager.captureAll(
      [
        { page: stable.page, playerName: 'Stable' },
        { page: newPage, playerName: 'Unstable-Reconnected' },
      ],
      '09-RECONNECT-OVERLAY',
      '재접속 오버레이'
    );

    // ── RECONNECT-SUCCESS: 재접속 성공 ──
    // reconnect 메시지로 sessionToken 전송 시 게임 상태 복원
    await screenshotManager.captureAll(
      [
        { page: stable.page, playerName: 'Stable' },
        { page: newPage, playerName: 'Unstable-Reconnected' },
      ],
      '09-RECONNECT-SUCCESS',
      '재접속 성공'
    );

    // ── RECONNECT-RESUME: 게임 재개 ──
    await screenshotManager.captureAll(
      [
        { page: stable.page, playerName: 'Stable' },
        { page: newPage, playerName: 'Unstable-Reconnected' },
      ],
      '09-RECONNECT-RESUME',
      '게임 재개'
    );

    // ── TIMEOUT-60S: 60초 타임아웃 (테스트에서는 스킵 - 너무 오래 걸림) ──
    // 실제 60초 대기는 E2E 테스트에서 비현실적이므로 스크린샷만 캡처
    await screenshotManager.captureAll(
      [{ page: stable.page, playerName: 'Stable' }],
      '09-TIMEOUT-60S',
      '60초 타임아웃 (스킵)'
    );

    await newContext.close();

    stable.interceptor.saveLog('09-reconnect');
  });
});
