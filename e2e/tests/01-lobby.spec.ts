/**
 * 01-lobby.spec.ts — 로비 UI 테스트 (WS 하이브리드)
 *
 * Playwright: Flutter 앱 로드 + 스크린샷
 * WS: WSGameClient.createRoom/listRooms로 REST API 검증
 *
 * 로비는 게임 조작이 필요 없으므로 REST API + 스크린샷 위주.
 */
import { test, expect } from '../fixtures/multi-player';
import { connectToServer } from '../helpers/game-actions';
import { WSGameClient, sleep } from '../helpers/ws-game-client';

const SERVER_PORT = parseInt(process.env.SERVER_PORT || '8098');
const API = `http://localhost:${SERVER_PORT}`;

test.describe('01 — Lobby (WS Hybrid)', () => {
  test('로비 진입 → 방 생성 → 참가 → 게임 시작 전체 흐름', async ({
    createHybridPlayers,
    screenshotManager,
  }) => {
    const players = await createHybridPlayers(2, ['Host', 'Guest']);
    const [host, guest] = players;

    // ── 01-LOBBY-EMPTY: 빈 로비 ──
    await connectToServer(host.page);
    await screenshotManager.captureAll(
      [{ page: host.page, playerName: 'Host' }],
      '01-LOBBY-EMPTY',
      '빈 로비 화면'
    );

    // 방 목록 API 확인
    const roomsRes = await fetch(`${API}/api/rooms`);
    expect(roomsRes.ok).toBeTruthy();

    // ── 01-CREATE: REST API로 방 생성 ──
    const room = await WSGameClient.createRoom('E2E-Lobby-Test', 3, 60);
    expect(room.id).toBeTruthy();
    expect(room.name).toBe('E2E-Lobby-Test');

    // Flutter 앱이 로비 WS로 roomCreated 수신할 시간
    await sleep(1500);

    await screenshotManager.captureAll(
      [{ page: host.page, playerName: 'Host' }],
      '01-CREATE',
      '방 생성 후 로비'
    );

    // ── 01-ROOM: 방 목록에서 생성된 방 확인 ──
    const rooms2 = await WSGameClient.listRooms();
    const found = rooms2.find((r: any) => r.id === room.id);
    expect(found).toBeTruthy();
    expect(found.name).toBe('E2E-Lobby-Test');

    await screenshotManager.captureAll(
      [{ page: host.page, playerName: 'Host' }],
      '01-ROOM',
      '방 카드 확인'
    );

    // ── 01-JOIN: Guest도 로비 접속 ──
    await connectToServer(guest.page);
    await sleep(1500);

    await screenshotManager.captureAll(
      [
        { page: host.page, playerName: 'Host' },
        { page: guest.page, playerName: 'Guest' },
      ],
      '01-JOIN',
      'Guest 로비 진입'
    );

    // ── 01-WAITING: 대기 화면 ──
    await screenshotManager.captureAll(
      [
        { page: host.page, playerName: 'Host' },
        { page: guest.page, playerName: 'Guest' },
      ],
      '01-WAITING',
      '대기 화면'
    );

    // ── 01-CLEANUP: 방 삭제 ──
    const deleteRes = await fetch(`${API}/api/rooms/${room.id}`, {
      method: 'DELETE',
    });
    expect(deleteRes.ok).toBeTruthy();

    await sleep(500);

    const rooms3 = await WSGameClient.listRooms();
    const deleted = rooms3.find((r: any) => r.id === room.id);
    expect(deleted).toBeFalsy();

    await screenshotManager.captureAll(
      [
        { page: host.page, playerName: 'Host' },
        { page: guest.page, playerName: 'Guest' },
      ],
      '01-CLEANUP',
      '방 삭제 후 로비'
    );
  });
});
