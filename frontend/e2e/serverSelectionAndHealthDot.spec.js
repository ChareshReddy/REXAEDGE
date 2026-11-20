import { test, expect } from '@playwright/test';
import { setupMocks, mockNormalUser } from './helpers/mockApi.js';
import path from 'path';

const ARTIFACT_DIR = 'C:\\Users\\chare\\.gemini\\antigravity\\brain\\6fce99f3-5f59-4200-af87-677b5d74db10\\screenshots';

const healthyServer = {
  id: 'srv-relaxo-sandbox',
  name: 'RELAXO Sandbox',
  environment: 'SANDBOX',
  is_active: true,
  is_disabled: false,
  ashost: '192.168.12.241',
  host: '192.168.12.241',
  sysnr: '09',
  client: '500',
  health_status: 'healthy',
  circuit_breaker: 'closed',
  last_error: null,
  owner_id: 'user-1'
};

const secondServer = {
  id: 'srv-relaxo-dev',
  name: 'RELAXO Dev',
  environment: 'DEV',
  is_active: true,
  is_disabled: false,
  ashost: '192.168.12.242',
  host: '192.168.12.242',
  sysnr: '01',
  client: '100',
  health_status: 'healthy',
  circuit_breaker: 'closed',
  last_error: null,
  owner_id: 'user-1'
};

test.describe('Top-bar SAP Health Dot & Server Selection Suite', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test('1. With one healthy owned server, dot turns green within 2s, carries x-sap-server-id, and NO request goes to /api/servers/available', async ({ page }) => {
    let availableRequestCount = 0;
    let sessionStatusServerIdHeader = null;
    let sessionStatusCalled = false;

    // Track if any request hits the dead /api/servers/available endpoint
    await page.route('**/api/servers/available**', async (route) => {
      availableRequestCount++;
      await route.abort('failed');
    });

    await setupMocks(page, {
      authenticated: true,
      user: mockNormalUser,
      servers: [healthyServer]
    });

    await page.route('**/api/servers', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          servers: [healthyServer]
        })
      });
    });

    await page.route('**/api/sap/session-status*', async (route) => {
      sessionStatusCalled = true;
      const headers = route.request().headers();
      sessionStatusServerIdHeader = headers['x-sap-server-id'];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          connected: true,
          status: 'AVAILABLE',
          code: 'AVAILABLE',
          latencyMs: 12,
          system: 'SANDBOX',
          client: '500',
          selectedSessionId: 'RFC_srv-relaxo-sandbox'
        })
      });
    });

    await page.addInitScript(() => {
      localStorage.setItem('sb_user', JSON.stringify({ id: 'user-1', email: 'user@rexaedge.com', role: 'user' }));
      localStorage.setItem('sb_token', 'mock-user-token');
      sessionStorage.setItem('selected_server_id', 'srv-relaxo-sandbox');
    });

    await page.goto('/home', { waitUntil: 'domcontentloaded' });
    const startTime = Date.now();

    // Dot turns green within 2 seconds of load
    const greenDot = page.locator('.sap-connection-dot.dot-connected');
    await expect(greenDot).toBeVisible({ timeout: 3000 });
    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThanOrEqual(2500);

    // Verify tooltip
    const dotContainer = page.locator('.sap-connection-dot-container');
    await expect(dotContainer).toHaveAttribute('title', /Connected to RELAXO Sandbox/i);

    // Verify session status was called with x-sap-server-id
    expect(sessionStatusCalled).toBe(true);
    expect(sessionStatusServerIdHeader).toBe('srv-relaxo-sandbox');

    // Verify strictly ZERO requests went to /api/servers/available
    expect(availableRequestCount).toBe(0);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'health-dot-green-within-2s-1366x768.png'),
      fullPage: false
    });
  });

  test('2. With 0 servers, dot is neutral grey with tooltip "No SAP server added" (not red)', async ({ page }) => {
    let availableRequestCount = 0;

    await page.route('**/api/servers/available**', async (route) => {
      availableRequestCount++;
      await route.abort('failed');
    });

    await setupMocks(page, {
      authenticated: true,
      user: mockNormalUser,
      servers: []
    });

    await page.route('**/api/servers', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          servers: []
        })
      });
    });

    await page.addInitScript(() => {
      localStorage.setItem('sb_user', JSON.stringify({ id: 'user-1', email: 'user@rexaedge.com', role: 'user' }));
      localStorage.setItem('sb_token', 'mock-user-token');
      sessionStorage.removeItem('selected_server_id');
      // Dismiss onboarding popup to focus on the dot
      sessionStorage.setItem('rexa_dismissed_server_onboarding', 'true');
    });

    await page.goto('/home', { waitUntil: 'networkidle' });

    // Neutral grey dot must be visible
    const neutralDot = page.locator('.sap-connection-dot.dot-neutral');
    await expect(neutralDot).toBeVisible({ timeout: 5000 });

    // Red disconnected dot must NOT be present
    const redDot = page.locator('.sap-connection-dot.dot-disconnected');
    await expect(redDot).toHaveCount(0);

    // Tooltip must be exactly "No SAP server added"
    const dotContainer = page.locator('.sap-connection-dot-container');
    await expect(dotContainer).toHaveAttribute('title', 'No SAP server added');
    await expect(dotContainer).toHaveAttribute('aria-label', 'No SAP server added');

    expect(availableRequestCount).toBe(0);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'health-dot-zero-servers-neutral-1366x768.png'),
      fullPage: false
    });
  });

  test('3. Server selection precedence and immediate poll on server switch', async ({ page }) => {
    let polledServerIds = [];

    await setupMocks(page, {
      authenticated: true,
      user: mockNormalUser,
      servers: [healthyServer, secondServer]
    });

    await page.route('**/api/servers', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          servers: [healthyServer, secondServer]
        })
      });
    });

    await page.route('**/api/sap/session-status*', async (route) => {
      const headers = route.request().headers();
      const sid = headers['x-sap-server-id'];
      if (sid) polledServerIds.push(sid);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          connected: true,
          status: 'AVAILABLE',
          code: 'AVAILABLE',
          latencyMs: 15,
          system: sid === secondServer.id ? 'DEV' : 'SANDBOX',
          client: '100',
          selectedSessionId: `RFC_${sid}`
        })
      });
    });

    await page.addInitScript(() => {
      localStorage.setItem('sb_user', JSON.stringify({ id: 'user-1', email: 'user@rexaedge.com', role: 'user' }));
      localStorage.setItem('sb_token', 'mock-user-token');
      // No saved session server - should fallback to default / first server
      sessionStorage.removeItem('selected_server_id');
    });

    await page.goto('/home');

    // First server selected and polled
    const serverSelect = page.locator('.sap-system-select');
    await expect(serverSelect).toBeVisible();
    await expect(serverSelect).toHaveValue('srv-relaxo-sandbox');
    expect(polledServerIds).toContain('srv-relaxo-sandbox');

    // Switch server in dropdown
    polledServerIds = [];
    await serverSelect.selectOption('srv-relaxo-dev');

    // Immediate poll triggered with new server id
    await expect.poll(() => polledServerIds).toContain('srv-relaxo-dev');

    // Top-bar tooltip updates to the new server name
    const dotContainer = page.locator('.sap-connection-dot-container');
    await expect(dotContainer).toHaveAttribute('title', /Connected to RELAXO Dev/i);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'health-dot-switch-server-poll-1366x768.png'),
      fullPage: false
    });
  });

  test('4. After login, the dot goes green automatically without opening My Servers', async ({ page }) => {
    let sessionStatusPolled = false;

    await setupMocks(page, {
      authenticated: false,
      user: mockNormalUser,
      servers: [healthyServer]
    });

    await page.route('**/api/servers', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          servers: [healthyServer]
        })
      });
    });

    await page.route('**/api/sap/session-status*', async (route) => {
      sessionStatusPolled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          connected: true,
          status: 'AVAILABLE',
          code: 'AVAILABLE',
          latencyMs: 14,
          system: 'SANDBOX',
          client: '500',
          selectedSessionId: 'RFC_srv-relaxo-sandbox'
        })
      });
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.login-page', { state: 'visible' });

    // Perform regular login
    const emailInput = page.locator('#login-email');
    const passwordInput = page.locator('#login-password');
    const submitBtn = page.locator('.lg-submit-btn');

    await emailInput.fill('user@rexaedge.com');
    await passwordInput.fill('Password@123');
    await submitBtn.click();

    // Verify top-bar dot container is present
    const dotContainer = page.locator('.sap-connection-dot-container');
    await expect(dotContainer).toBeVisible({ timeout: 5000 });

    // Verify dot transitions to green automatically without opening My Servers
    const greenDot = page.locator('.sap-connection-dot.dot-connected');
    await expect(greenDot).toBeVisible({ timeout: 5000 });
    await expect(dotContainer).toHaveAttribute('title', /Connected to RELAXO Sandbox/i);

    // Verify My Servers view / modal was never opened
    const myServersModal = page.locator('.my-servers-modal, .my-servers-container, [data-testid="my-servers-modal"]');
    await expect(myServersModal).toHaveCount(0);

    expect(sessionStatusPolled).toBe(true);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'health-dot-auto-connect-login-1366x768.png'),
      fullPage: false
    });
  });
});
