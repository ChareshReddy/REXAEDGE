import { test, expect } from '@playwright/test';
import { setupMocks } from './helpers/mockApi.js';

/**
 * Asserts that the leading icon right edge + 8px <= input content/text start (computed padding-left).
 * Also verifies that placeholder & typed text have at least an 8px gap after the icon.
 */
async function assertIconTextSpacing(inputLocator, iconLocator) {
  await expect(inputLocator).toBeVisible();
  await expect(iconLocator).toBeVisible();

  const iconBox = await iconLocator.boundingBox();
  const inputBox = await inputLocator.boundingBox();

  expect(iconBox).toBeTruthy();
  expect(inputBox).toBeTruthy();

  const paddingLeft = await inputLocator.evaluate((el) => {
    return parseFloat(window.getComputedStyle(el).paddingLeft) || 0;
  });

  // Icon right edge relative to the input's left coordinate
  const iconRightRelativeToInput = (iconBox.x + iconBox.width) - inputBox.x;

  // Requirement: icon right edge + 8px <= input content/text start (computed padding-left)
  expect(iconRightRelativeToInput + 8).toBeLessThanOrEqual(paddingLeft);
  expect(paddingLeft).toBeGreaterThanOrEqual(40);
}

test.describe('Search & Leading Icon Input Geometry Suite', () => {
  test.beforeEach(async ({ page }) => {
    // Only test desktop viewports specified in requirements (1366x768, 1920x1080, 1024x768)
    const vp = page.viewportSize();
    if (vp && vp.width < 900) {
      test.skip();
    }
    await setupMocks(page, { authenticated: true, role: 'admin' });
  });

  test('Top-bar search pill: 16px icon and >= 8px gap before text', async ({ page }) => {
    await page.goto('/home', { waitUntil: 'networkidle' });
    const searchPill = page.locator('.rx-topbar-search-btn');
    await expect(searchPill).toBeVisible();

    const icon = searchPill.locator('svg').first();
    const text = searchPill.locator('.rx-topbar-search-text');
    await expect(icon).toBeVisible();
    await expect(text).toBeVisible();

    const iconBox = await icon.boundingBox();
    const textBox = await text.boundingBox();
    expect(iconBox).toBeTruthy();
    expect(textBox).toBeTruthy();

    expect(iconBox.width).toBeCloseTo(16, 0);
    expect(iconBox.height).toBeCloseTo(16, 0);

    const gap = textBox.x - (iconBox.x + iconBox.width);
    expect(gap).toBeGreaterThanOrEqual(8);
  });

  test('Admin Users search input: icon spacing, typing, and clear button', async ({ page }) => {
    await page.goto('/admin/users', { waitUntil: 'networkidle' });
    await page.waitForSelector('.rx-search-input-wrapper', { state: 'visible' });

    const input = page.locator('input[placeholder="Search users..."]');
    const wrapper = input.locator('xpath=ancestor::*[@class and contains(@class, "rx-search-input-wrapper")]');
    const icon = wrapper.locator('.rx-search-input-leading-icon, svg').first();

    await assertIconTextSpacing(input, icon);

    // Verify height is standard form height (40px)
    const inputHeight = await input.evaluate((el) => parseFloat(window.getComputedStyle(el).height));
    expect(inputHeight).toBeCloseTo(40, 1);

    // Type text and verify clear button appears and works
    await input.fill('admin');
    const clearBtn = wrapper.locator('.rx-search-input-clear-btn');
    await expect(clearBtn).toBeVisible();

    // Clear button clears the text
    await clearBtn.click();
    await expect(input).toHaveValue('');
    await expect(clearBtn).not.toBeVisible();
  });

  test('Admin Servers search input: icon spacing, typing, and clear button', async ({ page }) => {
    await page.goto('/admin/servers', { waitUntil: 'networkidle' });
    await page.waitForSelector('.rx-search-input-wrapper', { state: 'visible' });

    const input = page.locator('input[placeholder="Search servers..."]');
    const wrapper = input.locator('xpath=ancestor::*[@class and contains(@class, "rx-search-input-wrapper")]');
    const icon = wrapper.locator('.rx-search-input-leading-icon, svg').first();

    await assertIconTextSpacing(input, icon);

    // Verify height is 40px
    const inputHeight = await input.evaluate((el) => parseFloat(window.getComputedStyle(el).height));
    expect(inputHeight).toBeCloseTo(40, 1);

    // Type text and test clear button
    await input.fill('DEV');
    const clearBtn = wrapper.locator('.rx-search-input-clear-btn');
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();
    await expect(input).toHaveValue('');
  });

  test('Admin Permissions search input: icon spacing, typing, and clear button', async ({ page }) => {
    await page.goto('/admin/permissions', { waitUntil: 'networkidle' });
    await page.waitForSelector('.rx-search-input-wrapper', { state: 'visible' });

    const input = page.locator('input[placeholder="Search permissions..."]');
    const wrapper = input.locator('xpath=ancestor::*[@class and contains(@class, "rx-search-input-wrapper")]');
    const icon = wrapper.locator('.rx-search-input-leading-icon, svg').first();

    await assertIconTextSpacing(input, icon);

    // Verify height is 40px
    const inputHeight = await input.evaluate((el) => parseFloat(window.getComputedStyle(el).height));
    expect(inputHeight).toBeCloseTo(40, 1);

    // Type text and test clear
    await input.fill('bom');
    const clearBtn = wrapper.locator('.rx-search-input-clear-btn');
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();
    await expect(input).toHaveValue('');
  });

  test('Admin Logs search input: icon spacing, typing, and clear button', async ({ page }) => {
    await page.goto('/admin/logs/audit', { waitUntil: 'networkidle' });
    await page.waitForSelector('.rx-search-input-wrapper', { state: 'visible' });

    const input = page.locator('input[placeholder*="Search target"], input[placeholder*="Search ref"]').first();
    const wrapper = input.locator('xpath=ancestor::*[@class and contains(@class, "rx-search-input-wrapper")]');
    const icon = wrapper.locator('.rx-search-input-leading-icon, svg').first();

    await assertIconTextSpacing(input, icon);

    // Verify height is 40px
    const inputHeight = await input.evaluate((el) => parseFloat(window.getComputedStyle(el).height));
    expect(inputHeight).toBeCloseTo(40, 1);

    // Type text and test clear
    await input.fill('LOGIN');
    const clearBtn = wrapper.locator('.rx-search-input-clear-btn');
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();
    await expect(input).toHaveValue('');
  });

  test('F4 Popup search input: 34px popup height, icon spacing, and clear button', async ({ page }) => {
    await page.goto('/products/bom/create/single', { waitUntil: 'networkidle' });
    await page.waitForSelector('#createBomMaterial', { state: 'visible' });

    // Open Material F4 popup
    const matContainer = page.locator('#createBomMaterial').locator('..');
    const f4Btn = matContainer.locator('button.rx-value-help-btn, button[title*="F4"], button[aria-label="Search help"]');
    await f4Btn.click();

    // In Restrict dialog, click Continue to reach Results modal
    const continueBtn = page.locator('.sap-restrict-btn-continue, button:has-text("Continue")').first();
    await expect(continueBtn).toBeVisible({ timeout: 5000 });
    await continueBtn.click();

    // Material Results Modal
    const matDialog = page.locator('.sap-f4-modal-dialog.material');
    await expect(matDialog).toBeVisible({ timeout: 5000 });

    const input = matDialog.locator('input[data-slot="search-input"], .rx-search-input');
    await expect(input).toBeVisible();
    await page.waitForTimeout(200);

    const wrapper = input.locator('xpath=ancestor::*[@class and contains(@class, "rx-search-input-wrapper")]');
    const icon = wrapper.locator('.rx-search-input-leading-icon, svg').first();

    await assertIconTextSpacing(input, icon);

    // Assert popup height is 34px (var(--size-popup-input-height))
    const inputHeight = await input.evaluate((el) => parseFloat(window.getComputedStyle(el).height));
    expect(inputHeight).toBeCloseTo(34, 1);

    // Type and test clear
    await input.fill('MAT001');
    const clearBtn = wrapper.locator('.rx-search-input-clear-btn');
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();
    await expect(input).toHaveValue('');
  });

  test('BOM Explorer table filter search input: icon spacing and clear button', async ({ page }) => {
    await page.goto('/products/bom/display', { waitUntil: 'networkidle' });
    await page.waitForSelector('#expMaterial', { state: 'visible' });

    // Fill form and submit to see BOM components table
    await page.fill('#expMaterial', 'A1BH0214C');
    await page.fill('#expPlant', '1010');

    const submitBtn = page.locator('button[type="submit"]:has-text("Display BOM")');
    await submitBtn.click();

    // Wait for components table toolbar filter
    const filterInput = page.locator('input[placeholder="Filter components..."]');
    await expect(filterInput).toBeVisible({ timeout: 8000 });

    const wrapper = filterInput.locator('xpath=ancestor::*[@class and contains(@class, "rx-search-input-wrapper")]');
    const icon = wrapper.locator('.rx-search-input-leading-icon, svg').first();

    await assertIconTextSpacing(filterInput, icon);

    // Verify table input height (32px)
    const inputHeight = await filterInput.evaluate((el) => parseFloat(window.getComputedStyle(el).height));
    expect(inputHeight).toBeCloseTo(32, 1);

    // Type and test clear
    await filterInput.fill('Bolt');
    const clearBtn = wrapper.locator('.rx-search-input-clear-btn');
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();
    await expect(filterInput).toHaveValue('');
  });
});
