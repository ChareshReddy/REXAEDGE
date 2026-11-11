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

function create2BomCopySpreadsheet() {
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
    }
  ];
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function create2BomCreateSpreadsheet() {
  const data = [
    {
      'Material Number': 'A1PSB001B-BK01',
      'Plant': '1010',
      'BOM Usage': '1',
      'Alternative BOM': '02',
      'Base Quantity': '1',
      'Component Material': 'COMP-001',
      'Component Quantity': '2',
      'Item Category': 'L',
      'Valid From': '2026-01-01'
    },
    {
      'Material Number': 'MAT-TEST-02',
      'Plant': '1010',
      'BOM Usage': '1',
      'Alternative BOM': '01',
      'Base Quantity': '1',
      'Component Material': 'COMP-002',
      'Component Quantity': '5',
      'Item Category': 'L',
      'Valid From': '2026-01-01'
    }
  ];
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

async function saveScreenshot(page, filename) {
  const localPath = path.join(screenshotsDir, filename);
  await page.screenshot({ path: localPath, fullPage: false });
  if (fs.existsSync(artifactDir)) {
    const artPath = path.join(artifactDir, filename);
    fs.copyFileSync(localPath, artPath);
  }
}

test.describe('Bulk Preview Sizing, Watchdog, & Status Handling', () => {
  test('Bulk Copy preview table & job states across viewports', async ({ page }) => {
    for (const vp of [
      { width: 1366, height: 768, name: '1366x768' },
      { width: 1920, height: 1080, name: '1920x1080' }
    ]) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await setupMocks(page, { authenticated: true });

      let currentJobState = 'RUNNING';

      const handleJobs = async (route) => {
        const req = route.request();
        const url = req.url();
        const method = req.method();

        if (url.includes('/start') || method === 'POST') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              jobId: 'mock-test-job-001',
              total: 2
            })
          });
        }

        if (url.includes('mock-test-job-001')) {
          if (currentJobState === 'RUNNING') {
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                success: true,
                job: {
                  jobId: 'mock-test-job-001',
                  status: 'RUNNING',
                  total: 2,
                  processed: 1,
                  successCount: 1,
                  failedCount: 0,
                  currentBom: { sourceMaterial: 'A1PSB001B-BK01', plant: '1010' }
                }
              })
            });
          }

          if (currentJobState === 'FAILED_ROW') {
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                success: true,
                job: {
                  jobId: 'mock-test-job-001',
                  status: 'COMPLETED_WITH_ERRORS',
                  total: 2,
                  processed: 2,
                  successCount: 1,
                  failedCount: 1,
                  results: [
                    {
                      id: 0,
                      sourceMaterial: 'A1PSB001B-BK01',
                      sourcePlant: '1010',
                      sourceUsage: '1',
                      sourceAltBom: '01',
                      targetMaterial: 'TGT-MAT-01',
                      targetPlant: '1010',
                      targetUsage: '1',
                      targetAltBom: '02',
                      status: 'Ready',
                      componentCount: 3,
                      message: 'BOM ready for copy'
                    },
                    {
                      id: 1,
                      sourceMaterial: 'NON-EXISTENT-MAT',
                      sourcePlant: '1010',
                      sourceUsage: '1',
                      sourceAltBom: '01',
                      targetMaterial: 'TGT-MAT-02',
                      targetPlant: '1010',
                      targetUsage: '1',
                      targetAltBom: '02',
                      status: 'Failed',
                      componentCount: 0,
                      message: 'Source BOM does not exist in SAP for material NON-EXISTENT-MAT plant 1010',
                      problems: ['Material NON-EXISTENT-MAT does not exist in plant 1010']
                    }
                  ]
                }
              })
            });
          }

          if (currentJobState === 'READY') {
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                success: true,
                job: {
                  jobId: 'mock-test-job-001',
                  status: 'COMPLETED',
                  total: 2,
                  processed: 2,
                  successCount: 2,
                  failedCount: 0,
                  results: [
                    {
                      id: 0,
                      sourceMaterial: 'A1PSB001B-BK01',
                      sourcePlant: '1010',
                      sourceUsage: '1',
                      sourceAltBom: '01',
                      targetMaterial: 'TGT-MAT-01',
                      targetPlant: '1010',
                      targetUsage: '1',
                      targetAltBom: '02',
                      status: 'Ready',
                      componentCount: 3,
                      message: 'BOM ready for copy'
                    },
                    {
                      id: 1,
                      sourceMaterial: 'NON-EXISTENT-MAT',
                      sourcePlant: '1010',
                      sourceUsage: '1',
                      sourceAltBom: '01',
                      targetMaterial: 'TGT-MAT-02',
                      targetPlant: '1010',
                      targetUsage: '1',
                      targetAltBom: '02',
                      status: 'Ready',
                      componentCount: 2,
                      message: 'BOM ready for copy'
                    }
                  ]
                }
              })
            });
          }
        }

        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, active: false })
        });
      };

      await page.route(/\/api\/bom(-jobs|\/jobs)/, handleJobs);

      // Navigate to Bulk Copy BOM
      await page.goto('/products/bom/copy/bulk', { waitUntil: 'networkidle' });
      await page.waitForSelector('.rx-bulk-upload-card, .bulk-upload-dropzone', { state: 'visible', timeout: 10000 });

      // Upload file
      const fileBuffer = create2BomCopySpreadsheet();
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles({
        name: 'Batch_BOM_Copy.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: fileBuffer
      });

      await page.waitForTimeout(300);

      // Click Continue to go to Step 2
      const continueBtn = page.locator('button:has-text("Continue")').first();
      await expect(continueBtn).toBeEnabled();
      await continueBtn.click();

      // Step 2 table rendered
      await page.waitForSelector('.sap-bulk-table', { state: 'visible', timeout: 10000 });

      // --- STATE 1: NOT VALIDATED (2 rows) ---
      const table = page.locator('table.sap-bulk-table');
      const tableBox = await table.boundingBox();
      const container = page.locator('.sap-bulk-grid-container');

      // Assert no horizontal scroll on container
      const containerScroll = await container.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth
      }));
      expect(containerScroll.scrollWidth).toBeLessThanOrEqual(containerScroll.clientWidth + 1);

      // Assert Source and Target column widths within 10% of each other and each < 40% of table width
      const thSource = page.locator('table.sap-bulk-table th:has-text("Source BOM")');
      const thTarget = page.locator('table.sap-bulk-table th:has-text("Target BOM")');
      const sourceBox = await thSource.boundingBox();
      const targetBox = await thTarget.boundingBox();

      expect(sourceBox.width).toBeLessThan(tableBox.width * 0.40);
      expect(targetBox.width).toBeLessThan(tableBox.width * 0.40);
      const widthDiff = Math.abs(sourceBox.width - targetBox.width) / Math.max(sourceBox.width, targetBox.width);
      expect(widthDiff).toBeLessThanOrEqual(0.10);

      // Assert Result badge fully visible
      const resultBadge = page.locator('table.sap-bulk-table .col-result .sap-badge').first();
      await expect(resultBadge).toContainText('Not validated');
      const badgeBox = await resultBadge.boundingBox();
      const thResult = page.locator('table.sap-bulk-table th:has-text("Result")');
      const thResultBox = await thResult.boundingBox();
      expect(thResultBox.width).toBeGreaterThanOrEqual(badgeBox.width + 10);

      await saveScreenshot(page, `preview-not-validated-${vp.name}.png`);

      // --- STATE 2: VALIDATING ---
      currentJobState = 'RUNNING';
      const validateBtn = page.locator('.validate-with-sap-btn').first();
      await validateBtn.click();

      await page.waitForSelector('.rx-bulk-progress-card', { state: 'visible', timeout: 8000 });
      await saveScreenshot(page, `preview-validating-${vp.name}.png`);

      // --- STATE 3: VALIDATED WITH A FAILED ROW ---
      currentJobState = 'FAILED_ROW';
      await page.waitForSelector('table.sap-bulk-table tr.row-status-error', { state: 'visible', timeout: 12000 });
      await page.waitForSelector('tr.bom-messages-row', { state: 'visible', timeout: 8000 });

      const failedScroll = await container.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth
      }));
      expect(failedScroll.scrollWidth).toBeLessThanOrEqual(failedScroll.clientWidth + 1);

      await saveScreenshot(page, `preview-validated-failed-${vp.name}.png`);

      // --- STATE 4: VALIDATED READY ---
      currentJobState = 'READY';
      await validateBtn.click();
      await page.waitForSelector('table.sap-bulk-table tr.row-status-ready', { state: 'visible', timeout: 12000 });

      const readyScroll = await container.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth
      }));
      expect(readyScroll.scrollWidth).toBeLessThanOrEqual(readyScroll.clientWidth + 1);

      await saveScreenshot(page, `preview-validated-ready-${vp.name}.png`);
    }
  });

  test('Bulk Create BOM preview table has no horizontal scroll and result fully visible', async ({ page }) => {
    for (const vp of [
      { width: 1366, height: 768, name: '1366x768' },
      { width: 1920, height: 1080, name: '1920x1080' }
    ]) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await setupMocks(page, { authenticated: true });

      await page.goto('/products/bom/create/bulk', { waitUntil: 'networkidle' });
      await page.waitForSelector('.rx-bulk-upload-card, .bulk-upload-dropzone', { state: 'visible', timeout: 10000 });

      const fileBuffer = create2BomCreateSpreadsheet();
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles({
        name: 'Batch_BOM_Create.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: fileBuffer
      });

      await page.waitForTimeout(300);
      const continueBtn = page.locator('button:has-text("Continue")').first();
      await expect(continueBtn).toBeEnabled();
      await continueBtn.click();

      await page.waitForSelector('table.preflight-preview-table', { state: 'visible', timeout: 10000 });
      const container = page.locator('.sap-card-table-scroll').first();

      const scrollInfo = await container.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth
      }));
      expect(scrollInfo.scrollWidth).toBeLessThanOrEqual(scrollInfo.clientWidth + 1);

      const badge = page.locator('table.preflight-preview-table .col-result .sap-badge').first();
      await expect(badge).toContainText('Not validated');
      const badgeBox = await badge.boundingBox();
      const thResult = page.locator('table.preflight-preview-table th.col-result').first();
      const thResultBox = await thResult.boundingBox();
      expect(thResultBox.width).toBeGreaterThanOrEqual(badgeBox.width + 10);
    }
  });

  test('Interrupted and Not-Found job states stop spinner and display appropriate alerts', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await setupMocks(page, { authenticated: true });

    let activeState = 'INTERRUPTED';

    await page.route(/\/api\/bom(-jobs|\/jobs)/, async (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (url.includes('/start') || method === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            jobId: 'status-test-job',
            status: activeState === 'QUEUED' ? 'QUEUED' : 'RUNNING',
            queuedReason: activeState === 'QUEUED' ? 'Waiting for your running job to finish' : null,
            total: 2
          })
        });
      }

      if (url.includes('status-test-job')) {
        if (activeState === 'INTERRUPTED') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              job: { jobId: 'status-test-job', status: 'INTERRUPTED' }
            })
          });
        }
        if (activeState === 'QUEUED') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              job: {
                jobId: 'status-test-job',
                status: 'QUEUED',
                queuedReason: 'Waiting for your running job to finish'
              }
            })
          });
        }
        if (activeState === 'NOT_FOUND') {
          return route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({ success: false, message: 'Job status-test-job not found.' })
          });
        }
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, active: false })
      });
    });

    await page.goto('/products/bom/copy/bulk', { waitUntil: 'networkidle' });
    await page.waitForSelector('.rx-bulk-upload-card, .bulk-upload-dropzone', { state: 'visible', timeout: 10000 });

    const fileBuffer = create2BomCopySpreadsheet();
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'Batch_BOM_Copy.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: fileBuffer
    });

    await page.waitForTimeout(300);
    const continueBtn = page.locator('button:has-text("Continue")').first();
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    await page.waitForSelector('table.sap-bulk-table', { state: 'visible', timeout: 10000 });

    // Test INTERRUPTED
    activeState = 'INTERRUPTED';
    const validateBtn = page.locator('.validate-with-sap-btn').first();
    await validateBtn.click();

    await page.waitForSelector('.rx-alert-warning', { state: 'visible', timeout: 10000 });
    const alertText = await page.locator('.rx-alert-warning').textContent();
    expect(alertText).toContain('The job was interrupted');
    expect(alertText).toContain('Please upload again');
    // Ensure spinner is gone
    const spinnerCount = await page.locator('.rx-bulk-progress-card').count();
    expect(spinnerCount).toBe(0);

    // Test QUEUED
    activeState = 'QUEUED';
    await validateBtn.click();
    await page.waitForSelector('.rx-bulk-progress-card', { state: 'visible', timeout: 10000 });
    const cardText = await page.locator('.rx-bulk-progress-card').textContent();
    expect(cardText).toContain('Waiting for your running job to finish');

    // Test NOT_FOUND
    activeState = 'NOT_FOUND';
    await page.waitForTimeout(3500); // Wait for next poll tick which returns 404
    await page.waitForSelector('.rx-alert-danger', { state: 'visible', timeout: 10000 });
    const dangerText = await page.locator('.rx-alert-danger').textContent();
    expect(dangerText).toContain('Job not found');
    const spinnerCount2 = await page.locator('.rx-bulk-progress-card').count();
    expect(spinnerCount2).toBe(0);
  });
});
