import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { setupMocks } from './helpers/mockApi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const artifactDir = 'C:/Users/chare/.gemini/antigravity/brain/670a18b0-0002-4036-b6f5-4b4c0c22c519';

test.describe('Create Single BOM - Simple Compact Confirm BOM Creation Dialog & Notifications', () => {
  for (const viewport of [
    { width: 1366, height: 768, name: '1366x768' },
    { width: 1920, height: 1080, name: '1920x1080' }
  ]) {
    test(`Confirm BOM Creation dialog & validation notifications at ${viewport.name}`, async ({ page }, testInfo) => {
      if (testInfo.project.name !== viewport.name) {
        test.skip();
      }

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await setupMocks(page, { authenticated: true });

      // Mock material lookup so any material name passes existence validation
      await page.route('**/api/materials/**', async (route) => {
        const url = route.request().url();
        const matMatch = url.match(/\/api\/materials\/([^?]+)/);
        const matnr = matMatch ? decodeURIComponent(matMatch[1]) : 'A1PSB001B';
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { matnr, werks: '1010', meins: 'EA', maktx: 'Test Material Description' },
            materials: [{ matnr, werks: '1010', meins: 'EA', maktx: 'Test Material Description' }]
          })
        });
      });

      let mockWarnings = [];
      await page.route('**/api/bom/create-preflight', async (route) => {
        const req = route.request();
        let postData = {};
        try {
          postData = req.postDataJSON() || {};
        } catch (_) {}
        const bom = postData.bom || {};

        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            boms: [
              {
                status: 'Ready',
                material: bom.material || 'A1PSB001B',
                plant: bom.plant || '1010',
                bomUsage: bom.bomUsage || '1',
                alternativeBom: bom.alternativeBom || '25',
                baseQty: bom.baseQty || '100',
                baseUnit: 'EA',
                bomStatus: bom.bomStatus || '01',
                validFrom: bom.validFrom || '12.11.2026',
                warnings: mockWarnings,
                errors: []
              }
            ]
          })
        });
      });

      // 1. Navigate to Create Single BOM
      await page.goto('/products/bom/create/single', { waitUntil: 'networkidle' });
      await page.waitForSelector('#createBomMaterial', { state: 'visible', timeout: 10000 });

      // 2. Fill Header Fields
      await page.fill('#createBomMaterial', 'A1PSB001B');
      await page.fill('#createBomPlant', '1010');
      await page.fill('#createBomUsage', '1');
      await page.fill('#createBomAlt', '25');
      await page.fill('#createBomBaseQty', '100');

      // 3. Fill First Component
      const firstRow = page.locator('table.sap-table tbody tr').first();
      await firstRow.locator('input').first().fill('D4PSB001B');
      await firstRow.locator('input[aria-label*="Quantity"]').first().fill('1');
      await firstRow.locator('input').nth(3).fill('PR67');

      // --- TEST CASE 1: Validation with NO warnings ---
      mockWarnings = [];
      const validateBtn = page.locator('button:has-text("Validate Master Data")').first();
      await expect(validateBtn).toBeEnabled();
      await validateBtn.click();

      // Assert exactly ONE toast appears with green success
      const successToast = page.locator('.sap-toast');
      await expect(successToast).toHaveCount(1);
      await expect(successToast).toHaveClass(/sap-toast-success/);
      await expect(page.locator('text=Pre-flight passed. Material master data, units and SAP simulation verified.')).toBeVisible();

      // Assert NO [object Object] anywhere on page
      const pageText1 = await page.content();
      expect(pageText1).not.toContain('[object Object]');

      // Screenshot 1: Toast without warnings
      const shotNoWarnings = path.join(artifactDir, `confirm-bom-toast-nowarnings-${viewport.name}.png`);
      await page.screenshot({ path: shotNoWarnings, fullPage: false });

      // Wait for success toast to disappear or remove it before testing warning toast
      const closeToastBtn = page.locator('.sap-toast-close, .sap-toast button').first();
      if (await closeToastBtn.isVisible()) {
        await closeToastBtn.click();
      }
      await page.waitForTimeout(500);

      // --- TEST CASE 2: Validation WITH warnings ---
      mockWarnings = [
        { text: 'Component "D4PSB001B" is not extended to plant 1010 (MARC)', type: 'warning' },
        { code: 'W_LOC', message: 'Storage location PR67 review recommended' }
      ];
      await validateBtn.click();

      // Assert exactly ONE toast appears with amber warning
      const warningToast = page.locator('.sap-toast');
      await expect(warningToast).toHaveCount(1);
      await expect(warningToast).toHaveClass(/sap-toast-warning/);
      await expect(page.locator('text=Pre-flight passed with warnings')).toBeVisible();
      await expect(page.locator('text=Component "D4PSB001B" is not extended to plant 1010 (MARC)')).toBeVisible();
      await expect(page.locator('text=W_LOC: Storage location PR67 review recommended')).toBeVisible();

      // Assert NO [object Object] anywhere
      const pageText2 = await page.content();
      expect(pageText2).not.toContain('[object Object]');

      // Screenshot 2: Toast with warning
      const shotWithWarnings = path.join(artifactDir, `confirm-bom-toast-warnings-${viewport.name}.png`);
      await page.screenshot({ path: shotWithWarnings, fullPage: false });

      // --- TEST CASE 3: Compact Confirmation Popup (1 component) ---
      const createBomBtn = page.locator('button:has-text("Preview & Create BOM")').first();
      await expect(createBomBtn).toBeEnabled({ timeout: 8000 });
      await createBomBtn.click();

      const modal = page.locator('[role="dialog"]').first();
      await expect(modal).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=Confirm BOM Creation').first()).toBeVisible();
      await expect(page.locator('text=You are about to create a new Bill of Materials in SAP.')).toBeVisible();

      // Assertion: NO <table> element inside the modal
      const tablesInModal = modal.locator('table');
      await expect(tablesInModal).toHaveCount(0);

      // Assertion: Details values present in 2-column block
      await expect(page.locator('[data-testid="confirm-detail-material"]')).toHaveText('A1PSB001B');
      await expect(page.locator('[data-testid="confirm-detail-plant"]')).toHaveText('1010');
      await expect(page.locator('[data-testid="confirm-detail-usage"]')).toHaveText('1');
      await expect(page.locator('[data-testid="confirm-detail-alternative"]')).toHaveText('25');
      await expect(page.locator('[data-testid="confirm-detail-baseqty"]')).toContainText('100');
      await expect(page.locator('[data-testid="confirm-detail-status"]')).toHaveText('01');

      // Assertion: Component heading & short row format
      await expect(page.locator('[data-testid="confirm-components-heading"]')).toHaveText('Components (1)');
      const compRow0 = page.locator('[data-testid="confirm-component-row-0"]');
      await expect(compRow0).toBeVisible();
      const row0Text = await compRow0.innerText();
      expect(row0Text).toContain('0010');
      expect(row0Text).toContain('D4PSB001B');
      expect(row0Text).toContain('Qty 1');
      expect(row0Text).toContain('Cat L');
      expect(row0Text).toContain('Loc PR67');

      // Assertion: Modal height fits content and is below 520px at 1366x768
      const modalBox = await modal.boundingBox();
      expect(modalBox).not.toBeNull();
      if (viewport.width === 1366) {
        expect(modalBox.height).toBeLessThan(520);
      }
      expect(modalBox.width).toBeLessThanOrEqual(580);

      // Assertion: Zero horizontal overflow on modal card
      const modalOverflow = await modal.evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(modalOverflow).toBeLessThanOrEqual(2);

      // Screenshot 3: Popup with 1 component
      const shot1Comp = path.join(artifactDir, `confirm-bom-1comp-${viewport.name}.png`);
      await page.screenshot({ path: shot1Comp, fullPage: false });

      // Close modal by clicking Cancel
      await page.click('button:has-text("Cancel")');
      await expect(modal).not.toBeVisible();

      // --- TEST CASE 4: Compact Confirmation Popup (8 components) ---
      // Add 7 more component rows
      const addRowBtn = page.locator('button:has-text("Add Component"), button:has-text("Add Row")').first();
      for (let i = 2; i <= 8; i++) {
        await addRowBtn.click();
        const row = page.locator('table.sap-table tbody tr').nth(i - 1);
        await row.locator('input').first().fill(`COMP-000${i}`);
        await row.locator('input[aria-label*="Quantity"]').first().fill(String(i * 5));
        await row.locator('input').nth(3).fill('PR67');
      }

      await validateBtn.click();
      await expect(createBomBtn).toBeEnabled({ timeout: 8000 });
      await createBomBtn.click();

      await expect(modal).toBeVisible({ timeout: 5000 });
      await expect(page.locator('[data-testid="confirm-components-heading"]')).toHaveText('Components (8)');

      // Assertion: Long component list scrolls inside the popup
      const compContainer = page.locator('[data-testid="confirm-bom-components-container"]');
      const isScrollable = await compContainer.evaluate((el) => el.scrollHeight > el.clientHeight);
      expect(isScrollable).toBe(true);

      // Screenshot 4: Popup with 8 components
      const shot8Comp = path.join(artifactDir, `confirm-bom-8comp-${viewport.name}.png`);
      await page.screenshot({ path: shot8Comp, fullPage: false });

      // Close modal
      await page.click('button:has-text("Cancel")');
      await expect(modal).not.toBeVisible();
    });
  }
});
