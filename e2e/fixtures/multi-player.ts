/**
 * 멀티플레이어 Playwright 픽스처 — WS 하이브리드 방식
 *
 * 각 플레이어에 Playwright Page(스크린샷용) + WSGameClient(게임 조작용)를 제공한다.
 * N개의 독립 BrowserContext + Page를 생성하고 WS 인터셉터를 자동 부착한다.
 */
import { test as base, Browser, BrowserContext, Page } from '@playwright/test';
import { WsInterceptor, attachInterceptor } from '../helpers/ws-interceptor';
import { WSGameClient } from '../helpers/ws-game-client';
import { ScreenshotManager } from '../helpers/screenshot-manager';
import path from 'path';

/** 기존 PlayerHandle (후방 호환) */
export interface PlayerHandle {
  context: BrowserContext;
  page: Page;
  interceptor: WsInterceptor;
  name: string;
}

/** 하이브리드 플레이어: Playwright Page + WSGameClient */
export interface HybridPlayer {
  /** Playwright Page — 스크린샷 캡처 전용 */
  page: Page;
  /** WS 게임 클라이언트 — 게임 조작 전용 */
  ws: WSGameClient;
  /** 플레이어 이름 */
  name: string;
  /** Playwright BrowserContext (정리용) */
  context: BrowserContext;
  /** WS 인터셉터 (브라우저 WS 메시지 캡처용, 후방 호환) */
  interceptor: WsInterceptor;
}

interface MultiPlayerFixtures {
  /**
   * N명의 플레이어 생성 (기존 방식 — 후방 호환)
   * 각 플레이어는 독립 BrowserContext, Page, WsInterceptor를 가진다
   */
  createPlayers: (count: number, names?: string[]) => Promise<PlayerHandle[]>;

  /**
   * N명의 하이브리드 플레이어 생성
   * 각 플레이어는 Playwright Page + WSGameClient를 가진다
   */
  createHybridPlayers: (count: number, names?: string[]) => Promise<HybridPlayer[]>;

  screenshotManager: ScreenshotManager;
}

export const test = base.extend<MultiPlayerFixtures>({
  createPlayers: async ({ browser }, use) => {
    const handles: PlayerHandle[] = [];

    const factory = async (count: number, names?: string[]): Promise<PlayerHandle[]> => {
      for (let i = 0; i < count; i++) {
        const playerName = names?.[i] ?? `Player${i + 1}`;
        const context = await browser.newContext();
        const page = await context.newPage();
        const interceptor = await attachInterceptor(page, playerName);

        handles.push({ context, page, interceptor, name: playerName });
      }
      return handles;
    };

    await use(factory);

    // teardown: 모든 컨텍스트 정리
    for (const h of handles) {
      await h.context.close().catch(() => {});
    }
  },

  createHybridPlayers: async ({ browser }, use) => {
    const players: HybridPlayer[] = [];

    const factory = async (count: number, names?: string[]): Promise<HybridPlayer[]> => {
      for (let i = 0; i < count; i++) {
        const playerName = names?.[i] ?? `Player${i + 1}`;
        const context = await browser.newContext({
          recordVideo: { dir: path.resolve(__dirname, '..', 'test-results', 'videos') },
        });
        const page = await context.newPage();
        const interceptor = await attachInterceptor(page, playerName);
        const ws = new WSGameClient(playerName);

        players.push({ page, ws, name: playerName, context, interceptor });
      }
      return players;
    };

    await use(factory);

    // teardown: WS 클라이언트 + 브라우저 컨텍스트 정리
    for (const p of players) {
      p.ws.close();
      await p.context.close().catch(() => {});
    }
  },

  screenshotManager: async ({}, use, testInfo) => {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 5).replace(':', '');
    const runId = process.env.QA_RUN_ID || `qa-run-${dateStr}-${timeStr}`;
    const specFile = path.basename(testInfo.file, '.spec.ts');
    const manager = new ScreenshotManager(runId, specFile);
    await use(manager);
    manager.generateReport();
  },
});

export { expect } from '@playwright/test';
