/**
 * Flutter Web 게임 액션 헬퍼
 *
 * Flutter Web (--web-renderer html) 빌드 시 Semantics 위젯이 aria-label 속성으로
 * DOM에 노출된다. 모든 셀렉터는 aria-label 기반으로 동작한다.
 */
import { Page, expect } from '@playwright/test';

const SERVER_PORT = parseInt(process.env.SERVER_PORT || '8098');
const BASE_API = `http://localhost:${SERVER_PORT}`;

// ============================================================
// 셀렉터 정의
// ============================================================

/** 핸드 카드 전체 (hand-card-0, hand-card-1, ...) */
const handCardSelector = '[aria-label^="hand-card-"]';

/** 특정 핸드 카드 */
const handCard = (idx: number) => `[aria-label="hand-card-${idx}"]`;

/** 보드 슬롯 (slot-top-0, slot-mid-2, ...) */
const boardSlot = (line: string, idx: number) =>
  `[aria-label="slot-${line}-${idx}"]`;

/** 보드 라인 (board-line-top, board-line-mid, board-line-bottom) */
const boardLine = (line: string) => `[aria-label="board-line-${line}"]`;

/** 특정 카드 (card-ace-spade, card-two-heart, ...) */
const specificCard = (rank: string, suit: string) =>
  `[aria-label="card-${rank}-${suit}"]`;

// 버튼
const confirmBtnSelector = '[aria-label="confirm-button"]';
const readyBtnSelector = '[aria-label="ready-button"]';
const undoBtnSelector = '[aria-label="undo-button"]';
const startGameBtnSelector = '[aria-label="start-game-button"]';
const createRoomBtnSelector = '[aria-label="create-room-button"]';
const joinRoomBtnSelector = '[aria-label="join-room-button"]';

// 상태
const turnIndicatorSelector = '[aria-label^="turn-indicator-"]';
const myTurnSelector = '[aria-label="turn-indicator-my-turn"]';
const waitingTurnSelector = '[aria-label="turn-indicator-waiting"]';
const foldedBannerSelector = '[aria-label="folded-banner"]';
const fantasylandBadgeSelector = '[aria-label="fantasyland-badge"]';
const scoreBarSelector = '[aria-label="score-bar"]';
const turnTimerSelector = '[aria-label="turn-timer"]';
const handAreaSelector = '[aria-label="hand-area"]';

// 로비
const roomItem = (roomId: string) => `[aria-label="room-item-${roomId}"]`;
const playerNameInputSelector = '[aria-label="player-name-input"]';

// ============================================================
// 서버 연결 / 방 관리
// ============================================================

/**
 * 서버 연결 대기 (로비 화면 로드 확인)
 */
export async function connectToServer(page: Page): Promise<void> {
  await page.goto('/');
  // Flutter Web이 로드될 때까지 대기
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000); // Flutter 초기화 대기
}

/**
 * REST API로 방 생성
 */
export async function createRoomViaAPI(options: {
  name: string;
  maxPlayers?: number;
  timeLimit?: number;
}): Promise<{ id: string; name: string }> {
  const res = await fetch(`${BASE_API}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: options.name,
      max_players: options.maxPlayers ?? 3,
      turn_time_limit: options.timeLimit ?? 60,
    }),
  });
  return res.json();
}

/**
 * UI를 통해 방 생성
 */
export async function createRoom(
  page: Page,
  options: {
    name: string;
    maxPlayers?: number;
    timeLimit?: number;
    playerName: string;
  }
): Promise<void> {
  // Create 버튼 클릭
  await page.locator(createRoomBtnSelector).click();

  // 플레이어 이름 입력
  const nameInput = page.locator(playerNameInputSelector);
  if (await nameInput.isVisible()) {
    await nameInput.locator('input').fill(options.playerName);
  }

  // 방 이름 입력
  const inputs = page.locator('input[type="text"]');
  if ((await inputs.count()) > 1) {
    await inputs.nth(1).fill(options.name);
  }

  // 생성 확인
  await page.getByText('Create').click();
  await page.waitForTimeout(1000);
}

/**
 * UI를 통해 방 참가
 */
export async function joinRoom(
  page: Page,
  roomName: string,
  playerName: string
): Promise<void> {
  // 방 목록에 방이 나타날 때까지 대기 (로비 WS 업데이트 또는 페이지 리프레시)
  const roomText = page.getByText(roomName);
  let found = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    if (await roomText.isVisible({ timeout: 1000 }).catch(() => false)) {
      found = true;
      break;
    }
    // 로비 WS가 아직 방 목록을 전달하지 않았으면 페이지 새로고침
    if (attempt % 3 === 2) {
      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
    } else {
      await page.waitForTimeout(1500);
    }
  }
  if (!found) {
    throw new Error(`Room "${roomName}" not found in lobby after 15s. Check lobby WS broadcast.`);
  }

  // 방 목록에서 해당 방의 Join 버튼 클릭
  const roomCard = roomText.locator('..');
  const joinBtn = roomCard.locator(joinRoomBtnSelector);
  if (await joinBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await joinBtn.click();
  } else {
    // fallback: 방 이름 텍스트 또는 가까운 Join 버튼 클릭
    const nearbyJoin = page.getByText('Join').first();
    if (await nearbyJoin.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nearbyJoin.click();
    } else {
      await roomText.click();
    }
  }

  // 이름 입력 다이얼로그
  await page.waitForTimeout(500);
  const nameInput = page.locator(playerNameInputSelector);
  if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await nameInput.locator('input').fill(playerName);
    await page.getByText('Join').last().click();
  }

  await page.waitForTimeout(1000);
}

// ============================================================
// 게임 진행 액션
// ============================================================

/**
 * 게임 시작 대기 (gameStart 메시지 수신까지)
 */
export async function waitForGameStart(page: Page): Promise<void> {
  // 턴 인디케이터 또는 보드 라인이 나타날 때까지 대기
  try {
    await page.locator(turnIndicatorSelector).waitFor({
      state: 'visible',
      timeout: 10_000,
    });
  } catch {
    // 딜링 애니메이션 시간 대기
    await page.waitForTimeout(3000);
  }
}

/**
 * 호스트가 Start Game 클릭
 */
export async function startGame(page: Page): Promise<void> {
  await page.locator(startGameBtnSelector).click();
  // 딜러 선택 애니메이션 대기
  await page.waitForTimeout(2000);
}

/**
 * 내 턴이 될 때까지 대기
 */
export async function waitForMyTurn(page: Page, timeoutMs = 30_000): Promise<void> {
  try {
    await page.locator(myTurnSelector).waitFor({
      state: 'visible',
      timeout: timeoutMs,
    });
  } catch {
    // 이미 카드를 배치해야 할 수 있음 — 핸드 카드 존재 확인
    const cards = page.locator(handCardSelector);
    if ((await cards.count()) > 0) return;
  }
}

/**
 * dealCards 메시지 수신 대기 (카드가 핸드에 나타남)
 */
export async function waitForDeal(page: Page, timeoutMs = 15_000): Promise<void> {
  try {
    await page.locator(handCardSelector).first().waitFor({
      state: 'visible',
      timeout: timeoutMs,
    });
  } catch {
    await page.waitForTimeout(2000);
  }
}

/**
 * 현재 핸드 카드 목록 가져오기
 * aria-label에서 카드 정보를 추출한다 (예: "hand-card-0")
 */
export async function getHandCards(page: Page): Promise<string[]> {
  const cards = page.locator(handCardSelector);
  const count = await cards.count();
  const labels: string[] = [];
  for (let i = 0; i < count; i++) {
    const label = await cards.nth(i).getAttribute('aria-label');
    if (label) labels.push(label);
  }
  return labels;
}

/**
 * 카드를 특정 라인에 배치 (드래그 또는 탭)
 */
export async function placeCardToLine(
  page: Page,
  cardIndex: number,
  line: 'top' | 'mid' | 'bottom'
): Promise<void> {
  const card = page.locator(handCard(cardIndex));
  if (await card.isVisible()) {
    // 카드 탭
    await card.click();
    await page.waitForTimeout(300);

    // 라인 영역 또는 빈 슬롯 클릭
    const lineArea = page.locator(boardLine(line));
    if (await lineArea.isVisible()) {
      await lineArea.click();
    }
  }
  await page.waitForTimeout(300);
}

/**
 * 카드 디스카드
 */
export async function discardCard(page: Page, cardIndex: number): Promise<void> {
  const card = page.locator(handCard(cardIndex));
  if (await card.isVisible()) {
    await card.click();
    await page.waitForTimeout(300);
    // Discard 버튼 클릭
    const discardBtn = page.getByText('Discard');
    if (await discardBtn.isVisible()) {
      await discardBtn.click();
    }
  }
  await page.waitForTimeout(300);
}

/**
 * Confirm 버튼 클릭
 */
export async function confirmPlacement(page: Page): Promise<void> {
  await page.locator(confirmBtnSelector).click();
  await page.waitForTimeout(500);
}

/**
 * handScored 다이얼로그 대기
 */
export async function waitForScoring(page: Page, timeoutMs = 30_000): Promise<void> {
  try {
    await page.locator(readyBtnSelector).waitFor({
      state: 'visible',
      timeout: timeoutMs,
    });
  } catch {
    // 다이얼로그가 다른 형태일 수 있음
  }
}

/**
 * Ready 버튼 클릭
 */
export async function clickReady(page: Page): Promise<void> {
  await page.locator(readyBtnSelector).click();
  await page.waitForTimeout(500);
}

/**
 * Play/Fold 선택
 */
export async function choosePlayOrFold(
  page: Page,
  choice: 'play' | 'fold'
): Promise<void> {
  if (choice === 'play') {
    await page.getByText('Play').click();
  } else {
    await page.getByText('Fold').click();
  }
  await page.waitForTimeout(500);
}

/**
 * Undo 버튼 클릭
 */
export async function clickUndo(page: Page): Promise<void> {
  await page.locator(undoBtnSelector).click();
  await page.waitForTimeout(300);
}

/**
 * Grid View 토글
 */
export async function toggleViewMode(page: Page): Promise<void> {
  const gridBtn = page.locator('[aria-label*="grid"]').or(page.getByText('Grid'));
  if (await gridBtn.isVisible()) {
    await gridBtn.click();
  }
  await page.waitForTimeout(500);
}

/**
 * 이모트 전송
 */
export async function sendEmote(page: Page, emoteId: string): Promise<void> {
  const emoteBtn = page.locator('[aria-label*="emote"]').first();
  if (await emoteBtn.isVisible()) {
    await emoteBtn.click();
    await page.waitForTimeout(300);
    await page.getByText(emoteId).click();
  }
  await page.waitForTimeout(300);
}

// ============================================================
// 셀렉터 export (테스트에서 직접 사용 가능)
// ============================================================

export const selectors = {
  handCard: handCardSelector,
  handCardAt: handCard,
  boardSlot,
  boardLine,
  specificCard,
  confirmBtn: confirmBtnSelector,
  readyBtn: readyBtnSelector,
  undoBtn: undoBtnSelector,
  startGameBtn: startGameBtnSelector,
  createRoomBtn: createRoomBtnSelector,
  joinRoomBtn: joinRoomBtnSelector,
  turnIndicator: turnIndicatorSelector,
  myTurn: myTurnSelector,
  waitingTurn: waitingTurnSelector,
  foldedBanner: foldedBannerSelector,
  fantasylandBadge: fantasylandBadgeSelector,
  scoreBar: scoreBarSelector,
  turnTimer: turnTimerSelector,
  handArea: handAreaSelector,
  roomItem,
  playerNameInput: playerNameInputSelector,
};
