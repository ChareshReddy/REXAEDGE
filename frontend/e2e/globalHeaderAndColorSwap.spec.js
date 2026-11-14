import { test, expect } from '@playwright/test';
import { setupMocks } from './helpers/mockApi.js';
import { createSampleBulkCreateFile, createSampleBulkCopyFile } from './helpers/sampleFiles.js';
import path from 'path';

const SCREENSHOT_DIR = 'C:/Users/chare/.gemini/antigravity/brain/6fce99f3-5f59-4200-af87-677b5d74db10/screenshots';

// Calculate WCAG contrast
function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function parseRgb(rgbStr) {
  const match = rgbStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return [0, 0, 0];
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}

function getContrastRatio(rgbStr1, rgbStr2) {
  const [r1, g1, b1] = parseRgb(rgbStr1);
  const [r2, g2, b2] = parseRgb(rgbStr2);
  const l1 = getLuminance(r1, g1, b1);
  const l2 = getLuminance(r2, g2, b2);
  const brighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (brighter + 0.05) / (darker + 0.05);
}

test.describe('Global Page Header Band & Card/Table Color Swap Verification', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page, { authenticated: true, role: 'admin' });

    let jobType = 'preflight';
    await page.route('**/api/bom/job/**', async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (url.includes('/active')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, job: null })
        });
      }
      if (url.includes('/start') || method === 'POST') {
        let postData = {};
        try { postData = route.request().postDataJSON() || {}; } catch (_) {}
        jobType = postData.type || 'create_bulk';
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            jobId: 'job-123',
            total: 2,
            status: 'PROCESSING'
          })
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          job: {
            id: 'job-123',
            jobId: 'job-123',
            type: jobType,
            status: 'COMPLETED',
            processed: 2,
            total: 2,
            successCount: 2,
            failedCount: 0,
            skippedCount: 0,
            notProcessedCount: 0,
            results: [
              {
                sequenceNum: 1,
                material: 'A1BH0214C',
                plant: '1010',
                bomUsage: '1',
                alternativeBom: '01',
                bomNumber: '00010045',
                status: 'SUCCESS',
                message: 'BOM created successfully'
              },
              {
                sequenceNum: 2,
                material: 'B2CH0315D',
                plant: '1010',
                bomUsage: '1',
                alternativeBom: '01',
                bomNumber: '00010046',
                status: 'SUCCESS',
                message: 'BOM created successfully'
              }
            ]
          }
        })
      });
    });

    // Mock validation & execution endpoint responses for smooth transitions
    await page.route('**/api/bom/validate-preflight', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          boms: [
            {
              status: 'Ready',
              material: 'A1PSB001B',
              plant: '1010',
              bomUsage: '1',
              alternativeBom: '25',
              baseQty: '100',
              baseUnit: 'EA',
              bomStatus: '01',
              validFrom: '12.11.2026',
              warnings: [],
              errors: []
            }
          ]
        })
      });
    });

    await page.route('**/api/bom/create', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          bomNumber: '00012345',
          message: 'BOM created successfully'
        })
      });
    });
  });

  // Helper to assert header, card, table styles
  async function assertPageVisualStyles(page, screenName) {
    // 1. Page Header band (#EAF1FB -> rgb(234, 241, 251))
    const pageHeader = page.locator('.fiori-ph');
    await expect(pageHeader.first()).toBeVisible();

    const phBg = await pageHeader.first().evaluate(el => window.getComputedStyle(el).backgroundColor);
    expect(phBg).toBe('rgb(234, 241, 251)'); // #EAF1FB

    const title = page.locator('.fiori-ph-title').first();
    const titleColor = await title.evaluate(el => window.getComputedStyle(el).color);
    expect(titleColor).toBe('rgb(11, 45, 87)'); // #0B2D57

    const contrastTitle = getContrastRatio(titleColor, phBg);
    expect(contrastTitle).toBeGreaterThanOrEqual(4.5);

    // 2. Subtitle if present (#4A5F77 -> rgb(74, 95, 119))
    const subtitle = page.locator('.fiori-ph-subtitle').first();
    if (await subtitle.count() > 0 && await subtitle.isVisible()) {
      const subColor = await subtitle.evaluate(el => window.getComputedStyle(el).color);
      const contrastSub = getContrastRatio(subColor, phBg);
      expect(contrastSub).toBeGreaterThanOrEqual(4.5);
    }

    // 3. Card Header Band (#E4EDF8 -> rgb(228, 237, 248) with left navy accent line #0B2D57 -> rgb(11, 45, 87))
    const tintedCardHeader = page.locator('.rx-form-section-header-tinted').first();
    if (await tintedCardHeader.count() > 0 && await tintedCardHeader.isVisible()) {
      const cardHeaderBg = await tintedCardHeader.evaluate(el => window.getComputedStyle(el).backgroundColor);
      expect(cardHeaderBg).toBe('rgb(228, 237, 248)'); // #E4EDF8

      const borderLeftColor = await tintedCardHeader.evaluate(el => window.getComputedStyle(el).borderLeftColor);
      expect(borderLeftColor).toBe('rgb(11, 45, 87)'); // #0B2D57

      const borderLeftWidth = await tintedCardHeader.evaluate(el => window.getComputedStyle(el).borderLeftWidth);
      expect(borderLeftWidth).toBe('4px');

      const cardTitle = tintedCardHeader.locator('.rx-form-section-title, h3').first();
      if (await cardTitle.count() > 0) {
        const cardTitleColor = await cardTitle.evaluate(el => window.getComputedStyle(el).color);
        expect(cardTitleColor).toBe('rgb(11, 45, 87)'); // #0B2D57
        const cardContrast = getContrastRatio(cardTitleColor, cardHeaderBg);
        expect(cardContrast).toBeGreaterThanOrEqual(4.5);
      }
    }

    // 4. Table Header Row (#EDF2F9 -> rgb(237, 242, 249))
    const tableHeader = page.locator('.rx-table-th, .sap-table th, .sap-bulk-table th').first();
    if (await tableHeader.count() > 0 && await tableHeader.isVisible()) {
      const tableHeaderBg = await tableHeader.evaluate(el => window.getComputedStyle(el).backgroundColor);
      expect(tableHeaderBg).toBe('rgb(237, 242, 249)'); // #EDF2F9

      const thColor = await tableHeader.evaluate(el => window.getComputedStyle(el).color);
      expect(['rgb(11, 45, 87)', 'rgb(0, 32, 78)']).toContain(thColor); // #0B2D57 or brand navy
      const tableContrast = getContrastRatio(thColor, tableHeaderBg);
      expect(tableContrast).toBeGreaterThanOrEqual(4.5);
    }

    // 5. No horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);
  }

  test('Screenshots and visual assertions across all 13 required screens', async ({ page }) => {
    const viewport = page.viewportSize();
    const vpSuffix = `${viewport.width}x${viewport.height}`;

    // 1. Home (Hero preserved, excluded from .fiori-ph page header)
    await page.goto('/home', { waitUntil: 'networkidle' });
    const heroTitle = page.locator('h1, h2, .rx-home-hero, .sap-home-hero').first();
    await expect(heroTitle).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `home-${vpSuffix}.png`), fullPage: false });

    // 2. Create Single BOM
    await page.goto('/products/bom/create/single', { waitUntil: 'networkidle' });
    await assertPageVisualStyles(page, 'Create Single BOM');

    // Check Add Component button is solid primary navy with white text/icon
    const addCompBtn = page.locator('button.rx-btn-add-component, button.sap-btn-add-component, button:has-text("Add Component")').first();
    await expect(addCompBtn).toBeVisible();
    const addCompBg = await addCompBtn.evaluate(el => window.getComputedStyle(el).backgroundColor);
    expect(['rgb(0, 32, 78)', 'rgb(11, 45, 87)']).toContain(addCompBg);
    const addCompColor = await addCompBtn.evaluate(el => window.getComputedStyle(el).color);
    expect(addCompColor).toBe('rgb(255, 255, 255)');

    // Check Single / Bulk toggle
    const toggleActive = page.locator('button:has-text("Single")').first();
    const toggleActiveBg = await toggleActive.evaluate(el => window.getComputedStyle(el).backgroundColor);
    expect(['rgb(11, 45, 87)', 'rgb(0, 32, 78)']).toContain(toggleActiveBg);
    const toggleActiveColor = await toggleActive.evaluate(el => window.getComputedStyle(el).color);
    expect(toggleActiveColor).toBe('rgb(255, 255, 255)');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `create-single-bom-${vpSuffix}.png`), fullPage: false });

    // 3. Confirm BOM Creation Modal on Create Single BOM
    await page.fill('#createBomMaterial', 'A1BH0214C');
    await page.fill('#createBomPlant', '1010');
    await page.fill('#createBomUsage', '1');
    await page.fill('#createBomAlt', '01');
    await page.fill('#createBomBaseQty', '1');

    const firstRow = page.locator('table.sap-table tbody tr').first();
    await firstRow.locator('input').first().fill('C3DH0416E');
    await firstRow.locator('input[aria-label*="Quantity"]').first().fill('5');
    await firstRow.locator('input').nth(3).fill('0001');

    const validateBtn = page.locator('button:has-text("Validate Master Data")').first();
    await expect(validateBtn).toBeEnabled();
    await validateBtn.click();
    await page.waitForTimeout(600);

    const previewBtn = page.locator('button:has-text("Preview & Create BOM")').first();
    await expect(previewBtn).toBeEnabled({ timeout: 5000 });
    await previewBtn.click();

    const modal = page.locator('[role="dialog"], .rx-modal, .sap-modal').first();
    await expect(modal).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `confirm-create-modal-${vpSuffix}.png`), fullPage: false });
    const cancelBtn = modal.locator('button:has-text("Cancel"), button:has-text("Close")').first();
    if (await cancelBtn.count() > 0) await cancelBtn.click();
    await page.waitForTimeout(300);

    // 4. Create Bulk BOM step 2 (cards + Data Preview)
    await page.goto('/products/bom/create/bulk', { waitUntil: 'networkidle' });
    await assertPageVisualStyles(page, 'Create Bulk BOM step 1');

    const createBuffer = createSampleBulkCreateFile();
    const createFileInput = page.locator('input[type="file"]').first();
    await createFileInput.setInputFiles({
      name: 'Batch_BOM_Create.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: createBuffer
    });
    await page.waitForTimeout(400);
    const continueBtn = page.locator('button:has-text("Continue")').first();
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    // Step 2: Validate / Preview
    await page.waitForTimeout(400);
    await assertPageVisualStyles(page, 'Create Bulk BOM step 2');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `create-bulk-bom-step2-${vpSuffix}.png`), fullPage: false });

    // Click Validate data to move rows to Ready
    const validateDataBtn = page.locator('button:has-text("Validate data")').first();
    if (await validateDataBtn.count() > 0 && await validateDataBtn.isEnabled()) {
      await validateDataBtn.click();
      await page.waitForTimeout(600);
    }

    // 5. Create Bulk BOM step 3 (results)
    const createBomsBtn = page.locator('button.create-ready-boms-btn, button:has-text("Create BOMs")').first();
    if (await createBomsBtn.count() > 0) {
      await expect(createBomsBtn).toBeEnabled({ timeout: 5000 });
      await createBomsBtn.click();
      const confirmModalBtn = page.locator('button:has-text("Confirm & Create")').first();
      if (await confirmModalBtn.count() > 0 && await confirmModalBtn.isVisible()) {
        await confirmModalBtn.click();
      }
      await page.waitForTimeout(1000);
      await assertPageVisualStyles(page, 'Create Bulk BOM step 3 (results)');
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `create-bulk-bom-results-${vpSuffix}.png`), fullPage: false });
    }

    // 6. Copy Single BOM (check Source/Target pills contrast >= 4.5:1)
    await page.goto('/products/bom/copy/single', { waitUntil: 'networkidle' });
    await assertPageVisualStyles(page, 'Copy Single BOM');
    const badge = page.locator('.rx-copy-card-badge, .sap-badge').first();
    if (await badge.count() > 0) {
      const badgeBg = await badge.evaluate(el => window.getComputedStyle(el).backgroundColor);
      const badgeColor = await badge.evaluate(el => window.getComputedStyle(el).color);
      const badgeContrast = getContrastRatio(badgeColor, badgeBg);
      expect(badgeContrast).toBeGreaterThanOrEqual(4.5);
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `copy-single-bom-${vpSuffix}.png`), fullPage: false });

    // 7. Copy Bulk BOM & Results
    await page.goto('/products/bom/copy/bulk', { waitUntil: 'networkidle' });
    await assertPageVisualStyles(page, 'Copy Bulk BOM');
    const copyBuffer = createSampleBulkCopyFile();
    const copyFileInput = page.locator('input[type="file"]').first();
    await copyFileInput.setInputFiles({
      name: 'Batch_BOM_Copy.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: copyBuffer
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `copy-bulk-bom-${vpSuffix}.png`), fullPage: false });

    const continueCopyBtn = page.locator('button:has-text("Continue")').first();
    if (await continueCopyBtn.count() > 0 && await continueCopyBtn.isEnabled()) {
      await continueCopyBtn.click();
      await page.waitForTimeout(500);

      const validateCopyDataBtn = page.locator('button:has-text("Validate data")').first();
      if (await validateCopyDataBtn.count() > 0 && await validateCopyDataBtn.isEnabled()) {
        await validateCopyDataBtn.click();
        await page.waitForTimeout(600);
      }

      page.on('dialog', async (dialog) => {
        await dialog.accept();
      });

      const copyBomsBtn = page.locator('button.create-ready-boms-btn, button:has-text("Copy BOMs")').first();
      if (await copyBomsBtn.count() > 0) {
        await expect(copyBomsBtn).toBeEnabled({ timeout: 5000 });
        await copyBomsBtn.click();
        const confirmCopyModalBtn = page.locator('button:has-text("Confirm & Copy"), button:has-text("Confirm & Create")').first();
        if (await confirmCopyModalBtn.count() > 0 && await confirmCopyModalBtn.isVisible()) {
          await confirmCopyModalBtn.click();
        }
        await page.waitForTimeout(1000);
        await assertPageVisualStyles(page, 'Copy Bulk Results');
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `copy-bulk-results-${vpSuffix}.png`), fullPage: false });
      }
    }

    // 8. Display BOM
    await page.goto('/products/bom/display', { waitUntil: 'networkidle' });
    await assertPageVisualStyles(page, 'Display BOM');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `display-bom-${vpSuffix}.png`), fullPage: false });

    // 9. Validate BOM
    await page.goto('/products/bom/validate', { waitUntil: 'networkidle' });
    await assertPageVisualStyles(page, 'Validate BOM');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `validate-bom-${vpSuffix}.png`), fullPage: false });

    // 10. Delete BOM
    await page.goto('/products/bom/delete', { waitUntil: 'networkidle' });
    await assertPageVisualStyles(page, 'Delete BOM');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `delete-bom-${vpSuffix}.png`), fullPage: false });

    // 11. Admin > Users
    await page.goto('/admin/users', { waitUntil: 'networkidle' });
    await assertPageVisualStyles(page, 'Admin > Users');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `admin-users-${vpSuffix}.png`), fullPage: false });

    // 12. Admin > Servers
    await page.goto('/admin/servers', { waitUntil: 'networkidle' });
    await assertPageVisualStyles(page, 'Admin > Servers');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `admin-servers-${vpSuffix}.png`), fullPage: false });

    // 13. Audit logs
    await page.goto('/admin/logs/audit', { waitUntil: 'networkidle' });
    await assertPageVisualStyles(page, 'Audit Logs');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `admin-logs-audit-${vpSuffix}.png`), fullPage: false });

    // 14. Login page unchanged
    await setupMocks(page, { authenticated: false });
    await page.goto('/signin', { waitUntil: 'networkidle' });
    const loginCard = page.locator('.rx-login-card, .sap-login-card, form').first();
    await expect(loginCard).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `login-page-${vpSuffix}.png`), fullPage: false });
  });
});
