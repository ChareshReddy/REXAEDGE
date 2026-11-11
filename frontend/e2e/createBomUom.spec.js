import { test, expect } from '@playwright/test';
import { setupMocks } from './helpers/mockApi.js';

test.describe('Create Single BOM - Base Unit of Measure (UOM) Resolution', () => {
  test('UOM resolves dynamically from SAP MARA-MEINS and empties when invalid or busy (1366x768)', async ({ page }, testInfo) => {
    const vp = testInfo.project.name;
    if (vp !== '1366x768') {
      test.skip();
      return;
    }

    await setupMocks(page, { authenticated: true });

    let capturedPayload = null;
    page.on('request', (req) => {
      if (req.url().includes('/bom/create-preflight')) {
        try {
          capturedPayload = req.postDataJSON();
        } catch {}
      }
    });

    await page.goto('/products/bom/create/single', { waitUntil: 'networkidle' });
    await page.waitForSelector('#createBomMaterial', { state: 'visible', timeout: 10000 });

    const matInput = page.locator('#createBomMaterial');
    const plantInput = page.locator('#createBomPlant');
    const uomInput = page.locator('#createBomUom');

    // 1. Initial State: UOM must be empty
    await expect(uomInput).toHaveValue('');

    // 2. Invalid material (format invalid, e.g. "SHORT") -> UOM remains empty
    await matInput.fill('SHORT');
    await plantInput.focus(); // trigger blur on material
    await expect(uomInput).toHaveValue('');

    // 3. Valid material A1BH0214C -> UOM resolves to PAA
    await matInput.fill('A1BH0214C');
    await plantInput.focus();
    await expect(uomInput).toHaveValue('PAA');

    // 4. Changing valid to invalid empties UOM immediately on change
    await matInput.fill('A1BH0214C_INVALID');
    await expect(uomInput).toHaveValue('');
    await plantInput.focus();
    await expect(uomInput).toHaveValue('');

    // 5. Another valid material TG0001 with different unit ST -> UOM resolves to ST
    await matInput.fill('TG0001');
    await plantInput.focus();
    await expect(uomInput).toHaveValue('ST');

    // 6. SAP busy / unavailable -> UOM empty, no error on UOM
    await page.route('**/api/materials/BUSY_MAT**', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'SERVER_BUSY', message: 'SAP system is busy' })
      });
    });

    await matInput.fill('BUSY_MAT');
    await plantInput.focus();
    await expect(uomInput).toHaveValue('');
    // Ensure no error shown on UOM
    const uomError = page.locator('#createBomUom ~ .rx-field-error, #createBomUom.rx-input-error');
    await expect(uomError).toHaveCount(0);

    // 7. Verify preflight/create payload carries resolved unit
    await matInput.fill('A1BH0214C');
    await plantInput.focus();
    await expect(uomInput).toHaveValue('PAA');

    // Fill valid mandatory fields
    await plantInput.fill('1010');
    await page.locator('#createBomAlt').fill('01');
    await page.locator('#comp_material_1').fill('C3DH0416E');
    await page.locator('input[aria-label="Storage location 1"]').fill('101A');

    // Click Validate Master Data
    await page.click('button:has-text("Validate Master Data")');
    await expect(page.locator('text=Pre-flight passed')).toBeVisible({ timeout: 10000 });

    expect(capturedPayload).not.toBeNull();
    expect(capturedPayload.bom.baseUnit).toBe('PAA');
  });
});
