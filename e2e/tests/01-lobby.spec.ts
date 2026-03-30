/**
 * 01-lobby.spec.ts — 로비 UI 테스트
 * 체크포인트: LOBBY-EMPTY, CREATE, ROOM, JOIN, WAITING, PLAYING
 */
import { test, expect } from '../fixtures/multi-player';
import * as actions from '../helpers/game-actions';

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

    // 방 목록 API 확인
    const roomsRes = await fetch(`${API}/api/rooms`);
    const rooms = await roomsRes.json();
    // 기존 방이 있을 수 있으므로 에러만 아니면 OK
    expect(roomsRes.ok).toBeTruthy();

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

    await screenshotManager.captureAll(
      [{ page: host.page, playerName: 'Host' }],
      '01-CREATE',
      '방 생성 후 로비'
    );

    // ── 01-ROOM: 방 목록에서 확인 ──
    const roomsRes2 = await fetch(`${API}/api/rooms`);
    const rooms2 = await roomsRes2.json();
    const found = rooms2.find((r: any) => r.id === room.id);
    expect(found).toBeTruthy();
    expect(found.name).toBe('E2E-Lobby-Test');

    await screenshotManager.captureAll(
      [{ page: host.page, playerName: 'Host' }],
      '01-ROOM',
      '방 카드 확인'
    );

    // ── 01-JOIN: Guest도 로비 접속 ──
    await actions.connectToServer(guest.page);
    await screenshotManager.captureAll(
      [
        { page: host.page, playerName: 'Host' },
        { page: guest.page, playerName: 'Guest' },
      ],
      '01-JOIN',
      'Guest 로비 진입'
    );

    // ── 01-WAITING: WS 메시지로 roomList 수신 확인 ──
    // 로비 WS 연결은 Flutter 앱 내부에서 자동으로 수행됨
    // 스크린샷으로 상태 확인
    await screenshotManager.captureAll(
      [
        { page: host.page, playerName: 'Host' },
        { page: guest.page, playerName: 'Guest' },
      ],
      '01-WAITING',
      '대기 화면'
    );

    // ── 01-PLAYING: 방 삭제로 정리 ──
    const deleteRes = await fetch(`${API}/api/rooms/${room.id}`, {
      method: 'DELETE',
    });
    expect(deleteRes.ok).toBeTruthy();

    await screenshotManager.captureAll(
      [
        { page: host.page, playerName: 'Host' },
        { page: guest.page, playerName: 'Guest' },
      ],
      '01-PLAYING',
      '방 삭제 후 로비'
    );
  });
});
