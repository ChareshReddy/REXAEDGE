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

// 4-row spreadsheet for Not-Validated State preview
function create4RowSpreadsheet() {
  const data = [
    {
      'Source Material': 'A1BH0214C',
      'Source Plant': '1012',
      'Source BOM Usage': '1',
      'Source Alternative': '01',
      'Target Material': 'A1BH0214C',
      'Target Plant': '1001',
      'Target BOM Usage': '1',
      'Target Alternative': '02'
    },
    {
      'Source Material': 'B2CH0315D',
      'Source Plant': '1012',
      'Source BOM Usage': '1',
      'Source Alternative': '01',
      'Target Material': 'B2CH0315D',
      'Target Plant': '1001',
      'Target BOM Usage': '1',
      'Target Alternative': '02'
    },
    {
      'Source Material': 'C3DH0416E',
      'Source Plant': '1012',
      'Source BOM Usage': '1',
      'Source Alternative': '01',
      'Target Material': 'C3DH0416E',
      'Target Plant': '1001',
      'Target BOM Usage': '1',
      'Target Alternative': '02'
    },
    {
      'Source Material': 'D4EH0517F',
      'Source Plant': '1012',
      'Source BOM Usage': '1',
      'Source Alternative': '01',
      'Target Material': 'D4EH0517F',
      'Target Plant': '1001',
      'Target BOM Usage': '1',
      'Target Alternative': '02'
    }
  ];

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// 5-row spreadsheet for Validated Preview (1 ready no msg, 1 ready with warning, 2 failed, 1 skipped)
function create5RowSpreadsheet() {
  const data = [
    // 1. Ready row (no warning)
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
    // 2. Ready row (with MARC plant extension warning)
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
    // 3. Failed row 1
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
    // 4. Failed row 2
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
    // 5. Skipped row (alternative exists)
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

const VIEWPORTS = [
  { width: 1366, height: 768, name: '1366x768' },
  { width: 1920, height: 1080, name: '1920x1080' }
];

test.describe('Bulk BOM Message Severity and State Refinements', () => {
  for (const vp of VIEWPORTS) {
    test(`Bulk Copy Preview: Not-Validated & Validated States at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await setupMocks(page, { authenticated: true });

      // Navigate to Bulk Copy BOM
      await page.goto('/products/bom/copy/bulk', { waitUntil: 'networkidle' });
      await page.waitForSelector('.rx-bulk-upload-card, .bulk-upload-dropzone', { state: 'visible', timeout: 10000 });

      // ----------------------------------------------------------------------
      // PHASE 1: Not-Validated State (4 rows)
      // ----------------------------------------------------------------------
      const fileBuffer4 = create4RowSpreadsheet();
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles({
        name: 'Bulk_Copy_NotValidated_4Rows.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: fileBuffer4
      });

      await page.waitForTimeout(400);

      // Advance to Step 2 Preview
      const continueBtn = page.locator('button:has-text("Continue")').first();
      await expect(continueBtn).toBeEnabled({ timeout: 5000 });
      await continueBtn.click();

      // Data Preview table appears immediately
      await page.waitForSelector('.sap-bulk-table', { state: 'visible', timeout: 8000 });
      await page.waitForTimeout(400);

      // 1. Assert exactly 4 data rows rendered
      const tableRows = page.locator('.sap-bulk-table tbody tr:not(.bom-messages-row)');
      await expect(tableRows).toHaveCount(4);

      // 2. Assert NO message lines rendered under rows
      const messageRows = page.locator('.bom-messages-row');
      await expect(messageRows).toHaveCount(0);
      const msgItems = page.locator('.bom-msg-item');
      await expect(msgItems).toHaveCount(0);

      // 3. Assert NO red or tinted row backgrounds or red error borders
      const errorRows = page.locator('.sap-bulk-table tr.row-status-error');
      await expect(errorRows).toHaveCount(0);

      // 4. Assert neutral "Not validated" badges on all rows
      const notValBadges = page.locator('.sap-bulk-table .sap-badge-neutral:has-text("Not validated")');
      await expect(notValBadges).toHaveCount(4);

      // 5. Assert summary line: "Not validated (4 BOMs)"
      const summaryNotVal = page.locator('text=Not validated (4 BOMs)');
      await expect(summaryNotVal).toBeVisible();

      // 6. Assert copy action button is disabled
      const copyBtn = page.locator('.execute-batch-copy-btn, .btn-execute-copy, button:has-text("Copy BOMs")').first();
      await expect(copyBtn).toBeDisabled();

      // 7. Assert Errors filter and count do not count unvalidated rows (Errors: 0) and is not clickable
      const errorsCard = page.locator('button.rx-stat-errors, button[aria-label="Errors: 0"]');
      await expect(errorsCard).toBeVisible();
      await expect(errorsCard).toBeDisabled();

      // Take screenshot of Not-Validated state (4 rows)
      await saveScreenshot(page, `bulk-preview-not-validated-${vp.name}.png`);

      // ----------------------------------------------------------------------
      // PHASE 2: Validated State (1 ready, 1 ready with warning, 2 failed, 1 skipped)
      // ----------------------------------------------------------------------
      // Clear and upload 5-row spreadsheet
      const clearBtn = page.locator('button:has-text("Clear & Upload Another")').first();
      await clearBtn.click();
      await page.waitForSelector('.rx-bulk-upload-card, .bulk-upload-dropzone', { state: 'visible', timeout: 8000 });

      // Mock the 5-row validation endpoint
      const mockValidationResults = [
        // Row 1: Ready (no warning)
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
          message: 'Ready to copy (Alternative 02 auto-selected, 12 components)',
          messageType: 'success',
          type: 'success',
          componentCount: 12,
          errors: [],
          warnings: []
        },
        // Row 2: Ready (with real warning: not extended to plant MARC)
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
          message: 'Ready to copy (Alternative 03 auto-selected, 14 components)',
          messageType: 'success',
          type: 'success',
          componentCount: 14,
          warnings: [
            { text: 'Header material MAT_WARN_02 is not extended to plant 1001 (MARC)', type: 'warning' }
          ],
          errors: []
        },
        // Row 3: Failed row 1
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
          status: 'ERROR',
          message: 'Cannot copy: Component RAW_MAT_01 does not exist in plant 1001.',
          messageType: 'error',
          componentCount: 8,
          errors: ['Component RAW_MAT_01 does not exist in plant 1001.']
        },
        // Row 4: Failed row 2
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
          status: 'ERROR',
          message: 'Cannot copy: Unit of measure for component RAW_MAT_02 not found in master data (MARA-MEINS).',
          messageType: 'error',
          componentCount: 6,
          errors: ['Unit of measure for component RAW_MAT_02 not found in master data (MARA-MEINS).']
        },
        // Row 5: Skipped row
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
          componentCount: 10
        }
      ];

      const handleValidationJob = async (route) => {
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

      await page.route('**/api/bom/jobs/**', handleValidationJob);
      await page.route('**/api/bom-jobs/**', handleValidationJob);
      await page.route('**/api/boms/batch-validate**', async (route) => {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            summary: { total: 5, valid: 2, invalid: 2, warnings: 1, skipped: 1 },
            results: mockValidationResults
          })
        });
      });

      const fileBuffer5 = create5RowSpreadsheet();
      const fileInput2 = page.locator('input[type="file"]').first();
      await fileInput2.setInputFiles({
        name: 'Bulk_Copy_Validated_5Rows.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: fileBuffer5
      });

      await page.waitForTimeout(400);

      // Advance to Step 2 Preview
      const continueBtn2 = page.locator('button:has-text("Continue")').first();
      await expect(continueBtn2).toBeEnabled({ timeout: 5000 });
      await continueBtn2.click();

      await page.waitForSelector('.sap-bulk-table', { state: 'visible', timeout: 8000 });

      // Click "Validate with SAP" button
      const validateBtn = page.locator('.validate-with-sap-btn').first();
      await expect(validateBtn).toBeVisible({ timeout: 5000 });
      await validateBtn.click();

      // Wait for validation results (ready badge visible)
      await expect(page.locator('.col-result .sap-badge-success').first()).toBeVisible({ timeout: 10000 });
      await page.waitForTimeout(500);

      // --- ASSERTIONS ON VALIDATED PREVIEW ---

      // 1. Ready count is 2 (both MAT_READY_01 and MAT_WARN_02 have green Ready badges)
      const readyBadges = page.locator('.col-result .sap-badge-success');
      await expect(readyBadges).toHaveCount(2);

      // 2. Ready row MAT_READY_01 (no warning):
      // Must have NO message line under it
      const readyRow1 = page.locator('tr:not(.bom-messages-row):has-text("MAT_READY_01")');
      await expect(readyRow1).toBeVisible();
      const readyRow1Messages = readyRow1.locator('+ tr.bom-messages-row');
      await expect(readyRow1Messages).toHaveCount(0);

      // 3. Ready row MAT_WARN_02 (with real warning: MARC extension):
      // Must show an amber warning line with AlertTriangle
      const readyRow2 = page.locator('tr:not(.bom-messages-row):has-text("MAT_WARN_02")');
      await expect(readyRow2).toBeVisible();
      const warningItem = page.locator('.bom-msg-item.bom-msg-warning');
      await expect(warningItem).toBeVisible();
      await expect(warningItem).toContainText('Header material MAT_WARN_02 is not extended to plant 1001 (MARC)');
      const warningSvgColor = await warningItem.locator('svg').evaluate(el => window.getComputedStyle(el).color);
      expect(warningSvgColor).toContain('217, 119, 6'); // #D97706 rgb(217, 119, 6)
      // Row 2 remains Ready and green
      const readyRow2Badge = readyRow2.locator('.col-result .sap-badge-success');
      await expect(readyRow2Badge).toBeVisible();

      // 4. Failed rows: keep red lines with AlertCircle
      const errorItems = page.locator('.bom-msg-item.bom-msg-error');
      await expect(errorItems).toHaveCount(2);
      const errorSvgColor = await errorItems.first().locator('svg').evaluate(el => window.getComputedStyle(el).color);
      expect(errorSvgColor).toContain('180, 35, 24'); // #B42318 rgb(180, 35, 24)

      // 5. Skipped row: keeps neutral slate line with MinusCircle
      const skippedItem = page.locator('.bom-msg-item.bom-msg-skipped');
      await expect(skippedItem).toBeVisible();
      await expect(skippedItem).toContainText('Alternative 01 already exists');
      const skippedSvgColor = await skippedItem.locator('svg').evaluate(el => window.getComputedStyle(el).color);
      expect(skippedSvgColor).toContain('122, 140, 163'); // #7A8CA3 rgb(122, 140, 163)

      // 6. Action button counts Ready rows (2) and is enabled
      const executeBtn = page.locator('.execute-batch-copy-btn, .btn-execute-copy, button:has-text("Copy")').first();
      await expect(executeBtn).toBeEnabled();

      // 7. Validation summary badges: Ready: 2, Errors: 2, Skipped: 1
      await expect(page.locator('.sap-badge-success:has-text("Ready: 2")')).toBeVisible();
      await expect(page.locator('.sap-badge-danger:has-text("Errors: 2")')).toBeVisible();
      await expect(page.locator('.sap-badge-neutral:has-text("Skipped: 1")')).toBeVisible();

      // Take screenshot of Validated state (5 rows)
      await saveScreenshot(page, `bulk-preview-validated-${vp.name}.png`);
    });
  }
});