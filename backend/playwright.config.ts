import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  workers: 1,
  use: { baseURL: process.env.NUVEX_TEST_ORIGIN ?? 'http://localhost:3000', reducedMotion: 'reduce' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    { command: 'pnpm start:api', url: 'http://127.0.0.1:3001/api/v1/health', timeout: 30_000, reuseExistingServer: !process.env.CI },
    { command: 'pnpm --filter @nuvex/web start', url: 'http://localhost:3000', timeout: 30_000, reuseExistingServer: !process.env.CI },
  ],
});
