import { defineConfig } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  expect: {
    timeout: 5000
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],
  outputDir: 'test-results',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    deviceScaleFactor: 1
  },
  projects: [
    {
      name: '1366x768',
      use: {
        browserName: 'chromium',
        viewport: { width: 1366, height: 768 }
      }
    },
    {
      name: '1920x1080',
      use: {
        browserName: 'chromium',
        viewport: { width: 1920, height: 1080 }
      }
    },
    {
      name: '1024x768',
      use: {
        browserName: 'chromium',
        viewport: { width: 1024, height: 768 }
      }
    },
    {
      name: '390x844',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 }
      }
    }
  ],
  webServer: {
    command: 'npx vite',
    url: 'http://localhost',
    reuseExistingServer: true,
    timeout: 30000
  }
});
