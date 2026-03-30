/**
 * 봇 전략 — 자동 카드 배치 로직
 *
 * WS 프로토콜 테스트 및 E2E에서 사용.
 * 카드 rank 기반 단순 전략: 높은 카드 → bottom, 중간 → mid, 낮은 → top
 */

export interface Card {
  rank: number;
  suit: number;
  rankName: string;
  suitName: string;
}

export interface BoardState {
  top: Card[];
  mid: Card[];
  bottom: Card[];
}

export interface PlacementAction {
  card: Card;
  line: 'top' | 'mid' | 'bottom';
}

export interface BotDecision {
  placements: PlacementAction[];
  discard: Card | null;
}

/**
 * 라인별 남은 슬롯 수
 */
function remainingSlots(board: BoardState): { top: number; mid: number; bottom: number } {
  return {
    top: 3 - board.top.length,
    mid: 5 - board.mid.length,
    bottom: 5 - board.bottom.length,
  };
}

/**
 * 카드를 rank 기준 내림차순 정렬
 */
function sortByRankDesc(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => b.rank - a.rank || b.suit - a.suit);
}

/**
 * Round 1 전략 (5장 배치, 버림 없음)
 * - 높은 2장 → bottom
 * - 다음 2장 → mid
 * - 최저 1장 → top
 */
function strategyR1(hand: Card[], board: BoardState): BotDecision {
  const sorted = sortByRankDesc(hand);
  const slots = remainingSlots(board);
  const placements: PlacementAction[] = [];

  // bottom에 높은 카드 2장
  let idx = 0;
  for (let i = 0; i < 2 && idx < sorted.length; i++) {
    if (slots.bottom > i) {
      placements.push({ card: sorted[idx], line: 'bottom' });
      idx++;
    }
  }

  // mid에 중간 카드 2장
  for (let i = 0; i < 2 && idx < sorted.length; i++) {
    if (slots.mid > i) {
      placements.push({ card: sorted[idx], line: 'mid' });
      idx++;
    }
  }

  // top에 나머지 1장
  if (idx < sorted.length && slots.top > 0) {
    placements.push({ card: sorted[idx], line: 'top' });
  }

  return { placements, discard: null };
}

/**
 * Round 2-4 전략 (3장: 2배치 + 1버림)
 * - 가장 빈 라인에 우선 배치
 * - 가장 낮은 카드 버림
 */
function strategyR2to4(hand: Card[], board: BoardState): BotDecision {
  const sorted = sortByRankDesc(hand);
  const slots = remainingSlots(board);
  const placements: PlacementAction[] = [];

  // 버림: 가장 낮은 카드
  const discard = sorted[sorted.length - 1];
  const toPlace = sorted.slice(0, 2);

  // 빈 슬롯이 가장 많은 라인 순서로 배치
  const lineOrder = (['bottom', 'mid', 'top'] as const)
    .filter((l) => slots[l] > 0)
    .sort((a, b) => slots[b] - slots[a]);

  for (let i = 0; i < toPlace.length && i < lineOrder.length; i++) {
    placements.push({ card: toPlace[i], line: lineOrder[i] });
  }

  // 라인이 부족하면 남은 카드도 아무 빈 라인에 배치
  if (placements.length < toPlace.length) {
    for (const card of toPlace) {
      if (placements.find((p) => p.card === card)) continue;
      for (const line of ['bottom', 'mid', 'top'] as const) {
        const used = placements.filter((p) => p.line === line).length;
        if (slots[line] - used > 0) {
          placements.push({ card, line });
          break;
        }
      }
    }
  }

  return { placements, discard };
}

/**
 * Round 5 전략 (4인+ 게임에서 2장, 버림 없음 / 2-3인은 3장 1버림)
 */
function strategyR5(hand: Card[], board: BoardState, is4Plus: boolean): BotDecision {
  if (is4Plus && hand.length === 2) {
    // 4인+: 2장 모두 배치
    const sorted = sortByRankDesc(hand);
    const slots = remainingSlots(board);
    const placements: PlacementAction[] = [];

    const lineOrder = (['bottom', 'mid', 'top'] as const)
      .filter((l) => slots[l] > 0)
      .sort((a, b) => slots[b] - slots[a]);

    for (let i = 0; i < sorted.length && i < lineOrder.length; i++) {
      placements.push({ card: sorted[i], line: lineOrder[i] });
    }

    return { placements, discard: null };
  }

  // 2-3인: R2-4와 동일 전략
  return strategyR2to4(hand, board);
}

/**
 * Fantasyland 전략 (14장: 13배치 + 1버림)
 * - 정렬 후 bottom 5, mid 5, top 3, 가장 낮은 1장 discard
 */
function strategyFL(hand: Card[], _board: BoardState): BotDecision {
  const sorted = sortByRankDesc(hand);
  const placements: PlacementAction[] = [];

  // 가장 낮은 1장 버림
  const discard = sorted[sorted.length - 1];
  const toPlace = sorted.slice(0, 13);

  // bottom 5장 (가장 높은)
  for (let i = 0; i < 5; i++) {
    placements.push({ card: toPlace[i], line: 'bottom' });
  }

  // mid 5장
  for (let i = 5; i < 10; i++) {
    placements.push({ card: toPlace[i], line: 'mid' });
  }

  // top 3장
  for (let i = 10; i < 13; i++) {
    placements.push({ card: toPlace[i], line: 'top' });
  }

  return { placements, discard };
}

/**
 * 메인 봇 결정 함수
 */
export function decidePlacement(
  hand: Card[],
  board: BoardState,
  round: number,
  isFantasyland: boolean,
  activePlayers: number
): BotDecision {
  if (isFantasyland) {
    return strategyFL(hand, board);
  }
  if (round === 1) {
    return strategyR1(hand, board);
  }
  if (round === 5) {
    return strategyR5(hand, board, activePlayers >= 4);
  }
  return strategyR2to4(hand, board);
}

/**
 * E2E용: Page에서 봇처럼 카드 자동 배치 (UI 조작)
 * WS 프로토콜 테스트에서는 decidePlacement만 사용
 */
export async function placeBotCardsUI(
  page: import('@playwright/test').Page,
  round: number,
  isFantasyland: boolean
): Promise<void> {
  const P = 'css=pierce/';
  const handCardSelector = `${P}flt-semantics[aria-label^="hand-card-"]`;
  const boardLineSelector = (line: string) => `${P}flt-semantics[aria-label="board-line-${line}"]`;

  // 핸드 카드가 보일 때까지 대기
  try {
    await page.locator(handCardSelector).first().waitFor({
      state: 'visible',
      timeout: 10_000,
    });
  } catch {
    // 카드가 없으면 턴이 아님 — 스킵
    return;
  }

  const cardCount = await page.locator(handCardSelector).count();
  if (cardCount === 0) return;

  if (isFantasyland) {
    // FL: 14장 → bottom 5, mid 5, top 3, discard 1
    for (let i = 0; i < 5; i++) {
      await page.locator(handCardSelector).first().click();
      await page.waitForTimeout(200);
      await page.locator(boardLineSelector('bottom')).click();
      await page.waitForTimeout(200);
    }
    for (let i = 0; i < 5; i++) {
      await page.locator(handCardSelector).first().click();
      await page.waitForTimeout(200);
      await page.locator(boardLineSelector('mid')).click();
      await page.waitForTimeout(200);
    }
    for (let i = 0; i < 3; i++) {
      await page.locator(handCardSelector).first().click();
      await page.waitForTimeout(200);
      await page.locator(boardLineSelector('top')).click();
      await page.waitForTimeout(200);
    }
    // 나머지 1장 디스카드
    const discardBtn = page.locator(`${P}flt-semantics[aria-label*="discard" i]`);
    if (await page.locator(handCardSelector).count() > 0) {
      await page.locator(handCardSelector).first().click();
      await page.waitForTimeout(200);
      if (await discardBtn.isVisible()) {
        await discardBtn.click();
      }
    }
  } else if (round === 1) {
    // R1: 5장 → bottom 2, mid 2, top 1
    const lines: Array<'bottom' | 'mid' | 'top'> = ['bottom', 'bottom', 'mid', 'mid', 'top'];
    for (const line of lines) {
      const cards = page.locator(handCardSelector);
      if ((await cards.count()) === 0) break;
      await cards.first().click();
      await page.waitForTimeout(200);
      const lineEl = page.locator(boardLineSelector(line));
      if (await lineEl.isVisible()) {
        await lineEl.click();
      }
      await page.waitForTimeout(300);
    }
  } else {
    // R2~R5: 3장 → 2배치 + 1디스카드
    const lines: Array<'bottom' | 'mid'> = ['bottom', 'mid'];
    for (const line of lines) {
      const cards = page.locator(handCardSelector);
      if ((await cards.count()) === 0) break;
      await cards.first().click();
      await page.waitForTimeout(200);
      const lineEl = page.locator(boardLineSelector(line));
      if (await lineEl.isVisible()) {
        await lineEl.click();
      }
      await page.waitForTimeout(300);
    }
    // 나머지 1장 디스카드
    const remaining = page.locator(handCardSelector);
    if ((await remaining.count()) > 0) {
      await remaining.first().click();
      await page.waitForTimeout(200);
      const discardBtn = page.locator(`${P}flt-semantics[aria-label*="discard" i]`);
      if (await discardBtn.isVisible()) {
        await discardBtn.click();
      }
    }
  }

  // Confirm 클릭
  const confirmBtn = page.locator(`${P}flt-semantics[aria-label="confirm-button"]`);
  if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await confirmBtn.click();
  }
  await page.waitForTimeout(500);
}
