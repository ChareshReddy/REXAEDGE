import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';
import { setupMocks } from './helpers/mockApi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const artifactDir = 'C:/Users/chare/.gemini/antigravity/brain/670a18b0-0002-4036-b6f5-4b4c0c22c519';

function create3RowCreateSpreadsheet() {
  const data = [
    {
      Seq: 1,
      Material: 'MAT-CONN-FAIL',
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
      Seq: 1,
      Material: 'SIBLING-02',
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
      Seq: 1,
      Material: 'SIBLING-03',
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
    }
  ];

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'CreateBoms');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const filePath = path.resolve(__dirname, 'issue2_test_create.xlsx');
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

const VIEWPORTS = [
  { width: 1366, height: 768, label: '1366x768' },
  { width: 1920, height: 1080, label: '1920x1080' }
];

for (const vp of VIEWPORTS) {
  test(`Issue 2: Bulk Create connection lost banner label & not attempted state at ${vp.label}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await setupMocks(page, { authenticated: true });

    // Mock create_preflight
    await page.route('**/api/bom/jobs/start', async (route) => {
      const payload = JSON.parse(route.request().postData() || '{}');
      if (payload.type === 'create_preflight') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            jobId: 'job_create_preflight_mock',
            total: 3
          })
        });
      }
      if (payload.type === 'create_bulk') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            jobId: 'job_create_bulk_mock',
            total: 3
          })
        });
      }
      return route.continue();
    });

    await page.route('**/api/bom/jobs/job_create_preflight_mock', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          job: {
            id: 'job_create_preflight_mock',
            jobId: 'job_create_preflight_mock',
            type: 'create_preflight',
            status: 'COMPLETED',
            progress_percent: 100,
            total: 3,
            results: [
              {
                sequenceNum: 1,
                material: 'MAT-CONN-FAIL',
                plant: '1010',
                status: 'Ready',
                reason: 'Ready for creation',
                components: [{ component: 'C-COMP-01', quantity: 10 }]
              },
              {
                sequenceNum: 1,
                material: 'SIBLING-02',
                plant: '1010',
                status: 'Ready',
                reason: 'Ready for creation',
                components: [{ component: 'C-COMP-02', quantity: 20 }]
              },
              {
                sequenceNum: 1,
                material: 'SIBLING-03',
                plant: '1010',
                status: 'Ready',
                reason: 'Ready for creation',
                components: [{ component: 'C-COMP-03', quantity: 30 }]
              }
            ]
          }
        })
      });
    });

    // Mock create_bulk execution results: 1 connection failed, 2 skipped in group
    await page.route('**/api/bom/jobs/job_create_bulk_mock', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          job: {
            id: 'job_create_bulk_mock',
            jobId: 'job_create_bulk_mock',
            type: 'create_bulk',
            status: 'COMPLETED_WITH_ERRORS',
            progress_percent: 100,
            total: 3,
            bomsCreated: 0,
            componentsCreated: 0,
            failedCount: 1,
            skippedCount: 2,
            results: [
              {
                sequenceNum: 1,
                material: 'MAT-CONN-FAIL',
                plant: '1010',
                bomUsage: '1',
                alternativeBom: '01',
                bomNumber: '-',
                status: 'FAILED',
                retryable: true,
                connectionLost: true,
                message: 'Connection to SAP was lost while creating this BOM. No BOM was created. Use Retry Failed Rows.'
              },
              {
                sequenceNum: 1,
                material: 'SIBLING-02',
                plant: '1010',
                bomUsage: '1',
                alternativeBom: '01',
                bomNumber: '-',
                status: 'SKIPPED',
                subStatus: 'NOT_ATTEMPTED',
                retryable: true,
                message: 'Not created because MAT-CONN-FAIL failed earlier in this group'
              },
              {
                sequenceNum: 1,
                material: 'SIBLING-03',
                plant: '1010',
                bomUsage: '1',
                alternativeBom: '01',
                bomNumber: '-',
                status: 'SKIPPED',
                subStatus: 'NOT_ATTEMPTED',
                retryable: true,
                message: 'Not created because MAT-CONN-FAIL failed earlier in this group'
              }
            ]
          }
        })
      });
    });

    await page.goto('/products/bom/create/bulk');
    await page.waitForLoadState('networkidle');

    // Upload spreadsheet
    const filePath = create3RowCreateSpreadsheet();
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('button:has-text("Browse file")');
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(filePath);

    // Click Continue
    const continueBtn = page.locator('button:has-text("Continue")');
    if (await continueBtn.isVisible()) {
      await continueBtn.click();
    }

    // Step 2: Validate Data
    await page.click('button:has-text("Validate Data")');
    const createBtn = page.locator('.create-ready-boms-btn');
    await expect(createBtn).toBeEnabled({ timeout: 10000 });
    await expect(page.locator('.sap-badge:has-text("Ready")').first()).toBeVisible();

    // Step 2 -> Open Confirm Modal and Execute
    await createBtn.click();
    const modalConfirmBtn = page.locator('button:has-text("Confirm & Create")');
    await expect(modalConfirmBtn).toBeVisible({ timeout: 5000 });
    await modalConfirmBtn.click();

    // Wait for Execution Details screen (Step 3)
    await expect(page.locator('h3:has-text("Batch Creation Completed with Issues")')).toBeVisible({ timeout: 10000 });

    // 1. Check Banner text: "1 failed (connection), 2 not attempted"
    await expect(page.locator('text=1 failed (connection), 2 not attempted')).toBeVisible();

    // 2. Check Summary Cards: Not Attempted card exists with count 2
    await expect(page.locator('.sap-card:has-text("Not Attempted") div:has-text("2")')).toBeVisible();
    await expect(page.locator('.sap-card:has-text("Failed") div:has-text("1")')).toBeVisible();

    // 3. Check Table Rows:
    // Row 1: Failed badge and message
    const row0 = page.locator('[data-testid="execution-row-0"]');
    await expect(row0.locator('.sap-badge:has-text("Failed")')).toBeVisible();
    await expect(row0.locator('text=Connection to SAP was lost while creating this BOM. No BOM was created. Use Retry Failed Rows.')).toBeVisible();

    // Rows 2 & 3: Not attempted badge
    const row1 = page.locator('[data-testid="execution-row-1"]');
    await expect(row1.locator('.sap-badge:has-text("Not attempted")')).toBeVisible();
    const row2 = page.locator('[data-testid="execution-row-2"]');
    await expect(row2.locator('.sap-badge:has-text("Not attempted")')).toBeVisible();

    // 4. Retry Failed Rows button is visible
    await expect(page.locator('button:has-text("Retry Failed Rows")')).toBeVisible();

    // Take and save screenshot
    const shotPath = path.join(artifactDir, `issue2-bulk-create-${vp.label}.png`);
    await page.screenshot({ path: shotPath, fullPage: true });

    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (_) {}
    }
  });
}
