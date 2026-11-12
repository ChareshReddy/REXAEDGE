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

async function assertNoDisallowedOrangeHue(page, selectorDesc) {
  const violations = await page.evaluate(() => {
    function parseRgb(colorStr) {
      if (!colorStr || colorStr === 'transparent' || colorStr === 'rgba(0, 0, 0, 0)') {
        return null;
      }
      const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (!match) return null;
      const r = parseInt(match[1], 10) / 255;
      const g = parseInt(match[2], 10) / 255;
      const b = parseInt(match[3], 10) / 255;
      const a = match[4] !== undefined ? parseFloat(match[4]) : 1;
      if (a < 0.1) return null;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const d = max - min;
      const l = (max + min) / 2;
      let s = 0;
      if (d !== 0) {
        s = l > 0.5 ? d / (2 - 2 * l) : d / (2 * l);
      }
      let h = 0;
      if (d !== 0) {
        if (max === r) {
          h = ((g - b) / d) % 6;
        } else if (max === g) {
          h = (b - r) / d + 2;
        } else {
          h = (r - g) / d + 4;
        }
        h = Math.round(h * 60);
        if (h < 0) h += 360;
      }
      return { h, s, l, a, raw: colorStr };
    }

    const elements = document.querySelectorAll(
      '.status-tile, .rx-stat-tile, .rx-bulk-stat-tiles, .sap-card, .sap-bulk-table tr, .sap-badge, .rx-alert, .sap-alert, div[style*="border-radius"], .sap-status-chip'
    );
    const badElements = [];

    elements.forEach((el) => {
      // Allow amber ONLY on warning-severity message lines (warning icon and the faint amber tint)
      if (el.closest('.bom-msg-warning, .bulk-execution-msg-warning, .bulk-msg-warning, .rx-msg-warning')) {
        return;
      }
      // Exclude standalone warning icon SVGs or containers whose only content is AlertTriangle
      if (el.closest('.lucide-alert-triangle') || el.classList.contains('lucide-alert-triangle')) {
        return;
      }

      const style = window.getComputedStyle(el);
      const props = [
        { prop: 'backgroundColor', val: style.backgroundColor },
        { prop: 'borderLeftColor', val: style.borderLeftColor },
        { prop: 'borderTopColor', val: style.borderTopColor },
        { prop: 'color', val: style.color }
      ];

      for (const p of props) {
        const parsed = parseRgb(p.val);
        if (parsed && parsed.s > 0.4 && parsed.h >= 15 && parsed.h <= 60) {
          badElements.push({
            tag: el.tagName,
            className: el.className,
            text: (el.textContent || '').trim().slice(0, 40),
            prop: p.prop,
            val: p.val,
            h: parsed.h,
            s: Math.round(parsed.s * 100) + '%'
          });
        }
      }
    });

    return badElements;
  });

  expect(violations, `Orange/amber elements found during ${selectorDesc}: ${JSON.stringify(violations)}`).toEqual([]);
}

async function saveScreenshot(page, filename) {
  const localPath = path.join(screenshotsDir, filename);
  await page.screenshot({ path: localPath, fullPage: false });
  if (fs.existsSync(artifactDir)) {
    const artPath = path.join(artifactDir, filename);
    fs.copyFileSync(localPath, artPath);
  }
}

function createCopySpreadsheet() {
  const data = [
    {
      'Source Material': 'A1PSB001B-BK01',
      'Source Plant': '1010',
      'Source BOM Usage': '1',
      'Source Alternative': '01',
      'Target Material': 'TGT-MAT-01',
      'Target Plant': '1010',
      'Target BOM Usage': '1',
      'Target Alternative': '02'
    },
    {
      'Source Material': 'NON-EXISTENT-MAT',
      'Source Plant': '1010',
      'Source BOM Usage': '1',
      'Source Alternative': '01',
      'Target Material': 'TGT-MAT-02',
      'Target Plant': '1010',
      'Target BOM Usage': '1',
      'Target Alternative': '02'
    },
    {
      'Source Material': 'A1PSB001B-BK03',
      'Source Plant': '1010',
      'Source BOM Usage': '1',
      'Source Alternative': '01',
      'Target Material': 'TGT-MAT-03',
      'Target Plant': '1010',
      'Target BOM Usage': '1',
      'Target Alternative': '03'
    }
  ];
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function createCreateSpreadsheet() {
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
    },
    {
      Seq: 3,
      Material: 'MAT-CREATE-03',
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
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

test.describe('Bulk Design System Audit - No Amber/Orange Theme', () => {
  test.setTimeout(90000);

  test('Bulk Copy & Bulk Create color and layout audit', async ({ page }, testInfo) => {
    const vpName = testInfo.project.name || 'default';
    await setupMocks(page, { authenticated: true });
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    // Mock Bulk Copy Job
    let copyJobState = 'VALIDATE';
    const handleCopyJobs = async (route) => {
      const method = route.request().method();
      const url = route.request().url();

      if (url.includes('/start') || method === 'POST') {
        const body = route.request().postDataJSON() || {};
        if (body.type === 'copy_bulk' || body.jobType === 'copy_bulk') {
          copyJobState = 'EXEC';
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, jobId: 'mock-copy-job', status: 'PROCESSING', total: 3 })
          });
        }
        copyJobState = 'VALIDATE';
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, jobId: 'mock-copy-job', status: 'PROCESSING', total: 3 })
        });
      }

      if (url.includes('mock-copy-job')) {
        if (copyJobState === 'EXEC') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              job: {
                id: 'mock-copy-job',
                jobId: 'mock-copy-job',
                type: 'copy_bulk',
                status: 'COMPLETED_WITH_ERRORS',
                processed: 3,
                total: 3,
                successCount: 1,
                failedCount: 1,
                skippedCount: 1,
                results: [
                  { sourceMaterial: 'A1PSB001B-BK01', targetMaterial: 'TGT-MAT-01', status: 'CREATED', message: 'BOM copied successfully' },
                  { sourceMaterial: 'NON-EXISTENT-MAT', targetMaterial: 'TGT-MAT-02', status: 'FAILED', message: 'Material not found in SAP' },
                  { sourceMaterial: 'A1PSB001B-BK03', targetMaterial: 'TGT-MAT-03', status: 'SKIPPED', message: 'Target alternative already exists' }
                ]
              }
            })
          });
        }

        // Validate
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            job: {
              id: 'mock-copy-job',
              jobId: 'mock-copy-job',
              type: 'copy_validate',
              status: 'COMPLETED',
              processed: 3,
              total: 3,
              successCount: 1,
              failedCount: 1,
              skippedCount: 1,
              results: [
                { sourceMaterial: 'A1PSB001B-BK01', targetMaterial: 'TGT-MAT-01', status: 'Ready', messages: [] },
                { sourceMaterial: 'NON-EXISTENT-MAT', targetMaterial: 'TGT-MAT-02', status: 'Failed', messages: [{ type: 'error', text: 'Material not found in plant 1010' }] },
                { sourceMaterial: 'A1PSB001B-BK03', targetMaterial: 'TGT-MAT-03', status: 'Skipped', messages: [{ type: 'warning', text: 'Target Alternative already exists' }] }
              ]
            }
          })
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, active: false })
      });
    };

    await page.route(/\/api\/bom(-jobs|\/jobs)/, handleCopyJobs);

    // --- 1. BULK COPY: Upload and Validate ---
    await page.goto('/products/bom/copy/bulk', { waitUntil: 'networkidle' });
    await page.waitForSelector('.rx-bulk-upload-card, .bulk-upload-dropzone', { state: 'visible', timeout: 10000 });

    const copyBuffer = createCopySpreadsheet();
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'Batch_BOM_Copy.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: copyBuffer
    });

    await page.waitForTimeout(300);
    const continueBtn = page.locator('button:has-text("Continue")').first();
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    // Wait for preview table
    await page.waitForSelector('.sap-bulk-table', { state: 'visible', timeout: 10000 });

    // Click "Validate data" / "Validate with SAP"
    const validateBtn = page.locator('.validate-with-sap-btn').first();
    await validateBtn.click();

    // Wait for validation badges to appear
    await page.waitForSelector('.sap-badge:has-text("Failed")', { timeout: 10000 });
    await page.waitForSelector('.sap-badge:has-text("Skipped")', { timeout: 10000 });

    // Check colors on Bulk Copy preview (failed + skipped + ready rows)
    await assertNoDisallowedOrangeHue(page, `Bulk Copy Preview at ${vpName}`);
    await saveScreenshot(page, `bulk-copy-preview-audit-${vpName}.png`);

    // Filter to skipped rows only
    const skippedTile = page.locator('.rx-stat-skipped, .rx-stat-tile:has-text("Skipped")').first();
    await skippedTile.click();
    await page.waitForTimeout(300);
    await assertNoDisallowedOrangeHue(page, `Bulk Copy Preview (Skipped Filter) at ${vpName}`);
    await saveScreenshot(page, `bulk-copy-preview-skipped-${vpName}.png`);

    // Reset filter to all
    const totalTile = page.locator('.rx-stat-all, .rx-stat-tile:has-text("Total")').first();
    await totalTile.click();
    await page.waitForTimeout(300);

    // Execute Copy
    const copyBtn = page.locator('.execute-batch-copy-btn').first();
    if (await copyBtn.isVisible()) {
      await copyBtn.click();
      // Wait for results
      await page.waitForSelector('h3:has-text("BOM Copy Completed with Issues")', { timeout: 15000 });
      await assertNoDisallowedOrangeHue(page, `Bulk Copy Results at ${vpName}`);
      await saveScreenshot(page, `bulk-copy-result-mixed-${vpName}.png`);
    }

    // --- 2. BULK CREATE: Upload and Validate ---
    let createJobState = 'VALIDATE';
    const handleCreateJobs = async (route) => {
      const method = route.request().method();
      const url = route.request().url();

      if (url.includes('/start') || method === 'POST') {
        const body = route.request().postDataJSON() || {};
        if (body.type === 'create_bulk' || body.jobType === 'create_bulk') {
          createJobState = 'EXEC';
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, jobId: 'mock-create-job', status: 'PROCESSING', total: 3 })
          });
        }
        createJobState = 'VALIDATE';
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, jobId: 'mock-create-job', status: 'PROCESSING', total: 3 })
        });
      }

      if (url.includes('mock-create-job')) {
        if (createJobState === 'EXEC') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              job: {
                id: 'mock-create-job',
                jobId: 'mock-create-job',
                type: 'create_bulk',
                status: 'COMPLETED_WITH_ERRORS',
                processed: 3,
                total: 3,
                successCount: 1,
                failedCount: 1,
                skippedCount: 1,
                bomsCreated: 1,
                componentsCreated: 10,
                results: [
                  { material: 'MAT-CREATE-01', plant: '1010', status: 'CREATED', message: 'BOM created successfully' },
                  { material: 'MAT-CREATE-02', plant: '1010', status: 'FAILED', message: 'Unit of measure not supported' },
                  { material: 'MAT-CREATE-03', plant: '1010', status: 'SKIPPED', message: 'Alternative already exists' }
                ]
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
              id: 'mock-create-job',
              jobId: 'mock-create-job',
              type: 'create_preflight',
              status: 'COMPLETED',
              processed: 3,
              total: 3,
              successCount: 1,
              failedCount: 1,
              skippedCount: 1,
              results: [
                { sequenceNum: '1', material: 'MAT-CREATE-01', plant: '1010', status: 'Ready', messages: [] },
                { sequenceNum: '2', material: 'MAT-CREATE-02', plant: '1010', status: 'Failed', messages: [{ type: 'error', text: 'Unit of measure EA not supported' }] },
                { sequenceNum: '3', material: 'MAT-CREATE-03', plant: '1010', status: 'Skipped', messages: [{ type: 'warning', text: 'Alternative 8 already exists' }] }
              ]
            }
          })
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, active: false })
      });
    };

    await page.unroute(/\/api\/bom(-jobs|\/jobs)/);
    await page.route(/\/api\/bom(-jobs|\/jobs)/, handleCreateJobs);

    await page.goto('/products/bom/create/bulk', { waitUntil: 'networkidle' });
    await page.waitForSelector('.rx-bulk-upload-card, .bulk-upload-dropzone', { state: 'visible', timeout: 10000 });

    const createBuffer = createCreateSpreadsheet();
    const createInput = page.locator('input[type="file"]').first();
    await createInput.setInputFiles({
      name: 'Bulk_BOM_Create.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: createBuffer
    });

    await page.waitForTimeout(300);
    const createContinueBtn = page.locator('button:has-text("Continue")').first();
    await expect(createContinueBtn).toBeEnabled();
    await createContinueBtn.click();

    // Wait for preview screen
    await page.waitForSelector('.preflight-preview-table', { timeout: 10000 });

    // Click "Validate with SAP"
    const createValidateBtn = page.locator('.validate-with-sap-btn').first();
    await createValidateBtn.click();

    // Wait for validation results in table
    await page.waitForSelector('.sap-badge:has-text("Failed")', { timeout: 10000 });

    // Check colors on Bulk Create preview
    await assertNoDisallowedOrangeHue(page, `Bulk Create Preview at ${vpName}`);
    await saveScreenshot(page, `bulk-create-preview-audit-${vpName}.png`);

    // Filter to skipped rows in Bulk Create preview
    const createSkippedTile = page.locator('.rx-stat-skipped, .rx-stat-tile:has-text("Skipped")').first();
    if (await createSkippedTile.isVisible()) {
      await createSkippedTile.click();
      await page.waitForTimeout(300);
      await assertNoDisallowedOrangeHue(page, `Bulk Create Preview (Skipped Filter) at ${vpName}`);
      await saveScreenshot(page, `bulk-create-preview-skipped-${vpName}.png`);

      const createTotalTile = page.locator('.rx-stat-all, .rx-stat-tile:has-text("Total")').first();
      await createTotalTile.click();
      await page.waitForTimeout(300);
    }

    // Execute Create
    const executeCreateBtn = page.locator('.create-ready-boms-btn').first();
    await expect(executeCreateBtn).toBeVisible({ timeout: 5000 });
    await executeCreateBtn.click();

    // Confirm in Modal
    const modalConfirmBtn = page.locator('button:has-text("Confirm & Create")').first();
    await expect(modalConfirmBtn).toBeVisible({ timeout: 5000 });
    await modalConfirmBtn.click();

    // Wait for results
    await page.waitForSelector('h3:has-text("Batch Creation Completed with Issues")', { timeout: 15000 });
    await assertNoDisallowedOrangeHue(page, `Bulk Create Results at ${vpName}`);
    await saveScreenshot(page, `bulk-create-result-mixed-${vpName}.png`);
  });
});
