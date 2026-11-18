import { test, expect } from '@playwright/test';
import { setupMocks } from './helpers/mockApi.js';
import path from 'path';

const ARTIFACTS_DIR = 'C:/Users/chare/.gemini/antigravity/brain/6fce99f3-5f59-4200-af87-677b5d74db10/screenshots';

const srvDefault = {
  id: 'srv-prd-default',
  name: 'SAP Production (PRD)',
  environment: 'Production',
  type: 'Production',
  is_default: true,
  is_disabled: false,
  is_active: true,
  ashost: '103.206.249.51',
  sysnr: '00',
  client: '100'
};

const srvSecondary = {
  id: 'srv-sbx-second',
  name: 'SAP Sandbox (SBX)',
  environment: 'Sandbox',
  type: 'Sandbox',
  is_default: false,
  is_disabled: false,
  is_active: true,
  ashost: '192.168.1.50',
  sysnr: '01',
  client: '200'
};

const userOwnedServers = [srvDefault, srvSecondary];

async function setupTabMocks(page) {
  await setupMocks(page, {
    authenticated: true,
    user: { id: 'usr-tab-1', email: 'engineer@rexaedge.com', role: 'user' },
    servers: userOwnedServers
  });

  await page.addInitScript(() => {
    localStorage.setItem('sb_user', JSON.stringify({
      id: 'usr-tab-1',
      email: 'engineer@rexaedge.com',
      role: 'user'
    }));
    localStorage.setItem('sb_user_email', 'engineer@rexaedge.com');
    localStorage.setItem('sb_user_id', 'usr-tab-1');
    localStorage.setItem('sb_user_role', 'user');
    localStorage.setItem('sb_token', 'mock-token-stage3-e2e');
  });

  // Explicit server-header verification mock on /api/plants
  await page.route('**/api/plants**', async (route) => {
    const headers = route.request().headers();
    const serverId = headers['x-sap-server-id'] || headers['x-server-id'];

    if (serverId === srvSecondary.id) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          plants: [{ werks: '2000', name1: 'Sandbox Test Plant 2000' }]
        })
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        plants: [{ werks: '1000', name1: 'Production Plant 1000' }]
      })
    });
  });
}

test.describe('Stage 3: Per-Tab Server Selection & Isolation', () => {
  test('Two tabs in the SAME browser context show their own server at the same time without cross-talk', async ({ browser }, testInfo) => {
    const projectName = testInfo.project.name || 'desktop';
    const context = await browser.newContext();

    // 1. OPEN TAB 1
    const page1 = await context.newPage();
    await setupTabMocks(page1);

    await page1.goto('/', { waitUntil: 'networkidle' });

    // Tab 1 starts on user's default server: SAP Production (PRD)
    const topBarSelect1 = page1.locator('select.sap-system-select, select[aria-label="Select SAP Server"]');
    await expect(topBarSelect1).toBeVisible();
    await expect(topBarSelect1).toHaveValue(srvDefault.id);

    // Switch Tab 1 to Server 2: SAP Sandbox (SBX)
    await topBarSelect1.selectOption(srvSecondary.id);
    await expect(topBarSelect1).toHaveValue(srvSecondary.id);

    // Capture screenshot of Tab 1 showing Sandbox
    await page1.screenshot({
      path: path.join(ARTIFACTS_DIR, `stage3-tab1-sandbox-${projectName}.png`),
      fullPage: false
    });

    // 2. OPEN TAB 2 in the SAME BROWSER CONTEXT
    const page2 = await context.newPage();
    await setupTabMocks(page2);

    await page2.goto('/', { waitUntil: 'networkidle' });

    // Tab 2 must start on the user's DEFAULT server (SAP Production), NOT the server selected in Tab 1!
    const topBarSelect2 = page2.locator('select.sap-system-select, select[aria-label="Select SAP Server"]');
    await expect(topBarSelect2).toBeVisible();
    await expect(topBarSelect2).toHaveValue(srvDefault.id);

    // Verify Tab 1 STILL shows SAP Sandbox at the EXACT SAME TIME!
    await expect(topBarSelect1).toHaveValue(srvSecondary.id);

    // Capture screenshot of Tab 2 showing default Production
    await page2.screenshot({
      path: path.join(ARTIFACTS_DIR, `stage3-tab2-production-default-${projectName}.png`),
      fullPage: false
    });

    // 3. RELOAD TAB 1 - RELOAD MUST PRESERVE TAB 1'S SELECTION
    await page1.reload({ waitUntil: 'networkidle' });

    const topBarSelect1AfterReload = page1.locator('select.sap-system-select, select[aria-label="Select SAP Server"]');
    await expect(topBarSelect1AfterReload).toBeVisible();
    await expect(topBarSelect1AfterReload).toHaveValue(srvSecondary.id);

    // Tab 2 still remains on Production
    await expect(topBarSelect2).toHaveValue(srvDefault.id);

    // Capture screenshot after reload
    await page1.screenshot({
      path: path.join(ARTIFACTS_DIR, `stage3-tab1-reload-preserves-sandbox-${projectName}.png`),
      fullPage: false
    });

    await context.close();
  });
});
