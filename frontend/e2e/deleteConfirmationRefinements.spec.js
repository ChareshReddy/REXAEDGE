import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { setupMocks } from './helpers/mockApi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const screenshotsDir = path.resolve(__dirname, '../screenshots');
const artifactDir = 'C:/Users/chare/.gemini/antigravity/brain/670a18b0-0002-4036-b6f5-4b4c0c22c519';

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

test.describe('Delete BOM Confirmation Screen Refinements', () => {
  for (const viewport of [
    { width: 1366, height: 768, name: '1366x768' },
    { width: 1920, height: 1080, name: '1920x1080' }
  ]) {
    test(`Delete Confirmation Screen at ${viewport.name}`, async ({ page }, testInfo) => {
      if (testInfo.project.name !== viewport.name) {
        test.skip();
      }

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await setupMocks(page, { authenticated: true });

      // Mock BOM details
      await page.route('**/api/bom/details**', async (route) => {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              material: 'A1BH0214C',
              plant: '1010',
              alternativeBom: '01',
              bomUsage: '1',
              components: [{ id: 1, component: 'COMP-100', quantity: '2', itemCategory: 'L' }]
            }
          })
        });
      });

      // Mock chat API action for delete proposal
      await page.route('**/api/chat', async (route) => {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            reply: 'Confirm permanent deletion of BOM for A1BH0214C.',
            proposedAction: {
              actionId: 'act_del_123',
              type: 'delete_bom',
              entityKey: 'bom',
              expiresAt: Date.now() + 300000,
              preview: {
                material: 'A1BH0214C',
                plant: '1010',
                alternativeBom: '01',
                bomUsage: '1',
                riskLevel: 3
              }
            }
          })
        });
      });

      // 1. Navigate to Delete BOM and open confirmation screen
      await page.goto('/products/bom/delete');
      await page.waitForLoadState('networkidle');

      await page.waitForSelector('#delMaterial', { state: 'visible', timeout: 10000 });
      await page.locator('#delMaterial').fill('A1BH0214C');

      const plantInput = page.locator('#delPlant');
      if (await plantInput.isVisible()) await plantInput.fill('1010');

      const altInput = page.locator('#delAlternativeBom');
      if (await altInput.isVisible()) await altInput.fill('01');

      const usageInput = page.locator('#delBomUsage');
      if (await usageInput.isVisible()) await usageInput.fill('1');

      // Click "Proceed"
      const proceedBtn = page.getByRole('button', { name: /proceed/i }).first();
      await proceedBtn.click();

      // Wait for confirmation card
      const proposalCard = page.locator('.sap-confirm-card');
      await expect(proposalCard).toBeVisible({ timeout: 5000 });

      // ----------------------------------------------------------------------
      // ASSERTION 1: Table Container height fits single data row (no large empty space)
      // ----------------------------------------------------------------------
      const paramContainer = page.locator('[data-testid="delete-bom-param-container"]');
      await expect(paramContainer).toBeVisible();

      const tableBox = await paramContainer.boundingBox();
      expect(tableBox).not.toBeNull();
      // Header row (~32px) + 1 data row (~36px) = ~68-76px total. Must be well under the previous 146px min-height!
      expect(tableBox.height).toBeLessThan(85);
      expect(tableBox.height).toBeGreaterThan(50);

      // Check vertical gap between bottom of table container and top of the next block (info note)
      const infoBox = page.locator('.sap-confirm-card div:has(> svg):has-text("Executed directly in SAP")').first();
      await expect(infoBox).toBeVisible();
      const infoBoxRect = await infoBox.boundingBox();
      expect(infoBoxRect).not.toBeNull();

      const verticalGap = infoBoxRect.y - (tableBox.y + tableBox.height);
      // Vertical gap must be normal padding/margin (~10px to 22px), never a giant empty hole
      expect(verticalGap).toBeLessThanOrEqual(24);
      expect(verticalGap).toBeGreaterThanOrEqual(5);

      // ----------------------------------------------------------------------
      // ASSERTION 2: Initial State - No error message, no red border, Confirm button disabled
      // ----------------------------------------------------------------------
      const errorTextLocator = page.locator('text=Reason for change is required before confirming deletion.');
      await expect(errorTextLocator).not.toBeVisible();

      const reasonTextarea = page.locator('textarea[placeholder*="Provide business justification"]');
      await expect(reasonTextarea).toBeVisible();

      // Verify border is not danger color on initial render
      const initialBorderColor = await reasonTextarea.evaluate((el) => window.getComputedStyle(el).borderColor);
      expect(initialBorderColor).not.toContain('180'); // Not #B42318 red

      const confirmDeleteBtn = page.getByRole('button', { name: /confirm delete bom/i });
      await expect(confirmDeleteBtn).toBeDisabled();

      // Capture Screenshot: Initial State
      const shotInitial = path.resolve(screenshotsDir, `delete-bom-initial-${viewport.name}.png`);
      const artifactInitial = path.resolve(artifactDir, `delete-bom-initial-${viewport.name}.png`);
      await page.screenshot({ path: shotInitial, fullPage: true });
      if (fs.existsSync(shotInitial)) fs.copyFileSync(shotInitial, artifactInitial);

      // ----------------------------------------------------------------------
      // ASSERTION 3: Reason touched and empty (blur) - Red border and error appears
      // ----------------------------------------------------------------------
      await reasonTextarea.focus();
      // Blur by clicking outside on the card header
      await page.locator('.sap-confirm-header').click();

      // Error text must appear
      await expect(errorTextLocator).toBeVisible();

      // Border must turn red (rgb(180, 35, 24))
      const errorBorderColor = await reasonTextarea.evaluate((el) => window.getComputedStyle(el).borderColor);
      expect(errorBorderColor).toMatch(/180|220|239/);

      // Button remains disabled
      await expect(confirmDeleteBtn).toBeDisabled();

      // Capture Screenshot: Touched and Empty
      const shotTouched = path.resolve(screenshotsDir, `delete-bom-touched-empty-${viewport.name}.png`);
      const artifactTouched = path.resolve(artifactDir, `delete-bom-touched-empty-${viewport.name}.png`);
      await page.screenshot({ path: shotTouched, fullPage: true });
      if (fs.existsSync(shotTouched)) fs.copyFileSync(shotTouched, artifactTouched);

      // ----------------------------------------------------------------------
      // ASSERTION 4: Text typed - Error clears immediately
      // ----------------------------------------------------------------------
      await reasonTextarea.fill('Obsolete prototype discontinued per Engineering RFC-9021');

      // Error must immediately disappear
      await expect(errorTextLocator).not.toBeVisible();

      const clearedBorderColor = await reasonTextarea.evaluate((el) => window.getComputedStyle(el).borderColor);
      expect(clearedBorderColor).not.toMatch(/180,\s*35,\s*24/);

      // Button still disabled until checkbox is ticked
      await expect(confirmDeleteBtn).toBeDisabled();

      // ----------------------------------------------------------------------
      // ASSERTION 5: Checkbox ticked - Confirm Delete BOM button enables
      // ----------------------------------------------------------------------
      const checkbox = page.locator('.sap-delete-checkbox-label input[type="checkbox"]');
      await checkbox.check();
      await expect(checkbox).toBeChecked();

      // Button is now enabled!
      await expect(confirmDeleteBtn).toBeEnabled();

      // Capture Screenshot: Filled and Ready
      const shotFilled = path.resolve(screenshotsDir, `delete-bom-filled-ready-${viewport.name}.png`);
      const artifactFilled = path.resolve(artifactDir, `delete-bom-filled-ready-${viewport.name}.png`);
      await page.screenshot({ path: shotFilled, fullPage: true });
      if (fs.existsSync(shotFilled)) fs.copyFileSync(shotFilled, artifactFilled);
    });
  }
});
