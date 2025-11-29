import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright設定ファイル
 * Browser Automation動作確認計画に基づくテスト設定
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // webServer設定: 手動でbackendを起動している場合は、reuseExistingServerがtrueの場合は既存サーバーを使用
  // backendは手動で起動: cd backend && python run.py --port 8888
  webServer: [
    {
      command: 'npm run serve',
      url: 'http://localhost:4200',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
    // backendは手動で起動する必要があります
    // 起動コマンド: cd backend && python run.py --port 8888
  ],
});

