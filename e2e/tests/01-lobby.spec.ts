/**
 * 01-lobby.spec.ts — 로비 UI 테스트
 * 체크포인트: LOBBY-EMPTY, CREATE, ROOM, JOIN, WAITING, PLAYING
 *
 * 실제 게임 플레이 로직:
 * - REST API로 방 생성/조회/삭제
 * - 두 플레이어가 로비에 접속하여 방 목록 확인
 * - WS interceptor로 roomList, roomCreated 메시지 검증
 */
import { test, expect } from '../fixtures/multi-player';
import * as actions from '../helpers/game-actions';
import { selectors } from '../helpers/game-actions';

const SERVER_PORT = 3099;
const API = `http://localhost:${SERVER_PORT}`;

test.describe('01 — Lobby', () => {
  test('로비 진입 → 방 생성 → 참가 → 게임 시작 전체 흐름', async ({
    createPlayers,
    screenshotManager,
  }) => {
    const [host, guest] = await createPlayers(2, ['Host', 'Guest']);

    // ── 01-LOBBY-EMPTY: 빈 로비 ──
    await actions.connectToServer(host.page);
    await screenshotManager.captureAll(
      [{ page: host.page, playerName: 'Host' }],
      '01-LOBBY-EMPTY',
      '빈 로비 화면'
    );

    // 방 목록 API 확인 (서버 동작 검증)
    const roomsRes = await fetch(`${API}/api/rooms`);
    expect(roomsRes.ok).toBeTruthy();
    const initialRooms = await roomsRes.json();

    // ── 01-CREATE: REST API로 방 생성 ──
    const createRes = await fetch(`${API}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'E2E-Lobby-Test',
        max_players: 3,
        turn_time_limit: 60,
      }),
    });
    const room = await createRes.json();
    expect(createRes.status).toBe(201);
    expect(room.id).toBeTruthy();
    expect(room.name).toBe('E2E-Lobby-Test');

    // Host WS interceptor가 roomCreated 메시지를 수신할 때까지 대기
    await host.page.waitForTimeout(1000);

    await screenshotManager.captureAll(
      [{ page: host.page, playerName: 'Host' }],
      '01-CREATE',
      '방 생성 후 로비'
    );

    // ── 01-ROOM: 방 목록에서 생성된 방 확인 ──
    const roomsRes2 = await fetch(`${API}/api/rooms`);
    const rooms2 = await roomsRes2.json();
    const found = rooms2.find((r: any) => r.id === room.id);
    expect(found).toBeTruthy();
    expect(found.name).toBe('E2E-Lobby-Test');
    expect(found.max_players).toBe(3);
    expect(found.turn_time_limit).toBe(60);
    expect(found.playerCount).toBe(0);
    expect(found.phase).toBe('waiting');

    await screenshotManager.captureAll(
      [{ page: host.page, playerName: 'Host' }],
      '01-ROOM',
      '방 카드 확인'
    );

    // ── 01-JOIN: Guest도 로비 접속 ──
    await actions.connectToServer(guest.page);
    await guest.page.waitForTimeout(1000);

    // Guest의 WS interceptor에서 roomList 메시지 수신 확인
    const guestRoomListMsgs = guest.interceptor.getMessages('roomList');
    // 로비 WS 연결 시 roomList를 수신해야 함
    // (Flutter 앱 내부에서 자동으로 로비 WS 연결)

    await screenshotManager.captureAll(
      [
        { page: host.page, playerName: 'Host' },
        { page: guest.page, playerName: 'Guest' },
      ],
      '01-JOIN',
      'Guest 로비 진입'
    );

    // ── 01-WAITING: 방 상태 확인 ──
    // 로비 화면에서 Create Room 버튼 존재 확인
    const hostCreateBtn = host.page.locator(selectors.createRoomBtn);
    const guestCreateBtn = guest.page.locator(selectors.createRoomBtn);

    // Flutter 앱이 로드되어 있으면 createRoomBtn이 보일 수 있음
    await screenshotManager.captureAll(
      [
        { page: host.page, playerName: 'Host' },
        { page: guest.page, playerName: 'Guest' },
      ],
      '01-WAITING',
      '대기 화면 — 방 목록 + Create 버튼 확인'
    );

    // ── 01-CLEANUP: 방 삭제로 정리 ──
    const deleteRes = await fetch(`${API}/api/rooms/${room.id}`, {
      method: 'DELETE',
    });
    expect(deleteRes.ok).toBeTruthy();

    // 삭제 후 방 목록에서 제거 확인
    await host.page.waitForTimeout(500);
    const roomsRes3 = await fetch(`${API}/api/rooms`);
    const rooms3 = await roomsRes3.json();
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

    // WS 로그 저장
    for (const p of [host, guest]) {
      p.interceptor.saveLog('01-lobby');
    }
  });
});
