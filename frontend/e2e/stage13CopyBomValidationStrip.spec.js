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

test.describe('Stage 13: Copy Single BOM Validation Strip & Button Refinements', () => {
  test('Copy Single BOM validation strip, card height invariants, and button states', async ({ page }, testInfo) => {
    const vp = testInfo.project.name;
    if (vp !== '1366x768' && vp !== '1920x1080') {
      test.skip();
      return;
    }

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

    // ------------------------------------------------------------------------
    // C. SOURCE / TARGET BADGES IN CARD HEADERS
    // ------------------------------------------------------------------------
    const sourceBadge = sourceCard.locator('.rx-copy-card-badge, [data-slot="badge"]').first();
    const targetBadge = targetCard.locator('.rx-copy-card-badge, [data-slot="badge"]').first();

    await expect(sourceBadge).toBeVisible();
    await expect(targetBadge).toBeVisible();
    await expect(sourceBadge).toHaveText('Source');
    await expect(targetBadge).toHaveText('Target');

    // Horizontal padding >= 8px, vertical padding >= 2px
    const sourceBadgeStyles = await sourceBadge.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return {
        paddingLeft: parseFloat(cs.paddingLeft),
        paddingRight: parseFloat(cs.paddingRight),
        paddingTop: parseFloat(cs.paddingTop),
        paddingBottom: parseFloat(cs.paddingBottom),
        height: parseFloat(cs.height)
      };
    });
    expect(sourceBadgeStyles.paddingLeft).toBeGreaterThanOrEqual(8);
    expect(sourceBadgeStyles.paddingRight).toBeGreaterThanOrEqual(8);
    expect(sourceBadgeStyles.paddingTop).toBeGreaterThanOrEqual(2);
    expect(sourceBadgeStyles.paddingBottom).toBeGreaterThanOrEqual(2);

    const targetBadgeStyles = await targetBadge.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return {
        paddingLeft: parseFloat(cs.paddingLeft),
        paddingRight: parseFloat(cs.paddingRight),
        height: parseFloat(cs.height)
      };
    });
    expect(Math.abs(sourceBadgeStyles.height - targetBadgeStyles.height)).toBeLessThanOrEqual(1);

    // Header band containment & no overlap with title or subtitle
    const sourceTitle = sourceCard.locator('.rx-form-section-title');
    const sourceDesc = sourceCard.locator('.rx-form-section-desc');
    const sourceBand = sourceCard.locator('[data-full-bleed-band="true"], .rx-form-section-header');

    const badgeBox = await sourceBadge.boundingBox();
    const titleBox = await sourceTitle.boundingBox();
    const descBox = await sourceDesc.boundingBox();
    const bandBox = await sourceBand.boundingBox();

    expect(badgeBox).not.toBeNull();
    expect(titleBox).not.toBeNull();
    expect(bandBox).not.toBeNull();

    // 8px gap from title (with 1px tolerance)
    expect(badgeBox.x).toBeGreaterThanOrEqual(titleBox.x + titleBox.width + 6);
    // Badge inside header band
    expect(badgeBox.y).toBeGreaterThanOrEqual(bandBox.y);
    expect(badgeBox.y + badgeBox.height).toBeLessThanOrEqual(bandBox.y + bandBox.height + 2);
    // Badge does not overlap description/subtitle
    if (descBox) {
      expect(badgeBox.y + badgeBox.height).toBeLessThanOrEqual(descBox.y + 2);
    }

    // ------------------------------------------------------------------------
    // B. VALIDATE BUTTON (INITIAL STATE)
    // ------------------------------------------------------------------------
    const validateBtn = page.locator('#validateSourceBomBtn');
    await expect(validateBtn).toBeVisible();

    const btnText = (await validateBtn.innerText()).trim();
    expect(btnText).toBe('Validate BOM');
    expect(btnText).not.toContain('Optional');

    // Visual button styling: visible border & tinted background from tokens
    const btnStyles = await validateBtn.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return {
        backgroundColor: cs.backgroundColor,
        borderWidth: parseFloat(cs.borderWidth),
        borderColor: cs.borderColor,
        color: cs.color,
        fontWeight: cs.fontWeight
      };
    });
    expect(btnStyles.borderWidth).toBeGreaterThanOrEqual(1);
    // Secondary blue tint is not white or transparent
    expect(btnStyles.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(btnStyles.backgroundColor).not.toBe('rgb(255, 255, 255)');

    // ------------------------------------------------------------------------
    // A. INITIAL CARD HEIGHTS & FIELD Y POSITIONS (BEFORE VALIDATION)
    // ------------------------------------------------------------------------
    const boxCard0Before = await sourceCard.boundingBox();
    const boxCard1Before = await targetCard.boundingBox();
    expect(boxCard0Before).not.toBeNull();
    expect(boxCard1Before).not.toBeNull();
    // Cards must be equal height
    expect(Math.abs(boxCard0Before.height - boxCard1Before.height)).toBeLessThanOrEqual(1);

    // Baseline field positions
    const getFieldY = async (selector) => {
      const b = await page.locator(selector).boundingBox();
      return b ? b.y : null;
    };

    const baselineY = {
      sourceMat: await getFieldY('#sourceMaterial'),
      sourcePlant: await getFieldY('#sourcePlant'),
      sourceUsage: await getFieldY('#sourceUsage'),
      sourceAlt: await getFieldY('#sourceAltBom'),
      validateBtn: await getFieldY('#validateSourceBomBtn'),
      targetMat: await getFieldY('#targetMaterial'),
      targetPlant: await getFieldY('#targetPlant'),
      targetUsage: await getFieldY('#targetUsage'),
      targetAlt: await getFieldY('#targetAltBom'),
      validFrom: await getFieldY('#validFrom')
    };

    // No horizontal scroll
    const pageScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const pageClientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(pageScrollWidth).toBeLessThanOrEqual(pageClientWidth + 1);

    // SCREENSHOT 1: Before validation
    const ss1 = `screenshots/copy-bom-before-validation-${vp}.png`;
    await page.screenshot({ path: ss1, fullPage: false });
    saveScreenshot(ss1, `copy-bom-before-validation-${vp}.png`);

    // ------------------------------------------------------------------------
    // SCENARIO 2: SUCCESSFUL VALIDATION WITH 3 ALTERNATIVES
    // ------------------------------------------------------------------------
    await page.fill('#sourceMaterial', 'A1BH0214C');
    await page.fill('#sourcePlant', '1000');
    await page.fill('#sourceUsage', '1');

    await validateBtn.click();

    // Strip appears below cards
    const strip = page.locator('#copyBomValidationStrip');
    await expect(strip).toBeVisible({ timeout: 5000 });

    // Validate button success state
    const btnTextAfterVal = (await validateBtn.innerText()).trim();
    expect(btnTextAfterVal).toBe('BOM Validated');
    expect(btnTextAfterVal).not.toContain('✓'); // Icon is enough, no text character
    await expect(validateBtn).toBeEnabled(); // Stays clickable to re-validate

    // Strip content assertions
    await expect(strip).toContainText('Source BOM validated');
    await expect(strip).toContainText('Material A1BH0214C found');
    await expect(strip).toContainText('Plant 1000 validated');
    await expect(strip).toContainText('BOM usage 1 found');
    await expect(strip).toContainText('components found');
    await expect(strip).toContainText('Available alternative BOMs:');

    // 3 Alt chips
    const altChips = strip.locator('.rx-alt-chip');
    await expect(altChips).toHaveCount(3);
    expect(await altChips.nth(0).innerText()).toBe('Alt 01');
    expect(await altChips.nth(1).innerText()).toBe('Alt 02');
    expect(await altChips.nth(2).innerText()).toBe('Alt 03');

    // Strip position: OUTSIDE both cards and spans width
    const stripBox = await strip.boundingBox();
    const boxCard0After = await sourceCard.boundingBox();
    const boxCard1After = await targetCard.boundingBox();

    expect(stripBox.y).toBeGreaterThanOrEqual(boxCard0After.y + boxCard0After.height - 2);
    expect(stripBox.y).toBeGreaterThanOrEqual(boxCard1After.y + boxCard1After.height - 2);

    // CARD HEIGHT INVARIANTS:
    // Both cards equal height after validation
    expect(Math.abs(boxCard0After.height - boxCard1After.height)).toBeLessThanOrEqual(1);
    // Source card height identical before vs after validation
    expect(Math.abs(boxCard0After.height - boxCard0Before.height)).toBeLessThanOrEqual(1);
    // Target card height identical before vs after validation
    expect(Math.abs(boxCard1After.height - boxCard1Before.height)).toBeLessThanOrEqual(1);

    // FIELD Y POSITIONS UNCHANGED:
    expect(Math.abs((await getFieldY('#sourceMaterial')) - baselineY.sourceMat)).toBeLessThanOrEqual(1);
    expect(Math.abs((await getFieldY('#sourcePlant')) - baselineY.sourcePlant)).toBeLessThanOrEqual(1);
    expect(Math.abs((await getFieldY('#sourceUsage')) - baselineY.sourceUsage)).toBeLessThanOrEqual(1);
    expect(Math.abs((await getFieldY('#sourceAltBom')) - baselineY.sourceAlt)).toBeLessThanOrEqual(1);
    expect(Math.abs((await getFieldY('#validateSourceBomBtn')) - baselineY.validateBtn)).toBeLessThanOrEqual(1);
    expect(Math.abs((await getFieldY('#targetMaterial')) - baselineY.targetMat)).toBeLessThanOrEqual(1);
    expect(Math.abs((await getFieldY('#targetPlant')) - baselineY.targetPlant)).toBeLessThanOrEqual(1);
    expect(Math.abs((await getFieldY('#targetUsage')) - baselineY.targetUsage)).toBeLessThanOrEqual(1);
    expect(Math.abs((await getFieldY('#targetAltBom')) - baselineY.targetAlt)).toBeLessThanOrEqual(1);
    expect(Math.abs((await getFieldY('#validFrom')) - baselineY.validFrom)).toBeLessThanOrEqual(1);

    // Cancel / Proceed footer is reachable below strip
    const proceedBtn = page.locator('button[type="submit"]');
    await expect(proceedBtn).toBeVisible();
    const proceedBox = await proceedBtn.boundingBox();
    expect(proceedBox.y).toBeGreaterThan(stripBox.y);

    // SCREENSHOT 2: Validated with 3 alts
    const pageHeightAfterVal = await page.evaluate(() => document.documentElement.scrollHeight);
    console.log(`[Page Height After Validation ${vp}] scrollHeight: ${pageHeightAfterVal}px`);
    const ss2 = `screenshots/copy-bom-validated-3alts-${vp}.png`;
    await page.screenshot({ path: ss2, fullPage: false });
    saveScreenshot(ss2, `copy-bom-validated-3alts-${vp}.png`);

    // ------------------------------------------------------------------------
    // SCENARIO 3: VALIDATION WITH 12 ALTERNATIVES (8 chips + "+4 more")
    // ------------------------------------------------------------------------
    await page.fill('#sourceMaterial', 'MULTIALT');
    await validateBtn.click();
    await page.waitForTimeout(300);

    await expect(strip).toContainText('Available alternative BOMs:');
    const altChips12 = strip.locator('.rx-alt-chip');
    await expect(altChips12).toHaveCount(8);

    const moreBadge = strip.locator('.rx-alt-more-badge');
    await expect(moreBadge).toBeVisible();
    expect(await moreBadge.innerText()).toBe('+4 more');

    // Cards height still invariant
    const boxCard0Alt12 = await sourceCard.boundingBox();
    const boxCard1Alt12 = await targetCard.boundingBox();
    expect(Math.abs(boxCard0Alt12.height - boxCard0Before.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(boxCard1Alt12.height - boxCard1Before.height)).toBeLessThanOrEqual(1);

    // SCREENSHOT 3: Validated with 12 alts
    const ss3 = `screenshots/copy-bom-validated-12alts-${vp}.png`;
    await page.screenshot({ path: ss3, fullPage: false });
    saveScreenshot(ss3, `copy-bom-validated-12alts-${vp}.png`);

    // ------------------------------------------------------------------------
    // SCENARIO 4: FAILED VALIDATION (MATERIAL NOT FOUND)
    // ------------------------------------------------------------------------
    await page.fill('#sourceMaterial', 'NOTFOUND');
    await validateBtn.click();
    await page.waitForTimeout(300);

    await expect(strip).toBeVisible();
    await expect(strip).toHaveClass(/rx-copy-bom-result-error/);
    await expect(strip).toContainText('Validation Failed');
    await expect(strip).toContainText('Material NOTFOUND not found in plant');

    // Cards height still invariant
    const boxCard0Err = await sourceCard.boundingBox();
    const boxCard1Err = await targetCard.boundingBox();
    expect(Math.abs(boxCard0Err.height - boxCard0Before.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(boxCard1Err.height - boxCard1Before.height)).toBeLessThanOrEqual(1);

    // SCREENSHOT 4: Failed validation
    const ss4 = `screenshots/copy-bom-validation-failed-${vp}.png`;
    await page.screenshot({ path: ss4, fullPage: false });
    saveScreenshot(ss4, `copy-bom-validation-failed-${vp}.png`);
  });
});
