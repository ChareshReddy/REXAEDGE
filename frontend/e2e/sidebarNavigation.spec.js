import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { setupMocks } from './helpers/mockApi.js';
import { assertNoHorizontalScroll, assertNoFixedOverlap } from './helpers/layoutAssertions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const screenshotsDir = path.resolve(__dirname, '../screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

test.describe('RexaEdge Topbar Hamburger, Sidebar Width & Label Integrity Suite', () => {
  test('Desktop (>= 900px): No Hamburger, Left-Aligned Logo, 240px/72px Sidebar, No Label Truncation', async ({ page }, testInfo) => {
    const vp = testInfo.project.name;
    const viewportWidth = page.viewportSize()?.width || 1366;

    // Skip on mobile project for this desktop test
    if (viewportWidth < 900) {
      test.skip();
      return;
    }

    await setupMocks(page, { authenticated: true });
    await page.goto('/home', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.rx-sidebar', { state: 'visible', timeout: 8000 });

    const contextLabel = `Desktop Sidebar at ${vp}`;

    // 1. Assert NO hamburger icon to left of logo on desktop (>= 900px)
    const topbarHamburger = page.locator('.rx-topbar-sidebar-toggle');
    await expect(topbarHamburger).toBeHidden();

    // 2. Assert logo is visible and left-aligned
    const brandLogo = page.locator('.sap-brand-logo-img').first();
    await expect(brandLogo).toBeVisible();
    const logoBox = await brandLogo.boundingBox();
    expect(logoBox).not.toBeNull();
    // Logo should be positioned at the left gutter (around 32px padding)
    expect(logoBox.x).toBeLessThanOrEqual(48);

    // 3. Assert initial sidebar width is 240px (expanded)
    const sidebar = page.locator('.rx-sidebar');
    await expect(sidebar).toBeVisible();
    const sidebarBox = await sidebar.boundingBox();
    expect(sidebarBox).not.toBeNull();
    expect(Math.round(sidebarBox.width)).toBe(240);

    // 4. Assert all sidebar item labels are NOT truncated (scrollWidth <= clientWidth)
    const labelChecks = await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll('.rx-sidebar-item-label'));
      const results = [];
      for (const el of labels) {
        const text = el.textContent.trim();
        const clientW = el.clientWidth;
        const scrollW = el.scrollWidth;
        // scrollWidth can exceed clientWidth by at most 1px due to subpixel font antialiasing
        const isTruncated = scrollW > Math.ceil(clientW) + 1;
        results.push({ text, clientW, scrollW, isTruncated });
      }
      return results;
    });

    console.log(`[${vp}] Evaluated ${labelChecks.length} sidebar item labels:`, labelChecks);

    // Verify key labels specifically
    const deleteBomCheck = labelChecks.find(l => l.text === 'Delete BOM');
    expect(deleteBomCheck).toBeDefined();
    expect(deleteBomCheck.isTruncated).toBe(false);

    const bomMgmtCheck = labelChecks.find(l => l.text === 'BOM management');
    expect(bomMgmtCheck).toBeDefined();
    expect(bomMgmtCheck.isTruncated).toBe(false);

    const permissionsCheck = labelChecks.find(l => l.text === 'Permissions');
    expect(permissionsCheck).toBeDefined();
    expect(permissionsCheck.isTruncated).toBe(false);

    // None of the labels should be truncated
    const truncatedLabels = labelChecks.filter(l => l.isTruncated);
    expect(truncatedLabels).toHaveLength(0);

    // 5. Assert "Delete BOM" has small amber dot with Tooltip "Destructive operation"
    const destructiveDot = page.locator('.rx-destructive-dot').first();
    await expect(destructiveDot).toBeVisible();
    const dotTitle = await destructiveDot.getAttribute('title');
    expect(dotTitle).toBe('Destructive operation');
    const dotColor = await destructiveDot.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    // var(--color-warning) is #B45309 -> rgb(180, 83, 9)
    expect(dotColor).toBe('rgb(180, 83, 9)');

    // 6. Assert "System" group label is removed
    const systemSectionHeader = page.locator('.rx-sidebar div:text-is("System")');
    await expect(systemSectionHeader).toHaveCount(0);

    // 7. Test Sidebar Collapse control (bottom of sidebar)
    const collapseBtn = page.locator('button[title*="sidebar"], button[aria-label*="sidebar"]').last();
    await expect(collapseBtn).toBeVisible();
    await collapseBtn.click();
    await page.waitForTimeout(300);

    // Collapsed width must be 72px
    const collapsedBox = await sidebar.boundingBox();
    expect(Math.round(collapsedBox.width)).toBe(72);

    // Expand sidebar back
    await collapseBtn.click();
    await page.waitForTimeout(300);
    const reExpandedBox = await sidebar.boundingBox();
    expect(Math.round(reExpandedBox.width)).toBe(240);

    // 8. Assert No Horizontal Scroll and No Fixed Overlap
    await assertNoHorizontalScroll(page, contextLabel);
    await assertNoFixedOverlap(page, contextLabel);

    // Save Desktop Screenshot
    await page.screenshot({
      path: path.join(screenshotsDir, `sidebar-desktop-${vp}.png`),
      fullPage: true
    });
  });

  test('Mobile (< 900px): Hamburger Present, Opens Mobile Drawer, No Horizontal Scroll', async ({ page }, testInfo) => {
    const vp = testInfo.project.name;
    const viewportWidth = page.viewportSize()?.width || 390;

    // Only run on mobile/narrow projects (< 900px)
    if (viewportWidth >= 900) {
      test.skip();
      return;
    }

    await setupMocks(page, { authenticated: true });
    await page.goto('/home', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.sap-app-root', { state: 'visible', timeout: 8000 });

    const contextLabel = `Mobile Navigation at ${vp}`;

    // 1. Assert hamburger icon IS visible on mobile (< 900px)
    const topbarHamburger = page.locator('.rx-topbar-sidebar-toggle');
    await expect(topbarHamburger).toBeVisible();

    // 2. Assert No Horizontal Scroll initially
    await assertNoHorizontalScroll(page, contextLabel);

    // 3. Click hamburger icon to open the mobile drawer
    await topbarHamburger.click();
    await page.waitForTimeout(350);

    // 4. Assert sidebar mobile drawer is open
    const openSidebar = page.locator('.rx-sidebar.rx-sidebar-mobile-open');
    await expect(openSidebar).toBeVisible();

    // Verify drawer width is 280px (or fills viewport width up to 85vw)
    const drawerBox = await openSidebar.boundingBox();
    expect(drawerBox).not.toBeNull();
    expect(drawerBox.width).toBeGreaterThanOrEqual(260);
    expect(drawerBox.x).toBe(0); // Slid into view at left: 0

    // Save Mobile Drawer Screenshot
    await page.screenshot({
      path: path.join(screenshotsDir, `sidebar-mobile-drawer-${vp}.png`),
      fullPage: false
    });

    // 5. Assert mobile backdrop is rendered
    const backdrop = page.locator('.rx-sidebar-mobile-backdrop');
    await expect(backdrop).toBeVisible();

    // 6. Click backdrop to close drawer
    await backdrop.click({ force: true });
    await page.waitForTimeout(350);

    // Assert drawer is no longer open
    await expect(page.locator('.rx-sidebar.rx-sidebar-mobile-open')).toHaveCount(0);

    // Save Clean Mobile Screenshot
    await page.screenshot({
      path: path.join(screenshotsDir, `sidebar-mobile-${vp}.png`),
      fullPage: false
    });
  });
});
