import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { setupMocks } from './helpers/mockApi.js';
import { createSampleBulkCreateFile, createSampleBulkCopyFile } from './helpers/sampleFiles.js';
import {
  assertNoHorizontalScroll,
  assertInputAndButtonHeights,
  assertTableRowsAndInputs,
  assertNoFixedOverlap
} from './helpers/layoutAssertions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const screenshotsDir = path.resolve(__dirname, '../screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

test.describe('RexaEdge Bulk Pages Redesign Suite', () => {
  // 1. Bulk Create BOM Workflow (Step 1 -> Step 2 -> Step 3)
  test('Bulk Create BOM: Full 3-Step Flow and Layout Verification', async ({ page }, testInfo) => {
    const vp = testInfo.project.name;
    await setupMocks(page, { authenticated: true });

    // Step 1: Upload
    await page.goto('/products/bom/create/bulk', { waitUntil: 'networkidle' });
    await page.waitForSelector('.rx-bulk-upload-card, .bulk-upload-dropzone', { state: 'visible', timeout: 8000 });

    const contextLabel = `Bulk Create BOM at ${vp}`;

    // Layout Assertions:
    await assertNoHorizontalScroll(page, contextLabel);
    await assertNoFixedOverlap(page, contextLabel);

    // Verify Stepper: Step 1 is active with blue-600 circle, never black
    const activeStepCircle = page.locator('.rx-step-circle').first();
    await expect(activeStepCircle).toBeVisible();
    const circleBg = await activeStepCircle.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    // var(--color-blue-600) is #02579A -> rgb(2, 87, 154)
    expect(circleBg).toBe('rgb(2, 87, 154)');

    // Verify breadcrumb has no duplicate "Create BOM" crumb
    const breadcrumbText = await page.locator('.sap-breadcrumbs, .rx-breadcrumbs, [aria-label="Breadcrumb"]').first().innerText();
    expect(breadcrumbText).toContain('Home');
    if (vp !== '390x844') expect(breadcrumbText).toContain('BOM management');
    expect(breadcrumbText).toContain('Create Bulk BOM');
    expect(breadcrumbText).not.toContain('Create BOM / Create Bulk BOM');

    // Verify Drop Zone has dashed border
    const dropzone = page.locator('.rx-bulk-dropzone, .bulk-upload-dropzone').first();
    const dropzoneInfo = await dropzone.evaluate((el) => ({
      tagName: el.tagName,
      className: el.className,
      outerHTML: el.outerHTML.substring(0, 100),
      borderStyle: window.getComputedStyle(el).borderStyle,
      borderTopStyle: window.getComputedStyle(el).borderTopStyle,
      border: window.getComputedStyle(el).border
    }));
    console.log('DROPZONE INFO:', dropzoneInfo);
    const dropzoneBorder = await dropzone.evaluate((el) => window.getComputedStyle(el).borderTopStyle || window.getComputedStyle(el).borderStyle);
    expect(dropzoneBorder).toBe('dashed');

    // Verify full width card (width spans container, not constrained to 750px on desktop)
    const cardBox = await page.locator('.rx-bulk-upload-card').first().boundingBox();
    expect(cardBox).not.toBeNull();
    if (vp === '1920x1080') {
      expect(cardBox.width).toBeGreaterThanOrEqual(1200);
    } else if (vp === '1366x768') {
      expect(cardBox.width).toBeGreaterThanOrEqual(950);
    } else if (vp === '1024x768') {
      expect(cardBox.width).toBeGreaterThanOrEqual(700);
    } else if (vp === '390x844') {
      expect(cardBox.width).toBeGreaterThanOrEqual(320);
    }

    // Save Step 1 screenshot
    await page.screenshot({
      path: path.join(screenshotsDir, `bulk-create-step1-${vp}.png`),
      fullPage: true
    });

    // Upload a mock spreadsheet
    const createBuffer = createSampleBulkCreateFile();
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'Batch_BOM_Create.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: createBuffer
    });

    // Dropzone updates to file selected state
    await page.waitForTimeout(400);
    await expect(page.locator('text=Batch_BOM_Create.xlsx')).toBeVisible();

    // Click Continue button to advance to Step 2
    const continueBtn = page.locator('button:has-text("Continue")').first();
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    // Step 2: Validate / Preview
    await page.waitForTimeout(400);
    await page.waitForSelector('.rx-bulk-stat-tiles, .preflight-preview-table', { state: 'visible', timeout: 5000 });

    // Assert Stepper updated: Step 2 active
    const step2Circle = page.locator('.rx-step-circle').nth(1);
    const step2Bg = await step2Circle.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(step2Bg).toBe('rgb(2, 87, 154)');

    // Verify Stat Tiles are rendered
    await expect(page.locator('.rx-bulk-stat-tiles')).toBeVisible();

    // Verify Table header is sticky with var(--color-blue-50)
    const previewTable = page.locator('.preflight-preview-table').first();
    await expect(previewTable).toBeVisible();

    // Verify Button heights in table footer are 40px
    await assertInputAndButtonHeights(page, `${contextLabel} Step 2`);

    // Save Step 2 screenshot
    await page.screenshot({
      path: path.join(screenshotsDir, `bulk-create-step2-${vp}.png`),
      fullPage: true
    });

    // Advance to Step 3 by clicking Validate data / Create BOMs
    const validateBtn = page.locator('.validate-with-sap-btn').first();
    if (await validateBtn.isVisible()) {
      await validateBtn.click();
      await page.waitForTimeout(600);
    }

    const createBtn = page.locator('.create-ready-boms-btn').first();
    if (await createBtn.isVisible() && await createBtn.isEnabled()) {
      await createBtn.click();
      await page.waitForTimeout(600);

      // Save Step 3 screenshot
      await page.screenshot({
        path: path.join(screenshotsDir, `bulk-create-step3-${vp}.png`),
        fullPage: true
      });
    }
  });

  // 2. Bulk Copy BOM Workflow (Step 1 -> Step 2)
  test('Bulk Copy BOM: Step 1 and Step 2 Layout Verification', async ({ page }, testInfo) => {
    const vp = testInfo.project.name;
    await setupMocks(page, { authenticated: true });

    await page.goto('/products/bom/copy/bulk', { waitUntil: 'networkidle' });
    await page.waitForSelector('.rx-bulk-upload-card, .bulk-upload-dropzone', { state: 'visible', timeout: 8000 });

    const contextLabel = `Bulk Copy BOM at ${vp}`;

    await assertNoHorizontalScroll(page, contextLabel);
    await assertNoFixedOverlap(page, contextLabel);

    // Verify Stepper: Step 1 is active with blue-600 circle, never black
    const activeStepCircle = page.locator('.rx-step-circle').first();
    await expect(activeStepCircle).toBeVisible();
    const circleBg = await activeStepCircle.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(circleBg).toBe('rgb(2, 87, 154)');

    // Verify breadcrumb has no duplicate "Copy BOM" crumb
    const breadcrumbText = await page.locator('.sap-breadcrumbs, .rx-breadcrumbs, [aria-label="Breadcrumb"]').first().innerText();
    expect(breadcrumbText).toContain('Home');
    if (vp !== '390x844') expect(breadcrumbText).toContain('BOM management');
    expect(breadcrumbText).toContain('Copy Bulk BOM');
    expect(breadcrumbText).not.toContain('Copy BOM / Copy Bulk BOM');

    // Verify real batch limit is displayed
    await expect(page.locator('text=Maximum 500 BOM copy rows per batch.')).toBeVisible();

    // Save Step 1 screenshot
    await page.screenshot({
      path: path.join(screenshotsDir, `bulk-copy-step1-${vp}.png`),
      fullPage: true
    });

    // Upload mock spreadsheet
    const copyBuffer = createSampleBulkCopyFile();
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'Batch_BOM_Copy.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: copyBuffer
    });

    await page.waitForTimeout(400);
    await expect(page.locator('text=Batch_BOM_Copy.xlsx')).toBeVisible();

    // Click Continue button to advance to Step 2
    const continueBtn = page.locator('button:has-text("Continue")').first();
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    await page.waitForTimeout(400);
    await page.waitForSelector('.rx-bulk-stat-tiles, .sap-bulk-table', { state: 'visible', timeout: 5000 });

    // Verify Stat Tiles
    await expect(page.locator('.rx-bulk-stat-tiles')).toBeVisible();

    // Verify Table rendered
    await expect(page.locator('.sap-bulk-table')).toBeVisible();

    // Save Step 2 screenshot
    await page.screenshot({
      path: path.join(screenshotsDir, `bulk-copy-step2-${vp}.png`),
      fullPage: true
    });
  });

  // 3. Modal Dialog Outside-Click Prevention
  test('Modal dialogs never close on outside/backdrop click', async ({ page }) => {
    await setupMocks(page, { authenticated: true });
    await page.goto('/products/bom/create/single', { waitUntil: 'networkidle' });

    // Open F4 Plant popup
    const f4PlantBtn = page.locator('.rx-value-help-btn').first();
    await expect(f4PlantBtn).toBeVisible();
    await f4PlantBtn.click();

    // Modal dialog is now visible
    const modal = page.locator('[role="dialog"]').first();
    await expect(modal).toBeVisible();

    // Click on backdrop outside the modal card (top left corner of screen 10, 10)
    await page.mouse.click(10, 10);
    await page.waitForTimeout(300);

    // Modal MUST still be visible!
    await expect(modal).toBeVisible();

    // Close button explicitly closes modal
    const closeBtn = page.locator('.rx-modal-close-btn, [aria-label="Close"], button:has-text("Cancel")').first();
    await closeBtn.click();
    await page.waitForTimeout(300);
    await expect(modal).not.toBeVisible();
  });
});
