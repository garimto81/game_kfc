import { defineConfig, devices } from '@playwright/test';
import path from 'path';

const SERVER_PORT = 3099;
const FLUTTER_PORT = 9099;

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
    baseURL: `http://localhost:${FLUTTER_PORT}`,
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

  webServer: [
    {
      command: `PORT=${SERVER_PORT} node ../server/index.js`,
      port: SERVER_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      cwd: path.resolve(__dirname),
    },
  ],
});
