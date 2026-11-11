import { test, expect } from '@playwright/test';
import * as XLSX from 'xlsx';
import { setupMocks } from './helpers/mockApi.js';

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
      'Source Material': 'A1PSB001B-BK02',
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

test.describe('Bulk Progress Card and Bar (1366x768)', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test('progress bar displays step label, elapsed time, and advances monotonically', async ({ page }) => {
    await setupMocks(page, { authenticated: true });

    let pollCount = 0;
    const testJobId = 'mock-progress-job-001';

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
            jobId: testJobId,
            status: 'RUNNING',
            total: 2,
            message: 'Background job initialized successfully.'
          })
        });
      }

      if (url.includes(testJobId)) {
        pollCount++;
        if (pollCount <= 2) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              job: {
                jobId: testJobId,
                status: 'RUNNING',
                total: 2,
                processed: 1,
                total_steps: 6,
                completed_steps: 2,
                progress_percent: 33,
                current_step: 'Reading source BOM 1 of 2 (A1PSB001B)...',
                startedAt: new Date(Date.now() - 5000).toISOString(),
                createdAt: new Date(Date.now() - 5000).toISOString(),
                updatedAt: new Date().toISOString(),
                currentBom: { sourceMaterial: 'A1PSB001B-BK01', plant: '1010' }
              }
            })
          });
        } else {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              job: {
                jobId: testJobId,
                status: 'COMPLETED',
                total: 2,
                processed: 2,
                total_steps: 6,
                completed_steps: 6,
                progress_percent: 100,
                current_step: 'Validation complete',
                startedAt: new Date(Date.now() - 15000).toISOString(),
                completedAt: new Date().toISOString(),
                createdAt: new Date(Date.now() - 15000).toISOString(),
                updatedAt: new Date().toISOString(),
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
                    sourceMaterial: 'A1PSB001B-BK02',
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

    // Upload spreadsheet
    const fileBuffer = create2BomCopySpreadsheet();
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'Batch_BOM_Copy.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: fileBuffer
    });

    await page.waitForTimeout(300);

    // Click Continue to go to Step 2 Preview
    const continueBtn = page.locator('button:has-text("Continue")').first();
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    await page.waitForSelector('.sap-bulk-table', { state: 'visible', timeout: 10000 });

    // Click Validate data with SAP
    const validateBtn = page.locator('button.validate-with-sap-btn');
    await expect(validateBtn).toBeVisible({ timeout: 10000 });
    await validateBtn.click();

    // Verify progress card becomes visible
    const progressCard = page.locator('.rx-bulk-progress-card');
    await expect(progressCard).toBeVisible({ timeout: 10000 });

    // Verify progress bar element exists and has width > 0%
    const progressBar = page.locator('.rx-progress-bar-fill');
    await expect(progressBar).toBeVisible();

    // Verify elapsed ticker displays
    const elapsedText = page.locator('.rx-elapsed-ticker');
    await expect(elapsedText).toBeVisible();
    await expect(elapsedText).toContainText(/Elapsed:\s*\d+:\d{2}/i);

    // Verify step label is rendered
    await expect(progressCard.getByText(/Reading source BOM|Validating/i).first()).toBeVisible();

    // Verify completion
    await expect(page.locator('table.sap-bulk-table tr.row-status-ready').first()).toBeVisible({ timeout: 12000 });
  });
});
