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

test.describe('Create BOM Single, Layout, Sidebar and Ex. Refinements Suite', () => {

  test('Items 1-9: Create BOM Single form elements, table headers, Base Quantity, UOM, and Switch', async ({ page }, testInfo) => {
    const vp = testInfo.project.name;
    const viewportWidth = page.viewportSize()?.width || 1366;
    if (viewportWidth < 900) {
      test.skip();
      return;
    }

    await setupMocks(page, { authenticated: true });
    await page.goto('/products/bom/create/single', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#createBomMaterial', { state: 'visible', timeout: 8000 });

    // ITEM 1: Single | Bulk segmented switch
    const switchContainer = page.locator('.rx-single-bulk-switch');
    await expect(switchContainer).toBeVisible();
    const singleBtn = switchContainer.locator('button').first();
    const bulkBtn = switchContainer.locator('button').last();

    await expect(singleBtn).toHaveClass(/active/);
    const singleStyle = await singleBtn.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return {
        bg: cs.backgroundColor,
        color: cs.color,
        fontWeight: cs.fontWeight,
        borderRadius: cs.borderRadius,
        height: cs.height
      };
    });
    // active segment: solid blue-600 background (rgb(2, 87, 154)), white text, radius 8px, 36px height
    expect(singleStyle.bg).toBe('rgb(2, 87, 154)');
    expect(singleStyle.color).toBe('rgb(255, 255, 255)');
    expect(parseInt(singleStyle.fontWeight, 10)).toBeGreaterThanOrEqual(600);
    expect(singleStyle.borderRadius).toBe('8px');
    expect(singleStyle.height).toBe('36px');

    // container: blue-50 pill (rgb(238, 244, 249)), 10px radius, 2px padding
    const containerStyle = await switchContainer.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return {
        bg: cs.backgroundColor,
        borderRadius: cs.borderRadius,
        paddingTop: cs.paddingTop
      };
    });
    expect(containerStyle.bg).toBe('rgb(238, 244, 249)');
    expect(containerStyle.borderRadius).toBe('10px');
    expect(containerStyle.paddingTop).toBe('2px');

    // ITEM 2: Base Quantity field
    const baseQtyInput = page.locator('#createBomBaseQty');
    await expect(baseQtyInput).toBeVisible();
    await expect(baseQtyInput).toHaveAttribute('inputmode', 'numeric');
    await expect(baseQtyInput).toHaveAttribute('maxlength', '5');
    await expect(baseQtyInput).toHaveValue('1');

    // Non-digits are blocked on keydown
    await baseQtyInput.fill('');
    await baseQtyInput.pressSequentially('12.3-4e+5');
    // Only '12345' should be present
    const typedVal = await baseQtyInput.inputValue();
    expect(typedVal).toBe('12345');

    // Paste sanitization
    await baseQtyInput.fill('');
    await baseQtyInput.evaluate((el) => {
      const dt = new DataTransfer();
      dt.setData('text', '99abc999extra');
      const pasteEvt = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      el.dispatchEvent(pasteEvt);
    });
    expect(await baseQtyInput.inputValue()).toBe('99999');

    // Zero validation error
    await baseQtyInput.fill('0');
    await baseQtyInput.blur();
    const errorMsgZero = page.locator('.rx-field-error').first();
    await expect(errorMsgZero).toContainText('Base quantity must be a whole number from 1 to 99999');

    // Empty validation error
    await baseQtyInput.fill('');
    await baseQtyInput.blur();
    await expect(page.locator('.rx-field-error').first()).toContainText('Base quantity must be a whole number from 1 to 99999');

    // Restore valid quantity 1
    await baseQtyInput.fill('1');
    await baseQtyInput.blur();

    // ITEM 3: Unit of Measure (UOM) field
    const uomInput = page.locator('#createBomUom');
    await expect(uomInput).toBeVisible();
    await expect(uomInput).toHaveAttribute('readonly', '');
    await expect(uomInput).toHaveAttribute('tabindex', '-1');
    await expect(uomInput).toHaveAttribute('aria-readonly', 'true');

    // Empty when material is empty
    const matInput = page.locator('#createBomMaterial');
    await matInput.fill('');
    expect(await uomInput.inputValue()).toBe('');

    // Populates with "PAA" when Material has valid 8-19 chars
    await matInput.fill('A1BH0214C');
    expect(await uomInput.inputValue()).toBe('PAA');

    // UOM styling: blue-50 bg, subtle border, 40px height
    const uomStyle = await uomInput.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return {
        bg: cs.backgroundColor,
        height: cs.height
      };
    });
    expect(uomStyle.bg).toBe('rgb(238, 244, 249)');
    expect(uomStyle.height).toBe('40px');

    // ITEM 5: Clean placeholder text
    const altTextInput = page.locator('#createBomAltText');
    await expect(altTextInput).toHaveAttribute('placeholder', '');

    const compInput = page.locator('table.sap-table tbody tr').first().locator('input').first();
    await expect(compInput).toHaveAttribute('placeholder', '');

    const slocInput = page.locator('table.sap-table tbody tr').first().locator('input').nth(3);
    await expect(slocInput).toHaveAttribute('placeholder', '');

    // ITEM 6, 8, 9 & New Requirements: Full column header names, red stars, Itm no., no truncation
    const ths = page.locator('table.sap-table thead th');
    expect(await ths.count()).toBe(9);

    const expectedHeaderNames = [
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

    // Verify every header text is fully visible (scrollWidth <= clientWidth, computed text-overflow is not ellipsis) and equals required name
    for (let i = 0; i < 9; i++) {
      const th = ths.nth(i);
      const headerInfo = await th.evaluate((el) => {
        const cs = window.getComputedStyle(el);
        const textSpan = el.querySelector('span');
        const textSpanCs = textSpan ? window.getComputedStyle(textSpan) : cs;
        const lineH = parseFloat(cs.lineHeight) || 16;
        const lines = Math.round((textSpan?.offsetHeight || el.offsetHeight) / lineH);
        return {
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          textOverflow: cs.textOverflow,
          spanTextOverflow: textSpanCs.textOverflow,
          whiteSpace: cs.whiteSpace,
          lines
        };
      });

      // No ellipsis on th or inner span
      expect(headerInfo.textOverflow).not.toBe('ellipsis');
      expect(headerInfo.spanTextOverflow).not.toBe('ellipsis');
      // Fully visible without truncation
      expect(headerInfo.scrollWidth).toBeLessThanOrEqual(headerInfo.clientWidth + 2);
      // No header exceeds two lines
      expect(headerInfo.lines).toBeLessThanOrEqual(2);
      // Header text contains required name
      await expect(th).toContainText(expectedHeaderNames[i]);
    }

    // Check required red stars on Component, Quantity, Storage location
    const compStar = ths.nth(1).locator('span.text-\\[var\\(--color-danger\\)\\]');
    await expect(compStar).toBeVisible();
    await expect(compStar).toHaveText('*');

    const qtyStar = ths.nth(2).locator('span.text-\\[var\\(--color-danger\\)\\]');
    await expect(qtyStar).toBeVisible();
    await expect(qtyStar).toHaveText('*');

    const slocStar = ths.nth(4).locator('span.text-\\[var\\(--color-danger\\)\\]');
    await expect(slocStar).toBeVisible();
    await expect(slocStar).toHaveText('*');

    // Header/body column alignment within 2px
    const firstRowTds = page.locator('table.sap-table tbody tr').first().locator('td');
    for (let i = 0; i < 9; i++) {
      const thRect = await ths.nth(i).boundingBox();
      const tdRect = await firstRowTds.nth(i).boundingBox();
      expect(thRect).not.toBeNull();
      expect(tdRect).not.toBeNull();
      expect(Math.abs(thRect.x - tdRect.x)).toBeLessThanOrEqual(2);
      expect(Math.abs(thRect.width - tdRect.width)).toBeLessThanOrEqual(2);
    }

    // ITEM 3: Table Column-Header Row styling (blue-200 background, min-height 56px, navy-900 semibold text)
    const trHead = page.locator('table.sap-table thead tr');
    const trHeadStyle = await trHead.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return {
        bg: cs.backgroundColor,
        height: el.offsetHeight
      };
    });
    // blue-200 is rgb(179, 205, 224)
    expect(trHeadStyle.bg).toBe('rgb(179, 205, 224)');
    expect(trHeadStyle.height).toBeGreaterThanOrEqual(56);

    // ITEM 2: Tinted Heading Bands (true full-bleed, blue-100 token, title offset >= 16px, flush with card edges)
    const cards = page.locator('.rx-card');
    const headerDataCard = cards.nth(0);
    const componentItemsCard = cards.nth(1);

    for (const card of [headerDataCard, componentItemsCard]) {
      const band = card.locator('.rx-form-section-header');
      const title = band.locator('.rx-form-section-title');

      const cardBox = await card.boundingBox();
      const bandBox = await band.boundingBox();
      const titleBox = await title.boundingBox();

      expect(cardBox).not.toBeNull();
      expect(bandBox).not.toBeNull();
      expect(titleBox).not.toBeNull();

      // Band's left edge equals card's left edge within 1px
      expect(Math.abs(bandBox.x - cardBox.x)).toBeLessThanOrEqual(1);
      // Band's width equals card's width within 1px
      expect(Math.abs(bandBox.width - cardBox.width)).toBeLessThanOrEqual(1);
      // Title top offset inside band is at least 16px
      expect(titleBox.y - bandBox.y).toBeGreaterThanOrEqual(15.5);

      // Band background: blue-100 rgb(220, 232, 241)
      const bandBg = await band.evaluate((el) => window.getComputedStyle(el).backgroundColor);
      expect(bandBg).toBe('rgb(220, 232, 241)');

      // Band and table-header background colors are different
      expect(bandBg).not.toBe(trHeadStyle.bg);
    }

    // Save screenshot of Create BOM single
    const screenshotPath = path.join(screenshotsDir, `create-bom-single-${viewportWidth}x${page.viewportSize()?.height || 768}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test('Items 10, 11, 12: Collapsed sidebar after login, auto-expand on active route, capitalized greeting, no Delete BOM dot', async ({ page }, testInfo) => {
    const viewportWidth = page.viewportSize()?.width || 1366;
    if (viewportWidth < 900) {
      test.skip();
      return;
    }

    await setupMocks(page, { authenticated: true });

    // Clear sidebar state to simulate fresh login
    await page.addInitScript(() => {
      localStorage.removeItem('rexa_sidebar_expanded_groups');
    });

    await page.goto('/home', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.rx-home-hero', { state: 'visible', timeout: 8000 });

    // ITEM 11: Capitalized greeting "Welcome back, Admin"
    const welcomeTitle = page.locator('.rx-welcome-title');
    await expect(welcomeTitle).toBeVisible();
    await expect(welcomeTitle).toContainText('Welcome back, Admin');

    // Check user menu name
    const userMenuBtn = page.locator('.sap-user-avatar-btn');
    await userMenuBtn.click();
    const userMenuName = page.locator('.sap-user-dropdown-name');
    await expect(userMenuName).toBeVisible();
    await expect(userMenuName).toContainText('Admin');

    // ITEM 10: Sidebar groups collapsed after fresh login on /home
    const bomToggle = page.locator('button[aria-label="BOM management"]');
    await expect(bomToggle).toHaveAttribute('aria-expanded', 'false');

    const adminToggle = page.locator('button[aria-label="Enterprise Admin"]');
    await expect(adminToggle).toHaveAttribute('aria-expanded', 'false');

    // Child items should not be visible
    const createBomLink = page.locator('button:has-text("Create BOM")');
    await expect(createBomLink).toHaveCount(0);

    // Save screenshot of Home after fresh login with collapsed sidebar
    const homeScreenshotPath = path.join(screenshotsDir, `home-collapsed-${viewportWidth}x${page.viewportSize()?.height || 768}.png`);
    await page.screenshot({ path: homeScreenshotPath });

    // Expand BOM group and check ITEM 12: Delete BOM has NO dot element (.rx-destructive-dot does not exist in DOM)
    await bomToggle.click();
    await expect(bomToggle).toHaveAttribute('aria-expanded', 'true');

    const deleteDot = page.locator('.rx-destructive-dot');
    await expect(deleteDot).toHaveCount(0);

    // Save screenshot of expanded sidebar with Delete BOM (no dot)
    const sidebarScreenshotPath = path.join(screenshotsDir, `sidebar-expanded-${viewportWidth}x${page.viewportSize()?.height || 768}.png`);
    await page.screenshot({ path: sidebarScreenshotPath });

    // Navigate to /products/bom/create/single -> verify BOM management group automatically expands
    await page.goto('/home', { waitUntil: 'domcontentloaded' });
    // Re-collapse
    await page.evaluate(() => {
      localStorage.setItem('rexa_sidebar_expanded_groups', JSON.stringify({ bom: false, admin: false }));
    });
    await page.goto('/products/bom/create/single', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#createBomMaterial', { state: 'visible', timeout: 8000 });

    const bomToggleOnCreate = page.locator('button[aria-label="BOM management"]');
    await expect(bomToggleOnCreate).toHaveAttribute('aria-expanded', 'true');
  });

  test('Item 4: App-wide Ex. check and F4 popup placeholder verification', async ({ page }, testInfo) => {
    const viewportWidth = page.viewportSize()?.width || 1366;
    if (viewportWidth < 900) {
      test.skip();
      return;
    }

    await setupMocks(page, { authenticated: true });
    await page.goto('/products/bom/create/single', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#createBomMaterial', { state: 'visible', timeout: 8000 });

    // Verify Material placeholder has "Ex. "
    const matInput = page.locator('#createBomMaterial');
    await expect(matInput).toHaveAttribute('placeholder', /Ex\.\s*A1BH0214C/);

    // Verify Plant placeholder has "Ex. "
    const plantInput = page.locator('#createBomPlant');
    await expect(plantInput).toHaveAttribute('placeholder', /Ex\.\s*1010/);

    // Open Material F4 popup and check "Ex."
    const f4Btn = page.locator('.rx-value-help-btn').first();
    await f4Btn.click();
    await page.waitForSelector('.sap-f4-modal-dialog', { state: 'visible', timeout: 8000 });

    // Check placeholder inside popup contains "Ex."
    const popupInputs = page.locator('.sap-f4-modal-dialog input');
    const count = await popupInputs.count();
    let foundEx = false;
    for (let i = 0; i < count; i++) {
      const ph = await popupInputs.nth(i).getAttribute('placeholder');
      if (ph && /Ex\./.test(ph)) {
        foundEx = true;
        break;
      }
    }
    expect(foundEx).toBe(true);

    // Assert NO "e.g." appears anywhere in the modal dialog text
    const modalText = await page.locator('.sap-f4-modal-dialog').innerText();
    expect(/e\.g\./i.test(modalText)).toBe(false);

    // Save screenshot of Material F4 popup
    const popupScreenshotPath = path.join(screenshotsDir, `f4-popup-${viewportWidth}x${page.viewportSize()?.height || 768}.png`);
    await page.screenshot({ path: popupScreenshotPath });
  });

});
