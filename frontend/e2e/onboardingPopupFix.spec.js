import { test, expect } from '@playwright/test';
import { setupMocks, mockNormalUser, mockServers } from './helpers/mockApi.js';
import path from 'path';

const ARTIFACT_DIR = 'C:\\Users\\chare\\.gemini\\antigravity\\brain\\6fce99f3-5f59-4200-af87-677b5d74db10\\screenshots';

test.describe('Onboarding Popup Bug Fix: Add Server Modal Display Logic', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test('1. User with 1+ servers: popup NEVER appears on login, even on slow server-list response', async ({ page }) => {
    await setupMocks(page, {
      authenticated: true,
      user: mockNormalUser,
      servers: [mockServers[0]]
    });

    // Intercept server list AFTER setupMocks so this takes precedence to simulate a slow response (800ms)
    await page.route('**/api/servers/available', async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, servers: [mockServers[0]] })
      });
    });

    await page.addInitScript(() => {
      localStorage.setItem('sb_user', JSON.stringify({
        id: 'user-1',
        email: 'user@rexaedge.com',
        role: 'user'
      }));
      localStorage.setItem('sb_user_email', 'user@rexaedge.com');
      localStorage.setItem('sb_user_id', 'user-1');
      localStorage.setItem('sb_user_role', 'user');
      localStorage.setItem('sb_token', 'mock-user-token');
    });

    await page.goto('/home');

    // While loading, the popup must NOT be visible
    const onboardingHeading = page.getByRole('heading', { name: 'Add your SAP server' });
    await expect(onboardingHeading).not.toBeVisible();

    // After slow load completes, top bar reflects the server and popup is STILL not visible
    await expect(page.locator('.sap-system-static-name')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.sap-system-static-name')).toHaveText('SAP DEV 01');
    await expect(onboardingHeading).not.toBeVisible();

    // Wait an additional interval to confirm no delayed popup trigger
    await page.waitForTimeout(500);
    await expect(onboardingHeading).not.toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'onboarding-user-with-servers-1366x768.png'),
      fullPage: false
    });
  });

  test('2. User with 0 servers: popup appears; "Later" hides it for session; reappears after re-login', async ({ page }) => {
    await setupMocks(page, {
      authenticated: true,
      user: mockNormalUser,
      servers: []
    });

    await page.addInitScript(() => {
      localStorage.setItem('sb_user', JSON.stringify({
        id: 'user-1',
        email: 'user@rexaedge.com',
        role: 'user'
      }));
      localStorage.setItem('sb_user_email', 'user@rexaedge.com');
      localStorage.setItem('sb_user_id', 'user-1');
      localStorage.setItem('sb_user_role', 'user');
      localStorage.setItem('sb_token', 'mock-user-token');
    });

    await page.goto('/home', { waitUntil: 'networkidle' });

    // With 0 servers, popup appears once server list finishes loading
    const onboardingHeading = page.getByRole('heading', { name: 'Add your SAP server' });
    await expect(onboardingHeading).toBeVisible({ timeout: 5000 });

    // Click "Later" to dismiss for this session
    const laterBtn = page.getByRole('button', { name: 'Later' });
    await expect(laterBtn).toBeVisible();
    await laterBtn.click();
    await expect(onboardingHeading).not.toBeVisible();

    // Reload page: in the same session, popup must NOT reappear
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await expect(onboardingHeading).not.toBeVisible();

    // Click "Add a SAP server to continue" in top bar: opening manually still works
    const topBarAddBtn = page.getByTestId('add-server-empty-btn');
    if (await topBarAddBtn.isVisible()) {
      await topBarAddBtn.click();
      await expect(onboardingHeading).toBeVisible();
      await page.getByRole('button', { name: 'Later' }).click();
      await expect(onboardingHeading).not.toBeVisible();
    }

    // Logout and log in again: next login restores popup for 0-server user
    await page.evaluate(() => {
      // Clear session storage dismissal as handleLoginSuccess does on next login
      sessionStorage.removeItem('rexa_dismissed_server_onboarding');
    });
    await page.reload({ waitUntil: 'networkidle' });
    await expect(onboardingHeading).toBeVisible({ timeout: 5000 });

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'onboarding-zero-servers-popup-1366x768.png'),
      fullPage: false
    });
  });

  test('3. Opening Add server from My Servers still works as before', async ({ page }) => {
    await setupMocks(page, {
      authenticated: true,
      user: mockNormalUser,
      servers: [mockServers[0]]
    });

    await page.addInitScript(() => {
      localStorage.setItem('sb_user', JSON.stringify({
        id: 'user-1',
        email: 'user@rexaedge.com',
        role: 'user'
      }));
      localStorage.setItem('sb_user_email', 'user@rexaedge.com');
      localStorage.setItem('sb_user_id', 'user-1');
      localStorage.setItem('sb_user_role', 'user');
      localStorage.setItem('sb_token', 'mock-user-token');
    });

    await page.goto('/my-servers', { waitUntil: 'networkidle' });

    // Click "Add Server" in My Servers view
    const addServerBtn = page.locator('button:has-text("Add Server")');
    await expect(addServerBtn).toBeVisible();
    await addServerBtn.click();

    // Modal opens as "Add SAP Server" with "Cancel" button in modal footer
    await expect(page.getByRole('heading', { name: 'Add SAP Server' })).toBeVisible();
    const cancelBtn = page.locator('.rx-modal-footer button:has-text("Cancel")');
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();
    await expect(page.getByRole('heading', { name: 'Add SAP Server' })).not.toBeVisible();
  });

  test('4. While loading or if server list fails: popup does NOT show, normal error state displays', async ({ page }) => {
    await setupMocks(page, {
      authenticated: true,
      user: mockNormalUser,
      servers: []
    });

    // Intercept to return 500 error AFTER setupMocks so this takes precedence
    await page.route('**/api/servers/available', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Database connection failed' })
      });
    });
    await page.route('**/api/servers', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Database connection failed' })
      });
    });

    await page.addInitScript(() => {
      localStorage.setItem('sb_user', JSON.stringify({
        id: 'user-1',
        email: 'user@rexaedge.com',
        role: 'user'
      }));
      localStorage.setItem('sb_user_email', 'user@rexaedge.com');
      localStorage.setItem('sb_user_id', 'user-1');
      localStorage.setItem('sb_user_role', 'user');
      localStorage.setItem('sb_token', 'mock-user-token');
    });

    await page.goto('/products/bom/create/single', { waitUntil: 'networkidle' });

    // Popup must NOT be shown
    const onboardingHeading = page.getByRole('heading', { name: 'Add your SAP server' });
    await expect(onboardingHeading).not.toBeVisible();

    // Normal error state must be shown with Retry button
    await expect(page.getByText('Failed to load SAP servers')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.rx-bom-server-error-card button:has-text("Retry")')).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'onboarding-server-load-error-1366x768.png'),
      fullPage: false
    });
  });
});
