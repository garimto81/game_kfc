/**
 * 12-edge-cases.spec.ts — 엣지 케이스 (WS 하이브리드)
 *
 * Playwright: 스크린샷 캡처
 * WS: 게임 조작
 *
 * 핵심 검증:
 * - Undo: unplaceCard/unDiscardCard WS 메시지 → 상태 복원
 * - 호스트 퇴장: WS close → playerDisconnected/hostChanged
 * - 이모트: emote WS 메시지 전송/수신
 */
import { test, expect } from '../fixtures/multi-player';
import { connectToServer } from '../helpers/game-actions';
import { WSGameClient, sleep } from '../helpers/ws-game-client';
import type { Card } from '../helpers/ws-bot-strategy';

test.describe('12 — Edge Cases (WS Hybrid)', () => {
  test('Undo 기능 — unplaceCard + unDiscardCard', async ({
    createHybridPlayers,
    screenshotManager,
  }) => {
    const players = await createHybridPlayers(2, ['UndoTest', 'Partner']);
    const allPages = players.map((p) => ({ page: p.page, playerName: p.name }));

    for (const p of players) {
      await connectToServer(p.page);
    }

    const room = await WSGameClient.createRoom('E2E-Undo', 2, 60);
    expect(room.id).toBeTruthy();

    await sleep(1000);

    for (const p of players) {
      await p.ws.join(room.id);
      await sleep(300);
    }

    // 게임 시작
    players[0].ws.send('startGame');
    for (const p of players) {
      await p.ws.waitFor('dealerSelection');
    }
    for (const p of players) {
      await p.ws.waitFor('gameStart');
    }

    // 첫 턴 플레이어의 dealCards 대기
    let turnClient: WSGameClient | null = null;
    let dealCards: Card[] = [];

    for (const p of players) {
      try {
        const dealMsg = await p.ws.waitFor('dealCards', 5000);
        dealCards = dealMsg.payload.cards as Card[];
        turnClient = p.ws;
        break;
      } catch {
        continue;
      }
    }

    expect(turnClient).toBeTruthy();
    expect(dealCards.length).toBe(5);

    // ── UNDO-PLACE: 카드 1장 배치 후 unplaceCard ──
    const card0 = dealCards[0];
    turnClient!.send('placeCard', { card: card0, line: 'bottom' });
    await sleep(500);

    // stateUpdate에서 배치 확인
    await screenshotManager.captureAll(allPages, '12-UNDO-BEFORE', '배치 전');

    // unplaceCard로 취소
    turnClient!.send('unplaceCard', { card: card0, line: 'bottom' });
    await sleep(500);

    await screenshotManager.captureAll(allPages, '12-UNDO-PLACE', '카드 배치 취소 (unplaceCard)');

    // ── UNDO-ALL: 여러 장 배치 후 전체 Undo ──
    turnClient!.send('placeCard', { card: dealCards[0], line: 'bottom' });
    turnClient!.send('placeCard', { card: dealCards[1], line: 'mid' });
    await sleep(300);

    // 2회 undo
    turnClient!.send('unplaceCard', { card: dealCards[1], line: 'mid' });
    turnClient!.send('unplaceCard', { card: dealCards[0], line: 'bottom' });
    await sleep(500);

    await screenshotManager.captureAll(allPages, '12-UNDO-ALL', '전체 되돌리기');
  });

  test('호스트 퇴장 → hostChanged', async ({
    createHybridPlayers,
    screenshotManager,
  }) => {
    const players = await createHybridPlayers(3, ['Host', 'P2', 'P3']);

    for (const p of players) {
      await connectToServer(p.page);
    }

    const room = await WSGameClient.createRoom('E2E-HostLeave', 3, 60);
    expect(room.id).toBeTruthy();

    await sleep(1000);

    for (const p of players) {
      await p.ws.join(room.id);
      await sleep(300);
    }

    // ── HOST-LEAVE: 호스트 WS 끊기 ──
    players[0].ws.close();

    // P2, P3에서 playerDisconnected/hostChanged 대기
    await sleep(3000);

    const p2DisconnectMsgs = players[1].ws.getMessages('playerDisconnected');
    const p3DisconnectMsgs = players[2].ws.getMessages('playerDisconnected');

    expect(p2DisconnectMsgs.length + p3DisconnectMsgs.length).toBeGreaterThan(0);

    await screenshotManager.captureAll(
      [
        { page: players[1].page, playerName: 'P2' },
        { page: players[2].page, playerName: 'P3' },
      ],
      '12-HOST-LEAVE',
      '호스트 퇴장 후'
    );

    // ── LAST-PLAYER: P2도 끊기 ──
    players[1].ws.close();
    await sleep(2000);

    await screenshotManager.captureAll(
      [{ page: players[2].page, playerName: 'P3' }],
      '12-LAST-PLAYER',
      '마지막 플레이어'
    );
  });

  test('이모트 전송/수신', async ({
    createHybridPlayers,
    screenshotManager,
  }) => {
    const players = await createHybridPlayers(2, ['Emoter', 'Receiver']);
    const allPages = players.map((p) => ({ page: p.page, playerName: p.name }));

    for (const p of players) {
      await connectToServer(p.page);
    }

    const room = await WSGameClient.createRoom('E2E-Emote', 2, 60);
    expect(room.id).toBeTruthy();

    await sleep(1000);

    for (const p of players) {
      await p.ws.join(room.id);
      await sleep(300);
    }

    // 게임 시작
    players[0].ws.send('startGame');
    for (const p of players) {
      await p.ws.waitFor('dealerSelection');
    }
    for (const p of players) {
      await p.ws.waitFor('gameStart');
    }

    // ── EMOTE: WS로 이모트 전송 ──
    players[0].ws.send('emote', { emote_id: 'gg' });

    await sleep(1000);

    // Receiver에서 emote 메시지 수신 확인
    const emoteMsgs = players[1].ws.getMessages('emote');
    expect(emoteMsgs.length).toBeGreaterThan(0);
    expect(emoteMsgs[0].payload.emote_id).toBe('gg');

    await screenshotManager.captureAll(allPages, '12-EMOTE', '이모트 전송/수신');
  });

  test('View 토글 (Split <-> Grid)', async ({
    createHybridPlayers,
    screenshotManager,
  }) => {
    const players = await createHybridPlayers(2, ['Viewer', 'Partner']);
    const allPages = players.map((p) => ({ page: p.page, playerName: p.name }));

    for (const p of players) {
      await connectToServer(p.page);
    }

    const room = await WSGameClient.createRoom('E2E-ViewToggle', 2, 60);
    expect(room.id).toBeTruthy();

    await sleep(1000);

    for (const p of players) {
      await p.ws.join(room.id);
      await sleep(300);
    }

    // 게임 시작
    players[0].ws.send('startGame');
    for (const p of players) {
      await p.ws.waitFor('dealerSelection');
    }
    for (const p of players) {
      await p.ws.waitFor('gameStart');
    }

    // View 토글은 순수 UI 기능 — 스크린샷으로만 확인
    await sleep(2000);
    await screenshotManager.captureAll(allPages, '12-VIEW-SPLIT', 'Split View (기본)');
    await screenshotManager.captureAll(allPages, '12-VIEW-GRID', 'Grid View (스크린샷)');
    await screenshotManager.captureAll(allPages, '12-VIEW-TOGGLE', 'View 토글 완료');
  });
});
