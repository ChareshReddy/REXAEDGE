import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';
import { setupMocks } from './helpers/mockApi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const screenshotsDir = path.resolve(__dirname, '../screenshots');
const artifactDir = 'C:/Users/chare/.gemini/antigravity/brain/670a18b0-0002-4036-b6f5-4b4c0c22c519';

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}
if (!fs.existsSync(artifactDir)) {
  fs.mkdirSync(artifactDir, { recursive: true });
}

async function saveScreenshot(page, filename) {
  const localPath = path.join(screenshotsDir, filename);
  await page.screenshot({ path: localPath, fullPage: false });
  const artPath = path.join(artifactDir, filename);
  fs.copyFileSync(localPath, artPath);
}

// 5-row spreadsheet for Bulk Copy
function createCopySpreadsheet() {
  const data = [
    {
      'Source Material': 'MAT_READY_01',
      'Source Plant': '1012',
      'Source BOM Usage': '1',
      'Source Alternative': '01',
      'Target Material': 'MAT_READY_01',
      'Target Plant': '1001',
      'Target BOM Usage': '1',
      'Target Alternative': '02'
    },
    {
      'Source Material': 'MAT_WARN_02',
      'Source Plant': '1012',
      'Source BOM Usage': '1',
      'Source Alternative': '01',
      'Target Material': 'MAT_WARN_02',
      'Target Plant': '1001',
      'Target BOM Usage': '1',
      'Target Alternative': '03'
    },
    {
      'Source Material': 'MAT_FAIL_03',
      'Source Plant': '1012',
      'Source BOM Usage': '1',
      'Source Alternative': '01',
      'Target Material': 'MAT_FAIL_03',
      'Target Plant': '1001',
      'Target BOM Usage': '1',
      'Target Alternative': '04'
    },
    {
      'Source Material': 'MAT_FAIL_04',
      'Source Plant': '1012',
      'Source BOM Usage': '1',
      'Source Alternative': '01',
      'Target Material': 'MAT_FAIL_04',
      'Target Plant': '1001',
      'Target BOM Usage': '1',
      'Target Alternative': '05'
    },
    {
      'Source Material': 'MAT_SKIP_05',
      'Source Plant': '1012',
      'Source BOM Usage': '1',
      'Source Alternative': '01',
      'Target Material': 'MAT_SKIP_05',
      'Target Plant': '1001',
      'Target BOM Usage': '1',
      'Target Alternative': '01'
    }
  ];
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// 6-row spreadsheet for Bulk Create (4 BOM groups)
function createCreateSpreadsheet() {
  const data = [
    // Group 1: 2 items, valid
    {
      'Sequence Number': '1',
      'Material': 'BOM_CREATE_01',
      'Plant': '1001',
      'BOM Usage': '1',
      'Alternative BOM': '01',
      'Valid From': '2026-01-01',
      'Base Quantity': '1',
      'BOM Status': '1',
      'Item Category': 'L',
      'Component': 'COMP_101',
      'Component Quantity': '2'
    },
    {
      'Sequence Number': '1',
      'Material': 'BOM_CREATE_01',
      'Plant': '1001',
      'BOM Usage': '1',
      'Alternative BOM': '01',
      'Valid From': '2026-01-01',
      'Base Quantity': '1',
      'BOM Status': '1',
      'Item Category': 'L',
      'Component': 'COMP_102',
      'Component Quantity': '4'
    },
    // Group 2: 1 item, valid with warning
    {
      'Sequence Number': '2',
      'Material': 'BOM_CREATE_02_WARN',
      'Plant': '1001',
      'BOM Usage': '1',
      'Alternative BOM': '01',
      'Valid From': '2026-01-01',
      'Base Quantity': '1',
      'BOM Status': '1',
      'Item Category': 'L',
      'Component': 'COMP_201',
      'Component Quantity': '1'
    },
    // Group 3: 2 items, 1 component error -> entire group error
    {
      'Sequence Number': '3',
      'Material': 'BOM_CREATE_03_FAIL',
      'Plant': '1001',
      'BOM Usage': '1',
      'Alternative BOM': '01',
      'Valid From': '2026-01-01',
      'Base Quantity': '1',
      'BOM Status': '1',
      'Item Category': 'L',
      'Component': 'COMP_301',
      'Component Quantity': '5'
    },
    {
      'Sequence Number': '3',
      'Material': 'BOM_CREATE_03_FAIL',
      'Plant': '1001',
      'BOM Usage': '1',
      'Alternative BOM': '01',
      'Valid From': '2026-01-01',
      'Base Quantity': '1',
      'BOM Status': '1',
      'Item Category': 'L',
      'Component': 'COMP_302',
      'Component Quantity': '10'
    },
    // Group 4: 1 item, skipped (exists)
    {
      'Sequence Number': '4',
      'Material': 'BOM_CREATE_04_SKIP',
      'Plant': '1001',
      'BOM Usage': '1',
      'Alternative BOM': '01',
      'Valid From': '2026-01-01',
      'Base Quantity': '1',
      'BOM Status': '1',
      'Item Category': 'L',
      'Component': 'COMP_401',
      'Component Quantity': '3'
    }
  ];
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

const VIEWPORTS = [
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1920x1080', width: 1920, height: 1080 }
];

test.describe('Bulk Summary Cards Filter & Status Classification', () => {
  for (const vp of VIEWPORTS) {
    // ------------------------------------------------------------------------
    // TEST 1: BULK COPY BOM
    // ------------------------------------------------------------------------
    test(`Bulk Copy BOM Cards Filter at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await setupMocks(page, { authenticated: true });

      const mockValidationResults = [
        {
          id: 1,
          sourceMaterial: 'MAT_READY_01',
          sourcePlant: '1012',
          sourceUsage: '1',
          sourceAltBom: '01',
          targetMaterial: 'MAT_READY_01',
          targetPlant: '1001',
          targetUsage: '1',
          targetAltBom: '02',
          status: 'VALID',
          message: 'Ready to copy',
          messageType: 'success',
          componentCount: 12,
          errors: [],
          warnings: []
        },
        {
          id: 2,
          sourceMaterial: 'MAT_WARN_02',
          sourcePlant: '1012',
          sourceUsage: '1',
          sourceAltBom: '01',
          targetMaterial: 'MAT_WARN_02',
          targetPlant: '1001',
          targetUsage: '1',
          targetAltBom: '03',
          status: 'VALID',
          message: 'Header material MAT_WARN_02 is not extended to plant 1001 (MARC).',
          messageType: 'warning',
          componentCount: 14,
          errors: [],
          warnings: ['Header material MAT_WARN_02 is not extended to plant 1001 (MARC).']
        },
        {
          id: 3,
          sourceMaterial: 'MAT_FAIL_03',
          sourcePlant: '1012',
          sourceUsage: '1',
          sourceAltBom: '01',
          targetMaterial: 'MAT_FAIL_03',
          targetPlant: '1001',
          targetUsage: '1',
          targetAltBom: '04',
          status: 'FAILED',
          message: 'Component RAW_MAT_01 does not exist in plant 1001.',
          messageType: 'error',
          componentCount: 8,
          errors: ['Component RAW_MAT_01 does not exist in plant 1001.'],
          warnings: []
        },
        {
          id: 4,
          sourceMaterial: 'MAT_FAIL_04',
          sourcePlant: '1012',
          sourceUsage: '1',
          sourceAltBom: '01',
          targetMaterial: 'MAT_FAIL_04',
          targetPlant: '1001',
          targetUsage: '1',
          targetAltBom: '05',
          status: 'FAILED',
          message: 'Unit of measure for component RAW_MAT_02 not found in master data (MARA-MEINS).',
          messageType: 'error',
          componentCount: 6,
          errors: ['Unit of measure for component RAW_MAT_02 not found in master data (MARA-MEINS).'],
          warnings: []
        },
        {
          id: 5,
          sourceMaterial: 'MAT_SKIP_05',
          sourcePlant: '1012',
          sourceUsage: '1',
          sourceAltBom: '01',
          targetMaterial: 'MAT_SKIP_05',
          targetPlant: '1001',
          targetUsage: '1',
          targetAltBom: '01',
          status: 'SKIPPED',
          message: 'Alternative 01 already exists for MAT_SKIP_05 in plant 1001.',
          messageType: 'skipped',
          componentCount: 10,
          errors: [],
          warnings: []
        }
      ];

      const handleCopyValidationJob = async (route) => {
        const req = route.request();
        const url = req.url();
        const method = req.method();

        if (url.includes('/start') || method === 'POST') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              jobId: 'job-copy-validate-5',
              total: 5,
              status: 'PROCESSING'
            })
          });
        }

        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            job: {
              id: 'job-copy-validate-5',
              type: 'copy_validate',
              status: 'COMPLETED',
              processed: 5,
              total: 5,
              successCount: 2,
              failedCount: 2,
              skippedCount: 1,
              notProcessedCount: 0,
              results: mockValidationResults
            }
          })
        });
      };

      await page.route('**/api/bom/jobs/**', handleCopyValidationJob);
      await page.route('**/api/bom-jobs/**', handleCopyValidationJob);

      await page.goto('/products/bom/copy/bulk', { waitUntil: 'networkidle' });
      await page.waitForSelector('.rx-bulk-upload-card, .bulk-upload-dropzone', { state: 'visible', timeout: 10000 });

      // Upload spreadsheet
      const fileBuffer = createCopySpreadsheet();
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles({
        name: 'Bulk_Copy_5Rows.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: fileBuffer
      });

      await page.waitForTimeout(300);

      // Advance to Preview
      const continueBtn = page.locator('button:has-text("Continue")').first();
      await expect(continueBtn).toBeEnabled({ timeout: 5000 });
      await continueBtn.click();

      // Trigger Validate data
      const validateBtn = page.locator('button:has-text("Validate data")').first();
      await expect(validateBtn).toBeVisible({ timeout: 8000 });
      await validateBtn.click();

      // Wait for validation to finish and validated results to populate cards
      await expect(page.locator('button.rx-stat-ready[aria-label="Ready: 2"]')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('.sap-bulk-table tbody tr.row-status-ready')).toHaveCount(2);

      // 1. ASSERTION: Old filter tabs are NOT in DOM
      const oldTabs = page.locator('.sap-toolbar button:has-text("All ("), .sap-toolbar button:has-text("Ready (")');
      await expect(oldTabs).toHaveCount(0);

      // 2. ASSERTION: 4 summary cards exist with exact counts
      const allCard = page.locator('button.rx-stat-all, button[aria-label="Total BOMs: 5"]');
      const readyCard = page.locator('button.rx-stat-ready, button[aria-label="Ready: 2"]');
      const errorsCard = page.locator('button.rx-stat-errors, button[aria-label="Errors: 2"]');
      const skippedCard = page.locator('button.rx-stat-skipped, button[aria-label="Skipped: 1"]');

      await expect(allCard).toBeVisible();
      await expect(readyCard).toBeVisible();
      await expect(errorsCard).toBeVisible();
      await expect(skippedCard).toBeVisible();

      // Counts sum: Ready (2) + Errors (2) + Skipped (1) = Total BOMs (5)
      // Check no filter selected state
      const rowsInitial = page.locator('.sap-bulk-table tbody tr:not(.bom-messages-row)');
      await expect(rowsInitial).toHaveCount(5);
      await expect(readyCard).toHaveAttribute('aria-pressed', 'false');
      await expect(errorsCard).toHaveAttribute('aria-pressed', 'false');
      await expect(skippedCard).toHaveAttribute('aria-pressed', 'false');
      await expect(page.locator('text=Showing 5 of 5')).toBeVisible();

      // Screenshot 1: Copy - No filter selected
      await saveScreenshot(page, `bulk-copy-no-filter-${vp.name}.png`);

      // Click Ready card
      await readyCard.click();
      await page.waitForTimeout(200);
      await expect(readyCard).toHaveAttribute('aria-pressed', 'true');
      const rowsReady = page.locator('.sap-bulk-table tbody tr:not(.bom-messages-row)');
      await expect(rowsReady).toHaveCount(2);
      await expect(page.locator('text=Showing 2 of 5')).toBeVisible();
      // Screenshot 2: Copy - Ready selected
      await saveScreenshot(page, `bulk-copy-ready-selected-${vp.name}.png`);

      // Click Errors card
      await errorsCard.click();
      await page.waitForTimeout(200);
      await expect(errorsCard).toHaveAttribute('aria-pressed', 'true');
      await expect(readyCard).toHaveAttribute('aria-pressed', 'false');
      const rowsErrors = page.locator('.sap-bulk-table tbody tr:not(.bom-messages-row)');
      await expect(rowsErrors).toHaveCount(2);
      await expect(page.locator('text=Showing 2 of 5')).toBeVisible();
      // Screenshot 3: Copy - Errors selected
      await saveScreenshot(page, `bulk-copy-errors-selected-${vp.name}.png`);

      // Click Skipped card
      await skippedCard.click();
      await page.waitForTimeout(200);
      await expect(skippedCard).toHaveAttribute('aria-pressed', 'true');
      await expect(errorsCard).toHaveAttribute('aria-pressed', 'false');
      const rowsSkipped = page.locator('.sap-bulk-table tbody tr:not(.bom-messages-row)');
      await expect(rowsSkipped).toHaveCount(1);
      await expect(page.locator('text=Showing 1 of 5')).toBeVisible();
      // Screenshot 4: Copy - Skipped selected
      await saveScreenshot(page, `bulk-copy-skipped-selected-${vp.name}.png`);

      // Click active card again to clear filter (show all)
      await skippedCard.click();
      await page.waitForTimeout(200);
      await expect(skippedCard).toHaveAttribute('aria-pressed', 'false');
      await expect(page.locator('.sap-bulk-table tbody tr:not(.bom-messages-row)')).toHaveCount(5);
      await expect(page.locator('text=Showing 5 of 5')).toBeVisible();

      // Test Search + Card filter combined
      const searchBox = page.locator('input[placeholder*="Search"]').first();
      await searchBox.fill('NONEXISTENT_XYZ');
      await page.waitForTimeout(200);
      await expect(page.locator('text=Showing 0 of 5')).toBeVisible();
      await expect(page.locator('text=No rows match this filter.')).toBeVisible();
      await expect(page.locator('button:has-text("Clear filter")')).toBeVisible();
      // Screenshot 5: Copy - Empty result
      await saveScreenshot(page, `bulk-copy-empty-result-${vp.name}.png`);

      // Click Clear filter button
      await page.locator('button:has-text("Clear filter")').click();
      await page.waitForTimeout(200);
      await expect(page.locator('.sap-bulk-table tbody tr:not(.bom-messages-row)')).toHaveCount(5);
      await expect(page.locator('text=Showing 5 of 5')).toBeVisible();

      // Check no horizontal overflow
      const hasOverflow = await page.evaluate(() => {
        const flowContainer = document.querySelector('.rx-bulk-flow-container') || document.body;
        return flowContainer.scrollWidth > flowContainer.clientWidth + 2;
      });
      expect(hasOverflow).toBe(false);
    });

    // ------------------------------------------------------------------------
    // TEST 2: BULK CREATE BOM
    // ------------------------------------------------------------------------
    test(`Bulk Create BOM Cards Filter at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await setupMocks(page, { authenticated: true });

      const mockCreatePreflightResults = [
        {
          sequenceNum: '1',
          material: 'BOM_CREATE_01',
          plant: '1001',
          bomUsage: '1',
          alternativeBom: '01',
          status: 'Ready',
          message: 'BOM valid for creation',
          messageType: 'success',
          errors: [],
          warnings: [],
          components: [
            { component: 'COMP_101', status: 'VALID' },
            { component: 'COMP_102', status: 'VALID' }
          ]
        },
        {
          sequenceNum: '2',
          material: 'BOM_CREATE_02_WARN',
          plant: '1001',
          bomUsage: '1',
          alternativeBom: '01',
          status: 'Ready',
          message: 'Header plant MARC warning',
          messageType: 'warning',
          errors: [],
          warnings: ['Header material not extended to plant (MARC).'],
          components: [
            { component: 'COMP_201', status: 'VALID' }
          ]
        },
        {
          sequenceNum: '3',
          material: 'BOM_CREATE_03_FAIL',
          plant: '1001',
          bomUsage: '1',
          alternativeBom: '01',
          status: 'Ready', // Header was Ready, but component has error!
          message: 'Component error',
          errors: [],
          warnings: [],
          components: [
            { component: 'COMP_301', status: 'VALID' },
            { component: 'COMP_302', status: 'ERROR', error: 'Component does not exist in plant 1001' }
          ]
        },
        {
          sequenceNum: '4',
          material: 'BOM_CREATE_04_SKIP',
          plant: '1001',
          bomUsage: '1',
          alternativeBom: '01',
          status: 'Skipped',
          message: 'Alternative 01 already exists for BOM_CREATE_04_SKIP in plant 1001.',
          messageType: 'skipped',
          errors: [],
          warnings: [],
          components: [
            { component: 'COMP_401', status: 'VALID' }
          ]
        }
      ];

      const handleCreateValidationJob = async (route) => {
        const req = route.request();
        const url = req.url();
        const method = req.method();

        if (url.includes('/start') || method === 'POST') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              jobId: 'create-job-filter-01',
              total: 4,
              status: 'PROCESSING'
            })
          });
        }

        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            job: {
              id: 'create-job-filter-01',
              type: 'create_preflight',
              status: 'COMPLETED',
              processed: 4,
              total: 4,
              successCount: 2,
              failedCount: 1,
              skippedCount: 1,
              notProcessedCount: 0,
              results: mockCreatePreflightResults
            }
          })
        });
      };

      await page.route('**/api/bom/jobs/**', handleCreateValidationJob);
      await page.route('**/api/bom-jobs/**', handleCreateValidationJob);

      await page.goto('/products/bom/create/bulk', { waitUntil: 'networkidle' });
      await page.waitForSelector('.rx-bulk-upload-card, .bulk-upload-dropzone', { state: 'visible', timeout: 10000 });

      // Upload spreadsheet
      const fileBuffer = createCreateSpreadsheet();
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles({
        name: 'Bulk_Create_4Groups.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: fileBuffer
      });

      await page.waitForTimeout(300);

      // Advance to Preview
      const continueBtn = page.locator('button:has-text("Continue")').first();
      await expect(continueBtn).toBeEnabled({ timeout: 5000 });
      await continueBtn.click();

      // Trigger Validate data
      const validateBtn = page.locator('button:has-text("Validate data")').first();
      await expect(validateBtn).toBeVisible({ timeout: 8000 });
      await validateBtn.click();

      // Wait for validation to finish and validated results to populate cards
      await expect(page.locator('button.rx-stat-ready[aria-label="Ready: 2"]')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('.preflight-preview-table tbody tr.bom-group-first-row')).toHaveCount(4);

      // 1. ASSERTION: Old filter tabs are NOT in DOM
      const oldTabs = page.locator('.sap-toolbar button:has-text("All ("), .sap-toolbar button:has-text("Ready (")');
      await expect(oldTabs).toHaveCount(0);

      // 2. ASSERTION: 4 summary cards exist with exact counts
      const allCard = page.locator('button.rx-stat-all, button[aria-label="Total BOMs: 4"]');
      const readyCard = page.locator('button.rx-stat-ready, button[aria-label="Ready: 2"]');
      const errorsCard = page.locator('button.rx-stat-errors, button[aria-label="Errors: 1"]');
      const skippedCard = page.locator('button.rx-stat-skipped, button[aria-label="Skipped: 1"]');

      await expect(allCard).toBeVisible();
      await expect(readyCard).toBeVisible();
      await expect(errorsCard).toBeVisible();
      await expect(skippedCard).toBeVisible();

      // Counts sum: Ready (2) + Errors (1) + Skipped (1) = Total BOMs (4)
      const groupsInitial = page.locator('.preflight-preview-table tbody tr.bom-group-first-row');
      await expect(groupsInitial).toHaveCount(4);
      await expect(readyCard).toHaveAttribute('aria-pressed', 'false');
      await expect(errorsCard).toHaveAttribute('aria-pressed', 'false');
      await expect(skippedCard).toHaveAttribute('aria-pressed', 'false');
      await expect(page.locator('text=Showing 4 of 4')).toBeVisible();

      // Screenshot 1: Create - No filter selected
      await saveScreenshot(page, `bulk-create-no-filter-${vp.name}.png`);

      // Click Ready card
      await readyCard.click();
      await page.waitForTimeout(200);
      await expect(readyCard).toHaveAttribute('aria-pressed', 'true');
      const groupsReady = page.locator('.preflight-preview-table tbody tr.bom-group-first-row');
      await expect(groupsReady).toHaveCount(2);
      await expect(page.locator('text=Showing 2 of 4')).toBeVisible();
      // Screenshot 2: Create - Ready selected
      await saveScreenshot(page, `bulk-create-ready-selected-${vp.name}.png`);

      // Click Errors card
      await errorsCard.click();
      await page.waitForTimeout(200);
      await expect(errorsCard).toHaveAttribute('aria-pressed', 'true');
      await expect(readyCard).toHaveAttribute('aria-pressed', 'false');
      const groupsErrors = page.locator('.preflight-preview-table tbody tr.bom-group-first-row');
      await expect(groupsErrors).toHaveCount(1);
      await expect(page.locator('text=Showing 1 of 4')).toBeVisible();
      // Component rows of group 3 stay together (2 component rows)
      const compRowsGroup3 = page.locator('.preflight-preview-table tbody tr.component-row');
      await expect(compRowsGroup3).toHaveCount(2);
      // Screenshot 3: Create - Errors selected
      await saveScreenshot(page, `bulk-create-errors-selected-${vp.name}.png`);

      // Click Skipped card
      await skippedCard.click();
      await page.waitForTimeout(200);
      await expect(skippedCard).toHaveAttribute('aria-pressed', 'true');
      await expect(errorsCard).toHaveAttribute('aria-pressed', 'false');
      const groupsSkipped = page.locator('.preflight-preview-table tbody tr.bom-group-first-row');
      await expect(groupsSkipped).toHaveCount(1);
      await expect(page.locator('text=Showing 1 of 4')).toBeVisible();
      // Screenshot 4: Create - Skipped selected
      await saveScreenshot(page, `bulk-create-skipped-selected-${vp.name}.png`);

      // Click Total BOMs card to clear filter
      await allCard.click();
      await page.waitForTimeout(200);
      await expect(skippedCard).toHaveAttribute('aria-pressed', 'false');
      await expect(page.locator('.preflight-preview-table tbody tr.bom-group-first-row')).toHaveCount(4);
      await expect(page.locator('text=Showing 4 of 4')).toBeVisible();

      // Empty result test
      const searchBox = page.locator('input[placeholder*="Search"]').first();
      await searchBox.fill('NONEXISTENT_XYZ');
      await page.waitForTimeout(200);
      await expect(page.locator('text=Showing 0 of 4')).toBeVisible();
      await expect(page.locator('text=No rows match this filter.')).toBeVisible();
      await expect(page.locator('button:has-text("Clear filter")')).toBeVisible();
      // Screenshot 5: Create - Empty result
      await saveScreenshot(page, `bulk-create-empty-result-${vp.name}.png`);

      // Click Clear filter button
      await page.locator('button:has-text("Clear filter")').click();
      await page.waitForTimeout(200);
      await expect(page.locator('.preflight-preview-table tbody tr.bom-group-first-row')).toHaveCount(4);
      await expect(page.locator('text=Showing 4 of 4')).toBeVisible();

      // Check no horizontal overflow
      const hasOverflow = await page.evaluate(() => {
        const flowContainer = document.querySelector('.rx-bulk-flow-container') || document.body;
        return flowContainer.scrollWidth > flowContainer.clientWidth + 2;
      });
      expect(hasOverflow).toBe(false);
    });
  }
});
