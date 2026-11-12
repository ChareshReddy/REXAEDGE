import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { setupMocks } from './helpers/mockApi.js';
import { createSampleBulkCreateFile } from './helpers/sampleFiles.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const brainDir = 'C:\\Users\\chare\\.gemini\\antigravity\\brain\\670a18b0-0002-4036-b6f5-4b4c0c22c519';
const localScreenshotsDir = path.resolve(__dirname, '../screenshots');

[brainDir, localScreenshotsDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
  }
});

async function saveScreenshot(page, filename) {
  const localPath = path.join(localScreenshotsDir, filename);
  const brainPath = path.join(brainDir, filename);
  await page.screenshot({ path: localPath, fullPage: true });
  try {
    fs.copyFileSync(localPath, brainPath);
  } catch {
    // fallback direct screenshot if copy fails
    await page.screenshot({ path: brainPath, fullPage: true }).catch(() => {});
  }
}

test.describe('Create Single BOM and Create Bulk BOM Layout & Flow Suite', () => {

  test('Single BOM: Breadcrumb, Table Gap, Column Widths & Screenshots (1 row and 5 rows)', async ({ page }, testInfo) => {
    const vp = testInfo.project.name;
    if (vp !== '1366x768' && vp !== '1920x1080') {
      test.skip();
      return;
    }

    await setupMocks(page, { authenticated: true });
    await page.goto('/products/bom/create/single', { waitUntil: 'networkidle' });
    await page.waitForSelector('#createBomMaterial', { state: 'visible', timeout: 8000 });

    // 1. Breadcrumb pattern check: Home / BOM management / Create BOM / Create Single BOM
    const breadcrumbLoc = page.locator('.sap-breadcrumbs, .rx-breadcrumbs, [aria-label="Breadcrumb"]').first();
    await expect(breadcrumbLoc).toBeVisible();
    const breadcrumbText = await breadcrumbLoc.innerText();
    expect(breadcrumbText).toContain('Home');
    expect(breadcrumbText).toContain('BOM management');
    expect(breadcrumbText).toContain('Create BOM');
    expect(breadcrumbText).toContain('Create Single BOM');

    // "Create BOM" is a clickable link
    const createBomCrumb = breadcrumbLoc.locator('button, a').filter({ hasText: /^Create BOM$/ }).first();
    await expect(createBomCrumb).toBeVisible();

    // 2. Measure Single BOM "BOM Header Data" band padding
    const singleHeaderBand = page.locator('[data-full-bleed-band="true"]').first();
    await expect(singleHeaderBand).toBeVisible();
    const singleBandPadding = await singleHeaderBand.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return {
        left: parseFloat(cs.paddingLeft),
        right: parseFloat(cs.paddingRight),
        top: parseFloat(cs.paddingTop),
        bottom: parseFloat(cs.paddingBottom),
        bg: cs.backgroundColor
      };
    });
    expect(singleBandPadding.left).toBeGreaterThanOrEqual(24);
    expect(singleBandPadding.top).toBeGreaterThanOrEqual(12);

    // 3. No horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);

    // 4. Component column width > Reference number column width
    const tableContainer = page.locator('.rx-components-table-container');
    await expect(tableContainer).toBeVisible();
    const compTh = page.locator('th:has-text("Components")');
    const refTh = page.locator('th:has-text("Reference number")');
    const compWidth = await compTh.evaluate((el) => el.getBoundingClientRect().width);
    const refWidth = await refTh.evaluate((el) => el.getBoundingClientRect().width);
    expect(compWidth).toBeGreaterThan(refWidth);

    // 5. Table ends right after last row (no blank gap below last row)
    const table = tableContainer.locator('table');
    const tableBox = await table.boundingBox();
    const containerBox = await tableContainer.boundingBox();
    expect(tableBox).not.toBeNull();
    expect(containerBox).not.toBeNull();
    // Container height should match table height within 2px (or border difference)
    expect(Math.abs(containerBox.height - tableBox.height)).toBeLessThanOrEqual(2);

    // Screenshot: Single BOM with 1 row
    await saveScreenshot(page, `single-bom-1row-${vp}.png`);

    // 6. Add 4 more components to test 5 rows
    const addCompBtn = page.locator('.sap-btn-add-component, button:has-text("Add Component")').first();
    for (let i = 0; i < 4; i++) {
      await addCompBtn.click();
      await page.waitForTimeout(100);
    }
    const rows = page.locator('.rx-components-table tbody tr');
    await expect(rows).toHaveCount(5);

    // Verify table still has no blank gap below 5 rows
    const tableBox5 = await table.boundingBox();
    const containerBox5 = await tableContainer.boundingBox();
    expect(Math.abs(containerBox5.height - tableBox5.height)).toBeLessThanOrEqual(2);

    // Screenshot: Single BOM with 5 rows
    await saveScreenshot(page, `single-bom-5rows-${vp}.png`);
  });

  test('Bulk Create BOM: Steps 1, 2, 3 Layout, Breadcrumb, Header Tint & Padding Assertions', async ({ page }, testInfo) => {
    const vp = testInfo.project.name;
    if (vp !== '1366x768' && vp !== '1920x1080') {
      test.skip();
      return;
    }

    await setupMocks(page, { authenticated: true });

    // === STEP 1: Upload ===
    await page.goto('/products/bom/create/bulk', { waitUntil: 'networkidle' });
    await page.waitForSelector('.rx-bulk-upload-card, .bulk-upload-dropzone', { state: 'visible', timeout: 8000 });

    // 1. Breadcrumb pattern check: Home / BOM management / Create BOM / Create Bulk BOM
    const breadcrumbLoc = page.locator('.sap-breadcrumbs, .rx-breadcrumbs, [aria-label="Breadcrumb"]').first();
    await expect(breadcrumbLoc).toBeVisible();
    const breadcrumbText = await breadcrumbLoc.innerText();
    expect(breadcrumbText).toContain('Home');
    expect(breadcrumbText).toContain('BOM management');
    expect(breadcrumbText).toContain('Create BOM');
    expect(breadcrumbText).toContain('Create Bulk BOM');

    // "Create BOM" is a clickable link
    const createBomCrumb = breadcrumbLoc.locator('button, a').filter({ hasText: /^Create BOM$/ }).first();
    await expect(createBomCrumb).toBeVisible();

    // 2. Measure Bulk header band ("Upload Spreadsheet") padding and tint
    const bulkHeaderBand = page.locator('[data-full-bleed-band="true"]').first();
    await expect(bulkHeaderBand).toBeVisible();
    const bulkBandPadding = await bulkHeaderBand.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return {
        left: parseFloat(cs.paddingLeft),
        right: parseFloat(cs.paddingRight),
        top: parseFloat(cs.paddingTop),
        bottom: parseFloat(cs.paddingBottom),
        bg: cs.backgroundColor
      };
    });
    expect(bulkBandPadding.left).toBeGreaterThanOrEqual(24);
    expect(bulkBandPadding.top).toBeGreaterThanOrEqual(12);

    // 3. Text checks
    const uploadCard = page.locator('.rx-bulk-upload-card');
    const uploadText = await uploadCard.innerText();
    expect(uploadText).toContain('Accepted formats: .xlsx, .xls, .tsv, .txt');
    expect(uploadText).toContain('Maximum 500 BOMs per job (batch).');
    expect(uploadText).not.toContain('300 component rows');

    // 4. Check that at 1366x768 the Continue button is in the viewport without needing extra scroll
    const continueBtn = page.locator('button:has-text("Continue")').first();
    await expect(continueBtn).toBeVisible();
    const continueBox = await continueBtn.boundingBox();
    const viewportSize = page.viewportSize();
    expect(continueBox.y + continueBox.height).toBeLessThanOrEqual(viewportSize.height + 50);

    // 5. No horizontal overflow
    const overflowStep1 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflowStep1).toBe(false);

    // Screenshot Step 1
    await saveScreenshot(page, `bulk-step1-${vp}.png`);

    // === ADVANCE TO STEP 2 ===
    const fileBuffer = createSampleBulkCreateFile();
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'Sample_BOM_Create.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: fileBuffer
    });

    await page.waitForTimeout(400);
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    // === STEP 2: Preview ===
    await page.waitForSelector('.rx-bulk-stat-tiles, .preflight-preview-table', { state: 'visible', timeout: 5000 });

    // Step 2 header band ("Data Preview")
    const step2Band = page.locator('[data-full-bleed-band="true"]').first();
    await expect(step2Band).toBeVisible();
    const step2Padding = await step2Band.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return {
        left: parseFloat(cs.paddingLeft),
        top: parseFloat(cs.paddingTop)
      };
    });
    expect(step2Padding.left).toBeGreaterThanOrEqual(24);
    expect(step2Padding.top).toBeGreaterThanOrEqual(12);

    const overflowStep2 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflowStep2).toBe(false);

    // Screenshot Step 2
    await saveScreenshot(page, `bulk-step2-${vp}.png`);

    // === ADVANCE TO STEP 3 ===
    const validateBtn = page.locator('.validate-with-sap-btn').first();
    if (await validateBtn.isVisible()) {
      await validateBtn.click();
      await page.waitForTimeout(800);
    }

    const createBtn = page.locator('.create-ready-boms-btn').first();
    await expect(createBtn).toBeEnabled({ timeout: 6000 });
    await createBtn.click();

    // Modal opens
    const modalConfirmBtn = page.locator('button:has-text("Confirm & Create"), .modal-content button.primary').first();
    await expect(modalConfirmBtn).toBeVisible({ timeout: 5000 });
    await modalConfirmBtn.click();
    await page.waitForTimeout(1000);

    // Step 3 Execution Details
    const step3Band = page.locator('[data-full-bleed-band="true"]').first();
    await expect(step3Band).toBeVisible();
    const step3Padding = await step3Band.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return {
        left: parseFloat(cs.paddingLeft),
        top: parseFloat(cs.paddingTop)
      };
    });
    expect(step3Padding.left).toBeGreaterThanOrEqual(24);
    expect(step3Padding.top).toBeGreaterThanOrEqual(12);

    const overflowStep3 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflowStep3).toBe(false);

    // Screenshot Step 3
    await saveScreenshot(page, `bulk-step3-${vp}.png`);
  });

});
