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

function create6BomSpreadsheet() {
  const data = [
    {
      Seq: 1,
      Material: 'MAT-FIN-01',
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
      Material: 'MAT-FIN-02',
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
    },
    {
      Seq: 3,
      Material: 'MAT-FIN-03',
      Plant: '1010',
      Component: 'C-COMP-03',
      Quantity: 30,
      'Storage Location': '0001',
      'BOM Usage': '1',
      'Alternative BOM': '01',
      'Item Category': 'L',
      'Valid From': '01.01.2026',
      'Base Qty': 1,
      'BOM Status': '01'
    },
    {
      Seq: 4,
      Material: 'MAT-FAIL-LONG-04',
      Plant: '1010',
      Component: 'C-COMP-101',
      Quantity: 40,
      'Storage Location': '0001',
      'BOM Usage': '1',
      'Alternative BOM': '01',
      'Item Category': 'L',
      'Valid From': '01.01.2026',
      'Base Qty': 1,
      'BOM Status': '01'
    },
    {
      Seq: 5,
      Material: 'MAT-FAIL-LONG-05',
      Plant: '1010',
      Component: 'C-COMP-201',
      Quantity: 50,
      'Storage Location': '0001',
      'BOM Usage': '1',
      'Alternative BOM': '01',
      'Item Category': 'L',
      'Valid From': '01.01.2026',
      'Base Qty': 1,
      'BOM Status': '01'
    },
    {
      Seq: 6,
      Material: 'MAT-DISCREP-06',
      Plant: '1010',
      Component: 'C-COMP-301',
      Quantity: 60,
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
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

test.describe('Bulk Create BOM - Final Step Execution Details Table', () => {
  for (const viewport of [
    { width: 1366, height: 768, name: '1366x768' },
    { width: 1920, height: 1080, name: '1920x1080' }
  ]) {
    test(`Execution Details table at ${viewport.name} with 6 mock rows (2 created, 1 skipped, 3 failed)`, async ({ page }, testInfo) => {
      if (testInfo.project.name !== viewport.name) {
        test.skip();
      }

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await setupMocks(page, { authenticated: true });

      const mockExecutionResults = [
        {
          sequenceNum: 1,
          material: 'MAT-FIN-01',
          plant: '1010',
          bomUsage: '1',
          alternativeBom: '01',
          bomNumber: '00010045',
          status: 'SUCCESS',
          componentsCount: 3,
          message: 'BOM 00010045 created and verified in SAP plant 1010.'
        },
        {
          sequenceNum: 2,
          material: 'MAT-FIN-02',
          plant: '1010',
          bomUsage: '1',
          alternativeBom: '01',
          bomNumber: '00010046',
          status: 'SUCCESS',
          componentsCount: 4,
          message: 'BOM 00010046 created successfully.'
        },
        {
          sequenceNum: 3,
          material: 'MAT-FIN-03',
          plant: '1010',
          bomUsage: '1',
          alternativeBom: '01',
          bomNumber: '00009988',
          status: 'SKIPPED',
          message: 'BOM already exists for material MAT-FIN-03 in plant 1010; skipped to prevent duplicate.'
        },
        {
          sequenceNum: 4,
          material: 'MAT-FAIL-LONG-04',
          plant: '1010',
          bomUsage: '1',
          alternativeBom: '01',
          bomNumber: null,
          status: 'FAILED',
          errors: [
            'Material MAT-FAIL-LONG-04 is currently locked by background process BATCH_JOB_RFC_SAP in client 100.',
            'Component C-COMP-101 has invalid valuation category X and missing profit center assignment.',
            'Component C-COMP-102 quantity 5000 exceeds maximum allowable batch explosion limit for plant 1010.',
            'Alternative BOM 01 valid-from date is prior to earliest open fiscal posting period.',
            'Item category L requires valid warehouse storage location but storage location 0001 is flagged for deletion.'
          ]
        },
        {
          sequenceNum: 5,
          material: 'MAT-FAIL-LONG-05',
          plant: '1010',
          bomUsage: '1',
          alternativeBom: '01',
          bomNumber: null,
          status: 'FAILED',
          errors: [
            'Material master record MAT-FAIL-LONG-05 does not exist in plant 1010.',
            'Recursive BOM dependency detected: component MAT-FAIL-LONG-05 cannot reference parent assembly.'
          ]
        },
        {
          sequenceNum: 6,
          material: 'MAT-DISCREP-06',
          plant: '1010',
          bomUsage: '1',
          alternativeBom: '01',
          bomNumber: null,
          // Reproducing leftover status 'Ready' from preflight with execution errors & discrepancies
          status: 'Ready',
          discrepancies: [
            'RFC CS01 execution returned warning: Quantity rounded by unit conversion factor.',
            'Component item count mismatch: SAP created 2 items but spreadsheet defined 3 items.'
          ],
          errors: [
            'Post-execution verification failed: SAP BOM contains unconfirmed component entries.'
          ]
        }
      ];

      // Route handler for BOM background jobs
      let jobState = 'preflight';
      const handleBomJob = async (route) => {
        const req = route.request();
        const url = req.url();
        const method = req.method();

        if (url.includes('/start') || method === 'POST') {
          let postData = null;
          try {
            postData = req.postDataJSON();
          } catch (_) {}

          if (postData?.type === 'create_bulk') {
            jobState = 'execution';
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                success: true,
                jobId: 'job-exec-001',
                total: 6,
                status: 'PROCESSING'
              })
            });
          }
          jobState = 'preflight';
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              jobId: 'job-preflight-001',
              total: 6,
              status: 'PROCESSING'
            })
          });
        }

        if (jobState === 'execution' || url.includes('job-exec-001')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              job: {
                id: 'job-exec-001',
                jobId: 'job-exec-001',
                type: 'create_bulk',
                status: 'COMPLETED_WITH_ERRORS',
                processed: 6,
                total: 6,
                successCount: 2,
                failedCount: 3,
                skippedCount: 1,
                notProcessedCount: 0,
                results: mockExecutionResults
              }
            })
          });
        }

        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            job: {
              id: 'job-preflight-001',
              jobId: 'job-preflight-001',
              type: 'create_preflight',
              status: 'COMPLETED',
              processed: 6,
              total: 6,
              successCount: 6,
              failedCount: 0,
              skippedCount: 0,
              notProcessedCount: 0,
              results: [
                { sequenceNum: '1', material: 'MAT-FIN-01', plant: '1010', status: 'Ready' },
                { sequenceNum: '2', material: 'MAT-FIN-02', plant: '1010', status: 'Ready' },
                { sequenceNum: '3', material: 'MAT-FIN-03', plant: '1010', status: 'Ready' },
                { sequenceNum: '4', material: 'MAT-FAIL-LONG-04', plant: '1010', status: 'Ready' },
                { sequenceNum: '5', material: 'MAT-FAIL-LONG-05', plant: '1010', status: 'Ready' },
                { sequenceNum: '6', material: 'MAT-DISCREP-06', plant: '1010', status: 'Ready' }
              ]
            }
          })
        });
      };

      await page.route('**/api/bom-jobs/**', handleBomJob);
      await page.route('**/api/bom/jobs/**', handleBomJob);

      // 1. Navigate to Bulk Create BOM
      await page.goto('/products/bom/create/bulk', { waitUntil: 'networkidle' });
      await page.waitForSelector('.rx-bulk-upload-card, .bulk-upload-dropzone', { state: 'visible', timeout: 10000 });

      // 2. Upload file
      const fileBuffer = create6BomSpreadsheet();
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles({
        name: 'Bulk_BOM_6Items.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: fileBuffer
      });

      await page.waitForTimeout(300);
      const continueBtn = page.locator('button:has-text("Continue")').first();
      await expect(continueBtn).toBeEnabled();
      await continueBtn.click();

      // 3. Step 2 Preview table loads & Validate
      await page.waitForSelector('.preflight-preview-table', { state: 'visible', timeout: 8000 });
      const validateBtn = page.locator('.validate-with-sap-btn').first();
      if (await validateBtn.isVisible()) {
        await validateBtn.click();
      }
      await expect(page.locator('.col-result .sap-badge').first()).toBeVisible({ timeout: 10000 });

      // 4. Click Create BOMs button
      const createValidBtn = page.locator('.create-ready-boms-btn').first();
      await expect(createValidBtn).toBeVisible({ timeout: 5000 });
      await createValidBtn.click();

      // 5. Confirm in Modal
      const modalConfirmBtn = page.locator('button:has-text("Confirm & Create")').first();
      await expect(modalConfirmBtn).toBeVisible({ timeout: 5000 });
      await modalConfirmBtn.click();

      // 6. Step 3 Execution Details loads
      const tableContainer = page.locator('[data-testid="execution-details-table-container"]');
      await expect(tableContainer).toBeVisible({ timeout: 10000 });
      const table = page.locator('[data-testid="execution-details-table"]');
      await expect(table).toBeVisible();

      // Verify summary cards and banner
      await expect(page.locator('text=Execution Details')).toBeVisible();
      await expect(page.locator('text=Retry Failed Rows (3)')).toBeVisible();
      await expect(page.locator('text=Export Results')).toBeVisible();
      await expect(page.locator('text=Return to Launchpad')).toBeVisible();
      await expect(page.locator('text=Upload Another File')).toBeVisible();

      // Check all 6 rows are rendered
      const rows = table.locator('tbody tr');
      await expect(rows).toHaveCount(6);

      // Verify each row's status badge text & styling
      // Row 1: Created (SUCCESS)
      const badge1 = rows.nth(0).locator('.sap-badge');
      await expect(badge1).toHaveText('Created');
      await expect(badge1).toHaveClass(/sap-badge-success/);

      // Row 2: Created (SUCCESS)
      const badge2 = rows.nth(1).locator('.sap-badge');
      await expect(badge2).toHaveText('Created');
      await expect(badge2).toHaveClass(/sap-badge-success/);

      // Row 3: Skipped (SKIPPED)
      const badge3 = rows.nth(2).locator('.sap-badge');
      await expect(badge3).toHaveText('Skipped');
      await expect(badge3).toHaveClass(/sap-badge-warning/);

      // Row 4: Failed (FAILED with 5 errors)
      const badge4 = rows.nth(3).locator('.sap-badge');
      await expect(badge4).toHaveText('Failed');
      await expect(badge4).toHaveClass(/sap-badge-danger/);

      // Row 5: Failed (FAILED with 2 errors)
      const badge5 = rows.nth(4).locator('.sap-badge');
      await expect(badge5).toHaveText('Failed');
      await expect(badge5).toHaveClass(/sap-badge-danger/);

      // Row 6: Failed (Even though raw status was 'Ready'!)
      const badge6 = rows.nth(5).locator('.sap-badge');
      await expect(badge6).toHaveText('Failed');
      await expect(badge6).toHaveClass(/sap-badge-danger/);

      // Check "Show N more" pattern for Row 4 (> 3 messages)
      const row4MsgCell = rows.nth(3).locator('td').nth(7);
      // Initially, 3 messages should be visible
      const row4MsgItems = row4MsgCell.locator('div > div > span');
      await expect(row4MsgItems).toHaveCount(3);

      const expandBtn = row4MsgCell.locator('button:has-text("Show 2 more")');
      await expect(expandBtn).toBeVisible();

      // Click "Show 2 more" to expand
      await expandBtn.click();
      await expect(row4MsgCell.locator('div > div > span')).toHaveCount(5);
      await expect(row4MsgCell.locator('button:has-text("Show less")')).toBeVisible();

      // Click "Show less" to collapse
      await row4MsgCell.locator('button:has-text("Show less")').click();
      await expect(row4MsgCell.locator('div > div > span')).toHaveCount(3);
      await expect(row4MsgCell.locator('button:has-text("Show 2 more")')).toBeVisible();

      // Verify no monospace font on message text
      const msgFont = await row4MsgCell.evaluate((el) => window.getComputedStyle(el).fontFamily);
      expect(msgFont.toLowerCase()).not.toContain('courier');
      expect(msgFont.toLowerCase()).not.toContain('mono');

      // Verify table & container have no horizontal scrollbar (scrollWidth <= clientWidth)
      const scrollCheck = await page.evaluate(() => {
        const container = document.querySelector('[data-testid="execution-details-table-container"]');
        const tbl = document.querySelector('[data-testid="execution-details-table"]');
        return {
          containerScrollWidth: container.scrollWidth,
          containerClientWidth: container.clientWidth,
          containerNoScroll: container.scrollWidth <= container.clientWidth,
          tableScrollWidth: tbl.scrollWidth,
          tableClientWidth: tbl.clientWidth,
          tableNoScroll: tbl.scrollWidth <= tbl.clientWidth
        };
      });

      expect(scrollCheck.containerNoScroll).toBe(true);
      expect(scrollCheck.tableNoScroll).toBe(true);
      expect(scrollCheck.tableNoScroll).toBe(true);

      // Take screenshot
      const shotName = `bulk-create-execution-${viewport.name}.png`;
      const localShotPath = path.join(screenshotsDir, shotName);
      const artifactShotPath = path.join(artifactDir, shotName);

      await page.screenshot({ path: localShotPath, fullPage: false });
      fs.copyFileSync(localShotPath, artifactShotPath);
    });
  }
});
