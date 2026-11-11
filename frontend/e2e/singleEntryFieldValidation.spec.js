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

test.describe('Part 1: Single-Entry Field-Level Validation (1366x768)', () => {
  test('Validates on blur and submit, format first (0 network calls), SAP existence, clear on typing, submit gating', async ({ page }, testInfo) => {
    const vp = testInfo.project.name;
    if (vp !== '1366x768') {
      test.skip();
      return;
    }

    await setupMocks(page, { authenticated: true });

    // Track network requests to /api/materials/
    const materialExistenceCalls = [];
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/api/materials/') && !url.includes('/api/materials/search')) {
        materialExistenceCalls.push(url);
      }
    });

    // =========================================================================
    // 1. CREATE SINGLE BOM
    // =========================================================================
    await page.goto('/products/bom/create/single', { waitUntil: 'networkidle' });
    await page.waitForSelector('#createBomMaterial', { state: 'visible', timeout: 10000 });

    const matInput = page.locator('#createBomMaterial');
    const plantInput = page.locator('#createBomPlant');

    // 1.1 Blur with empty required field -> format error, 0 existence calls
    materialExistenceCalls.length = 0;
    await matInput.focus();
    await plantInput.focus(); // Blur material without typing
    await expect(page.locator('text=Material is required')).toBeVisible();
    expect(materialExistenceCalls.length).toBe(0);

    // 1.2 Typing clears error immediately
    await matInput.fill('A');
    await expect(page.locator('text=Material is required')).not.toBeVisible();

    // 1.3 Format check before existence: typing invalid format (e.g. 3 chars) and blurring
    materialExistenceCalls.length = 0;
    await matInput.fill('ABC');
    await plantInput.focus(); // blur
    await expect(page.locator('text=Material must be 8 to 19 characters')).toBeVisible();
    expect(materialExistenceCalls.length).toBe(0); // 0 existence calls when format is invalid

    // 1.4 Valid format but non-existent in SAP -> existence check fires, displays "Material not valid"
    materialExistenceCalls.length = 0;
    await matInput.fill('NONEXISTENT1');
    await plantInput.focus(); // blur
    await expect(page.locator('text=Material not valid')).toBeVisible();
    expect(materialExistenceCalls.length).toBeGreaterThan(0);

    // 1.5 Plant validation: non-existent plant code -> "Plant not valid"
    await plantInput.fill('9999');
    await page.locator('#createBomUsage').focus(); // blur plant
    await expect(page.locator('text=Plant not valid')).toBeVisible();

    // 1.6 Submit gating: clicking Validate Master Data while invalid fields are present blocks submit
    const validateBtn = page.locator('button:has-text("Validate Master Data")');
    await validateBtn.click();
    // Material input should still have error and be focused
    await expect(page.locator('#root').getByText('Material not valid').first()).toBeVisible();
    await expect(matInput).toBeFocused();

    // Take screenshot of Create Single BOM with validation errors
    const createShot = 'screenshots/create-single-field-validation-1366x768.png';
    await page.screenshot({ path: createShot, fullPage: false });
    saveScreenshot(createShot, 'create-single-field-validation-1366x768.png');

    // =========================================================================
    // 2. COPY SINGLE BOM
    // =========================================================================
    await page.goto('/products/bom/copy/single', { waitUntil: 'networkidle' });
    await page.waitForSelector('#sourceMaterial', { state: 'visible', timeout: 10000 });

    const srcMatInput = page.locator('#sourceMaterial');
    const srcPlantInput = page.locator('#sourcePlant');

    // Blur empty required field
    await srcMatInput.focus();
    await srcPlantInput.focus();
    await expect(page.locator('text=Material is required').first()).toBeVisible();

    // Non-existent source material
    await srcMatInput.fill('NONEXISTENT1');
    await srcPlantInput.focus();
    await expect(page.locator('text=Material not valid').first()).toBeVisible();

    // Non-existent source plant
    await srcPlantInput.fill('9999');
    await page.locator('#sourceUsage').focus();
    await expect(page.locator('text=Plant not valid').first()).toBeVisible();

    // Submit gating: validate source button blocked
    const valSrcBtn = page.locator('#validateSourceBomBtn');
    await valSrcBtn.click();
    await expect(srcMatInput).toBeFocused();

    // =========================================================================
    // 3. DELETE BOM
    // =========================================================================
    await page.goto('/products/bom/delete', { waitUntil: 'networkidle' });
    await page.waitForSelector('#delMaterial', { state: 'visible', timeout: 10000 });

    const delMatInput = page.locator('#delMaterial');
    const delPlantInput = page.locator('#delPlant');

    await delMatInput.fill('NONEXISTENT1');
    await delPlantInput.focus();
    await expect(page.locator('text=Material not valid')).toBeVisible();

    await delPlantInput.fill('9999');
    await page.locator('#delBomUsage').focus();
    await expect(page.locator('text=Plant not valid')).toBeVisible();

    // =========================================================================
    // 4. VALIDATE BOM
    // =========================================================================
    await page.goto('/products/bom/validate', { waitUntil: 'networkidle' });
    await page.waitForSelector('#valMaterial', { state: 'visible', timeout: 10000 });

    const valMatInput = page.locator('#valMaterial');
    const valPlantInput = page.locator('#valPlant');

    await valMatInput.fill('NONEXISTENT1');
    await valPlantInput.focus();
    await expect(page.locator('text=Material not valid')).toBeVisible();

    await valPlantInput.fill('9999');
    await page.locator('#valUsage').focus();
    await expect(page.locator('text=Plant not valid')).toBeVisible();

    // =========================================================================
    // 5. DISPLAY BOM
    // =========================================================================
    await page.goto('/products/bom/display', { waitUntil: 'networkidle' });
    await page.waitForSelector('#expMaterial', { state: 'visible', timeout: 10000 });

    const expMatInput = page.locator('#expMaterial');
    const expPlantInput = page.locator('#expPlant');

    await expMatInput.fill('NONEXISTENT1');
    await expPlantInput.focus();
    await expect(page.locator('text=Material not valid')).toBeVisible();

    await expPlantInput.fill('9999');
    await page.locator('#expUsage').focus();
    await expect(page.locator('text=Plant not valid')).toBeVisible();

    // 6. Test server change clears field errors
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('sap-server-changed', { detail: { serverId: 'srv-2' } }));
    });
    await expect(page.locator('#root').getByText('Material not valid')).not.toBeVisible();
    await expect(page.locator('#root').getByText('Plant not valid')).not.toBeVisible();
  });
});
