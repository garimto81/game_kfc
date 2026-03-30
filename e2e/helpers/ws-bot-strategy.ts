/**
 * WS 봇 전략 — ws-protocol.test.js의 봇 로직을 TypeScript로 포팅
 *
 * WSGameClient와 함께 사용하여 서버에서 받은 카드를
 * WS 메시지로 배치/디스카드/확인한다.
 */
import { WSGameClient, GameMessage } from './ws-game-client';

export interface Card {
  rank: number;
  suit: number;
  rankName?: string;
  suitName?: string;
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

// ============================================================
// 전략 함수
// ============================================================

function sortByRankDesc(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => b.rank - a.rank || b.suit - a.suit);
}

function remainingSlots(board: BoardState): { top: number; mid: number; bottom: number } {
  return {
    top: 3 - board.top.length,
    mid: 5 - board.mid.length,
    bottom: 5 - board.bottom.length,
  };
}

/**
 * Round 1: 5장 → bottom 2, mid 2, top 1
 */
function strategyR1(hand: Card[], board: BoardState): BotDecision {
  const sorted = sortByRankDesc(hand);
  const slots = remainingSlots(board);
  const placements: PlacementAction[] = [];
  let idx = 0;

  for (let i = 0; i < 2 && idx < sorted.length && slots.bottom > i; i++, idx++) {
    placements.push({ card: sorted[idx], line: 'bottom' });
  }
  for (let i = 0; i < 2 && idx < sorted.length && slots.mid > i; i++, idx++) {
    placements.push({ card: sorted[idx], line: 'mid' });
  }
  if (idx < sorted.length && slots.top > 0) {
    placements.push({ card: sorted[idx], line: 'top' });
  }

  return { placements, discard: null };
}

/**
 * Round 2-4: 3장 → 2배치 + 1버림
 */
function strategyR2to4(hand: Card[], board: BoardState): BotDecision {
  const sorted = sortByRankDesc(hand);
  const slots = remainingSlots(board);
  const discard = sorted[sorted.length - 1];
  const toPlace = sorted.slice(0, 2);

  const lineOrder = (['bottom', 'mid', 'top'] as const)
    .filter((l) => slots[l] > 0)
    .sort((a, b) => slots[b] - slots[a]);

  const placements: PlacementAction[] = [];
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
 * Round 5: 4인+ → 2장 모두 배치 / 2-3인 → R2-4 동일
 */
function strategyR5(hand: Card[], board: BoardState, is4Plus: boolean): BotDecision {
  if (is4Plus && hand.length === 2) {
    const sorted = sortByRankDesc(hand);
    const slots = remainingSlots(board);
    const lineOrder = (['bottom', 'mid', 'top'] as const)
      .filter((l) => slots[l] > 0)
      .sort((a, b) => slots[b] - slots[a]);

    const placements: PlacementAction[] = [];
    for (let i = 0; i < sorted.length && i < lineOrder.length; i++) {
      placements.push({ card: sorted[i], line: lineOrder[i] });
    }

    return { placements, discard: null };
  }

  return strategyR2to4(hand, board);
}

/**
 * Fantasyland: 14장 → 13배치 + 1버림
 */
function strategyFL(hand: Card[], _board: BoardState): BotDecision {
  const sorted = sortByRankDesc(hand);
  const discard = sorted[sorted.length - 1];
  const toPlace = sorted.slice(0, 13);
  const placements: PlacementAction[] = [];

  for (let i = 0; i < 5; i++) placements.push({ card: toPlace[i], line: 'bottom' });
  for (let i = 5; i < 10; i++) placements.push({ card: toPlace[i], line: 'mid' });
  for (let i = 10; i < 13; i++) placements.push({ card: toPlace[i], line: 'top' });

  return { placements, discard };
}

// ============================================================
// 메인 결정 함수
// ============================================================

/**
 * 봇 배치 결정
 */
export function decidePlacement(
  hand: Card[],
  board: BoardState,
  round: number,
  isFantasyland: boolean,
  activePlayers: number
): BotDecision {
  if (isFantasyland) return strategyFL(hand, board);
  if (round === 1) return strategyR1(hand, board);
  if (round === 5) return strategyR5(hand, board, activePlayers >= 4);
  return strategyR2to4(hand, board);
}

// ============================================================
// WS 기반 봇 턴 실행
// ============================================================

/**
 * stateUpdate 메시지에서 해당 플레이어의 보드 상태를 추출한다.
 */
export function extractBoard(client: WSGameClient): BoardState {
  const stateMsg = client.getLastMessage('stateUpdate');
  if (stateMsg && stateMsg.payload.players && client.playerId) {
    const playerData = stateMsg.payload.players[client.playerId];
    if (playerData && playerData.board) {
      return playerData.board as BoardState;
    }
  }
  return { top: [], mid: [], bottom: [] };
}

/**
 * WSGameClient로 한 턴을 수행한다.
 * 1. dealCards 대기
 * 2. 봇 전략으로 배치 결정
 * 3. placeCard/discardCard/confirmPlacement 전송
 */
export async function playBotTurn(
  client: WSGameClient,
  activePlayers: number,
  timeout = 30000
): Promise<GameMessage> {
  // dealCards 대기
  const dealMsg = await client.waitFor('dealCards', timeout);
  const cards = dealMsg.payload.cards as Card[];
  const round = dealMsg.payload.round as number;
  const isFL = dealMsg.payload.inFantasyland === true;

  // 현재 보드 상태 추출
  const board = extractBoard(client);

  // 봇 전략 결정
  const decision = decidePlacement(cards, board, round, isFL, activePlayers);

  // 카드 배치
  for (const p of decision.placements) {
    client.send('placeCard', { card: p.card, line: p.line });
  }

  // 디스카드
  if (decision.discard) {
    client.send('discardCard', { card: decision.discard });
  }

  // 확인
  client.send('confirmPlacement');

  return dealMsg;
}

/**
 * 5라운드 전체를 봇으로 수행한다.
 * 턴 기반 게임이므로 자기 턴이 올 때까지 대기한다.
 */
export async function playFullHand(
  clients: WSGameClient[],
  activePlayers: number,
  onRoundComplete?: (round: number) => Promise<void>
): Promise<void> {
  for (let round = 1; round <= 5; round++) {
    // 각 클라이언트가 자기 턴에 dealCards를 받으면 수행
    for (const client of clients) {
      await playBotTurn(client, activePlayers);
    }

    if (onRoundComplete) {
      await onRoundComplete(round);
    }
  }
}
