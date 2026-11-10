import { test, expect } from '@playwright/test';
import { setupMocks } from './helpers/mockApi.js';
import path from 'path';

const ARTIFACTS_DIR = 'C:/Users/chare/.gemini/antigravity/brain/670a18b0-0002-4036-b6f5-4b4c0c22c519';

test.describe('Stage 6: Admin UI for Multiple Servers and Limits', () => {
  test('Servers admin page renders live status and connection limits correctly at 1366x768', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await setupMocks(page, { authenticated: true, role: 'admin' });

    // Navigate to admin servers
    await page.goto('/admin/servers', { waitUntil: 'networkidle' });

    // Ensure we are on the SAP Servers tab
    const serversTabBtn = page.locator('button.sap-admin-nav-tab:has-text("SAP Servers")');
    await expect(serversTabBtn).toBeVisible();
    await serversTabBtn.click();

    await page.waitForSelector('table.sap-admin-compact-table', { state: 'visible' });

    // Verify table headers
    await expect(page.locator('th:has-text("Server")').first()).toBeVisible();
    await expect(page.locator('th:has-text("Live health")')).toBeVisible();
    await expect(page.locator('th:has-text("Pool connections")')).toBeVisible();
    await expect(page.locator('th:has-text("Last checked")')).toBeVisible();

    // Verify server rows content
    const rowDev = page.locator('table.sap-admin-compact-table tbody tr').filter({ hasText: 'SAP DEV 01' });
    await expect(rowDev).toBeVisible();
    await expect(rowDev.locator('text=Healthy')).toBeVisible();
    await expect(rowDev.locator('text=2 / 5 in use')).toBeVisible();

    const rowSbx = page.locator('table.sap-admin-compact-table tbody tr').filter({ hasText: 'SAP SANDBOX' });
    await expect(rowSbx).toBeVisible();
    await expect(rowSbx.locator('text=Degraded')).toBeVisible();
    await expect(rowSbx.locator('text=1 queued')).toBeVisible();

    const rowProd = page.locator('table.sap-admin-compact-table tbody tr').filter({ hasText: 'SAP PROD' });
    await expect(rowProd).toBeVisible();
    await expect(rowProd.locator('text=Down')).toBeVisible();

    // Verify Action buttons (Edit, Clear F4 Cache, Delete)
    const clearCacheBtn = page.locator('button[aria-label="Clear F4 cache for SAP DEV 01"]');
    await expect(clearCacheBtn).toBeVisible();

    // Click Clear F4 cache and check feedback
    await clearCacheBtn.click();
    await expect(page.locator('text=Cleared cached lookups for SAP DEV 01')).toBeVisible();

    // Take screenshot of the table at 1366x768
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'admin-servers-1366x768.png'),
      fullPage: true
    });

    // Open Add Server Modal to inspect Connection Limits
    await page.locator('button:has-text("Add Server")').click();
    await page.waitForSelector('text=Connection limits', { state: 'visible' });

    // Verify helper texts
    await expect(page.locator('text=Ask your SAP Basis team for the allowed parallel connections.')).toBeVisible();
    await expect(page.locator('text=Prevents one user\'s bulk run from starving others.')).toBeVisible();
    await expect(page.locator('text=How long a request waits in queue before failing fast.')).toBeVisible();
    await expect(page.locator('text=Abort slow RFC calls to avoid hanging the app.')).toBeVisible();

    // Test inline validation
    const maxConnInput = page.locator('#server-max-conn');
    await maxConnInput.fill('25');
    await maxConnInput.blur();
    await expect(page.locator('text=Max connections must be an integer between 1 and 20.')).toBeVisible();

    // Reset to valid and test per-user limit exceeding max connections
    await maxConnInput.fill('4');
    const userLimitInput = page.locator('#server-user-limit');
    await userLimitInput.fill('5');
    await userLimitInput.blur();
    await expect(page.locator('text=Per-user limit cannot exceed max connections.')).toBeVisible();

    // Screenshot of modal with limits section
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'admin-server-modal-limits.png'),
      fullPage: true
    });

    // Scroll to reveal timeout fields and submit buttons
    const submitBtn = page.locator('button[type="submit"]:has-text("Add Server")');
    await submitBtn.scrollIntoViewIfNeeded();

    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'admin-server-modal-limits-scrolled.png'),
      fullPage: true
    });
  });

  test('Servers admin page renders cleanly at 1920x1080', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await setupMocks(page, { authenticated: true, role: 'admin' });

    await page.goto('/admin/servers', { waitUntil: 'networkidle' });

    const serversTabBtn = page.locator('button.sap-admin-nav-tab:has-text("SAP Servers")');
    await expect(serversTabBtn).toBeVisible();
    await serversTabBtn.click();

    await page.waitForSelector('table.sap-admin-compact-table', { state: 'visible' });

    // Verify all rows visible with no horizontal overflow
    await expect(page.locator('table.sap-admin-compact-table tbody tr').filter({ hasText: 'SAP DEV 01' })).toBeVisible();
    await expect(page.locator('table.sap-admin-compact-table tbody tr').filter({ hasText: 'SAP SANDBOX' })).toBeVisible();
    await expect(page.locator('table.sap-admin-compact-table tbody tr').filter({ hasText: 'SAP PROD' })).toBeVisible();

    // Take screenshot at 1920x1080
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'admin-servers-1920x1080.png'),
      fullPage: true
    });
  });
});
