import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';
import { setupMocks } from './helpers/mockApi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const artifactDir = 'C:/Users/chare/.gemini/antigravity/brain/670a18b0-0002-4036-b6f5-4b4c0c22c519';

function create4RowCopySpreadsheet() {
  const data = [
    {
      'Source Material': 'A1BH0214C',
      'Source Plant': '1001',
      'Source Usage': '1',
      'Source Alt BOM': '99',
      'Target Material': 'A1BH0214C',
      'Target Plant': '1001',
      'Target Usage': '1',
      'Target Alt BOM': '20'
    },
    {
      'Source Material': 'A1BH0214C',
      'Source Plant': '1001',
      'Source Usage': '1',
      'Source Alt BOM': '99',
      'Target Material': 'A1BH0214C',
      'Target Plant': '1001',
      'Target Usage': '1',
      'Target Alt BOM': '21'
    },
    {
      'Source Material': 'A1BH0214C',
      'Source Plant': '1001',
      'Source Usage': '1',
      'Source Alt BOM': '99',
      'Target Material': 'A1BH0214C',
      'Target Plant': '1001',
      'Target Usage': '1',
      'Target Alt BOM': '22'
    },
    {
      'Source Material': 'A1BH0214C',
      'Source Plant': '1012',
      'Source Usage': '1',
      'Source Alt BOM': '01',
      'Target Material': 'A1BH0214C',
      'Target Plant': '1012',
      'Target Usage': '1',
      'Target Alt BOM': '23'
    }
  ];

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'BatchCopy');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const filePath = path.resolve(__dirname, 'issue1_test_copy.xlsx');
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

const VIEWPORTS = [
  { width: 1366, height: 768, label: '1366x768' },
  { width: 1920, height: 1080, label: '1920x1080' }
];

for (const vp of VIEWPORTS) {
  test(`Issue 1: Bulk Copy 4-row outcome alignment, failed badge text & wrapping at ${vp.label}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await setupMocks(page, { authenticated: true });

    // Mock copy validation
    await page.route('**/api/bom/jobs/start', async (route) => {
      const payload = JSON.parse(route.request().postData() || '{}');
      if (payload.type === 'copy_validate') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            jobId: 'job_copy_validate_mock',
            total: 4
          })
        });
      }
      if (payload.type === 'copy_bulk') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            jobId: 'job_copy_bulk_mock',
            total: 1
          })
        });
      }
      return route.continue();
    });

    await page.route('**/api/bom/jobs/job_copy_validate_mock', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          job: {
            id: 'job_copy_validate_mock',
            jobId: 'job_copy_validate_mock',
            type: 'copy_validate',
            status: 'COMPLETED',
            progress_percent: 100,
            total: 4,
            results: [
              {
                id: 1,
                sourceMaterial: 'A1BH0214C',
                sourcePlant: '1001',
                targetMaterial: 'A1BH0214C',
                targetPlant: '1001',
                status: 'ERROR',
                message: 'Source alternative 99 does not exist for A1BH0214C in plant 1001'
              },
              {
                id: 2,
                sourceMaterial: 'A1BH0214C',
                sourcePlant: '1001',
                targetMaterial: 'A1BH0214C',
                targetPlant: '1001',
                status: 'ERROR',
                message: 'Source alternative 99 does not exist for A1BH0214C in plant 1001'
              },
              {
                id: 3,
                sourceMaterial: 'A1BH0214C',
                sourcePlant: '1001',
                targetMaterial: 'A1BH0214C',
                targetPlant: '1001',
                status: 'ERROR',
                message: 'Source alternative 99 does not exist for A1BH0214C in plant 1001'
              },
              {
                id: 4,
                sourceMaterial: 'A1BH0214C',
                sourcePlant: '1012',
                targetMaterial: 'A1BH0214C',
                targetPlant: '1012',
                sourceAltBom: '01',
                targetAltBom: '23',
                componentCount: 16,
                status: 'VALID',
                message: 'Ready to copy (16 components)'
              }
            ]
          }
        })
      });
    });

    // Mock copy_bulk execution result (only row 4 was executed)
    await page.route('**/api/bom/jobs/job_copy_bulk_mock', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          job: {
            id: 'job_copy_bulk_mock',
            jobId: 'job_copy_bulk_mock',
            type: 'copy_bulk',
            status: 'COMPLETED',
            progress_percent: 100,
            total: 1,
            successCount: 1,
            failedCount: 0,
            results: [
              {
                id: 4,
                sourceMaterial: 'A1BH0214C',
                sourcePlant: '1012',
                targetMaterial: 'A1BH0214C',
                targetPlant: '1012',
                targetAltBom: '23',
                bomNumber: '00785396',
                status: 'SUCCESS',
                message: 'Full hierarchy copied & verified: created new Alternative 23 for A1BH0214C.'
              }
            ]
          }
        })
      });
    });

    await page.goto('/products/bom/copy/bulk');
    await page.waitForLoadState('networkidle');

    // Upload spreadsheet
    const filePath = create4RowCopySpreadsheet();
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('button:has-text("Browse file")');
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(filePath);

    // Click Continue to go to preview
    const continueBtn = page.locator('button:has-text("Continue")');
    if (await continueBtn.isVisible()) {
      await continueBtn.click();
    }

    // Step 2: Validate Data
    await page.click('button:has-text("Validate Data")');
    const copyBtn = page.locator('button:has-text("Copy BOMs")');
    await expect(copyBtn).toBeVisible({ timeout: 5000 });

    // Step 2 -> Execute Copy
    page.on('dialog', (dialog) => dialog.accept());
    await copyBtn.click();

    // Wait for Execution Results screen (Step 3)
    await expect(page.locator('h3:has-text("BOM Copy Completed with Errors")')).toBeVisible({ timeout: 10000 });

    // 1. Check Banner text and counts
    const bannerDesc = page.locator('p:has-text("Copied 1 BOM(s); 3 failed out of 4 total entries.")');
    await expect(bannerDesc).toBeVisible();

    // 2. Check Execution Results table rows
    const rows = page.locator('table.sap-bulk-table tbody tr');
    await expect(rows).toHaveCount(4);

    // Row 1: must be Failed, NOT Copied, must NOT have target alt 23 or BOM 00785396
    const row1 = rows.nth(0);
    await expect(row1.locator('.sap-badge:has-text("Failed")')).toBeVisible();
    await expect(row1.locator('text=00785396')).not.toBeVisible();
    await expect(row1.locator('text=Source alternative 99 does not exist')).toBeVisible();

    // Rows 2 & 3: must show red badge with label "Failed"
    const row2 = rows.nth(1);
    await expect(row2.locator('.sap-badge:has-text("Failed")')).toBeVisible();
    const row3 = rows.nth(2);
    await expect(row3.locator('.sap-badge:has-text("Failed")')).toBeVisible();

    // Row 4: must show green badge with label "Copied" and BOM 00785396
    const row4 = rows.nth(3);
    await expect(row4.locator('.sap-badge:has-text("Copied")')).toBeVisible();
    await expect(row4.locator('text=SAP BOM: 00785396')).toBeVisible();

    // 3. Check zero horizontal scrollbar on the table container
    const scrollWidth = await page.evaluate(() => {
      const el = document.querySelector('.sap-bulk-grid-container');
      return el ? el.scrollWidth - el.clientWidth : 0;
    });
    expect(scrollWidth).toBeLessThanOrEqual(5);

    // Take and save screenshot
    const shotPath = path.join(artifactDir, `issue1-bulk-copy-${vp.label}.png`);
    await page.screenshot({ path: shotPath, fullPage: true });

    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (_) {}
    }
  });
}
