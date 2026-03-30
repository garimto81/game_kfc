/**
 * 멀티플레이어 Playwright 픽스처
 * N개의 독립 BrowserContext + Page를 생성하고 WS 인터셉터를 자동 부착한다
 */
import { test as base, BrowserContext, Page } from '@playwright/test';
import { WsInterceptor, attachInterceptor } from '../helpers/ws-interceptor';
import { ScreenshotManager } from '../helpers/screenshot-manager';

export interface PlayerHandle {
  context: BrowserContext;
  page: Page;
  interceptor: WsInterceptor;
  name: string;
}

interface MultiPlayerFixtures {
  /**
   * N명의 플레이어 생성
   * 각 플레이어는 독립 BrowserContext, Page, WsInterceptor를 가진다
   */
  createPlayers: (count: number, names?: string[]) => Promise<PlayerHandle[]>;
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

  screenshotManager: async ({}, use, testInfo) => {
    const testId = testInfo.title
      .replace(/[^a-zA-Z0-9가-힣]/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 80);
    const manager = new ScreenshotManager(testId);
    await use(manager);
    manager.generateReport();
  },
});

export { expect } from '@playwright/test';
