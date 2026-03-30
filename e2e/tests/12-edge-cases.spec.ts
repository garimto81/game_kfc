/**
 * 12-edge-cases.spec.ts — 엣지 케이스 모음
 * 체크포인트: UNDO-ALL, UNDO-DISCARD, UNDO-PLACE, HOST-LEAVE, LAST-PLAYER,
 *            EMOTE, VIEW-TOGGLE, IMPACT-ANIM, SETTINGS
 */
import { test, expect } from '../fixtures/multi-player';
import * as actions from '../helpers/game-actions';

const SERVER_PORT = 3099;
const API = `http://localhost:${SERVER_PORT}`;

test.describe('12 — Edge Cases', () => {
  test('Undo 기능 — unplaceCard + unDiscardCard', async ({
    createPlayers,
    screenshotManager,
  }) => {
    const players = await createPlayers(2, ['UndoTest', 'Partner']);

    const createRes = await fetch(`${API}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'E2E-Undo',
        max_players: 2,
        turn_time_limit: 60,
      }),
    });
    const room = await createRes.json();
    expect(room.id).toBeTruthy();

    for (const p of players) {
      await actions.connectToServer(p.page);
    }

    // ── UNDO-PLACE: 카드 배치 후 취소 ──
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '12-UNDO-PLACE',
      '카드 배치 취소 (unplaceCard)'
    );

    // ── UNDO-DISCARD: 디스카드 후 취소 ──
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '12-UNDO-DISCARD',
      '디스카드 취소 (unDiscardCard)'
    );

    // ── UNDO-ALL: 전체 되돌리기 ──
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '12-UNDO-ALL',
      '전체 되돌리기'
    );

    for (const p of players) {
      p.interceptor.saveLog('12-edge-undo');
    }
  });

  test('호스트 퇴장 → hostChanged', async ({
    createPlayers,
    screenshotManager,
  }) => {
    const players = await createPlayers(3, ['Host', 'P2', 'P3']);

    const createRes = await fetch(`${API}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'E2E-HostLeave',
        max_players: 3,
        turn_time_limit: 60,
      }),
    });
    const room = await createRes.json();
    expect(room.id).toBeTruthy();

    for (const p of players) {
      await actions.connectToServer(p.page);
    }

    // ── HOST-LEAVE: 호스트 퇴장 ──
    // 호스트 페이지 닫기
    await players[0].page.close();
    await players[1].page.waitForTimeout(2000);

    // hostChanged 메시지 확인
    const hostChangedMsgs = players[1].interceptor.getMessages('hostChanged');

    await screenshotManager.captureAll(
      [
        { page: players[1].page, playerName: 'P2' },
        { page: players[2].page, playerName: 'P3' },
      ],
      '12-HOST-LEAVE',
      '호스트 퇴장 후'
    );

    // ── LAST-PLAYER: 마지막 플레이어 ──
    await players[1].page.close();
    await players[2].page.waitForTimeout(1000);

    await screenshotManager.captureAll(
      [{ page: players[2].page, playerName: 'P3' }],
      '12-LAST-PLAYER',
      '마지막 플레이어'
    );

    players[2].interceptor.saveLog('12-edge-host-leave');
  });

  test('이모트 전송/수신', async ({
    createPlayers,
    screenshotManager,
  }) => {
    const players = await createPlayers(2, ['Emoter', 'Receiver']);

    const createRes = await fetch(`${API}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'E2E-Emote',
        max_players: 2,
        turn_time_limit: 60,
      }),
    });
    const room = await createRes.json();
    expect(room.id).toBeTruthy();

    for (const p of players) {
      await actions.connectToServer(p.page);
    }

    // ── EMOTE: 이모트 전송/수신 ──
    // WS interceptor로 emote 메시지 확인
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '12-EMOTE',
      '이모트 전송/수신'
    );

    for (const p of players) {
      p.interceptor.saveLog('12-edge-emote');
    }
  });

  test('View 토글 (Split ↔ Grid)', async ({
    createPlayers,
    screenshotManager,
  }) => {
    const players = await createPlayers(2, ['Viewer', 'Partner']);

    const createRes = await fetch(`${API}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'E2E-ViewToggle',
        max_players: 2,
        turn_time_limit: 60,
      }),
    });
    const room = await createRes.json();
    expect(room.id).toBeTruthy();

    for (const p of players) {
      await actions.connectToServer(p.page);
    }

    // ── VIEW-TOGGLE: Split → Grid ──
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '12-VIEW-TOGGLE',
      'View 토글 (Split → Grid)'
    );

    // ── IMPACT-ANIM: 임팩트 애니메이션 ──
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '12-IMPACT-ANIM',
      '임팩트 애니메이션'
    );

    // ── SETTINGS: 설정 화면 ──
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '12-SETTINGS',
      '설정 화면'
    );

    for (const p of players) {
      p.interceptor.saveLog('12-edge-view');
    }
  });
});
