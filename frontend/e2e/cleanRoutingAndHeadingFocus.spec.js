import { test, expect } from '@playwright/test';
import { setupMocks, mockAdminUser } from './helpers/mockApi.js';

test.describe('Clean Routing & Heading Focus Verification', () => {

  test('1. Logged out + protected URL redirects to clean /signin (no returnTo query string)', async ({ page }) => {
    await setupMocks(page, { authenticated: false });

    // Navigate to a protected URL
    await page.goto('/products/bom', { waitUntil: 'networkidle' });
    await page.waitForSelector('.login-page', { state: 'visible' });

    // URL must be strictly /signin with NO query string
    expect(page.url()).toMatch(/\/signin$/);
    const parsed = new URL(page.url());
    expect(parsed.pathname).toBe('/signin');
    expect(parsed.search).toBe('');

    // Verify sessionStorage has saved the intended URL
    const savedIntended = await page.evaluate(() => sessionStorage.getItem('rexa_intended_url'));
    expect(savedIntended).toBe('/products/bom');

    // Perform successful login
    await page.fill('#login-email', 'admin@rexaedge.com');
    await page.fill('#login-password', 'correct-password');
    await page.click('button[type="submit"]');

    // After login, user is routed back to the originally requested page
    await page.waitForURL('**/products/bom');
    expect(page.url()).toContain('/products/bom');
  });

  test('2. Logged out + root "/" redirects to clean /signin, and falls back to /home after login', async ({ page }) => {
    await setupMocks(page, { authenticated: false });

    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForSelector('.login-page', { state: 'visible' });

    // URL must be cleanly /signin with NO query string
    const parsed = new URL(page.url());
    expect(parsed.pathname).toBe('/signin');
    expect(parsed.search).toBe('');

    // Perform login
    await page.fill('#login-email', 'admin@rexaedge.com');
    await page.fill('#login-password', 'correct-password');
    await page.click('button[type="submit"]');

    // After login, falls back to /home
    await page.waitForURL('**/home');
    expect(page.url()).toContain('/home');
  });

  test('3. Logged in user visiting /signin redirects to /home', async ({ page }) => {
    await setupMocks(page, { authenticated: true, user: mockAdminUser });

    await page.goto('/signin', { waitUntil: 'networkidle' });
    await page.waitForURL('**/home');
    expect(page.url()).toContain('/home');
  });

  test('4. Unknown URLs show 404 page and do not redirect to /signin', async ({ page }) => {
    // Unauthenticated user
    await setupMocks(page, { authenticated: false });

    await page.goto('/some-nonexistent-unknown-page', { waitUntil: 'networkidle' });
    await page.waitForSelector('[aria-label="Page Not Found"]', { state: 'visible' });

    // Should NOT redirect to /signin; shows 404 page
    const parsed = new URL(page.url());
    expect(parsed.pathname).toBe('/some-nonexistent-unknown-page');
    await expect(page.locator('text=Page Not Found (404)')).toBeVisible();

    // The 404 page has NO shell header or sidebar when logged out
    await expect(page.locator('.sap-shell-header')).toHaveCount(0);
    await expect(page.locator('aside[aria-label="Application Sidebar"]')).toHaveCount(0);
  });

  test('5. Sign-in page renders only the sign-in UI (no sidebar, no header)', async ({ page }) => {
    await setupMocks(page, { authenticated: false });
    await page.goto('/signin', { waitUntil: 'networkidle' });
    await page.waitForSelector('.login-page', { state: 'visible' });

    // No shell header
    await expect(page.locator('.sap-shell-header')).toHaveCount(0);
    // No navigation sidebar
    await expect(page.locator('aside[aria-label="Application Sidebar"]')).toHaveCount(0);
    // Sign-in card and brand panel are present
    await expect(page.locator('.lg-card')).toBeVisible();
    await expect(page.locator('.lg-brand-panel')).toBeVisible();
  });

  test('6. "SAP operations hub" heading has NO focus outline / box on load or click', async ({ page }) => {
    await setupMocks(page, { authenticated: false });
    await page.goto('/signin', { waitUntil: 'networkidle' });
    await page.waitForSelector('.lg-headline', { state: 'visible' });

    const headline = page.locator('.lg-headline');
    await expect(headline).toHaveText('SAP operations hub');

    // Verify headline is NOT the active focused element on page load
    const isFocused = await headline.evaluate((el) => document.activeElement === el);
    expect(isFocused).toBe(false);

    // Verify computed outline is none
    const outline = await headline.evaluate((el) => window.getComputedStyle(el).outline);
    expect(outline).toMatch(/none|0px/);

    // Initial focus is on the Email input
    const emailInput = page.locator('#login-email');
    const isEmailFocused = await emailInput.evaluate((el) => document.activeElement === el);
    expect(isEmailFocused).toBe(true);

    // Clicking elsewhere does not box the headline
    await page.click('.lg-brand-footer');
    const stillNotFocused = await headline.evaluate((el) => document.activeElement === el);
    expect(stillNotFocused).toBe(false);
  });

  test('7. Keyboard Tab navigation still shows focus rings on inputs and buttons', async ({ page }) => {
    await setupMocks(page, { authenticated: false });
    await page.goto('/signin', { waitUntil: 'networkidle' });

    const emailInput = page.locator('#login-email');
    await emailInput.focus();

    // Check focus ring on input
    const inputStyles = await emailInput.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return { boxShadow: s.boxShadow, outline: s.outline };
    });
    expect(inputStyles.boxShadow !== 'none' || inputStyles.outline !== 'none').toBe(true);

    // Tab to password input
    await page.keyboard.press('Tab');
    const passInput = page.locator('#login-password');
    const isPassFocused = await passInput.evaluate((el) => document.activeElement === el);
    expect(isPassFocused).toBe(true);

    // Tab to toggle eye button
    await page.keyboard.press('Tab');
    const toggleEye = page.locator('.lg-toggle-eye');
    const isEyeFocused = await toggleEye.evaluate((el) => document.activeElement === el);
    expect(isEyeFocused).toBe(true);
    const eyeOutline = await toggleEye.evaluate((el) => window.getComputedStyle(el).outline);
    expect(eyeOutline !== 'none').toBe(true);

    // Tab to submit button
    await page.keyboard.press('Tab');
    const submitBtn = page.locator('.lg-submit-btn');
    const isBtnFocused = await submitBtn.evaluate((el) => document.activeElement === el);
    expect(isBtnFocused).toBe(true);
    const btnOutline = await submitBtn.evaluate((el) => window.getComputedStyle(el).outline);
    expect(btnOutline !== 'none').toBe(true);
  });

});
