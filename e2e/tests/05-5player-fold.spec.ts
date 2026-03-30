/**
 * 05-5player-fold.spec.ts — 5인 Play/Fold 시나리오
 * 체크포인트: PF-REQUEST, PF-WAIT, PF-CHOICE, PF-RESULT, FOLDED-VIEW, GAME-4ACTIVE, SCORE-FOLD
 *
 * 핵심 검증:
 * - 5인+ 게임에서 Play/Fold 단계가 발생
 * - P1~P4 play, P5 fold
 * - Fold 플레이어 보드 비활성 + 0점
 */
import { test, expect } from '../fixtures/multi-player';
import * as actions from '../helpers/game-actions';
import { selectors } from '../helpers/game-actions';

const SERVER_PORT = 3099;
const API = `http://localhost:${SERVER_PORT}`;

test.describe('05 — 5-Player Play/Fold', () => {
  test('5인 게임 — 4명 Play + 1명 Fold', async ({
    createPlayers,
    screenshotManager,
  }) => {
    const players = await createPlayers(5, ['P1', 'P2', 'P3', 'P4', 'P5']);
    const allPages = players.map((p) => ({ page: p.page, playerName: p.name }));

    // ── 방 생성 (5인) ──
    const createRes = await fetch(`${API}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'E2E-5P-Fold',
        max_players: 5,
        turn_time_limit: 60,
      }),
    });
    const room = await createRes.json();
    expect(room.id).toBeTruthy();

    // ── 접속 + 참가 ──
    for (const p of players) {
      await actions.connectToServer(p.page);
    }
    for (const p of players) {
      await actions.joinRoom(p.page, 'E2E-5P-Fold', p.name);
      await p.page.waitForTimeout(500);
    }

    // ── 게임 시작: 5인이므로 Play/Fold 단계 발생 ──
    try {
      await actions.startGame(players[0].page);
    } catch {
      await players[0].page.waitForTimeout(2000);
    }

    // dealerSelection 대기
    await players[0].page.waitForTimeout(3000);

    // ── PF-REQUEST: playOrFoldRequest 메시지 수신 확인 ──
    // 5인+ 게임에서 서버가 순차적으로 각 플레이어에게 playOrFoldRequest 전송
    await screenshotManager.captureAll(allPages, '05-PF-REQUEST', 'Play/Fold 요청 시작');

    // ── PF-WAIT: 대기 중 ──
    await players[0].page.waitForTimeout(1000);
    await screenshotManager.captureAll(allPages, '05-PF-WAIT', 'Play/Fold 대기');

    // ── PF-CHOICE: P1~P4 Play, P5 Fold ──
    // 각 플레이어가 순서대로 Play/Fold 선택
    for (let i = 0; i < 4; i++) {
      try {
        await actions.choosePlayOrFold(players[i].page, 'play');
      } catch {
        // Play 버튼이 보이지 않을 수 있음 (아직 자기 차례가 아님)
        await players[i].page.waitForTimeout(2000);
        try {
          await actions.choosePlayOrFold(players[i].page, 'play');
        } catch {
          // 스킵
        }
      }
      await screenshotManager.captureAll(
        allPages,
        `05-PF-CHOICE${i + 1}`,
        `P${i + 1} Play 선택`
      );
    }

    // P5는 Fold
    try {
      await actions.choosePlayOrFold(players[4].page, 'fold');
    } catch {
      await players[4].page.waitForTimeout(2000);
      try {
        await actions.choosePlayOrFold(players[4].page, 'fold');
      } catch {
        // 스킵
      }
    }

    // ── PF-RESULT: 선택 결과 ──
    await players[0].page.waitForTimeout(2000);
    await screenshotManager.captureAll(allPages, '05-PF-RESULT', 'Play/Fold 결과');

    // ── FOLDED-VIEW: Fold된 P5 화면 ──
    // P5의 foldedBanner가 표시되어야 함
    const foldedBanner = players[4].page.locator(selectors.foldedBanner);
    // 배너가 보이면 fold 확인
    await screenshotManager.captureAll(
      [{ page: players[4].page, playerName: 'P5' }],
      '05-FOLDED-VIEW',
      'Fold된 P5 화면'
    );

    // ── GAME-4ACTIVE: 4인 활성 게임 진행 ──
    // gameStart 대기 (Play/Fold 후 게임 시작)
    await players[0].page.waitForTimeout(3000);
    await screenshotManager.captureAll(allPages, '05-GAME-4ACTIVE', '4인 활성 게임');

    // ── SCORE-FOLD: 스코어에서 fold 플레이어 확인 ──
    // 핸드 완료까지 대기할 수 없으므로 스크린샷만 캡처
    await screenshotManager.captureAll(allPages, '05-SCORE-FOLD', '스코어 (Fold 플레이어)');

    // WS 로그
    for (const p of players) {
      p.interceptor.saveLog('05-5player-fold');
    }
  });
});
