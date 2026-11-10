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

test.describe('Stage 14: Copy Single BOM Input Height & Right-Aligned Small Validate Button', () => {
  test('Input height parity with Create Single BOM, small right-aligned button, card balance', async ({ page }, testInfo) => {
    const vp = testInfo.project.name;
    if (vp !== '1366x768' && vp !== '1920x1080') {
      test.skip();
      return;
    }

    await setupMocks(page, { authenticated: true });

    // Step 1: Measure baseline input height on Create Single BOM
    await page.goto('/products/bom/create/single', { waitUntil: 'networkidle' });
    await page.waitForSelector('#createBomMaterial', { state: 'visible', timeout: 10000 });
    const createMatContainer = page.locator('#createBomMaterial').locator('xpath=ancestor::div[contains(@class, "rx-value-help-container")]');
    const createMatBox = await createMatContainer.boundingBox();
    expect(createMatBox).not.toBeNull();
    const baselineHeight = createMatBox.height; // Expected 40px

    // Step 2: Navigate to Copy Single BOM
    await page.goto('/products/bom/copy/single', { waitUntil: 'networkidle' });
    await page.waitForSelector('#sourceMaterial', { state: 'visible', timeout: 10000 });

    const form = page.locator('form.rx-copy-bom-form');
    await expect(form).toBeVisible();

    const cards = page.locator('.rx-copy-bom-form .rx-card');
    await expect(cards).toHaveCount(2);
    const sourceCard = cards.nth(0);
    const targetCard = cards.nth(1);

    // ------------------------------------------------------------------------
    // A. INPUT HEIGHT ASSERTIONS
    // ------------------------------------------------------------------------
    // Check ValueHelpInput containers on Copy Single BOM
    const sourceMatContainer = page.locator('#sourceMaterial').locator('xpath=ancestor::div[contains(@class, "rx-value-help-container")]');
    const sourcePlantContainer = page.locator('#sourcePlant').locator('xpath=ancestor::div[contains(@class, "rx-value-help-container")]');
    const sourceUsageContainer = page.locator('#sourceUsage').locator('xpath=ancestor::div[contains(@class, "rx-value-help-container")]');
    const targetMatContainer = page.locator('#targetMaterial').locator('xpath=ancestor::div[contains(@class, "rx-value-help-container")]');
    const targetPlantContainer = page.locator('#targetPlant').locator('xpath=ancestor::div[contains(@class, "rx-value-help-container")]');
    const targetUsageContainer = page.locator('#targetUsage').locator('xpath=ancestor::div[contains(@class, "rx-value-help-container")]');

    const sourceMatBox = await sourceMatContainer.boundingBox();
    const sourcePlantBox = await sourcePlantContainer.boundingBox();
    const sourceUsageBox = await sourceUsageContainer.boundingBox();
    const targetMatBox = await targetMatContainer.boundingBox();
    const targetPlantBox = await targetPlantContainer.boundingBox();
    const targetUsageBox = await targetUsageContainer.boundingBox();

    // Check standalone inputs
    const sourceAltBox = await page.locator('#sourceAltBom').boundingBox();
    const targetAltBox = await page.locator('#targetAltBom').boundingBox();
    const validFromBox = await page.locator('#validFrom').boundingBox();

    // Assert every input height matches the baseline height on Create Single BOM within 1px
    expect(Math.abs(sourceMatBox.height - baselineHeight)).toBeLessThanOrEqual(1);
    expect(Math.abs(sourcePlantBox.height - baselineHeight)).toBeLessThanOrEqual(1);
    expect(Math.abs(sourceUsageBox.height - baselineHeight)).toBeLessThanOrEqual(1);
    expect(Math.abs(sourceAltBox.height - baselineHeight)).toBeLessThanOrEqual(1);
    expect(Math.abs(targetMatBox.height - baselineHeight)).toBeLessThanOrEqual(1);
    expect(Math.abs(targetPlantBox.height - baselineHeight)).toBeLessThanOrEqual(1);
    expect(Math.abs(targetUsageBox.height - baselineHeight)).toBeLessThanOrEqual(1);
    expect(Math.abs(targetAltBox.height - baselineHeight)).toBeLessThanOrEqual(1);
    expect(Math.abs(validFromBox.height - baselineHeight)).toBeLessThanOrEqual(1);

    // ------------------------------------------------------------------------
    // B. VALIDATE BUTTON ASSERTIONS
    // ------------------------------------------------------------------------
    const validateBtn = page.locator('#validateSourceBomBtn');
    await expect(validateBtn).toBeVisible();
    const btnBox = await validateBtn.boundingBox();
    expect(btnBox).not.toBeNull();

    // 1. Button height equals shared sm size (32px, within 1px)
    expect(Math.abs(btnBox.height - 32)).toBeLessThanOrEqual(1);

    // 2. Button width is auto, less than 40% of the card content width
    const sourceCardBody = sourceCard.locator('.rx-copy-card-body');
    const bodyBox = await sourceCardBody.boundingBox();
    const contentWidth = bodyBox.width;
    expect(btnBox.width).toBeLessThan(contentWidth * 0.40);

    // 3. Button's right edge matches the right edge of input fields above it (within 1px)
    const inputRightEdge = sourceMatBox.x + sourceMatBox.width;
    const btnRightEdge = btnBox.x + btnBox.width;
    expect(Math.abs(btnRightEdge - inputRightEdge)).toBeLessThanOrEqual(1);

    // 4. Button vertical position lines up with Valid From input row (vertical centers aligned within 1px)
    const btnCenterY = btnBox.y + btnBox.height / 2;
    const validFromCenterY = validFromBox.y + validFromBox.height / 2;
    expect(Math.abs(btnCenterY - validFromCenterY)).toBeLessThanOrEqual(1);

    // 5. Button label equals "Validate BOM", no "Optional"
    const btnText = (await validateBtn.innerText()).trim();
    expect(btnText).toBe('Validate BOM');

    // ------------------------------------------------------------------------
    // CARD EQUALITY & ROW ALIGNMENT
    // ------------------------------------------------------------------------
    const card0Box = await sourceCard.boundingBox();
    const card1Box = await targetCard.boundingBox();
    expect(Math.abs(card0Box.height - card1Box.height)).toBeLessThanOrEqual(1);

    // Row alignment between cards
    expect(Math.abs(sourceMatBox.y - targetMatBox.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(sourcePlantBox.y - targetPlantBox.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(sourceUsageBox.y - targetUsageBox.y)).toBeLessThanOrEqual(1);

    // No horizontal scroll
    const pageScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const pageClientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(pageScrollWidth).toBeLessThanOrEqual(pageClientWidth + 1);

    // Check vertical scroll
    const pageScrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    const pageClientHeight = await page.evaluate(() => document.documentElement.clientHeight);
    const hasVerticalScroll = pageScrollHeight > pageClientHeight;
    console.log(`[Vertical Scroll Check ${vp}] scrollHeight: ${pageScrollHeight}px, clientHeight: ${pageClientHeight}px, hasScroll: ${hasVerticalScroll}`);

    // SCREENSHOT 1: Empty
    const ss1 = `screenshots/copy-bom-empty-${vp}.png`;
    await page.screenshot({ path: ss1, fullPage: false });
    saveScreenshot(ss1, `copy-bom-empty-${vp}.png`);

    // ------------------------------------------------------------------------
    // C. VALIDATION STRIP & STATE CHECK
    // ------------------------------------------------------------------------
    await page.fill('#sourceMaterial', 'A1BH0214C');
    await page.fill('#sourcePlant', '1000');
    await page.fill('#sourceUsage', '1');

    await validateBtn.click();

    const strip = page.locator('#copyBomValidationStrip');
    await expect(strip).toBeVisible({ timeout: 5000 });

    // Validate button success state
    const btnTextAfter = (await validateBtn.innerText()).trim();
    expect(btnTextAfter).toBe('BOM Validated');
    expect(btnTextAfter).not.toContain('✓');
    await expect(validateBtn).toBeEnabled();

    // Cards still equal height after validation
    const card0After = await sourceCard.boundingBox();
    const card1After = await targetCard.boundingBox();
    expect(Math.abs(card0After.height - card1After.height)).toBeLessThanOrEqual(1);

    // Right edge still matches
    const btnBoxAfter = await validateBtn.boundingBox();
    const btnRightEdgeAfter = btnBoxAfter.x + btnBoxAfter.width;
    expect(Math.abs(btnRightEdgeAfter - inputRightEdge)).toBeLessThanOrEqual(1);

    // Check vertical scroll after validation
    const pageScrollHeightAfter = await page.evaluate(() => document.documentElement.scrollHeight);
    console.log(`[After Validation ${vp}] scrollHeight: ${pageScrollHeightAfter}px, clientHeight: ${pageClientHeight}px, hasScroll: ${pageScrollHeightAfter > pageClientHeight}`);

    // SCREENSHOT 2: Validated with result strip
    const ss2 = `screenshots/copy-bom-validated-${vp}.png`;
    await page.screenshot({ path: ss2, fullPage: false });
    saveScreenshot(ss2, `copy-bom-validated-${vp}.png`);
  });
});
