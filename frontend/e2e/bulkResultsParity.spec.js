import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';
import { setupMocks } from './helpers/mockApi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const screenshotsDir = path.resolve(__dirname, '../screenshots');
const artifactScreenshotsDir = path.resolve('C:/Users/chare/.gemini/antigravity/brain/6fce99f3-5f59-4200-af87-677b5d74db10/screenshots');

for (const dir of [screenshotsDir, artifactScreenshotsDir]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function takeAndStoreScreenshot(page, filename) {
  const localFile = path.join(screenshotsDir, filename);
  await page.screenshot({ path: localFile, fullPage: false });
  const artFile = path.join(artifactScreenshotsDir, filename);
  fs.copyFileSync(localFile, artFile);
}

function createCopyXlsx() {
  const data = [
    {
      'Source Material': 'MAT_COPY_01',
      'Source Plant': '1010',
      'Source BOM Usage': '1',
      'Source Alternative': '01',
      'Target Material': 'MAT_COPY_01',
      'Target Plant': '2010',
      'Target BOM Usage': '1',
      'Target Alternative': '02'
    },
    {
      'Source Material': 'MAT_COPY_02',
      'Source Plant': '1010',
      'Source BOM Usage': '1',
      'Source Alternative': '01',
      'Target Material': 'MAT_COPY_02',
      'Target Plant': '2010',
      'Target BOM Usage': '1',
      'Target Alternative': '03'
    },
    {
      'Source Material': 'MAT_COPY_03',
      'Source Plant': '1010',
      'Source BOM Usage': '1',
      'Source Alternative': '01',
      'Target Material': 'MAT_COPY_03',
      'Target Plant': '2010',
      'Target BOM Usage': '1',
      'Target Alternative': '01'
    },
    {
      'Source Material': 'MAT_COPY_04',
      'Source Plant': '1010',
      'Source BOM Usage': '1',
      'Source Alternative': '01',
      'Target Material': 'MAT_COPY_04',
      'Target Plant': '2010',
      'Target BOM Usage': '1',
      'Target Alternative': '04'
    }
  ];
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function createCreateXlsx() {
  const data = [
    {
      Seq: 1,
      Material: 'MAT_CREATE_01',
      Plant: '1010',
      Component: 'COMP_01',
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
      Material: 'MAT_CREATE_02',
      Plant: '1010',
      Component: 'COMP_02',
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
      Material: 'MAT_CREATE_03',
      Plant: '1010',
      Component: 'COMP_03',
      Quantity: 15,
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
      Material: 'MAT_CREATE_04',
      Plant: '1010',
      Component: 'COMP_04',
      Quantity: 20,
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

test.describe('Bulk Results Step 3 Parity & Shared Component Suite', () => {
  for (const vp of [
    { width: 1366, height: 768, name: '1366x768' },
    { width: 1920, height: 1080, name: '1920x1080' }
  ]) {
    test(`Create and Copy Step 3 Results Parity at ${vp.name}`, async ({ page }, testInfo) => {
      if (testInfo.project.name !== vp.name) {
        test.skip();
      }

      await page.setViewportSize({ width: vp.width, height: vp.height });
      await setupMocks(page, { authenticated: true });

      // -------------------------------------------------------------
      // 1. BULK CREATE - MIXED OUTCOME (Created, Skipped, Failed)
      // -------------------------------------------------------------
      const createMixedResults = [
        {
          sequenceNum: 1,
          material: 'MAT_CREATE_01',
          plant: '1010',
          bomUsage: '1',
          alternativeBom: '01',
          bomNumber: '00010045',
          status: 'SUCCESS',
          componentsCount: 5,
          message: 'BOM 00010045 created and verified in SAP plant 1010.'
        },
        {
          sequenceNum: 2,
          material: 'MAT_CREATE_02',
          plant: '1010',
          bomUsage: '1',
          alternativeBom: '01',
          bomNumber: '00010046',
          status: 'SUCCESS',
          componentsCount: 10,
          message: 'BOM 00010046 created successfully.'
        },
        {
          sequenceNum: 3,
          material: 'MAT_CREATE_03',
          plant: '1010',
          bomUsage: '1',
          alternativeBom: '01',
          bomNumber: '00009988',
          status: 'SKIPPED',
          message: 'BOM already exists for material MAT_CREATE_03 in plant 1010; skipped to prevent duplicate.'
        },
        {
          sequenceNum: 4,
          material: 'MAT_CREATE_04',
          plant: '1010',
          bomUsage: '1',
          alternativeBom: '01',
          bomNumber: null,
          status: 'FAILED',
          errors: [
            'Material MAT_CREATE_04 is currently locked by background process RFC_CS01 in client 100.',
            'Component COMP_04 has invalid valuation category X and missing profit center assignment.',
            'Alternative BOM 01 valid-from date is prior to earliest open fiscal posting period.'
          ]
        }
      ];

      // Route handler for BOM background jobs in Bulk Create
      let createJobState = 'preflight';
      const handleCreateJob = async (route) => {
        const req = route.request();
        const url = req.url();
        const method = req.method();

        if (url.includes('/active')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: false, job: null })
          });
        }

        if (url.includes('/start') || method === 'POST') {
          let postData = null;
          try {
            postData = req.postDataJSON();
          } catch (_) {}

          if (postData?.type === 'create_bulk') {
            createJobState = 'execution';
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                success: true,
                jobId: 'job-create-results-parity',
                total: 4,
                status: 'PROCESSING'
              })
            });
          }
          createJobState = 'preflight';
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              jobId: 'job-preflight-parity',
              total: 4,
              status: 'PROCESSING'
            })
          });
        }

        if (createJobState === 'execution' || url.includes('job-create-results-parity')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              job: {
                id: 'job-create-results-parity',
                type: 'create_bulk',
                status: 'COMPLETED',
                total: 4,
                progress: 100,
                bomsCreated: 2,
                componentsCreated: 15,
                skippedCount: 1,
                failedCount: 1,
                successCount: 2,
                notProcessedCount: 0,
                results: createMixedResults
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
              id: 'job-preflight-parity',
              type: 'create_preflight',
              status: 'COMPLETED',
              processed: 4,
              total: 4,
              successCount: 4,
              failedCount: 0,
              skippedCount: 0,
              notProcessedCount: 0,
              results: [
                { sequenceNum: '1', material: 'MAT_CREATE_01', plant: '1010', status: 'Ready' },
                { sequenceNum: '2', material: 'MAT_CREATE_02', plant: '1010', status: 'Ready' },
                { sequenceNum: '3', material: 'MAT_CREATE_03', plant: '1010', status: 'Ready' },
                { sequenceNum: '4', material: 'MAT_CREATE_04', plant: '1010', status: 'Ready' }
              ]
            }
          })
        });
      };

      await page.route('**/api/bom/jobs/**', handleCreateJob);
      await page.route('**/api/bom-jobs/**', handleCreateJob);

      await page.goto('/products/bom/create/bulk', { waitUntil: 'networkidle' });
      await page.waitForSelector('.rx-bulk-upload-card, .bulk-upload-dropzone', { state: 'visible', timeout: 10000 });

      // Upload spreadsheet
      const createBuffer = createCreateXlsx();
      const createFileInput = page.locator('input[type="file"]').first();
      await createFileInput.setInputFiles({
        name: 'Bulk_Create_Parity.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: createBuffer
      });

      await page.waitForTimeout(300);
      const createContinueBtn = page.locator('button:has-text("Continue")').first();
      await expect(createContinueBtn).toBeEnabled();
      await createContinueBtn.click();

      // 3. Step 2 Preview table loads & Validate
      await page.waitForSelector('.preflight-preview-table, [data-testid="create-boms-button"], .create-ready-boms-btn', { state: 'visible', timeout: 10000 });
      const validateBtn = page.locator('.validate-with-sap-btn').first();
      if (await validateBtn.isVisible().catch(() => false)) {
        await validateBtn.click();
      }
      await expect(page.locator('.col-result .sap-badge').first()).toBeVisible({ timeout: 10000 });

      // Click Create BOMs
      const createExecuteBtn = page.locator('.create-ready-boms-btn, [data-testid="create-boms-button"], button:has-text("Create BOMs")').first();
      await expect(createExecuteBtn).toBeEnabled({ timeout: 10000 });
      await createExecuteBtn.click();

      // Confirm in Modal if modal appears
      const createModalBtn = page.locator('button:has-text("Confirm & Create")');
      if (await createModalBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await createModalBtn.click();
      }

      // Wait for Results step (Step 3)
      await page.waitForSelector('[data-testid="bulk-execution-results"]', { state: 'visible', timeout: 15000 });
      await page.waitForSelector('[data-testid="execution-details-table"]', { state: 'visible', timeout: 10000 });

      // Take screenshot: Bulk Create Mixed
      await takeAndStoreScreenshot(page, `bulk-create-results-mixed-${vp.name}.png`);

      // Extract geometry from Bulk Create Results
      const createMetrics = await page.evaluate(() => {
        const root = document.querySelector('[data-testid="bulk-execution-results"]');
        const banner = document.querySelector('[data-testid="results-banner"]');
        const cardsGrid = document.querySelector('[data-testid="results-summary-cards"]');
        const cards = Array.from(cardsGrid?.children || []);
        const tableCard = document.querySelector('.rx-results-card');
        const tableRow = document.querySelector('[data-testid="execution-row-0"]');
        const msgItem = document.querySelector('.bulk-execution-msg-item');
        const actionButtons = document.querySelector('[data-testid="results-action-buttons"]');
        const buttons = Array.from(actionButtons?.querySelectorAll('button') || []);

        const bannerRect = banner.getBoundingClientRect();
        const cardsRect = cardsGrid.getBoundingClientRect();
        const tableCardRect = tableCard.getBoundingClientRect();
        const actionsRect = actionButtons.getBoundingClientRect();

        return {
          bannerHeight: bannerRect.height,
          bannerPadding: window.getComputedStyle(banner).padding,
          bannerTitle: banner.querySelector('h3')?.textContent?.trim(),
          gapBannerCards: cardsRect.top - bannerRect.bottom,
          gapCardsTable: tableCardRect.top - cardsRect.bottom,
          gapTableButtons: actionsRect.top - tableCardRect.bottom,
          rootPaddingBottom: parseFloat(window.getComputedStyle(root).paddingBottom),
          cardCount: cards.length,
          cardHeights: cards.map((c) => c.getBoundingClientRect().height),
          cardWidths: cards.map((c) => c.getBoundingClientRect().width),
          cardLabels: cards.map((c) => c.children[0]?.textContent?.trim()),
          cardValues: cards.map((c) => c.children[1]?.textContent?.trim()),
          firstRowHeight: tableRow?.getBoundingClientRect().height,
          msgPadding: msgItem ? window.getComputedStyle(msgItem).padding : '',
          buttonLabels: buttons.map((b) => b.textContent?.trim()),
          hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth
        };
      });

      // -------------------------------------------------------------
      // 2. BULK COPY - MIXED OUTCOME (Copied, Skipped, Failed)
      // -------------------------------------------------------------
      const copyMixedResults = [
        {
          id: 1,
          sourceMaterial: 'MAT_COPY_01',
          sourcePlant: '1010',
          sourceUsage: '1',
          sourceAltBom: '01',
          targetMaterial: 'MAT_COPY_01',
          targetPlant: '2010',
          targetUsage: '1',
          targetAltBom: '02',
          status: 'SUCCESS',
          componentCount: 5,
          message: 'BOM copied and verified in SAP target plant 2010.'
        },
        {
          id: 2,
          sourceMaterial: 'MAT_COPY_02',
          sourcePlant: '1010',
          sourceUsage: '1',
          sourceAltBom: '01',
          targetMaterial: 'MAT_COPY_02',
          targetPlant: '2010',
          targetUsage: '1',
          targetAltBom: '03',
          status: 'SUCCESS',
          componentCount: 10,
          message: 'BOM copied successfully.'
        },
        {
          id: 3,
          sourceMaterial: 'MAT_COPY_03',
          sourcePlant: '1010',
          sourceUsage: '1',
          sourceAltBom: '01',
          targetMaterial: 'MAT_COPY_03',
          targetPlant: '2010',
          targetUsage: '1',
          targetAltBom: '01',
          status: 'SKIPPED',
          componentCount: 8,
          message: 'Alternative 01 already exists for MAT_COPY_03 in plant 2010; skipped to prevent overwrite.'
        },
        {
          id: 4,
          sourceMaterial: 'MAT_COPY_04',
          sourcePlant: '1010',
          sourceUsage: '1',
          sourceAltBom: '01',
          targetMaterial: 'MAT_COPY_04',
          targetPlant: '2010',
          targetUsage: '1',
          targetAltBom: '04',
          status: 'FAILED',
          componentCount: 12,
          errors: [
            'Target plant 2010 is not maintained in material master for MAT_COPY_04.',
            'Component RAW_VAL_01 does not exist in plant 2010.',
            'Target alternative 04 conflicts with existing alternative reservation.'
          ]
        }
      ];

      // Route handler for BOM background jobs in Bulk Copy
      let copyJobState = 'validate';
      const handleCopyJob = async (route) => {
        const req = route.request();
        const url = req.url();
        const method = req.method();

        if (url.includes('/active')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: false, job: null })
          });
        }

        if (url.includes('/start') || method === 'POST') {
          let postData = null;
          try {
            postData = req.postDataJSON();
          } catch (_) {}

          if (postData?.type === 'copy_bulk') {
            copyJobState = 'execution';
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                success: true,
                jobId: 'job-copy-results-parity',
                total: 4,
                status: 'PROCESSING'
              })
            });
          }
          copyJobState = 'validate';
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              jobId: 'job-copy-validate-parity',
              total: 4,
              status: 'PROCESSING'
            })
          });
        }

        if (copyJobState === 'execution' || url.includes('job-copy-results-parity')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              job: {
                id: 'job-copy-results-parity',
                type: 'copy_bulk',
                status: 'COMPLETED',
                total: 4,
                progress: 100,
                successCount: 2,
                failedCount: 1,
                skippedCount: 1,
                notProcessedCount: 0,
                results: copyMixedResults
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
              id: 'job-copy-validate-parity',
              type: 'copy_validate',
              status: 'COMPLETED',
              processed: 4,
              total: 4,
              successCount: 4,
              failedCount: 0,
              skippedCount: 0,
              notProcessedCount: 0,
              results: [
                { id: 1, sourceMaterial: 'MAT_COPY_01', status: 'VALID', componentCount: 5 },
                { id: 2, sourceMaterial: 'MAT_COPY_02', status: 'VALID', componentCount: 10 },
                { id: 3, sourceMaterial: 'MAT_COPY_03', status: 'VALID', componentCount: 8 },
                { id: 4, sourceMaterial: 'MAT_COPY_04', status: 'VALID', componentCount: 12 }
              ]
            }
          })
        });
      };

      await page.unroute('**/api/bom/jobs/**');
      await page.unroute('**/api/bom-jobs/**');
      await page.route('**/api/bom/jobs/**', handleCopyJob);
      await page.route('**/api/bom-jobs/**', handleCopyJob);

      await page.goto('/products/bom/copy/bulk', { waitUntil: 'networkidle' });
      await page.waitForSelector('.rx-bulk-upload-card, .bulk-upload-dropzone', { state: 'visible', timeout: 10000 });

      // Upload spreadsheet
      const copyBuffer = createCopyXlsx();
      const copyFileInput = page.locator('input[type="file"]').first();
      await copyFileInput.setInputFiles({
        name: 'Bulk_Copy_Parity.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: copyBuffer
      });

      await page.waitForTimeout(300);
      const copyContinueBtn = page.locator('button:has-text("Continue")').first();
      await expect(copyContinueBtn).toBeEnabled();
      await copyContinueBtn.click();

      await page.waitForSelector('.sap-bulk-table', { state: 'visible', timeout: 5000 });
      const copyValBtn = page.locator('.validate-with-sap-btn').first();
      if (await copyValBtn.isVisible().catch(() => false)) {
        await copyValBtn.click();
      }
      await expect(page.locator('.execute-batch-copy-btn, button:has-text("Copy BOMs")').first()).toBeEnabled({ timeout: 10000 });

      // Click Copy BOMs
      page.once('dialog', (dialog) => dialog.accept());
      const copyExecuteBtn = page.locator('button:has-text("Copy BOMs"), [data-testid="execute-copy-button"], .execute-batch-copy-btn').first();
      await copyExecuteBtn.click();

      // Wait for Results step (Step 3)
      await page.waitForSelector('[data-testid="bulk-execution-results"]', { state: 'visible', timeout: 15000 });
      await page.waitForSelector('[data-testid="execution-details-table"]', { state: 'visible', timeout: 10000 });

      // Take screenshot: Bulk Copy Mixed
      await takeAndStoreScreenshot(page, `bulk-copy-results-mixed-${vp.name}.png`);

      // Extract geometry from Bulk Copy Results
      const copyMetrics = await page.evaluate(() => {
        const root = document.querySelector('[data-testid="bulk-execution-results"]');
        const banner = document.querySelector('[data-testid="results-banner"]');
        const cardsGrid = document.querySelector('[data-testid="results-summary-cards"]');
        const cards = Array.from(cardsGrid?.children || []);
        const tableCard = document.querySelector('.rx-results-card');
        const tableRow = document.querySelector('[data-testid="execution-row-0"]');
        const msgItem = document.querySelector('.bulk-execution-msg-item');
        const actionButtons = document.querySelector('[data-testid="results-action-buttons"]');
        const buttons = Array.from(actionButtons?.querySelectorAll('button') || []);

        const bannerRect = banner.getBoundingClientRect();
        const cardsRect = cardsGrid.getBoundingClientRect();
        const tableCardRect = tableCard.getBoundingClientRect();
        const actionsRect = actionButtons.getBoundingClientRect();

        return {
          bannerHeight: bannerRect.height,
          bannerPadding: window.getComputedStyle(banner).padding,
          bannerTitle: banner.querySelector('h3')?.textContent?.trim(),
          gapBannerCards: cardsRect.top - bannerRect.bottom,
          gapCardsTable: tableCardRect.top - cardsRect.bottom,
          gapTableButtons: actionsRect.top - tableCardRect.bottom,
          rootPaddingBottom: parseFloat(window.getComputedStyle(root).paddingBottom),
          cardCount: cards.length,
          cardHeights: cards.map((c) => c.getBoundingClientRect().height),
          cardWidths: cards.map((c) => c.getBoundingClientRect().width),
          cardLabels: cards.map((c) => c.children[0]?.textContent?.trim()),
          cardValues: cards.map((c) => c.children[1]?.textContent?.trim()),
          firstRowHeight: tableRow?.getBoundingClientRect().height,
          msgPadding: msgItem ? window.getComputedStyle(msgItem).padding : '',
          buttonLabels: buttons.map((b) => b.textContent?.trim()),
          hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth
        };
      });

      // -------------------------------------------------------------
      // 3. PARITY ASSERTIONS (within 1px tolerance)
      // -------------------------------------------------------------
      // A. Banner Height & Padding Parity
      expect(Math.abs(createMetrics.bannerHeight - copyMetrics.bannerHeight)).toBeLessThanOrEqual(1);
      expect(createMetrics.bannerPadding).toBe(copyMetrics.bannerPadding);
      expect(createMetrics.bannerTitle).toBe('Batch Creation Completed with Issues');
      expect(copyMetrics.bannerTitle).toBe('Batch Copy Completed with Issues');

      // B. 4 Summary Cards Layout, Labels & Sizes
      expect(createMetrics.cardCount).toBe(4);
      expect(copyMetrics.cardCount).toBe(4);
      for (let i = 0; i < 4; i++) {
        expect(Math.abs(createMetrics.cardHeights[i] - copyMetrics.cardHeights[i])).toBeLessThanOrEqual(1);
        expect(Math.abs(createMetrics.cardWidths[i] - copyMetrics.cardWidths[i])).toBeLessThanOrEqual(1);
      }
      expect(createMetrics.cardLabels).toEqual(['BOMs Created', 'Total Components', 'Skipped', 'Failed']);
      expect(copyMetrics.cardLabels).toEqual(['Copied', 'Total Components', 'Skipped', 'Failed']);
      expect(createMetrics.cardValues).toEqual(['2', '15', '1', '1']);
      expect(copyMetrics.cardValues).toEqual(['2', '35', '1', '1']);

      // C. Spacing tokens (>= 16px and about 24px)
      expect(createMetrics.gapTableButtons).toBeGreaterThanOrEqual(16);
      expect(copyMetrics.gapTableButtons).toBeGreaterThanOrEqual(16);
      expect(Math.abs(createMetrics.gapTableButtons - copyMetrics.gapTableButtons)).toBeLessThanOrEqual(1);
      expect(createMetrics.rootPaddingBottom).toBeGreaterThanOrEqual(16);
      expect(copyMetrics.rootPaddingBottom).toBeGreaterThanOrEqual(16);

      // D. Action Buttons row labels and positions
      expect(createMetrics.buttonLabels).toEqual(['Return to Launchpad', 'Upload Another File']);
      expect(copyMetrics.buttonLabels).toEqual(['Return to Launchpad', 'Upload Another File']);

      // E. Message line styles and row height
      expect(createMetrics.msgPadding).toBe(copyMetrics.msgPadding);
      // Row height within 10px (Copy has multi-line Source/Target plant/usage cells while Create has single-line columns)
      expect(Math.abs(createMetrics.firstRowHeight - copyMetrics.firstRowHeight)).toBeLessThanOrEqual(10);

      // F. Zero horizontal overflow
      expect(createMetrics.hasHorizontalOverflow).toBe(false);
      expect(copyMetrics.hasHorizontalOverflow).toBe(false);

      // -------------------------------------------------------------
      // 4. ALL SUCCESS OUTCOME VERIFICATION (Both Create and Copy)
      // -------------------------------------------------------------
      let copySuccessJobState = 'validate';
      const handleAllSuccessJob = async (route) => {
        const req = route.request();
        const url = req.url();
        const method = req.method();

        if (url.includes('/active')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: false, job: null })
          });
        }

        if (url.includes('/start') || method === 'POST') {
          let postData = null;
          try {
            postData = req.postDataJSON();
          } catch (_) {}

          if (postData?.type === 'copy_bulk') {
            copySuccessJobState = 'execution';
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                success: true,
                jobId: 'job-copy-success-parity',
                total: 2,
                status: 'PROCESSING'
              })
            });
          }
          copySuccessJobState = 'validate';
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              jobId: 'job-copy-success-validate',
              total: 2,
              status: 'PROCESSING'
            })
          });
        }

        if (copySuccessJobState === 'execution' || url.includes('job-copy-success-parity')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              job: {
                id: 'job-copy-success-parity',
                type: 'copy_bulk',
                status: 'COMPLETED',
                total: 2,
                progress: 100,
                successCount: 2,
                failedCount: 0,
                skippedCount: 0,
                notProcessedCount: 0,
                results: [
                  {
                    id: 1,
                    sourceMaterial: 'MAT_OK_01',
                    sourcePlant: '1010',
                    sourceUsage: '1',
                    sourceAltBom: '01',
                    targetMaterial: 'MAT_OK_01',
                    targetPlant: '2010',
                    targetUsage: '1',
                    targetAltBom: '02',
                    status: 'SUCCESS',
                    componentCount: 8,
                    message: 'BOM copied successfully.'
                  },
                  {
                    id: 2,
                    sourceMaterial: 'MAT_OK_02',
                    sourcePlant: '1010',
                    sourceUsage: '1',
                    sourceAltBom: '01',
                    targetMaterial: 'MAT_OK_02',
                    targetPlant: '2010',
                    targetUsage: '1',
                    targetAltBom: '03',
                    status: 'SUCCESS',
                    componentCount: 6,
                    message: 'BOM copied successfully.'
                  }
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
              id: 'job-copy-success-validate',
              type: 'copy_validate',
              status: 'COMPLETED',
              processed: 2,
              total: 2,
              successCount: 2,
              failedCount: 0,
              skippedCount: 0,
              notProcessedCount: 0,
              results: [
                { id: 1, sourceMaterial: 'MAT_OK_01', status: 'VALID', componentCount: 8 },
                { id: 2, sourceMaterial: 'MAT_OK_02', status: 'VALID', componentCount: 6 }
              ]
            }
          })
        });
      };

      await page.unroute('**/api/bom/jobs/**');
      await page.unroute('**/api/bom-jobs/**');
      await page.route('**/api/bom/jobs/**', handleAllSuccessJob);
      await page.route('**/api/bom-jobs/**', handleAllSuccessJob);

      // Reload Copy with all success
      await page.goto('/products/bom/copy/bulk', { waitUntil: 'networkidle' });
      await page.waitForSelector('.rx-bulk-upload-card, .bulk-upload-dropzone', { state: 'visible', timeout: 10000 });
      const copyFileInputSuccess = page.locator('input[type="file"]').first();
      await copyFileInputSuccess.setInputFiles({
        name: 'Bulk_Copy_Success.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: copyBuffer
      });
      await page.waitForTimeout(300);
      const copySuccessContinueBtn = page.locator('button:has-text("Continue")').first();
      await expect(copySuccessContinueBtn).toBeEnabled();
      await copySuccessContinueBtn.click();

      await page.waitForSelector('.sap-bulk-table', { state: 'visible', timeout: 5000 });
      const copySuccessValBtn = page.locator('.validate-with-sap-btn').first();
      if (await copySuccessValBtn.isVisible().catch(() => false)) {
        await copySuccessValBtn.click();
      }
      await expect(page.locator('.execute-batch-copy-btn, button:has-text("Copy BOMs")').first()).toBeEnabled({ timeout: 10000 });

      page.once('dialog', (dialog) => dialog.accept());
      await page.locator('button:has-text("Copy BOMs"), [data-testid="execute-copy-button"], .execute-batch-copy-btn').first().click();
      await page.waitForSelector('[data-testid="bulk-execution-results"]', { state: 'visible', timeout: 15000 });

      // Assert All-Success Copy Banner
      const copySuccessBanner = page.locator('[data-testid="results-banner"]');
      await expect(copySuccessBanner).toContainText('Batch Copy Completed Successfully');
      await takeAndStoreScreenshot(page, `bulk-copy-results-success-${vp.name}.png`);

      // All-Success Create
      let createSuccessJobState = 'preflight';
      const handleCreateSuccessJob = async (route) => {
        const req = route.request();
        const url = req.url();
        const method = req.method();

        if (url.includes('/active')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: false, job: null })
          });
        }

        if (url.includes('/start') || method === 'POST') {
          let postData = null;
          try {
            postData = req.postDataJSON();
          } catch (_) {}

          if (postData?.type === 'create_bulk') {
            createSuccessJobState = 'execution';
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                success: true,
                jobId: 'job-create-success-exec',
                total: 2,
                status: 'PROCESSING'
              })
            });
          }
          createSuccessJobState = 'preflight';
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              jobId: 'job-create-success-preflight',
              total: 2,
              status: 'PROCESSING'
            })
          });
        }

        if (createSuccessJobState === 'execution' || url.includes('job-create-success-exec')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              job: {
                id: 'job-create-success-exec',
                type: 'create_bulk',
                status: 'COMPLETED',
                total: 2,
                progress: 100,
                bomsCreated: 2,
                componentsCreated: 14,
                skippedCount: 0,
                failedCount: 0,
                successCount: 2,
                notProcessedCount: 0,
                results: [
                  {
                    sequenceNum: 1,
                    material: 'MAT_OK_01',
                    plant: '1010',
                    bomUsage: '1',
                    alternativeBom: '01',
                    bomNumber: '00010047',
                    status: 'SUCCESS',
                    componentsCount: 8,
                    message: 'BOM created and verified in SAP.'
                  },
                  {
                    sequenceNum: 2,
                    material: 'MAT_OK_02',
                    plant: '1010',
                    bomUsage: '1',
                    alternativeBom: '01',
                    bomNumber: '00010048',
                    status: 'SUCCESS',
                    componentsCount: 6,
                    message: 'BOM created and verified in SAP.'
                  }
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
              id: 'job-create-success-preflight',
              type: 'create_preflight',
              status: 'COMPLETED',
              processed: 2,
              total: 2,
              successCount: 2,
              failedCount: 0,
              skippedCount: 0,
              notProcessedCount: 0,
              results: [
                { sequenceNum: '1', material: 'MAT_OK_01', plant: '1010', status: 'Ready' },
                { sequenceNum: '2', material: 'MAT_OK_02', plant: '1010', status: 'Ready' }
              ]
            }
          })
        });
      };

      await page.unroute('**/api/bom/jobs/**');
      await page.unroute('**/api/bom-jobs/**');
      await page.route('**/api/bom/jobs/**', handleCreateSuccessJob);
      await page.route('**/api/bom-jobs/**', handleCreateSuccessJob);

      await page.goto('/products/bom/create/bulk', { waitUntil: 'networkidle' });
      await page.waitForSelector('.rx-bulk-upload-card, .bulk-upload-dropzone', { state: 'visible', timeout: 10000 });
      const createFileInputSuccess = page.locator('input[type="file"]').first();
      await createFileInputSuccess.setInputFiles({
        name: 'Bulk_Create_Success.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: createBuffer
      });
      await page.waitForTimeout(300);
      const createSuccessContinueBtn = page.locator('button:has-text("Continue")').first();
      await expect(createSuccessContinueBtn).toBeEnabled();
      await createSuccessContinueBtn.click();

      await page.waitForSelector('.preflight-preview-table, [data-testid="create-boms-button"], .create-ready-boms-btn', { state: 'visible', timeout: 10000 });
      const createSuccessValBtn = page.locator('.validate-with-sap-btn').first();
      if (await createSuccessValBtn.isVisible().catch(() => false)) {
        await createSuccessValBtn.click();
      }
      await expect(page.locator('.col-result .sap-badge').first()).toBeVisible({ timeout: 10000 });

      const createSuccessExecBtn = page.locator('.create-ready-boms-btn, [data-testid="create-boms-button"], button:has-text("Create BOMs")').first();
      await expect(createSuccessExecBtn).toBeEnabled({ timeout: 10000 });
      await createSuccessExecBtn.click();

      const createSuccessModalBtn = page.locator('button:has-text("Confirm & Create")');
      if (await createSuccessModalBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await createSuccessModalBtn.click();
      }
      await page.waitForSelector('[data-testid="bulk-execution-results"]', { state: 'visible', timeout: 15000 });

      // Assert All-Success Create Banner
      const createSuccessBanner = page.locator('[data-testid="results-banner"]');
      await expect(createSuccessBanner).toContainText('Batch Creation Completed Successfully');
      await takeAndStoreScreenshot(page, `bulk-create-results-success-${vp.name}.png`);
    });
  }
});
