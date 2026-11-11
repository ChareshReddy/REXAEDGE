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

test.describe('Create Single BOM - Confirm BOM Creation Dialog', () => {
  for (const viewport of [
    { width: 1366, height: 768, name: '1366x768' },
    { width: 1920, height: 1080, name: '1920x1080' }
  ]) {
    test(`Confirm BOM Creation dialog at ${viewport.name} (1 component & 8 components)`, async ({ page }, testInfo) => {
      if (testInfo.project.name !== viewport.name) {
        test.skip();
      }

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await setupMocks(page, { authenticated: true });

      // Mock material lookup so any material name passes existence validation
      await page.route('**/api/materials/**', async (route) => {
        const url = route.request().url();
        const matMatch = url.match(/\/api\/materials\/([^?]+)/);
        const matnr = matMatch ? decodeURIComponent(matMatch[1]) : 'MAT-000100';
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { matnr, werks: '1010', maktx: 'Test Material Description' },
            materials: [{ matnr, werks: '1010', maktx: 'Test Material Description' }]
          })
        });
      });

      // Mock preflight validation endpoint to always succeed for single create
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
                material: bom.material || 'MAT-000100',
                plant: bom.plant || '1010',
                bomUsage: bom.bomUsage || '1',
                alternativeBom: bom.alternativeBom || '01',
                warnings: [],
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
      await page.fill('#createBomMaterial', 'MAT-000100');
      await page.fill('#createBomPlant', '1010');
      await page.fill('#createBomUsage', '1');
      await page.fill('#createBomAlt', '01');
      await page.fill('#createBomBaseQty', '1');

      // 3. Fill First Component
      const firstRow = page.locator('table.sap-table tbody tr').first();
      await firstRow.locator('input').first().fill('COMP-0001');
      await firstRow.locator('input[aria-label*="Quantity"]').first().fill('5');
      await firstRow.locator('input').nth(3).fill('0001');

      // 4. Click Validate Master Data
      const validateBtn = page.locator('button:has-text("Validate Master Data")').first();
      await expect(validateBtn).toBeEnabled();
      await validateBtn.click();

      // 5. Click Preview & Create BOM button (opens confirmation dialog)
      const createBomBtn = page.locator('button:has-text("Preview & Create BOM")').first();
      await expect(createBomBtn).toBeEnabled({ timeout: 8000 });
      await createBomBtn.click();

      // 6. Assert Modal Opens
      const modal = page.locator('[role="dialog"]').first();
      await expect(modal).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=Confirm BOM Creation').first()).toBeVisible();

      // Assert intro sentence
      await expect(page.locator('text=You are about to create a new Bill of Materials in SAP:')).toBeVisible();

      // --- ASSERTION 1: TABLE 1 HAS 8 HEADERS IN ORDER ---
      const headerTable = page.locator('[data-testid="confirm-bom-header-table"]');
      await expect(headerTable).toBeVisible();

      const expectedHeaders = [
        'Material',
        'Plant',
        'BOM usage',
        'Alternative',
        'Valid from',
        'Base qty',
        'UoM',
        'Components'
      ];

      const actualHeaders = await headerTable.locator('thead th').allInnerTexts();
      expect(actualHeaders.map((h) => h.trim())).toEqual(expectedHeaders);

      // --- ASSERTION 2: VALUES MATCH THE FORM ---
      const rowTds = headerTable.locator('tbody tr td');
      await expect(rowTds).toHaveCount(8);

      expect((await rowTds.nth(0).innerText()).trim()).toBe('MAT-000100');
      expect((await rowTds.nth(1).innerText()).trim()).toBe('1010');
      expect((await rowTds.nth(2).innerText()).trim()).toBe('1');
      expect((await rowTds.nth(3).innerText()).trim()).toBe('01');
      expect((await rowTds.nth(5).innerText()).trim()).toBe('1');
      expect((await rowTds.nth(6).innerText()).trim()).toBe('PAA');
      expect((await rowTds.nth(7).innerText()).trim()).toBe('1');

      // --- ASSERTION 3: COMPONENT TABLE WITH 1 ROW ---
      const compTable = page.locator('[data-testid="confirm-bom-components-table"]');
      await expect(compTable).toBeVisible();

      const expectedCompHeaders = ['Component', 'Quantity', 'Item category', 'Storage location'];
      const actualCompHeaders = await compTable.locator('thead th').allInnerTexts();
      expect(actualCompHeaders.map((h) => h.trim())).toEqual(expectedCompHeaders);

      const compRows = compTable.locator('tbody tr');
      await expect(compRows).toHaveCount(1);
      const comp1Tds = compRows.first().locator('td');
      expect((await comp1Tds.nth(0).innerText()).trim()).toBe('COMP-0001');
      expect((await comp1Tds.nth(1).innerText()).trim()).toBe('5');
      expect((await comp1Tds.nth(2).innerText()).trim()).toBe('L');
      expect((await comp1Tds.nth(3).innerText()).trim()).toBe('0001');

      // --- ASSERTION 4: FIRST FOCUS IS ON "Confirm & Create" BUTTON ---
      const confirmCreateBtn = page.locator('button:has-text("Confirm & Create")').first();
      await expect(confirmCreateBtn).toBeVisible();
      await expect(confirmCreateBtn).toBeFocused();

      // --- ASSERTION 5: NO HORIZONTAL SCROLLBAR ---
      const noScrollCheck1 = await page.evaluate(() => {
        const headerContainer = document.querySelector('[data-testid="confirm-bom-header-container"]');
        const compContainer = document.querySelector('[data-testid="confirm-bom-components-container"]');
        const modalCard = document.querySelector('.sap-modal-card');
        return {
          headerNoScroll: headerContainer.scrollWidth <= headerContainer.clientWidth,
          compNoScroll: compContainer.scrollWidth <= compContainer.clientWidth,
          modalNoScroll: modalCard.scrollWidth <= modalCard.clientWidth
        };
      });
      expect(noScrollCheck1.headerNoScroll).toBe(true);
      expect(noScrollCheck1.compNoScroll).toBe(true);
      expect(noScrollCheck1.modalNoScroll).toBe(true);

      // --- ASSERTION 6: BUTTONS VISIBLE WITHOUT SCROLLING ---
      const cancelBtn = page.locator('button:has-text("Cancel")').first();
      await expect(cancelBtn).toBeVisible();
      await expect(confirmCreateBtn).toBeVisible();

      const buttonsInViewport = await page.evaluate(() => {
        const btn = document.querySelector('button.primary[data-autofocus]');
        if (!btn) return false;
        const rect = btn.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= window.innerHeight;
      });
      expect(buttonsInViewport).toBe(true);

      // Screenshot 1-component dialog
      const shot1Name = `confirm-bom-1comp-${viewport.name}.png`;
      const localShot1 = path.join(screenshotsDir, shot1Name);
      const artifactShot1 = path.join(artifactDir, shot1Name);
      await page.screenshot({ path: localShot1, fullPage: false });
      fs.copyFileSync(localShot1, artifactShot1);

      // --- ASSERTION 7: OUTSIDE / BACKDROP CLICK DOES NOT CLOSE ---
      // Click at x=15, y=15 (dimmed backdrop outside modal card)
      await page.mouse.click(15, 15);
      await expect(modal).toBeVisible();

      // --- ASSERTION 8: ESCAPE CLOSES DIALOG ---
      await page.keyboard.press('Escape');
      await expect(modal).not.toBeVisible();

      // =========================================================================
      // SCENARIO 2: TEST WITH 8 COMPONENTS
      // =========================================================================
      // Add 7 more components (to make 8 total)
      const addCompBtn = page.locator('button:has-text("Add Component")').first();
      for (let i = 2; i <= 8; i++) {
        await addCompBtn.click();
        const row = page.locator('table.sap-table tbody tr').nth(i - 1);
        await row.locator('input').first().fill(`COMP-000${i}`);
        await row.locator('input[aria-label*="Quantity"]').first().fill(`${i * 5}`);
        await row.locator('input').nth(3).fill('0001');
      }

      // Re-validate with 8 components
      await validateBtn.click();
      await expect(createBomBtn).toBeEnabled({ timeout: 8000 });
      await createBomBtn.click();

      // Modal re-opens
      await expect(modal).toBeVisible({ timeout: 5000 });

      // Table 1 Components column should now show 8
      const rowTds8 = headerTable.locator('tbody tr td');
      expect((await rowTds8.nth(7).innerText()).trim()).toBe('8');

      // Table 2 should have 8 rows
      const compRows8 = compTable.locator('tbody tr');
      await expect(compRows8).toHaveCount(8);

      // Assert Table 2 container has max 5 rows visible with inner body scrolling
      const compScrollCheck = await page.evaluate(() => {
        const compContainer = document.querySelector('[data-testid="confirm-bom-components-container"]');
        return {
          maxHeight: window.getComputedStyle(compContainer).maxHeight,
          hasInnerScroll: compContainer.scrollHeight > compContainer.clientHeight,
          noHorizontalScroll: compContainer.scrollWidth <= compContainer.clientWidth
        };
      });
      expect(compScrollCheck.hasInnerScroll).toBe(true);
      expect(compScrollCheck.noHorizontalScroll).toBe(true);

      // Confirm buttons still visible without scrolling
      const buttonsInViewport8 = await page.evaluate(() => {
        const btn = document.querySelector('button.primary[data-autofocus]');
        if (!btn) return false;
        const rect = btn.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= window.innerHeight;
      });
      expect(buttonsInViewport8).toBe(true);

      // Take Screenshot
      const shotName = `confirm-bom-creation-${viewport.name}.png`;
      const localShotPath = path.join(screenshotsDir, shotName);
      const artifactShotPath = path.join(artifactDir, shotName);

      await page.screenshot({ path: localShotPath, fullPage: false });
      fs.copyFileSync(localShotPath, artifactShotPath);
    });
  }
});
