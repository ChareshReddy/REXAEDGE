import { test, expect } from '@playwright/test';
import { setupMocks } from './helpers/mockApi.js';
import { createSampleBulkCreateFile, createSampleBulkCopyFile } from './helpers/sampleFiles.js';
import path from 'path';

const SCREENSHOT_DIR = 'C:/Users/chare/.gemini/antigravity/brain/6fce99f3-5f59-4200-af87-677b5d74db10/screenshots';

// Calculate WCAG contrast
function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function parseRgb(rgbStr) {
  const match = rgbStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return [0, 0, 0];
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}

function getContrastRatio(rgbStr1, rgbStr2) {
  const [r1, g1, b1] = parseRgb(rgbStr1);
  const [r2, g2, b2] = parseRgb(rgbStr2);
  const l1 = getLuminance(r1, g1, b1);
  const l2 = getLuminance(r2, g2, b2);
  const brighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (brighter + 0.05) / (darker + 0.05);
}

test.describe('Dense Corporate SAP Business Application Theme Verification', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120000);
    await setupMocks(page, { authenticated: true, role: 'admin' });

    // Mock validation & execution endpoint responses for bulk flows
    await page.route('**/api/bom/validate-preflight', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          boms: [
            {
              status: 'Ready',
              material: 'A1PSB001B',
              plant: '1010',
              bomUsage: '1',
              alternativeBom: '25',
              baseQty: '100',
              baseUnit: 'EA',
              bomStatus: '01',
              validFrom: '12.11.2026',
              warnings: [],
              errors: []
            }
          ]
        })
      });
    });

    await page.route('**/api/bom/create', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          bomNumber: '00012345',
          message: 'BOM created successfully'
        })
      });
    });
  });

  // Shared assertion helper for dense corporate rules
  async function assertDenseCorporateStyles(page, screenName) {
    // 1. Page Header band (height between 80px and 100px)
    const pageHeader = page.locator('.fiori-ph');
    await expect(pageHeader.first()).toBeVisible({ timeout: 15000 });

    const phHeight = await pageHeader.first().evaluate(el => el.getBoundingClientRect().height);
    const hasTabs = (await page.locator('.sap-admin-nav-tab').count()) > 0;
    if (hasTabs) {
      expect(phHeight).toBeLessThanOrEqual(145);
    } else {
      expect(phHeight).toBeGreaterThanOrEqual(78);
      expect(phHeight).toBeLessThanOrEqual(102);
    }

    const phBg = await pageHeader.first().evaluate(el => window.getComputedStyle(el).backgroundColor);
    expect(phBg).toBe('rgb(11, 45, 87)'); // #0B2D57

    const title = page.locator('.fiori-ph-title').first();
    const titleColor = await title.evaluate(el => window.getComputedStyle(el).color);
    expect(titleColor).toBe('rgb(255, 255, 255)'); // #FFFFFF
    const titleContrast = getContrastRatio(titleColor, phBg);
    expect(titleContrast).toBeGreaterThanOrEqual(4.5);

    // 2. Card Header Band (height <= 52px on single-line headers, mid blue-gray #7F9DB9)
    const cardHeader = page.locator('.rx-form-section-header-tinted, [data-testid="rx-bulk-preview-header"]').first();
    if (await cardHeader.count() > 0 && await cardHeader.isVisible()) {
      const chHeight = await cardHeader.evaluate(el => el.getBoundingClientRect().height);
      expect(chHeight).toBeLessThanOrEqual(52);

      const chBg = await cardHeader.evaluate(el => window.getComputedStyle(el).backgroundColor);
      expect(chBg).toBe('rgb(127, 157, 185)'); // #7F9DB9 calm mid blue-gray

      const cardTitle = cardHeader.locator('.rx-form-section-title, .rx-card-title, h3').first();
      if (await cardTitle.count() > 0) {
        const cardTitleColor = await cardTitle.evaluate(el => window.getComputedStyle(el).color);
        expect(cardTitleColor).toBe('rgb(11, 45, 87)'); // #0B2D57 navy
        const cardContrast = getContrastRatio(cardTitleColor, chBg);
        expect(cardContrast).toBeGreaterThanOrEqual(4.5);
      }
    }

    // Table Header Row (light tint #DCE8F1 range rgb(220, 232, 241))
    const tableHeader = page.locator('table.sap-table th, .sap-admin-compact-table th').first();
    if (await tableHeader.count() > 0 && await tableHeader.isVisible()) {
      const thBg = await tableHeader.evaluate(el => window.getComputedStyle(el).backgroundColor);
      expect(thBg).toBe('rgb(220, 232, 241)'); // #DCE8F1 unchanged
    }

    // 3. Inputs (height 36px +-1, radius 4px, no shadow)
    const input = page.locator('input.rx-input, .rx-value-help-container').first();
    if (await input.count() > 0 && await input.isVisible()) {
      const inHeight = await input.evaluate(el => el.getBoundingClientRect().height);
      expect(Math.abs(inHeight - 36)).toBeLessThanOrEqual(1.5);

      const inRadius = await input.evaluate(el => window.getComputedStyle(el).borderRadius);
      expect(inRadius).toBe('4px');

      const inShadow = await input.evaluate(el => window.getComputedStyle(el).boxShadow);
      expect(inShadow).toBe('none');
    }

    // 4. Buttons (height 36px +-1 for standard buttons, radius 4px)
    const btn = page.locator('.rx-btn-primary, .sap-btn-primary, button.primary').first();
    if (await btn.count() > 0 && await btn.isVisible()) {
      const btnRadius = await btn.evaluate(el => window.getComputedStyle(el).borderRadius);
      expect(btnRadius).toBe('4px');
    }

    // 5. Cards (radius 4px, no shadow)
    const card = page.locator('.rx-card, .sap-card').first();
    if (await card.count() > 0 && await card.isVisible()) {
      const cardRadius = await card.evaluate(el => window.getComputedStyle(el).borderRadius);
      expect(cardRadius).toBe('4px');

      const cardShadow = await card.evaluate(el => window.getComputedStyle(el).boxShadow);
      expect(cardShadow).toBe('none');
    }

    // 6. No horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);
  }

  test('Density, sizes, radii, shadows, environment badge & all required screenshots', async ({ page }) => {
    const viewport = page.viewportSize();
    const vpSuffix = `${viewport.width}x${viewport.height}`;

    // 1. Home (Restored standalone hero, excluded from shared fiori-ph PageHeader band)
    await page.goto('/home', { waitUntil: 'networkidle' });
    await expect(page.locator('.rx-home-hero')).toBeVisible();
    await expect(page.locator('.fiori-ph')).toHaveCount(0); // Excluded from shared fiori-ph band (no double layer)
    await expect(page.locator('.rx-welcome-title')).toContainText('Welcome back');
    await expect(page.locator('.rx-hero-status-pill')).toContainText('Online');
    
    // Verify no horizontal overflow on Home
    const homeOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(homeOverflow).toBe(false);

    // Verify environment badge in top bar
    const envBadge = page.locator('[data-testid="server-environment-badge"]').first();
    if (await envBadge.count() > 0) {
      await expect(envBadge).toBeVisible();
      const badgeRadius = await envBadge.evaluate(el => window.getComputedStyle(el).borderRadius);
      expect(badgeRadius).toBe('4px'); // not pill
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `home-${vpSuffix}.png`), fullPage: false });

    // 2. Create Single BOM (Fit check on 1366x768 & Alt Text counter)
    await page.goto('/products/bom/create/single', { waitUntil: 'networkidle' });
    await assertDenseCorporateStyles(page, 'Create Single BOM');

    // Fit check: at 1366x768, Component Items band and table header row must be in viewport without scrolling
    if (viewport.width === 1366 && viewport.height === 768) {
      const compCardHeader = page.locator('.rx-form-section-title:has-text("Component Items")').first();
      await expect(compCardHeader).toBeVisible();
      const compBox = await compCardHeader.boundingBox();
      expect(compBox.y).toBeLessThan(768); // In viewport without scrolling!

      const tableHeader = page.locator('.rx-components-table th').first();
      await expect(tableHeader).toBeVisible();
      const tableBox = await tableHeader.boundingBox();
      expect(tableBox.y).toBeLessThan(768); // Table header also visible without scrolling!
    }

    // Character counter check: shows 0/40 and updates on typing
    const altCounter = page.locator('[data-testid="alt-text-counter"]');
    await expect(altCounter).toHaveText('0/40');
    const altInput = page.locator('#createBomAltText');
    await altInput.fill('Manufacturing variant');
    await expect(altCounter).toHaveText('21/40');
    await altInput.fill(''); // reset

    // Verify NO "Optional" hint text on form
    const formHints = await page.locator('.rx-field-hint').allTextContents();
    for (const hint of formHints) {
      expect(hint.toLowerCase()).not.toContain('optional');
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `create-single-bom-${vpSuffix}.png`), fullPage: false });

    // 3. Confirm BOM Creation modal
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
    await page.waitForTimeout(600);

    const previewBtn = page.locator('button:has-text("Preview & Create BOM")').first();
    await expect(previewBtn).toBeEnabled({ timeout: 5000 });
    await previewBtn.click();

    const modal = page.locator('[role="dialog"], .rx-modal-dialog, .sap-modal').first();
    await expect(modal).toBeVisible({ timeout: 5000 });
    // Verify modal radius is 6px and has soft shadow
    const modalRadius = await modal.evaluate(el => window.getComputedStyle(el).borderRadius);
    expect(modalRadius).toBe('6px');
    const modalShadow = await modal.evaluate(el => window.getComputedStyle(el).boxShadow);
    expect(modalShadow).not.toBe('none');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `confirm-create-modal-${vpSuffix}.png`), fullPage: false });
    // Close modal
    const cancelBtn = modal.locator('button:has-text("Cancel"), button:has-text("Close")').first();
    if (await cancelBtn.count() > 0) await cancelBtn.click();
    await page.waitForTimeout(300);

    // 4. Create Bulk BOM: Upload Step 1
    await page.goto('/products/bom/create/bulk', { waitUntil: 'networkidle' });
    await assertDenseCorporateStyles(page, 'Create Bulk BOM Upload');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `create-bulk-bom-step1-${vpSuffix}.png`), fullPage: false });

    // 5. Create Bulk BOM: Validated Preview Step 2
    const sampleCreateFile = createSampleBulkCreateFile();
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles({
        name: 'Batch_BOM_Create.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: sampleCreateFile
      });
      await page.waitForTimeout(400);
      const continueBtn = page.locator('button:has-text("Continue")').first();
      if (await continueBtn.isVisible()) {
        await continueBtn.click();
      }
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `create-bulk-bom-step2-${vpSuffix}.png`), fullPage: false });

      // 6. Create Bulk BOM: Results Step 3
      const execBtn = page.locator('button.create-ready-boms-btn, button:has-text("Create BOMs")').first();
      if (await execBtn.count() > 0 && await execBtn.isEnabled()) {
        await execBtn.click();
        const confirmModalBtn = page.locator('button:has-text("Confirm & Create")').first();
        if (await confirmModalBtn.count() > 0 && await confirmModalBtn.isVisible()) {
          await confirmModalBtn.click();
        }
        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `create-bulk-bom-results-${vpSuffix}.png`), fullPage: false });
      }
    }

    // 7. Copy Single BOM
    await page.goto('/products/bom/copy/single', { waitUntil: 'networkidle' });
    await assertDenseCorporateStyles(page, 'Copy Single BOM');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `copy-single-bom-${vpSuffix}.png`), fullPage: false });

    // 8. Copy Bulk BOM
    await page.goto('/products/bom/copy/bulk', { waitUntil: 'networkidle' });
    await assertDenseCorporateStyles(page, 'Copy Bulk BOM');
    const sampleCopyFile = createSampleBulkCopyFile();
    const copyFileInput = page.locator('input[type="file"]').first();
    if (await copyFileInput.count() > 0) {
      await copyFileInput.setInputFiles({
        name: 'Batch_BOM_Copy.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: sampleCopyFile
      });
      await page.waitForTimeout(400);
      const copyContinueBtn = page.locator('button:has-text("Continue")').first();
      if (await copyContinueBtn.isVisible()) {
        await copyContinueBtn.click();
        await page.waitForTimeout(500);

        const copyExecuteBtn = page.locator('button:has-text("Copy BOMs"), [data-testid="execute-copy-button"], .execute-batch-copy-btn').first();
        if (await copyExecuteBtn.count() > 0 && await copyExecuteBtn.isEnabled()) {
          await copyExecuteBtn.click();
          const confirmCopyBtn = page.locator('button:has-text("Confirm & Copy"), button:has-text("Confirm & Create"), button:has-text("Copy")').first();
          if (await confirmCopyBtn.count() > 0 && await confirmCopyBtn.isVisible()) {
            await confirmCopyBtn.click();
          }
          await page.waitForTimeout(800);
          await page.screenshot({ path: path.join(SCREENSHOT_DIR, `copy-bulk-results-${vpSuffix}.png`), fullPage: false });
        }
      }
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `copy-bulk-bom-${vpSuffix}.png`), fullPage: false });

    // 9. Display BOM (BomExplorerView)
    await page.goto('/products/bom/display', { waitUntil: 'networkidle' });
    await assertDenseCorporateStyles(page, 'Display BOM');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `display-bom-${vpSuffix}.png`), fullPage: false });

    // 10. Validate BOM
    await page.goto('/products/bom/validate', { waitUntil: 'networkidle' });
    await assertDenseCorporateStyles(page, 'Validate BOM');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `validate-bom-${vpSuffix}.png`), fullPage: false });

    // 11. Delete BOM
    await page.goto('/products/bom/delete', { waitUntil: 'networkidle' });
    await assertDenseCorporateStyles(page, 'Delete BOM');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `delete-bom-${vpSuffix}.png`), fullPage: false });

    // 12. Admin > Users & Create User modal
    await page.goto('/admin', { waitUntil: 'networkidle' });
    await assertDenseCorporateStyles(page, 'Admin Users');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `admin-users-${vpSuffix}.png`), fullPage: false });

    // Open Create User modal (modal with form)
    const addUserBtn = page.getByRole('button', { name: /Add User/i });
    if (await addUserBtn.isVisible()) {
      await addUserBtn.click();
      const userModal = page.locator('[role="dialog"]').first();
      await expect(userModal).toBeVisible();
      const userModalRadius = await userModal.evaluate(el => window.getComputedStyle(el).borderRadius);
      expect(userModalRadius).toBe('6px');
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `create-user-modal-${vpSuffix}.png`), fullPage: false });

      // Close modal
      const cancelUserBtn = page.getByRole('button', { name: /Cancel/i }).last();
      if (await cancelUserBtn.isVisible()) await cancelUserBtn.click();
    }

    // 13. Admin > Servers
    await page.goto('/admin/servers', { waitUntil: 'networkidle' });
    await assertDenseCorporateStyles(page, 'Admin Servers');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `admin-servers-${vpSuffix}.png`), fullPage: false });

    // 14. Audit Logs
    await page.goto('/admin/logs', { waitUntil: 'networkidle' });
    await assertDenseCorporateStyles(page, 'Audit Logs');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `admin-logs-audit-${vpSuffix}.png`), fullPage: false });
  });
});
