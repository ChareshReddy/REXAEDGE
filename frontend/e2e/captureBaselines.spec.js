import { test, expect } from '@playwright/test';
import { setupMocks } from './helpers/mockApi.js';
import { createSampleBulkCreateFile } from './helpers/sampleFiles.js';
import path from 'path';
import fs from 'fs';

const BASELINE_DIR = 'C:/Users/chare/.gemini/antigravity/brain/6fce99f3-5f59-4200-af87-677b5d74db10/screenshots/baseline';

if (!fs.existsSync(BASELINE_DIR)) {
  fs.mkdirSync(BASELINE_DIR, { recursive: true });
}

test.describe('Desktop Baseline Screenshots (Pre-responsive)', () => {
  test('Capture 8 desktop baseline pages at 1366x768 and 1920x1080', async ({ page }) => {
    const viewport = page.viewportSize();
    const vpSuffix = `${viewport.width}x${viewport.height}`;

    // 1. Login
    await setupMocks(page, { authenticated: false });
    await page.goto('/signin', { waitUntil: 'networkidle' });
    await expect(page.locator('.rx-login-card, .sap-login-card, form').first()).toBeVisible();
    await page.screenshot({ path: path.join(BASELINE_DIR, `login-${vpSuffix}.png`), fullPage: false });

    // Authenticate for rest
    await setupMocks(page, { authenticated: true, role: 'admin' });

    // 2. Home
    await page.goto('/home', { waitUntil: 'networkidle' });
    await expect(page.locator('h1, h2, .rx-home-hero, .sap-home-hero').first()).toBeVisible();
    await page.screenshot({ path: path.join(BASELINE_DIR, `home-${vpSuffix}.png`), fullPage: false });

    // 3. Create Single BOM
    await page.goto('/products/bom/create/single', { waitUntil: 'networkidle' });
    await expect(page.locator('.fiori-ph-title').first()).toBeVisible();
    await page.screenshot({ path: path.join(BASELINE_DIR, `create-single-${vpSuffix}.png`), fullPage: false });

    // 4. Create Bulk BOM (upload and preview)
    await page.goto('/products/bom/create/bulk', { waitUntil: 'networkidle' });
    await expect(page.locator('.fiori-ph-title').first()).toBeVisible();
    await page.screenshot({ path: path.join(BASELINE_DIR, `create-bulk-upload-${vpSuffix}.png`), fullPage: false });

    const createBuffer = createSampleBulkCreateFile();
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'Batch_BOM_Create.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: createBuffer
    });
    await page.waitForTimeout(300);
    const continueBtn = page.locator('button:has-text("Continue")').first();
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(BASELINE_DIR, `create-bulk-preview-${vpSuffix}.png`), fullPage: false });

    // 5. Copy Single
    await page.goto('/products/bom/copy/single', { waitUntil: 'networkidle' });
    await expect(page.locator('.fiori-ph-title').first()).toBeVisible();
    await page.screenshot({ path: path.join(BASELINE_DIR, `copy-single-${vpSuffix}.png`), fullPage: false });

    // 6. Display BOM
    await page.goto('/products/bom/display', { waitUntil: 'networkidle' });
    await expect(page.locator('.fiori-ph-title').first()).toBeVisible();
    await page.screenshot({ path: path.join(BASELINE_DIR, `display-bom-${vpSuffix}.png`), fullPage: false });

    // 7. Admin > Users
    await page.goto('/admin/users', { waitUntil: 'networkidle' });
    await expect(page.locator('.fiori-ph-title').first()).toBeVisible();
    await page.screenshot({ path: path.join(BASELINE_DIR, `admin-users-${vpSuffix}.png`), fullPage: false });

    // 8. Audit logs
    await page.goto('/admin/logs/audit', { waitUntil: 'networkidle' });
    await expect(page.locator('.fiori-ph-title').first()).toBeVisible();
    await page.screenshot({ path: path.join(BASELINE_DIR, `admin-logs-audit-${vpSuffix}.png`), fullPage: false });
  });
});
