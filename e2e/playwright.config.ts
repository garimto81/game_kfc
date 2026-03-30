import { defineConfig, devices } from '@playwright/test';
import path from 'path';

// 단일 포트: 게임 서버가 Flutter Web + API + WS를 모두 서빙
const SERVER_PORT = parseInt(process.env.SERVER_PORT || '8098');

export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // 게임 테스트는 순서 의존적
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // 멀티플레이어 테스트는 단일 워커
  timeout: 120_000, // 게임은 길어질 수 있음

  reporter: [
    ['html', { outputFolder: 'reports/html' }],
    ['list'],
  ],

  use: {
    baseURL: `http://localhost:${SERVER_PORT}`,
    trace: 'on-first-retry',
    screenshot: 'on',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: process.platform === 'win32'
      ? `set PORT=${SERVER_PORT}&& node ../server/index.js`
      : `PORT=${SERVER_PORT} node ../server/index.js`,
    port: SERVER_PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    cwd: path.resolve(__dirname),
  },
});
