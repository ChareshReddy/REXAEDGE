import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { setupMocks } from './helpers/mockApi.js';
import {
  assertTableColumnsAligned,
  assertTableRowsAndInputs
} from './helpers/layoutAssertions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const screenshotsDir = path.resolve(__dirname, '../screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

test.describe('RexaEdge F4 Popups Suite', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page, { authenticated: true });
    await page.goto('/products/bom/create/single', { waitUntil: 'networkidle' });
    await page.waitForSelector('#createBomMaterial', { state: 'visible' });
    await page.waitForTimeout(300);
  });

  // 1. Restrict Value Range F4 Popup (triggers when clicking F4 on material field)
  test('Popup: Restrict Value Range @shots', async ({ page }, testInfo) => {
    const viewportName = testInfo.project.name;
    const matContainer = page.locator('#createBomMaterial').locator('..');
    const f4Btn = matContainer.locator('button.rx-value-help-btn, button[title*="F4"], button[aria-label="Search help"]');
    await f4Btn.click();

    // Wait for Restrict Value Range modal
    const dialog = page.locator('.sap-restrict-dialog, .sap-modal-dialog, [role="dialog"]').first();
    await expect(dialog).toBeVisible();

    // Take popup screenshot
    await page.screenshot({ path: path.join(screenshotsDir, `f4-restrict-value-range-${viewportName}.png`), fullPage: true });

    // Assert backdrop click does NOT close popup
    await page.mouse.click(15, 15);
    await expect(dialog).toBeVisible({ timeout: 2000 });

    // Assert Escape key closes popup
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });

  // 2. Material Results F4 Popup
  test('Popup: Material @shots', async ({ page }, testInfo) => {
    const viewportName = testInfo.project.name;
    const matContainer = page.locator('#createBomMaterial').locator('..');
    const f4Btn = matContainer.locator('button.rx-value-help-btn, button[title*="F4"], button[aria-label="Search help"]');
    await f4Btn.click();

    // Click "Continue" in the restrict dialog to open material result modal
    const continueBtn = page.locator('.sap-restrict-dialog .sap-restrict-btn-continue, button.sap-restrict-btn-continue');
    await expect(continueBtn).toBeVisible({ timeout: 5000 });
    await continueBtn.click();

    const matDialog = page.locator('.sap-f4-modal-dialog.material');
    await expect(matDialog).toBeVisible({ timeout: 5000 });

    // Take popup screenshot
    await page.screenshot({ path: path.join(screenshotsDir, `f4-material-${viewportName}.png`), fullPage: true });

    // Assert backdrop click does NOT close popup
    await page.mouse.click(15, 15);
    await expect(matDialog).toBeVisible({ timeout: 2000 });

    // Check table alignment in popup
    await assertTableColumnsAligned(page, `Material F4 at ${viewportName}`);

    // Assert close button (X) closes popup
    const closeBtn = matDialog.locator('.sap-modal-close-btn, .sap-f4-header-close').first();
    await closeBtn.click();
    await expect(matDialog).not.toBeVisible();
  });

  // 3. Plant F4 Popup
  test('Popup: Plant @shots', async ({ page }, testInfo) => {
    const viewportName = testInfo.project.name;
    const plantContainer = page.locator('#createBomPlant').locator('..');
    const f4Btn = plantContainer.locator('button.rx-value-help-btn, button[title*="F4"], button[aria-label="Search help"]');
    await f4Btn.click();

    const plantDialog = page.locator('.sap-f4-modal-dialog.plant');
    await expect(plantDialog).toBeVisible({ timeout: 5000 });

    // Take popup screenshot
    await page.screenshot({ path: path.join(screenshotsDir, `f4-plant-${viewportName}.png`), fullPage: true });

    // Assert backdrop click does NOT close popup
    await page.mouse.click(15, 15);
    await expect(plantDialog).toBeVisible({ timeout: 2000 });

    // Check table alignment
    await assertTableColumnsAligned(page, `Plant F4 at ${viewportName}`);

    // Assert Cancel button or Escape closes popup
    const cancelBtn = plantDialog.locator('.sap-f4-header-close, button:has-text("Cancel")').first();
    await cancelBtn.click();
    await expect(plantDialog).not.toBeVisible();
  });

  // 4. BOM Usage F4 Popup
  test('Popup: BOM Usage @shots', async ({ page }, testInfo) => {
    const viewportName = testInfo.project.name;
    const usageContainer = page.locator('#createBomUsage').locator('..');
    const f4Btn = usageContainer.locator('button.rx-value-help-btn, button[title*="F4"], button[aria-label="Search help"]');
    await f4Btn.click();

    const usageDialog = page.locator('.sap-f4-modal-dialog.bom-usage');
    await expect(usageDialog).toBeVisible({ timeout: 5000 });

    // Take popup screenshot
    await page.screenshot({ path: path.join(screenshotsDir, `f4-bom-usage-${viewportName}.png`), fullPage: true });

    // Assert backdrop click does NOT close popup
    await page.mouse.click(15, 15);
    await expect(usageDialog).toBeVisible({ timeout: 2000 });

    // Check table alignment in popup
    await assertTableColumnsAligned(page, `BOM Usage F4 at ${viewportName}`);

    // Assert selection / enter selects and closes
    await page.keyboard.press('Enter');
    await expect(usageDialog).not.toBeVisible({ timeout: 2000 });
  });

  // 5. Storage Location F4 Popup
  test('Popup: Storage Location @shots', async ({ page }, testInfo) => {
    const viewportName = testInfo.project.name;
    // Find table row SLoc input's F4 button
    const slocContainer = page.locator('.sap-table tbody tr').first().locator('.rx-value-help-container').nth(1);
    const f4Btn = slocContainer.locator('button.rx-value-help-btn, button[title*="F4"], button[aria-label="Search help"]');
    await f4Btn.click();

    const slocDialog = page.locator('.sap-f4-modal-dialog.storage-location');
    await expect(slocDialog).toBeVisible({ timeout: 5000 });

    // Take popup screenshot
    await page.screenshot({ path: path.join(screenshotsDir, `f4-storage-location-${viewportName}.png`), fullPage: true });

    // Assert backdrop click does NOT close popup
    await page.mouse.click(15, 15);
    await expect(slocDialog).toBeVisible({ timeout: 2000 });

    // Check table alignment in popup
    await assertTableColumnsAligned(page, `Storage Location F4 at ${viewportName}`);

    // Close via Esc or close button
    const closeBtn = slocDialog.locator('.sap-f4-header-close, button:has-text("Cancel")').first();
    await closeBtn.click();
    await expect(slocDialog).not.toBeVisible();
  });
});
