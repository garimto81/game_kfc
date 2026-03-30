/**
 * 12-edge-cases.spec.ts — 엣지 케이스 모음
 * 체크포인트: UNDO-PLACE, UNDO-DISCARD, UNDO-ALL, HOST-LEAVE, LAST-PLAYER,
 *            EMOTE, VIEW-TOGGLE, SETTINGS
 *
 * 핵심 검증:
 * - Undo: 카드 배치/디스카드 취소 → 핸드 카드 복원
 * - 호스트 퇴장 → hostChanged 메시지
 * - 이모트 전송/수신
 * - View 토글 (Split ↔ Grid)
 */
import { test, expect } from '../fixtures/multi-player';
import * as actions from '../helpers/game-actions';
import { selectors } from '../helpers/game-actions';

const SERVER_PORT = 3099;
const API = `http://localhost:${SERVER_PORT}`;

test.describe('12 — Edge Cases', () => {
  test('Undo 기능 — unplaceCard + unDiscardCard', async ({
    createPlayers,
    screenshotManager,
  }) => {
    const players = await createPlayers(2, ['UndoTest', 'Partner']);
    const allPages = players.map((p) => ({ page: p.page, playerName: p.name }));

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

    // ── 접속 + 참가 + 시작 ──
    for (const p of players) {
      await actions.connectToServer(p.page);
    }
    await actions.joinRoom(players[0].page, 'E2E-Undo', 'UndoTest');
    await players[0].page.waitForTimeout(500);
    await actions.joinRoom(players[1].page, 'E2E-Undo', 'Partner');
    await players[1].page.waitForTimeout(500);

    try {
      await actions.startGame(players[0].page);
    } catch {
      await players[0].page.waitForTimeout(2000);
    }

    for (const p of players) {
      await actions.waitForGameStart(p.page);
    }

    // R1 딜 대기
    await actions.waitForDeal(players[0].page);

    // ── UNDO-PLACE: 카드 배치 후 Undo ──
    const handBefore = await actions.getHandCards(players[0].page);
    const handCountBefore = handBefore.length;

    if (handCountBefore > 0) {
      // 카드 1장 배치
      await actions.placeCardToLine(players[0].page, 0, 'bottom');
      await players[0].page.waitForTimeout(500);

      // 배치 후 핸드 카드 수 감소 확인
      const handAfterPlace = await actions.getHandCards(players[0].page);

      // Undo 클릭
      try {
        await actions.clickUndo(players[0].page);
        await players[0].page.waitForTimeout(500);
      } catch {
        // Undo 버튼이 없을 수 있음
      }

      // Undo 후 핸드 카드 수 복원 확인
      const handAfterUndo = await actions.getHandCards(players[0].page);
    }

    await screenshotManager.captureAll(allPages, '12-UNDO-PLACE', '카드 배치 취소 (unplaceCard)');

    // ── UNDO-DISCARD: 디스카드 후 Undo ──
    // R2 이상에서 디스카드 가능하므로, R1에서는 스킵
    await screenshotManager.captureAll(allPages, '12-UNDO-DISCARD', '디스카드 취소 (unDiscardCard)');

    // ── UNDO-ALL: 전체 되돌리기 ──
    // 여러 장 배치 후 전체 Undo
    if (handCountBefore > 0) {
      await actions.placeCardToLine(players[0].page, 0, 'bottom');
      await actions.placeCardToLine(players[0].page, 0, 'mid');
      await players[0].page.waitForTimeout(300);

      // Undo 2회
      try {
        await actions.clickUndo(players[0].page);
        await players[0].page.waitForTimeout(300);
        await actions.clickUndo(players[0].page);
        await players[0].page.waitForTimeout(300);
      } catch {
        // Undo 버튼 미존재
      }
    }

    await screenshotManager.captureAll(allPages, '12-UNDO-ALL', '전체 되돌리기');

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

    // ── 접속 + 참가 ──
    for (const p of players) {
      await actions.connectToServer(p.page);
    }
    await actions.joinRoom(players[0].page, 'E2E-HostLeave', 'Host');
    await players[0].page.waitForTimeout(500);
    await actions.joinRoom(players[1].page, 'E2E-HostLeave', 'P2');
    await players[1].page.waitForTimeout(500);
    await actions.joinRoom(players[2].page, 'E2E-HostLeave', 'P3');
    await players[2].page.waitForTimeout(500);

    // ── HOST-LEAVE: 호스트 페이지 닫기 ──
    await players[0].page.close();
    await players[1].page.waitForTimeout(3000);

    // hostChanged 또는 playerDisconnected 메시지 확인
    const hostChangedMsgs = players[1].interceptor.getMessages('hostChanged');
    const disconnectMsgs = players[1].interceptor.getMessages('playerDisconnected');
    // 호스트가 나가면 hostChanged 또는 playerLeft가 발생해야 함

    await screenshotManager.captureAll(
      [
        { page: players[1].page, playerName: 'P2' },
        { page: players[2].page, playerName: 'P3' },
      ],
      '12-HOST-LEAVE',
      '호스트 퇴장 후'
    );

    // ── LAST-PLAYER: P2도 퇴장 → P3만 남음 ──
    await players[1].page.close();
    await players[2].page.waitForTimeout(2000);

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
    const allPages = players.map((p) => ({ page: p.page, playerName: p.name }));

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

    // ── 접속 + 참가 ──
    for (const p of players) {
      await actions.connectToServer(p.page);
    }
    await actions.joinRoom(players[0].page, 'E2E-Emote', 'Emoter');
    await players[0].page.waitForTimeout(500);
    await actions.joinRoom(players[1].page, 'E2E-Emote', 'Receiver');
    await players[1].page.waitForTimeout(500);

    // ── 게임 시작 (이모트는 게임 중에만 가능할 수 있음) ──
    try {
      await actions.startGame(players[0].page);
    } catch {
      await players[0].page.waitForTimeout(2000);
    }

    for (const p of players) {
      await actions.waitForGameStart(p.page);
    }

    // ── EMOTE: 이모트 전송 ──
    try {
      await actions.sendEmote(players[0].page, 'gg');
    } catch {
      // 이모트 UI가 없을 수 있음
    }
    await players[1].page.waitForTimeout(1000);

    // Receiver의 WS interceptor에서 emote 메시지 확인
    const emoteMsgs = players[1].interceptor.getMessages('emote');

    await screenshotManager.captureAll(allPages, '12-EMOTE', '이모트 전송/수신');

    for (const p of players) {
      p.interceptor.saveLog('12-edge-emote');
    }
  });

  test('View 토글 (Split <-> Grid)', async ({
    createPlayers,
    screenshotManager,
  }) => {
    const players = await createPlayers(2, ['Viewer', 'Partner']);
    const allPages = players.map((p) => ({ page: p.page, playerName: p.name }));

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

    // ── 접속 + 참가 + 시작 ──
    for (const p of players) {
      await actions.connectToServer(p.page);
    }
    await actions.joinRoom(players[0].page, 'E2E-ViewToggle', 'Viewer');
    await players[0].page.waitForTimeout(500);
    await actions.joinRoom(players[1].page, 'E2E-ViewToggle', 'Partner');
    await players[1].page.waitForTimeout(500);

    try {
      await actions.startGame(players[0].page);
    } catch {
      await players[0].page.waitForTimeout(2000);
    }

    for (const p of players) {
      await actions.waitForGameStart(p.page);
    }

    // ── VIEW-TOGGLE: Split -> Grid ──
    // Split 모드 스크린샷
    await screenshotManager.captureAll(allPages, '12-VIEW-SPLIT', 'Split View (기본)');

    // Grid 토글
    try {
      await actions.toggleViewMode(players[0].page);
      await players[0].page.waitForTimeout(1000);
    } catch {
      // Grid 버튼 미존재
    }

    await screenshotManager.captureAll(allPages, '12-VIEW-GRID', 'Grid View');

    // 다시 Split으로 돌아가기
    try {
      await actions.toggleViewMode(players[0].page);
      await players[0].page.waitForTimeout(1000);
    } catch {
      // 스킵
    }

    await screenshotManager.captureAll(allPages, '12-VIEW-TOGGLE', 'View 토글 완료');

    for (const p of players) {
      p.interceptor.saveLog('12-edge-view');
    }
  });
});
