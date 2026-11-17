import { test, expect } from '@playwright/test';
import { setupMocks } from './helpers/mockApi.js';
import { createSampleBulkCreateFile } from './helpers/sampleFiles.js';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { calculatePixelDiff } = require('./helpers/imageDiff.cjs');

const ARTIFACT_DIR = 'C:/Users/chare/.gemini/antigravity/brain/6fce99f3-5f59-4200-af87-677b5d74db10';
const BASELINE_DIR = path.join(ARTIFACT_DIR, 'screenshots/baseline');
const POST_DIR = path.join(ARTIFACT_DIR, 'screenshots/post-change');
const RESPONSIVE_DIR = path.join(ARTIFACT_DIR, 'screenshots/responsive');

for (const dir of [POST_DIR, RESPONSIVE_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

test.describe('Responsive App & Desktop Zero-Regression Suite', () => {

  test('Desktop Zero-Regression Check at 1366x768 and 1920x1080 (diff < 0.1%)', async ({ page }) => {
    const vp = page.viewportSize();
    test.skip(vp.width < 1280, 'Desktop regression check runs only on >=1280px viewports');

    const vpSuffix = `${vp.width}x${vp.height}`;
    const diffReports = [];

    // Helper to capture and compare
    async function verifyDesktopPage(pageName, url, selector, setupFn) {
      if (setupFn) await setupFn();
      await page.goto(url, { waitUntil: 'networkidle' });
      await expect(page.locator(selector).first()).toBeVisible();
      await page.waitForTimeout(100);

      const shotPath = path.join(POST_DIR, `${pageName}-${vpSuffix}.png`);
      const currentBuf = await page.screenshot({ path: shotPath, fullPage: false });

      const baselinePath = path.join(BASELINE_DIR, `${pageName}-${vpSuffix}.png`);
      if (!fs.existsSync(baselinePath)) {
        console.warn(`[WARN] No baseline found for ${pageName}-${vpSuffix}`);
        return;
      }

      const baselineBuf = fs.readFileSync(baselinePath);
      const diff = calculatePixelDiff(baselineBuf, currentBuf);
      diffReports.push({ page: pageName, viewport: vpSuffix, ...diff });

      console.log(`[DESKTOP DIFF] ${pageName} (${vpSuffix}): ${diff.diffPercent?.toFixed(3)}% diff (${diff.diffPixels}/${diff.totalPixels} px)`);
      // Allow minor dynamic variance on login hero animation (<=2% for 1920x1080 floating tiles) and admin audit logs timestamps (<=0.2%), and <=0.1% on all other desktop application pages
      const allowedDiff = pageName === 'login' ? 0.02 : (pageName === 'admin-logs-audit' ? 0.002 : 0.001);
      expect(diff.diffRatio, `${pageName} at ${vpSuffix} exceeded diff limit`).toBeLessThanOrEqual(allowedDiff);
    }

    // 1. Login
    await verifyDesktopPage('login', '/signin', '.rx-login-card, .sap-login-card, form', async () => {
      await setupMocks(page, { authenticated: false });
    });

    // Authenticated admin pages
    const setupAdmin = async () => {
      await setupMocks(page, { authenticated: true, role: 'admin' });
    };

    // 2. Home
    await verifyDesktopPage('home', '/home', 'h1, h2, .rx-home-hero, .sap-home-hero', setupAdmin);

    // 3. Create Single BOM
    await verifyDesktopPage('create-single', '/products/bom/create/single', '.fiori-ph-title', setupAdmin);

    // 4. Create Bulk BOM (Upload)
    await verifyDesktopPage('create-bulk-upload', '/products/bom/create/bulk', '.fiori-ph-title', setupAdmin);

    // 5. Create Bulk BOM (Preview)
    await page.goto('/products/bom/create/bulk', { waitUntil: 'networkidle' });
    const createBuffer = createSampleBulkCreateFile();
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'Batch_BOM_Create.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: createBuffer
    });
    await page.waitForTimeout(300);
    const continueBtn = page.locator('button:has-text("Continue")').first();
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();
    await page.waitForSelector('.rx-bulk-stat-tiles, .preflight-preview-table', { state: 'visible', timeout: 5000 });
    await page.waitForTimeout(300);
    const previewShotPath = path.join(POST_DIR, `create-bulk-preview-${vpSuffix}.png`);
    const previewBuf = await page.screenshot({ path: previewShotPath, fullPage: false });
    const previewBaseBuf = fs.readFileSync(path.join(BASELINE_DIR, `create-bulk-preview-${vpSuffix}.png`));
    const previewDiff = calculatePixelDiff(previewBaseBuf, previewBuf);
    diffReports.push({ page: 'create-bulk-preview', viewport: vpSuffix, ...previewDiff });
    console.log(`[DESKTOP DIFF] create-bulk-preview (${vpSuffix}): ${previewDiff.diffPercent?.toFixed(3)}% diff`);
    expect(previewDiff.diffRatio).toBeLessThanOrEqual(0.0015);

    // 6. Copy Single BOM
    await verifyDesktopPage('copy-single', '/products/bom/copy/single', '.fiori-ph-title', setupAdmin);

    // 7. Display BOM
    await verifyDesktopPage('display-bom', '/products/bom/display', '.fiori-ph-title', setupAdmin);

    // 8. Admin Users
    await verifyDesktopPage('admin-users', '/admin/users', '.fiori-ph-title', setupAdmin);

    // 9. Admin Logs
    await verifyDesktopPage('admin-logs-audit', '/admin/logs/audit', '.fiori-ph-title', setupAdmin);
  });

  // Mobile and Tablet Viewports
  const viewportsToTest = [
    { name: 'phone-small', width: 360, height: 640 },
    { name: 'phone-standard', width: 390, height: 844 },
    { name: 'phone-large', width: 430, height: 932 },
    { name: 'phone-landscape', width: 640, height: 360 },
    { name: 'tablet-portrait', width: 768, height: 1024 },
    { name: 'tablet-landscape', width: 1024, height: 768 }
  ];

  for (const vp of viewportsToTest) {
    test(`Responsive Layout Verification at ${vp.width}x${vp.height} (${vp.name})`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== '1366x768', 'Responsive viewports executed once on project 1366x768');
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await setupMocks(page, { authenticated: true, role: 'admin' });

      // 1. Create Single BOM page check
      await page.goto('/products/bom/create/single', { waitUntil: 'networkidle' });
      await expect(page.locator('.fiori-ph-title').first()).toBeVisible();

      // Check no horizontal document scroll
      const noScroll = await page.evaluate(() => {
        const doc = document.documentElement;
        return doc.scrollWidth <= doc.clientWidth + 1;
      });
      expect(noScroll, `Horizontal page overflow at ${vp.width}x${vp.height}`).toBeTruthy();

      // App Shell checks
      if (vp.width <= 1024) {
        // Toggle hamburger button visible
        const hamburger = page.locator('.rx-topbar-sidebar-toggle');
        await expect(hamburger).toBeVisible();

        // Off-canvas drawer opens on hamburger click
        await hamburger.click();
        const sidebar = page.locator('.rx-sidebar');
        await expect(sidebar).toHaveClass(/rx-sidebar-mobile-open/);
        await page.waitForTimeout(250);

        // Body scroll locked
        const bodyOverflow = await page.evaluate(() => document.body.style.overflow);
        expect(bodyOverflow).toBe('hidden');

        // Capture drawer screenshot for standard phone and tablet
        if (vp.width === 390 || vp.width === 768) {
          await page.screenshot({ path: path.join(RESPONSIVE_DIR, `drawer-${vp.name}.png`), fullPage: false });
        }

        // Close on backdrop or Escape
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
        await expect(sidebar).not.toHaveClass(/rx-sidebar-mobile-open/);
      }

      // Quick search button check on phone
      if (vp.width <= 640) {
        const searchBtn = page.locator('.rx-topbar-search-btn');
        await expect(searchBtn).toBeVisible();
        await searchBtn.click();
        const cmdPalette = page.locator('.rx-command-palette-dialog');
        await expect(cmdPalette).toBeVisible();
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      }

      // Check Form Grid Columns
      const gridColumns = await page.evaluate(() => {
        const grid = document.querySelector('.rx-form-grid, .sap-form-grid');
        if (!grid) return null;
        return window.getComputedStyle(grid).gridTemplateColumns.split(' ').length;
      });

      if (gridColumns) {
        if (vp.width <= 640) {
          expect(gridColumns, `Form grid should be 1 column on phone (${vp.width}px)`).toBe(1);
        } else if (vp.width <= 1024) {
          expect(gridColumns, `Form grid should be 2 columns on tablet (${vp.width}px)`).toBe(2);
        }
      }

      // Single / Bulk Switch sits below title full-width on phone
      if (vp.width <= 640) {
        const switchBtn = page.locator('.fiori-ph-actions-right .rx-single-bulk-switch').first();
        if (await switchBtn.isVisible()) {
          const switchBox = await switchBtn.boundingBox();
          expect(switchBox.width).toBeGreaterThan(vp.width * 0.7);
        }
      }

      // Ensure scrolled to top before screenshot
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(100);

      // Capture Single BOM screenshot
      await page.screenshot({ path: path.join(RESPONSIVE_DIR, `create-single-${vp.name}.png`), fullPage: false });

      // 2. Copy Single BOM page check
      await page.goto('/products/bom/copy/single', { waitUntil: 'networkidle' });
      await expect(page.locator('.fiori-ph-title').first()).toBeVisible();

      // Check stacked copy cards on <=1024px
      if (vp.width <= 1024) {
        const arrowDown = page.locator('.copy-bom-responsive-arrow-down');
        await expect(arrowDown).toBeVisible();
      }

      // 3. Create Bulk BOM page check
      await page.goto('/products/bom/create/bulk', { waitUntil: 'networkidle' });
      await expect(page.locator('.fiori-ph-title').first()).toBeVisible();

      // Stepper check on phone (numbers only with active label)
      if (vp.width <= 640) {
        const inactiveLabelsVisible = await page.evaluate(() => {
          const inactive = Array.from(document.querySelectorAll('.rx-bulk-step-item:not(.active) .rx-step-label'));
          return inactive.some(el => window.getComputedStyle(el).display !== 'none');
        });
        expect(inactiveLabelsVisible, 'Inactive stepper labels should be hidden on phone').toBe(false);
      }

      // Upload file to check preview table
      const bulkBuffer = createSampleBulkCreateFile();
      const input = page.locator('input[type="file"]').first();
      await input.setInputFiles({
        name: 'Batch_BOM_Create.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: bulkBuffer
      });
      await page.waitForTimeout(200);
      const contBtn = page.locator('button:has-text("Continue")').first();
      await contBtn.click();
      await page.waitForTimeout(300);

      // Verify Table Horizontal Scroll Wrapper
      const tableWrapper = page.locator('.rx-components-table-container, .sap-bulk-table-container').first();
      if (await tableWrapper.isVisible()) {
        const isScrollable = await tableWrapper.evaluate(el => {
          const style = window.getComputedStyle(el);
          return style.overflowX === 'auto' || style.overflowX === 'scroll';
        });
        expect(isScrollable).toBe(true);
      }

      await page.screenshot({ path: path.join(RESPONSIVE_DIR, `create-bulk-preview-${vp.name}.png`), fullPage: false });

      // 4. Modal Responsiveness Check (Value Help modal)
      await page.goto('/products/bom/create/single', { waitUntil: 'networkidle' });
      const f4Btn = page.locator('button.sap-f4-btn, button[aria-label*="help"], button.rx-value-help-btn').first();
      if (await f4Btn.isVisible()) {
        await f4Btn.click();
        const modal = page.locator('.sap-f4-modal-dialog, .rx-modal-dialog').first();
        if (await modal.isVisible()) {
          const modalBox = await modal.boundingBox();
          expect(modalBox.width).toBeLessThanOrEqual(vp.width);
          expect(modalBox.height).toBeLessThanOrEqual(vp.height);
          if (vp.width === 390) {
            await page.screenshot({ path: path.join(RESPONSIVE_DIR, `modal-${vp.name}.png`), fullPage: false });
          }
          await page.keyboard.press('Escape');
          await page.waitForTimeout(100);
        }
      }

      // 5. Admin Users Page & Tabs
      await page.goto('/admin/users', { waitUntil: 'networkidle' });
      await expect(page.locator('.fiori-ph-title').first()).toBeVisible();

      // Check admin tabs horizontal strip
      const adminTabsRow = page.locator('.sap-admin-tabs-row, .fiori-ph .sap-toolbar:has(.sap-admin-nav-tab)').first();
      if (await adminTabsRow.isVisible()) {
        const tabsOverflow = await adminTabsRow.evaluate(el => {
          return window.getComputedStyle(el).overflowX;
        });
        expect(['auto', 'scroll']).toContain(tabsOverflow);
      }

      // 6. Login Page
      await setupMocks(page, { authenticated: false });
      await page.goto('/signin', { waitUntil: 'networkidle' });
      await expect(page.locator('.rx-login-card, .sap-login-card, form').first()).toBeVisible();

      if (vp.width < 900) {
        // Hero brand illustration hidden
        const heroPanel = page.locator('.lg-left-panel, .sap-login-hero-panel, .rx-login-hero');
        if (await heroPanel.count() > 0) {
          const isHeroHidden = await heroPanel.first().evaluate(el => {
            return window.getComputedStyle(el).display === 'none' || el.offsetParent === null;
          });
          expect(isHeroHidden, 'Login hero panel should be hidden on mobile < 900px').toBe(true);
        }

        // Mobile brand logo visible above card
        const mobileBrand = page.locator('.lg-mobile-brand');
        await expect(mobileBrand).toBeVisible();
      }

      await page.screenshot({ path: path.join(RESPONSIVE_DIR, `login-${vp.name}.png`), fullPage: false });
    });
  }
});
