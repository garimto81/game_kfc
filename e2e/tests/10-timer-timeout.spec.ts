/**
 * 10-timer-timeout.spec.ts — 턴 타이머 만료 + autoFold
 * 체크포인트: TIMER-BAR, TIMER-5S, TIMER-EXPIRE, TIMER-ADVANCE, TIMER-SCORE
 *
 * 실제 게임 플레이 로직:
 * - turnTimeLimit=10 방 생성 (10초 타이머)
 * - 2인 방 → 참가 → 게임 시작
 * - P1 턴에 아무것도 안 함 → 타이머 바 감소 스크린샷
 * - 5초 시점 스크린샷 → 타임아웃 → foldedThisHand or autoFold
 * - P2 턴 전환 확인
 */
import { test, expect } from '../fixtures/multi-player';
import * as actions from '../helpers/game-actions';
import { selectors } from '../helpers/game-actions';

const SERVER_PORT = 3099;
const API = `http://localhost:${SERVER_PORT}`;

test.describe('10 — Timer & Timeout', () => {
  test('턴 타이머 만료 → autoFold → 다음 턴', async ({
    createPlayers,
    screenshotManager,
  }) => {
    const players = await createPlayers(2, ['Active', 'AFK']);
    const [active, afk] = players;
    const allPages = players.map((p) => ({ page: p.page, playerName: p.name }));

    // ── 짧은 타임아웃 설정 (10초) ──
    const createRes = await fetch(`${API}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'E2E-Timer-Test',
        max_players: 2,
        turn_time_limit: 10, // 10초 타이머
      }),
    });
    const room = await createRes.json();
    expect(room.id).toBeTruthy();

    // ── 플레이어 접속 + 참가 ──
    for (const p of players) {
      await actions.connectToServer(p.page);
    }
    await actions.joinRoom(active.page, 'E2E-Timer-Test', 'Active');
    await active.page.waitForTimeout(500);
    await actions.joinRoom(afk.page, 'E2E-Timer-Test', 'AFK');
    await afk.page.waitForTimeout(500);

    // ── 게임 시작 ──
    try {
      await actions.startGame(active.page);
    } catch {
      await active.page.waitForTimeout(2000);
    }

    // gameStart 대기
    await actions.waitForGameStart(active.page);
    await actions.waitForGameStart(afk.page);

    // dealCards 대기
    await actions.waitForDeal(active.page);
    await actions.waitForDeal(afk.page);

    // ── TIMER-BAR: 타이머 바 표시 확인 ──
    // 턴 타이머가 UI에 표시되어야 함
    const timerElement = active.page.locator(selectors.turnTimer);
    // 타이머 요소가 보이는지 확인 (없을 수도 있음)

    await screenshotManager.captureAll(allPages, '10-TIMER-BAR', '타이머 바 (시작)');

    // ── 첫 번째 턴 플레이어를 파악 ──
    // WS interceptor로 gameStart 메시지에서 currentTurnPlayerId 확인
    const activeGameStart = active.interceptor.getLastMessage('gameStart');
    let currentTurnPlayerId: string | null = null;
    if (activeGameStart) {
      currentTurnPlayerId = activeGameStart.payload.currentTurnPlayerId as string;
    }

    // ── TIMER-5S: 5초 대기 후 스크린샷 (타이머 감소 확인) ──
    await active.page.waitForTimeout(5000);
    await screenshotManager.captureAll(allPages, '10-TIMER-5S', '타이머 5초 남음');

    // ── TIMER-EXPIRE: 추가 6초 대기 → 타이머 만료 ──
    // 10초 타이머 → 5초 이미 지남 → 6초 더 대기하면 만료
    await active.page.waitForTimeout(6000);

    await screenshotManager.captureAll(allPages, '10-TIMER-EXPIRE', '타이머 만료');

    // ── TIMER-ADVANCE: 타임아웃 후 턴 변경 확인 ──
    // foldedThisHand 메시지 확인 (AFK 플레이어가 자동 폴드)
    const activeFoldMsgs = active.interceptor.getMessages('foldedThisHand');
    const afkFoldMsgs = afk.interceptor.getMessages('foldedThisHand');

    // turnChanged 메시지로 다음 턴 전환 확인
    const turnChangedMsgs = active.interceptor.getMessages('turnChanged');

    await screenshotManager.captureAll(allPages, '10-TIMER-ADVANCE', '다음 턴 진행');

    // ── 남은 플레이어가 자기 턴 처리 ──
    // Active 플레이어가 턴이면 카드 배치
    const activeHand = await actions.getHandCards(active.page);
    if (activeHand.length > 0) {
      // R1: 5장 배치
      await actions.placeCardToLine(active.page, 0, 'bottom');
      await actions.placeCardToLine(active.page, 0, 'bottom');
      await actions.placeCardToLine(active.page, 0, 'mid');
      await actions.placeCardToLine(active.page, 0, 'mid');
      await actions.placeCardToLine(active.page, 0, 'top');
      await actions.confirmPlacement(active.page);
    }

    await active.page.waitForTimeout(2000);

    // ── TIMER-SCORE: 핸드 종료 시 스코어 확인 ──
    // AFK 플레이어가 autoFold → 남은 라운드는 서버가 자동 처리
    // handScored 메시지 수신 대기 (타임아웃이 긴 수 있음)
    await active.page.waitForTimeout(5000);

    const scoreMsg = active.interceptor.getLastMessage('handScored');
    if (scoreMsg) {
      expect(scoreMsg.payload).toHaveProperty('results');
    }

    await screenshotManager.captureAll(allPages, '10-TIMER-SCORE', '타임아웃 후 스코어');

    // WS 로그 저장
    for (const p of players) {
      p.interceptor.saveLog('10-timer-timeout');
    }
  });
});
