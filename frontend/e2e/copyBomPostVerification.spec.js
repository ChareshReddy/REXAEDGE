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

test.describe('Copy BOM Post-Verification Refinements', () => {
  test('Post-copy verification states, numbers, and retry flow', async ({ page }) => {
    const vp = page.viewportSize() || { width: 1366, height: 768 };
    const vpSuffix = `${vp.width}x${vp.height}`;
    await setupMocks(page, { authenticated: true });

    let verifyResolver;
    let verifyRejecter;
    let verifyPromise;
    let verifyResponseMode = 'delayed_success'; // 'delayed_success' | 'failure' | 'mismatch'

    const initVerifyPromise = () => {
      verifyPromise = new Promise((resolve, reject) => {
        verifyResolver = resolve;
        verifyRejecter = reject;
      });
    };
    initVerifyPromise();

    // Mock chat API action for Copy BOM proposal & confirm
    await page.route('**/api/chat', async (route) => {
      const postData = route.request().postDataJSON();
      if (postData?.confirmAction) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            totalBoms: 34,
            createdAlternative: '02',
            targetAlternative: '02',
            reply: 'BOM copied successfully in SAP.'
          })
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          reply: 'Confirm copying BOM for A1BH0214C from plant 1012 to 1001.',
          proposedAction: {
            actionId: 'act_copy_verify_test',
            type: 'copy_bom',
            entityKey: 'bom',
            expiresAt: Date.now() + 300000,
            preview: {
              sourceMaterial: 'A1BH0214C',
              sourcePlant: '1012',
              targetMaterial: 'A1BH0214C',
              targetPlant: '1001',
              targetAlternative: '02',
              totalBoms: 34
            }
          }
        })
      });
    });

    // Mock verify-copy endpoint
    await page.route('**/api/bom/verify-copy', async (route) => {
      if (verifyResponseMode === 'delayed_success') {
        await verifyPromise;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            status: 'SUCCESS',
            bomsCreated: 34,
            totalComponents: 142,
            totalLevels: 4,
            rootAlternative: '02',
            message: 'All 142 components 100% verified against reference BOM.',
            verification: {
              verifiedCount: 142,
              totalCount: 142,
              status: 'SUCCESS',
              differences: []
            }
          })
        });
      }

      if (verifyResponseMode === 'failure') {
        return route.fulfill({
          status: 504,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            message: 'Verification timed out after 60 seconds.'
          })
        });
      }

      if (verifyResponseMode === 'mismatch') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            status: 'PARTIAL',
            bomsCreated: 34,
            totalComponents: 141,
            totalLevels: 4,
            rootAlternative: '02',
            message: 'Partial verification: 141 of 142 components verified (1 difference detected).',
            verification: {
              verifiedCount: 141,
              totalCount: 142,
              status: 'PARTIAL',
              differences: [
                'Missing component 11021735 (Item 0010) under parent A1BH0214C at Level 1'
              ]
            }
          })
        });
      }

      return route.continue();
    });

    // 1. Navigate to Copy BOM Single
    await page.goto('/products/bom/copy/single');
    await page.waitForLoadState('networkidle');

    await page.waitForSelector('#sourceMaterial', { state: 'visible', timeout: 10000 });
    await page.locator('#sourceMaterial').fill('A1BH0214C');
    await page.locator('#sourcePlant').fill('1010');
    await page.locator('#targetMaterial').fill('A1BH0214C');
    await page.locator('#targetPlant').fill('1001');

    // Click "Proceed"
    const proceedBtn = page.getByRole('button', { name: /proceed/i }).first();
    await proceedBtn.click();

    // Confirm Proposal
    const confirmBtn = page.getByRole('button', { name: /confirm copy bom/i });
    await expect(confirmBtn).toBeVisible({ timeout: 5000 });
    await confirmBtn.click();

    // ----------------------------------------------------------------------
    // TEST PART A: Loading State - Immediate values shown, Verifying spinner with elapsed time
    // ----------------------------------------------------------------------
    // Assert banner says "Verifying copied hierarchy..."
    const bannerMessage = page.locator('.sap-result-success-message');
    await expect(bannerMessage).toHaveText('Verifying copied hierarchy...');

    // Assert immediate numbers from copy response (BOMs Created 34, Root Alternative 02)
    const bomsCreatedVal = page.locator('.sap-result-meta-item:has-text("BOMs Created") strong');
    await expect(bomsCreatedVal).toHaveText('34');

    const rootAltVal = page.locator('.sap-result-meta-item:has-text("Root Alternative") .sap-badge');
    await expect(rootAltVal).toHaveText('02');

    // Total Components Copied must NOT show "..."! It must show verifying indicator with spinner & timer
    const compsIndicator = page.locator('[data-testid="verifying-components"]');
    await expect(compsIndicator).toBeVisible();
    await expect(compsIndicator).toContainText('Verifying...');

    // Levels indicator
    const levelsIndicator = page.locator('[data-testid="verifying-levels"]');
    await expect(levelsIndicator).toBeVisible();
    await expect(levelsIndicator).toContainText('Verifying...');

    // Check that standalone "..." is not displayed
    const compsCard = page.locator('.sap-result-meta-item:has-text("Total Components Copied")');
    await expect(compsCard.locator('strong')).not.toBeVisible();

    // Take screenshot during verifying state
    const shotVerifying = path.resolve(screenshotsDir, 'copy-bom-verifying-1366x768.png');
    const artifactVerifying = path.resolve(artifactDir, 'copy-bom-verifying-1366x768.png');
    await page.screenshot({ path: shotVerifying, fullPage: true });
    if (fs.existsSync(shotVerifying)) fs.copyFileSync(shotVerifying, artifactVerifying);

    // ----------------------------------------------------------------------
    // TEST PART B: Verification Completes Successfully
    // ----------------------------------------------------------------------
    verifyResolver();
    await page.waitForTimeout(500);

    // Total Components fills in with real number (142)
    const compsVal = page.locator('.sap-result-meta-item:has-text("Total Components Copied") strong');
    await expect(compsVal).toBeVisible();
    await expect(compsVal).toHaveText('142');

    // Levels fills in with real maximum depth (4)
    const levelsVal = page.locator('.sap-result-meta-item:has-text("Levels") strong');
    await expect(levelsVal).toBeVisible();
    await expect(levelsVal).toHaveText('4');

    // Success banner text: shows real Alternative, material, BOMs count and levels
    await expect(bannerMessage).toBeVisible();
    await expect(bannerMessage).toHaveText('Created Alternative 02 for A1BH0214C: 34 BOMs across 4 levels.');

    // Banner title: green success banner, no warning/amber
    const bannerTitle = page.locator('.sap-result-success-title');
    await expect(bannerTitle).toHaveText('BOM Copied Successfully');
    await expect(page.locator('[data-testid="warning-icon"]')).not.toBeVisible();

    // Take screenshot of successful verified state (no differences)
    const shotVerified = path.resolve(screenshotsDir, `copy-bom-success-${vpSuffix}.png`);
    const artifactVerified = path.resolve(artifactDir, `copy-bom-success-${vpSuffix}.png`);
    await page.screenshot({ path: shotVerified, fullPage: true });
    if (fs.existsSync(shotVerified)) fs.copyFileSync(shotVerified, artifactVerified);

    // ----------------------------------------------------------------------
    // TEST PART C: Verification Error / Timeout with "Verify again"
    // ----------------------------------------------------------------------
    // Click "Copy Another BOM" to reset
    const copyAnotherBtn = page.getByRole('button', { name: /copy another bom/i });
    await copyAnotherBtn.click();

    // Fill and submit again
    await page.locator('#sourceMaterial').fill('A1BH0214C');
    await page.locator('#sourcePlant').fill('1010');
    await page.locator('#targetMaterial').fill('A1BH0214C');
    await page.locator('#targetPlant').fill('1001');
    await proceedBtn.click();

    const confirmBtn2 = page.getByRole('button', { name: /confirm copy bom/i });
    await expect(confirmBtn2).toBeVisible({ timeout: 5000 });

    verifyResponseMode = 'failure';
    await confirmBtn2.click();

    // Should show "Not verified" with "Verify again" button
    const notVerifiedText = page.locator('.sap-result-meta-item:has-text("Total Components Copied") span:has-text("Not verified")');
    await expect(notVerifiedText).toBeVisible({ timeout: 5000 });

    const verifyAgainBtn = page.locator('.sap-result-meta-item:has-text("Total Components Copied") button:has-text("Verify again")');
    await expect(verifyAgainBtn).toBeVisible();

    // Banner says "Copy completed. Verification could not be completed." in neutral/info style
    await expect(page.locator('.sap-result-success-message')).toHaveText('Copy completed. Verification could not be completed.');
    // Copy itself stays shown as successful with green/neutral icon, not as an amber difference
    await expect(page.locator('.sap-result-success-title')).toHaveText('BOM Copied Successfully');
    await expect(page.locator('[data-testid="warning-icon"]')).not.toBeVisible();

    // Take screenshot of Not Verified state
    const shotNotVerified = path.resolve(screenshotsDir, `copy-bom-not-verified-${vpSuffix}.png`);
    const artifactNotVerified = path.resolve(artifactDir, `copy-bom-not-verified-${vpSuffix}.png`);
    await page.screenshot({ path: shotNotVerified, fullPage: true });
    if (fs.existsSync(shotNotVerified)) fs.copyFileSync(shotNotVerified, artifactNotVerified);

    // ----------------------------------------------------------------------
    // TEST PART D: Retry via "Verify again" and Mismatch Detection
    // ----------------------------------------------------------------------
    verifyResponseMode = 'mismatch';
    await verifyAgainBtn.click();

    // On mismatch: Warning title and details toggle
    const mismatchTitle = page.locator('.sap-result-success-title');
    await expect(mismatchTitle).toHaveText('BOM copied with 1 difference from the source');
    await expect(page.locator('[data-testid="warning-icon"]')).toBeVisible();

    const viewDetailsBtn = page.getByRole('button', { name: /view details/i });
    await expect(viewDetailsBtn).toBeVisible();
    await viewDetailsBtn.click();

    const diffListItem = page.locator('text=Missing component 11021735');
    await expect(diffListItem).toBeVisible();

    // Take screenshot of Mismatch state (with View details open)
    const shotMismatch = path.resolve(screenshotsDir, `copy-bom-difference-${vpSuffix}.png`);
    const artifactMismatch = path.resolve(artifactDir, `copy-bom-difference-${vpSuffix}.png`);
    await page.screenshot({ path: shotMismatch, fullPage: true });
    if (fs.existsSync(shotMismatch)) fs.copyFileSync(shotMismatch, artifactMismatch);
  });
});
