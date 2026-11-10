import { test, expect } from '@playwright/test';
import { setupMocks } from './helpers/mockApi.js';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/chare/.gemini/antigravity/brain/670a18b0-0002-4036-b6f5-4b4c0c22c519';

test.describe('Admin Audit Logs Table & Detail Panel Refinements', () => {
  test('Table columns, highlight, server format, timestamp format, overflow, and detail drawer', async ({ page }) => {
    const viewport = page.viewportSize() || { width: 1366, height: 768 };

    await setupMocks(page, { authenticated: true, role: 'admin' });
    await page.goto('/admin/logs/audit', { waitUntil: 'networkidle' });

    // Wait for the audit logs table
    const table = page.locator('.rx-audit-table');
    await expect(table).toBeVisible({ timeout: 10000 });

    // 1. Assert: No Target column header in table
    const headers = page.locator('.rx-audit-table th');
    const headerTexts = await headers.allInnerTexts();
    const cleanHeaderTexts = headerTexts.map(t => t.trim().split('\n')[0]);
    expect(cleanHeaderTexts).not.toContain('Target');
    expect(cleanHeaderTexts).toEqual([
      'Timestamp',
      'User',
      'Action',
      'Server',
      'Status',
      'Duration',
      'Actions'
    ]);

    // 2. Assert: First three header cells have stronger tint
    for (let i = 0; i < 3; i++) {
      const thClass = await headers.nth(i).getAttribute('class');
      expect(thClass).toContain('rx-audit-th-highlight');
    }
    // Action header has divider
    const actionThClass = await headers.nth(2).getAttribute('class');
    expect(actionThClass).toContain('rx-audit-th-divider');

    // Headers 4, 5, 6, 7 have standard styling
    for (let i = 3; i < 7; i++) {
      const thClass = await headers.nth(i).getAttribute('class');
      expect(thClass).toContain('rx-audit-th-standard');
    }

    // Wait for rows to render
    const rows = page.locator('.rx-audit-table tbody tr');
    await expect(rows).toHaveCount(4);

    // 3. Assert: Timestamp cell text matches /^\d{2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2}:\d{2}$/ and is not truncated
    const timestampRegex = /^\d{2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2}:\d{2}$/;
    for (let r = 0; r < 4; r++) {
      const tsCell = rows.nth(r).locator('td').nth(0);
      const tsText = (await tsCell.innerText()).trim();
      expect(tsText).toMatch(timestampRegex);

      const isNotTruncated = await tsCell.evaluate((el) => el.scrollWidth <= el.clientWidth + 2);
      expect(isNotTruncated).toBe(true);
    }

    // 4. Assert: Server cell text matches "<name> (<type>)" format for server rows and "-" for row without server
    // Row 0 has server: SAP SANDBOX (Sandbox)
    const serverCell0 = rows.nth(0).locator('td').nth(3);
    const serverText0 = (await serverCell0.innerText()).replace(/\s+/g, ' ').trim();
    expect(serverText0).toMatch(/^.+\s\([A-Z][a-z]+\)$/);
    expect(serverText0).toBe('SAP SANDBOX (Sandbox)');

    // Row 1 has server: SAP DEV 01 (Dev)
    const serverCell1 = rows.nth(1).locator('td').nth(3);
    const serverText1 = (await serverCell1.innerText()).replace(/\s+/g, ' ').trim();
    expect(serverText1).toBe('SAP DEV 01 (Dev)');

    // Row 3 has no server: text should be "-"
    const serverCell3 = rows.nth(3).locator('td').nth(3);
    const serverText3 = (await serverCell3.innerText()).trim();
    expect(serverText3).toBe('-');

    // 5. Assert: Long action name in row 1 is rendered
    const actionCell1 = rows.nth(1).locator('td').nth(2);
    const actionText1 = (await actionCell1.innerText()).trim();
    expect(actionText1).toBe('admin.server_configuration_updated');

    // 6. Assert: Failed status row in row 2
    const statusCell2 = rows.nth(2).locator('td').nth(4);
    const statusText2 = (await statusCell2.innerText()).trim();
    expect(statusText2).toContain('Failed');

    // 7. Assert: First three body cells have a different background from the fourth
    for (let r = 0; r < 4; r++) {
      const row = rows.nth(r);
      const bg0 = await row.locator('td').nth(0).evaluate((el) => window.getComputedStyle(el).backgroundColor);
      const bg1 = await row.locator('td').nth(1).evaluate((el) => window.getComputedStyle(el).backgroundColor);
      const bg2 = await row.locator('td').nth(2).evaluate((el) => window.getComputedStyle(el).backgroundColor);
      const bg3 = await row.locator('td').nth(3).evaluate((el) => window.getComputedStyle(el).backgroundColor);

      // Cells 0, 1, 2 should have blue-50 tint (#EEF4F9 -> rgb(238, 244, 249))
      expect(bg0).toBe('rgb(238, 244, 249)');
      expect(bg1).toBe('rgb(238, 244, 249)');
      expect(bg2).toBe('rgb(238, 244, 249)');
      // Cell 3 should NOT have blue-50 tint
      expect(bg3).not.toBe('rgb(238, 244, 249)');
    }

    // 8. Assert: No horizontal overflow in table container
    const tableRegion = page.locator('div[role="region"][aria-label="Audit Logs Table"]');
    const isOverflowing = await tableRegion.evaluate((el) => el.scrollWidth > Math.ceil(el.clientWidth) + 1);
    expect(isOverflowing).toBe(false);

    // Capture Table Screenshot
    const tableScreenshotName = `admin-audit-logs-table-${viewport.width}x${viewport.height}.png`;
    const tableScreenshotPath = path.join('screenshots', tableScreenshotName);
    await page.screenshot({ path: tableScreenshotPath, fullPage: false });
    try {
      if (fs.existsSync(ARTIFACT_DIR)) {
        fs.copyFileSync(tableScreenshotPath, path.join(ARTIFACT_DIR, tableScreenshotName));
      }
    } catch (_) {}

    // 9. Open Detail Panel for Row 0
    const detailBtn0 = rows.nth(0).locator('button', { hasText: 'Detail' });
    await detailBtn0.click();

    const drawer = page.locator('[role="dialog"]');
    await expect(drawer).toBeVisible();
    await expect(drawer.locator('text=Audit Log Entry')).toBeVisible();

    // Assert: Detail panel has NO "User Agent" text
    const drawerText = await drawer.innerText();
    expect(drawerText).not.toContain('User Agent');

    // Assert: Detail panel contains required fields
    expect(drawerText).toContain('Status');
    expect(drawerText).toContain('Logged At');
    expect(drawerText).toContain('User Email');
    expect(drawerText).toContain('Server');
    expect(drawerText).toContain('SAP SANDBOX (Sandbox)');
    expect(drawerText).toContain('Action');
    expect(drawerText).toContain('admin.server_created');
    expect(drawerText).toContain('Target');
    expect(drawerText).toContain('SAP SANDBOX');
    expect(drawerText).toContain('Request ID');
    expect(drawerText).toContain('IP Address');

    // Capture Detail Drawer Screenshot
    const drawerScreenshotName = `admin-audit-logs-drawer-${viewport.width}x${viewport.height}.png`;
    const drawerScreenshotPath = path.join('screenshots', drawerScreenshotName);
    await page.screenshot({ path: drawerScreenshotPath, fullPage: false });
    try {
      if (fs.existsSync(ARTIFACT_DIR)) {
        fs.copyFileSync(drawerScreenshotPath, path.join(ARTIFACT_DIR, drawerScreenshotName));
      }
    } catch (_) {}

    // Close Drawer via the new Close button in the footer
    const closeBtn = drawer.locator('button', { hasText: 'Close' }).last();
    await closeBtn.click();
    await expect(drawer).not.toBeVisible();
  });
});
