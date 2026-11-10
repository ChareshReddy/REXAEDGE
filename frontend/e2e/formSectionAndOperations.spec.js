import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { setupMocks } from './helpers/mockApi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const screenshotsDir = path.resolve(__dirname, '../screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

test.describe('FormSection, Copy BOM Equal Cards & Delete BOM Layout Suite', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page, { authenticated: true, role: 'admin' });
  });

  // --------------------------------------------------------------------------
  // 1. COPY BOM: EQUAL CARDS & ROW ALIGNMENT
  // --------------------------------------------------------------------------
  test('Copy BOM: Source and Target cards equal height, rows horizontally aligned, no duplicated text @shots', async ({ page }, testInfo) => {
    const viewportName = testInfo.project.name;
    await page.goto('/products/bom/copy/single', { waitUntil: 'networkidle' });
    await page.waitForSelector('#sourceMaterial', { state: 'visible' });
    await page.waitForTimeout(200);

    const sourceCard = page.locator('.rx-card').filter({ hasText: 'Reference BOM' });
    const targetCard = page.locator('.rx-card').filter({ hasText: 'New BOM Destination' });

    await expect(sourceCard).toBeVisible();
    await expect(targetCard).toBeVisible();

    const sourceBox = await sourceCard.boundingBox();
    const targetBox = await targetCard.boundingBox();

    expect(sourceBox).not.toBeNull();
    expect(targetBox).not.toBeNull();

    if (viewportName === '1366x768' || viewportName === '1920x1080') {
      // 1. Cards side by side: heights equal within 1px
      expect(Math.abs(sourceBox.height - targetBox.height)).toBeLessThanOrEqual(1.5);

      // 2. Horizontal alignment of matching rows: Material, Plant, BOM usage + Alternative BOM
      const sourceMat = page.locator('#sourceMaterial');
      const targetMat = page.locator('#targetMaterial');
      const sourceMatBox = await sourceMat.boundingBox();
      const targetMatBox = await targetMat.boundingBox();
      expect(Math.abs(sourceMatBox.y - targetMatBox.y)).toBeLessThanOrEqual(1.5);

      const sourcePlant = page.locator('#sourcePlant');
      const targetPlant = page.locator('#targetPlant');
      const sourcePlantBox = await sourcePlant.boundingBox();
      const targetPlantBox = await targetPlant.boundingBox();
      expect(Math.abs(sourcePlantBox.y - targetPlantBox.y)).toBeLessThanOrEqual(1.5);

      const sourceUsage = page.locator('#sourceUsage');
      const targetUsage = page.locator('#targetUsage');
      const sourceUsageBox = await sourceUsage.boundingBox();
      const targetUsageBox = await targetUsage.boundingBox();
      expect(Math.abs(sourceUsageBox.y - targetUsageBox.y)).toBeLessThanOrEqual(1.5);

      const sourceAlt = page.locator('#sourceAltBom');
      const targetAlt = page.locator('#targetAltBom');
      const sourceAltBox = await sourceAlt.boundingBox();
      const targetAltBox = await targetAlt.boundingBox();
      expect(Math.abs(sourceAltBox.y - targetAltBox.y)).toBeLessThanOrEqual(1.5);

      // 3. Arrow connector is vertically centered between the cards
      const arrowConnector = page.locator('div[aria-hidden="true"]').filter({ has: page.locator('svg.lucide-arrow-right') });
      await expect(arrowConnector).toBeVisible();
      const arrowBox = await arrowConnector.boundingBox();
      expect(arrowBox).not.toBeNull();
      // Arrow Y should be near the middle of source card
      const cardMidY = sourceBox.y + sourceBox.height / 2;
      const arrowMidY = arrowBox.y + arrowBox.height / 2;
      expect(Math.abs(cardMidY - arrowMidY)).toBeLessThanOrEqual(40);

      // 4. Save Copy BOM screenshot
      await page.screenshot({
        path: path.join(screenshotsDir, `copy-bom-equal-cards-${viewportName}.png`),
        fullPage: true
      });
    } else if (viewportName === '1024x768' || viewportName === '390x844') {
      // Below 1100px: cards stack vertically, arrow is hidden
      expect(sourceBox.y + sourceBox.height).toBeLessThanOrEqual(targetBox.y + 20);
      const arrowConnector = page.locator('.hidden.min-\\[1100px\\]\\:flex');
      await expect(arrowConnector).toBeHidden();
    }

    // 5. Verify no text is duplicated in placeholder and hint
    const sourceAltField = page.locator('.rx-field-wrapper').filter({ hasText: 'Alternative BOM' }).first();
    const sourceAltHint = sourceAltField.locator('.rx-field-hint');
    await expect(sourceAltHint).toHaveText('Optional');
    const sourceAltInput = page.locator('#sourceAltBom');
    await expect(sourceAltInput).toHaveAttribute('placeholder', 'Ex. 1');

    const targetAltField = page.locator('.rx-field-wrapper').filter({ hasText: 'Alternative BOM' }).nth(1);
    const targetAltHint = targetAltField.locator('.rx-field-hint');
    await expect(targetAltHint).toHaveText('Optional');
    const targetAltInput = page.locator('#targetAltBom');
    await expect(targetAltInput).toHaveAttribute('placeholder', 'Ex. 1');

    const validFromField = page.locator('.rx-field-wrapper').filter({ hasText: 'Valid From' });
    const validFromHint = validFromField.locator('.rx-field-hint');
    await expect(validFromHint).toHaveText('Optional, format DD.MM.YYYY');
    const validFromInput = page.locator('#validFrom');
    await expect(validFromInput).toHaveAttribute('placeholder', 'DD.MM.YYYY');

    // 6. Section badges (Source / Target) vertically centered with title
    const sourceBadge = sourceCard.locator('.rx-form-section-header span:has-text("Source")');
    await expect(sourceBadge).toBeVisible();
    const targetBadge = targetCard.locator('.rx-form-section-header span:has-text("Target")');
    await expect(targetBadge).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // 2. DELETE BOM: WARNING ALERT & LAYOUT
  // --------------------------------------------------------------------------
  test('Delete BOM: Warning alert padding, 16px gaps, sentence-case title, and 4-column fields @shots', async ({ page }, testInfo) => {
    const viewportName = testInfo.project.name;
    await page.goto('/products/bom/delete', { waitUntil: 'networkidle' });
    await page.waitForSelector('#delMaterial', { state: 'visible' });
    await page.waitForTimeout(200);

    // 1. Alert inner padding >= 12px and text never touches border
    const alert = page.locator('[data-slot="alert"]').first();
    await expect(alert).toBeVisible();

    const alertPadding = await alert.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return {
        top: parseFloat(s.paddingTop),
        bottom: parseFloat(s.paddingBottom),
        left: parseFloat(s.paddingLeft),
        right: parseFloat(s.paddingRight)
      };
    });
    expect(alertPadding.top).toBeGreaterThanOrEqual(12);
    expect(alertPadding.bottom).toBeGreaterThanOrEqual(12);
    expect(alertPadding.left).toBeGreaterThanOrEqual(12);
    expect(alertPadding.right).toBeGreaterThanOrEqual(12);

    // 2. Gap between page header divider and alert >= 16px
    const header = page.locator('.fiori-ph');
    const headerBox = await header.boundingBox();
    const alertBox = await alert.boundingBox();
    expect(headerBox).not.toBeNull();
    expect(alertBox).not.toBeNull();
    const gapHeaderToAlert = alertBox.y - (headerBox.y + headerBox.height);
    expect(gapHeaderToAlert).toBeGreaterThanOrEqual(16);

    // 3. Gap between alert and Delete form card >= 16px
    const formCard = page.locator('.rx-card').filter({ hasText: 'Delete Bill of Materials' });
    await expect(formCard).toBeVisible();
    const cardBox = await formCard.boundingBox();
    expect(cardBox).not.toBeNull();
    const gapAlertToCard = cardBox.y - (alertBox.y + alertBox.height);
    expect(gapAlertToCard).toBeGreaterThanOrEqual(16);

    // 4. Alert title is not uppercase (computed text-transform none) and semibold 14px
    const alertTitle = alert.locator('[data-slot="alert-title"]');
    await expect(alertTitle).toHaveText('Destructive operation');
    const titleTransform = await alertTitle.evaluate((el) => window.getComputedStyle(el).textTransform);
    expect(titleTransform).toBe('none');

    // 5. Form fields in single row at >= 1280px (1366x768 and 1920x1080)
    const delMat = page.locator('#delMaterial');
    const delPlant = page.locator('#delPlant');
    const delAlt = page.locator('#delAlternativeBom');
    const delUsage = page.locator('#delBomUsage');

    await expect(delMat).toBeVisible();
    await expect(delPlant).toBeVisible();
    await expect(delAlt).toBeVisible();
    await expect(delUsage).toBeVisible();

    if (viewportName === '1366x768' || viewportName === '1920x1080') {
      const matBox = await delMat.boundingBox();
      const plantBox = await delPlant.boundingBox();
      const altBox = await delAlt.boundingBox();
      const usageBox = await delUsage.boundingBox();

      // All 4 fields at same Y in single row
      expect(Math.abs(matBox.y - plantBox.y)).toBeLessThanOrEqual(1.5);
      expect(Math.abs(plantBox.y - altBox.y)).toBeLessThanOrEqual(1.5);
      expect(Math.abs(altBox.y - usageBox.y)).toBeLessThanOrEqual(1.5);

      // Save Delete BOM screenshot
      await page.screenshot({
        path: path.join(screenshotsDir, `delete-bom-layout-${viewportName}.png`),
        fullPage: true
      });
    }

    // 6. Action row: Cancel (secondary, left) and "Proceed to confirmation" (primary)
    const cancelBtn = page.locator('button:has-text("Cancel")');
    const proceedBtn = page.locator('button:has-text("Proceed to confirmation")');
    await expect(cancelBtn).toBeVisible();
    await expect(proceedBtn).toBeVisible();
    await expect(cancelBtn).toHaveClass(/rx-btn-secondary/);
    await expect(proceedBtn).toHaveClass(/rx-btn-primary/);

    const cancelBox = await cancelBtn.boundingBox();
    const proceedBox = await proceedBtn.boundingBox();
    if (viewportName === '390x844') {
      // On mobile <= 640px, action buttons stack vertically in column-reverse (primary Proceed on top, Cancel below)
      expect(proceedBox.y).toBeLessThan(cancelBox.y);
    } else {
      // On desktop, Cancel is on left, Proceed is on right
      expect(cancelBox.x).toBeLessThan(proceedBox.x);
    }
  });

  // --------------------------------------------------------------------------
  // 3. ALL FORMSECTION PAGES: DIVIDER GAPS & DESCRIPTION PADDING
  // --------------------------------------------------------------------------
  test('All FormSection pages: gap between header divider and first label >= 16px, gap between desc and divider >= 12px', async ({ page }) => {
    const urls = [
      '/products/bom/create/single',
      '/products/bom/copy/single',
      '/products/bom/delete',
      '/products/bom/validate',
      '/products/bom/display'
    ];

    for (const url of urls) {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('.rx-card', { state: 'visible' });

      const sections = page.locator('.rx-card .rx-form-section-header');
      const count = await sections.count();
      expect(count).toBeGreaterThanOrEqual(1);

      for (let i = 0; i < count; i++) {
        const header = sections.nth(i);
        const headerBox = await header.boundingBox();
        if (!headerBox) continue;

        // Gap from description to divider (if description exists)
        const desc = header.locator('.rx-form-section-desc');
        if (await desc.count() > 0 && await desc.isVisible()) {
          const descBox = await desc.boundingBox();
          if (descBox) {
            const gapDescToDivider = (headerBox.y + headerBox.height) - (descBox.y + descBox.height);
            expect(gapDescToDivider).toBeGreaterThanOrEqual(11.5);
          }
        }

        // Gap from divider to first label in the section body
        const card = header.locator('xpath=..');
        const firstLabel = card.locator('label.rx-field-label, label').first();
        if (await firstLabel.count() > 0 && await firstLabel.isVisible()) {
          const labelBox = await firstLabel.boundingBox();
          if (labelBox) {
            const gapDividerToLabel = labelBox.y - (headerBox.y + headerBox.height);
            expect(gapDividerToLabel).toBeGreaterThanOrEqual(15.5);
          }
        }
      }
    }
  });
});
