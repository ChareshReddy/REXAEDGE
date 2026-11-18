import { test, expect } from '@playwright/test';
import { setupMocks, mockAdminUser } from './helpers/mockApi.js';
import path from 'path';

const ARTIFACT_DIR = 'C:\\Users\\chare\\.gemini\\antigravity\\brain\\6fce99f3-5f59-4200-af87-677b5d74db10\\screenshots';

test.describe('Stage 2: Enterprise Administration UI', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page, { authenticated: true, user: mockAdminUser });

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
    });

    await page.goto('/admin/users', { waitUntil: 'networkidle' });
  });

  test('Capture Admin Users & Reset Password Modal', async ({ page }, testInfo) => {
    const vpName = testInfo.project.name || 'desktop';

    // 1. Verify and capture Admin Users table
    await expect(page.locator('text=Users').first()).toBeVisible();
    await expect(page.locator('text=user@rexaedge.com').first()).toBeVisible();
    await expect(page.locator('text=Active').first()).toBeVisible();
    await expect(page.locator('text=Disabled').first()).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, `admin-users-${vpName}.png`),
      fullPage: false
    });

    // 2. Click Reset password on user-1
    const resetBtn = page.locator('button:has-text("Reset password")').first();
    await resetBtn.click();

    // Verify Reset Password Result modal
    await expect(page.locator('text=Password Reset Successfully')).toBeVisible();
    await expect(page.locator('text=TempInitialPass99!')).toBeVisible();
    await expect(page.locator('button:has-text("Copy")')).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, `admin-reset-password-modal-${vpName}.png`),
      fullPage: false
    });

    // Close modal
    await page.locator('button:has-text("Done")').click();
    await expect(page.locator('text=Password Reset Successfully')).not.toBeVisible();
  });

  test('Capture Admin Server Allowlist Tab & Modal', async ({ page }, testInfo) => {
    const vpName = testInfo.project.name || 'desktop';

    // 1. Click Settings / Server Allowlist tab
    const allowlistTab = page.locator('button:has-text("Settings"), button:has-text("Server Allowlist")').first();
    await allowlistTab.click();

    // Verify allowlist table and policies
    await expect(page.locator('text=103.206.249.51').first()).toBeVisible();
    await expect(page.locator('text=Sandbox Gateway').first()).toBeVisible();
    await expect(page.locator('text=192.168.100.0/24').first()).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, `admin-allowlist-${vpName}.png`),
      fullPage: false
    });

    // 2. Click Add Pattern button
    const addBtn = page.locator('button:has-text("Add Allowlist Pattern"), button:has-text("Add Pattern")').first();
    await addBtn.click();

    // Verify Add Pattern modal
    await expect(page.locator('text=Add Server Allowlist Pattern')).toBeVisible();
    await expect(page.locator('#allowlist-pattern')).toBeVisible();
    await expect(page.locator('#allowlist-type')).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, `admin-add-allowlist-modal-${vpName}.png`),
      fullPage: false
    });
  });

  test('Capture All Servers Read-Only Overview & Kill Switches', async ({ page }, testInfo) => {
    const vpName = testInfo.project.name || 'desktop';

    // 1. Click All servers tab
    const allServersTab = page.locator('button:has-text("All servers")').first();
    await allServersTab.click();

    // Verify All servers table and kill switches
    await expect(page.locator('th:has-text("Server name")')).toBeVisible();
    await expect(page.locator('th:has-text("Owner")')).toBeVisible();
    await expect(page.locator('th:has-text("Kill Switches")')).toBeVisible();

    // Verify credentials (sap_password) never exposed
    const html = await page.content();
    expect(html).not.toContain('sap_password_encrypted');
    expect(html).not.toContain('RFC_SECRET_PASS');

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, `admin-all-servers-overview-${vpName}.png`),
      fullPage: false
    });
  });
});
