import { test, expect } from '@playwright/test';
import { setupMocks } from './helpers/mockApi.js';

test.describe('Top-bar Default Server Selection E2E (1366x768)', () => {
  test('on load, selects newest active accessible server; if newest disabled or no access, selects next newest', async ({ page }, testInfo) => {
    const vp = testInfo.project.name;
    if (vp !== '1366x768') {
      test.skip();
      return;
    }

    const serverOld = {
      id: 'srv-old',
      name: 'SAP Old Server',
      environment: 'DEV',
      is_active: true,
      created_at: '2026-01-10T00:00:00Z',
      permissions: ['bom_display', 'bom_create', 'bom_copy', 'bom_validate', 'bom_delete']
    };

    const serverMid = {
      id: 'srv-mid',
      name: 'SAP Mid Server',
      environment: 'SANDBOX',
      is_active: true,
      created_at: '2026-02-20T00:00:00Z',
      permissions: ['bom_display', 'bom_create', 'bom_copy', 'bom_validate', 'bom_delete']
    };

    const serverNewest = {
      id: 'srv-newest',
      name: 'SAP Newest Server',
      environment: 'PROD',
      is_active: true,
      created_at: '2026-03-15T00:00:00Z',
      permissions: ['bom_display', 'bom_create', 'bom_copy', 'bom_validate', 'bom_delete']
    };

    // 1. With 3 active servers of different dates, newest (srv-newest) is selected on load
    await setupMocks(page, { authenticated: true });
    await page.route('**/api/servers/available', async (route) => {
      // Order in array intentionally mixed (Old, Newest, Mid) to verify sorting by created_at
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, servers: [serverOld, serverNewest, serverMid] })
      });
    });

    await page.goto('/products/bom/display', { waitUntil: 'networkidle' });
    const serverSelect = page.locator('.sap-system-select');
    await expect(serverSelect).toBeVisible();
    await expect(serverSelect).toHaveValue('srv-newest');

    // 2. If newest is disabled (is_active: false), next newest (srv-mid) is selected on load
    const disabledNewest = { ...serverNewest, is_active: false };
    await page.route('**/api/servers/available', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, servers: [serverOld, disabledNewest, serverMid] })
      });
    });

    await page.reload({ waitUntil: 'networkidle' });
    await expect(serverSelect).toHaveValue('srv-mid');

    // 3. If user has no access to newest (omitted from available list), next newest (srv-mid) is selected
    await page.route('**/api/servers/available', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, servers: [serverOld, serverMid] })
      });
    });

    await page.reload({ waitUntil: 'networkidle' });
    await expect(serverSelect).toHaveValue('srv-mid');
  });
});
