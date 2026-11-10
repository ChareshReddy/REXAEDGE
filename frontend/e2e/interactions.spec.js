import { test, expect } from '@playwright/test';
import { setupMocks } from './helpers/mockApi.js';
import AxeBuilder from '@axe-core/playwright';

test.describe('RexaEdge Layout Shift, Focus Ring & Console Error Suite', () => {
  // 1. Login error shift test
  test('Login error notification causes zero layout shift', async ({ page }) => {
    await setupMocks(page, { authenticated: false });
    await page.goto('/signin', { waitUntil: 'networkidle' });

    const card = page.locator('.login-card, .rx-card, form').first();
    await expect(card).toBeVisible();

    const boxBefore = await card.boundingBox();
    expect(boxBefore).not.toBeNull();

    // Trigger failed login
    await page.fill('input[type="email"], #loginEmail, input[placeholder*="email"]', 'admin@rexaedge.com');
    await page.fill('input[type="password"], #loginPassword, input[placeholder*="password"]', 'wrong-password');
    await page.click('button[type="submit"]');

    // Wait for error notice to appear
    await page.waitForTimeout(500);

    const boxAfter = await card.boundingBox();
    expect(boxAfter).not.toBeNull();

    // The login card position (x, y) should not jump unexpectedly
    expect(Math.abs(boxAfter.x - boxBefore.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(boxAfter.y - boxBefore.y)).toBeLessThanOrEqual(1);
  });

  // 2. Toast error does not shift main page content
  test('Toast notification does not cause layout shift', async ({ page }) => {
    await setupMocks(page, { authenticated: true });
    await page.goto('/dev/design-system', { waitUntil: 'networkidle' });

    const mainHeader = page.locator('h1').first();
    await expect(mainHeader).toBeVisible();

    const beforeBox = await mainHeader.boundingBox();
    expect(beforeBox).not.toBeNull();

    // Trigger toast in design system showcase or via toast context
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('rexaedge:toast', { detail: { type: 'error', message: 'Test notification' } }));
    });
    await page.waitForTimeout(400);

    const afterBox = await mainHeader.boundingBox();
    expect(afterBox).not.toBeNull();

    expect(Math.abs(afterBox.x - beforeBox.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(afterBox.y - beforeBox.y)).toBeLessThanOrEqual(0.5);
  });

  // 3. Focus rings visible on inputs, buttons, and F4 trigger
  test('Focus rings are visible on keyboard tab-focus', async ({ page }) => {
    await setupMocks(page, { authenticated: true });
    await page.goto('/products/bom/create/single', { waitUntil: 'networkidle' });
    await page.waitForSelector('#createBomAlt', { state: 'visible' });

    // Focus input
    const input = page.locator('#createBomAlt');
    await input.focus();
    const inputFocus = await input.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return {
        boxShadow: s.boxShadow,
        outline: s.outline,
        borderColor: s.borderColor
      };
    });
    expect(inputFocus.boxShadow !== 'none' || inputFocus.outline !== 'none').toBeTruthy();

    // Focus F4 button container
    const f4Btn = page.locator('.rx-value-help-btn').first();
    await f4Btn.focus();
    const btnFocus = await f4Btn.evaluate((el) => {
      const container = el.closest('.rx-value-help-container');
      const s = container ? window.getComputedStyle(container) : window.getComputedStyle(el);
      return {
        boxShadow: s.boxShadow,
        outline: s.outline,
        borderColor: s.borderColor
      };
    });
    expect(btnFocus.boxShadow !== 'none' || btnFocus.outline !== 'none').toBeTruthy();
  });

  // 4. Accessibility & Axe WCAG AA audit on Create BOM single
  test('Create BOM single WCAG AA compliance audit', async ({ page }) => {
    await setupMocks(page, { authenticated: true });
    await page.goto('/products/bom/create/single', { waitUntil: 'networkidle' });

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    // Assert zero critical accessibility violations
    const criticalViolations = accessibilityScanResults.violations.filter(v => v.impact === 'critical');
    expect(criticalViolations).toEqual([]);
  });

  // 5. Console errors & unmocked network request check
  test('Zero console errors and zero failed unmocked network requests across navigation', async ({ page }) => {
    const consoleErrors = [];
    const failedRequests = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore known benign React dev hydration or favicon warnings
        if (!text.includes('favicon.ico') && !text.includes('Download the React DevTools')) {
          consoleErrors.push(text);
        }
      }
    });

    page.on('requestfailed', (req) => {
      failedRequests.push(`${req.method()} ${req.url()}`);
    });

    await setupMocks(page, { authenticated: true });
    await page.goto('/home', { waitUntil: 'networkidle' });
    await page.goto('/products/bom', { waitUntil: 'networkidle' });
    await page.goto('/products/bom/create/single', { waitUntil: 'networkidle' });

    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
  });
});
