import { test, expect } from '@playwright/test';
import { setupMocks } from './helpers/mockApi.js';

test.describe('Single-Entry Form Validation Guard (1366x768)', () => {
  test('All 5 single-entry screens start clean on fresh load, validate on blur/submit, clear on typing, and reset cleanly', async ({ page }, testInfo) => {
    test.setTimeout(60000);
    const vp = testInfo.project.name;
    if (vp !== '1366x768') {
      test.skip();
      return;
    }

    await setupMocks(page, { authenticated: true });

    // =========================================================================
    // 1. VALIDATE BOM (/products/bom/validate)
    // =========================================================================
    await page.goto('/products/bom/validate', { waitUntil: 'networkidle' });
    await page.waitForSelector('#valMaterial', { state: 'visible', timeout: 10000 });

    // 1.1 Fresh load: NO field errors, NO red border
    await expect(page.locator('.rx-field-error')).toHaveCount(0);
    await expect(page.locator('.rx-value-help-error')).toHaveCount(0);
    await expect(page.locator('#root').getByText('Material is required')).not.toBeVisible();
    await expect(page.locator('#root').getByText('Material number is required')).not.toBeVisible();

    // 1.2 Blur on empty required field -> error appears
    await page.locator('#valMaterial').focus();
    await page.locator('#valPlant').focus(); // blur material
    await expect(page.locator('#root').getByText('Material is required')).toBeVisible();
    await expect(page.locator('#valMaterial').locator('xpath=ancestor::*[contains(@class, "rx-value-help-container")]')).toHaveClass(/rx-value-help-error/);

    // 1.3 Typing clears error immediately
    await page.locator('#valMaterial').fill('A');
    await expect(page.locator('#root').getByText('Material is required')).not.toBeVisible();
    await expect(page.locator('#valMaterial').locator('xpath=ancestor::*[contains(@class, "rx-value-help-container")]')).not.toHaveClass(/rx-value-help-error/);

    // 1.4 Clear field and click action button -> error appears
    await page.locator('#valMaterial').fill('');
    await page.locator('button:has-text("Validate in SAP")').click();
    await expect(page.locator('#root').getByText('Material is required')).toBeVisible();

    // 1.5 Press Clear -> error state resets cleanly
    await page.locator('button:has-text("Clear")').click();
    await expect(page.locator('.rx-field-error')).toHaveCount(0);
    await expect(page.locator('.rx-value-help-error')).toHaveCount(0);
    await expect(page.locator('#root').getByText('Material is required')).not.toBeVisible();

    // 1.6 Verify label has NO "(optional)"
    await expect(page.locator('label[for="valAlternativeBom"]')).toHaveText('Alternative BOM');
    await expect(page.locator('label[for="valAlternativeBom"]')).not.toContainText('(optional)');

    // =========================================================================
    // 2. DELETE BOM (/products/bom/delete)
    // =========================================================================
    await page.goto('/products/bom/delete', { waitUntil: 'networkidle' });
    await page.waitForSelector('#delMaterial', { state: 'visible', timeout: 10000 });

    // 2.1 Fresh load: NO field errors, NO red border
    await expect(page.locator('.rx-field-error')).toHaveCount(0);
    await expect(page.locator('.rx-value-help-error')).toHaveCount(0);
    await expect(page.locator('#root').getByText('Material is required')).not.toBeVisible();

    // 2.2 Blur on empty required field -> error appears
    await page.locator('#delMaterial').focus();
    await page.locator('#delPlant').focus(); // blur material
    await expect(page.locator('#root').getByText('Material is required')).toBeVisible();
    await expect(page.locator('#delMaterial').locator('xpath=ancestor::*[contains(@class, "rx-value-help-container")]')).toHaveClass(/rx-value-help-error/);

    // 2.3 Typing clears error immediately
    await page.locator('#delMaterial').fill('A');
    await expect(page.locator('#root').getByText('Material is required')).not.toBeVisible();
    await expect(page.locator('#delMaterial').locator('xpath=ancestor::*[contains(@class, "rx-value-help-container")]')).not.toHaveClass(/rx-value-help-error/);

    // 2.4 Clear field and click action button -> error appears
    await page.locator('#delMaterial').fill('');
    await page.locator('button:has-text("Proceed to confirmation")').click();
    await expect(page.locator('#root').getByText('Material is required')).toBeVisible();

    // =========================================================================
    // 3. CREATE SINGLE BOM (/products/bom/create/single)
    // =========================================================================
    await page.goto('/products/bom/create/single', { waitUntil: 'networkidle' });
    await page.waitForSelector('#createBomMaterial', { state: 'visible', timeout: 10000 });

    // 3.1 Fresh load: NO field errors, NO red border
    await expect(page.locator('.rx-field-error')).toHaveCount(0);
    await expect(page.locator('.rx-value-help-error')).toHaveCount(0);
    await expect(page.locator('#root').getByText('Material is required')).not.toBeVisible();

    // 3.2 Blur on empty required field -> error appears
    await page.locator('#createBomMaterial').focus();
    await page.locator('#createBomPlant').focus(); // blur material
    await expect(page.locator('#root').getByText('Material is required')).toBeVisible();
    await expect(page.locator('#createBomMaterial').locator('xpath=ancestor::*[contains(@class, "rx-value-help-container")]')).toHaveClass(/rx-value-help-error/);

    // 3.3 Typing clears error immediately
    await page.locator('#createBomMaterial').fill('A');
    await expect(page.locator('#root').getByText('Material is required')).not.toBeVisible();

    // 3.4 Clear and click action button -> error appears
    await page.locator('#createBomMaterial').fill('');
    await page.locator('button:has-text("Validate Master Data")').click();
    await expect(page.locator('#root').getByText('Material is required')).toBeVisible();

    // 3.5 Reset button resets error state cleanly
    await page.locator('button:has-text("Reset")').click();
    await expect(page.locator('.rx-field-error')).toHaveCount(0);
    await expect(page.locator('.rx-value-help-error')).toHaveCount(0);

    // =========================================================================
    // 4. COPY SINGLE BOM (/products/bom/copy/single)
    // =========================================================================
    await page.goto('/products/bom/copy/single', { waitUntil: 'networkidle' });
    await page.waitForSelector('#sourceMaterial', { state: 'visible', timeout: 10000 });

    // 4.1 Fresh load: NO field errors, NO red border
    await expect(page.locator('.rx-field-error')).toHaveCount(0);
    await expect(page.locator('.rx-value-help-error')).toHaveCount(0);
    await expect(page.locator('#root').getByText('Material is required')).not.toBeVisible();

    // 4.2 Blur on empty required sourceMaterial -> error appears
    await page.locator('#sourceMaterial').focus();
    await page.locator('#sourcePlant').focus(); // blur
    await expect(page.locator('#root').getByText('Material is required').first()).toBeVisible();

    // 4.3 Typing clears error
    await page.locator('#sourceMaterial').fill('A');
    await expect(page.locator('#root').getByText('Material is required')).not.toBeVisible();

    // 4.4 Blur on targetMaterial -> error appears
    await page.locator('#targetMaterial').focus();
    await page.locator('#targetPlant').focus(); // blur
    await expect(page.locator('#root').getByText('Material is required').first()).toBeVisible();

    // 4.5 Typing clears targetMaterial error
    await page.locator('#targetMaterial').fill('A');
    await expect(page.locator('#root').getByText('Material is required')).not.toBeVisible();

    // 4.6 Submit button validation gating
    await page.locator('#sourceMaterial').fill('');
    await page.locator('button:has-text("Proceed")').click();
    await expect(page.locator('#root').getByText('Material is required').first()).toBeVisible();

    // =========================================================================
    // 5. DISPLAY BOM (/products/bom/display)
    // =========================================================================
    await page.goto('/products/bom/display', { waitUntil: 'networkidle' });
    await page.waitForSelector('#expMaterial', { state: 'visible', timeout: 10000 });

    // 5.1 Fresh load: NO field errors, NO red border
    await expect(page.locator('.rx-field-error')).toHaveCount(0);
    await expect(page.locator('.rx-value-help-error')).toHaveCount(0);
    await expect(page.locator('#root').getByText('Material is required')).not.toBeVisible();

    // 5.2 Blur on empty required field -> error appears
    await page.locator('#expMaterial').focus();
    await page.locator('#expPlant').focus(); // blur
    await expect(page.locator('#root').getByText('Material is required')).toBeVisible();

    // 5.3 Typing clears error
    await page.locator('#expMaterial').fill('A');
    await expect(page.locator('#root').getByText('Material is required')).not.toBeVisible();

    // 5.4 Clear and click action button -> error appears
    await page.locator('#expMaterial').fill('');
    await page.locator('button[type="submit"]:has-text("Display BOM")').click();
    await expect(page.locator('#root').getByText('Material is required')).toBeVisible();

    // 5.5 Server change resets error state
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('sap-server-changed', { detail: { serverId: 'srv-test' } }));
    });
    await expect(page.locator('.rx-field-error')).toHaveCount(0);
    await expect(page.locator('.rx-value-help-error')).toHaveCount(0);

    // =========================================================================
    // 6. NAVIGATE AWAY AND BACK: remains clean with NO errors
    // =========================================================================
    await page.goto('/products/bom/validate', { waitUntil: 'networkidle' });
    await page.waitForSelector('#valMaterial', { state: 'visible', timeout: 10000 });
    await expect(page.locator('.rx-field-error')).toHaveCount(0);
    await expect(page.locator('.rx-value-help-error')).toHaveCount(0);
    await expect(page.locator('#root').getByText('Material is required')).not.toBeVisible();

    await page.goto('/products/bom/delete', { waitUntil: 'networkidle' });
    await page.waitForSelector('#delMaterial', { state: 'visible', timeout: 10000 });
    await expect(page.locator('.rx-field-error')).toHaveCount(0);
    await expect(page.locator('.rx-value-help-error')).toHaveCount(0);
    await expect(page.locator('#root').getByText('Material is required')).not.toBeVisible();
  });
});
