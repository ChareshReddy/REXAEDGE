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
  return { h, s: Math.round(s * 100), l: Math.round(l * 100), a, raw: colorStr };
}

async function saveScreenshot(page, filename) {
  const localPath = path.join(screenshotsDir, filename);
  await page.screenshot({ path: localPath, fullPage: false });
  if (fs.existsSync(artifactDir)) {
    const artPath = path.join(artifactDir, filename);
    fs.copyFileSync(localPath, artPath);
  }
}

function create6RowSpreadsheet() {
  const data = [
    // 3 skipped rows in a group
    {
      Seq: 1,
      Material: 'A1PSB001B_PARENT',
      Plant: '1010',
      Component: 'SUB_BOM_01',
      Quantity: 1,
      'Storage Location': '0001',
      'BOM Usage': '1',
      'Alternative BOM': '10',
      'Item Category': 'L',
      'Valid From': '01.01.2026',
      'Base Qty': 1,
      'BOM Status': '01'
    },
    {
      Seq: 1,
      Material: 'SUB_BOM_01',
      Plant: '1010',
      Component: 'RAW_MAT_A',
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
      Seq: 1,
      Material: 'SUB_BOM_02',
      Plant: '1010',
      Component: 'RAW_MAT_B',
      Quantity: 10,
      'Storage Location': '0001',
      'BOM Usage': '1',
      'Alternative BOM': '01',
      'Item Category': 'L',
      'Valid From': '01.01.2026',
      'Base Qty': 1,
      'BOM Status': '01'
    },
    // 1 ready row with a warning
    {
      Seq: 2,
      Material: 'MAT_WARN_01',
      Plant: '1010',
      Component: 'C_COMP_01',
      Quantity: 2,
      'Storage Location': '0001',
      'BOM Usage': '1',
      'Alternative BOM': '01',
      'Item Category': 'L',
      'Valid From': '01.01.2026',
      'Base Qty': 1,
      'BOM Status': '01'
    },
    // 1 ready row without messages
    {
      Seq: 3,
      Material: 'MAT_CLEAN_02',
      Plant: '1010',
      Component: 'C_COMP_02',
      Quantity: 4,
      'Storage Location': '0001',
      'BOM Usage': '1',
      'Alternative BOM': '01',
      'Item Category': 'L',
      'Valid From': '01.01.2026',
      'Base Qty': 1,
      'BOM Status': '01'
    },
    // 1 failed row with 2 messages
    {
      Seq: 4,
      Material: 'MAT_FAIL_03',
      Plant: '1010',
      Component: 'RAW_MAT_01',
      Quantity: 8,
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

test.describe('Bulk BOM Message Severity & Execution Details Refinements', () => {
  for (const viewport of [
    { width: 1366, height: 768, name: '1366x768' },
    { width: 1920, height: 1080, name: '1920x1080' }
  ]) {
    test(`Bulk Create Preview and Execution Details at ${viewport.name}`, async ({ page }, testInfo) => {
      if (testInfo.project.name !== viewport.name) {
        test.skip();
      }

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await setupMocks(page, { authenticated: true });

      let jobState = 'idle';

      const mockPreflightResults = [
        {
          sequenceNum: '1',
          material: 'A1PSB001B_PARENT',
          plant: '1010',
          bomUsage: '1',
          alternativeBom: '10',
          status: 'Skipped',
          reason: 'Skipped: alternative 10 of A1PSB001B_PARENT already exists in SAP.',
          errors: [],
          warnings: []
        },
        {
          sequenceNum: '1',
          material: 'SUB_BOM_01',
          plant: '1010',
          bomUsage: '1',
          alternativeBom: '01',
          status: 'Skipped',
          reason: 'Skipped: not created because the parent BOM A1PSB001B_PARENT already exists.',
          errors: [],
          warnings: []
        },
        {
          sequenceNum: '1',
          material: 'SUB_BOM_02',
          plant: '1010',
          bomUsage: '1',
          alternativeBom: '01',
          status: 'Skipped',
          reason: 'Skipped: not created because the parent BOM A1PSB001B_PARENT already exists.',
          errors: [],
          warnings: []
        },
        {
          sequenceNum: '2',
          material: 'MAT_WARN_01',
          plant: '1010',
          bomUsage: '1',
          alternativeBom: '01',
          status: 'Ready',
          warnings: ['Header material MAT_WARN_01 is not extended to plant 1010 (MARC).'],
          errors: []
        },
        {
          sequenceNum: '3',
          material: 'MAT_CLEAN_02',
          plant: '1010',
          bomUsage: '1',
          alternativeBom: '01',
          status: 'Ready',
          warnings: [],
          errors: []
        },
        {
          sequenceNum: '4',
          material: 'MAT_FAIL_03',
          plant: '1010',
          bomUsage: '1',
          alternativeBom: '01',
          status: 'Failed',
          errors: [
            'Component RAW_MAT_01 does not exist in plant 1010',
            'Consistency check when creating BOM item failed'
          ],
          warnings: []
        }
      ];

      const mockExecutionResults = [
        {
          sequenceNum: '1',
          material: 'A1PSB001B_PARENT',
          plant: '1010',
          bomUsage: '1',
          alternativeBom: '10',
          bomNumber: null,
          status: 'SKIPPED',
          message: 'BOM already exists for material A1PSB001B_PARENT in plant 1010; skipped.'
        },
        {
          sequenceNum: '2',
          material: 'MAT_WARN_01',
          plant: '1010',
          bomUsage: '1',
          alternativeBom: '01',
          bomNumber: '00010041',
          status: 'SUCCESS',
          message: 'BOM 00010041 created and verified in SAP.'
        },
        {
          sequenceNum: '3',
          material: 'MAT_CLEAN_02',
          plant: '1010',
          bomUsage: '1',
          alternativeBom: '01',
          bomNumber: '00010042',
          status: 'SUCCESS',
          message: 'BOM 00010042 created and verified in SAP.'
        },
        {
          sequenceNum: '4',
          material: 'MAT_FAIL_03',
          plant: '1010',
          bomUsage: '1',
          alternativeBom: '01',
          bomNumber: null,
          status: 'FAILED',
          errors: [
            'Component RAW_MAT_01 does not exist in plant 1010',
            'Consistency check when creating BOM item failed'
          ]
        }
      ];

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
                jobId: 'job-exec-sev-01',
                total: 4,
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
              jobId: 'job-preflight-sev-01',
              total: 6,
              status: 'PROCESSING'
            })
          });
        }

        if (jobState === 'execution' || url.includes('job-exec-sev-01')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              job: {
                id: 'job-exec-sev-01',
                type: 'create_bulk',
                status: 'COMPLETED_WITH_ERRORS',
                processed: 4,
                total: 4,
                successCount: 2,
                failedCount: 1,
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
              id: 'job-preflight-sev-01',
              type: 'create_preflight',
              status: 'COMPLETED',
              processed: 6,
              total: 6,
              successCount: 2,
              failedCount: 1,
              skippedCount: 3,
              notProcessedCount: 0,
              results: mockPreflightResults
            }
          })
        });
      };

      await page.route('**/api/bom-jobs/**', handleBomJob);
      await page.route('**/api/bom/jobs/**', handleBomJob);

      // 1. Navigate to Bulk Create BOM
      await page.goto('/products/bom/create/bulk', { waitUntil: 'networkidle' });
      await page.waitForSelector('.rx-bulk-upload-card, .bulk-upload-dropzone', { state: 'visible', timeout: 10000 });

      // 2. Upload spreadsheet
      const fileBuffer = create6RowSpreadsheet();
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles({
        name: 'Bulk_BOM_MessageSeverity.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: fileBuffer
      });

      await page.waitForTimeout(300);
      const continueBtn = page.locator('button:has-text("Continue")').first();
      await expect(continueBtn).toBeEnabled({ timeout: 5000 });
      await continueBtn.click();

      // 3. Step 2 Data Preview table loads
      await page.waitForSelector('.preflight-preview-table', { state: 'visible', timeout: 8000 });

      // Click "Validate with SAP"
      const validateBtn = page.locator('.validate-with-sap-btn').first();
      if (await validateBtn.isVisible()) {
        await validateBtn.click();
      }

      // Wait for validation results to be populated in table (ready badge appears)
      await expect(page.locator('.col-result .sap-badge-success').first()).toBeVisible({ timeout: 15000 });
      await page.waitForTimeout(500);

      // --- VERIFICATION: PREVIEW TABLE ---
      // 1. Assert counts and filters unchanged
      const readyBadgeCount = await page.locator('.col-result .sap-badge-success').count();
      expect(readyBadgeCount).toBe(2); // MAT_WARN_01 and MAT_CLEAN_02

      const createBtn = page.locator('.create-ready-boms-btn, .btn-execute-create').first();
      await expect(createBtn).toContainText('Create BOMs (2)');

      // 2. Check the Ready-with-warning row: keeps green Ready badge
      const readyWarningBadge = page.locator('tbody tr.bom-group-first-row:has-text("MAT_WARN_01") .col-result .sap-badge');
      await expect(readyWarningBadge).toBeVisible();
      await expect(readyWarningBadge).toHaveText('Ready');
      await expect(readyWarningBadge).toHaveClass(/sap-badge-success/);

      // 3. Message lines severity styles in preview table
      // Warning line on MAT_WARN_01
      const warningLine = page.locator('.bom-msg-item.bom-msg-warning');
      await expect(warningLine).toBeVisible();
      const warningIconColor = await warningLine.locator('svg').evaluate((el) => window.getComputedStyle(el).color);
      const parsedWarningIcon = parseRgb(warningIconColor);
      expect(parsedWarningIcon).not.toBeNull();
      expect(parsedWarningIcon.h).toBeGreaterThanOrEqual(30);
      expect(parsedWarningIcon.h).toBeLessThanOrEqual(50);

      // Error line on MAT_FAIL_03
      const errorLine = page.locator('.bom-msg-item.bom-msg-error');
      await expect(errorLine).toBeVisible();
      const errorIconColor = await errorLine.locator('svg').evaluate((el) => window.getComputedStyle(el).color);
      const parsedErrorIcon = parseRgb(errorIconColor);
      expect(parsedErrorIcon).not.toBeNull();
      const isRedHue = parsedErrorIcon.h >= 345 || parsedErrorIcon.h <= 15;
      expect(isRedHue, `Error icon hue ${parsedErrorIcon.h} must be within 345..15`).toBe(true);
      expect(parsedErrorIcon.s, `Error icon saturation ${parsedErrorIcon.s}% must be above 50%`).toBeGreaterThan(50);

      // Info line on MAT_FAIL_03 (follow-on technical message)
      const infoLine = page.locator('.bom-msg-item.bom-msg-info');
      await expect(infoLine).toBeVisible();
      const infoIconColor = await infoLine.locator('svg').evaluate((el) => window.getComputedStyle(el).color);
      const parsedInfoIcon = parseRgb(infoIconColor);
      expect(parsedInfoIcon).not.toBeNull();
      expect(parsedInfoIcon.s, `Info icon saturation ${parsedInfoIcon.s}% must be below 20%`).toBeLessThan(20);

      // Skipped lines on 3 skipped rows
      const skippedLines = page.locator('.bom-msg-item.bom-msg-skipped');
      expect(await skippedLines.count()).toBe(3);
      for (let i = 0; i < 3; i++) {
        const item = skippedLines.nth(i);
        const iconColor = await item.locator('svg').evaluate((el) => window.getComputedStyle(el).color);
        const parsedSkippedIcon = parseRgb(iconColor);
        expect(parsedSkippedIcon).not.toBeNull();
        expect(parsedSkippedIcon.s, `Skipped icon saturation ${parsedSkippedIcon.s}% must be below 20%`).toBeLessThan(20);
      }

      // Assert no skipped row contains an amber or red element
      const skippedRows = page.locator('tbody tr:has-text("A1PSB001B_PARENT"), tbody tr:has-text("SUB_BOM_01"), tbody tr:has-text("SUB_BOM_02")');
      const skippedRowCount = await skippedRows.count();
      for (let r = 0; r < skippedRowCount; r++) {
        const row = skippedRows.nth(r);
        const violations = await row.evaluate((el) => {
          function parseElRgb(colorStr) {
            if (!colorStr || colorStr === 'transparent' || colorStr === 'rgba(0, 0, 0, 0)') return null;
            const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
            if (!match) return null;
            const red = parseInt(match[1], 10) / 255;
            const green = parseInt(match[2], 10) / 255;
            const blue = parseInt(match[3], 10) / 255;
            const max = Math.max(red, green, blue);
            const min = Math.min(red, green, blue);
            const d = max - min;
            const l = (max + min) / 2;
            let s = 0;
            if (d !== 0) s = l > 0.5 ? d / (2 - 2 * l) : d / (2 * l);
            let h = 0;
            if (d !== 0) {
              if (max === red) h = ((green - blue) / d) % 6;
              else if (max === green) h = (blue - red) / d + 2;
              else h = (red - green) / d + 4;
              h = Math.round(h * 60);
              if (h < 0) h += 360;
            }
            return { h, s: Math.round(s * 100) };
          }
          const allEls = el.querySelectorAll('*');
          const bad = [];
          allEls.forEach((child) => {
            const cs = window.getComputedStyle(child);
            for (const val of [cs.color, cs.backgroundColor, cs.borderColor]) {
              const p = parseElRgb(val);
              if (p && p.s > 40) {
                // Amber check (15..60) or Red check (>= 345 || <= 15)
                if ((p.h >= 15 && p.h <= 60) || (p.h >= 345 || p.h <= 15)) {
                  bad.push({ tag: child.tagName, class: child.className, val, h: p.h, s: p.s });
                }
              }
            }
          });
          return bad;
        });
        expect(violations, `Skipped row index ${r} must contain no amber or red elements`).toEqual([]);
      }

      // Assert message text font-family is NOT monospace
      const msgTexts = page.locator('.bom-msg-text');
      const msgTextCount = await msgTexts.count();
      expect(msgTextCount).toBeGreaterThan(0);
      for (let i = 0; i < msgTextCount; i++) {
        const ff = await msgTexts.nth(i).evaluate((el) => window.getComputedStyle(el).fontFamily);
        const lowerFf = ff.toLowerCase();
        expect(lowerFf.startsWith('monospace'), `Message text font "${ff}" must not start with monospace`).toBe(false);
        expect(lowerFf.startsWith('jetbrains mono'), `Message text font "${ff}" must not be JetBrains Mono`).toBe(false);
      }

      // Take preview screenshot
      await saveScreenshot(page, `bulk-create-preview-severity-${viewport.name}.png`);

      // --- STEP 3: EXECUTION DETAILS TABLE ---
      await createBtn.click();

      // Modal appears
      const confirmSubmitBtn = page.locator('button:has-text("Confirm & Create")').first();
      await expect(confirmSubmitBtn).toBeVisible({ timeout: 5000 });
      await confirmSubmitBtn.click();

      // Wait for execution details table
      await page.waitForSelector('[data-testid="execution-details-table"], .sap-bulk-table', { state: 'visible', timeout: 10000 });
      await page.waitForTimeout(500);

      // Verify Execution Details rows and messages
      const execCreatedLine = page.locator('.bulk-execution-msg-item.bulk-execution-msg-info').first();
      await expect(execCreatedLine).toBeVisible();

      const execSkippedLine = page.locator('.bulk-execution-msg-item.bulk-execution-msg-skipped').first();
      await expect(execSkippedLine).toBeVisible();
      const execSkippedIconColor = await execSkippedLine.locator('svg').evaluate((el) => window.getComputedStyle(el).color);
      const parsedExecSkipped = parseRgb(execSkippedIconColor);
      expect(parsedExecSkipped.s, `Execution skipped icon saturation ${parsedExecSkipped.s}% must be below 20%`).toBeLessThan(20);

      const execErrorLine = page.locator('.bulk-execution-msg-item.bulk-execution-msg-error').first();
      await expect(execErrorLine).toBeVisible();
      const execErrorIconColor = await execErrorLine.locator('svg').evaluate((el) => window.getComputedStyle(el).color);
      const parsedExecError = parseRgb(execErrorIconColor);
      const isExecRed = parsedExecError.h >= 345 || parsedExecError.h <= 15;
      expect(isExecRed, `Execution error icon hue ${parsedExecError.h} must be red (345..15)`).toBe(true);
      expect(parsedExecError.s, `Execution error icon saturation ${parsedExecError.s}% must be above 50%`).toBeGreaterThan(50);

      // Take execution details screenshot
      await saveScreenshot(page, `bulk-create-execution-severity-${viewport.name}.png`);
    });
  }
});
