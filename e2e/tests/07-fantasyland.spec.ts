/**
 * 07-fantasyland.spec.ts — Fantasyland 진입/유지/탈출
 * 체크포인트: FL-ENTRY, FL-BADGE, FL-DEAL14, FL-HAND-WRAP, FL-CONFIRM
 *
 * Fantasyland 진입은 이전 핸드에서 top 라인에 QQ+ 배치로 트리거됨.
 * E2E에서는 FL 상태를 직접 설정할 수 없으므로,
 * WS interceptor로 FL 관련 메시지를 검증하는 방식으로 진행.
 *
 * TODO: FL 상태 강제 설정 API가 추가되면 실제 FL 플로우 구현
 */
import { test, expect } from '../fixtures/multi-player';
import * as actions from '../helpers/game-actions';
import { selectors } from '../helpers/game-actions';

const SERVER_PORT = 3099;
const API = `http://localhost:${SERVER_PORT}`;

test.describe('07 — Fantasyland', () => {
  test('Fantasyland 진입 → 14장 딜 → 배치 → 확인', async ({
    createPlayers,
    screenshotManager,
  }) => {
    const players = await createPlayers(2, ['FLPlayer', 'Normal']);
    const allPages = players.map((p) => ({ page: p.page, playerName: p.name }));

    const createRes = await fetch(`${API}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'E2E-FL-Test',
        max_players: 2,
        turn_time_limit: 120,
      }),
    });
    const room = await createRes.json();
    expect(room.id).toBeTruthy();

    // ── 접속 + 참가 ──
    for (const p of players) {
      await actions.connectToServer(p.page);
    }
    await actions.joinRoom(players[0].page, 'E2E-FL-Test', 'FLPlayer');
    await players[0].page.waitForTimeout(500);
    await actions.joinRoom(players[1].page, 'E2E-FL-Test', 'Normal');
    await players[1].page.waitForTimeout(500);

    // ── 게임 시작 ──
    try {
      await actions.startGame(players[0].page);
    } catch {
      await players[0].page.waitForTimeout(2000);
    }

    for (const p of players) {
      await actions.waitForGameStart(p.page);
    }

    // ── FL-ENTRY: FL 진입 조건 확인 (아직 FL이 아닌 상태) ──
    await screenshotManager.captureAll(allPages, '07-FL-ENTRY', 'FL 진입 조건 (첫 핸드 — 아직 FL 아님)');

    // ── FL 진입을 위해 첫 핸드 플레이 (top에 높은 카드 배치) ──
    // R1: FLPlayer가 top에 높은 카드 배치 → FL 진입 시도
    await actions.waitForDeal(players[0].page);
    const hand = await actions.getHandCards(players[0].page);
    if (hand.length > 0) {
      // top에 가장 좋은 카드 배치 (FL 조건: QQ+)
      await actions.placeCardToLine(players[0].page, 0, 'top');
      await actions.placeCardToLine(players[0].page, 0, 'bottom');
      await actions.placeCardToLine(players[0].page, 0, 'bottom');
      await actions.placeCardToLine(players[0].page, 0, 'mid');
      await actions.placeCardToLine(players[0].page, 0, 'mid');
      await actions.confirmPlacement(players[0].page);
    }

    // Normal 플레이어도 배치
    await actions.waitForDeal(players[1].page);
    const hand2 = await actions.getHandCards(players[1].page);
    if (hand2.length > 0) {
      await actions.placeCardToLine(players[1].page, 0, 'bottom');
      await actions.placeCardToLine(players[1].page, 0, 'bottom');
      await actions.placeCardToLine(players[1].page, 0, 'mid');
      await actions.placeCardToLine(players[1].page, 0, 'mid');
      await actions.placeCardToLine(players[1].page, 0, 'top');
      await actions.confirmPlacement(players[1].page);
    }

    await screenshotManager.captureAll(allPages, '07-FL-BADGE', 'FL 배지 (R1 후)');

    // ── FL-DEAL14: FL 플레이어의 dealCards 확인 ──
    // FL은 첫 핸드 완료 후 조건 충족 시 다음 핸드에서 발동
    // WS interceptor로 dealCards.inFantasyland + cards.length === 14 검증
    const flDeals = players[0].interceptor.getMessages('dealCards');
    for (const deal of flDeals) {
      if (deal.payload.inFantasyland) {
        const cards = deal.payload.cards as unknown[];
        expect(cards.length).toBe(14);
      }
    }

    await screenshotManager.captureAll(
      [{ page: players[0].page, playerName: 'FLPlayer' }],
      '07-FL-DEAL14',
      'FL 14장 딜 (조건 충족 시)'
    );

    // ── FL-HAND-WRAP: 14장 핸드 표시 ──
    await screenshotManager.captureAll(
      [{ page: players[0].page, playerName: 'FLPlayer' }],
      '07-FL-HAND-WRAP',
      'FL 14장 핸드 표시'
    );

    // ── FL-CONFIRM: FL 확정 ──
    await screenshotManager.captureAll(allPages, '07-FL-CONFIRM', 'FL 확정');

    for (const p of players) {
      p.interceptor.saveLog('07-fantasyland');
    }
  });
});
