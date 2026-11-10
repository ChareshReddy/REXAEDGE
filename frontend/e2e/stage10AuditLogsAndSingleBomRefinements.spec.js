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

test.describe('Stage 10: Create Single BOM Header and Admin Audit Logs Refinements', () => {
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 }
  ]) {
    test(`Create Single BOM component headers at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await setupMocks(page, { authenticated: true, role: 'admin' });

      await page.goto('/products/bom/create/single', { waitUntil: 'networkidle' });

      // Click "Add Component" 3 times to get 4 component rows
      const addBtn = page.locator('button.sap-btn-add-component, button:has-text("Add Component")').first();
      await expect(addBtn).toBeVisible({ timeout: 10000 });
      await addBtn.click();
      await addBtn.click();
      await addBtn.click();

      const rows = page.locator('.rx-components-table tbody tr');
      await expect(rows).toHaveCount(4);

      // Verify starred headers: Component, Quantity, Storage location
      const starredGroups = page.locator('.rx-components-table thead .rx-header-label-group');
      const count = await starredGroups.count();
      expect(count).toBeGreaterThanOrEqual(3);

      for (let i = 0; i < count; i++) {
        const group = starredGroups.nth(i);
        const labelText = group.locator('.rx-header-label-text');
        const star = group.locator('.rx-header-star');

        await expect(labelText).toBeVisible();
        await expect(star).toBeVisible();

        const labelBox = await labelText.boundingBox();
        const starBox = await star.boundingBox();

        expect(labelBox).not.toBeNull();
        expect(starBox).not.toBeNull();

        // Top of star is within 2px of top of label text
        const topDiff = Math.abs(starBox.y - labelBox.y);
        expect(topDiff).toBeLessThanOrEqual(2.5);

        // Star is to the right of label text (on same line, directly beside text)
        expect(starBox.x).toBeGreaterThan(labelBox.x);
      }

      // Screenshot 1: Create Single BOM with 4 rows
      const ssName = `single-bom-4rows-${viewport.width}x${viewport.height}.png`;
      const ssPath = path.join('screenshots', ssName);
      await page.screenshot({ path: ssPath, fullPage: false });
      saveScreenshot(ssPath, ssName);
    });

    test(`Admin Audit Logs filters, custom date, and table columns at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await setupMocks(page, { authenticated: true, role: 'admin' });

      await page.goto('/admin/logs/audit', { waitUntil: 'networkidle' });

      const table = page.locator('.rx-audit-table');
      await expect(table).toBeVisible({ timeout: 10000 });

      // 1. Assert: Search Text filter is completely removed
      const searchInput = page.locator('.sap-logs-filter-search, input[placeholder*="Search target"]');
      await expect(searchInput).toHaveCount(0);
      const searchTextLabel = page.locator('.sap-logs-filter-bar label:has-text("Search Text")');
      await expect(searchTextLabel).toHaveCount(0);

      // 2. Assert: Date Range select shows full text without clipping
      const dateSelect = page.locator('.sap-logs-filter-bar select').first();
      await expect(dateSelect).toBeVisible();
      const isDateSelectNotClipped = await dateSelect.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
      expect(isDateSelectNotClipped).toBe(true);

      // 3. Assert: Table columns and headers
      const headers = page.locator('.rx-audit-table th');
      const headerTexts = (await headers.allInnerTexts()).map(t => t.trim().split('\n')[0]);
      expect(headerTexts).toEqual([
        'Timestamp',
        'User',
        'Action',
        'Server',
        'Status',
        'Duration',
        'Actions'
      ]);

      // 4. Assert: No horizontal overflow on the scroll container
      const tableRegion = page.locator('div[role="region"][aria-label="Audit Logs Table"]');
      const isTableNotOverflowing = await tableRegion.evaluate((el) => el.scrollWidth <= Math.ceil(el.clientWidth) + 1);
      expect(isTableNotOverflowing).toBe(true);

      // 5. Assert: Status column has no stray dots (cell text matches badge text)
      const rows = page.locator('.rx-audit-table tbody tr');
      const rowCount = await rows.count();
      expect(rowCount).toBeGreaterThan(0);

      for (let r = 0; r < rowCount; r++) {
        const statusCell = rows.nth(r).locator('td.rx-audit-col-status');
        const badge = statusCell.locator('.rx-status-badge-success, .rx-status-badge-failed');
        await expect(badge).toBeVisible();
        const cellText = (await statusCell.innerText()).trim();
        const badgeText = (await badge.innerText()).trim();
        // The cell contains strictly the badge text with no stray dots '..'
        expect(cellText).toBe(badgeText);
        expect(cellText).not.toContain('..');
      }

      // Screenshot 2a: Default View
      const defSsName = `audit-logs-default-${viewport.width}x${viewport.height}.png`;
      const defSsPath = path.join('screenshots', defSsName);
      await page.screenshot({ path: defSsPath, fullPage: false });
      saveScreenshot(defSsPath, defSsName);

      // 6. Custom Date Range testing
      await dateSelect.selectOption('custom');

      const startDateInput = page.locator('.sap-logs-filter-bar input[type="date"]').nth(0);
      const endDateInput = page.locator('.sap-logs-filter-bar input[type="date"]').nth(1);

      await expect(startDateInput).toBeVisible();
      await expect(endDateInput).toBeVisible();

      // Ensure date inputs are not clipped
      const isStartInputNotClipped = await startDateInput.evaluate((el) => el.clientWidth >= 120);
      expect(isStartInputNotClipped).toBe(true);

      // Test: End before Start shows inline error
      await startDateInput.fill('2026-11-10');
      await endDateInput.fill('2026-11-05');

      const errorNotice = page.locator('.sap-logs-date-error');
      await expect(errorNotice).toBeVisible();
      await expect(errorNotice).toHaveText(/End date cannot be before start date/i);

      // Test: Valid custom range changes displayed rows and record count
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const d6DaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      const d4DaysAgo = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);

      const startValid = `${d6DaysAgo.getFullYear()}-${pad(d6DaysAgo.getMonth() + 1)}-${pad(d6DaysAgo.getDate())}`;
      const endValid = `${d4DaysAgo.getFullYear()}-${pad(d4DaysAgo.getMonth() + 1)}-${pad(d4DaysAgo.getDate())}`;

      await startDateInput.fill(startValid);
      await endDateInput.fill(endValid);

      await expect(errorNotice).not.toBeVisible();

      // Custom date filtered row should appear (log-audit-5 from 5 days ago)
      const customRows = page.locator('.rx-audit-table tbody tr');
      await expect(customRows).toHaveCount(1);
      const badgeCount = page.locator('.sap-badge-neutral');
      await expect(badgeCount).toHaveText('1 records');

      // Screenshot 2b: Custom Range Selected
      const customSsName = `audit-logs-custom-range-${viewport.width}x${viewport.height}.png`;
      const customSsPath = path.join('screenshots', customSsName);
      await page.screenshot({ path: customSsPath, fullPage: false });
      saveScreenshot(customSsPath, customSsName);

      // 7. Reset filters and verify Failed status row renders cleanly
      const resetBtn = page.locator('.sap-logs-filter-reset button');
      await resetBtn.click();

      // Reset brings back default Today's records (4 records)
      await expect(rows).toHaveCount(4);

      // Find the Failed row (log-audit-3)
      const failedBadge = page.locator('.rx-status-badge-failed');
      await expect(failedBadge).toBeVisible();
      await expect(failedBadge).toHaveText(/Failed/);

      // Screenshot 2c: Row with Failed Status
      const failedSsName = `audit-logs-failed-row-${viewport.width}x${viewport.height}.png`;
      const failedSsPath = path.join('screenshots', failedSsName);
      await page.screenshot({ path: failedSsPath, fullPage: false });
      saveScreenshot(failedSsPath, failedSsName);
    });
  }
});
