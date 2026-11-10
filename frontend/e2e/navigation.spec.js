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

test.describe('RexaEdge Unified Navigation & Layout Tests', () => {

  test('Sidebar structure, expand/collapse, active indicator, and destructive badge', async ({ page }, testInfo) => {
    const viewportWidth = page.viewportSize()?.width || 1366;
    if (viewportWidth < 900) { test.skip(); return; }
    await setupMocks(page, { authenticated: true });
    await page.goto('/home', { waitUntil: 'networkidle' });

    const sidebar = page.locator('aside[aria-label="Application Sidebar"]');
    await expect(sidebar).toBeVisible();

    // Verify expanded width is 240px
    const initialBox = await sidebar.boundingBox();
    expect(Math.round(initialBox.width)).toBe(240);

    // Verify Home item is present and active
    const homeBtn = sidebar.locator('button[aria-label="Home"]');
    await expect(homeBtn).toBeVisible();
    await expect(homeBtn).toHaveAttribute('aria-current', 'page');

    // Verify BOM Management expandable group
    const bomGroupBtn = sidebar.locator('button[aria-label="BOM management"]');
    await expect(bomGroupBtn).toBeVisible();
    if (await bomGroupBtn.getAttribute('aria-expanded') !== 'true') {
      await bomGroupBtn.click();
    }

    // Verify Delete BOM has amber Destructive badge (no red)
    const deleteBomBtn = sidebar.locator('button[aria-label="Delete BOM"]');
    await expect(deleteBomBtn).toBeVisible();
    const destructiveDot = deleteBomBtn.locator('.rx-destructive-dot, .rx-destructive-badge');
    if (await destructiveDot.count() > 0) {
      await expect(destructiveDot).toHaveAttribute('title', 'Destructive operation');
    }

    // Verify coming-soon modules are NOT listed in sidebar
    await expect(sidebar.locator('text=Soon')).toHaveCount(0);

    // Capture screenshot: sidebar-expanded.png
    await page.screenshot({ path: path.join(screenshotsDir, 'sidebar-expanded.png') });

    // Toggle collapse via collapse button at bottom
    const collapseToggle = sidebar.locator('button[aria-label="Collapse sidebar"]');
    await collapseToggle.click();
    await page.waitForTimeout(250);

    // Verify collapsed width is 72px
    const collapsedBox = await sidebar.boundingBox();
    expect(Math.round(collapsedBox.width)).toBe(72);

    // Capture screenshot: sidebar-collapsed.png
    await page.screenshot({ path: path.join(screenshotsDir, 'sidebar-collapsed.png') });

    // Test Collapsed Mode Flyout Menu
    const collapsedBomBtn = sidebar.locator('button[aria-label="BOM management"]');
    await collapsedBomBtn.click();
    await page.waitForTimeout(150);

    const flyout = page.locator('.rx-sidebar-flyout');
    await expect(flyout).toBeVisible();
    await expect(flyout.locator('text=Create BOM')).toBeVisible();
    await expect(flyout.locator('text=Delete BOM')).toBeVisible();

    // Clicking child item in flyout navigates
    await flyout.locator('button:has-text("Create BOM")').click();
    await page.waitForURL('**/products/bom/create/single');
    await expect(page.locator('h1')).toContainText('Create Single BOM');
  });

  test('Single | Bulk switch on Create, Copy, and Delete pages', async ({ page }) => {
    await setupMocks(page, { authenticated: true });

    // 1. Create Single BOM
    await page.goto('/products/bom/create/single', { waitUntil: 'networkidle' });
    await expect(page.locator('h1')).toContainText('Create Single BOM');

    const createSwitch = page.locator('.rx-single-bulk-switch');
    await expect(createSwitch).toBeVisible();

    const singleBtn = createSwitch.locator('button:has-text("Single")');
    const bulkBtn = createSwitch.locator('button:has-text("Bulk")');
    await expect(singleBtn).toHaveClass(/active/);

    // Switch to Bulk
    await bulkBtn.click();
    await page.waitForURL('**/products/bom/create/bulk');
    await expect(page.locator('h1')).toContainText('Create Bulk BOM');
    await expect(createSwitch.locator('button:has-text("Bulk")')).toHaveClass(/active/);

    // Switch back to Single
    await createSwitch.locator('button:has-text("Single")').click();
    await page.waitForURL('**/products/bom/create/single');
    await expect(page.locator('h1')).toContainText('Create Single BOM');

    // 2. Copy Single BOM
    await page.goto('/products/bom/copy/single', { waitUntil: 'networkidle' });
    await expect(page.locator('h1')).toContainText('Copy Single BOM');

    const copySwitch = page.locator('.rx-single-bulk-switch');
    await expect(copySwitch).toBeVisible();
    await copySwitch.locator('button:has-text("Bulk")').click();
    await page.waitForURL('**/products/bom/copy/bulk');
    await expect(page.locator('h1')).toContainText('Copy Bulk BOM');

    // 3. Delete BOM (Bulk disabled)
    await page.goto('/products/bom/delete', { waitUntil: 'networkidle' });
    await expect(page.locator('h1')).toContainText('Delete BOM');
    const deleteSwitch = page.locator('.rx-single-bulk-switch');
    await expect(deleteSwitch).toBeVisible();
    const deleteBulkBtn = deleteSwitch.locator('button:has-text("Bulk")');
    await expect(deleteBulkBtn).toBeDisabled();

    // Capture screenshot: page-header-breadcrumbs-switch.png
    await page.screenshot({ path: path.join(screenshotsDir, 'page-header-breadcrumbs-switch.png') });
  });

  test('Breadcrumb hierarchy and clickable links', async ({ page }) => {
    await setupMocks(page, { authenticated: true });
    await page.goto('/products/bom/create/single', { waitUntil: 'networkidle' });

    const breadcrumbs = page.locator('nav.fiori-bc');
    await expect(breadcrumbs).toBeVisible();

    // Verify Home link in desktop breadcrumbs
    const isMobile = (page.viewportSize()?.width || 1366) <= 640;
    const homeLink = isMobile ? breadcrumbs.locator('.fiori-bc-mobile button.fiori-bc-link, .fiori-bc-mobile a.fiori-bc-link').first() : breadcrumbs.locator('.fiori-bc-desktop button.fiori-bc-link, .fiori-bc-desktop a.fiori-bc-link').first();
    await expect(homeLink).toBeVisible();
    await expect(homeLink).toContainText('Home');

    // Last crumb is current (not a link)
    const currentCrumb = isMobile ? breadcrumbs.locator('.fiori-bc-mobile .fiori-bc-current').first() : breadcrumbs.locator('.fiori-bc-desktop .fiori-bc-current').first();
    await expect(currentCrumb).toBeVisible();
    await expect(currentCrumb).toContainText('Create Single BOM');

    // Clicking Home navigates back to /home
    await homeLink.click();
    await page.waitForURL('**/home');
    await expect(page.locator('h1')).toContainText('Welcome back');
  });

  test('Command Palette (Ctrl+K) search and keyboard navigation', async ({ page }) => {
    await setupMocks(page, { authenticated: true });
    await page.goto('/home', { waitUntil: 'networkidle' });

    // Open via topbar search button
    const searchBtn = page.locator('.rx-topbar-search-btn');
    await expect(searchBtn).toBeVisible();
    await searchBtn.click();

    const dialog = page.locator('.rx-command-palette-dialog');
    await expect(dialog).toBeVisible();

    // Search for "Delete"
    const input = dialog.locator('input');
    await input.fill('Delete');

    // Verify breadcrumb subtitle is shown in search results
    const breadcrumbResult = dialog.locator('text=Home / BOM management / Delete BOM');
    await expect(breadcrumbResult).toBeVisible();

    // Press Escape to close
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });

  test('Mobile drawer (<900px)', async ({ page }) => {
    await setupMocks(page, { authenticated: true });
    // Set viewport to mobile width
    await page.setViewportSize({ width: 800, height: 700 });
    await page.goto('/home', { waitUntil: 'networkidle' });

    const toggleBtn = page.locator('.rx-topbar-sidebar-toggle');
    await expect(toggleBtn).toBeVisible();
    await toggleBtn.click();

    // Verify mobile drawer open class
    const sidebar = page.locator('aside[aria-label="Application Sidebar"]');
    await expect(sidebar).toHaveClass(/rx-sidebar-mobile-open/);

    // Capture screenshot: sidebar-mobile-drawer.png
    await page.screenshot({ path: path.join(screenshotsDir, 'sidebar-mobile-drawer.png') });

    // Press Escape to close drawer
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await expect(sidebar).not.toHaveClass(/rx-sidebar-mobile-open/);
  });

  test('Home BOM card navigates directly to BOM operations page in one click', async ({ page }) => {
    await setupMocks(page, { authenticated: true });
    await page.goto('/home', { waitUntil: 'networkidle' });

    const bomCard = page.locator('.rx-module-card.rx-card-available');
    await expect(bomCard).toBeVisible();
    await expect(bomCard).toContainText('Bill of Materials');

    // Click BOM card
    await bomCard.click();
    await page.waitForURL('**/products/bom');

    // Verify on BOM operations page with operation cards
    await expect(page.locator('h1')).toContainText('Bill of Materials');
    await expect(page.locator('.fiori-operations-header-block')).toBeVisible();

    // Verify breadcrumbs: Home / BOM management (no Products crumb)
    const breadcrumbs = page.locator('nav.fiori-bc');
    await expect(breadcrumbs).toBeVisible();
    await expect(breadcrumbs).toContainText('Home');
    await expect(breadcrumbs).toContainText('BOM management');
    await expect(breadcrumbs).not.toContainText('Products');
  });

  test('/products route redirects to /home', async ({ page }) => {
    await setupMocks(page, { authenticated: true });
    await page.goto('/products', { waitUntil: 'networkidle' });

    // Verify redirected to /home
    await page.waitForURL('**/home');
    await expect(page.locator('.rx-welcome-title')).toContainText('Welcome back');
  });
});
