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
// CanvasKit + Semantics 트리: flt-semantics 요소는 flutter-view의
// shadowRoot 안에 있으므로 css=pierce/ 접두사로 shadow DOM을 관통한다
// ============================================================

/** Shadow DOM 관통 접두사 */
const P = 'css=pierce/';

/** 핸드 카드 전체 (hand-card-0, hand-card-1, ...) */
const handCardSelector = `${P}flt-semantics[aria-label^="hand-card-"]`;

/** 특정 핸드 카드 */
const handCard = (idx: number) => `${P}flt-semantics[aria-label="hand-card-${idx}"]`;

/** 보드 슬롯 (slot-top-0, slot-mid-2, ...) */
const boardSlot = (line: string, idx: number) =>
  `${P}flt-semantics[aria-label="slot-${line}-${idx}"]`;

/** 보드 라인 (board-line-top, board-line-mid, board-line-bottom) */
const boardLine = (line: string) => `${P}flt-semantics[aria-label="board-line-${line}"]`;

/** 특정 카드 (card-ace-spade, card-two-heart, ...) */
const specificCard = (rank: string, suit: string) =>
  `${P}flt-semantics[aria-label="card-${rank}-${suit}"]`;

// 버튼
const confirmBtnSelector = `${P}flt-semantics[aria-label="confirm-button"]`;
const readyBtnSelector = `${P}flt-semantics[aria-label="ready-button"]`;
const undoBtnSelector = `${P}flt-semantics[aria-label="undo-button"]`;
const startGameBtnSelector = `${P}flt-semantics[aria-label="start-game-button"]`;
const createRoomBtnSelector = `${P}flt-semantics[aria-label="create-room-button"]`;
const joinRoomBtnSelector = `${P}flt-semantics[aria-label="join-room-button"]`;

// 상태
const turnIndicatorSelector = `${P}flt-semantics[aria-label^="turn-indicator-"]`;
const myTurnSelector = `${P}flt-semantics[aria-label="turn-indicator-my-turn"]`;
const waitingTurnSelector = `${P}flt-semantics[aria-label="turn-indicator-waiting"]`;
const foldedBannerSelector = `${P}flt-semantics[aria-label="folded-banner"]`;
const fantasylandBadgeSelector = `${P}flt-semantics[aria-label="fantasyland-badge"]`;
const scoreBarSelector = `${P}flt-semantics[aria-label="score-bar"]`;
const turnTimerSelector = `${P}flt-semantics[aria-label="turn-timer"]`;
const handAreaSelector = `${P}flt-semantics[aria-label="hand-area"]`;

// 로비
const roomItem = (roomId: string) => `${P}flt-semantics[aria-label="room-item-${roomId}"]`;
const playerNameInputSelector = `${P}flt-semantics[aria-label="player-name-input"]`;

// ============================================================
// 서버 연결 / 방 관리
// ============================================================

/**
 * Flutter CanvasKit Semantics 트리 내부의 요소를 찾는 locator
 * flutter-view shadowRoot 안의 flt-semantics 요소를 aria-label로 탐색
 */
export function flutterLocator(page: Page, ariaLabel: string) {
  return page.locator(`css=pierce/flt-semantics[aria-label*="${ariaLabel}"]`);
}

/**
 * Flutter CanvasKit Semantics 트리 내부의 버튼 요소를 찾는 locator
 */
export function flutterButton(page: Page, label: string) {
  return page.locator(
    `css=pierce/flt-semantics[role="button"][aria-label*="${label}"]`
  );
}

/**
 * Flutter CanvasKit Semantics 트리 활성화 + 존재 확인
 * Dart 코드에서 SemanticsBinding.instance.ensureSemantics()를 호출하지만
 * 추가 안전장치로 JS에서도 semantics enabler를 클릭한다
 */
async function ensureSemantics(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    // 방법 1: flutter-view shadowRoot 내 flt-semantics-enabler 클릭
    const fv = document.querySelector('flutter-view');
    if (fv && fv.shadowRoot) {
      const enabler = fv.shadowRoot.querySelector(
        'flt-semantics-enabler'
      ) as HTMLElement | null;
      if (enabler) enabler.click();
      return !!fv.shadowRoot.querySelector('flt-semantics-host');
    }
    // 방법 2: 구 버전 Flutter (flt-glass-pane 기반)
    const gp = document.querySelector('flt-glass-pane');
    if (gp && gp.shadowRoot) {
      const enabler = gp.shadowRoot.querySelector(
        'flt-semantics-enabler'
      ) as HTMLElement | null;
      if (enabler) enabler.click();
      return !!gp.shadowRoot.querySelector('flt-semantics-host');
    }
    return false;
  });
}

/**
 * Flutter shadowRoot 내부의 DOM 구조를 덤프 (디버깅용)
 */
export async function dumpFlutterDom(page: Page): Promise<string> {
  return page.evaluate(() => {
    const fv = document.querySelector('flutter-view');
    if (fv && fv.shadowRoot) {
      return fv.shadowRoot.innerHTML.substring(0, 5000);
    }
    const gp = document.querySelector('flt-glass-pane');
    if (gp && gp.shadowRoot) {
      return gp.shadowRoot.innerHTML.substring(0, 5000);
    }
    return 'No flutter-view or flt-glass-pane shadow root found';
  });
}

/**
 * 서버 연결 대기 (로비 화면 로드 확인)
 * CanvasKit Semantics 트리를 강제 활성화한다
 */
export async function connectToServer(page: Page): Promise<void> {
  await page.goto('/');
  // Flutter Web이 로드될 때까지 대기
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000); // Flutter CanvasKit 초기화 대기

  // CanvasKit Semantics 강제 활성화
  const semanticsFound = await ensureSemantics(page);
  console.log(`[connectToServer] Semantics host found: ${semanticsFound}`);

  if (!semanticsFound) {
    // 재시도: Flutter 로딩이 느릴 수 있음
    await page.waitForTimeout(2000);
    const retry = await ensureSemantics(page);
    console.log(`[connectToServer] Semantics retry: ${retry}`);
  }

  // DOM 구조 디버그 출력
  const dom = await dumpFlutterDom(page);
  console.log(`[connectToServer] Flutter DOM (first 2000 chars): ${dom.substring(0, 2000)}`);
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

  // 플레이어 이름 입력 — pierce로 shadow DOM 내 input 접근
  const nameInput = page.locator(playerNameInputSelector);
  if (await nameInput.isVisible()) {
    const input = page.locator(`${P}flt-semantics[aria-label="player-name-input"] input`);
    if (await input.count() > 0) {
      await input.fill(options.playerName);
    }
  }

  // 방 이름 입력
  const inputs = page.locator(`${P}input[type="text"]`);
  if ((await inputs.count()) > 1) {
    await inputs.nth(1).fill(options.name);
  }

  // 생성 확인 — CanvasKit에서는 getByText 대신 aria-label 기반 셀렉터
  const createConfirmBtn = page.locator(`${P}flt-semantics[aria-label*="Create"]`);
  if (await createConfirmBtn.count() > 0) {
    await createConfirmBtn.last().click();
  } else {
    // fallback: 다이얼로그의 Create 버튼은 별도 Semantics가 없을 수 있음
    await page.locator(createRoomBtnSelector).click();
  }
  await page.waitForTimeout(1000);
}

/**
 * UI를 통해 방 참가
 * CanvasKit에서는 getByText()가 동작하지 않으므로 aria-label 기반으로 방을 찾는다
 */
export async function joinRoom(
  page: Page,
  roomName: string,
  playerName: string
): Promise<void> {
  // 방 목록에 방이 나타날 때까지 대기
  // CanvasKit Semantics: room-item-{id} aria-label로 방 카드 존재 확인
  // 방 이름은 aria-label에 포함되지 않으므로 join-room-button 존재로 판단
  const joinBtnLocator = page.locator(joinRoomBtnSelector);
  let found = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    const count = await joinBtnLocator.count().catch(() => 0);
    if (count > 0) {
      found = true;
      break;
    }
    // 로비 WS가 아직 방 목록을 전달하지 않았으면 페이지 새로고침
    if (attempt % 3 === 2) {
      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);
      // 새로고침 후 semantics 재활성화
      await page.evaluate(() => {
        const fv = document.querySelector('flutter-view');
        if (fv && fv.shadowRoot) {
          const enabler = fv.shadowRoot.querySelector(
            'flt-semantics-enabler'
          ) as HTMLElement | null;
          if (enabler) enabler.click();
        }
      });
      await page.waitForTimeout(1000);
    } else {
      await page.waitForTimeout(1500);
    }
  }
  if (!found) {
    // DOM 디버그 출력
    const dom = await dumpFlutterDom(page);
    console.log(`[joinRoom] Flutter DOM dump: ${dom.substring(0, 3000)}`);
    throw new Error(
      `Room "${roomName}" not found in lobby after 15s. No join-room-button visible.`
    );
  }

  // Join 버튼 클릭 (첫 번째 방의 Join 버튼)
  await joinBtnLocator.first().click();

  // 이름 입력 다이얼로그
  await page.waitForTimeout(500);
  const nameInput = page.locator(playerNameInputSelector);
  if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    // flt-semantics 내부의 input 요소에 직접 접근
    const input = page.locator(`${P}flt-semantics[aria-label="player-name-input"] input`);
    if (await input.count() > 0) {
      await input.fill(playerName);
    }
    // Join 확인 버튼 — aria-label 기반
    const joinConfirmBtn = page.locator(
      `${P}flt-semantics[aria-label*="Join"]`
    );
    if (await joinConfirmBtn.count() > 0) {
      await joinConfirmBtn.last().click();
    }
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
    // Discard 버튼 클릭 — CanvasKit: aria-label 기반
    const discardBtn = page.locator(`${P}flt-semantics[aria-label*="discard" i]`);
    if (await discardBtn.count() > 0) {
      await discardBtn.first().click();
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
  const label = choice === 'play' ? 'Play' : 'Fold';
  const btn = page.locator(`${P}flt-semantics[aria-label*="${label}"]`);
  if (await btn.count() > 0) {
    await btn.first().click();
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
  const gridBtn = page.locator(`${P}flt-semantics[aria-label*="grid" i]`);
  if (await gridBtn.count() > 0) {
    await gridBtn.first().click();
  }
  await page.waitForTimeout(500);
}

/**
 * 이모트 전송
 */
export async function sendEmote(page: Page, emoteId: string): Promise<void> {
  const emoteBtn = page.locator(`${P}flt-semantics[aria-label*="emote" i]`);
  if (await emoteBtn.count() > 0) {
    await emoteBtn.first().click();
    await page.waitForTimeout(300);
    const emoteOption = page.locator(`${P}flt-semantics[aria-label*="${emoteId}"]`);
    if (await emoteOption.count() > 0) {
      await emoteOption.first().click();
    }
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
