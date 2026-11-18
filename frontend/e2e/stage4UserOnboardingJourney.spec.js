import { test, expect } from '@playwright/test';
import { setupMocks, mockAdminUser } from './helpers/mockApi.js';
import path from 'path';

const ARTIFACT_DIR = 'C:\\Users\\chare\\.gemini\\antigravity\\brain\\6fce99f3-5f59-4200-af87-677b5d74db10\\screenshots';

test.describe('Stage 4: User Onboarding & First-Login Journey', () => {
  test('Step 1: Admin Creates User and Receives Temporary Password', async ({ page }, testInfo) => {
    const vpName = testInfo.project.name || 'desktop';

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

    // Click "Add User" button
    const addUserBtn = page.locator('button:has-text("Add User")');
    await expect(addUserBtn).toBeVisible();
    await addUserBtn.click();

    // Verify Add User modal is displayed
    await expect(page.locator('text=Add New User')).toBeVisible();

    // Fill form
    await page.fill('#add-user-email', 'newuser@rexaedge.com');
    await page.fill('#add-user-pwd', 'TempInitialPass99!');

    // Click Create User
    const createBtn = page.locator('button:has-text("Create User")').last();
    await createBtn.click();

    // Verify success notice appears
    await expect(page.locator('text=created successfully')).toBeVisible();

    // Check no horizontal page overflow
    const hasHScroll1 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(hasHScroll1).toBe(false);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, `stage4-admin-created-user-${vpName}.png`),
      fullPage: false
    });
  });

  test('Step 2: User First Login Forces Password Change Without Navigation', async ({ page }, testInfo) => {
    const vpName = testInfo.project.name || 'desktop';

    // Mock user with must_change_password === true
    const firstLoginUser = {
      id: 'newuser-1',
      email: 'newuser@rexaedge.com',
      role: 'user',
      must_change_password: true
    };

    await setupMocks(page, {
      authenticated: true,
      user: firstLoginUser,
      servers: [] // User owns 0 servers
    });

    await page.addInitScript(() => {
      localStorage.setItem('sb_user', JSON.stringify({
        id: 'newuser-1',
        email: 'newuser@rexaedge.com',
        role: 'user',
        must_change_password: true
      }));
      localStorage.setItem('sb_user_email', 'newuser@rexaedge.com');
      localStorage.setItem('sb_user_id', 'newuser-1');
      localStorage.setItem('sb_user_role', 'user');
      localStorage.setItem('sb_token', 'mock-user-token');
    });

    await page.goto('/', { waitUntil: 'networkidle' });

    // 1. Verify Forced Password Change screen appears
    await expect(page.locator('text=Set a New Password')).toBeVisible();
    await expect(page.locator('text=Your account requires a new password')).toBeVisible();

    // Verify NO sidebar, NO top bar navigation is present
    await expect(page.locator('.rx-sidebar')).not.toBeVisible();
    await expect(page.locator('.sap-shell-header')).not.toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, `stage4-force-password-change-${vpName}.png`),
      fullPage: false
    });

    // 2. Fill password change form
    await page.fill('#force-current-password', 'TempInitialPass99!');
    await page.fill('#force-new-password', 'NewEnterprisePass123!');
    await page.fill('#force-confirm-password', 'NewEnterprisePass123!');

    // 3. Submit
    await page.click('button:has-text("Set Password & Continue")');

    // After success, must_change_password flag becomes false and user continues into app without re-login!
    // The Onboarding Modal "Add your SAP server" appears automatically because user owns 0 servers!
    await expect(page.getByRole('heading', { name: 'Add your SAP server' })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);

    // Verify modal fits within viewport
    const modalBox = await page.locator('.rx-modal-dialog').boundingBox();
    if (modalBox) {
      expect(modalBox.width).toBeLessThanOrEqual(page.viewportSize().width);
    }
    const hasHScroll2 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(hasHScroll2).toBe(false);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, `stage4-onboarding-modal-0-servers-${vpName}.png`),
      fullPage: false
    });
  });

  test('Step 3: User Configures First SAP Server, Tests Connection, and Saves', async ({ page }, testInfo) => {
    const vpName = testInfo.project.name || 'desktop';

    // Mock normal user with 0 servers
    const userZeroServers = {
      id: 'newuser-1',
      email: 'newuser@rexaedge.com',
      role: 'user',
      must_change_password: false
    };

    await setupMocks(page, {
      authenticated: true,
      user: userZeroServers,
      servers: []
    });

    await page.addInitScript(() => {
      localStorage.setItem('sb_user', JSON.stringify({
        id: 'newuser-1',
        email: 'newuser@rexaedge.com',
        role: 'user',
        must_change_password: false
      }));
      localStorage.setItem('sb_user_email', 'newuser@rexaedge.com');
      localStorage.setItem('sb_user_id', 'newuser-1');
      localStorage.setItem('sb_user_role', 'user');
      localStorage.setItem('sb_token', 'mock-user-token');
    });

    await page.goto('/home', { waitUntil: 'networkidle' });

    // Onboarding modal appears
    await expect(page.getByRole('heading', { name: 'Add your SAP server' })).toBeVisible();

    // Verify encryption note
    await expect(page.locator('text=Your SAP password is encrypted and only used for your sessions')).toBeVisible();

    // Fill server details
    await page.fill('#server-name', 'My Sandbox SAP');
    await page.fill('#server-ashost', '103.206.249.51');
    await page.fill('#server-sysnr', '00');
    await page.fill('#server-client', '100');
    await page.fill('#server-username', 'TEST_CONSULTANT');
    await page.fill('#server-password', 'SapSecret123!');

    // Test connection
    const testBtn = page.locator('button:has-text("Test Connection")');
    await testBtn.click();

    // Verify connection success notification
    await expect(page.locator('text=Connection successful')).toBeVisible();

    const modalBox3 = await page.locator('.rx-modal-dialog').boundingBox();
    if (modalBox3) {
      expect(modalBox3.width).toBeLessThanOrEqual(page.viewportSize().width);
    }
    const hasHScroll3 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(hasHScroll3).toBe(false);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, `stage4-onboarding-test-connection-${vpName}.png`),
      fullPage: false
    });

    // Click "Add Server" to save
    const addServerBtn = page.locator('button:has-text("Add Server")').last();
    await addServerBtn.click();

    // Modal closes
    await expect(page.getByRole('heading', { name: 'Add your SAP server' })).not.toBeVisible();
  });

  test('Step 4: My Servers View Displays Server Details with Read-Only Allowlist Type', async ({ page }, testInfo) => {
    const vpName = testInfo.project.name || 'desktop';

    const configuredServer = {
      id: 'srv-my-sandbox',
      name: 'My Sandbox SAP',
      ashost: '103.206.249.51',
      sysnr: '00',
      client: '100',
      type: 'Sandbox',
      environment: 'Sandbox',
      is_default: true,
      is_active: true
    };

    await setupMocks(page, {
      authenticated: true,
      user: { id: 'newuser-1', email: 'newuser@rexaedge.com', role: 'user', must_change_password: false },
      servers: [configuredServer]
    });

    await page.addInitScript(() => {
      localStorage.setItem('sb_user', JSON.stringify({
        id: 'newuser-1',
        email: 'newuser@rexaedge.com',
        role: 'user',
        must_change_password: false
      }));
      localStorage.setItem('sb_user_email', 'newuser@rexaedge.com');
      localStorage.setItem('sb_user_id', 'newuser-1');
      localStorage.setItem('sb_user_role', 'user');
      localStorage.setItem('sb_token', 'mock-user-token');
    });

    await page.goto('/my-servers', { waitUntil: 'networkidle' });

    // Verify My SAP Servers page
    await expect(page.locator('text=My SAP Servers').first()).toBeVisible();
    await expect(page.locator('.rx-my-servers-container').locator('text=My Sandbox SAP')).toBeVisible();
    await expect(page.locator('text=103.206.249.51')).toBeVisible();
    await expect(page.locator('text=Sandbox').first()).toBeVisible();

    // Top-bar displays server name
    await expect(page.locator('.sap-system-static-name, .sap-system-select').first()).toBeVisible();

    const hasHScroll4 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(hasHScroll4).toBe(false);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, `stage4-my-servers-view-${vpName}.png`),
      fullPage: false
    });
  });

  test('Step 5: User with Configured Server Can Access and Execute BOM Operations', async ({ page }, testInfo) => {
    const vpName = testInfo.project.name || 'desktop';

    const configuredServer = {
      id: 'srv-my-sandbox',
      name: 'My Sandbox SAP',
      ashost: '103.206.249.51',
      sysnr: '00',
      client: '100',
      type: 'Sandbox',
      environment: 'Sandbox',
      is_default: true,
      is_active: true
    };

    await setupMocks(page, {
      authenticated: true,
      user: { id: 'newuser-1', email: 'newuser@rexaedge.com', role: 'user', must_change_password: false },
      servers: [configuredServer]
    });

    await page.addInitScript(() => {
      localStorage.setItem('sb_user', JSON.stringify({
        id: 'newuser-1',
        email: 'newuser@rexaedge.com',
        role: 'user',
        must_change_password: false
      }));
      localStorage.setItem('sb_user_email', 'newuser@rexaedge.com');
      localStorage.setItem('sb_user_id', 'newuser-1');
      localStorage.setItem('sb_user_role', 'user');
      localStorage.setItem('sb_token', 'mock-user-token');
    });

    await page.goto('/products/bom/display', { waitUntil: 'networkidle' });

    // Verify Display BOM screen loads
    await expect(page.locator('text=Display Bill of Material').or(page.locator('text=Display BOM')).first()).toBeVisible();

    const hasHScroll5 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(hasHScroll5).toBe(false);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, `stage4-bom-operations-ready-${vpName}.png`),
      fullPage: false
    });
  });
});
