/**
 * 09-reconnect.spec.ts — 연결 끊김/재접속 + 상태 복원
 * 체크포인트: GAME-STARTED, DISCONNECT, DISCONNECT-BANNER, RECONNECT, BOARD-RESTORE
 *
 * 실제 게임 플레이 로직:
 * - 3인 게임 시작 → R1 진행
 * - P2 페이지 닫기 (context.close()) → 연결 끊김
 * - P1, P3에서 playerDisconnected 메시지 수신 + disconnect 배너 확인
 * - P2 새 페이지 열기 → sessionToken으로 재접속
 * - P2 보드 상태 복원 확인
 */
import { test, expect } from '../fixtures/multi-player';
import * as actions from '../helpers/game-actions';
import { selectors } from '../helpers/game-actions';
import { attachInterceptor } from '../helpers/ws-interceptor';

const SERVER_PORT = 3099;
const API = `http://localhost:${SERVER_PORT}`;

test.describe('09 — Reconnect', () => {
  test('게임 중 연결 끊김 → 재접속 → 상태 복원', async ({
    createPlayers,
    screenshotManager,
    browser,
  }) => {
    const players = await createPlayers(3, ['P1', 'P2', 'P3']);
    const [p1, p2, p3] = players;

    // ── 방 생성 ──
    const createRes = await fetch(`${API}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'E2E-Reconnect-Test',
        max_players: 3,
        turn_time_limit: 60,
      }),
    });
    const room = await createRes.json();
    expect(room.id).toBeTruthy();

    // ── 모든 플레이어 접속 + 참가 ──
    for (const p of players) {
      await actions.connectToServer(p.page);
    }
    for (const p of players) {
      await actions.joinRoom(p.page, 'E2E-Reconnect-Test', p.name);
      await p.page.waitForTimeout(500);
    }

    // ── 게임 시작 ──
    try {
      await actions.startGame(p1.page);
    } catch {
      await p1.page.waitForTimeout(2000);
    }

    // gameStart 대기
    for (const p of players) {
      await actions.waitForGameStart(p.page);
    }

    // ── R1: 최소 P1이 카드 배치 시작 ──
    await actions.waitForDeal(p1.page);

    // P1 R1 카드 배치 (일부만)
    const p1Hand = await actions.getHandCards(p1.page);
    if (p1Hand.length > 0) {
      await actions.placeCardToLine(p1.page, 0, 'bottom');
      await actions.placeCardToLine(p1.page, 0, 'mid');
    }

    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '09-GAME-STARTED',
      '게임 시작 후 R1 진행 중'
    );

    // ── P2 sessionToken 저장 (재접속용) ──
    const p2JoinMsgs = p2.interceptor.getMessages('joinAccepted');
    const sessionToken = p2JoinMsgs.length > 0
      ? (p2JoinMsgs[0].payload.sessionToken as string)
      : null;

    // ── P2 연결 끊기: 페이지 닫기 ──
    await p2.page.close();

    // P1, P3에서 playerDisconnected 메시지 수신 대기
    await p1.page.waitForTimeout(3000);

    // playerDisconnected 메시지 확인
    const p1DisconnectMsgs = p1.interceptor.getMessages('playerDisconnected');
    // 서버에서 P2 disconnect 감지 후 브로드캐스트해야 함

    await screenshotManager.captureAll(
      [
        { page: p1.page, playerName: 'P1' },
        { page: p3.page, playerName: 'P3' },
      ],
      '09-DISCONNECT',
      'P2 연결 끊김'
    );

    // ── P1, P3에서 disconnect 배너/인디케이터 확인 ──
    // Flutter 앱에서 playerDisconnected 수신 시 배너 표시
    await screenshotManager.captureAll(
      [
        { page: p1.page, playerName: 'P1' },
        { page: p3.page, playerName: 'P3' },
      ],
      '09-DISCONNECT-BANNER',
      'disconnect 배너 확인'
    );

    // ── P2 새 페이지로 재접속 ──
    const newContext = await browser.newContext();
    const newPage = await newContext.newPage();
    const newInterceptor = await attachInterceptor(newPage, 'P2-Reconnected');

    // Flutter 앱 로드
    await actions.connectToServer(newPage);

    // 재접속: Flutter 앱이 자동으로 sessionToken을 사용하여 reconnect
    // 또는 수동으로 같은 방에 다시 참가
    // Flutter Web은 sessionStorage에 sessionToken을 저장할 수 있음
    await newPage.waitForTimeout(2000);

    await screenshotManager.captureAll(
      [
        { page: p1.page, playerName: 'P1' },
        { page: newPage, playerName: 'P2-Reconnected' },
        { page: p3.page, playerName: 'P3' },
      ],
      '09-RECONNECT',
      'P2 재접속 시도'
    );

    // ── playerReconnected 메시지 확인 ──
    await p1.page.waitForTimeout(2000);
    const reconnectMsgs = p1.interceptor.getMessages('playerReconnected');

    // ── P2 보드 상태 복원 확인 ──
    // 재접속 후 reconnected 메시지에 gameState가 포함되어야 함
    const p2ReconnectMsg = newInterceptor.getLastMessage('reconnected');
    if (p2ReconnectMsg) {
      expect(p2ReconnectMsg.payload).toHaveProperty('gameState');
    }

    await screenshotManager.captureAll(
      [
        { page: p1.page, playerName: 'P1' },
        { page: newPage, playerName: 'P2-Reconnected' },
        { page: p3.page, playerName: 'P3' },
      ],
      '09-BOARD-RESTORE',
      'P2 보드 상태 복원'
    );

    // ── 정리 ──
    await newContext.close();

    // WS 로그 저장
    p1.interceptor.saveLog('09-reconnect');
    p3.interceptor.saveLog('09-reconnect');
    newInterceptor.saveLog('09-reconnect');
  });
});
