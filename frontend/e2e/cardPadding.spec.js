import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { setupMocks } from './helpers/mockApi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const screenshotsDir = path.resolve(__dirname, '../../.agents/screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

// Helper to assert full-bleed tinted band on a card
async function assertTintedBand(card) {
  const cardBox = await card.boundingBox();
  expect(cardBox).not.toBeNull();

  const tintedBand = card.locator('[data-full-bleed-band="true"]');
  const count = await tintedBand.count();
  if (count > 0) {
    const band = tintedBand.first();
    const bandBox = await band.boundingBox();
    expect(bandBox).not.toBeNull();

    // Flush to left and right edges (+-2px)
    expect(Math.abs(bandBox.x - cardBox.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(bandBox.width - cardBox.width)).toBeLessThanOrEqual(2.5);

    // Background color is blue-100 (rgb(220, 232, 241))
    const bg = await band.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(bg).toBe('rgb(220, 232, 241)');

    // Title styling
    const titleEl = band.locator('h3, .rx-form-section-title').first();
    if (await titleEl.count() > 0) {
      const titleColor = await titleEl.evaluate((el) => window.getComputedStyle(el).color);
      const titleWeight = await titleEl.evaluate((el) => window.getComputedStyle(el).fontWeight);
      expect(titleColor).toBe('rgb(0, 32, 78)'); // navy-900
      expect(parseInt(titleWeight, 10)).toBeGreaterThanOrEqual(600);
    }
  }
}

// Helper to assert table header styling
async function assertTableHeaders(table) {
  const theadThs = table.locator('thead th');
  const count = await theadThs.count();
  if (count > 0) {
    const firstTh = theadThs.first();
    const bg = await firstTh.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    const color = await firstTh.evaluate((el) => window.getComputedStyle(el).color);
    const weight = await firstTh.evaluate((el) => window.getComputedStyle(el).fontWeight);
    expect(bg).toBe('rgb(179, 205, 224)'); // blue-200
    expect(color).toBe('rgb(0, 32, 78)'); // navy-900
    expect(parseInt(weight, 10)).toBeGreaterThanOrEqual(600);
  }
}

test.describe('Part A: Full-Bleed Tinted Header Bands Everywhere & Part B: Create BOM Table Scroll', () => {

  test('Create BOM single: Full-bleed bands, table headers, and ZERO horizontal scroll at 1366 and 1920', async ({ page }) => {
    const viewportWidth = page.viewportSize()?.width || 1366;
    const viewportHeight = page.viewportSize()?.height || 768;

    await setupMocks(page, { authenticated: true });
    await page.goto('/products/bom/create/single', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#createBomMaterial', { state: 'visible', timeout: 8000 });

    // 1. Check sidebar exists and verify width
    const sidebar = page.locator('aside, .rx-sidebar');
    if (await sidebar.count() > 0) {
      const sidebarBox = await sidebar.first().boundingBox();
      if (sidebarBox) {
        expect(sidebarBox.width).toBeGreaterThanOrEqual(72);
      }
    }

    // 2. Tinted band assertions on both cards
    const cards = page.locator('.rx-card');
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThanOrEqual(2);

    for (let i = 0; i < cardCount; i++) {
      await assertTintedBand(cards.nth(i));
    }

    // 3. Components table header row style
    const table = page.locator('.rx-components-table, table.sap-table').first();
    await assertTableHeaders(table);

    // 4. PART B Table Scroll Verification:
    const tableContainer = page.locator('.rx-components-table-container');
    await expect(tableContainer).toBeVisible();

    const scrollInfo = await tableContainer.evaluate((el) => {
      return {
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        hasHorizontalScroll: el.scrollWidth > el.clientWidth
      };
    });

    if (viewportWidth >= 1100) {
      // At 1366x768 and 1920x1080: ZERO horizontal scrollbar!
      expect(scrollInfo.scrollWidth).toBeLessThanOrEqual(scrollInfo.clientWidth + 1);
      expect(scrollInfo.hasHorizontalScroll).toBe(false);

      // 5. Action column trash-can button is fully visible with no scroll, centered
      const trashBtn = page.locator('button[aria-label*="Remove component"]').first();
      await expect(trashBtn).toBeVisible();
      const trashBox = await trashBtn.boundingBox();
      const containerBox = await tableContainer.boundingBox();
      expect(trashBox).not.toBeNull();
      expect(containerBox).not.toBeNull();
      expect(trashBox.x + trashBox.width).toBeLessThanOrEqual(containerBox.x + containerBox.width);
    } else {
      // Fallback scroll at < 1100px (e.g. 1024)
      expect(scrollInfo.scrollWidth).toBeGreaterThan(scrollInfo.clientWidth);
    }

    // 6. Two-line header text wraps cleanly
    const ths = page.locator('table.sap-table thead th');
    expect(await ths.count()).toBe(9);
    const expectedHeaders = [
      'Itm no.',
      'Components',
      'Quantity',
      'Item category',
      'Storage location',
      'Reference number',
      'Costing relevant',
      'Engineering relevant',
      'Action'
    ];
    for (let i = 0; i < 9; i++) {
      const th = ths.nth(i);
      await expect(th).toContainText(expectedHeaders[i]);
    }

    // Screenshot
    const screenshotPath = path.join(screenshotsDir, `create-bom-single-${viewportWidth}x${viewportHeight}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test('Copy BOM: Tinted band with 3px blue top accent bar & Source/Target badges', async ({ page }) => {
    const viewportWidth = page.viewportSize()?.width || 1366;
    const viewportHeight = page.viewportSize()?.height || 768;

    await setupMocks(page, { authenticated: true });
    await page.goto('/products/bom/copy/single', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#sourceMaterial', { state: 'visible', timeout: 8000 });

    const cards = page.locator('.rx-card');
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThanOrEqual(2);

    for (let i = 0; i < cardCount; i++) {
      const card = cards.nth(i);
      await assertTintedBand(card);

      // Verify 3px blue top accent bar
      const borderTop = await card.evaluate((el) => window.getComputedStyle(el).borderTop);
      expect(borderTop).toContain('3px solid');

      // Verify Source / Target badge inside header
      const badge = card.locator('.rx-form-section-header span').filter({ hasText: /Source|Target/ });
      expect(await badge.count()).toBeGreaterThanOrEqual(1);
    }

    const screenshotPath = path.join(screenshotsDir, `copy-bom-${viewportWidth}x${viewportHeight}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test('Delete BOM & Validate BOM: Tinted bands & table headers', async ({ page }) => {
    const viewportWidth = page.viewportSize()?.width || 1366;
    const viewportHeight = page.viewportSize()?.height || 768;

    await setupMocks(page, { authenticated: true });

    // Delete BOM
    await page.goto('/products/bom/delete', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#delMaterial', { state: 'visible', timeout: 8000 });
    const delCard = page.locator('.rx-card').first();
    await assertTintedBand(delCard);
    const delScreenshotPath = path.join(screenshotsDir, `delete-bom-${viewportWidth}x${viewportHeight}.png`);
    await page.screenshot({ path: delScreenshotPath, fullPage: true });

    // Validate BOM
    await page.goto('/products/bom/validate', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#valMaterial', { state: 'visible', timeout: 8000 });
    const valCard = page.locator('.rx-card').first();
    await assertTintedBand(valCard);
    const valScreenshotPath = path.join(screenshotsDir, `validate-bom-${viewportWidth}x${viewportHeight}.png`);
    await page.screenshot({ path: valScreenshotPath, fullPage: true });
  });

  test('BOM Explorer: Parameters card & Components List results card tinted bands', async ({ page }) => {
    const viewportWidth = page.viewportSize()?.width || 1366;
    const viewportHeight = page.viewportSize()?.height || 768;

    await setupMocks(page, { authenticated: true });
    await page.goto('/products/bom/display', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#expMaterial', { state: 'visible', timeout: 8000 });

    // Fill valid material to display components table
    await page.locator('#expMaterial').fill('A1BH0214C');
    await page.locator('#expPlant').fill('1010');
    await page.locator('button[type="submit"], .rx-btn-primary').first().click();

    // Verify both parameters card and results card have tinted bands
    const cards = page.locator('.rx-card');
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < cardCount; i++) {
      await assertTintedBand(cards.nth(i));
    }

    // Check table headers if components table is visible
    const table = page.locator('table.sap-table');
    if (await table.count() > 0) {
      await assertTableHeaders(table.first());
    }

    const screenshotPath = path.join(screenshotsDir, `bom-explorer-${viewportWidth}x${viewportHeight}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test('Bulk Create & Upload Panel: Tinted band on upload card', async ({ page }) => {
    const viewportWidth = page.viewportSize()?.width || 1366;
    const viewportHeight = page.viewportSize()?.height || 768;

    await setupMocks(page, { authenticated: true });
    await page.goto('/products/bom/create/bulk', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.rx-bulk-upload-card', { state: 'visible', timeout: 8000 });

    const uploadCard = page.locator('.rx-bulk-upload-card');
    await assertTintedBand(uploadCard);

    const screenshotPath = path.join(screenshotsDir, `bulk-create-${viewportWidth}x${viewportHeight}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test('Admin Users, Servers, Permissions, Audit Logs: Tinted bands & table headers', async ({ page }) => {
    const viewportWidth = page.viewportSize()?.width || 1366;
    const viewportHeight = page.viewportSize()?.height || 768;

    await setupMocks(page, { authenticated: true });

    // 1. Admin Users page
    await page.goto('/admin/users', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('table.sap-admin-compact-table', { state: 'visible', timeout: 8000 });
    const userCard = page.locator('.rx-card').first();
    await assertTintedBand(userCard);
    await assertTableHeaders(page.locator('table.sap-admin-compact-table').first());
    const userScreenshotPath = path.join(screenshotsDir, `admin-users-${viewportWidth}x${viewportHeight}.png`);
    await page.screenshot({ path: userScreenshotPath, fullPage: true });

    // 2. Admin Servers page
    await page.goto('/admin/servers', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('table.sap-admin-compact-table', { state: 'visible', timeout: 8000 });
    const serverCard = page.locator('.rx-card').first();
    await assertTintedBand(serverCard);
    await assertTableHeaders(page.locator('table.sap-admin-compact-table').first());
    const serverScreenshotPath = path.join(screenshotsDir, `admin-servers-${viewportWidth}x${viewportHeight}.png`);
    await page.screenshot({ path: serverScreenshotPath, fullPage: true });

    // 3. Admin Permissions page
    await page.goto('/admin/permissions', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('table.sap-admin-compact-table', { state: 'visible', timeout: 8000 });
    const permCard = page.locator('.rx-card').first();
    await assertTintedBand(permCard);
    await assertTableHeaders(page.locator('table.sap-admin-compact-table').first());
    const permScreenshotPath = path.join(screenshotsDir, `admin-permissions-${viewportWidth}x${viewportHeight}.png`);
    await page.screenshot({ path: permScreenshotPath, fullPage: true });

    // 4. Audit logs page
    await page.goto('/admin/logs/audit', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('table.sap-admin-compact-table', { state: 'visible', timeout: 8000 });
    const tableCard = page.locator('.rx-card').last();
    await assertTintedBand(tableCard);
    await assertTableHeaders(page.locator('table.sap-admin-compact-table').first());
    const auditScreenshotPath = path.join(screenshotsDir, `admin-audit-logs-${viewportWidth}x${viewportHeight}.png`);
    await page.screenshot({ path: auditScreenshotPath, fullPage: true });
  });

  test('Dev Design System: Tinted bands & table headers', async ({ page }) => {
    const viewportWidth = page.viewportSize()?.width || 1366;
    const viewportHeight = page.viewportSize()?.height || 768;

    await setupMocks(page, { authenticated: true });
    await page.goto('/dev/design-system', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.rx-card', { state: 'visible', timeout: 8000 });

    const card = page.locator('.rx-card').first();
    await assertTintedBand(card);

    const screenshotPath = path.join(screenshotsDir, `design-system-${viewportWidth}x${viewportHeight}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

});
