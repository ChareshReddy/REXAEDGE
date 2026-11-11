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

function create4BomCopySpreadsheet() {
  const data = [
    {
      'Source Material': 'SRC-FAIL1',
      'Source Plant': '1010',
      'Source BOM Usage': '1',
      'Source Alternative': '01',
      'Target Material': 'SRC-FAIL1',
      'Target Plant': '1001',
      'Target BOM Usage': '1',
      'Target Alternative': '01'
    },
    {
      'Source Material': 'SRC-FAIL2',
      'Source Plant': '1010',
      'Source BOM Usage': '1',
      'Source Alternative': '01',
      'Target Material': 'SRC-FAIL2',
      'Target Plant': '1001',
      'Target BOM Usage': '1',
      'Target Alternative': '02'
    },
    {
      'Source Material': 'SRC-10MSG',
      'Source Plant': '1010',
      'Source BOM Usage': '1',
      'Source Alternative': '01',
      'Target Material': 'SRC-10MSG',
      'Target Plant': '1001',
      'Target BOM Usage': '1',
      'Target Alternative': '03'
    },
    {
      'Source Material': 'SRC-READY',
      'Source Plant': '1010',
      'Source BOM Usage': '1',
      'Source Alternative': '01',
      'Target Material': 'SRC-READY',
      'Target Plant': '1001',
      'Target BOM Usage': '1',
      'Target Alternative': '04'
    }
  ];
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

test.describe('Bulk Copy BOM - Step 2 Data Preview Refinements', () => {
  for (const viewport of [
    { width: 1366, height: 768, name: '1366x768' },
    { width: 1920, height: 1080, name: '1920x1080' }
  ]) {
    test(`Data Preview table assertions & screenshots at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await setupMocks(page, { authenticated: true });

      let startCopyPayload = null;

      // Handle BOM background jobs (validation and execution)
      const handleBomJob = async (route) => {
        const req = route.request();
        const url = req.url();
        const method = req.method();

        if (url.includes('/start') || method === 'POST') {
          let postData = null;
          try {
            postData = req.postDataJSON();
          } catch (_) {}

          if (postData?.type === 'copy_bulk') {
            startCopyPayload = postData;
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                success: true,
                jobId: 'mock-copy-bulk-job-999',
                total: 1
              })
            });
          }

          // copy_validate start
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              jobId: 'mock-copy-val-job-123',
              total: 4
            })
          });
        }

        // Job status polling
        if (url.includes('mock-copy-val-job-123')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              job: {
                jobId: 'mock-copy-val-job-123',
                type: 'copy_validate',
                status: 'COMPLETED_WITH_ERRORS',
                processed: 4,
                total: 4,
                successCount: 1,
                failedCount: 3,
                results: [
                  {
                    id: 1,
                    sourceMaterial: 'SRC-FAIL1',
                    sourcePlant: '1010',
                    targetMaterial: 'SRC-FAIL1',
                    targetPlant: '1001',
                    targetAltBom: '01',
                    status: 'ERROR',
                    message: 'Source BOM does not exist in plant 1010 for material SRC-FAIL1',
                    problems: ['Source BOM does not exist in plant 1010 for material SRC-FAIL1'],
                    componentCount: 4
                  },
                  {
                    id: 2,
                    sourceMaterial: 'SRC-FAIL2',
                    sourcePlant: '1010',
                    targetMaterial: 'SRC-FAIL2',
                    targetPlant: '1001',
                    targetAltBom: '02',
                    status: 'ERROR',
                    message: 'Target alternative BOM 02 already exists in target plant 1001',
                    problems: ['Target alternative BOM 02 already exists in target plant 1001'],
                    componentCount: 2
                  },
                  {
                    id: 3,
                    sourceMaterial: 'SRC-10MSG',
                    sourcePlant: '1010',
                    targetMaterial: 'SRC-10MSG',
                    targetPlant: '1001',
                    targetAltBom: '03',
                    status: 'ERROR',
                    message: 'Problem 1: Header material SRC-10MSG is flagged for deletion in plant 1010',
                    problems: [
                      'Problem 1: Header material SRC-10MSG is flagged for deletion in plant 1010',
                      'Problem 2: Base unit of measure mismatch between source PC and target KG',
                      'Problem 3: Component C-001 does not exist in target plant 1001',
                      'Problem 4: Component C-002 procurement type forbids plant transfer',
                      'Problem 5: Component C-003 bulk material indicator conflicts with usage 1',
                      'Problem 6: Storage location 0001 is locked for physical inventory in plant 1001',
                      'Problem 7: Validity date 01.01.2026 is outside active change master validity window',
                      { type: 'warning', message: 'Warning 8: Alternative BOM description exceeds 40 characters and will be truncated' },
                      { type: 'warning', message: 'Warning 9: Target plant 1001 uses different costing variant PPC1' },
                      { type: 'warning', message: 'Warning 10: Recursive component loop detected in sub-assembly C-005' }
                    ],
                    componentCount: 15
                  },
                  {
                    id: 4,
                    sourceMaterial: 'SRC-READY',
                    sourcePlant: '1010',
                    targetMaterial: 'SRC-READY',
                    targetPlant: '1001',
                    targetAltBom: '04',
                    status: 'VALID',
                    message: 'Ready to copy.',
                    problems: [],
                    componentCount: 8
                  }
                ]
              }
            })
          });
        }

        if (url.includes('mock-copy-bulk-job-999')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              job: {
                jobId: 'mock-copy-bulk-job-999',
                type: 'copy_bulk',
                status: 'COMPLETED',
                processed: 1,
                total: 1,
                successCount: 1,
                failedCount: 0,
                results: [
                  {
                    id: 4,
                    sourceMaterial: 'SRC-READY',
                    status: 'SUCCESS',
                    message: 'BOM copied successfully'
                  }
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

      await page.route('**/api/bom/jobs/**', handleBomJob);
      await page.route('**/api/bom-jobs/**', handleBomJob);

      // Navigate to Bulk Copy BOM
      await page.goto('/products/bom/copy/bulk', { waitUntil: 'networkidle' });
      await page.waitForSelector('.rx-bulk-upload-card, .bulk-upload-dropzone', { state: 'visible', timeout: 8000 });

      // Upload spreadsheet
      const excelBuffer = create4BomCopySpreadsheet();
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles({
        name: 'Bulk_Copy_Test.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: excelBuffer
      });

      await page.waitForTimeout(400);

      // Advance to Step 2
      const continueBtn = page.locator('button:has-text("Continue")').first();
      await expect(continueBtn).toBeEnabled();
      await continueBtn.click();

      await page.waitForSelector('.sap-bulk-table', { state: 'visible', timeout: 5000 });

      // Trigger "Validate data"
      const validateBtn = page.locator('.validate-with-sap-btn').first();
      await expect(validateBtn).toBeVisible();
      await validateBtn.click();

      // Wait for validation to finish (button becomes enabled and Failed badges appear)
      await expect(page.locator('.execute-batch-copy-btn')).toBeEnabled({ timeout: 10000 });
      await expect(page.locator('.sap-badge-danger').first()).toBeVisible({ timeout: 5000 });

      // A. REMOVE TWO CONTROLS ASSERTIONS:
      // 1. "Copy Full Hierarchy" and "Skip errors" text NOT found on page
      await expect(page.locator('text=Copy Full Hierarchy')).not.toBeVisible();
      await expect(page.locator('text=Skip errors')).not.toBeVisible();

      // B. TABLE HEADER ASSERTION:
      // 2. Diagnostic Message replaced with Result column
      await expect(page.locator('.sap-bulk-table th:has-text("Diagnostic Message")')).toHaveCount(0);
      const resultTh = page.locator('.sap-bulk-table th:has-text("Result")');
      await expect(resultTh).toBeVisible();

      // C. RESULT CELL ONLY HAS BADGE TEXT:
      const resultTds = page.locator('.sap-bulk-table tbody tr:not(.bom-messages-row) td.col-result');
      expect(await resultTds.count()).toBe(4);

      const r1Text = (await resultTds.nth(0).innerText()).trim();
      const r2Text = (await resultTds.nth(1).innerText()).trim();
      const r3Text = (await resultTds.nth(2).innerText()).trim();
      const r4Text = (await resultTds.nth(3).innerText()).trim();

      expect(r1Text).toBe('Failed');
      expect(r2Text).toBe('Failed');
      expect(r3Text).toBe('Failed');
      expect(r4Text).toBe('Ready');

      // D. ERROR AREA UNDER EACH FAILED ROW:
      // Row 1 and Row 2 have 1 message each -> no toggle button
      const messageRows = page.locator('.sap-bulk-table tr.bom-messages-row');
      expect(await messageRows.count()).toBe(3); // Row 1, Row 2, Row 3 have message rows; Row 4 (Ready) does NOT

      // Row 1 & 2 toggle buttons count is 0
      const row1Toggle = messageRows.nth(0).locator('.toggle-messages-btn');
      const row2Toggle = messageRows.nth(1).locator('.toggle-messages-btn');
      expect(await row1Toggle.count()).toBe(0);
      expect(await row2Toggle.count()).toBe(0);

      // Row 3 (10 messages):
      // Initially displays 3 items, button says "Show 7 more", aria-expanded="false"
      const row3Messages = messageRows.nth(2).locator('.bom-msg-item');
      expect(await row3Messages.count()).toBe(3);

      const row3Toggle = messageRows.nth(2).locator('.toggle-messages-btn');
      await expect(row3Toggle).toBeVisible();
      expect(await row3Toggle.getAttribute('aria-expanded')).toBe('false');
      expect((await row3Toggle.innerText()).trim()).toBe('Show 7 more');

      // G. SCREENSHOT CAPTURE (Showing 2 failed rows with 1 msg, 1 row with 3 msgs + 'Show 7 more', and 1 Ready row):
      const screenshotFilename = `bulk-copy-preview-refinements-${viewport.name}.png`;
      const screenshotLocalPath = path.join(screenshotsDir, screenshotFilename);
      const screenshotArtifactPath = path.join(artifactDir, screenshotFilename);

      await page.screenshot({ path: screenshotLocalPath, fullPage: true });
      fs.copyFileSync(screenshotLocalPath, screenshotArtifactPath);

      // Click toggle button: expands to 10 messages, button says "Show less", aria-expanded="true"
      await row3Toggle.click();
      await page.waitForTimeout(200);

      const row3MessagesExpanded = messageRows.nth(2).locator('.bom-msg-item');
      expect(await row3MessagesExpanded.count()).toBe(10);
      expect(await row3Toggle.getAttribute('aria-expanded')).toBe('true');
      expect((await row3Toggle.innerText()).trim()).toBe('Show less');

      // E. FULL MESSAGE TEXT VISIBLE (no ellipsis clipping):
      for (let i = 0; i < 10; i++) {
        const itemSpan = row3MessagesExpanded.nth(i).locator('span:last-child');
        const box = await itemSpan.evaluate((el) => ({
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth
        }));
        expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth + 2);
      }

      // F. NO HORIZONTAL OVERFLOW ON PREVIEW TABLE CONTAINER:
      const tableContainer = page.locator('.sap-bulk-grid-container').first();
      const overflow = await tableContainer.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 2);

      // H. START-COPY EXECUTION PAYLOAD:
      // Auto-accept window.confirm
      page.once('dialog', (dialog) => dialog.accept());

      const copyBomsBtn = page.locator('.execute-batch-copy-btn');
      await expect(copyBomsBtn).toBeEnabled();
      await copyBomsBtn.click();

      await page.waitForTimeout(500);

      expect(startCopyPayload).not.toBeNull();
      expect(startCopyPayload.copyHierarchy).toBe(true);
      expect(startCopyPayload.skipErrors).toBe(true);
      expect(startCopyPayload.type).toBe('copy_bulk');
    });
  }
});
