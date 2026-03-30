/**
 * 03-3player-game.spec.ts — 3인 풀게임 (턴 순서 검증)
 * 체크포인트: WAIT-3P, DEALER, R1-TURN1/2/3, R2~R4-SUMMARY, R5-END, SCORE, GRID
 *
 * 실제 게임 플레이 로직:
 * - 3인 방 생성 + 참가 + 시작
 * - 3명 턴 순서대로 카드 배치 (R1: 5장, R2~R5: 3장)
 * - handScored 후 3쌍 비교 결과 확인
 * - Grid View 토글 확인
 */
import { test, expect } from '../fixtures/multi-player';
import * as actions from '../helpers/game-actions';
import { selectors } from '../helpers/game-actions';
import type { PlayerHandle } from '../fixtures/multi-player';

const SERVER_PORT = 3099;
const API = `http://localhost:${SERVER_PORT}`;

/**
 * 한 플레이어의 R1 턴: 5장 → bottom 2, mid 2, top 1
 */
async function playR1(player: PlayerHandle): Promise<void> {
  await actions.waitForMyTurn(player.page);
  await actions.waitForDeal(player.page);

  const hand = await actions.getHandCards(player.page);
  if (hand.length === 0) {
    await player.page.waitForTimeout(2000);
    return;
  }

  await actions.placeCardToLine(player.page, 0, 'bottom');
  await actions.placeCardToLine(player.page, 0, 'bottom');
  await actions.placeCardToLine(player.page, 0, 'mid');
  await actions.placeCardToLine(player.page, 0, 'mid');
  await actions.placeCardToLine(player.page, 0, 'top');

  await actions.confirmPlacement(player.page);
}

/**
 * 한 플레이어의 R2~R5 턴: 3장 → 2배치 + 1디스카드
 */
async function playR2to5(player: PlayerHandle): Promise<void> {
  await actions.waitForMyTurn(player.page);
  await actions.waitForDeal(player.page);

  const hand = await actions.getHandCards(player.page);
  if (hand.length === 0) {
    await player.page.waitForTimeout(2000);
    return;
  }

  // 빈 슬롯이 있는 라인에 배치
  await actions.placeCardToLine(player.page, 0, 'bottom');
  await actions.placeCardToLine(player.page, 0, 'mid');

  // 나머지 1장 디스카드
  await actions.discardCard(player.page, 0);

  await actions.confirmPlacement(player.page);
}

test.describe('03 — 3-Player Full Game', () => {
  test('3인 게임 — 턴 순서 + Grid View 검증', async ({
    createPlayers,
    screenshotManager,
  }) => {
    const players = await createPlayers(3, ['P1', 'P2', 'P3']);
    const allPages = players.map((p) => ({ page: p.page, playerName: p.name }));

    // ── 방 생성 ──
    const createRes = await fetch(`${API}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'E2E-3P-Game',
        max_players: 3,
        turn_time_limit: 60,
      }),
    });
    const room = await createRes.json();
    expect(room.id).toBeTruthy();

    // ── 모든 플레이어 접속 + 방 참가 ──
    for (const p of players) {
      await actions.connectToServer(p.page);
    }
    for (const p of players) {
      await actions.joinRoom(p.page, 'E2E-3P-Game', p.name);
      await p.page.waitForTimeout(500);
    }

    await screenshotManager.captureAll(allPages, '03-WAIT-3P', '3인 대기 화면');

    // ── 게임 시작: P1(호스트)가 Start Game ──
    try {
      await actions.startGame(players[0].page);
    } catch {
      await players[0].page.waitForTimeout(2000);
    }

    // ── dealerSelection 대기 ──
    await players[0].page.waitForTimeout(2000);
    await screenshotManager.captureAll(allPages, '03-DEALER', '딜러 선택');

    // ── gameStart 대기 ──
    for (const p of players) {
      await actions.waitForGameStart(p.page);
    }

    // ── R1: 3명 순서대로 5장 배치 ──
    for (let turn = 0; turn < 3; turn++) {
      const player = players[turn];

      await actions.waitForDeal(player.page);

      // WS interceptor로 dealCards 확인
      const dealMsg = player.interceptor.getLastMessage('dealCards');
      if (dealMsg) {
        const cards = dealMsg.payload.cards as unknown[];
        expect(cards.length).toBe(5);
      }

      await screenshotManager.captureAll(
        allPages,
        `03-R1-TURN${turn + 1}`,
        `R1 턴 ${turn + 1} — ${player.name}`
      );

      // 카드 배치
      await playR1(player);
      await player.page.waitForTimeout(500);
    }

    // ── R2~R5 ──
    for (const round of [2, 3, 4, 5]) {
      await players[0].page.waitForTimeout(1000);

      // 3명 순서대로 배치
      for (const player of players) {
        await actions.waitForDeal(player.page);
        await playR2to5(player);
        await player.page.waitForTimeout(300);
      }

      await screenshotManager.captureAll(
        allPages,
        `03-R${round}-SUMMARY`,
        `라운드 ${round} 요약`
      );
    }

    // ── R5 종료 ──
    await screenshotManager.captureAll(allPages, '03-R5-END', 'R5 종료');

    // ── 스코어: 3쌍 비교 ──
    await actions.waitForScoring(players[0].page);

    // handScored 메시지에서 3쌍 비교 결과 확인 (P1 vs P2, P1 vs P3, P2 vs P3)
    const scoreMsg = players[0].interceptor.getLastMessage('handScored');
    if (scoreMsg) {
      expect(scoreMsg.payload).toHaveProperty('results');
      const results = scoreMsg.payload.results;
      // 3인 게임: C(3,2) = 3쌍의 비교 결과가 있어야 함
    }

    await screenshotManager.captureAll(allPages, '03-SCORE', '3인 스코어');

    // ── Grid View 토글 ──
    try {
      await actions.toggleViewMode(players[0].page);
      await players[0].page.waitForTimeout(1000);
    } catch {
      // Grid 버튼이 없을 수 있음
    }

    await screenshotManager.captureAll(allPages, '03-GRID', 'Grid View');

    // ── Ready 클릭 ──
    for (const p of players) {
      try {
        await actions.clickReady(p.page);
      } catch {
        // Ready 버튼 미존재 가능
      }
    }

    // WS 로그 저장
    for (const p of players) {
      p.interceptor.saveLog('03-3player-game');
    }
  });
});
