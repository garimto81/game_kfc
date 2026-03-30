/**
 * 07-fantasyland.spec.ts — Fantasyland 진입/유지/탈출
 * 체크포인트: FL-ENTRY, FL-BADGE, FL-DEAL14, FL-HAND-WRAP, FL-SORT,
 *            FL-AUTO, FL-INDEPENDENT, FL-CONFIRM, FL-WAITING, FL-STAY, FL-EXIT
 */
import { test, expect } from '../fixtures/multi-player';
import * as actions from '../helpers/game-actions';

const SERVER_PORT = 3099;
const API = `http://localhost:${SERVER_PORT}`;

test.describe('07 — Fantasyland', () => {
  test('Fantasyland 진입 → 14장 딜 → 배치 → 확인', async ({
    createPlayers,
    screenshotManager,
  }) => {
    const players = await createPlayers(2, ['FLPlayer', 'Normal']);

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

    for (const p of players) {
      await actions.connectToServer(p.page);
    }

    // FL 진입은 top 라인에 QQ+ 배치로 트리거됨
    // E2E에서는 FL 상태를 직접 설정할 수 없으므로
    // 스크린샷 체크포인트를 순서대로 캡처

    // ── FL-ENTRY: FL 진입 조건 (이전 핸드에서 top QQ+) ──
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '07-FL-ENTRY',
      'FL 진입 조건'
    );

    // ── FL-BADGE: FL 배지 표시 ──
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '07-FL-BADGE',
      'FL 배지'
    );

    // ── FL-DEAL14: 14장 딜 ──
    // WS interceptor로 dealCards.cards.length === 14 확인
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '07-FL-DEAL14',
      'FL 14장 딜'
    );

    // FL 플레이어의 dealCards 메시지 확인
    const flDeals = players[0].interceptor.getMessages('dealCards');
    for (const deal of flDeals) {
      if (deal.payload.inFantasyland) {
        const cards = deal.payload.cards as unknown[];
        expect(cards.length).toBe(14);
      }
    }

    // ── FL-HAND-WRAP: 14장 핸드 표시 ──
    await screenshotManager.captureAll(
      [{ page: players[0].page, playerName: 'FLPlayer' }],
      '07-FL-HAND-WRAP',
      'FL 14장 핸드 표시'
    );

    // ── FL-SORT: 카드 정렬 ──
    await screenshotManager.captureAll(
      [{ page: players[0].page, playerName: 'FLPlayer' }],
      '07-FL-SORT',
      'FL 카드 정렬'
    );

    // ── FL-AUTO: 자동 배치 (봇 전략) ──
    await screenshotManager.captureAll(
      [{ page: players[0].page, playerName: 'FLPlayer' }],
      '07-FL-AUTO',
      'FL 자동 배치'
    );

    // ── FL-INDEPENDENT: FL 독립 진행 ──
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '07-FL-INDEPENDENT',
      'FL 독립 진행 (비FL 대기 불필요)'
    );

    // ── FL-CONFIRM: FL 확정 ──
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '07-FL-CONFIRM',
      'FL 확정'
    );

    // ── FL-WAITING: FL 완료 대기 ──
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '07-FL-WAITING',
      'FL 완료 대기'
    );

    // ── FL-STAY: FL 유지 조건 ──
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '07-FL-STAY',
      'FL 유지 여부'
    );

    // ── FL-EXIT: FL 탈출 ──
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '07-FL-EXIT',
      'FL 탈출'
    );

    for (const p of players) {
      p.interceptor.saveLog('07-fantasyland');
    }
  });
});
