import { test, expect } from '@playwright/test';
import { setupMocks } from './helpers/mockApi.js';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/chare/.gemini/antigravity/brain/670a18b0-0002-4036-b6f5-4b4c0c22c519';

function saveScreenshot(sourcePath, filename) {
  try {
    if (!fs.existsSync('screenshots')) {
      fs.mkdirSync('screenshots', { recursive: true });
    }
    if (fs.existsSync(ARTIFACT_DIR)) {
      fs.copyFileSync(sourcePath, path.join(ARTIFACT_DIR, filename));
    }
  } catch (err) {
    console.warn(`Failed to copy screenshot ${filename}:`, err.message);
  }
}

test.describe('Stage 11: Copy Single BOM Layout & Spacing Refinements', () => {
  test('Copy Single BOM layout, spacing, and controls', async ({ page }, testInfo) => {
    const vp = testInfo.project.name;
    if (vp !== '1366x768' && vp !== '1920x1080') {
      test.skip();
      return;
    }

    const [widthStr, heightStr] = vp.split('x');
    const width = parseInt(widthStr, 10);
    const height = parseInt(heightStr, 10);

    await setupMocks(page, { authenticated: true });
    await page.goto('/products/bom/copy/single', { waitUntil: 'networkidle' });

    // Wait for form and elements
    await page.waitForSelector('#sourceMaterial', { state: 'visible', timeout: 10000 });
    const form = page.locator('form.rx-copy-bom-form');
    await expect(form).toBeVisible();

    const cards = page.locator('.rx-copy-bom-form .rx-card');
    await expect(cards).toHaveCount(2);
    const sourceCard = cards.nth(0);
    const targetCard = cards.nth(1);

    // A. TEXT ASSERTIONS
    // 1 & 2. No "Optional" text under Alternative BOM or Valid From on Copy page
    const sourceAltHint = page.locator('#sourceAltBom').locator('xpath=ancestor::div[contains(@class, "rx-field-wrapper")]//div[contains(@class, "rx-field-hint")]');
    expect(await sourceAltHint.count()).toBe(0);

    const targetAltHint = page.locator('#targetAltBom').locator('xpath=ancestor::div[contains(@class, "rx-field-wrapper")]//div[contains(@class, "rx-field-hint")]');
    expect(await targetAltHint.count()).toBe(0);

    const validFromHint = page.locator('#validFrom').locator('xpath=ancestor::div[contains(@class, "rx-field-wrapper")]//div[contains(@class, "rx-field-hint")]');
    await expect(validFromHint).toBeVisible();
    const validFromText = await validFromHint.innerText();
    expect(validFromText).toBe('Format DD.MM.YYYY');
    expect(validFromText).not.toContain('Optional');

    // B. CARD EQUALITY
    const box0 = await sourceCard.boundingBox();
    const box1 = await targetCard.boundingBox();
    expect(box0).not.toBeNull();
    expect(box1).not.toBeNull();
    expect(Math.abs(box0.height - box1.height)).toBeLessThanOrEqual(1);

    // C. ROW ALIGNMENT ACROSS CARDS (top of left field equals top of right field within 1px)
    // Row 1: Material
    const sourceMatBox = await page.locator('#sourceMaterial').locator('xpath=ancestor::div[contains(@class, "rx-value-help-container")]').boundingBox();
    const targetMatBox = await page.locator('#targetMaterial').locator('xpath=ancestor::div[contains(@class, "rx-value-help-container")]').boundingBox();
    expect(sourceMatBox).not.toBeNull();
    expect(targetMatBox).not.toBeNull();
    expect(Math.abs(sourceMatBox.y - targetMatBox.y)).toBeLessThanOrEqual(1);

    // Row 2: Plant
    const sourcePlantBox = await page.locator('#sourcePlant').locator('xpath=ancestor::div[contains(@class, "rx-value-help-container")]').boundingBox();
    const targetPlantBox = await page.locator('#targetPlant').locator('xpath=ancestor::div[contains(@class, "rx-value-help-container")]').boundingBox();
    expect(sourcePlantBox).not.toBeNull();
    expect(targetPlantBox).not.toBeNull();
    expect(Math.abs(sourcePlantBox.y - targetPlantBox.y)).toBeLessThanOrEqual(1);

    // Row 3: BOM usage + Alternative BOM
    const sourceUsageBox = await page.locator('#sourceUsage').locator('xpath=ancestor::div[contains(@class, "rx-value-help-container")]').boundingBox();
    const targetUsageBox = await page.locator('#targetUsage').locator('xpath=ancestor::div[contains(@class, "rx-value-help-container")]').boundingBox();
    expect(sourceUsageBox).not.toBeNull();
    expect(targetUsageBox).not.toBeNull();
    expect(Math.abs(sourceUsageBox.y - targetUsageBox.y)).toBeLessThanOrEqual(1);

    const sourceAltBox = await page.locator('#sourceAltBom').boundingBox();
    const targetAltBox = await page.locator('#targetAltBom').boundingBox();
    expect(sourceAltBox).not.toBeNull();
    expect(targetAltBox).not.toBeNull();
    expect(Math.abs(sourceAltBox.y - targetAltBox.y)).toBeLessThanOrEqual(1);

    // Row 4: Validate BOM (Optional) button vs Valid From input
    const validateBtnBox = await page.locator('#validateSourceBomBtn').boundingBox();
    const validFromBox = await page.locator('#validFrom').boundingBox();
    expect(validateBtnBox).not.toBeNull();
    expect(validFromBox).not.toBeNull();
    expect(Math.abs(validateBtnBox.y - validFromBox.y)).toBeLessThanOrEqual(1);

    // D. ROW SPACING & BOTTOM PADDING
    const sourceBody = sourceCard.locator('.rx-copy-card-body');
    const sourceRows = sourceBody.locator('> div');
    await expect(sourceRows).toHaveCount(4);

    const r1Box = await sourceRows.nth(0).boundingBox();
    const r2Box = await sourceRows.nth(1).boundingBox();
    const r3Box = await sourceRows.nth(2).boundingBox();
    const r4Box = await sourceRows.nth(3).boundingBox();
    const sBodyBox = await sourceBody.boundingBox();

    const gap1_2 = r2Box.y - (r1Box.y + r1Box.height);
    const gap2_3 = r3Box.y - (r2Box.y + r2Box.height);
    const gap3_4 = r4Box.y - (r3Box.y + r3Box.height);

    expect(Math.abs(gap1_2 - gap2_3)).toBeLessThanOrEqual(1);
    expect(Math.abs(gap2_3 - gap3_4)).toBeLessThanOrEqual(1);
    expect(Math.abs(gap1_2 - 16)).toBeLessThanOrEqual(1);

    const bottomDistance = (sBodyBox.y + sBodyBox.height) - (r4Box.y + r4Box.height);
    expect(Math.abs(bottomDistance - 20)).toBeLessThanOrEqual(1.5);

    // E. CONTROL HEIGHT (compact token: 32px)
    expect(Math.abs(sourceMatBox.height - 32)).toBeLessThanOrEqual(1);
    expect(Math.abs(sourcePlantBox.height - 32)).toBeLessThanOrEqual(1);
    expect(Math.abs(sourceUsageBox.height - 32)).toBeLessThanOrEqual(1);
    expect(Math.abs(sourceAltBox.height - 32)).toBeLessThanOrEqual(1);
    expect(Math.abs(validateBtnBox.height - 32)).toBeLessThanOrEqual(1);
    expect(Math.abs(targetMatBox.height - 32)).toBeLessThanOrEqual(1);
    expect(Math.abs(targetPlantBox.height - 32)).toBeLessThanOrEqual(1);
    expect(Math.abs(targetUsageBox.height - 32)).toBeLessThanOrEqual(1);
    expect(Math.abs(targetAltBox.height - 32)).toBeLessThanOrEqual(1);
    expect(Math.abs(validFromBox.height - 32)).toBeLessThanOrEqual(1);

    // F. VIEWPORT FIT & HORIZONTAL OVERFLOW
    const scrollDimensions = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth
    }));

    // No horizontal scrollbar
    expect(scrollDimensions.scrollWidth).toBeLessThanOrEqual(scrollDimensions.innerWidth);

    if (vp === '1366x768') {
      const overflowY = scrollDimensions.scrollHeight - scrollDimensions.innerHeight;
      console.log(`[Viewport Check 1366x768] scrollHeight: ${scrollDimensions.scrollHeight}, innerHeight: ${scrollDimensions.innerHeight}, overflowY: ${overflowY}`);
      expect(overflowY).toBeLessThanOrEqual(0);
    }

    // Screenshot 1: Empty state
    const emptySsName = `copy-bom-empty-${vp}.png`;
    const emptySsPath = `screenshots/${emptySsName}`;
    await page.screenshot({ path: emptySsPath, fullPage: false });
    saveScreenshot(emptySsPath, emptySsName);

    // G. VALIDATION ERROR STATE
    const proceedBtn = page.locator('button[type="submit"]:has-text("Proceed")');
    await proceedBtn.click();

    const errorAlerts = page.locator('.rx-field-error');
    await expect(errorAlerts.first()).toBeVisible({ timeout: 5000 });

    const errBox0 = await sourceCard.boundingBox();
    const errBox1 = await targetCard.boundingBox();
    expect(Math.abs(errBox0.height - errBox1.height)).toBeLessThanOrEqual(1);

    const errSourceMatBox = await page.locator('#sourceMaterial').locator('xpath=ancestor::div[contains(@class, "rx-value-help-container")]').boundingBox();
    const errTargetMatBox = await page.locator('#targetMaterial').locator('xpath=ancestor::div[contains(@class, "rx-value-help-container")]').boundingBox();
    expect(Math.abs(errSourceMatBox.y - errTargetMatBox.y)).toBeLessThanOrEqual(1);

    const errSourcePlantBox = await page.locator('#sourcePlant').locator('xpath=ancestor::div[contains(@class, "rx-value-help-container")]').boundingBox();
    const errTargetPlantBox = await page.locator('#targetPlant').locator('xpath=ancestor::div[contains(@class, "rx-value-help-container")]').boundingBox();
    expect(Math.abs(errSourcePlantBox.y - errTargetPlantBox.y)).toBeLessThanOrEqual(1);

    const errSourceUsageBox = await page.locator('#sourceUsage').locator('xpath=ancestor::div[contains(@class, "rx-value-help-container")]').boundingBox();
    const errTargetUsageBox = await page.locator('#targetUsage').locator('xpath=ancestor::div[contains(@class, "rx-value-help-container")]').boundingBox();
    expect(Math.abs(errSourceUsageBox.y - errTargetUsageBox.y)).toBeLessThanOrEqual(1);

    const errValidateBtnBox = await page.locator('#validateSourceBomBtn').boundingBox();
    const errValidFromBox = await page.locator('#validFrom').boundingBox();
    expect(Math.abs(errValidateBtnBox.y - errValidFromBox.y)).toBeLessThanOrEqual(1);

    // Screenshot 2: Error state
    const errSsName = `copy-bom-errors-${vp}.png`;
    const errSsPath = `screenshots/${errSsName}`;
    await page.screenshot({ path: errSsPath, fullPage: false });
    saveScreenshot(errSsPath, errSsName);
  });

  test('Create Single BOM header has no Optional text at 1366x768', async ({ page }, testInfo) => {
    if (testInfo.project.name !== '1366x768') {
      test.skip();
      return;
    }

    await setupMocks(page, { authenticated: true });
    await page.goto('/products/bom/create/single', { waitUntil: 'networkidle' });

    await page.waitForSelector('#createBomMaterial', { state: 'visible', timeout: 10000 });

    const altBomField = page.locator('#createBomAlt').locator('xpath=ancestor::div[contains(@class, "rx-field-wrapper")]');
    if (await altBomField.count() > 0) {
      const hint = altBomField.locator('.rx-field-hint');
      if (await hint.count() > 0) {
        const text = await hint.innerText();
        expect(text).not.toContain('Optional');
      }
    }

    const validFromField = page.locator('#createBomValidFrom').locator('xpath=ancestor::div[contains(@class, "rx-field-wrapper")]');
    if (await validFromField.count() > 0) {
      const hint = validFromField.locator('.rx-field-hint');
      if (await hint.count() > 0) {
        const text = await hint.innerText();
        expect(text).not.toContain('Optional');
      }
    }

    // Screenshot 3: Create Single BOM header
    const ssName = 'create-bom-header-1366x768.png';
    const ssPath = `screenshots/${ssName}`;
    await page.screenshot({ path: ssPath, fullPage: false });
    saveScreenshot(ssPath, ssName);
  });
});
