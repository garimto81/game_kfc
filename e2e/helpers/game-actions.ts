/**
 * Flutter Web 게임 액션 헬퍼
 *
 * Flutter Web (--web-renderer html) 빌드 시 실제 DOM 엘리먼트가 생성되며,
 * flt-semantics 태그 또는 텍스트 기반 셀렉터로 접근 가능하다.
 *
 * TODO: 실제 Flutter Web DOM 구조 확인 후 셀렉터 조정 필요
 */
import { Page, expect } from '@playwright/test';

const SERVER_PORT = 3099;
const BASE_API = `http://localhost:${SERVER_PORT}`;

// ============================================================
// 서버 연결 / 방 관리
// ============================================================

/**
 * 서버 연결 대기 (로비 화면 로드 확인)
 */
export async function connectToServer(page: Page): Promise<void> {
  await page.goto('/');
  // Flutter Web이 로드될 때까지 대기
  // TODO: Flutter Web 로드 완료 시그널 셀렉터 조정
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
  // "방 만들기" 버튼 클릭
  // TODO: 셀렉터 조정 — Flutter Web DOM 구조 확인 필요
  await page.getByText('방 만들기').click();

  // 방 이름 입력
  await page.locator('input[type="text"]').first().fill(options.name);

  // 플레이어 이름 입력 (두 번째 텍스트 입력 필드)
  const inputs = page.locator('input[type="text"]');
  if ((await inputs.count()) > 1) {
    await inputs.nth(1).fill(options.playerName);
  }

  // 생성 확인
  await page.getByText('만들기').or(page.getByText('Create')).click();
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
  // 방 목록에서 해당 방 찾아 클릭
  // TODO: 셀렉터 조정
  await page.getByText(roomName).click();

  // 이름 입력 다이얼로그
  const nameInput = page.locator('input[type="text"]');
  if (await nameInput.isVisible()) {
    await nameInput.fill(playerName);
  }

  // 참가 확인
  await page.getByText('참가').or(page.getByText('Join')).click();
  await page.waitForTimeout(1000);
}

// ============================================================
// 게임 진행 액션
// ============================================================

/**
 * 게임 시작 대기 (gameStart 메시지 수신까지)
 */
export async function waitForGameStart(page: Page): Promise<void> {
  // gameStart 후 딜링 애니메이션이 완료될 때까지 대기
  // TODO: 실제 게임 시작 시그널 셀렉터 조정
  await page.waitForTimeout(3000);
}

/**
 * 호스트가 Start Game 클릭
 */
export async function startGame(page: Page): Promise<void> {
  await page.getByText('Start Game').or(page.getByText('게임 시작')).click();
  // 딜러 선택 애니메이션 대기
  await page.waitForTimeout(2000);
}

/**
 * 내 턴이 될 때까지 대기
 * 녹색 턴 인디케이터 또는 카드가 손에 들어올 때까지
 */
export async function waitForMyTurn(page: Page, timeoutMs = 30_000): Promise<void> {
  // 턴 인디케이터: Confirm 버튼이 활성화되면 내 턴
  // 또는 카드가 핸드에 나타나면 내 턴
  // TODO: 셀렉터 조정
  try {
    await page.getByText('Confirm').or(page.getByText('확인')).waitFor({
      state: 'visible',
      timeout: timeoutMs,
    });
  } catch {
    // Confirm이 안 보일 수 있음 (이미 카드를 배치해야 할 때)
  }
}

/**
 * dealCards 메시지 수신 대기 (카드가 핸드에 나타남)
 */
export async function waitForDeal(page: Page, timeoutMs = 15_000): Promise<void> {
  // 카드가 핸드 영역에 표시될 때까지 대기
  // TODO: 실제 카드 위젯 셀렉터 조정
  await page.waitForTimeout(2000);
}

/**
 * 현재 핸드 카드 목록 가져오기
 * Flutter Web에서는 시맨틱 레이블이나 data 속성으로 카드 정보를 가져올 수 있음
 */
export async function getHandCards(page: Page): Promise<string[]> {
  // TODO: 실제 카드 위젯 셀렉터 및 데이터 추출 방법 조정
  // Flutter Web HTML renderer에서는 flt-semantics로 접근 가능
  const cards = await page.locator('[aria-label*="card"]').allTextContents();
  return cards;
}

/**
 * 카드를 특정 라인에 배치 (드래그 또는 탭)
 */
export async function placeCardToLine(
  page: Page,
  cardIndex: number,
  line: 'top' | 'mid' | 'bottom'
): Promise<void> {
  // TODO: 실제 드래그 앤 드롭 또는 탭 셀렉터 조정
  // Flutter Web에서는 좌표 기반 드래그가 필요할 수 있음
  //
  // 현재 전략: 카드 위젯 탭 → 라인 영역 탭
  const handCards = page.locator('[aria-label*="card"]');
  const cardCount = await handCards.count();
  if (cardIndex < cardCount) {
    await handCards.nth(cardIndex).click();
    await page.waitForTimeout(300);

    // 라인 영역 클릭
    // TODO: 각 라인 영역의 셀렉터 조정
    const lineLocator = page.locator(`[aria-label*="${line}"]`).first();
    if (await lineLocator.isVisible()) {
      await lineLocator.click();
    }
  }
  await page.waitForTimeout(300);
}

/**
 * 카드 디스카드
 */
export async function discardCard(page: Page, cardIndex: number): Promise<void> {
  // TODO: 디스카드 영역 셀렉터 조정
  const handCards = page.locator('[aria-label*="card"]');
  const cardCount = await handCards.count();
  if (cardIndex < cardCount) {
    await handCards.nth(cardIndex).click();
    await page.waitForTimeout(300);
    // 디스카드 영역 또는 버튼 클릭
    const discardBtn = page.getByText('Discard').or(page.getByText('버리기'));
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
  await page.getByText('Confirm').or(page.getByText('확인')).click();
  await page.waitForTimeout(500);
}

/**
 * handScored 다이얼로그 대기
 */
export async function waitForScoring(page: Page, timeoutMs = 30_000): Promise<void> {
  // 스코어 다이얼로그가 나타날 때까지 대기
  // TODO: 셀렉터 조정
  try {
    await page.getByText('Ready').or(page.getByText('준비')).waitFor({
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
  await page.getByText('Ready').or(page.getByText('준비')).click();
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
  await page.getByText('Undo').or(page.getByText('되돌리기')).click();
  await page.waitForTimeout(300);
}

/**
 * Grid View 토글
 */
export async function toggleViewMode(page: Page): Promise<void> {
  // TODO: 뷰 모드 토글 버튼 셀렉터 조정
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
  // TODO: 이모트 UI 셀렉터 조정
  const emoteBtn = page.locator('[aria-label*="emote"]').first();
  if (await emoteBtn.isVisible()) {
    await emoteBtn.click();
    await page.waitForTimeout(300);
    await page.getByText(emoteId).click();
  }
  await page.waitForTimeout(300);
}
