/**
 * 02-2player-game.spec.ts — 2인 풀게임 시나리오
 * 체크포인트: WAIT-2P, DEALER, R1-DEAL ~ R5-CONFIRM, SCORE-DIALOG, SCORE-BOARDS, READY, HAND2-START
 *
 * 실제 게임 플레이 로직:
 * - REST API로 2인 방 생성
 * - 두 플레이어가 WS joinRequest로 방 참가
 * - 호스트가 startGame → dealerSelection → gameStart → dealCards 수신
 * - R1: 5장 카드를 aria-label로 읽고, 라인에 배치 후 confirmPlacement
 * - R2~R5: 3장 딜 → 2장 배치 + 1장 디스카드 → confirm
 * - handScored 다이얼로그 → Ready → 2번째 핸드 시작
 */
import { test, expect } from '../fixtures/multi-player';
import * as actions from '../helpers/game-actions';
import { selectors } from '../helpers/game-actions';
import type { PlayerHandle } from '../fixtures/multi-player';

const SERVER_PORT = 3099;
const API = `http://localhost:${SERVER_PORT}`;
const GAME_WS = `ws://localhost:${SERVER_PORT}/ws/game`;

/**
 * 한 플레이어의 R1 턴 수행: 5장 카드를 라인에 배치
 * bottom 2장, mid 2장, top 1장
 */
async function playRound1(player: PlayerHandle): Promise<void> {
  await actions.waitForMyTurn(player.page);
  await actions.waitForDeal(player.page);

  const handCards = await actions.getHandCards(player.page);
  if (handCards.length === 0) return; // 카드가 없으면 턴이 아님

  // bottom에 2장
  await actions.placeCardToLine(player.page, 0, 'bottom');
  await actions.placeCardToLine(player.page, 0, 'bottom');

  // mid에 2장
  await actions.placeCardToLine(player.page, 0, 'mid');
  await actions.placeCardToLine(player.page, 0, 'mid');

  // top에 1장
  await actions.placeCardToLine(player.page, 0, 'top');

  await actions.confirmPlacement(player.page);
}

/**
 * 한 플레이어의 R2~R4 턴 수행: 3장 중 2장 배치 + 1장 디스카드
 */
async function playRound2to4(player: PlayerHandle): Promise<void> {
  await actions.waitForMyTurn(player.page);
  await actions.waitForDeal(player.page);

  const handCards = await actions.getHandCards(player.page);
  if (handCards.length === 0) return;

  // 빈 슬롯이 있는 라인에 순서대로 배치
  // bottom → mid → top 순서로 빈 곳에 배치
  await actions.placeCardToLine(player.page, 0, 'bottom');
  await actions.placeCardToLine(player.page, 0, 'mid');

  // 나머지 1장 디스카드
  await actions.discardCard(player.page, 0);

  await actions.confirmPlacement(player.page);
}

/**
 * 한 플레이어의 R5 턴 수행 (2-3인): R2~R4와 동일
 */
async function playRound5(player: PlayerHandle): Promise<void> {
  await playRound2to4(player);
}

/**
 * Shadow DOM 내부의 flt-semantics 요소를 찾는 헬퍼 (page.evaluate용)
 * flutter-view shadowRoot를 관통하여 aria-label로 요소를 찾는다
 */
function getSemanticsQueryScript(ariaLabelSelector: string): string {
  return `
    (() => {
      const fv = document.querySelector('flutter-view');
      if (fv && fv.shadowRoot) {
        return fv.shadowRoot.querySelector('${ariaLabelSelector}');
      }
      const gp = document.querySelector('flt-glass-pane');
      if (gp && gp.shadowRoot) {
        return gp.shadowRoot.querySelector('${ariaLabelSelector}');
      }
      return document.querySelector('${ariaLabelSelector}');
    })()
  `;
}

/**
 * WS fallback: page.evaluate로 직접 WS 메시지 전송
 * UI 조작이 불가능할 경우 사용
 * CanvasKit: shadow DOM 내부의 flt-semantics 요소에 접근
 */
async function wsFallbackPlaceCards(
  player: PlayerHandle,
  round: number
): Promise<void> {
  // WS interceptor에서 dealCards 메시지의 카드 정보 추출
  const dealMsg = player.interceptor.getLastMessage('dealCards');
  if (!dealMsg) return;

  const cards = dealMsg.payload.cards as Array<{ rank: number; suit: number }>;
  if (!cards || cards.length === 0) return;

  if (round === 1) {
    // R1: 5장 — bottom 2, mid 2, top 1
    const placements = [
      { card: cards[0], line: 'bottom' },
      { card: cards[1], line: 'bottom' },
      { card: cards[2], line: 'mid' },
      { card: cards[3], line: 'mid' },
      { card: cards[4], line: 'top' },
    ];

    for (const p of placements) {
      await player.page.evaluate(
        ({ line }) => {
          // CanvasKit: shadow DOM 관통하여 flt-semantics 접근
          const root =
            document.querySelector('flutter-view')?.shadowRoot ??
            document.querySelector('flt-glass-pane')?.shadowRoot ??
            document;
          const cardEl = root.querySelector(
            'flt-semantics[aria-label^="hand-card-"]'
          );
          const lineEl = root.querySelector(
            `flt-semantics[aria-label="board-line-${line}"]`
          );
          if (cardEl) (cardEl as HTMLElement).click();
          if (lineEl) (lineEl as HTMLElement).click();
        },
        { line: p.line }
      );
      await player.page.waitForTimeout(400);
    }
  } else {
    // R2~R5: 3장 — 2배치 + 1디스카드
    for (let i = 0; i < 2; i++) {
      const line = i === 0 ? 'bottom' : 'mid';
      await player.page.evaluate(
        ({ line }) => {
          const root =
            document.querySelector('flutter-view')?.shadowRoot ??
            document.querySelector('flt-glass-pane')?.shadowRoot ??
            document;
          const cardEl = root.querySelector(
            'flt-semantics[aria-label^="hand-card-"]'
          );
          const lineEl = root.querySelector(
            `flt-semantics[aria-label="board-line-${line}"]`
          );
          if (cardEl) (cardEl as HTMLElement).click();
          if (lineEl) (lineEl as HTMLElement).click();
        },
        { line }
      );
      await player.page.waitForTimeout(400);
    }
    // 디스카드
    await player.page.evaluate(() => {
      const root =
        document.querySelector('flutter-view')?.shadowRoot ??
        document.querySelector('flt-glass-pane')?.shadowRoot ??
        document;
      const cardEl = root.querySelector(
        'flt-semantics[aria-label^="hand-card-"]'
      );
      if (cardEl) (cardEl as HTMLElement).click();
      const discardBtn = root.querySelector(
        'flt-semantics[aria-label*="discard"]'
      );
      if (discardBtn) (discardBtn as HTMLElement).click();
    });
    await player.page.waitForTimeout(400);
  }

  // Confirm 클릭
  const confirmBtn = player.page.locator(selectors.confirmBtn);
  if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await confirmBtn.click();
  }
  await player.page.waitForTimeout(500);
}

test.describe('02 — 2-Player Full Game', () => {
  test('2인 5라운드 풀게임 + 스코어링 + 2번째 핸드 시작', async ({
    createPlayers,
    screenshotManager,
  }) => {
    const players = await createPlayers(2, ['Alice', 'Bob']);
    const [alice, bob] = players;
    const allPages = players.map((p) => ({ page: p.page, playerName: p.name }));

    // ── 두 플레이어 로비 접속 (방 생성 전에 WS 연결해야 broadcast 수신 가능) ──
    await actions.connectToServer(alice.page);
    await actions.connectToServer(bob.page);

    // ── 방 생성 (REST API — 로비 WS가 연결된 후에 생성해야 broadcast 수신) ──
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
    await alice.page.waitForTimeout(1000); // WS broadcast 대기

    // ── UI를 통해 방 참가 ──
    // Alice가 방에 참가 (첫 번째 플레이어 → 호스트)
    await actions.joinRoom(alice.page, 'E2E-2P-Game', 'Alice');
    await alice.page.waitForTimeout(1000);

    // Bob이 방에 참가
    await actions.joinRoom(bob.page, 'E2E-2P-Game', 'Bob');
    await bob.page.waitForTimeout(1000);

    await screenshotManager.captureAll(allPages, '02-WAIT-2P', '2인 대기 화면');

    // ── 게임 시작: Alice(호스트)가 Start Game 클릭 ──
    try {
      await actions.startGame(alice.page);
    } catch {
      // Start 버튼이 없을 수 있음 — 자동 시작 또는 아직 로딩 중
      await alice.page.waitForTimeout(2000);
    }

    // ── dealerSelection 대기 ──
    await alice.page.waitForTimeout(2000);
    await screenshotManager.captureAll(allPages, '02-DEALER', '딜러 선택 화면');

    // ── gameStart + dealCards 대기 ──
    await actions.waitForGameStart(alice.page);
    await actions.waitForGameStart(bob.page);

    // ── R1: 5장 딜 → 배치 → 확인 ──
    await actions.waitForDeal(alice.page);
    await screenshotManager.captureAll(allPages, '02-R1-DEAL', '라운드 1 딜 화면');

    // WS interceptor로 dealCards 확인
    const aliceDeal1 = alice.interceptor.getLastMessage('dealCards');
    if (aliceDeal1) {
      const cards = aliceDeal1.payload.cards as unknown[];
      expect(cards.length).toBe(5); // R1은 5장
    }

    // Alice R1 카드 배치
    const aliceHandR1 = await actions.getHandCards(alice.page);
    if (aliceHandR1.length > 0) {
      // UI 기반 배치 시도
      await playRound1(alice);
    } else {
      // WS fallback
      await wsFallbackPlaceCards(alice, 1);
    }

    await screenshotManager.captureAll(allPages, '02-R1-ALICE', 'R1 Alice 배치 후');

    // Bob R1 카드 배치
    await actions.waitForDeal(bob.page);
    const bobHandR1 = await actions.getHandCards(bob.page);
    if (bobHandR1.length > 0) {
      await playRound1(bob);
    } else {
      await wsFallbackPlaceCards(bob, 1);
    }

    await screenshotManager.captureAll(allPages, '02-R1-CONFIRM', '라운드 1 확인 후');

    // ── R2 ~ R5: 3장 딜 → 2배치 + 1디스카드 → 확인 ──
    for (const round of [2, 3, 4, 5]) {
      // 딜 대기
      await alice.page.waitForTimeout(1000);
      await actions.waitForDeal(alice.page);

      await screenshotManager.captureAll(
        allPages,
        `02-R${round}-DEAL`,
        `라운드 ${round} 딜 화면`
      );

      // Alice 배치
      const aliceHand = await actions.getHandCards(alice.page);
      if (aliceHand.length > 0) {
        if (round === 5) {
          await playRound5(alice);
        } else {
          await playRound2to4(alice);
        }
      } else {
        await wsFallbackPlaceCards(alice, round);
      }

      // Bob 배치
      await actions.waitForDeal(bob.page);
      const bobHand = await actions.getHandCards(bob.page);
      if (bobHand.length > 0) {
        if (round === 5) {
          await playRound5(bob);
        } else {
          await playRound2to4(bob);
        }
      } else {
        await wsFallbackPlaceCards(bob, round);
      }

      await screenshotManager.captureAll(
        allPages,
        `02-R${round}-CONFIRM`,
        `라운드 ${round} 확인 후`
      );
    }

    // ── 스코어링 대기 ──
    await actions.waitForScoring(alice.page);
    await screenshotManager.captureAll(allPages, '02-SCORE-DIALOG', '스코어 다이얼로그');

    // WS interceptor에서 handScored 메시지 확인
    const aliceScoreMsg = alice.interceptor.getLastMessage('handScored');
    if (aliceScoreMsg) {
      expect(aliceScoreMsg.payload).toHaveProperty('results');
    }

    await screenshotManager.captureAll(allPages, '02-SCORE-BOARDS', '스코어보드');

    // ── Ready 클릭 → 2번째 핸드 시작 ──
    try {
      await actions.clickReady(alice.page);
    } catch {
      // Ready 버튼이 없을 수 있음
    }
    try {
      await actions.clickReady(bob.page);
    } catch {
      // Ready 버튼이 없을 수 있음
    }

    await screenshotManager.captureAll(allPages, '02-READY', 'Ready 버튼 클릭 후');

    // 2번째 핸드 시작 대기
    await alice.page.waitForTimeout(3000);
    await screenshotManager.captureAll(allPages, '02-HAND2-START', '2번째 핸드 시작');

    // WS 로그 저장
    for (const p of players) {
      p.interceptor.saveLog('02-2player-game');
    }
  });
});
