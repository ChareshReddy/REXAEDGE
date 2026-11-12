import { test, expect } from '@playwright/test';
import { setupMocks } from './helpers/mockApi.js';
import path from 'path';

const SCREENSHOT_DIR = 'C:/Users/chare/.gemini/antigravity/brain/6fce99f3-5f59-4200-af87-677b5d74db10/screenshots';

test.describe('Home Page Restored Design Suite', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page, { authenticated: true, role: 'admin' });
    await page.goto('/home', { waitUntil: 'networkidle' });
    await page.waitForSelector('.rexa-home-page', { state: 'visible' });
    await page.waitForTimeout(200);
  });

  test('Home hero has no double layer / nested box, category chips filter correctly, module cards render, and no horizontal overflow', async ({ page }) => {
    const viewport = page.viewportSize();
    const vpSuffix = `${viewport.width}x${viewport.height}`;

    // 1. Excluded from shared fiori-ph PageHeader band (NO double layer / nested box)
    const fioriPh = page.locator('.fiori-ph');
    await expect(fioriPh).toHaveCount(0);

    // 2. Standalone hero renders with gradient, welcome text, connected server, status pill
    const hero = page.locator('.rx-home-hero');
    await expect(hero).toBeVisible();
    await expect(hero).toHaveCount(1);

    // Verify hero has no nested box / double layer
    await expect(hero.locator('.rx-home-hero')).toHaveCount(0);
    await expect(hero.locator('.fiori-ph')).toHaveCount(0);
    await expect(hero.locator('.rx-card, .sap-card')).toHaveCount(0);

    const heroBg = await hero.evaluate((el) => window.getComputedStyle(el).backgroundImage);
    expect(heroBg).toContain('gradient');

    const welcomeTitle = hero.locator('.rx-welcome-title');
    await expect(welcomeTitle).toContainText('Welcome back, Admin');

    const welcomeSubtitle = hero.locator('.rx-welcome-subtitle');
    await expect(welcomeSubtitle).toContainText('Connected to');

    const statusPill = hero.locator('.rx-hero-status-pill');
    await expect(statusPill).toBeVisible();
    await expect(statusPill).toContainText('Online');

    // 3. Category filter chips (All, Production Planning, Master Data, Procurement)
    const chipList = page.locator('.rx-category-chips');
    await expect(chipList).toBeVisible();
    const chips = chipList.locator('button[role="tab"]');
    await expect(chips).toHaveCount(4);

    // Verify default 'All' state
    const allChip = chips.first();
    await expect(allChip).toHaveAttribute('aria-selected', 'true');
    const cards = page.locator('.rx-modules-grid .rx-module-card');
    await expect(cards).toHaveCount(5);

    // 4. Test filtering: click Production Planning
    const ppChip = chips.nth(1);
    await ppChip.click();
    await expect(ppChip).toHaveAttribute('aria-selected', 'true');
    await expect(cards).toHaveCount(3);

    // Click back to All
    await allChip.click();
    await expect(cards).toHaveCount(5);

    // 5. Sections: "Available modules" and "Coming soon"
    const availSection = page.locator('.rx-available-section');
    const soonSection = page.locator('.rx-coming-soon-section');
    await expect(availSection).toBeVisible();
    await expect(soonSection).toBeVisible();

    // 6. No horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);

    // Capture screenshot at target resolution
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `home-${vpSuffix}.png`),
      fullPage: false
    });
  });
});
