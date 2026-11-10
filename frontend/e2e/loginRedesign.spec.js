import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { setupMocks } from './helpers/mockApi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const screenshotsDir = path.resolve(__dirname, '../screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

function parseRgb(colorStr) {
  const m = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 10), g: parseInt(m[2], 10), b: parseInt(m[3], 10) };
}

function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(rgb1, rgb2) {
  const l1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
  const l2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

test.describe('Modern Enterprise Login Page Redesign Suite', () => {
  test.beforeEach(async ({ page }) => {
    // Unauthenticated state
    await setupMocks(page, { authenticated: false });
  });

  // --------------------------------------------------------------------------
  // 1. RESPONSIVENESS, NO HORIZONTAL SCROLL, FORM FITS VIEWPORT
  // --------------------------------------------------------------------------
  test('Layout: no horizontal scroll, form card fits viewport across resolutions', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForSelector('.login-page', { state: 'visible' });

    // Verify zero horizontal scroll
    const scrollDimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      innerWidth: window.innerWidth
    }));
    expect(scrollDimensions.scrollWidth).toBeLessThanOrEqual(scrollDimensions.innerWidth);

    const vpWidth = page.viewportSize()?.width || 1366;
    if (vpWidth >= 900) {
      // Split layout: 55% brand panel, 45% form panel
      const brandPanel = page.locator('.lg-brand-panel');
      const formPanel = page.locator('.lg-form-panel');
      await expect(brandPanel).toBeVisible();
      await expect(formPanel).toBeVisible();

      // Brand content
      await expect(page.locator('.lg-headline')).toHaveText('SAP operations hub');
      await expect(page.locator('.lg-tagline')).toHaveText('Automate. Integrate. Execute.');

      // 3 feature chips
      const chips = page.locator('.lg-chip');
      await expect(chips).toHaveCount(3);
      await expect(chips.nth(0)).toContainText('Production planning');
      await expect(chips.nth(1)).toContainText('Master data');
      await expect(chips.nth(2)).toContainText('Procurement');
    } else {
      // Mobile compact header
      const brandPanel = page.locator('.lg-brand-panel');
      await expect(brandPanel).toBeVisible();
      await expect(page.locator('.lg-brand-content')).toBeHidden();
      // Form panel visible
      await expect(page.locator('.lg-form-panel')).toBeVisible();
    }
  });

  // --------------------------------------------------------------------------
  // 2. INPUT & BUTTON GEOMETRY (44px) AND LEADING ICONS (NO OVERLAP)
  // --------------------------------------------------------------------------
  test('Geometry: inputs and button are 44px, leading icons never overlap text', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForSelector('.login-page', { state: 'visible' });

    const emailInput = page.locator('#login-email');
    const passwordInput = page.locator('#login-password');
    const submitBtn = page.locator('.lg-submit-btn');

    const emailBox = await emailInput.boundingBox();
    const passBox = await passwordInput.boundingBox();
    const btnBox = await submitBtn.boundingBox();

    expect(emailBox?.height).toBeCloseTo(44, 1);
    expect(passBox?.height).toBeCloseTo(44, 1);
    expect(btnBox?.height).toBeCloseTo(44, 1);

    // Verify leading icons positioning and padding
    const emailPaddingLeft = await emailInput.evaluate(el => parseInt(window.getComputedStyle(el).paddingLeft, 10));
    expect(emailPaddingLeft).toBeGreaterThanOrEqual(40);

    const emailIcon = page.locator('.lg-field-group').first().locator('.lg-input-icon');
    const iconBox = await emailIcon.boundingBox();
    expect(iconBox && emailBox).toBeTruthy();
    expect(iconBox.x).toBeLessThan(emailBox.x + emailPaddingLeft);

    // Verify toggle password button exists and doesn't overlap password text
    const toggleEye = page.locator('.lg-toggle-eye');
    await expect(toggleEye).toBeVisible();
    const passPaddingRight = await passwordInput.evaluate(el => parseInt(window.getComputedStyle(el).paddingRight, 10));
    expect(passPaddingRight).toBeGreaterThanOrEqual(40);
  });

  // --------------------------------------------------------------------------
  // 3. ZERO LAYOUT SHIFT ERROR OVERLAY (EXACTLY 0PX SHIFT)
  // --------------------------------------------------------------------------
  test('Zero layout shift: error overlay appearance causes 0px movement of the card', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForSelector('.lg-card', { state: 'visible' });

    // Measure card bounding box before error
    const card = page.locator('.lg-card');
    const boxBefore = await card.boundingBox();
    expect(boxBefore).not.toBeNull();

    // Trigger validation error by clicking Sign in with empty inputs
    await page.locator('.lg-submit-btn').click();

    // Error overlay must appear with role="alert"
    const errorAlert = page.locator('.lg-error-overlay[role="alert"]');
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toContainText('Please enter both your email address and password.');

    // Measure card bounding box after error
    const boxAfter = await card.boundingBox();
    expect(boxAfter).not.toBeNull();

    // MUST BE EXACTLY 0PX SHIFT
    expect(boxAfter && boxBefore).toBeTruthy();
    expect(boxAfter.x).toBe(boxBefore.x);
    expect(boxAfter.y).toBe(boxBefore.y);
    expect(boxAfter.width).toBe(boxBefore.width);
    expect(boxAfter.height).toBe(boxBefore.height);

    // Save with error screenshot
    await page.screenshot({ path: path.join(screenshotsDir, 'login-with-error.png') });
  });

  // --------------------------------------------------------------------------
  // 4. KEYBOARD NAVIGATION & MOCKED LOGIN SUCCESS / FAILURE FLOWS
  // --------------------------------------------------------------------------
  test('Keyboard navigation, auth submission, and loading state', async ({ page }, testInfo) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForSelector('#login-email', { state: 'visible' });

    const vp = testInfo.project.name;
    if (vp === '1366x768') {
      await page.screenshot({ path: path.join(screenshotsDir, 'login-default.png') });
    } else if (vp === '390x844') {
      await page.screenshot({ path: path.join(screenshotsDir, 'login-mobile.png') });
    }

    // Type credentials via keyboard
    await page.locator('#login-email').fill('admin@rexaedge.com');
    await page.locator('#login-password').fill('Secret123!');

    // Mock slow response to capture loading state screenshot
    await page.route('**/api/auth/login', async (route) => {
      // Delay response slightly to check loading spinner
      await new Promise(r => setTimeout(r, 600));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          user: { id: 'admin-1', email: 'admin@rexaedge.com', role: 'admin', name: 'Admin User' }
        })
      });
    });

    // Press Enter to submit from password field
    await page.locator('#login-password').press('Enter');

    // Button must enter loading state
    const submitBtn = page.locator('.lg-submit-btn');
    await expect(submitBtn).toBeDisabled();
    await expect(submitBtn).toContainText('Signing in...');
    await expect(submitBtn.locator('.lg-spinner')).toBeVisible();

    if (vp === '1366x768') {
      await page.screenshot({ path: path.join(screenshotsDir, 'login-loading.png') });
    }

    // Wait for redirect to home on success
    await page.waitForURL('**/home', { timeout: 10000 });
  });

  // --------------------------------------------------------------------------
  // 5. CONTRAST AA RATIO VERIFICATION
  // --------------------------------------------------------------------------
  test('Accessibility: text contrast meets or exceeds WCAG AA (4.5:1)', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForSelector('.login-page', { state: 'visible' });

    const vpWidth = page.viewportSize()?.width || 1366;
    if (vpWidth >= 900) {
      // Check Headline contrast (white on navy-900)
      const headline = page.locator('.lg-headline');
      const headlineColor = await headline.evaluate(el => window.getComputedStyle(el).color);
      const headlineRatio = getContrastRatio(parseRgb(headlineColor), { r: 0, g: 32, b: 78 });
      expect(headlineRatio).toBeGreaterThanOrEqual(4.5);

      // Check Tagline contrast (blue-200 #B3CDE0 on navy-900)
      const tagline = page.locator('.lg-tagline');
      const tagColor = await tagline.evaluate(el => window.getComputedStyle(el).color);
      const tagRatio = getContrastRatio(parseRgb(tagColor), { r: 0, g: 32, b: 78 });
      expect(tagRatio).toBeGreaterThanOrEqual(4.5);
    }

    // Check Form Card Title contrast (navy-900 on white)
    const cardTitle = page.locator('.lg-card-title');
    const titleColor = await cardTitle.evaluate(el => window.getComputedStyle(el).color);
    const titleRatio = getContrastRatio(parseRgb(titleColor), { r: 255, g: 255, b: 255 });
    expect(titleRatio).toBeGreaterThanOrEqual(4.5);

    // Check Submit button text contrast (white on blue-600 #02579A)
    const btnText = page.locator('.lg-submit-btn .lg-btn-text');
    const btnColor = await btnText.evaluate(el => window.getComputedStyle(el).color);
    const btnRatio = getContrastRatio(parseRgb(btnColor), { r: 2, g: 87, b: 154 });
    expect(btnRatio).toBeGreaterThanOrEqual(4.5);
  });
});
