import { test, expect } from '@playwright/test';
import { setupMocks } from './helpers/mockApi.js';
import path from 'path';

const SCREENSHOT_DIR = 'C:/Users/chare/.gemini/antigravity/brain/6fce99f3-5f59-4200-af87-677b5d74db10/screenshots';

function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function parseRgb(rgbStr) {
  const match = rgbStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return [0, 0, 0];
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}

function getContrastRatio(rgbStr1, rgbStr2) {
  const [r1, g1, b1] = parseRgb(rgbStr1);
  const [r2, g2, b2] = parseRgb(rgbStr2);
  const l1 = getLuminance(r1, g1, b1);
  const l2 = getLuminance(r2, g2, b2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

test.describe('Add Component Primary Solid Button Suite', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page, { authenticated: true, role: 'admin' });
    await page.goto('/products/bom/create/single', { waitUntil: 'networkidle' });
    await page.waitForSelector('.rx-components-table', { state: 'visible' });
    await page.waitForTimeout(200);
  });

  test('Add Component button is solid primary navy, white text/icon, 32px height, 4px radius, no border/shadow, contrast >= 4.5:1 against band', async ({ page }) => {
    const viewport = page.viewportSize();
    const vpSuffix = `${viewport.width}x${viewport.height}`;

    const addBtn = page.locator('button.rx-btn-add-component, button.sap-btn-add-component, button:has-text("Add Component")').first();
    await expect(addBtn).toBeVisible();

    // 1. Computed background color equals primary navy token #00204E -> rgb(0, 32, 78)
    const btnBg = await addBtn.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(btnBg).toBe('rgb(0, 32, 78)');

    // 2. Text color is white -> rgb(255, 255, 255)
    const btnColor = await addBtn.evaluate((el) => window.getComputedStyle(el).color);
    expect(btnColor).toBe('rgb(255, 255, 255)');

    // 3. Icon color / stroke is white
    const icon = addBtn.locator('svg').first();
    await expect(icon).toBeVisible();
    const iconColor = await icon.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.stroke || style.color;
    });
    expect(iconColor).toBe('rgb(255, 255, 255)');

    // 4. Contrast against card header band (>= 4.5:1)
    const cardHeader = page.locator('.rx-form-section-header-tinted').filter({ hasText: 'Component Items' }).first();
    await expect(cardHeader).toBeVisible();
    const bandBg = await cardHeader.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    const contrastAgainstBand = getContrastRatio(btnBg, bandBg);
    expect(contrastAgainstBand).toBeGreaterThanOrEqual(4.5);

    // Also text contrast on button
    const contrastOnBtn = getContrastRatio(btnColor, btnBg);
    expect(contrastOnBtn).toBeGreaterThanOrEqual(4.5);

    // 5. Size: height 32px (+-1)
    const btnHeight = await addBtn.evaluate((el) => el.getBoundingClientRect().height);
    expect(Math.abs(btnHeight - 32)).toBeLessThanOrEqual(1.5);

    // 6. 4px radius
    const btnRadius = await addBtn.evaluate((el) => window.getComputedStyle(el).borderRadius);
    expect(btnRadius).toBe('4px');

    // 7. No border & flat (no shadow)
    const btnBorder = await addBtn.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return s.borderStyle === 'none' || s.borderWidth === '0px' || s.borderColor === s.backgroundColor;
    });
    expect(btnBorder).toBe(true);

    const btnShadow = await addBtn.evaluate((el) => window.getComputedStyle(el).boxShadow);
    expect(btnShadow).toBe('none');

    // 8. Initial component rows count
    const initialRows = await page.locator('.rx-components-table tbody tr').count();

    // 9. Click Add Component adds row
    await addBtn.click();
    await page.waitForTimeout(100);
    const afterRows = await page.locator('.rx-components-table tbody tr').count();
    expect(afterRows).toBe(initialRows + 1);

    // Capture screenshot at target resolution
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `create-single-bom-${vpSuffix}.png`),
      fullPage: false
    });
  });
});
