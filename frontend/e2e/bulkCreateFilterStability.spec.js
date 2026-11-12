import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';
import { setupMocks } from './helpers/mockApi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const screenshotsDir = path.resolve(__dirname, '../screenshots');
const artifactDir = 'C:/Users/chare/.gemini/antigravity/brain/0809969d-38f5-47cc-a855-fdbe4cf61c39';

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}
if (!fs.existsSync(artifactDir)) {
  fs.mkdirSync(artifactDir, { recursive: true });
}

async function saveScreenshot(page, filename) {
  const localPath = path.join(screenshotsDir, filename);
  await page.screenshot({ path: localPath, fullPage: false });
  if (fs.existsSync(artifactDir)) {
    const artPath = path.join(artifactDir, filename);
    fs.copyFileSync(localPath, artPath);
  }
}

// 12-row spreadsheet representing 7 BOM groups: 3 Ready (5 component rows), 4 Skipped (7 component rows)
function create7Boms12RowsSpreadsheet() {
  const data = [
    // Ready BOM 1: 2 components (Seq 1)
    {
      'Sequence Number': '1',
      Material: 'BOM_READY_01',
      Plant: '1010',
      'BOM Usage': '1',
      'Alternative BOM': '01',
      'Valid From': '01.01.2026',
      'Base Quantity': '1',
      'BOM Status': '01',
      'Item Category': 'L',
      Component: 'COMP_R1_1',
      'Component Quantity': '2',
      'Storage Location': '0001'
    },
    {
      'Sequence Number': '1',
      Material: 'BOM_READY_01',
      Plant: '1010',
      'BOM Usage': '1',
      'Alternative BOM': '01',
      'Valid From': '01.01.2026',
      'Base Quantity': '1',
      'BOM Status': '01',
      'Item Category': 'L',
      Component: 'COMP_R1_2',
      'Component Quantity': '4',
      'Storage Location': '0001'
    },
    // Ready BOM 2: 2 components (Seq 2)
    {
      'Sequence Number': '2',
      Material: 'BOM_READY_02',
      Plant: '1010',
      'BOM Usage': '1',
      'Alternative BOM': '01',
      'Valid From': '01.01.2026',
      'Base Quantity': '1',
      'BOM Status': '01',
      'Item Category': 'L',
      Component: 'COMP_R2_1',
      'Component Quantity': '1',
      'Storage Location': '0001'
    },
    {
      'Sequence Number': '2',
      Material: 'BOM_READY_02',
      Plant: '1010',
      'BOM Usage': '1',
      'Alternative BOM': '01',
      'Valid From': '01.01.2026',
      'Base Quantity': '1',
      'BOM Status': '01',
      'Item Category': 'L',
      Component: 'COMP_R2_2',
      'Component Quantity': '5',
      'Storage Location': '0001'
    },
    // Ready BOM 3 (with non-blocking warning): 1 component (Seq 3)
    {
      'Sequence Number': '3',
      Material: 'BOM_READY_03_WARN',
      Plant: '1010',
      'BOM Usage': '1',
      'Alternative BOM': '01',
      'Valid From': '01.01.2026',
      'Base Quantity': '1',
      'BOM Status': '01',
      'Item Category': 'L',
      Component: 'COMP_R3_1',
      'Component Quantity': '10',
      'Storage Location': '0001'
    },
    // Skipped BOM 4: 3 components (all skipped BOMs share Seq 4 replicating key collision)
    {
      'Sequence Number': '4',
      Material: 'BOM_SKIP_04_PARENT',
      Plant: '1010',
      'BOM Usage': '1',
      'Alternative BOM': '10',
      'Valid From': '01.01.2026',
      'Base Quantity': '1',
      'BOM Status': '01',
      'Item Category': 'L',
      Component: 'SUB_BOM_05',
      'Component Quantity': '1',
      'Storage Location': '0001'
    },
    {
      'Sequence Number': '4',
      Material: 'BOM_SKIP_04_PARENT',
      Plant: '1010',
      'BOM Usage': '1',
      'Alternative BOM': '10',
      'Valid From': '01.01.2026',
      'Base Quantity': '1',
      'BOM Status': '01',
      'Item Category': 'L',
      Component: 'COMP_S4_2',
      'Component Quantity': '2',
      'Storage Location': '0001'
    },
    {
      'Sequence Number': '4',
      Material: 'BOM_SKIP_04_PARENT',
      Plant: '1010',
      'BOM Usage': '1',
      'Alternative BOM': '10',
      'Valid From': '01.01.2026',
      'Base Quantity': '1',
      'BOM Status': '01',
      'Item Category': 'L',
      Component: 'COMP_S4_3',
      'Component Quantity': '3',
      'Storage Location': '0001'
    },
    // Skipped BOM 5: 2 components (Seq 4)
    {
      'Sequence Number': '4',
      Material: 'BOM_SKIP_05_CHILD',
      Plant: '1010',
      'BOM Usage': '1',
      'Alternative BOM': '01',
      'Valid From': '01.01.2026',
      'Base Quantity': '1',
      'BOM Status': '01',
      'Item Category': 'L',
      Component: 'COMP_S5_1',
      'Component Quantity': '6',
      'Storage Location': '0001'
    },
    {
      'Sequence Number': '4',
      Material: 'BOM_SKIP_05_CHILD',
      Plant: '1010',
      'BOM Usage': '1',
      'Alternative BOM': '01',
      'Valid From': '01.01.2026',
      'Base Quantity': '1',
      'BOM Status': '01',
      'Item Category': 'L',
      Component: 'COMP_S5_2',
      'Component Quantity': '8',
      'Storage Location': '0001'
    },
    // Skipped BOM 6: 1 component (Seq 4)
    {
      'Sequence Number': '4',
      Material: 'BOM_SKIP_06_ALT',
      Plant: '1010',
      'BOM Usage': '1',
      'Alternative BOM': '02',
      'Valid From': '01.01.2026',
      'Base Quantity': '1',
      'BOM Status': '01',
      'Item Category': 'L',
      Component: 'COMP_S6_1',
      'Component Quantity': '7',
      'Storage Location': '0001'
    },
    // Skipped BOM 7: 1 component (Seq 4)
    {
      'Sequence Number': '4',
      Material: 'BOM_SKIP_07_ALT',
      Plant: '1010',
      'BOM Usage': '1',
      'Alternative BOM': '03',
      'Valid From': '01.01.2026',
      'Base Quantity': '1',
      'BOM Status': '01',
      'Item Category': 'L',
      Component: 'COMP_S7_1',
      'Component Quantity': '9',
      'Storage Location': '0001'
    }
  ];

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// Mock with Errors: 2 Ready (3 rows), 2 Errors (4 rows), 2 Skipped (3 rows) -> 6 BOMs, 10 rows
function createSpreadsheetWithErrors() {
  const data = [
    // Ready 1: 2 rows
    { 'Sequence Number': '1', Material: 'BOM_R1', Plant: '1010', 'BOM Usage': '1', 'Alternative BOM': '01', 'Valid From': '01.01.2026', 'Base Quantity': '1', 'BOM Status': '01', 'Item Category': 'L', Component: 'C1', 'Component Quantity': '1', 'Storage Location': '0001' },
    { 'Sequence Number': '1', Material: 'BOM_R1', Plant: '1010', 'BOM Usage': '1', 'Alternative BOM': '01', 'Valid From': '01.01.2026', 'Base Quantity': '1', 'BOM Status': '01', 'Item Category': 'L', Component: 'C2', 'Component Quantity': '2', 'Storage Location': '0001' },
    // Ready 2: 1 row
    { 'Sequence Number': '2', Material: 'BOM_R2', Plant: '1010', 'BOM Usage': '1', 'Alternative BOM': '01', 'Valid From': '01.01.2026', 'Base Quantity': '1', 'BOM Status': '01', 'Item Category': 'L', Component: 'C3', 'Component Quantity': '3', 'Storage Location': '0001' },
    // Error 1: 2 rows
    { 'Sequence Number': '3', Material: 'BOM_E1', Plant: '1010', 'BOM Usage': '1', 'Alternative BOM': '01', 'Valid From': '01.01.2026', 'Base Quantity': '1', 'BOM Status': '01', 'Item Category': 'L', Component: 'C4', 'Component Quantity': '4', 'Storage Location': '0001' },
    { 'Sequence Number': '3', Material: 'BOM_E1', Plant: '1010', 'BOM Usage': '1', 'Alternative BOM': '01', 'Valid From': '01.01.2026', 'Base Quantity': '1', 'BOM Status': '01', 'Item Category': 'L', Component: 'C5', 'Component Quantity': '5', 'Storage Location': '0001' },
    // Error 2: 2 rows
    { 'Sequence Number': '4', Material: 'BOM_E2', Plant: '1010', 'BOM Usage': '1', 'Alternative BOM': '01', 'Valid From': '01.01.2026', 'Base Quantity': '1', 'BOM Status': '01', 'Item Category': 'L', Component: 'C6', 'Component Quantity': '6', 'Storage Location': '0001' },
    { 'Sequence Number': '4', Material: 'BOM_E2', Plant: '1010', 'BOM Usage': '1', 'Alternative BOM': '01', 'Valid From': '01.01.2026', 'Base Quantity': '1', 'BOM Status': '01', 'Item Category': 'L', Component: 'C7', 'Component Quantity': '7', 'Storage Location': '0001' },
    // Skipped 1: 2 rows
    { 'Sequence Number': '5', Material: 'BOM_S1', Plant: '1010', 'BOM Usage': '1', 'Alternative BOM': '01', 'Valid From': '01.01.2026', 'Base Quantity': '1', 'BOM Status': '01', 'Item Category': 'L', Component: 'C8', 'Component Quantity': '8', 'Storage Location': '0001' },
    { 'Sequence Number': '5', Material: 'BOM_S1', Plant: '1010', 'BOM Usage': '1', 'Alternative BOM': '01', 'Valid From': '01.01.2026', 'Base Quantity': '1', 'BOM Status': '01', 'Item Category': 'L', Component: 'C9', 'Component Quantity': '9', 'Storage Location': '0001' },
    // Skipped 2: 1 row
    { 'Sequence Number': '5', Material: 'BOM_S2', Plant: '1010', 'BOM Usage': '1', 'Alternative BOM': '02', 'Valid From': '01.01.2026', 'Base Quantity': '1', 'BOM Status': '01', 'Item Category': 'L', Component: 'C10', 'Component Quantity': '10', 'Storage Location': '0001' }
  ];

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

test.describe('Bulk Create Filter Stability & Key Uniqueness Suite', () => {
  test('7 BOMs / 12 rows stability & 10x filter toggle', async ({ page }, testInfo) => {
    const vpName = testInfo.project.name || '1366x768';
    await setupMocks(page, { authenticated: true });

    // Track duplicate key warnings in the browser console
    const keyWarnings = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('same key') || text.includes('unique "key"') || text.includes('two children with the same key')) {
        keyWarnings.push(text);
      }
    });

    const mockPreflightResults = [
      { sequenceNum: '1', material: 'BOM_READY_01', plant: '1010', bomUsage: '1', alternativeBom: '01', status: 'Ready', message: 'BOM valid for creation', errors: [], warnings: [] },
      { sequenceNum: '2', material: 'BOM_READY_02', plant: '1010', bomUsage: '1', alternativeBom: '01', status: 'Ready', message: 'BOM valid for creation', errors: [], warnings: [] },
      { sequenceNum: '3', material: 'BOM_READY_03_WARN', plant: '1010', bomUsage: '1', alternativeBom: '01', status: 'Ready', message: 'Header plant MARC warning', errors: [], warnings: ['Header material not extended to plant (MARC).'] },
      { sequenceNum: '4', material: 'BOM_SKIP_04_PARENT', plant: '1010', bomUsage: '1', alternativeBom: '10', status: 'Skipped', reason: 'Skipped: alternative 10 of BOM_SKIP_04_PARENT already exists in SAP.', errors: [], warnings: [] },
      { sequenceNum: '4', material: 'BOM_SKIP_05_CHILD', plant: '1010', bomUsage: '1', alternativeBom: '01', status: 'Skipped', reason: 'Skipped: not created because parent BOM already exists.', errors: [], warnings: [] },
      { sequenceNum: '4', material: 'BOM_SKIP_06_ALT', plant: '1010', bomUsage: '1', alternativeBom: '02', status: 'Skipped', reason: 'Skipped: alternative 02 already exists in SAP.', errors: [], warnings: [] },
      { sequenceNum: '4', material: 'BOM_SKIP_07_ALT', plant: '1010', bomUsage: '1', alternativeBom: '03', status: 'Skipped', reason: 'Skipped: alternative 03 already exists in SAP.', errors: [], warnings: [] }
    ];

    const handlePreflightJob = async (route) => {
      const req = route.request();
      if (req.url().includes('/start') || req.method() === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, jobId: 'job-7boms-12rows', total: 7, status: 'PROCESSING' })
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          job: {
            id: 'job-7boms-12rows',
            type: 'create_preflight',
            status: 'COMPLETED',
            processed: 7,
            total: 7,
            successCount: 3,
            failedCount: 0,
            skippedCount: 4,
            notProcessedCount: 0,
            results: mockPreflightResults
          }
        })
      });
    };

    await page.route('**/api/bom/jobs/**', handlePreflightJob);
    await page.route('**/api/bom-jobs/**', handlePreflightJob);

    await page.goto('/products/bom/create/bulk', { waitUntil: 'networkidle' });
    await page.waitForSelector('.rx-bulk-upload-card, .bulk-upload-dropzone', { state: 'visible', timeout: 10000 });

    // Upload spreadsheet
    const fileBuffer = create7Boms12RowsSpreadsheet();
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'Bulk_Create_7BOMs_12Rows.xlsx',
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

    // Wait for validation to finish and table to populate
    await expect(page.locator('button.rx-stat-ready[aria-label="Ready: 3"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button.rx-stat-skipped[aria-label="Skipped: 4"]')).toBeVisible();
    await expect(page.locator('button.rx-stat-all[aria-label="Total BOMs: 7"]')).toBeVisible();

    const allCard = page.locator('button.rx-stat-all');
    const readyCard = page.locator('button.rx-stat-ready');
    const skippedCard = page.locator('button.rx-stat-skipped');

    // Screenshot 1: All View (initial)
    await expect(page.locator('.preflight-preview-table tbody tr.bom-group-first-row')).toHaveCount(7);
    await expect(page.locator('.preflight-preview-table tbody tr.component-row')).toHaveCount(12);
    await expect(page.locator('text=Showing 7 of 7')).toBeVisible();
    await saveScreenshot(page, `bulk-create-all-${vpName}.png`);

    // Screenshot 2: Ready View
    await readyCard.click();
    await page.waitForTimeout(150);
    await expect(readyCard).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.preflight-preview-table tbody tr.bom-group-first-row')).toHaveCount(3);
    await expect(page.locator('.preflight-preview-table tbody tr.component-row')).toHaveCount(5);
    await expect(page.locator('text=Showing 3 of 7')).toBeVisible();
    // Assert no Skipped badge or message exists under Ready
    await expect(page.locator('.preflight-preview-table tbody .sap-badge-neutral')).toHaveCount(0);
    await expect(page.locator('.preflight-preview-table tbody').locator('text="Skipped:"')).toHaveCount(0);
    await saveScreenshot(page, `bulk-create-ready-${vpName}.png`);

    // Screenshot 3: Skipped View
    await skippedCard.click();
    await page.waitForTimeout(150);
    await expect(skippedCard).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.preflight-preview-table tbody tr.bom-group-first-row')).toHaveCount(4);
    await expect(page.locator('.preflight-preview-table tbody tr.component-row')).toHaveCount(7);
    await expect(page.locator('text=Showing 4 of 7')).toBeVisible();
    // Assert no Ready badge exists under Skipped
    await expect(page.locator('.preflight-preview-table tbody .sap-badge-success')).toHaveCount(0);
    await saveScreenshot(page, `bulk-create-skipped-${vpName}.png`);

    // Toggle All -> Ready -> Skipped -> All -> Ready 10 TIMES
    for (let cycle = 1; cycle <= 10; cycle++) {
      // 1. All
      await allCard.click();
      await page.waitForTimeout(60);
      await expect(page.locator('.preflight-preview-table tbody tr.bom-group-first-row')).toHaveCount(7);
      await expect(page.locator('.preflight-preview-table tbody tr.component-row')).toHaveCount(12);

      // 2. Ready
      await readyCard.click();
      await page.waitForTimeout(60);
      await expect(page.locator('.preflight-preview-table tbody tr.bom-group-first-row')).toHaveCount(3);
      await expect(page.locator('.preflight-preview-table tbody tr.component-row')).toHaveCount(5);
      await expect(page.locator('.preflight-preview-table tbody .sap-badge-neutral')).toHaveCount(0);

      // 3. Skipped
      await skippedCard.click();
      await page.waitForTimeout(60);
      await expect(page.locator('.preflight-preview-table tbody tr.bom-group-first-row')).toHaveCount(4);
      await expect(page.locator('.preflight-preview-table tbody tr.component-row')).toHaveCount(7);

      // 4. All
      await allCard.click();
      await page.waitForTimeout(60);
      await expect(page.locator('.preflight-preview-table tbody tr.bom-group-first-row')).toHaveCount(7);
      await expect(page.locator('.preflight-preview-table tbody tr.component-row')).toHaveCount(12);

      // 5. Ready
      await readyCard.click();
      await page.waitForTimeout(60);
      await expect(page.locator('.preflight-preview-table tbody tr.bom-group-first-row')).toHaveCount(3);
      await expect(page.locator('.preflight-preview-table tbody tr.component-row')).toHaveCount(5);
    }

    // Return to All view after 10 cycles
    await allCard.click();
    await page.waitForTimeout(150);
    await expect(page.locator('.preflight-preview-table tbody tr.bom-group-first-row')).toHaveCount(7);
    await expect(page.locator('.preflight-preview-table tbody tr.component-row')).toHaveCount(12);
    await expect(page.locator('text=Showing 7 of 7')).toBeVisible();

    // Screenshot 4: All view after 10 toggles
    await saveScreenshot(page, `bulk-create-all-after-10-toggles-${vpName}.png`);

    // Assert zero duplicate key warnings in console
    expect(keyWarnings).toHaveLength(0);

    // Check no horizontal overflow
    const hasOverflow = await page.evaluate(() => {
      const flowContainer = document.querySelector('.rx-bulk-flow-container') || document.body;
      return flowContainer.scrollWidth > flowContainer.clientWidth + 2;
    });
    expect(hasOverflow).toBe(false);
  });

  test('Mock with Errors stability', async ({ page }, testInfo) => {
    await setupMocks(page, { authenticated: true });

    const mockPreflightWithErrors = [
      { sequenceNum: '1', material: 'BOM_R1', plant: '1010', bomUsage: '1', alternativeBom: '01', status: 'Ready', message: 'Valid', errors: [], warnings: [] },
      { sequenceNum: '2', material: 'BOM_R2', plant: '1010', bomUsage: '1', alternativeBom: '01', status: 'Ready', message: 'Valid', errors: [], warnings: [] },
      { sequenceNum: '3', material: 'BOM_E1', plant: '1010', bomUsage: '1', alternativeBom: '01', status: 'Ready', components: [{ component: 'C4', status: 'ERROR', error: 'Invalid comp' }] },
      { sequenceNum: '4', material: 'BOM_E2', plant: '1010', bomUsage: '1', alternativeBom: '01', status: 'FAILED', reason: 'Plant MARC error', errors: ['Plant MARC error'] },
      { sequenceNum: '5', material: 'BOM_S1', plant: '1010', bomUsage: '1', alternativeBom: '01', status: 'Skipped', reason: 'Already exists in SAP' },
      { sequenceNum: '5', material: 'BOM_S2', plant: '1010', bomUsage: '1', alternativeBom: '02', status: 'Skipped', reason: 'Already exists in SAP' }
    ];

    const handlePreflightJobWithErrors = async (route) => {
      const req = route.request();
      if (req.url().includes('/start') || req.method() === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, jobId: 'job-errors-test', total: 6, status: 'PROCESSING' })
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          job: {
            id: 'job-errors-test',
            type: 'create_preflight',
            status: 'COMPLETED',
            processed: 6,
            total: 6,
            successCount: 2,
            failedCount: 2,
            skippedCount: 2,
            notProcessedCount: 0,
            results: mockPreflightWithErrors
          }
        })
      });
    };

    await page.route('**/api/bom/jobs/**', handlePreflightJobWithErrors);
    await page.route('**/api/bom-jobs/**', handlePreflightJobWithErrors);

    await page.goto('/products/bom/create/bulk', { waitUntil: 'networkidle' });
    await page.waitForSelector('.rx-bulk-upload-card, .bulk-upload-dropzone', { state: 'visible', timeout: 10000 });

    // Upload spreadsheet
    const fileBuffer = createSpreadsheetWithErrors();
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'Bulk_Create_With_Errors.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: fileBuffer
    });

    await page.waitForTimeout(300);
    await page.locator('button:has-text("Continue")').first().click();
    await page.locator('button:has-text("Validate data")').first().click();

    // Wait for cards
    await expect(page.locator('button.rx-stat-all[aria-label="Total BOMs: 6"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button.rx-stat-ready[aria-label="Ready: 2"]')).toBeVisible();
    await expect(page.locator('button.rx-stat-errors[aria-label="Errors: 2"]')).toBeVisible();
    await expect(page.locator('button.rx-stat-skipped[aria-label="Skipped: 2"]')).toBeVisible();

    const allCard = page.locator('button.rx-stat-all');
    const readyCard = page.locator('button.rx-stat-ready');
    const errorsCard = page.locator('button.rx-stat-errors');
    const skippedCard = page.locator('button.rx-stat-skipped');

    // Toggling sequence
    for (let cycle = 1; cycle <= 5; cycle++) {
      await readyCard.click();
      await page.waitForTimeout(50);
      await expect(page.locator('.preflight-preview-table tbody tr.bom-group-first-row')).toHaveCount(2);
      await expect(page.locator('.preflight-preview-table tbody tr.component-row')).toHaveCount(3);

      await errorsCard.click();
      await page.waitForTimeout(50);
      await expect(page.locator('.preflight-preview-table tbody tr.bom-group-first-row')).toHaveCount(2);
      await expect(page.locator('.preflight-preview-table tbody tr.component-row')).toHaveCount(4);

      await skippedCard.click();
      await page.waitForTimeout(50);
      await expect(page.locator('.preflight-preview-table tbody tr.bom-group-first-row')).toHaveCount(2);
      await expect(page.locator('.preflight-preview-table tbody tr.component-row')).toHaveCount(3);

      await allCard.click();
      await page.waitForTimeout(50);
      await expect(page.locator('.preflight-preview-table tbody tr.bom-group-first-row')).toHaveCount(6);
      await expect(page.locator('.preflight-preview-table tbody tr.component-row')).toHaveCount(10);
    }
  });
});
