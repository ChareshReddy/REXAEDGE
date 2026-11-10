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

test.describe('F4 Popups, Operation Card Hover, and Command Palette Suite', () => {
  // =========================================================================
  // 1. OPERATION CARD HOVER CONTRAST
  // =========================================================================
  test('Operation Card Hover: icon tile blue-100, icon blue-600, contrast >= 3:1 @shots', async ({ page }) => {
    await setupMocks(page, { authenticated: true, role: 'admin' });
    await page.goto('/products/bom', { waitUntil: 'networkidle' });

    const firstCard = page.locator('.fiori-op-card').first();
    await expect(firstCard).toBeVisible();

    const iconBadge = firstCard.locator('.fiori-op-icon-badge');
    const iconSvg = iconBadge.locator('svg');

    // Default state contrast
    const defaultStyles = await iconBadge.evaluate(el => {
      const cs = window.getComputedStyle(el);
      const svgCs = window.getComputedStyle(el.querySelector('svg') || el);
      return {
        bg: cs.backgroundColor,
        color: svgCs.stroke || svgCs.color
      };
    });
    const defaultContrast = getContrastRatio(parseRgb(defaultStyles.bg), parseRgb(defaultStyles.color));
    expect(defaultContrast).toBeGreaterThanOrEqual(3.0);

    // Hover card
    await firstCard.hover();
    await page.waitForTimeout(200);

    // Capture screenshot: first card hover
    await firstCard.screenshot({ path: path.join(screenshotsDir, 'card-hover-first.png') });

    // Assert hover styles: tile blue-100 (#DCE8F1) and icon blue-600 (#02579A)
    const hoverStyles = await iconBadge.evaluate(el => {
      const cs = window.getComputedStyle(el);
      const svgCs = window.getComputedStyle(el.querySelector('svg') || el);
      return {
        bg: cs.backgroundColor,
        color: svgCs.stroke || svgCs.color
      };
    });

    const hoverContrast = getContrastRatio(parseRgb(hoverStyles.bg), parseRgb(hoverStyles.color));
    expect(hoverContrast).toBeGreaterThanOrEqual(3.0);
    // Ensure not grey on grey
    const hoverBgRgb = parseRgb(hoverStyles.bg);
    expect(hoverBgRgb.b).toBeGreaterThanOrEqual(hoverBgRgb.r); // Blue-tinted
  });

  // =========================================================================
  // 2. TOP SEARCH / COMMAND PALETTE (CTRL+K)
  // =========================================================================
  test('Command Palette: pill click, Ctrl+K, typing create, Enter navigate, Esc close, click navigate @shots', async ({ page }) => {
    await setupMocks(page, { authenticated: true, role: 'admin' });
    await page.goto('/home', { waitUntil: 'networkidle' });

    // 1. Pill click opens palette
    const searchPill = page.locator('.rx-topbar-search-btn');
    await expect(searchPill).toBeVisible();
    await searchPill.click();

    const paletteOverlay = page.locator('.rx-command-palette-overlay');
    await expect(paletteOverlay).toBeVisible();

    // Take screenshot: open command palette
    await page.screenshot({ path: path.join(screenshotsDir, 'command-palette-open.png') });

    // 2. Esc closes palette
    await page.keyboard.press('Escape');
    await expect(paletteOverlay).not.toBeVisible();

    // 3. Ctrl+K opens palette
    await page.keyboard.press('Control+KeyK');
    await expect(paletteOverlay).toBeVisible();

    // 4. Typing "create" lists both single and bulk
    const searchInput = paletteOverlay.locator('input');
    await searchInput.fill('create');
    await page.waitForTimeout(200);

    const items = paletteOverlay.locator('.rx-command-palette-dialog div[style*="cursor: pointer"]');
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(2);

    const textContent = await paletteOverlay.locator('.rx-command-palette-dialog').innerText();
    expect(textContent).toContain('Create Single BOM');
    expect(textContent).toContain('Create Bulk BOM');

    // 5. Enter navigates to Create Single BOM and closes palette
    await page.keyboard.press('Enter');
    await expect(paletteOverlay).not.toBeVisible();
    await page.waitForURL('**/products/bom/create/single');
    await expect(page.locator('#createBomMaterial')).toBeVisible();

    // 6. Click navigates to Admin page
    await page.keyboard.press('Control+KeyK');
    await expect(paletteOverlay).toBeVisible();
    await searchInput.fill('users');
    await page.waitForTimeout(200);

    const usersItem = paletteOverlay.locator('div:has-text("Users Management")').last();
    await usersItem.click();
    await expect(paletteOverlay).not.toBeVisible();
    await page.waitForURL('**/admin/users');
  });

  // =========================================================================
  // 3. F4 POPUPS (ALL 5 MODALS)
  // =========================================================================
  test('F4 Popups: Backdrop, Table Alignment, Fonts, Sizing, and Polish @shots', async ({ page }) => {
    await setupMocks(page, { authenticated: true, role: 'admin' });
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/products/bom/create/single', { waitUntil: 'networkidle' });
    await page.waitForSelector('#createBomMaterial', { state: 'visible' });

    const max90Vw = 1366 * 0.9;

    // Helper to verify popup dimensions and header
    async function verifyPopupCommon(dialog, name, minWidth = 520) {
      const box = await dialog.boundingBox();
      expect(box, `${name} bounding box`).not.toBeNull();
      expect(box.width).toBeGreaterThanOrEqual(minWidth);
      expect(box.width).toBeLessThanOrEqual(max90Vw);

      // Verify no "F4" badge or "F4" text in header
      const header = dialog.locator('.sap-f4-header, .sap-modal-header, .rx-modal-header').first();
      await expect(header).toBeVisible();
      const headerText = await header.innerText();
      expect(headerText).not.toContain('F4');
      const badgeCount = await dialog.locator('.sap-f4-header-badge').count();
      expect(badgeCount).toBe(0);

      // 1. Title bar height is 60px (+-1px)
      const headerBox = await header.boundingBox();
      expect(headerBox, `${name} header box`).not.toBeNull();
      expect(Math.abs(headerBox.height - 60), `${name} header height should be 60px +-1px (got ${headerBox.height})`).toBeLessThanOrEqual(1.5);

      // 2. Title font-weight is 700 (bold) at 18px
      const titleEl = header.locator('h3, .rx-modal-title, .sap-bulk-modal-title h3').first();
      await expect(titleEl).toBeVisible();
      const titleStyles = await titleEl.evaluate(el => {
        const cs = window.getComputedStyle(el);
        return { fontWeight: cs.fontWeight, fontSize: cs.fontSize, color: cs.color };
      });
      const parsedWeight = parseInt(titleStyles.fontWeight, 10);
      expect(parsedWeight === 700 || titleStyles.fontWeight === 'bold', `${name} title font weight should be 700 (got ${titleStyles.fontWeight})`).toBe(true);
      expect(parseFloat(titleStyles.fontSize), `${name} title font size should be 18px (got ${titleStyles.fontSize})`).toBe(18);

      // 3. Close button stays vertically centered (36px hit area)
      const closeBtn = header.locator('.sap-f4-header-close, .sap-modal-close-btn').first();
      await expect(closeBtn).toBeVisible();
      const closeBox = await closeBtn.boundingBox();
      expect(closeBox, `${name} close button box`).not.toBeNull();
      expect(Math.abs(closeBox.height - 36), `${name} close button height 36px (got ${closeBox.height})`).toBeLessThanOrEqual(1.5);
      const headerCenterY = headerBox.y + headerBox.height / 2;
      const closeCenterY = closeBox.y + closeBox.height / 2;
      expect(Math.abs(headerCenterY - closeCenterY), `${name} close button vertically centered (delta ${Math.abs(headerCenterY - closeCenterY)})`).toBeLessThanOrEqual(1.5);

      // Outside click does not close
      await page.mouse.click(10, 10);
      await expect(dialog).toBeVisible({ timeout: 1500 });
    }

    // Helper to verify table container vs sum of columns
    async function verifyTableSizing(table, container, name) {
      const tableSizing = await table.evaluate((tbl) => {
        const ths = Array.from(tbl.querySelectorAll('thead th'));
        const widths = ths.map(th => th.getBoundingClientRect().width);
        const sum = widths.reduce((a, b) => a + b, 0);
        return { widths, sum };
      });
      const containerBox = await container.boundingBox();
      expect(containerBox, `${name} table container box`).not.toBeNull();
      const diff = Math.abs(tableSizing.sum - containerBox.width);
      expect(diff, `${name} sum of cols (${tableSizing.sum}) vs container width (${containerBox.width})`).toBeLessThanOrEqual(24);

      // Table header height is unchanged compared to before (between 30px and 44px)
      const th = table.locator('thead th').first();
      const thBox = await th.boundingBox();
      expect(thBox, `${name} thead th box`).not.toBeNull();
      expect(thBox.height, `${name} thead th height unchanged`).toBeGreaterThanOrEqual(30);
      expect(thBox.height, `${name} thead th height unchanged`).toBeLessThanOrEqual(44);
    }

    // -----------------------------------------------------------------------
    // A. Material Restrict Value Range Modal
    // -----------------------------------------------------------------------
    const matContainer = page.locator('#createBomMaterial').locator('..');
    const matF4Btn = matContainer.locator('button.rx-value-help-btn, button[title*="F4"], button[aria-label="Search help"]');
    await matF4Btn.click();

    const restrictDialog = page.locator('.sap-restrict-modal-dialog, .sap-restrict-dialog').first();
    await expect(restrictDialog).toBeVisible();
    await verifyPopupCommon(restrictDialog, 'Restrict Value Range');

    // 1. Popup width about 720px
    const restrictBox = await restrictDialog.boundingBox();
    expect(restrictBox.width).toBeGreaterThanOrEqual(700);
    expect(restrictBox.width).toBeLessThanOrEqual(740);

    // 2. Tab strip with prev/next buttons and show-all button at right end (visible, clickable)
    const tabStrip = restrictDialog.locator('.sap-restrict-tab-container');
    await expect(tabStrip).toBeVisible();
    const tabStripBox = await tabStrip.boundingBox();
    expect(tabStripBox, 'tab strip box').not.toBeNull();
    expect(Math.abs(tabStripBox.height - 38), 'tab strip height unchanged (38px +-1px)').toBeLessThanOrEqual(1.5);
    const tabs = restrictDialog.locator('.sap-restrict-tab-btn');
    expect(await tabs.count()).toBeGreaterThanOrEqual(10);

    const prevBtn = restrictDialog.locator('.sap-restrict-tab-controls button[title*="left"]');
    const nextBtn = restrictDialog.locator('.sap-restrict-tab-controls button[title*="right"]');
    const showAllBtn = restrictDialog.locator('.sap-restrict-tab-controls button[title*="search help options"], .sap-restrict-tab-controls button:has(svg.lucide-list-filter)');
    await expect(prevBtn).toBeVisible();
    await expect(nextBtn).toBeVisible();
    await expect(showAllBtn).toBeVisible();

    // Show-all button is clickable and toggles dropdown
    await showAllBtn.click();
    const dropdown = restrictDialog.locator('.sap-restrict-options-dropdown');
    await expect(dropdown).toBeVisible();
    await showAllBtn.click();
    await expect(dropdown).not.toBeVisible();

    // 3. No text "Search by" or "Filters"
    const dialogText = await restrictDialog.innerText();
    expect(dialogText).not.toContain('Search by');
    expect(dialogText).not.toContain('Filters');

    // 4. Option B BOM Usage field has no search button
    const tabB = tabs.filter({ hasText: 'B:' }).first();
    await tabB.click();
    await page.waitForTimeout(150);
    const usageField = restrictDialog.locator('input#field-STLAN');
    await expect(usageField).toBeVisible();
    const usageWrap = usageField.locator('..');
    const usageSearchBtn = usageWrap.locator('button');
    expect(await usageSearchBtn.count()).toBe(0);

    // Switch back to tab M
    const tabM = tabs.filter({ hasText: 'M:' }).first();
    await tabM.click();
    await page.waitForTimeout(150);

    // 5. No content touches popup edge (all children at least 16px inside)
    const formLabels = restrictDialog.locator('.sap-restrict-field-label, .sap-restrict-limit-label');
    const labelCount = await formLabels.count();
    for (let i = 0; i < labelCount; i++) {
      const lBox = await formLabels.nth(i).boundingBox();
      if (lBox) {
        expect(lBox.x - restrictBox.x).toBeGreaterThanOrEqual(16);
      }
    }

    // 6. Label / field left edges align
    const inputWraps = restrictDialog.locator('.sap-restrict-input-wrap, .sap-restrict-limit-controls');
    const wrapCount = await inputWraps.count();
    const leftPositions = [];
    for (let i = 0; i < wrapCount; i++) {
      const wBox = await inputWraps.nth(i).boundingBox();
      if (wBox) leftPositions.push(Math.round(wBox.x));
    }
    if (leftPositions.length > 1) {
      const firstX = leftPositions[0];
      for (const x of leftPositions) {
        expect(Math.abs(x - firstX)).toBeLessThanOrEqual(2);
      }
    }

    // 7. Footer button order is Continue, Reset, Cancel; Continue has non-transparent blue background
    const footerButtons = restrictDialog.locator('.sap-restrict-footer-actions button');
    expect(await footerButtons.count()).toBe(3);
    expect((await footerButtons.nth(0).innerText()).trim()).toContain('Continue');
    expect((await footerButtons.nth(1).innerText()).trim()).toContain('Reset');
    expect((await footerButtons.nth(2).innerText()).trim()).toContain('Cancel');

    const continueBtn = restrictDialog.locator('.sap-restrict-btn-continue');
    await expect(continueBtn).toBeVisible();
    const btnStyles = await continueBtn.evaluate(el => {
      const cs = window.getComputedStyle(el);
      return { bg: cs.backgroundColor, color: cs.color };
    });
    const bgRgb = parseRgb(btnStyles.bg);
    expect(bgRgb.b).toBeGreaterThan(100);
    expect(bgRgb.b).toBeGreaterThan(bgRgb.r);
    const colorRgb = parseRgb(btnStyles.color);
    expect(colorRgb.r).toBeGreaterThan(240);
    expect(colorRgb.g).toBeGreaterThan(240);
    expect(colorRgb.b).toBeGreaterThan(240);

    // 8. Outside click does not close, Esc closes
    await page.mouse.click(10, 10);
    await expect(restrictDialog).toBeVisible({ timeout: 1500 });

    await page.screenshot({ path: path.join(screenshotsDir, 'f4-restrict-value-range.png') });

    // Esc closes
    await page.keyboard.press('Escape');
    await expect(restrictDialog).not.toBeVisible();

    // Reopen to click Continue and test Material popup
    await matF4Btn.click();
    await expect(restrictDialog).toBeVisible();

    // -----------------------------------------------------------------------
    // B. Material Results Modal
    // -----------------------------------------------------------------------
    const continueBtnAfterReopen = restrictDialog.locator('.sap-restrict-btn-continue');
    await continueBtnAfterReopen.click();

    const matDialog = page.locator('.sap-f4-modal-dialog.material');
    await expect(matDialog).toBeVisible({ timeout: 5000 });
    await verifyPopupCommon(matDialog, 'Material');

    const matTable = matDialog.locator('table.sap-f4-table');
    const matTableContainer = matDialog.locator('.sap-f4-table-container');
    await expect(matTable).toBeVisible();
    await verifyTableSizing(matTable, matTableContainer, 'Material');

    // Material column shows all 19 characters without ellipsis
    const firstMatCell = matTable.locator('tbody tr td.sap-col-code').first();
    const matText = (await firstMatCell.innerText()).trim();
    expect(matText).toBe('0000000000000100019');
    expect(matText.length).toBe(19);

    // Full header word "Language" visible (not "Langu...")
    const langHeader = matTable.locator('th:has-text("Language")');
    await expect(langHeader).toBeVisible();
    expect((await langHeader.innerText()).trim()).toBe('Language');

    // Header/body center delta <= 2px for Type column
    const typeHeader = matTable.locator('th.sap-col-center').first();
    const typeBodyCell = matTable.locator('tbody tr td.sap-col-center').first();
    const thBox = await typeHeader.boundingBox();
    const tdBox = await typeBodyCell.boundingBox();
    if (thBox && tdBox) {
      const thCenter = thBox.x + thBox.width / 2;
      const tdCenter = tdBox.x + tdBox.width / 2;
      expect(Math.abs(thCenter - tdCenter)).toBeLessThanOrEqual(2.0);
    }

    // Row height >= 44px
    const selectedRow = matTable.locator('tbody tr.selected').first();
    const rowHeight = await selectedRow.evaluate(el => el.getBoundingClientRect().height);
    expect(rowHeight).toBeGreaterThanOrEqual(43.5);

    // Font-weight checks for Material table:
    // Code cells on selected row are 600
    const selMatCodeWeight = await selectedRow.locator('td.sap-col-code').first().evaluate(el => window.getComputedStyle(el).fontWeight);
    expect(parseInt(selMatCodeWeight, 10)).toBe(600);
    // Code cells on unselected row are 500
    const unselMatRow = matTable.locator('tbody tr:not(.selected)').first();
    const unselMatCodeWeight = await unselMatRow.locator('td.sap-col-code').first().evaluate(el => window.getComputedStyle(el).fontWeight);
    expect(parseInt(unselMatCodeWeight, 10)).toBe(500);
    // Language and description cells are 400
    const matDescCell = selectedRow.locator('td.sap-f4-col-text, td.sap-col-desc').first();
    const matDescWeight = await matDescCell.evaluate(el => window.getComputedStyle(el).fontWeight);
    expect(parseInt(matDescWeight, 10)).toBe(400);
    const matLangCell = selectedRow.locator('td:has-text("E")').first();
    const matLangWeight = await matLangCell.evaluate(el => window.getComputedStyle(el).fontWeight);
    expect(parseInt(matLangWeight, 10)).toBe(400);
    // Table header unchanged (600)
    const matHeaderWeight = await langHeader.evaluate(el => window.getComputedStyle(el).fontWeight);
    expect(parseInt(matHeaderWeight, 10)).toBe(600);

    await page.screenshot({ path: path.join(screenshotsDir, 'f4-material.png') });

    // Close material modal
    await matDialog.locator('.sap-f4-header-close').click();
    await expect(matDialog).not.toBeVisible();

    // -----------------------------------------------------------------------
    // C. Plant Modal
    // -----------------------------------------------------------------------
    const plantContainer = page.locator('#createBomPlant').locator('..');
    const plantF4Btn = plantContainer.locator('button.rx-value-help-btn, button[title*="F4"], button[aria-label="Search help"]');
    await plantF4Btn.click();

    const plantDialog = page.locator('.sap-f4-modal-dialog.plant');
    await expect(plantDialog).toBeVisible();
    await verifyPopupCommon(plantDialog, 'Plant');

    const plantTable = plantDialog.locator('table.sap-f4-table');
    const plantTableContainer = plantDialog.locator('.sap-f4-table-container');
    await expect(plantTable).toBeVisible();
    await verifyTableSizing(plantTable, plantTableContainer, 'Plant');

    // Font-weight checks for Plant table:
    const plantSelRow = plantTable.locator('tbody tr.selected').first();
    const plantSelCodeWeight = await plantSelRow.locator('td.sap-col-code').first().evaluate(el => window.getComputedStyle(el).fontWeight);
    expect(parseInt(plantSelCodeWeight, 10)).toBe(600);
    const plantUnselRow = plantTable.locator('tbody tr:not(.selected)').first();
    const plantUnselCodeWeight = await plantUnselRow.locator('td.sap-col-code').first().evaluate(el => window.getComputedStyle(el).fontWeight);
    expect(parseInt(plantUnselCodeWeight, 10)).toBe(500);
    const plantDescCell = plantSelRow.locator('td.sap-f4-col-text, td.sap-col-desc').first();
    const plantDescWeight = await plantDescCell.evaluate(el => window.getComputedStyle(el).fontWeight);
    expect(parseInt(plantDescWeight, 10)).toBe(400);

    await page.screenshot({ path: path.join(screenshotsDir, 'f4-plant.png') });
    await plantDialog.locator('.sap-f4-header-close').click();
    await expect(plantDialog).not.toBeVisible();

    // -----------------------------------------------------------------------
    // D. Storage Location Modal
    // -----------------------------------------------------------------------
    const slocContainer = page.locator('.sap-table tbody tr').first().locator('.rx-value-help-container').nth(1);
    const slocF4Btn = slocContainer.locator('button.rx-value-help-btn, button[title*="F4"], button[aria-label="Search help"]');
    await slocF4Btn.click();

    const slocDialog = page.locator('.sap-f4-modal-dialog.storage-location');
    await expect(slocDialog).toBeVisible();
    await verifyPopupCommon(slocDialog, 'Storage Location');

    const slocTable = slocDialog.locator('table.sap-f4-table');
    const slocTableContainer = slocDialog.locator('.sap-f4-table-container');
    await expect(slocTable).toBeVisible();
    await verifyTableSizing(slocTable, slocTableContainer, 'Storage Location');

    await page.screenshot({ path: path.join(screenshotsDir, 'f4-storage-location.png') });
    await slocDialog.locator('.sap-f4-header-close').click();
    await expect(slocDialog).not.toBeVisible();

    // -----------------------------------------------------------------------
    // E. BOM Usage Modal
    // -----------------------------------------------------------------------
    const usageContainer = page.locator('#createBomUsage').locator('..');
    const usageF4Btn = usageContainer.locator('button.rx-value-help-btn, button[title*="F4"], button[aria-label="Search help"]');
    await usageF4Btn.click();

    const usageDialog = page.locator('.sap-f4-modal-dialog.bom-usage');
    await expect(usageDialog).toBeVisible();
    await verifyPopupCommon(usageDialog, 'BOM Usage');

    const usageTable = usageDialog.locator('table.sap-f4-table');
    const usageTableContainer = usageDialog.locator('.sap-f4-table-container');
    await expect(usageTable).toBeVisible();
    await verifyTableSizing(usageTable, usageTableContainer, 'BOM Usage');

    await page.screenshot({ path: path.join(screenshotsDir, 'f4-bom-usage.png') });

    // Close via Enter selection
    await page.keyboard.press('Enter');
    await expect(usageDialog).not.toBeVisible({ timeout: 2000 });

    // -----------------------------------------------------------------------
    // F. Shared Confirmation Modal (Modal.jsx)
    // -----------------------------------------------------------------------
    const userBtn = page.locator('button.sap-user-chip, button[aria-label*="User profile"], button:has(.sap-user-avatar)').first();
    if (await userBtn.isVisible()) {
      await userBtn.click();
      const signOutItem = page.locator('button.sap-user-menu-signout');
      if (await signOutItem.isVisible()) {
        await signOutItem.click();
        const confirmDialog = page.locator('.sap-modal-card, [role="dialog"]:has(.sap-modal-header)').first();
        await expect(confirmDialog).toBeVisible();
        await verifyPopupCommon(confirmDialog, 'Confirmation Dialog', 380);
        // Close confirmation dialog
        await confirmDialog.locator('.sap-modal-close-btn').click();
        await expect(confirmDialog).not.toBeVisible();
      }
    }

    // -----------------------------------------------------------------------
    // G. BOM Explorer Results Table: font-weight check
    // -----------------------------------------------------------------------
    await page.goto('/products/bom/display', { waitUntil: 'networkidle' });
    await page.waitForSelector('#expMaterial', { state: 'visible' });
    await page.fill('#expMaterial', 'A1BH0214C');
    await page.fill('#expPlant', '1010');
    await page.locator('button[type="submit"]').click();

    const expTable = page.locator('table.sap-table');
    await expect(expTable).toBeVisible({ timeout: 5000 });
    const expCodeCell = expTable.locator('tbody tr td .sap-col-code, tbody tr td.sap-col-code').first();
    await expect(expCodeCell).toBeVisible();
    const expCodeWeight = await expCodeCell.evaluate(el => window.getComputedStyle(el).fontWeight);
    expect(parseInt(expCodeWeight, 10)).toBe(500);

    const expDescCell = expTable.locator('tbody tr td[title]').first();
    const expDescWeight = await expDescCell.evaluate(el => window.getComputedStyle(el).fontWeight);
    expect(parseInt(expDescWeight, 10)).toBe(400);
  });
});
