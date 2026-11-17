import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import { setupMocks } from './helpers/mockApi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const artifactDir = 'C:/Users/chare/.gemini/antigravity/brain/6fce99f3-5f59-4200-af87-677b5d74db10/screenshots/popups';

function createBulkCreateSpreadsheet() {
  const filePath = path.join(os.tmpdir(), `bulk_create_confirm_${Date.now()}.xlsx`);
  const data = [
    {
      Seq: 1,
      Material: 'MAT-CREATE-01',
      Plant: '1010',
      Component: 'C-COMP-01',
      Quantity: 10,
      'Storage Location': '0001',
      'BOM Usage': '1',
      'Alternative BOM': '01',
      'Item Category': 'L',
      'Valid From': '01.01.2026',
      'Base Qty': 1,
      'BOM Status': '01'
    },
    {
      Seq: 2,
      Material: 'MAT-CREATE-02',
      Plant: '1010',
      Component: 'C-COMP-02',
      Quantity: 20,
      'Storage Location': '0001',
      'BOM Usage': '1',
      'Alternative BOM': '01',
      'Item Category': 'L',
      'Valid From': '01.01.2026',
      'Base Qty': 1,
      'BOM Status': '01'
    }
  ];
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'CreateBoms');
  XLSX.writeFile(wb, filePath);
  return filePath;
}

function createBulkCopySpreadsheet() {
  const filePath = path.join(os.tmpdir(), `bulk_copy_confirm_${Date.now()}.xlsx`);
  const data = [
    {
      'Source Material': 'A1BH0214C',
      'Source Plant': '1010',
      'Source Usage': '1',
      'Source Alt BOM': '01',
      'Target Material': 'A1BH0214C',
      'Target Plant': '1010',
      'Target Usage': '1',
      'Target Alt BOM': '20'
    },
    {
      'Source Material': 'A1BH0214C',
      'Source Plant': '1010',
      'Source Usage': '1',
      'Source Alt BOM': '01',
      'Target Material': 'A1BH0214C',
      'Target Plant': '1010',
      'Target Usage': '1',
      'Target Alt BOM': '21'
    }
  ];
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'BatchCopy');
  XLSX.writeFile(wb, filePath);
  return filePath;
}

test.describe('Refined Popups: Single Create, Bulk Create, Bulk Copy', () => {
  for (const viewport of [
    { width: 1366, height: 768, name: '1366x768' },
    { width: 1920, height: 1080, name: '1920x1080' }
  ]) {
    test(`Confirmation popups at ${viewport.name}`, async ({ page }, testInfo) => {
      if (testInfo.project.name !== viewport.name) {
        test.skip();
      }

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await setupMocks(page, { authenticated: true });

      // Mock material lookup
      await page.route('**/api/materials/**', async (route) => {
        const url = route.request().url();
        const matMatch = url.match(/\/api\/materials\/([^?]+)/);
        const matnr = matMatch ? decodeURIComponent(matMatch[1]) : 'A1PSB001B';
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { matnr, werks: '1010', meins: 'EA', maktx: 'Test Material Description' },
            materials: [{ matnr, werks: '1010', meins: 'EA', maktx: 'Test Material Description' }]
          })
        });
      });

      // Mock single preflight
      await page.route('**/api/bom/create-preflight', async (route) => {
        const req = route.request();
        let postData = {};
        try {
          postData = req.postDataJSON() || {};
        } catch (_) {}
        const bom = postData.bom || {};

        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            boms: [
              {
                status: 'Ready',
                material: bom.material || 'A1PSB001B',
                plant: bom.plant || '1010',
                bomUsage: bom.bomUsage || '1',
                alternativeBom: bom.alternativeBom || '25',
                baseQty: bom.baseQty || '100',
                baseUnit: 'EA',
                bomStatus: bom.bomStatus || '01',
                validFrom: bom.validFrom || '12.11.2026',
                warnings: [],
                errors: []
              }
            ]
          })
        });
      });

      // ==========================================
      // 1. POPUP 1: SINGLE CREATE BOM (1 Component)
      // ==========================================
      await page.goto('/products/bom/create/single', { waitUntil: 'networkidle' });
      await page.waitForSelector('#createBomMaterial', { state: 'visible', timeout: 10000 });

      await page.fill('#createBomMaterial', 'A1PSB001B');
      await page.fill('#createBomPlant', '1010');
      await page.fill('#createBomUsage', '1');
      await page.fill('#createBomAlt', '25');
      await page.fill('#createBomBaseQty', '100');

      const firstRow = page.locator('table.sap-table tbody tr').first();
      await firstRow.locator('input').first().fill('D4PSB001B');
      await firstRow.locator('input[aria-label*="Quantity"]').first().fill('1');
      await firstRow.locator('input').nth(3).fill('PR67');

      const validateBtn = page.locator('button:has-text("Validate Master Data")').first();
      await expect(validateBtn).toBeEnabled();
      await validateBtn.click();

      const createBomBtn = page.locator('button:has-text("Preview & Create BOM")').first();
      await expect(createBomBtn).toBeEnabled({ timeout: 8000 });
      await createBomBtn.click();

      const singleModal = page.locator('[role="dialog"]').first();
      await expect(singleModal).toBeVisible({ timeout: 5000 });
      await expect(singleModal.locator('text=Confirm BOM Creation').first()).toBeVisible();

      // Check header details 2-column grid
      await expect(page.locator('[data-testid="confirm-detail-material"]')).toHaveText('A1PSB001B');
      await expect(page.locator('[data-testid="confirm-detail-plant"]')).toHaveText('1010');
      await expect(page.locator('[data-testid="confirm-detail-usage"]')).toHaveText('1');
      await expect(page.locator('[data-testid="confirm-detail-alternative"]')).toHaveText('25');
      await expect(page.locator('[data-testid="confirm-detail-baseqty"]')).toContainText('100');
      await expect(page.locator('[data-testid="confirm-detail-status"]')).toHaveText('01');

      // Check Components section heading
      await expect(page.locator('[data-testid="confirm-components-heading"]')).toHaveText('Components (1)');

      // Check sticky column header labels
      const compContainer = page.locator('[data-testid="confirm-bom-components-container"]');
      await expect(compContainer.getByText('Item', { exact: true })).toBeVisible();
      await expect(compContainer.getByText('Component', { exact: true })).toBeVisible();
      await expect(compContainer.getByText('Quantity', { exact: true })).toBeVisible();
      await expect(compContainer.getByText('Item category', { exact: true })).toBeVisible();
      await expect(compContainer.getByText('Storage location', { exact: true })).toBeVisible();

      // Check row 0 contents with uppercase storage location
      const compRow0 = page.locator('[data-testid="confirm-component-row-0"]');
      await expect(compRow0).toBeVisible();
      const row0Text = await compRow0.innerText();
      expect(row0Text).toContain('0010');
      expect(row0Text).toContain('D4PSB001B');
      expect(row0Text).toContain('1');
      expect(row0Text).toContain('L');
      expect(row0Text).toContain('PR67');

      // Check height fits content & footer buttons visible
      const singleBox1 = await singleModal.boundingBox();
      expect(singleBox1).not.toBeNull();
      if (viewport.width === 1366) {
        expect(singleBox1.height).toBeLessThan(520);
      }
      await expect(singleModal.locator('button:has-text("Confirm & Create")')).toBeVisible();
      await expect(singleModal.locator('button:has-text("Cancel")')).toBeVisible();

      // Screenshot 1: Single Create with 1 Component
      const shot1 = path.join(artifactDir, `confirm-single-1comp-${viewport.name}.png`);
      await page.screenshot({ path: shot1, fullPage: false });

      // Close modal
      await singleModal.locator('button:has-text("Cancel")').click();
      await expect(singleModal).not.toBeVisible();

      // ==========================================
      // 2. POPUP 1: SINGLE CREATE BOM (10 Components)
      // ==========================================
      const addRowBtn = page.locator('button:has-text("Add Component")').first();
      for (let i = 2; i <= 10; i++) {
        await addRowBtn.click();
        const row = page.locator('table.sap-table tbody tr').nth(i - 1);
        await row.locator('input').first().fill(`COMP-000${i}`);
        await row.locator('input[aria-label*="Quantity"]').first().fill(String(i * 2));
        await row.locator('input').nth(3).fill('PR67');
      }

      await validateBtn.click();
      await expect(createBomBtn).toBeEnabled({ timeout: 8000 });
      await createBomBtn.click();

      await expect(singleModal).toBeVisible({ timeout: 5000 });
      await expect(page.locator('[data-testid="confirm-components-heading"]')).toHaveText('Components (10)');

      // Verify list scrolls internally
      const isScrollable = await compContainer.evaluate((el) => el.scrollHeight > el.clientHeight);
      expect(isScrollable).toBe(true);

      // Verify footer buttons remain pinned & visible
      await expect(singleModal.locator('button:has-text("Confirm & Create")')).toBeVisible();

      // Screenshot 2: Single Create with 10 Components
      const shot2 = path.join(artifactDir, `confirm-single-10comp-${viewport.name}.png`);
      await page.screenshot({ path: shot2, fullPage: false });

      // Close modal
      await singleModal.locator('button:has-text("Cancel")').click();
      await expect(singleModal).not.toBeVisible();

      // ==========================================
      // 3. POPUP 3: BULK CREATE BOM CONFIRMATION
      // ==========================================
      await page.goto('/products/bom/create/bulk', { waitUntil: 'networkidle' });

      // Mock bulk validate
      await page.route('**/api/bom/create-preflight-bulk', async (route) => {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            boms: [
              { id: '1', material: 'MAT-CREATE-01', plant: '1010', status: 'Ready', errors: [], warnings: [] },
              { id: '2', material: 'MAT-CREATE-02', plant: '1010', status: 'Ready', errors: [], warnings: [] }
            ]
          })
        });
      });

      const createFilePath = createBulkCreateSpreadsheet();
      const fileChooserPromise1 = page.waitForEvent('filechooser');
      await page.click('button:has-text("Browse file")');
      const fileChooser1 = await fileChooserPromise1;
      await fileChooser1.setFiles(createFilePath);

      const continueBtn1 = page.locator('button:has-text("Continue")');
      if (await continueBtn1.isVisible()) {
        await continueBtn1.click();
      }

      await page.click('button:has-text("Validate Data")');
      const bulkCreateBtn = page.locator('.create-ready-boms-btn');
      await expect(bulkCreateBtn).toBeEnabled({ timeout: 10000 });
      await bulkCreateBtn.click();

      const bulkCreateModal = page.locator('.rx-bulk-confirm-modal, [role="dialog"]').first();
      await expect(bulkCreateModal).toBeVisible({ timeout: 5000 });
      await expect(bulkCreateModal.locator('text=Confirm Bulk BOM Creation')).toBeVisible();
      await expect(bulkCreateModal.locator('text=You are about to create')).toBeVisible();

      // Assert file chip
      const fileChipCreate = bulkCreateModal.locator('[data-testid="bulk-confirm-file-chip"]');
      await expect(fileChipCreate).toBeVisible();

      // Assert 3 summary tiles
      const tileReadyCreate = bulkCreateModal.locator('[data-testid="bulk-confirm-tile-ready"]');
      const tileSkippedCreate = bulkCreateModal.locator('[data-testid="bulk-confirm-tile-skipped"]');
      const tileInvalidCreate = bulkCreateModal.locator('[data-testid="bulk-confirm-tile-invalid"]');
      await expect(tileReadyCreate).toBeVisible();
      await expect(tileSkippedCreate).toBeVisible();
      await expect(tileInvalidCreate).toBeVisible();

      await expect(tileReadyCreate.locator('text=Ready to create')).toBeVisible();
      await expect(tileSkippedCreate.locator('text=Skipped (existing)')).toBeVisible();
      await expect(tileInvalidCreate.locator('text=Invalid (will not run)')).toBeVisible();

      // Footnote
      await expect(bulkCreateModal.locator('[data-testid="bulk-confirm-footnote"]')).toHaveText('Only Ready BOMs are sent to SAP.');

      // Footer buttons
      const confirmCreateBtn = bulkCreateModal.locator('button:has-text("Confirm & Create")');
      await expect(confirmCreateBtn).toBeEnabled();

      // Screenshot 3: Bulk Create Confirm Popup
      const shot3 = path.join(artifactDir, `confirm-bulk-create-${viewport.name}.png`);
      await page.screenshot({ path: shot3, fullPage: false });

      await bulkCreateModal.locator('button:has-text("Cancel")').click();
      await expect(bulkCreateModal).not.toBeVisible();

      // ==========================================
      // 4. POPUP 2: BULK COPY BOM CONFIRMATION
      // ==========================================
      await page.goto('/products/bom/copy/bulk', { waitUntil: 'networkidle' });

      // Mock batch copy validation
      await page.route('**/api/bom/batch-validate', async (route) => {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            results: [
              { id: '1', status: 'VALID', message: 'Valid for copy' },
              { id: '2', status: 'WARNING', message: 'Target alt already exists' }
            ]
          })
        });
      });

      const copyFilePath = createBulkCopySpreadsheet();
      const fileChooserPromise2 = page.waitForEvent('filechooser');
      await page.click('button:has-text("Browse file")');
      const fileChooser2 = await fileChooserPromise2;
      await fileChooser2.setFiles(copyFilePath);

      const continueBtn2 = page.locator('button:has-text("Continue")');
      if (await continueBtn2.isVisible()) {
        await continueBtn2.click();
      }

      await page.click('button:has-text("Validate Data")');
      const copyExecuteBtn = page.locator('button:has-text("Copy BOMs")');
      await expect(copyExecuteBtn).toBeEnabled({ timeout: 10000 });

      // Ensure NO window.confirm dialog is triggered
      let windowConfirmFired = false;
      page.on('dialog', (dialog) => {
        windowConfirmFired = true;
        dialog.dismiss();
      });

      await copyExecuteBtn.click();
      expect(windowConfirmFired).toBe(false);

      const bulkCopyModal = page.locator('.rx-bulk-confirm-modal, [role="dialog"]').first();
      await expect(bulkCopyModal).toBeVisible({ timeout: 5000 });
      await expect(bulkCopyModal.locator('text=Confirm Bulk BOM Copy')).toBeVisible();
      await expect(bulkCopyModal.locator('text=You are about to copy')).toBeVisible();

      // Assert file chip
      const fileChipCopy = bulkCopyModal.locator('[data-testid="bulk-confirm-file-chip"]');
      await expect(fileChipCopy).toBeVisible();

      // Assert 3 summary tiles
      const tileReadyCopy = bulkCopyModal.locator('[data-testid="bulk-confirm-tile-ready"]');
      const tileSkippedCopy = bulkCopyModal.locator('[data-testid="bulk-confirm-tile-skipped"]');
      const tileInvalidCopy = bulkCopyModal.locator('[data-testid="bulk-confirm-tile-invalid"]');
      await expect(tileReadyCopy).toBeVisible();
      await expect(tileSkippedCopy).toBeVisible();
      await expect(tileInvalidCopy).toBeVisible();

      await expect(tileReadyCopy.locator('text=Ready to copy')).toBeVisible();
      await expect(tileSkippedCopy.locator('text=Skipped')).toBeVisible();
      await expect(tileInvalidCopy.locator('text=Invalid (will not run)')).toBeVisible();

      // Footnote
      await expect(bulkCopyModal.locator('[data-testid="bulk-confirm-footnote"]')).toHaveText('Only Ready BOMs are copied.');

      // Footer buttons
      const confirmCopyBtn = bulkCopyModal.locator('button:has-text("Confirm & Copy")');
      await expect(confirmCopyBtn).toBeEnabled();

      // Screenshot 4: Bulk Copy Confirm Popup
      const shot4 = path.join(artifactDir, `confirm-bulk-copy-${viewport.name}.png`);
      await page.screenshot({ path: shot4, fullPage: false });

      await bulkCopyModal.locator('button:has-text("Cancel")').click();
      await expect(bulkCopyModal).not.toBeVisible();
    });
  }
});
