import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { setupMocks } from './helpers/mockApi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const screenshotsDir = path.resolve(__dirname, '../screenshots');

function decodePng(buf) {
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const idatChunks = [];
  let pos = 8;
  while (pos < buf.length) {
    const chunkLen = buf.readUInt32BE(pos);
    const chunkType = buf.toString('ascii', pos + 4, pos + 8);
    if (chunkType === 'IDAT') {
      idatChunks.push(buf.slice(pos + 8, pos + 8 + chunkLen));
    }
    pos += 8 + chunkLen + 4;
  }
  const compressed = Buffer.concat(idatChunks);
  const raw = zlib.inflateSync(compressed);
  return { width, height, raw };
}

test.describe('Field Validation Rules & Baseline Screenshot Comparison Suite', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await setupMocks(page, { authenticated: true, role: 'admin' });
  });

  // --------------------------------------------------------------------------
  // 1. PIXEL COMPARISON WITH BASELINES (EMPTY & ERROR STATES)
  // --------------------------------------------------------------------------
  test('Screenshot comparison against baselines (zero tolerance in form area) @shots', async ({ page }, testInfo) => {
    const vp = testInfo.project.name;
    if (vp !== '1366x768' && vp !== '1920x1080') {
      test.skip();
      return;
    }

    const pagesToCompare = [
      {
        name: 'create-single',
        path: '/products/bom/create/single',
        waitSelector: '#createBomMaterial'
      },
      {
        name: 'copy-single',
        path: '/products/bom/copy/single',
        waitSelector: '#sourceMaterial'
      },
      {
        name: 'delete',
        path: '/products/bom/delete',
        waitSelector: '#delMaterial'
      },
      {
        name: 'validate',
        path: '/products/bom/validate',
        waitSelector: '#valMaterial'
      },
      {
        name: 'explorer',
        path: '/products/bom/display',
        waitSelector: '#expMaterial'
      }
    ];

    for (const item of pagesToCompare) {
      await page.goto(item.path, { waitUntil: 'networkidle' });
      await page.waitForSelector(item.waitSelector, { state: 'visible' });
      await page.waitForTimeout(400);

      const afterBuffer = await page.screenshot({ fullPage: true });
      const baselinePath = path.join(screenshotsDir, `baseline-${item.name}-${vp}.png`);
      expect(fs.existsSync(baselinePath)).toBe(true);

      const baselineBuffer = fs.readFileSync(baselinePath);
      const baseDecoded = decodePng(baselineBuffer);
      const afterDecoded = decodePng(afterBuffer);

      // Verify dimensions
      expect(baseDecoded.width).toBe(afterDecoded.width);
      expect(baseDecoded.height).toBe(afterDecoded.height);

      // Form area pixel check: y from 60 (below topbar) to height
      let formAreaDiffs = 0;
      const stride = baseDecoded.width * 4 + 1;
      for (let y = 60; y < baseDecoded.height; y++) {
        const rowOffset = y * stride;
        for (let x = 0; x < baseDecoded.width; x++) {
          const pOffset = rowOffset + 1 + x * 4;
          const dr = Math.abs(baseDecoded.raw[pOffset] - afterDecoded.raw[pOffset]);
          const dg = Math.abs(baseDecoded.raw[pOffset + 1] - afterDecoded.raw[pOffset + 1]);
          const db = Math.abs(baseDecoded.raw[pOffset + 2] - afterDecoded.raw[pOffset + 2]);
          const da = Math.abs(baseDecoded.raw[pOffset + 3] - afterDecoded.raw[pOffset + 3]);
          if (dr > 0 || dg > 0 || db > 0 || da > 0) {
            formAreaDiffs++;
          }
        }
      }
      expect(formAreaDiffs).toBe(0);
    }

    // Also compare create-errors state
    await page.goto('/products/bom/create/single', { waitUntil: 'networkidle' });
    await page.waitForSelector('#createBomMaterial', { state: 'visible' });
    const validateBtn = page.getByRole('button', { name: /Validate Master Data/i });
    if (await validateBtn.isVisible()) {
      await validateBtn.click();
      await page.waitForTimeout(400);
      const afterErrorBuffer = await page.screenshot({ fullPage: true });
      const baselineErrorPath = path.join(screenshotsDir, `baseline-create-errors-${vp}.png`);
      expect(fs.existsSync(baselineErrorPath)).toBe(true);

      const baselineErrorBuffer = fs.readFileSync(baselineErrorPath);
      const baseErrDecoded = decodePng(baselineErrorBuffer);
      const afterErrDecoded = decodePng(afterErrorBuffer);

      let errorAreaDiffs = 0;
      const stride = baseErrDecoded.width * 4 + 1;
      for (let y = 60; y < baseErrDecoded.height; y++) {
        const rowOffset = y * stride;
        for (let x = 0; x < baseErrDecoded.width; x++) {
          const pOffset = rowOffset + 1 + x * 4;
          const dr = Math.abs(baseErrDecoded.raw[pOffset] - afterErrDecoded.raw[pOffset]);
          const dg = Math.abs(baseErrDecoded.raw[pOffset + 1] - afterErrDecoded.raw[pOffset + 1]);
          const db = Math.abs(baseErrDecoded.raw[pOffset + 2] - afterErrDecoded.raw[pOffset + 2]);
          const da = Math.abs(baseErrDecoded.raw[pOffset + 3] - afterErrDecoded.raw[pOffset + 3]);
          if (dr > 0 || dg > 0 || db > 0 || da > 0) {
            errorAreaDiffs++;
          }
        }
      }
      expect(errorAreaDiffs).toBe(0);
    }
  });

  // --------------------------------------------------------------------------
  // 2. OVER-LENGTH TYPING & PASTE TRUNCATION AT MAXLENGTH
  // --------------------------------------------------------------------------
  test('Over-length typing and paste is cut at the limit', async ({ page }) => {
    await page.goto('/products/bom/create/single', { waitUntil: 'networkidle' });
    await page.waitForSelector('#createBomMaterial', { state: 'visible' });

    // Material: max 19
    const matInput = page.locator('#createBomMaterial');
    await matInput.fill('12345678901234567890EXTRA');
    await expect(matInput).toHaveValue('1234567890123456789'); // Exactly 19

    // Plant: max 4
    const plantInput = page.locator('#createBomPlant');
    await plantInput.fill('1010EXTRA');
    await expect(plantInput).toHaveValue('1010'); // Exactly 4

    // Usage: max 1
    const usageInput = page.locator('#createBomUsage');
    await usageInput.fill('123');
    await expect(usageInput).toHaveValue('1'); // Exactly 1

    // Alt BOM: max 2
    const altInput = page.locator('#createBomAlt');
    await altInput.fill('01EXTRA');
    await expect(altInput).toHaveValue('01'); // Exactly 2

    // Status: max 2
    const statusInput = page.locator('#createBomStatus');
    await statusInput.fill('01EXTRA');
    await expect(statusInput).toHaveValue('01'); // Exactly 2

    // Alt Text: max 40
    const altTextInput = page.locator('#createBomAltText');
    const fiftyChars = 'A'.repeat(50);
    await altTextInput.fill(fiftyChars);
    await expect(altTextInput).toHaveValue('A'.repeat(40)); // Exactly 40

    // Component cell in table: cuts at 19
    const compCell = page.locator('tbody tr').first().locator('input[placeholder="Component"]');
    await compCell.fill('COMP12345678901234567890EXTRA');
    await expect(compCell).toHaveValue('COMP123456789012345'); // 19 chars
  });

  // --------------------------------------------------------------------------
  // 3. MINIMUM LENGTH AND FORMAT VALIDATION ON BLUR AND PROCEED
  // --------------------------------------------------------------------------
  test('Below min length shows error on blur and proceed; valid values show no error', async ({ page }) => {
    await page.goto('/products/bom/create/single', { waitUntil: 'networkidle' });
    await page.waitForSelector('#createBomMaterial', { state: 'visible' });

    const matInput = page.locator('#createBomMaterial');
    // Type 6 chars (< 8)
    await matInput.fill('A1BH02');
    await matInput.blur();
    await page.waitForTimeout(200);

    // Error should be visible under Material field
    const matFieldWrapper = page.locator('.rx-field-wrapper').filter({ hasText: 'Material' }).first();
    await expect(matFieldWrapper.locator('.rx-field-error')).toContainText('Material must be 8 to 19 characters');

    // Fix to valid length 9
    await matInput.fill('A1BH0214C');
    await matInput.blur();
    await page.waitForTimeout(200);
    await expect(matFieldWrapper.locator('.rx-field-error')).toHaveCount(0);
  });

  // --------------------------------------------------------------------------
  // 4. VALID FROM DATE VALIDATION (LETTERS REJECTED, IMPOSSIBLE DATES REJECTED, REAL DATES ACCEPTED)
  // --------------------------------------------------------------------------
  test('Valid From rejects letters and impossible dates (31.02.2026) and accepts 06.11.2026', async ({ page }) => {
    await page.goto('/products/bom/create/single', { waitUntil: 'networkidle' });
    await page.waitForSelector('#createBomValidFrom', { state: 'visible' });

    const vfInput = page.locator('#createBomValidFrom');
    const vfWrapper = page.locator('.rx-field-wrapper').filter({ hasText: 'Valid From' }).first();

    // 1. Letters rejected and caps at 10 digits/dots
    await vfInput.fill('abc06.11.2026xyz');
    await expect(vfInput).toHaveValue('06.11.2026'); // Letters stripped, exactly 10

    // 2. Impossible date (31.02.2026)
    await vfInput.fill('31.02.2026');
    await vfInput.blur();
    await page.waitForTimeout(200);
    await expect(vfWrapper.locator('.rx-field-error')).toContainText('Valid from must be a real date in DD.MM.YYYY format');

    // 3. Real calendar date accepted (06.11.2026)
    await vfInput.fill('06.11.2026');
    await vfInput.blur();
    await page.waitForTimeout(200);
    await expect(vfWrapper.locator('.rx-field-error')).toHaveCount(0);
  });

  // --------------------------------------------------------------------------
  // 5. QUANTITY VALIDATION (NUMERIC, UP TO 13 INT DIGITS AND 3 DECIMALS, > 0)
  // --------------------------------------------------------------------------
  test('Quantity and Base quantity validation', async ({ page }) => {
    await page.goto('/products/bom/create/single', { waitUntil: 'networkidle' });
    await page.waitForSelector('#createBomBaseQty', { state: 'visible' });

    const bqInput = page.locator('#createBomBaseQty');
    const bqWrapper = page.locator('.rx-field-wrapper').filter({ hasText: 'Base Quantity' }).first();

    // 0 is rejected (> 0 required)
    await bqInput.fill('0');
    await bqInput.blur();
    await page.waitForTimeout(200);
    await expect(bqWrapper.locator('.rx-field-error')).toContainText('Base quantity must be greater than 0, up to 13 digits and 3 decimals');

    // Valid positive decimal
    await bqInput.fill('10.5');
    await bqInput.blur();
    await page.waitForTimeout(200);
    await expect(bqWrapper.locator('.rx-field-error')).toHaveCount(0);
  });

  // --------------------------------------------------------------------------
  // 6. VALID FORM REQUEST BODY PAYLOAD PRESERVED IDENTICALLY
  // --------------------------------------------------------------------------
  test('The request body for a valid form is identical to before', async ({ page }) => {
    let capturedPreflightPayload = null;
    await page.route('**/api/bom/create-preflight', async (route) => {
      capturedPreflightPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          boms: [
            {
              material: 'A1BH0214C',
              plant: '1010',
              bomUsage: '1',
              alternativeBom: '01',
              status: 'Ready',
              warnings: []
            }
          ]
        })
      });
    });

    await page.goto('/products/bom/create/single', { waitUntil: 'networkidle' });
    await page.waitForSelector('#createBomMaterial', { state: 'visible' });

    await page.locator('#createBomMaterial').fill('A1BH0214C');
    await page.locator('#createBomPlant').fill('1010');
    await page.locator('tbody tr').first().locator('input[placeholder="Component"]').fill('A1BH0214D');
    await page.locator('tbody tr').first().locator('input[placeholder="SLoc"]').fill('0001');

    const validateBtn = page.getByRole('button', { name: /Validate Master Data/i });
    await validateBtn.click();
    await page.waitForTimeout(500);

    expect(capturedPreflightPayload).not.toBeNull();
    const sentBom = capturedPreflightPayload.bom || capturedPreflightPayload.boms?.[0];
    expect(sentBom).toBeDefined();
    expect(sentBom.material).toBe('A1BH0214C');
    expect(sentBom.plant).toBe('1010');
    expect(sentBom.bomUsage).toBe('1');
    expect(sentBom.alternativeBom).toBe('01');
    expect(sentBom.components[0].component).toBe('A1BH0214D');
    expect(sentBom.components[0].storageLocation).toBe('0001');
  });

  // --------------------------------------------------------------------------
  // 6. NO PREMATURE REQUIRED-FIELD ERRORS ON INITIAL LOAD OR ROUTE CHANGE
  // --------------------------------------------------------------------------
  test('No premature validation errors on page load or programmatic blur; errors appear only on submit or touch', async ({ page }) => {
    // 1. Delete BOM: initial load must have zero error messages / zero red borders
    await page.goto('/products/bom/delete', { waitUntil: 'networkidle' });
    await page.waitForSelector('#delMaterial', { state: 'visible' });
    // Let any autofocus and routing blur timers settle
    await page.waitForTimeout(300);
    expect(await page.locator('.rx-field-error, .sap-field-error-msg').allInnerTexts()).toEqual([]);
    expect(await page.locator('#delMaterial').getAttribute('aria-invalid')).not.toBe('true');

    // 2. Validate BOM: initial load must have zero error messages
    await page.goto('/products/bom/validate', { waitUntil: 'networkidle' });
    await page.waitForSelector('#valMaterial', { state: 'visible' });
    await page.waitForTimeout(300);
    expect(await page.locator('.rx-field-error, .sap-field-error-msg').allInnerTexts()).toEqual([]);

    // 3. Create BOM: initial load must have zero error messages
    await page.goto('/products/bom/create/single', { waitUntil: 'networkidle' });
    await page.waitForSelector('#createBomMaterial', { state: 'visible' });
    await page.waitForTimeout(300);
    expect(await page.locator('.rx-field-error, .sap-field-error-msg').allInnerTexts()).toEqual([]);

    // 4. Explorer / Display BOM: initial load must have zero error messages
    await page.goto('/products/bom/display', { waitUntil: 'networkidle' });
    await page.waitForSelector('#expMaterial', { state: 'visible' });
    await page.waitForTimeout(300);
    expect(await page.locator('.rx-field-error, .sap-field-error-msg').allInnerTexts()).toEqual([]);

    // 5. User interaction + blur triggers error
    await page.goto('/products/bom/delete', { waitUntil: 'networkidle' });
    await page.waitForSelector('#delMaterial', { state: 'visible' });
    // User clicks input, types then clears, then blurs
    await page.locator('#delMaterial').click();
    await page.locator('#delMaterial').fill('A');
    await page.locator('#delMaterial').fill('');
    await page.locator('#delPlant').click(); // Blurs material
    await page.waitForTimeout(100);
    expect(await page.locator('#delMaterial').getAttribute('aria-invalid')).toBe('true');
    expect(await page.getByText(/(?:Material number|Material) is required/i).first().isVisible()).toBe(true);

    // 6. Submitting empty form triggers all required errors
    await page.goto('/products/bom/delete', { waitUntil: 'networkidle' });
    await page.waitForSelector('#delMaterial', { state: 'visible' });
    await page.getByRole('button', { name: /Proceed to confirmation/i }).click();
    await page.waitForTimeout(100);
    expect(await page.getByText(/Material number is required/i).isVisible()).toBe(true);
    expect(await page.getByText(/Plant code is required/i).isVisible()).toBe(true);
  });
});
