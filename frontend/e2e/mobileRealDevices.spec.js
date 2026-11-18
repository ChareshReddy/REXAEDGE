import { test, expect } from '@playwright/test';
import { setupMocks } from './helpers/mockApi.js';
import { createSampleBulkCreateFile, createSampleBulkCopyFile } from './helpers/sampleFiles.js';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { calculatePixelDiff } = require('./helpers/imageDiff.cjs');

const ARTIFACT_DIR = 'C:/Users/chare/.gemini/antigravity/brain/6fce99f3-5f59-4200-af87-677b5d74db10';
const MOBILE_DIR = path.join(ARTIFACT_DIR, 'screenshots/mobile');
const BASELINE_DIR = path.join(ARTIFACT_DIR, 'screenshots/baseline');
const POST_DIR = path.join(ARTIFACT_DIR, 'screenshots/post-change');

for (const dir of [MOBILE_DIR, POST_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Real Device Descriptors
const REAL_DEVICES = [
  {
    id: 'iphone-se',
    name: 'iPhone SE',
    viewport: { width: 375, height: 667 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
  },
  {
    id: 'iphone-13',
    name: 'iPhone 13',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
  },
  {
    id: 'pixel-7',
    name: 'Pixel 7',
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36'
  },
  {
    id: 'android-small',
    name: 'Small Android',
    viewport: { width: 360, height: 640 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-G960F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36'
  },
  {
    id: 'ipad-mini-portrait',
    name: 'iPad Mini Portrait',
    viewport: { width: 768, height: 1024 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
  },
  {
    id: 'ipad-mini-landscape',
    name: 'iPad Mini Landscape',
    viewport: { width: 1024, height: 768 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
  },
  {
    id: 'iphone-13-landscape',
    name: 'iPhone 13 Landscape',
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
  }
];

// Helper: automated DOM overflow checker
async function checkDomOverflow(page) {
  return await page.evaluate(() => {
    const vpWidth = window.innerWidth;
    const elements = Array.from(document.querySelectorAll('body *'));
    const overflowing = [];
    const zeroSizeWithText = [];

    for (const el of elements) {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        continue;
      }

      // Check if element is inside an intended horizontal scroll container
      let insideScrollContainer = false;
      let parent = el.parentElement;
      while (parent && parent !== document.body) {
        const pStyle = window.getComputedStyle(parent);
        if (['auto', 'scroll'].includes(pStyle.overflowX) && parent.scrollWidth > parent.clientWidth) {
          insideScrollContainer = true;
          break;
        }
        parent = parent.parentElement;
      }

      const rect = el.getBoundingClientRect();

      // Check right overflow beyond viewport outside scroll container
      if (!insideScrollContainer) {
        if (rect.right > vpWidth + 2 && rect.width > 0) {
          const tag = el.tagName.toLowerCase();
          const cls = el.className ? `.${String(el.className).trim().split(/\s+/).slice(0, 2).join('.')}` : '';
          overflowing.push({ selector: `${tag}${cls}`, right: Math.round(rect.right), vpWidth });
        }
      }

      // Check zero width/height with non-empty text (excluding invisible assistive elements like sr-only or spacers)
      if ((rect.width === 0 || rect.height === 0) && el.children.length === 0) {
        const text = el.textContent ? el.textContent.trim() : '';
        if (text.length > 0 && !style.clip?.includes('rect(0') && style.position !== 'absolute') {
          const tag = el.tagName.toLowerCase();
          const cls = el.className ? `.${String(el.className).trim().split(/\s+/).slice(0, 2).join('.')}` : '';
          zeroSizeWithText.push({ selector: `${tag}${cls}`, text: text.slice(0, 20) });
        }
      }
    }

    return { overflowing, zeroSizeWithText };
  });
}

// Function to test all pages for a given device
async function runDeviceVerification(browser, dev) {
  const context = await browser.newContext({
    viewport: dev.viewport,
    deviceScaleFactor: dev.deviceScaleFactor,
    isMobile: dev.isMobile,
    hasTouch: dev.hasTouch,
    userAgent: dev.userAgent
  });

  const page = await context.newPage();
  await setupMocks(page, { authenticated: true, role: 'admin' });

  const devPrefix = `${dev.id}`;
  let overflowCount = 0;

  // 1. Display BOM (16 components loaded)
  await page.goto('/products/bom/display', { waitUntil: 'networkidle' });
  await expect(page.locator('.fiori-ph-title').first()).toBeVisible();

  await page.fill('#expMaterial, input[name="material"]', 'A1BH0214C');
  await page.fill('#expPlant, input[name="plant"]', '1010');
  const displayBtn = page.locator('form button[type="submit"]').first();
  await displayBtn.click();
  await page.waitForTimeout(300);

  const tableRows = page.locator('.sap-table tbody tr');
  await expect(tableRows).toHaveCount(16);

  if (dev.viewport.width <= 640) {
    const metaGridCols = await page.evaluate(() => {
      const el = document.querySelector('.sap-result-meta-grid');
      return el ? window.getComputedStyle(el).gridTemplateColumns.split(' ').length : 0;
    });
    expect(metaGridCols).toBe(2);
  }

  const overflowDisplay = await checkDomOverflow(page);
  overflowCount += overflowDisplay.overflowing.length;
  expect(overflowDisplay.overflowing.length, `Overflow on Display BOM at ${dev.name}: ${JSON.stringify(overflowDisplay.overflowing)}`).toBe(0);

  await page.screenshot({ path: path.join(MOBILE_DIR, `display-bom-${devPrefix}-full.png`), fullPage: true });

  const tableContainer = page.locator('.sap-table-container, .sap-card-table-scroll').first();
  if (await tableContainer.isVisible()) {
    await tableContainer.evaluate(el => { el.scrollLeft = 300; });
    await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(MOBILE_DIR, `display-bom-${devPrefix}-table-scrolled.png`), fullPage: false });
  }

  // 2. Create Single BOM
  await page.goto('/products/bom/create/single', { waitUntil: 'networkidle' });
  await expect(page.locator('.fiori-ph-title').first()).toBeVisible();

  const addCompBtn = page.locator('.rx-btn-add-component, .sap-btn-add-component, button:has-text("Add Component")').first();
  if (await addCompBtn.isVisible()) {
    await addCompBtn.click();
    await page.waitForTimeout(100);
  }

  const overflowCreate = await checkDomOverflow(page);
  overflowCount += overflowCreate.overflowing.length;
  expect(overflowCreate.overflowing.length, `Overflow on Create Single at ${dev.name}: ${JSON.stringify(overflowCreate.overflowing)}`).toBe(0);

  await page.screenshot({ path: path.join(MOBILE_DIR, `create-single-${devPrefix}-full.png`), fullPage: true });

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(MOBILE_DIR, `create-single-${devPrefix}-footer.png`), fullPage: false });

  // 3. Create Bulk BOM (Preview with 14 rows)
  await page.goto('/products/bom/create/bulk', { waitUntil: 'networkidle' });
  await expect(page.locator('.fiori-ph-title').first()).toBeVisible();

  const bulkBuffer = createSampleBulkCreateFile();
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles({
    name: 'Batch_BOM_Create.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: bulkBuffer
  });
  await page.waitForTimeout(200);
  const continueBtn = page.locator('button:has-text("Continue")').first();
  await continueBtn.click();
  await page.waitForTimeout(300);

  await page.waitForSelector('.sap-bulk-table-container, .preflight-preview-table', { timeout: 5000 });
  const overflowBulk = await checkDomOverflow(page);
  overflowCount += overflowBulk.overflowing.length;
  expect(overflowBulk.overflowing.length, `Overflow on Bulk Create Preview at ${dev.name}: ${JSON.stringify(overflowBulk.overflowing)}`).toBe(0);

  await page.screenshot({ path: path.join(MOBILE_DIR, `create-bulk-preview-${devPrefix}-full.png`), fullPage: true });

  // 4. Copy Single BOM
  await page.goto('/products/bom/copy/single', { waitUntil: 'networkidle' });
  await expect(page.locator('.fiori-ph-title').first()).toBeVisible();

  const overflowCopy = await checkDomOverflow(page);
  overflowCount += overflowCopy.overflowing.length;
  expect(overflowCopy.overflowing.length, `Overflow on Copy Single at ${dev.name}: ${JSON.stringify(overflowCopy.overflowing)}`).toBe(0);

  await page.screenshot({ path: path.join(MOBILE_DIR, `copy-single-${devPrefix}-full.png`), fullPage: true });

  // 5. Home Page
  await page.goto('/home', { waitUntil: 'networkidle' });
  await expect(page.locator('h1, h2, .fiori-home-tabs').first()).toBeVisible();

  const overflowHome = await checkDomOverflow(page);
  overflowCount += overflowHome.overflowing.length;
  expect(overflowHome.overflowing.length, `Overflow on Home at ${dev.name}: ${JSON.stringify(overflowHome.overflowing)}`).toBe(0);

  await page.screenshot({ path: path.join(MOBILE_DIR, `home-${devPrefix}-full.png`), fullPage: true });

  // 6. Admin Users
  await page.goto('/admin/users', { waitUntil: 'networkidle' });
  await expect(page.locator('.fiori-ph-title').first()).toBeVisible();

  const overflowAdminUsers = await checkDomOverflow(page);
  overflowCount += overflowAdminUsers.overflowing.length;
  expect(overflowAdminUsers.overflowing.length, `Overflow on Admin Users at ${dev.name}: ${JSON.stringify(overflowAdminUsers.overflowing)}`).toBe(0);

  await page.screenshot({ path: path.join(MOBILE_DIR, `admin-users-${devPrefix}-full.png`), fullPage: true });

  // 7. Admin Logs
  await page.goto('/admin/logs/audit', { waitUntil: 'networkidle' });
  await expect(page.locator('.fiori-ph-title').first()).toBeVisible();

  const overflowAdminLogs = await checkDomOverflow(page);
  overflowCount += overflowAdminLogs.overflowing.length;
  expect(overflowAdminLogs.overflowing.length, `Overflow on Admin Logs at ${dev.name}: ${JSON.stringify(overflowAdminLogs.overflowing)}`).toBe(0);

  await page.screenshot({ path: path.join(MOBILE_DIR, `admin-logs-${devPrefix}-full.png`), fullPage: true });

  // 8. Login Page
  await setupMocks(page, { authenticated: false });
  await page.goto('/signin', { waitUntil: 'networkidle' });
  await expect(page.locator('.rx-login-card, .sap-login-card, form').first()).toBeVisible();

  const overflowLogin = await checkDomOverflow(page);
  overflowCount += overflowLogin.overflowing.length;
  expect(overflowLogin.overflowing.length, `Overflow on Login at ${dev.name}: ${JSON.stringify(overflowLogin.overflowing)}`).toBe(0);

  await page.screenshot({ path: path.join(MOBILE_DIR, `login-${devPrefix}-full.png`), fullPage: true });

  // 9. Popups on iPhone 13
  if (dev.id === 'iphone-13') {
    await setupMocks(page, { authenticated: true, role: 'admin' });

    // Popup 1: Confirm BOM Creation
    await page.goto('/products/bom/create/single', { waitUntil: 'networkidle' });
    await page.waitForSelector('#createBomMaterial', { state: 'visible', timeout: 10000 });
    await page.fill('#createBomMaterial', 'A1BH0214C');
    await page.fill('#createBomPlant', '1010');
    await page.fill('#createBomUsage', '1');
    await page.fill('#createBomAlt', '01');
    await page.fill('#createBomBaseQty', '1');

    const firstRow = page.locator('table.sap-table tbody tr').first();
    await firstRow.locator('input').first().fill('C3DH0416E');
    await firstRow.locator('input[aria-label*="Quantity"]').first().fill('5');
    await firstRow.locator('input').nth(3).fill('0001');

    const validateBtn = page.locator('button:has-text("Validate Master Data")').first();
    await expect(validateBtn).toBeEnabled();
    await validateBtn.click();

    const previewCreateBtn = page.locator('button:has-text("Preview & Create BOM")').first();
    await expect(previewCreateBtn).toBeEnabled({ timeout: 8000 });
    await previewCreateBtn.click();
    await page.waitForTimeout(300);

    const confirmSingleModal = page.locator('.confirm-bom-creation-modal-card, .sap-modal-dialog').first();
    await expect(confirmSingleModal).toBeVisible();

    const overflowPopupSingle = await checkDomOverflow(page);
    expect(overflowPopupSingle.overflowing.length, `Popup single overflow: ${JSON.stringify(overflowPopupSingle.overflowing)}`).toBe(0);

    await page.screenshot({ path: path.join(MOBILE_DIR, 'popup-confirm-single-iphone-13.png'), fullPage: false });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Popup 2: Confirm Bulk Create
    await page.goto('/products/bom/create/bulk', { waitUntil: 'networkidle' });
    const createBuff = createSampleBulkCreateFile();
    const fileIn = page.locator('input[type="file"]').first();
    await fileIn.setInputFiles({
      name: 'Batch_BOM_Create.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: createBuff
    });
    await page.waitForTimeout(200);
    const contBtn = page.locator('button:has-text("Continue")').first();
    await contBtn.click();
    await page.waitForTimeout(300);

    const validateDataBtn = page.locator('button:has-text("Validate Data")').first();
    if (await validateDataBtn.isVisible()) {
      await validateDataBtn.click();
      await page.waitForTimeout(200);
    }

    const bulkCreateBtn = page.locator('.create-ready-boms-btn, button:has-text("Create BOMs")').first();
    if (await bulkCreateBtn.isVisible()) {
      await expect(bulkCreateBtn).toBeEnabled({ timeout: 10000 });
      await bulkCreateBtn.click();
      await page.waitForTimeout(200);
      const bulkCreateModal = page.locator('.rx-bulk-confirm-modal, .sap-modal-dialog').first();
      await expect(bulkCreateModal).toBeVisible({ timeout: 5000 });
      await page.screenshot({ path: path.join(MOBILE_DIR, 'popup-confirm-bulk-create-iphone-13.png'), fullPage: false });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }

    // Popup 3: Confirm Bulk Copy
    await page.goto('/products/bom/copy/bulk', { waitUntil: 'networkidle' });
    const copyBuff = createSampleBulkCopyFile();
    const copyFileIn = page.locator('input[type="file"]').first();
    await copyFileIn.setInputFiles({
      name: 'Batch_BOM_Copy.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: copyBuff
    });
    await page.waitForTimeout(200);
    const copyContBtn = page.locator('button:has-text("Continue")').first();
    await copyContBtn.click();
    await page.waitForTimeout(300);

    const copyValidateBtn = page.locator('button:has-text("Validate Data")').first();
    if (await copyValidateBtn.isVisible()) {
      await copyValidateBtn.click();
      await page.waitForTimeout(200);
    }

    const copyExecuteBtn = page.locator('button:has-text("Copy BOMs")').first();
    if (await copyExecuteBtn.isVisible()) {
      await expect(copyExecuteBtn).toBeEnabled({ timeout: 10000 });
      await copyExecuteBtn.click();
      await page.waitForTimeout(200);
      const bulkCopyModal = page.locator('.rx-bulk-confirm-modal, .sap-modal-dialog').first();
      await expect(bulkCopyModal).toBeVisible({ timeout: 5000 });
      await page.screenshot({ path: path.join(MOBILE_DIR, 'popup-confirm-bulk-copy-iphone-13.png'), fullPage: false });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }
  }

  await context.close();
  return { device: dev.name, overflowCount };
}

test.describe('Real Mobile Devices Emulation & Responsiveness Suite', () => {

  for (const dev of REAL_DEVICES) {
    test(`Device Verification: ${dev.name} (${dev.viewport.width}x${dev.viewport.height})`, async ({ browser }, testInfo) => {
      test.skip(testInfo.project.name !== '1366x768', 'Runs once on default project');
      test.setTimeout(dev.id === 'iphone-13' ? 180000 : 90000);
      const result = await runDeviceVerification(browser, dev);
      expect(result.overflowCount).toBe(0);
    });
  }

  // Desktop Zero-Regression Check (1366x768 and 1920x1080)
  test('Desktop Zero-Regression Verification (< 0.1% diff)', async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== '1366x768', 'Desktop regression check runs once');

    const viewports = [
      { name: '1366x768', width: 1366, height: 768 },
      { name: '1920x1080', width: 1920, height: 1080 }
    ];

    for (const vp of viewports) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      await setupMocks(page, { authenticated: true, role: 'admin' });

      const pagesToVerify = [
        { name: 'create-single', url: '/products/bom/create/single' },
        { name: 'display-bom', url: '/products/bom/display' },
        { name: 'copy-single', url: '/products/bom/copy/single' },
        { name: 'admin-users', url: '/admin/users' }
      ];

      for (const p of pagesToVerify) {
        await page.goto(p.url, { waitUntil: 'networkidle' });
        await page.waitForSelector('.fiori-ph-title', { timeout: 5000 });
        await page.evaluate(() => {
          if (document.activeElement && document.activeElement.blur) {
            document.activeElement.blur();
          }
          // Remove any stray toasts if lingering
          document.querySelectorAll('.sap-toast, .rx-toast-banner').forEach(el => el.remove());
        });
        await page.waitForTimeout(200);

        const currentBuf = await page.screenshot({ fullPage: false });
        const baselineFile = path.join(BASELINE_DIR, `${p.name}-${vp.name}.png`);

        if (fs.existsSync(baselineFile)) {
          const baselineBuf = fs.readFileSync(baselineFile);
          const diff = calculatePixelDiff(baselineBuf, currentBuf);
          console.log(`[DESKTOP REGRESSION] ${p.name} @ ${vp.name}: ${diff.diffPercent?.toFixed(3)}% diff`);
          expect(diff.diffRatio, `${p.name} at ${vp.name} exceeded diff limit`).toBeLessThanOrEqual(0.001);
        }
      }

      await context.close();
    }
  });

});
