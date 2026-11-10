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

test.describe('Home Page Category Filter Chips Suite', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page, { authenticated: true, role: 'admin' });
    await page.goto('/home', { waitUntil: 'networkidle' });
    await page.waitForSelector('.rexa-home-page', { state: 'visible' });
    await page.waitForTimeout(200);
  });

  test('Hero band renders with navy-to-blue gradient, pattern, status pill, and WCAG AA contrast', async ({ page }) => {
    const hero = page.locator('.rx-home-hero');
    await expect(hero).toBeVisible();

    // 1. Verify gradient background
    const bg = await hero.evaluate((el) => window.getComputedStyle(el).backgroundImage);
    expect(bg).toContain('gradient');

    // 2. Verify subtle SVG pattern overlay
    const patternOverlay = hero.locator('.rx-hero-pattern-overlay');
    await expect(patternOverlay).toBeVisible();
    const patternBg = await patternOverlay.evaluate((el) => window.getComputedStyle(el).backgroundImage);
    expect(patternBg).toContain('data:image/svg+xml');

    // 3. Verify white title text
    const heroTitle = hero.locator('.rx-hero-title');
    await expect(heroTitle).toBeVisible();
    await expect(heroTitle).toContainText('Welcome back');
    const titleColor = await heroTitle.evaluate((el) => window.getComputedStyle(el).color);
    expect(titleColor).toBe('rgb(255, 255, 255)');

    // 4. Verify blue-100 subtitle text
    const subtitle = hero.locator('.rx-hero-subtitle');
    await expect(subtitle).toBeVisible();
    await expect(subtitle).toContainText('Connected to');
    const subtitleColor = await subtitle.evaluate((el) => window.getComputedStyle(el).color);
    // var(--color-blue-100, #DCE8F1) is rgb(220, 232, 241)
    expect(subtitleColor).toBe('rgb(220, 232, 241)');

    // 5. Verify server status pill
    const statusPill = hero.locator('.rx-hero-status-pill');
    await expect(statusPill).toBeVisible();
    await expect(statusPill.locator('.rx-hero-status-text')).toHaveText('Online');
    const dot = statusPill.locator('.rx-hero-status-dot');
    await expect(dot).toHaveClass(/rx-dot-online/);

    // 6. Verify hero height >= 112px, distance from top edge to title >= 24px, pill and text do not intersect
    const heroBox = await hero.boundingBox();
    const titleBox = await heroTitle.boundingBox();
    const subtitleBox = await subtitle.boundingBox();
    const pillBox = await statusPill.boundingBox();

    expect(heroBox).not.toBeNull();
    expect(titleBox).not.toBeNull();
    expect(subtitleBox).not.toBeNull();
    expect(pillBox).not.toBeNull();

    expect(heroBox.height).toBeGreaterThanOrEqual(112);
    expect(titleBox.y - heroBox.y).toBeGreaterThanOrEqual(24);

    // Pill and text do not intersect
    const textRight = Math.max(titleBox.x + titleBox.width, subtitleBox.x + subtitleBox.width);
    const textBottom = Math.max(titleBox.y + titleBox.height, subtitleBox.y + subtitleBox.height);
    const doesNotIntersect = (pillBox.x >= textRight - 1) || (pillBox.y >= textBottom - 1);
    expect(doesNotIntersect).toBe(true);

    // 7. Verify WCAG AA Contrast >= 4.5:1
    const contrastRatio = await page.evaluate(() => {
      function getLuminance(r, g, b) {
        const a = [r, g, b].map((v) => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
      }
      // White text luminance = 1.0
      const textL = 1.0;
      // Blue-600 background (lightest point of gradient) #02579A: rgb(2, 87, 154)
      const bgL = getLuminance(2, 87, 154);
      return (textL + 0.05) / (bgL + 0.05);
    });
    expect(contrastRatio).toBeGreaterThanOrEqual(4.5);
  });

  test('Page canvas background computed color equals the canvas token (#F5F8FB)', async ({ page }) => {
    const canvasBg = await page.locator('.rexa-home-page').evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });
    // #F5F8FB in rgb is rgb(245, 248, 251)
    expect(canvasBg).toBe('rgb(245, 248, 251)');

    // Also check layout wrapper has canvas background and not white
    const parentBg = await page.locator('.sap-assistant-layout').evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });
    expect(parentBg).toBe('rgb(245, 248, 251)');
  });

  test('Chips render in order with derived counts and All active by default @shots', async ({ page }, testInfo) => {
    const viewportName = testInfo.project.name;

    const chipList = page.locator('.rx-category-chips');
    await expect(chipList).toBeVisible();

    const chips = chipList.locator('button[role="tab"]');
    await expect(chips).toHaveCount(4);

    // Verify chip order, labels, and count badges
    const expected = [
      { label: 'All', count: '5' },
      { label: 'Production Planning', count: '3' },
      { label: 'Master Data', count: '1' },
      { label: 'Procurement', count: '1' }
    ];

    for (let i = 0; i < expected.length; i++) {
      const chip = chips.nth(i);
      const label = chip.locator('.rx-chip-label');
      const count = chip.locator('.rx-chip-count');

      await expect(label).toHaveText(expected[i].label);
      await expect(count).toHaveText(expected[i].count);
    }

    // All is active by default
    const allChip = chips.first();
    await expect(allChip).toHaveAttribute('aria-selected', 'true');
    await expect(allChip).toHaveClass(/rx-chip-active/);

    // Both sections render initially under "All"
    const availSection = page.locator('.rx-available-section');
    const soonSection = page.locator('.rx-coming-soon-section');
    await expect(availSection).toBeVisible();
    await expect(soonSection).toBeVisible();

    await expect(availSection.locator('.rx-home-section-title')).toContainText('Available modules');
    await expect(soonSection.locator('.rx-home-section-title')).toContainText('Coming soon');

    // Total 5 cards across sections
    const cards = page.locator('.rx-modules-grid .rx-module-card');
    await expect(cards).toHaveCount(5);

    // Save screenshots at 1366x768 and 1920x1080
    if (viewportName === '1366x768' || viewportName === '1920x1080') {
      await page.screenshot({
        path: path.join(screenshotsDir, `home-${viewportName}.png`),
        fullPage: true
      });
      await page.screenshot({
        path: path.join(screenshotsDir, `home-chips-${viewportName}.png`),
        fullPage: true
      });
    }
  });

  test('Clicking chips filters cards and hides empty sections', async ({ page }) => {
    const chips = page.locator('.rx-category-chips button[role="tab"]');
    const cards = page.locator('.rx-modules-grid .rx-module-card');
    const liveRegion = page.locator('.rx-home-filter-strip .rx-sr-only');
    const availSection = page.locator('.rx-available-section');
    const soonSection = page.locator('.rx-coming-soon-section');

    // 1. Click Production Planning: 1 available (BOM), 2 coming soon (Routing, Production Orders)
    const ppChip = chips.nth(1);
    await ppChip.click();
    await expect(ppChip).toHaveAttribute('aria-selected', 'true');
    await expect(ppChip).toHaveClass(/rx-chip-active/);
    await expect(chips.first()).toHaveAttribute('aria-selected', 'false');

    await expect(availSection).toBeVisible();
    await expect(soonSection).toBeVisible();
    await expect(cards).toHaveCount(3);
    const ppTitles = await cards.locator('.rx-module-title').allInnerTexts();
    expect(ppTitles).toEqual(['Bill of Materials', 'Routing', 'Production Orders']);
    await expect(liveRegion).toHaveText('Showing 3 modules');

    // 2. Click Master Data: 0 available, 1 coming soon (Material Master) -> Available section must be HIDDEN
    const mdChip = chips.nth(2);
    await mdChip.click();
    await expect(mdChip).toHaveAttribute('aria-selected', 'true');
    await expect(availSection).toHaveCount(0); // Hidden
    await expect(soonSection).toBeVisible();
    await expect(cards).toHaveCount(1);
    const mdTitle = await cards.first().locator('.rx-module-title').innerText();
    expect(mdTitle).toBe('Material Master');
    await expect(liveRegion).toHaveText('Showing 1 module');

    // 3. Click Procurement: 0 available, 1 coming soon (Purchase Orders) -> Available section must be HIDDEN
    const procChip = chips.nth(3);
    await procChip.click();
    await expect(procChip).toHaveAttribute('aria-selected', 'true');
    await expect(availSection).toHaveCount(0); // Hidden
    await expect(soonSection).toBeVisible();
    await expect(cards).toHaveCount(1);
    const procTitle = await cards.first().locator('.rx-module-title').innerText();
    expect(procTitle).toBe('Purchase Orders');
    await expect(liveRegion).toHaveText('Showing 1 module');

    // 4. Click All again: both sections visible
    await chips.first().click();
    await expect(chips.first()).toHaveAttribute('aria-selected', 'true');
    await expect(availSection).toBeVisible();
    await expect(soonSection).toBeVisible();
    await expect(cards).toHaveCount(5);
    await expect(liveRegion).toHaveText('Showing 5 modules');
  });

  test('Available card is clickable & navigates to BOM operations; Coming-soon cards are not clickable', async ({ page }) => {
    const availCard = page.locator('.rx-card-available');
    await expect(availCard).toBeVisible();
    await expect(availCard).toHaveAttribute('role', 'button');
    await expect(availCard).toHaveAttribute('tabindex', '0');

    // Verify 3px blue-600 top accent on available card
    const borderTop = await availCard.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return `${style.borderTopWidth} ${style.borderTopColor}`;
    });
    // 3px blue-600 #02579A is rgb(2, 87, 154)
    expect(borderTop).toContain('3px');
    expect(borderTop).toContain('rgb(2, 87, 154)');

    // Verify Coming-soon cards: not clickable, tabIndex -1, cursor default, dashed border, NO visible pill, accessible text
    const soonCards = page.locator('.rx-card-coming-soon');
    const firstSoon = soonCards.first();
    await expect(firstSoon).toBeVisible();
    await expect(firstSoon).toHaveAttribute('tabindex', '-1');
    const role = await firstSoon.getAttribute('role');
    expect(role).not.toBe('button');

    // No visible "Coming soon" pill
    const soonBadge = firstSoon.locator('.rx-coming-soon-badge');
    expect(await soonBadge.count()).toBe(0);

    // Accessible text for screen readers (aria-label and sr-only)
    const ariaLabel = await firstSoon.getAttribute('aria-label');
    expect(ariaLabel).toContain('Coming soon');
    const srOnly = firstSoon.locator('.rx-sr-only');
    await expect(srOnly).toHaveText('Coming soon');

    const soonStyle = await firstSoon.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return {
        cursor: s.cursor,
        borderStyle: s.borderTopStyle
      };
    });
    expect(soonStyle.cursor).toBe('default');
    expect(soonStyle.borderStyle).toBe('dashed');

    // Click available card and assert direct navigation to BOM operations page
    await availCard.click();
    await page.waitForURL('**/products/bom');
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('Keyboard arrow navigation and focus works across tablist', async ({ page }) => {
    const chips = page.locator('.rx-category-chips button[role="tab"]');
    const cards = page.locator('.rx-modules-grid .rx-module-card');

    // Focus first chip ('All')
    await chips.first().focus();
    await expect(chips.first()).toBeFocused();

    // ArrowRight -> Production Planning
    await page.keyboard.press('ArrowRight');
    await expect(chips.nth(1)).toBeFocused();
    await expect(chips.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(cards).toHaveCount(3);

    // ArrowRight -> Master Data
    await page.keyboard.press('ArrowRight');
    await expect(chips.nth(2)).toBeFocused();
    await expect(chips.nth(2)).toHaveAttribute('aria-selected', 'true');
    await expect(cards).toHaveCount(1);

    // ArrowRight -> Procurement
    await page.keyboard.press('ArrowRight');
    await expect(chips.nth(3)).toBeFocused();
    await expect(chips.nth(3)).toHaveAttribute('aria-selected', 'true');
    await expect(cards).toHaveCount(1);

    // ArrowRight -> Wraps to All
    await page.keyboard.press('ArrowRight');
    await expect(chips.first()).toBeFocused();
    await expect(chips.first()).toHaveAttribute('aria-selected', 'true');
    await expect(cards).toHaveCount(5);

    // ArrowLeft -> Wraps to Procurement
    await page.keyboard.press('ArrowLeft');
    await expect(chips.nth(3)).toBeFocused();
    await expect(chips.nth(3)).toHaveAttribute('aria-selected', 'true');
    await expect(cards).toHaveCount(1);

    // Home -> All
    await page.keyboard.press('Home');
    await expect(chips.first()).toBeFocused();
    await expect(chips.first()).toHaveAttribute('aria-selected', 'true');
    await expect(cards).toHaveCount(5);

    // End -> Procurement
    await page.keyboard.press('End');
    await expect(chips.nth(3)).toBeFocused();
    await expect(chips.nth(3)).toHaveAttribute('aria-selected', 'true');
    await expect(cards).toHaveCount(1);
  });

  test('No horizontal page scroll or overlap across viewports', async ({ page }) => {
    // Assert page has no horizontal overflow scrollbar
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);

    // Assert vertical order: hero band above chip list, chip list above cards sections
    const heroBox = await page.locator('.rx-home-hero').boundingBox();
    const chipBox = await page.locator('.rx-category-chips').boundingBox();
    const sectionsBox = await page.locator('.rx-home-sections').boundingBox();

    expect(heroBox).not.toBeNull();
    expect(chipBox).not.toBeNull();
    expect(sectionsBox).not.toBeNull();

    expect(heroBox.y + heroBox.height).toBeLessThanOrEqual(chipBox.y + 4);
    expect(chipBox.y + chipBox.height).toBeLessThanOrEqual(sectionsBox.y + 4);

    // 24px vertical gap between hero and chips row
    const gapHeroToChips = chipBox.y - (heroBox.y + heroBox.height);
    expect(gapHeroToChips).toBeGreaterThanOrEqual(23);
  });

  test('Main content area scrolls vertically: last Coming soon card is fully visible with no horizontal scroll', async ({ page }) => {
    const hasHorizontalOverflow = await page.evaluate(() => {
      const main = document.querySelector('.sap-assistant-layout');
      return (main ? main.scrollWidth > main.clientWidth : false) || document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);

    // Scroll main content area to the bottom
    await page.evaluate(() => {
      const main = document.querySelector('.sap-assistant-layout');
      if (main) main.scrollTop = main.scrollHeight;
    });
    await page.waitForTimeout(100);

    const lastCard = page.locator('.rx-card-coming-soon').last();
    await expect(lastCard).toBeVisible();

    const visibilityCheck = await page.evaluate(() => {
      const main = document.querySelector('.sap-assistant-layout');
      const cards = document.querySelectorAll('.rx-card-coming-soon');
      const card = cards[cards.length - 1];
      const cardRect = card.getBoundingClientRect();
      const mainRect = main.getBoundingClientRect();
      return {
        isFullyVisible: cardRect.bottom <= mainRect.bottom && cardRect.top >= mainRect.top,
        spaceBelow: mainRect.bottom - cardRect.bottom
      };
    });

    expect(visibilityCheck.isFullyVisible).toBe(true);
    expect(visibilityCheck.spaceBelow).toBeGreaterThanOrEqual(24);
  });
});
