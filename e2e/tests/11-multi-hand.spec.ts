/**
 * 11-multi-hand.spec.ts — 다중 핸드 연속 진행 (WS 하이브리드)
 *
 * Playwright: 스크린샷 캡처
 * WS: 게임 조작
 *
 * 핵심 검증:
 * - 핸드 1 → Ready → 핸드 2 → Ready → 핸드 3
 * - handScored.handNumber 증가 확인
 * - zero-sum 매 핸드 확인
 */
import { test, expect } from '../fixtures/multi-player';
import { connectToServer } from '../helpers/game-actions';
import { WSGameClient, sleep } from '../helpers/ws-game-client';
import { decidePlacement, extractBoard } from '../helpers/ws-bot-strategy';

/**
 * WS로 한 핸드(R1~R5)를 완료하는 헬퍼
 * 모든 클라이언트가 동시에 dealCards를 대기하여 서버 턴 순서와 무관하게 처리
 */
async function playOneHandWS(
  clients: WSGameClient[],
  activePlayers: number
): Promise<void> {
  // 각 클라이언트의 로컬 보드 상태 추적
  const localBoards = new Map<WSGameClient, { top: any[]; mid: any[]; bottom: any[] }>();
  for (const c of clients) {
    localBoards.set(c, { top: [], mid: [], bottom: [] });
  }

  for (let round = 1; round <= 5; round++) {
    await Promise.all(clients.map(async (client) => {
      const dealMsg = await client.waitFor('dealCards', 30000);
      const cards = dealMsg.payload.cards;
      const dealRound = dealMsg.payload.round as number;
      const isFL = dealMsg.payload.inFantasyland === true;

      // R1일 때는 빈 보드에서 시작 (이전 핸드의 stateUpdate가 남아있을 수 있음)
      const board = dealRound === 1
        ? { top: [], mid: [], bottom: [] }
        : (localBoards.get(client) ?? extractBoard(client));

      const decision = decidePlacement(cards, board, dealRound, isFL, activePlayers);
      for (const p of decision.placements) {
        client.send('placeCard', { card: p.card, line: p.line });
        // 로컬 보드에 반영
        const lb = localBoards.get(client)!;
        lb[p.line].push(p.card);
      }
      if (decision.discard) {
        client.send('discardCard', { card: decision.discard });
      }
      await sleep(200);
      client.send('confirmPlacement');
      await sleep(500);
    }));
  }
}

test.describe('11 — Multi-Hand (WS Hybrid)', () => {
  test('3핸드 연속 진행 + 누적 스코어', async ({
    createHybridPlayers,
    screenshotManager,
  }) => {
    const players = await createHybridPlayers(2, ['Player1', 'Player2']);
    const allPages = players.map((p) => ({ page: p.page, playerName: p.name }));
    const wsClients = players.map((p) => p.ws);

    // ── Playwright + WS 설정 ──
    for (const p of players) {
      await connectToServer(p.page);
    }

    const room = await WSGameClient.createRoom('E2E-MultiHand', 2, 60);
    expect(room.id).toBeTruthy();

    await sleep(1000);

    for (const p of players) {
      await p.ws.join(room.id);
      await sleep(300);
    }

    // ── 게임 시작 ──
    players[0].ws.send('startGame');

    for (const p of players) {
      await p.ws.waitFor('dealerSelection');
    }
    for (const p of players) {
      await p.ws.waitFor('gameStart');
    }

    const activePlayers = 2;

    // ── Hand 1 ──
    await playOneHandWS(wsClients, activePlayers);

    const h1Score = await players[0].ws.waitFor('handScored', 30000);
    expect(h1Score.payload.handNumber).toBe(1);
    expect(h1Score.payload.results).toBeTruthy();

    // zero-sum
    let totalH1 = 0;
    for (const id of Object.keys(h1Score.payload.results)) {
      totalH1 += h1Score.payload.results[id].score || 0;
    }
    expect(totalH1).toBe(0);

    await sleep(2000);
    await screenshotManager.captureAll(allPages, '11-H1-COMPLETE', 'Hand 1 완료');

    // Ready
    for (const p of players) {
      p.ws.send('readyForNextHand');
    }

    // Hand 2 시작 대기
    await Promise.all(players.map(p => p.ws.waitFor('gameStart', 15000)));

    await sleep(1500);
    await screenshotManager.captureAll(allPages, '11-H2-START', 'Hand 2 시작');

    // ── Hand 2 ──
    await playOneHandWS(wsClients, activePlayers);

    const h2Score = await players[0].ws.waitFor('handScored', 30000);
    expect(h2Score.payload.handNumber).toBe(2);

    let totalH2 = 0;
    for (const id of Object.keys(h2Score.payload.results)) {
      totalH2 += h2Score.payload.results[id].score || 0;
    }
    expect(totalH2).toBe(0);

    await sleep(2000);
    await screenshotManager.captureAll(allPages, '11-H2-SCORE', 'Hand 2 스코어');

    // Ready
    for (const p of players) {
      p.ws.send('readyForNextHand');
    }

    await Promise.all(players.map(p => p.ws.waitFor('gameStart', 15000)));
    await sleep(1500);

    // ── Hand 3 ──
    await playOneHandWS(wsClients, activePlayers);

    const h3Score = await players[0].ws.waitFor('handScored', 30000);
    expect(h3Score.payload.handNumber).toBe(3);

    await screenshotManager.captureAll(allPages, '11-TOTAL-SCORE', '3핸드 누적 스코어');
  });
});
