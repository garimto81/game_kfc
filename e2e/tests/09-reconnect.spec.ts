/**
 * 09-reconnect.spec.ts — 재연결 (WS 하이브리드)
 *
 * Playwright: 스크린샷 캡처
 * WS: 게임 조작 + 연결 끊기/재연결
 *
 * 시나리오:
 * 1. 3인 게임 시작 → R1 진행
 * 2. P2 WS 연결 끊기
 * 3. P1, P3에서 playerDisconnected 확인
 * 4. P2 새 WS 클라이언트로 sessionToken 재접속
 * 5. reconnected + gameState 복원 확인
 */
import { test, expect } from '../fixtures/multi-player';
import { connectToServer } from '../helpers/game-actions';
import { WSGameClient, sleep } from '../helpers/ws-game-client';
import { decidePlacement, extractBoard } from '../helpers/ws-bot-strategy';

test.describe('09 — Reconnect (WS Hybrid)', () => {
  test('게임 중 연결 끊김 → 재접속 → 상태 복원', async ({
    createHybridPlayers,
    screenshotManager,
  }) => {
    const players = await createHybridPlayers(3, ['P1', 'P2', 'P3']);
    const [p1, p2, p3] = players;
    const allPages = players.map((p) => ({ page: p.page, playerName: p.name }));

    // ── Playwright: Flutter 앱 로드 ──
    for (const p of players) {
      await connectToServer(p.page);
    }

    // ── WS: 방 생성 + 참가 ──
    const room = await WSGameClient.createRoom('E2E-Reconnect-Test', 3, 60);
    expect(room.id).toBeTruthy();

    await sleep(1000);

    for (const p of players) {
      await p.ws.join(room.id);
      await sleep(300);
    }

    // ── WS: 게임 시작 ──
    p1.ws.send('startGame');

    for (const p of players) {
      await p.ws.waitFor('dealerSelection');
    }
    for (const p of players) {
      await p.ws.waitFor('gameStart');
    }

    // ── R1: P1이 첫 번째 턴에서 카드 배치 시작 ──
    // 첫 번째 턴 플레이어에게 dealCards가 전송됨
    let firstTurnClient: WSGameClient | null = null;
    for (const p of players) {
      try {
        const dealMsg = await p.ws.waitFor('dealCards', 5000);
        const cards = dealMsg.payload.cards;
        const board = extractBoard(p.ws);
        const decision = decidePlacement(cards, board, 1, false, 3);

        // R1 일부만 배치 (확인 전에 끊기 테스트를 위해)
        for (const pl of decision.placements) {
          p.ws.send('placeCard', { card: pl.card, line: pl.line });
        }
        p.ws.send('confirmPlacement');
        firstTurnClient = p.ws;
        break;
      } catch {
        continue;
      }
    }

    await sleep(1500);
    await screenshotManager.captureAll(allPages, '09-GAME-STARTED', '게임 시작 R1 진행');

    // ── P2 sessionToken 저장 ──
    const p2SessionToken = p2.ws.sessionToken;
    expect(p2SessionToken).toBeTruthy();

    // ── P2 WS 연결 끊기 ──
    p2.ws.close();

    // P1, P3에서 playerDisconnected 메시지 수신 대기
    await sleep(3000);

    const p1DisconnectMsgs = p1.ws.getMessages('playerDisconnected');
    const p3DisconnectMsgs = p3.ws.getMessages('playerDisconnected');

    // 최소 한 쪽은 playerDisconnected를 받아야 함
    expect(p1DisconnectMsgs.length + p3DisconnectMsgs.length).toBeGreaterThan(0);

    await screenshotManager.captureAll(
      [
        { page: p1.page, playerName: 'P1' },
        { page: p3.page, playerName: 'P3' },
      ],
      '09-DISCONNECT',
      'P2 연결 끊김'
    );

    await screenshotManager.captureAll(
      [
        { page: p1.page, playerName: 'P1' },
        { page: p3.page, playerName: 'P3' },
      ],
      '09-DISCONNECT-BANNER',
      'disconnect 배너'
    );

    // ── P2 새 WS 클라이언트로 재접속 ──
    const p2New = new WSGameClient('P2-Reconnected');
    const reconnectMsg = await p2New.reconnect(room.id, p2SessionToken!);

    expect(reconnectMsg.payload.playerId).toBeTruthy();
    expect(reconnectMsg.payload.gameState).toBeTruthy();

    // P1, P3에서 playerReconnected 확인
    await sleep(2000);
    const p1ReconnectMsgs = p1.ws.getMessages('playerReconnected');
    expect(p1ReconnectMsgs.length).toBeGreaterThan(0);

    await screenshotManager.captureAll(
      [
        { page: p1.page, playerName: 'P1' },
        { page: p2.page, playerName: 'P2' },
        { page: p3.page, playerName: 'P3' },
      ],
      '09-RECONNECT',
      'P2 재접속'
    );

    // ── 보드 상태 복원 검증 ──
    const gameState = reconnectMsg.payload.gameState;
    expect(gameState).toHaveProperty('players');

    await screenshotManager.captureAll(
      [
        { page: p1.page, playerName: 'P1' },
        { page: p2.page, playerName: 'P2' },
        { page: p3.page, playerName: 'P3' },
      ],
      '09-BOARD-RESTORE',
      'P2 보드 복원'
    );

    // ── 정리 ──
    p2New.close();
  });
});
