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

test.describe('Confirmation Card Executing State', () => {
  for (const viewport of [
    { width: 1366, height: 768, name: '1366x768' },
    { width: 1920, height: 1080, name: '1920x1080' }
  ]) {
    test(`Executing state verification at ${viewport.name}`, async ({ page }, testInfo) => {
      if (testInfo.project.name !== viewport.name) {
        test.skip();
      }

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await setupMocks(page, { authenticated: true });

      // Mock BOM details for Delete BOM
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

      let confirmResolver;
      const confirmPromise = new Promise((resolve) => {
        confirmResolver = resolve;
      });

      // Mock chat API action for delete proposal and delayed confirmation
      await page.route('**/api/chat', async (route) => {
        const postData = route.request().postDataJSON();
        if (postData?.confirmAction) {
          // Wait for our resolver before completing the confirmation
          await confirmPromise;
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              reply: 'BOM deleted successfully in SAP.'
            })
          });
        }

        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            reply: 'Confirm permanent deletion of BOM for A1BH0214C.',
            proposedAction: {
              actionId: 'act_del_exec_test',
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

      // Fill mandatory inputs: checkbox and reason
      const ackCheckbox = page.locator('.sap-delete-checkbox-label input[type="checkbox"]');
      await ackCheckbox.check();

      const reasonTextarea = page.locator('textarea[placeholder*="Provide business justification"]');
      await reasonTextarea.fill('Approved deletion test RFC-999');

      const confirmDeleteBtn = page.getByRole('button', { name: /confirm delete bom/i });
      await expect(confirmDeleteBtn).toBeEnabled();

      // Trigger Execution
      await confirmDeleteBtn.click();

      // ----------------------------------------------------------------------
      // Requirement 1 & 6: Progress bar along top edge & aria-busy on card
      // ----------------------------------------------------------------------
      await expect(proposalCard).toHaveAttribute('aria-busy', 'true');

      const progressTrack = page.locator('[data-testid="confirm-progress-bar-track"]');
      await expect(progressTrack).toBeVisible();
      const progressFill = page.locator('[data-testid="confirm-progress-bar-fill"]');
      await expect(progressFill).toBeVisible();

      const trackBox = await progressTrack.boundingBox();
      expect(trackBox).not.toBeNull();
      expect(trackBox.height).toBeGreaterThanOrEqual(3);
      expect(trackBox.height).toBeLessThanOrEqual(6);

      // ----------------------------------------------------------------------
      // Requirement 2 & 6: Status strip under header
      // ----------------------------------------------------------------------
      const statusStrip = page.locator('[data-testid="confirm-executing-strip"]');
      await expect(statusStrip).toBeVisible();
      await expect(statusStrip).toHaveAttribute('role', 'status');
      await expect(statusStrip).toHaveAttribute('aria-live', 'polite');

      const executingTitle = page.locator('[data-testid="confirm-executing-title"]');
      await expect(executingTitle).toContainText('Deleting BOM in SAP...');

      const executingSubtext = page.locator('[data-testid="confirm-executing-subtext"]');
      await expect(executingSubtext).toHaveText('This can take up to a minute. Please do not close or refresh this page.');

      const elapsedTimer = page.locator('[data-testid="confirm-elapsed-time"]');
      await expect(elapsedTimer).toBeVisible();

      // Wait 1-2 seconds to verify elapsed timer updates
      await page.waitForTimeout(1500);
      const elapsedVal = await elapsedTimer.textContent();
      expect(elapsedVal).toMatch(/^0:0[1-9]$|^0:[1-5][0-9]$/);

      // ----------------------------------------------------------------------
      // Requirement 3: Header badge "Executing..." with primary spinner
      // ----------------------------------------------------------------------
      const execBadge = page.locator('[data-testid="confirm-badge-executing"]');
      await expect(execBadge).toBeVisible();
      await expect(execBadge).toContainText('Executing...');

      // ----------------------------------------------------------------------
      // Requirement 4: Footer buttons
      // - Cancel disabled with title "A running SAP operation cannot be cancelled"
      // - Primary button keeps label with visible white spinner and stays disabled
      // ----------------------------------------------------------------------
      const cancelBtn = page.getByRole('button', { name: /cancel/i });
      await expect(cancelBtn).toBeDisabled();
      await expect(cancelBtn).toHaveAttribute('title', 'A running SAP operation cannot be cancelled');

      await expect(confirmDeleteBtn).toBeDisabled();
      await expect(confirmDeleteBtn).toContainText('Confirm Delete BOM');
      // Verify button has visible spinner
      const buttonSpinner = confirmDeleteBtn.locator('svg.sap-spin');
      await expect(buttonSpinner).toBeVisible();

      // Capture Executing Screenshot at normal timing
      const shotExecuting = path.resolve(screenshotsDir, `confirm-executing-${viewport.name}.png`);
      const artifactExecuting = path.resolve(artifactDir, `confirm-executing-${viewport.name}.png`);
      await page.screenshot({ path: shotExecuting, fullPage: true });
      if (fs.existsSync(shotExecuting)) fs.copyFileSync(shotExecuting, artifactExecuting);

      // ----------------------------------------------------------------------
      // Requirement 5: 45-second duration variant
      // ----------------------------------------------------------------------
      await page.evaluate(() => {
        const start = Date.now();
        const originalNow = Date.now;
        Date.now = () => originalNow.call(Date) + 47000;
      });

      // Wait for interval tick (1.1s)
      await page.waitForTimeout(1200);

      await expect(executingSubtext).toHaveText('Still working... SAP is taking longer than usual.');

      // Capture 45s variant screenshot
      const shot45s = path.resolve(screenshotsDir, `confirm-executing-45s-${viewport.name}.png`);
      const artifact45s = path.resolve(artifactDir, `confirm-executing-45s-${viewport.name}.png`);
      await page.screenshot({ path: shot45s, fullPage: true });
      if (fs.existsSync(shot45s)) fs.copyFileSync(shot45s, artifact45s);

      // Complete execution and verify clean disappearance
      confirmResolver();
      await page.waitForTimeout(500);

      // Status strip and progress bar should disappear on completion
      await expect(progressTrack).not.toBeVisible();
      await expect(statusStrip).not.toBeVisible();
    });
  }
});
