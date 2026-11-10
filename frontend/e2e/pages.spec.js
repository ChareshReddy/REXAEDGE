import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { setupMocks } from './helpers/mockApi.js';
import {
  assertNoHorizontalScroll,
  assertInputAndButtonHeights,
  assertTableRowsAndInputs,
  assertTableColumnsAligned,
  assertNoFixedOverlap
} from './helpers/layoutAssertions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const screenshotsDir = path.resolve(__dirname, '../screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

const PAGES_TO_TEST = [
  { name: 'login', path: '/signin', unauthenticated: true, waitForSelector: 'input[type="email"], #loginEmail, input[placeholder*="email"]' },
  { name: 'home', path: '/home', waitForSelector: 'h1, .home-hero-header, .rx-card' },
  { name: 'bom-hub', path: '/products/bom', waitForSelector: 'h1, h2, .fiori-category-group, .rx-card' },
  { name: 'create-bom-single', path: '/products/bom/create/single', waitForSelector: '#createBomMaterial, input[aria-label="Header Material"]' },
  { name: 'copy-bom-single', path: '/products/bom/copy/single', waitForSelector: '#sourceMaterial, input[aria-label="Source Material"]' },
  { name: 'create-bom-bulk', path: '/products/bom/create/bulk', waitForSelector: '.rx-bulk-upload-card, .bulk-upload-dropzone' },
  { name: 'copy-bom-bulk', path: '/products/bom/copy/bulk', waitForSelector: '.rx-bulk-upload-card, .bulk-upload-dropzone' },
  { name: 'delete-bom-single', path: '/products/bom/delete', waitForSelector: '#delMaterial, input[placeholder*="A1BH"]' },
  { name: 'bom-explorer', path: '/products/bom/display', waitForSelector: 'input[placeholder*="A1BH"], .sap-page-viewport, h1' },
  { name: 'validate-bom', path: '/products/bom/validate', waitForSelector: 'input, .sap-structured-form-card, h1' },
  { name: 'admin-users', path: '/admin/users', waitForSelector: 'table, .sap-table, h1, h2' },
  { name: 'admin-servers', path: '/admin/servers', waitForSelector: 'table, .sap-table, h1, h2' },
  { name: 'audit-logs', path: '/admin/logs', waitForSelector: 'table, .sap-table, h1, h2' },
  { name: 'dev-design-system', path: '/dev/design-system', waitForSelector: 'h1, .rx-card' }
];

test.describe('RexaEdge Automated Page Layout & Screenshot Suite', () => {
  for (const pageItem of PAGES_TO_TEST) {
    test(`Page: ${pageItem.name} @shots`, async ({ page }, testInfo) => {
      const viewportName = testInfo.project.name;
      const unmockedRequests = [];

      // Setup interceptors
      await setupMocks(page, {
        authenticated: !pageItem.unauthenticated,
        unmockedRequestsCollector: unmockedRequests
      });

      // Navigate to target route
      await page.goto(pageItem.path, { waitUntil: 'networkidle' });

      // Wait for primary selector
      if (pageItem.waitForSelector) {
        await page.waitForSelector(pageItem.waitForSelector, { state: 'visible', timeout: 8000 }).catch(() => {});
      }

      await page.waitForTimeout(300);

      // Save Full Page Screenshot named page-viewport.png
      const screenshotFilename = `${pageItem.name}-${viewportName}.png`;
      const screenshotPath = path.join(screenshotsDir, screenshotFilename);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      const contextLabel = `${pageItem.name} at ${viewportName}`;

      // Automated Assertions:
      // 1. No horizontal scroll
      await assertNoHorizontalScroll(page, contextLabel);

      // 2. Fixed elements do not cover form content
      await assertNoFixedOverlap(page, contextLabel);

      // 3. Form input & button heights (40px forms, 32px tables)
      await assertInputAndButtonHeights(page, contextLabel);

      // 4. Table rows never overlap and inputs have clearance
      await assertTableRowsAndInputs(page, contextLabel);

      // 5. Table last column inside container and headers aligned
      await assertTableColumnsAligned(page, contextLabel);

      // 6. Dedicated Home Page Verification
      if (pageItem.name === 'home') {
        // Verify canvas background is Beautiful Blues (#F5F8FB -> rgb(245, 248, 251))
        const homeBg = await page.evaluate(() => {
          const el = document.querySelector('.rexa-home-page') || document.querySelector('.sap-assistant-layout');
          return el ? window.getComputedStyle(el).backgroundColor : '';
        });
        expect(homeBg).toBe('rgb(245, 248, 251)');

        // Verify top bar server dropdown font is Inter (not monospace)
        const serverSelectFont = await page.evaluate(() => {
          const sel = document.querySelector('.sap-system-select') || document.querySelector('.sap-system-static-label');
          return sel ? window.getComputedStyle(sel).fontFamily : '';
        });
        expect(serverSelectFont.toLowerCase()).toContain('inter');
        expect(serverSelectFont.toLowerCase()).not.toContain('mono');

        // Verify sidebar does NOT list coming-soon modules (Ex. Material Master, Routing)
        const sidebarText = await page.evaluate(() => {
          const sidebar = document.querySelector('aside') || document.querySelector('.rx-sidebar-nav');
          return sidebar ? sidebar.innerText : '';
        });
        expect(sidebarText).not.toContain('Material Master');
        expect(sidebarText).not.toContain('Routing');
        expect(sidebarText).not.toContain('Purchase Orders');
        expect(sidebarText).not.toContain('Production Orders');

        // Verify Hero band has greeting, connected server, and online status pill
        await expect(page.locator('.rx-hero-title')).toContainText('Welcome back');
        await expect(page.locator('.rx-hero-subtitle')).toContainText('Connected to');
        await expect(page.locator('.rx-hero-status-pill')).toBeVisible();

        // Verify live search box is absent and category chips are visible
        await expect(page.locator('.rx-search-box')).toHaveCount(0);
        await expect(page.locator('.rx-category-chips')).toBeVisible();

        // Verify coming-soon cards have no visible pill, but have accessible label and no open link
        const comingSoonCards = page.locator('.rx-card-coming-soon');
        const count = await comingSoonCards.count();
        expect(count).toBeGreaterThan(0);
        for (let i = 0; i < count; i++) {
          const card = comingSoonCards.nth(i);
          await expect(card.locator('.rx-coming-soon-badge')).toHaveCount(0);
          await expect(card.locator('.rx-sr-only')).toHaveText('Coming soon');
          await expect(card).not.toContainText('In development');
          await expect(card.locator('.rx-open-link')).toHaveCount(0);
        }

        // Verify available BOM card has "Open operations" link
        const bomCard = page.locator('.rx-card-available');
        await expect(bomCard).toContainText('Bill of Materials');
        await expect(bomCard.locator('.rx-open-link')).toContainText('Open operations');
      }

      // 7. Dedicated BOM Hub Page Verification
      if (pageItem.name === 'bom-hub') {
        const breadcrumbs = page.locator('nav.fiori-bc');
        await expect(breadcrumbs).toBeVisible();
        await expect(breadcrumbs).toContainText('Home');
        await expect(breadcrumbs).toContainText('BOM management');
        await expect(breadcrumbs).not.toContainText('Products');
      }
    });
  }
});
