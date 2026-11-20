import { test, expect } from '@playwright/test';
import { setupMocks, mockAdminUser, mockServers } from './helpers/mockApi.js';
import path from 'path';

const ARTIFACT_DIR = 'C:\\Users\\chare\\.gemini\\antigravity\\brain\\6fce99f3-5f59-4200-af87-677b5d74db10\\screenshots';

test.describe('UI Fixes & Polish Verification', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page, {
      authenticated: true,
      user: mockAdminUser,
      servers: mockServers
    });

    await page.addInitScript(() => {
      localStorage.setItem('sb_user', JSON.stringify({
        id: 'admin-1',
        email: 'admin@rexaedge.com',
        role: 'admin'
      }));
      localStorage.setItem('sb_user_email', 'admin@rexaedge.com');
      localStorage.setItem('sb_user_id', 'admin-1');
      localStorage.setItem('sb_user_role', 'admin');
      localStorage.setItem('sb_token', 'mock-admin-token');
      localStorage.setItem('rexa_selected_server_id', 'srv-1');
      localStorage.setItem('rexa_sidebar_expanded_groups', JSON.stringify({ bom: true, admin: true }));
    });
  });

  test('1. Admin > All servers table (/admin/servers)', async ({ page }, testInfo) => {
    const vp = `${testInfo.project.use.viewport.width}x${testInfo.project.use.viewport.height}`;
    await page.goto('/admin/servers', { waitUntil: 'networkidle' });

    await expect(page.locator('table')).toBeVisible();

    // Verify Delete button (Trash2) is visible in the actions column
    const deleteBtn = page.locator('button[title="Delete Server (Kill Switch)"]').first();
    await expect(deleteBtn).toBeVisible();

    // On desktop, verify no horizontal scrollbar on the table container
    if (testInfo.project.use.viewport.width >= 1024) {
      const scrollable = await page.evaluate(() => {
        const el = document.querySelector('.sap-admin-table-scroll');
        if (!el) return false;
        return el.scrollWidth > el.clientWidth;
      });
      expect(scrollable).toBe(false);
    }

    const shotPath = path.join(ARTIFACT_DIR, `fix1-admin-servers-${vp}.png`);
    await page.screenshot({ path: shotPath, fullPage: true });
  });

  test('2. Admin > Settings search input (/admin/allowlist)', async ({ page }, testInfo) => {
    const vp = `${testInfo.project.use.viewport.width}x${testInfo.project.use.viewport.height}`;
    await page.goto('/admin/allowlist', { waitUntil: 'networkidle' });

    // Verify SearchInput with placeholder is visible
    const searchInput = page.locator('input[placeholder="Filter allowlist patterns..."]');
    await expect(searchInput).toBeVisible();

    // Verify left padding >= 36px so placeholder text doesn't overlap 16px icon
    const paddingLeft = await searchInput.evaluate((el) => {
      return parseInt(window.getComputedStyle(el).paddingLeft, 10);
    });
    expect(paddingLeft).toBeGreaterThanOrEqual(36);

    const shotPath = path.join(ARTIFACT_DIR, `fix2-admin-allowlist-${vp}.png`);
    await page.screenshot({ path: shotPath, fullPage: true });
  });

  test('3. Standard Popup Header (Add Server Allowlist Pattern)', async ({ page }, testInfo) => {
    const vp = `${testInfo.project.use.viewport.width}x${testInfo.project.use.viewport.height}`;
    await page.goto('/admin/allowlist', { waitUntil: 'networkidle' });

    // Click Add Allowlist Pattern
    const addBtn = page.locator('button:has-text("Add Allowlist Pattern")');
    await addBtn.click();

    // Verify standard modal elements
    await expect(page.locator('text=Add Server Allowlist Pattern')).toBeVisible();
    await expect(page.locator('text=Specify allowed hostnames, IP addresses, or CIDR subnets')).toBeVisible();

    const header = page.locator('.sap-modal-header, .rx-modal-header').first();
    await expect(header).toBeVisible();

    const headerHeight = await header.evaluate((el) => el.clientHeight);
    expect(headerHeight).toBeGreaterThanOrEqual(60);
    expect(headerHeight).toBeLessThanOrEqual(64);

    const shotPath = path.join(ARTIFACT_DIR, `fix3-popup-header-${vp}.png`);
    await page.screenshot({ path: shotPath, fullPage: true });
  });

  test('4. My SAP Servers page (/my-servers)', async ({ page }, testInfo) => {
    const vp = `${testInfo.project.use.viewport.width}x${testInfo.project.use.viewport.height}`;
    await page.goto('/my-servers', { waitUntil: 'networkidle' });

    // Verify breadcrumbs
    await expect(page.locator('nav.fiori-bc')).toBeVisible();
    await expect(page.locator('nav.fiori-bc .fiori-bc-current')).toHaveText('My Servers');

    // Verify subtitle text
    await expect(page.locator('text=Add and manage your own SAP servers. Your SAP passwords are encrypted and never shown in the app.')).toBeVisible();

    // Verify Type column header (not Type (Allowlist))
    const typeHeader = page.locator('th:has-text("Type")');
    await expect(typeHeader).toBeVisible();
    const typeText = await typeHeader.textContent();
    expect(typeText.trim()).toBe('Type');

    // Verify radio button in Default column
    const radioBtn = page.locator('button[role="radio"]').first();
    await expect(radioBtn).toBeVisible();
    expect(await radioBtn.getAttribute('title')).toBe('Set as default');

    const shotPath = path.join(ARTIFACT_DIR, `fix4-my-servers-${vp}.png`);
    await page.screenshot({ path: shotPath, fullPage: true });
  });
});
