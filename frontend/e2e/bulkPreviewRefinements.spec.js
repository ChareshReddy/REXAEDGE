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

function create4BomSpreadsheet() {
  const data = [
    {
      Seq: 1,
      Material: 'MAT-10MSG',
      Plant: '1010',
      Component: 'C-001',
      Quantity: 5,
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
      Material: 'MAT-2MSG',
      Plant: '1010',
      Component: 'C-004',
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
      Seq: 3,
      Material: 'MAT-1MSG',
      Plant: '1010',
      Component: 'C-005',
      Quantity: 2,
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
      Material: 'MAT-READY',
      Plant: '1010',
      Component: 'C-006',
      Quantity: 1,
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

test.describe('Bulk Create BOM - Step 2 Data Preview Refinements', () => {
  for (const viewport of [
    { width: 1366, height: 768, name: '1366x768' },
    { width: 1920, height: 1080, name: '1920x1080' }
  ]) {
    test(`Data Preview table assertions & screenshots at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await setupMocks(page, { authenticated: true });

      // Mock BOM jobs endpoint with 4 specific BOM scenarios (both /bom/jobs/ and /bom-jobs/)
      const handleBomJob = async (route) => {
        const req = route.request();
        const url = req.url();
        const method = req.method();

        if (url.includes('/start') || method === 'POST') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              jobId: 'job-bulk-refine-01',
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
              id: 'job-bulk-refine-01',
              type: 'create_preflight',
              status: 'COMPLETED',
              processed: 4,
              total: 4,
              successCount: 1,
              failedCount: 3,
              skippedCount: 0,
              notProcessedCount: 0,
              results: [
                {
                  sequenceNum: '1',
                  material: 'MAT-10MSG',
                  plant: '1010',
                  status: 'Failed',
                  reason: 'Header material "MAT-10MSG" not found in plant 1010 | Component C-001 is obsolete | Quantity exceeds maximum allowed lot size',
                  errors: [
                    'Header material "MAT-10MSG" not found in plant 1010',
                    'Component C-001 is obsolete',
                    'Quantity exceeds maximum allowed lot size',
                    'Item category L requires valid valuation class',
                    'Unit of measure PCE does not match base UoM KG',
                    'Costing relevancy flag missing for component C-002',
                    'Component C-003 has recursive loop in BOM'
                  ],
                  warnings: [
                    'Alternative 01 valid from date is in the past',
                    'Plant 1010 has planned downtime on valid from date',
                    'Storage location not specified; default will be used'
                  ]
                },
                {
                  sequenceNum: '2',
                  material: 'MAT-2MSG',
                  plant: '1010',
                  status: 'Failed',
                  reason: 'Component C-004 not maintained in plant 1010 | Invalid base quantity value',
                  errors: [
                    'Component C-004 not maintained in plant 1010',
                    'Invalid base quantity value'
                  ],
                  warnings: []
                },
                {
                  sequenceNum: '3',
                  material: 'MAT-1MSG',
                  plant: '1010',
                  status: 'Failed',
                  errors: [
                    'Single fatal validation error on material MAT-1MSG'
                  ],
                  warnings: []
                },
                {
                  sequenceNum: '4',
                  material: 'MAT-READY',
                  plant: '1010',
                  status: 'Ready',
                  errors: [],
                  warnings: []
                }
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

      // 2. Upload the 4-BOM spreadsheet
      const fileBuffer = create4BomSpreadsheet();
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles({
        name: 'Bulk_BOM_4Items.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: fileBuffer
      });

      await page.waitForTimeout(300);
      const continueBtn = page.locator('button:has-text("Continue")').first();
      await expect(continueBtn).toBeEnabled();
      await continueBtn.click();

      // 3. Step 2 Preview table loads
      await page.waitForSelector('.preflight-preview-table', { state: 'visible', timeout: 8000 });

      // Run SAP validation
      const validateBtn = page.locator('.validate-with-sap-btn').first();
      if (await validateBtn.isVisible()) {
        await validateBtn.click();
      }

      // Wait for validation results to be populated in table
      await expect(page.locator('.col-result .sap-badge').first()).toBeVisible({ timeout: 10000 });
      await page.waitForTimeout(500);

      // --- REQUIREMENT A: RESULT COLUMN ---
      // Last column (Result) must show ONLY the badge (Failed / Ready / Skipped).
      // NO truncated message text under badge, no secondary button.
      const resultCells = page.locator('.col-result');
      const count = await resultCells.count();
      // One header th + 4 rows
      expect(count).toBeGreaterThanOrEqual(4);

      // Check each row's result cell
      const rowResultCells = page.locator('tbody tr.bom-group-first-row .col-result');
      expect(await rowResultCells.count()).toBe(4);

      for (let i = 0; i < 4; i++) {
        const cell = rowResultCells.nth(i);
        const badge = cell.locator('.sap-badge');
        await expect(badge).toBeVisible();

        // Cell text should equal badge text (no extra text / subtitle under badge)
        const cellText = (await cell.innerText()).trim();
        const badgeText = (await badge.innerText()).trim();
        expect(cellText).toBe(badgeText);

        // Assert no buttons or subtitle spans inside result cell
        const buttonsInside = await cell.locator('button').count();
        expect(buttonsInside).toBe(0);
      }

      // Verify specific statuses
      await expect(rowResultCells.nth(0).locator('.sap-badge')).toHaveText('Failed');
      await expect(rowResultCells.nth(1).locator('.sap-badge')).toHaveText('Failed');
      await expect(rowResultCells.nth(2).locator('.sap-badge')).toHaveText('Failed');
      await expect(rowResultCells.nth(3).locator('.sap-badge')).toHaveText('Ready');

      // --- REQUIREMENT B: ERROR AREA UNDER EACH FAILED ROW ---

      // 1. No joined first line (errors.join(' | '))
      const messageRows = page.locator('.bom-messages-row');
      expect(await messageRows.count()).toBe(3); // 3 failed BOMs, ready BOM has 0 message rows

      const allMsgItemTexts = await page.locator('.bom-msg-item span:nth-child(2)').allInnerTexts();
      for (const msgText of allMsgItemTexts) {
        expect(msgText).not.toContain(' | ');
      }

      // First visible message in row 1 is individual, not joined
      const row1FirstMsg = await messageRows.nth(0).locator('.bom-msg-item').first().innerText();
      expect(row1FirstMsg).toContain('Header material "MAT-10MSG" not found in plant 1010');
      expect(row1FirstMsg).not.toContain('Component C-001 is obsolete');

      // 2. Row 1 has 10 messages total (7 errors + 3 warnings)
      // When collapsed: exactly 3 messages shown
      const row1MsgItemsCollapsed = messageRows.nth(0).locator('.bom-msg-item');
      expect(await row1MsgItemsCollapsed.count()).toBe(3);

      // Button in Row 1: "Show 7 more", aria-expanded=false
      const row1ToggleBtn = messageRows.nth(0).locator('button.toggle-messages-btn');
      await expect(row1ToggleBtn).toBeVisible();
      await expect(row1ToggleBtn).toHaveText('Show 7 more');
      expect(await row1ToggleBtn.getAttribute('aria-expanded')).toBe('false');

      // Expand Row 1: click "Show 7 more"
      await row1ToggleBtn.click();
      await page.waitForTimeout(200);

      // Now all 10 messages are shown
      const row1MsgItemsExpanded = messageRows.nth(0).locator('.bom-msg-item');
      expect(await row1MsgItemsExpanded.count()).toBe(10);
      await expect(row1ToggleBtn).toHaveText('Show less');
      expect(await row1ToggleBtn.getAttribute('aria-expanded')).toBe('true');

      // Order check: 7 errors first (red AlertCircle), then 3 warnings (amber AlertTriangle)
      for (let eIdx = 0; eIdx < 7; eIdx++) {
        const item = row1MsgItemsExpanded.nth(eIdx);
        expect(await item.getAttribute('class')).toContain('bom-msg-error');
      }
      for (let wIdx = 7; wIdx < 10; wIdx++) {
        const item = row1MsgItemsExpanded.nth(wIdx);
        expect(await item.getAttribute('class')).toContain('bom-msg-warning');
      }

      // Collapse back
      await row1ToggleBtn.click();
      await page.waitForTimeout(200);
      expect(await messageRows.nth(0).locator('.bom-msg-item').count()).toBe(3);
      await expect(row1ToggleBtn).toHaveText('Show 7 more');

      // 3. Row 2 has 2 messages: exactly 2 shown, NO toggle button
      const row2MsgItems = messageRows.nth(1).locator('.bom-msg-item');
      expect(await row2MsgItems.count()).toBe(2);
      expect(await messageRows.nth(1).locator('button.toggle-messages-btn').count()).toBe(0);

      // 4. Row 3 has 1 message: exactly 1 shown, NO toggle button
      const row3MsgItems = messageRows.nth(2).locator('.bom-msg-item');
      expect(await row3MsgItems.count()).toBe(1);
      expect(await messageRows.nth(2).locator('button.toggle-messages-btn').count()).toBe(0);

      // 5. Row 4 (Ready row): NO message row
      // (Verified by messageRows.count() === 3 for 4 BOMs)

      // --- REQUIREMENT B.4: NO HORIZONTAL SCROLLBAR ---
      const tableContainer = page.locator('.preflight-preview-table').locator('..');
      const overflowInfo = await tableContainer.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        hasHorizontalScroll: el.scrollWidth > el.clientWidth
      }));
      console.log(`[${viewport.name}] Preview Table Container Overflow:`, overflowInfo);
      expect(overflowInfo.hasHorizontalScroll).toBe(false);

      // Page-level horizontal scroll check
      const pageHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(pageHorizontalScroll).toBe(false);

      // --- REQUIREMENT B.6: SEARCH AND FILTERS ---
      // Search box filter
      const searchInput = page.locator('input[placeholder*="Search"]').first();
      await searchInput.fill('MAT-10MSG');
      await page.waitForTimeout(300);
      expect(await page.locator('tbody tr.bom-group-first-row').count()).toBe(1);
      await searchInput.clear();
      await page.waitForTimeout(300);
      expect(await page.locator('tbody tr.bom-group-first-row').count()).toBe(4);

      // Errors filter tab
      const errorsTab = page.locator('button:has-text("Errors")').first();
      await errorsTab.click();
      await page.waitForTimeout(300);
      expect(await page.locator('tbody tr.bom-group-first-row').count()).toBe(3);

      // Ready filter tab
      const readyTab = page.locator('button:has-text("Ready")').first();
      await readyTab.click();
      await page.waitForTimeout(300);
      expect(await page.locator('tbody tr.bom-group-first-row').count()).toBe(1);

      // All filter tab
      const allTab = page.locator('button:has-text("All")').first();
      await allTab.click();
      await page.waitForTimeout(300);
      expect(await page.locator('tbody tr.bom-group-first-row').count()).toBe(4);

      // Expand Row 1 for screenshot demonstration
      await row1ToggleBtn.click();
      await page.waitForTimeout(200);

      // Capture screenshots
      const screenshotName = `bulk-create-preview-refinements-${viewport.name}.png`;
      const screenshotPath = path.join(screenshotsDir, screenshotName);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      // Copy to artifact directory
      if (fs.existsSync(artifactDir)) {
        fs.copyFileSync(screenshotPath, path.join(artifactDir, screenshotName));
      }
    });
  }
});
