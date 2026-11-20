import { test, expect } from '@playwright/test';
import { setupMocks, mockNormalUser } from './helpers/mockApi.js';
import path from 'path';

const ARTIFACT_DIR = 'C:\\Users\\chare\\.gemini\\antigravity\\brain\\6fce99f3-5f59-4200-af87-677b5d74db10\\screenshots';

const testServer = {
  id: 'srv-user-1',
  name: 'RELAXO Sandbox',
  environment: 'SANDBOX',
  is_active: true,
  ashost: '192.168.12.241',
  host: '192.168.12.241',
  sysnr: '09',
  client: '500',
  health_status: 'healthy',
  circuit_breaker: 'closed',
  last_error: null,
  owner_id: 'user-1'
};

test.describe('Health Dot & My Servers Status Parity Suite', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test('1. Parity when Healthy: Top-bar dot is green and My Servers shows Ready', async ({ page }) => {
    await setupMocks(page, {
      authenticated: true,
      user: mockNormalUser,
      servers: [testServer]
    });

    await page.route('**/api/servers', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          servers: [{
            ...testServer,
            health_status: 'healthy',
            circuit_breaker: 'closed'
          }]
        })
      });
    });

    await page.route('**/api/sap/session-status*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          connected: true,
          status: 'AVAILABLE',
          code: 'AVAILABLE',
          latencyMs: 18,
          system: 'DEV',
          client: '500',
          selectedSessionId: 'RFC_srv-user-1'
        })
      });
    });

    await page.addInitScript(() => {
      localStorage.setItem('sb_user', JSON.stringify({ id: 'user-1', email: 'user@rexaedge.com', role: 'user' }));
      localStorage.setItem('sb_token', 'mock-user-token');
      sessionStorage.setItem('selected_server_id', 'srv-user-1');
    });

    await page.goto('/home');

    // 1. Verify Top-bar dot is green (.dot-connected)
    const dotContainer = page.locator('.sap-connection-dot-container');
    await expect(dotContainer).toBeVisible({ timeout: 5000 });
    const greenDot = dotContainer.locator('.sap-connection-dot.dot-connected');
    await expect(greenDot).toBeVisible();

    const tooltip = await dotContainer.getAttribute('title');
    expect(tooltip).toContain('Connected to RELAXO Sandbox');

    // 2. Navigate to My Servers
    await page.getByRole('button', { name: 'My Servers' }).click();
    await expect(page.getByRole('heading', { name: 'My SAP Servers' })).toBeVisible({ timeout: 5000 });

    // 3. Verify My Servers row shows Ready with green indicator
    const statusCol = page.getByTestId('server-status-srv-user-1');
    await expect(statusCol).toBeVisible();
    await expect(statusCol).toContainText('Ready');

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'health-parity-healthy-1366x768.png'),
      fullPage: false
    });
  });

  test('2. Parity when Unreachable: Top-bar dot is red with failure reason, My Servers shows Unreachable', async ({ page }) => {
    await setupMocks(page, {
      authenticated: true,
      user: mockNormalUser,
      servers: [testServer]
    });

    // Mock GET /api/servers with health_status: 'down'
    await page.route('**/api/servers', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          servers: [{
            ...testServer,
            health_status: 'down',
            circuit_breaker: 'open',
            last_error: 'SAP server not reachable (network timeout)'
          }]
        })
      });
    });

    // Mock GET /api/sap/session-status with disconnected status
    await page.route('**/api/sap/session-status*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          connected: false,
          status: 'SERVER_UNAVAILABLE',
          code: 'SAP_UNREACHABLE',
          message: 'SAP server not reachable'
        })
      });
    });

    await page.addInitScript(() => {
      localStorage.setItem('sb_user', JSON.stringify({ id: 'user-1', email: 'user@rexaedge.com', role: 'user' }));
      localStorage.setItem('sb_token', 'mock-user-token');
      sessionStorage.setItem('selected_server_id', 'srv-user-1');
    });

    await page.goto('/home');

    // 1. Verify Top-bar dot is red (.dot-disconnected)
    const dotContainer = page.locator('.sap-connection-dot-container');
    await expect(dotContainer).toBeVisible({ timeout: 5000 });
    const redDot = dotContainer.locator('.sap-connection-dot.dot-disconnected');
    await expect(redDot).toBeVisible();

    const tooltip = await dotContainer.getAttribute('title');
    expect(tooltip).toBe('RELAXO Sandbox: SAP server not reachable');

    // 2. Navigate to My Servers
    await page.getByRole('button', { name: 'My Servers' }).click();
    await expect(page.getByRole('heading', { name: 'My SAP Servers' })).toBeVisible({ timeout: 5000 });

    // 3. Verify My Servers row displays Unreachable (agreeing with top bar)
    const statusCol = page.getByTestId('server-status-srv-user-1');
    await expect(statusCol).toBeVisible();
    await expect(statusCol).toContainText('Unreachable');

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'health-parity-unreachable-1366x768.png'),
      fullPage: false
    });
  });

  test('3. Test Connection in My Servers clears failure state and turns top-bar dot green', async ({ page }) => {
    await setupMocks(page, {
      authenticated: true,
      user: mockNormalUser,
      servers: [testServer]
    });

    let isHealthy = false;

    await page.route('**/api/servers', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          servers: [{
            ...testServer,
            health_status: isHealthy ? 'healthy' : 'down',
            circuit_breaker: isHealthy ? 'closed' : 'open',
            last_error: isHealthy ? null : 'SAP server not reachable'
          }]
        })
      });
    });

    await page.route('**/api/sap/session-status*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          connected: isHealthy,
          status: isHealthy ? 'AVAILABLE' : 'SERVER_UNAVAILABLE',
          code: isHealthy ? 'AVAILABLE' : 'SAP_UNREACHABLE',
          message: isHealthy ? 'SAP RFC Online (15ms)' : 'SAP server not reachable',
          latencyMs: isHealthy ? 15 : null
        })
      });
    });

    await page.route('**/api/servers/*/test', async (route) => {
      isHealthy = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Connection test successful. Type: Sandbox',
          type: 'Sandbox',
          responseTimeMs: 14
        })
      });
    });

    await page.addInitScript(() => {
      localStorage.setItem('sb_user', JSON.stringify({ id: 'user-1', email: 'user@rexaedge.com', role: 'user' }));
      localStorage.setItem('sb_token', 'mock-user-token');
      sessionStorage.setItem('selected_server_id', 'srv-user-1');
    });

    await page.goto('/home');

    // Starts red
    const dotContainer = page.locator('.sap-connection-dot-container');
    await expect(dotContainer.locator('.sap-connection-dot.dot-disconnected')).toBeVisible({ timeout: 5000 });

    // Go to My Servers
    await page.getByRole('button', { name: 'My Servers' }).click();
    await expect(page.getByRole('heading', { name: 'My SAP Servers' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('server-status-srv-user-1')).toContainText('Unreachable');

    // Click "Test" button
    const testButton = page.getByRole('button', { name: 'Test', exact: true });
    await expect(testButton).toBeVisible();
    await testButton.click();

    // Row updates to Connected
    await expect(page.getByText('Connected (14 ms)')).toBeVisible({ timeout: 5000 });

    // Top-bar dot immediately reflects success and becomes green!
    await expect(dotContainer.locator('.sap-connection-dot.dot-connected')).toBeVisible({ timeout: 5000 });
    const recoveredTooltip = await dotContainer.getAttribute('title');
    expect(recoveredTooltip).toContain('Connected to RELAXO Sandbox');

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'health-parity-test-recovered-1366x768.png'),
      fullPage: false
    });
  });
});
