import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
        (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'android-layout',
      use: {
        browserName: 'chromium',
        viewport: { width: 393, height: 852 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 1,
      },
    },
    {
      name: 'desktop-validation',
      use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 } },
    },
  ],
  webServer: {
    command: 'npm run serve',
    url: 'http://127.0.0.1:3100/api/health',
    env: { PORT: '3100', MARKET_DATA_MODE: 'demo' },
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
