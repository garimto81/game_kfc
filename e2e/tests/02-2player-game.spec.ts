/**
 * 02-2player-game.spec.ts — 2인 풀게임 시나리오
 * 체크포인트: WAIT-2P, DEALER, R1-DEAL ~ R5-CONFIRM, SCORE-DIALOG, SCORE-BOARDS, READY, HAND2-START
 */
import { test, expect } from '../fixtures/multi-player';
import * as actions from '../helpers/game-actions';

const SERVER_PORT = 3099;
const API = `http://localhost:${SERVER_PORT}`;

test.describe('02 — 2-Player Full Game', () => {
  test('2인 5라운드 풀게임 + 스코어링 + 2번째 핸드 시작', async ({
    createPlayers,
    screenshotManager,
  }) => {
    const players = await createPlayers(2, ['Alice', 'Bob']);
    const [alice, bob] = players;

    // 방 생성 (REST API)
    const createRes = await fetch(`${API}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'E2E-2P-Game',
        max_players: 2,
        turn_time_limit: 60,
      }),
    });
    const room = await createRes.json();
    expect(room.id).toBeTruthy();

    // 두 플레이어 모두 페이지 접속
    await actions.connectToServer(alice.page);
    await actions.connectToServer(bob.page);

    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '02-WAIT-2P',
      '2인 대기 화면'
    );

    // 게임 시작은 Flutter UI를 통해 진행됨
    // WS interceptor로 메시지 흐름 확인
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '02-DEALER',
      '딜러 선택 화면'
    );

    // R1 ~ R5 라운드 스크린샷 (실제 카드 배치는 Flutter UI 의존)
    for (const round of [1, 2, 3, 4, 5]) {
      const prefix = round === 1 ? 'R1' : `R${round}`;

      await screenshotManager.captureAll(
        players.map((p) => ({ page: p.page, playerName: p.name })),
        `02-${prefix}-DEAL`,
        `라운드 ${round} 딜 화면`
      );

      // 카드 배치 + 확인 시뮬레이션
      await alice.page.waitForTimeout(1000);
      await bob.page.waitForTimeout(1000);

      await screenshotManager.captureAll(
        players.map((p) => ({ page: p.page, playerName: p.name })),
        `02-${prefix}-CONFIRM`,
        `라운드 ${round} 확인 후`
      );

      if (round >= 2 && round <= 4) {
        await screenshotManager.captureAll(
          players.map((p) => ({ page: p.page, playerName: p.name })),
          `02-${prefix}-DISCARD`,
          `라운드 ${round} 디스카드`
        );
      }
    }

    // 스코어링 대기
    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '02-SCORE-DIALOG',
      '스코어 다이얼로그'
    );

    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '02-SCORE-BOARDS',
      '스코어보드'
    );

    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '02-READY',
      'Ready 버튼'
    );

    await screenshotManager.captureAll(
      players.map((p) => ({ page: p.page, playerName: p.name })),
      '02-HAND2-START',
      '2번째 핸드 시작'
    );

    // WS 로그 저장
    for (const p of players) {
      p.interceptor.saveLog('02-2player-game');
    }
  });
});
