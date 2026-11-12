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
if (!fs.existsSync(artifactDir)) {
  fs.mkdirSync(artifactDir, { recursive: true });
}

async function saveScreenshot(page, filename) {
  const localPath = path.join(screenshotsDir, filename);
  await page.screenshot({ path: localPath, fullPage: false });
  const artPath = path.join(artifactDir, filename);
  fs.copyFileSync(localPath, artPath);
}

function createCopySpreadsheet() {
  const data = [
    {
      'Source Material': 'MAT_READY_01',
      'Source Plant': '1012',
      'Source BOM Usage': '1',
      'Source Alternative': '01',
      'Target Material': 'MAT_READY_01',
      'Target Plant': '1001',
      'Target BOM Usage': '1',
      'Target Alternative': '02'
    },
    {
      'Source Material': 'MAT_WARN_02',
      'Source Plant': '1012',
      'Source BOM Usage': '1',
      'Source Alternative': '01',
      'Target Material': 'MAT_WARN_02',
      'Target Plant': '1001',
      'Target BOM Usage': '1',
      'Target Alternative': '03'
    },
    {
      'Source Material': 'MAT_FAIL_03',
      'Source Plant': '1012',
      'Source BOM Usage': '1',
      'Source Alternative': '01',
      'Target Material': 'MAT_FAIL_03',
      'Target Plant': '1001',
      'Target BOM Usage': '1',
      'Target Alternative': '04'
    },
    {
      'Source Material': 'MAT_FAIL_04',
      'Source Plant': '1012',
      'Source BOM Usage': '1',
      'Source Alternative': '01',
      'Target Material': 'MAT_FAIL_04',
      'Target Plant': '1001',
      'Target BOM Usage': '1',
      'Target Alternative': '05'
    },
    {
      'Source Material': 'MAT_SKIP_05',
      'Source Plant': '1012',
      'Source BOM Usage': '1',
      'Source Alternative': '01',
      'Target Material': 'MAT_SKIP_05',
      'Target Plant': '1001',
      'Target BOM Usage': '1',
      'Target Alternative': '01'
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
      'Sequence Number': '1',
      'Material': 'BOM_CREATE_01',
      'Plant': '1001',
      'BOM Usage': '1',
      'Alternative BOM': '01',
      'Valid From': '2026-01-01',
      'Base Quantity': '1',
      'BOM Status': '1',
      'Item Category': 'L',
      'Component': 'COMP_101',
      'Component Quantity': '2'
    },
    {
      'Sequence Number': '1',
      'Material': 'BOM_CREATE_01',
      'Plant': '1001',
      'BOM Usage': '1',
      'Alternative BOM': '01',
      'Valid From': '2026-01-01',
      'Base Quantity': '1',
      'BOM Status': '1',
      'Item Category': 'L',
      'Component': 'COMP_102',
      'Component Quantity': '4'
    },
    {
      'Sequence Number': '2',
      'Material': 'BOM_CREATE_02_WARN',
      'Plant': '1001',
      'BOM Usage': '1',
      'Alternative BOM': '01',
      'Valid From': '2026-01-01',
      'Base Quantity': '1',
      'BOM Status': '1',
      'Item Category': 'L',
      'Component': 'COMP_201',
      'Component Quantity': '1'
    },
    {
      'Sequence Number': '3',
      'Material': 'BOM_CREATE_03_FAIL',
      'Plant': '1001',
      'BOM Usage': '1',
      'Alternative BOM': '01',
      'Valid From': '2026-01-01',
      'Base Quantity': '1',
      'BOM Status': '1',
      'Item Category': 'L',
      'Component': 'COMP_301',
      'Component Quantity': '5'
    },
    {
      'Sequence Number': '3',
      'Material': 'BOM_CREATE_03_FAIL',
      'Plant': '1001',
      'BOM Usage': '1',
      'Alternative BOM': '01',
      'Valid From': '2026-01-01',
      'Base Quantity': '1',
      'BOM Status': '1',
      'Item Category': 'L',
      'Component': 'COMP_302',
      'Component Quantity': '10'
    },
    {
      'Sequence Number': '4',
      'Material': 'BOM_CREATE_04_SKIP',
      'Plant': '1001',
      'BOM Usage': '1',
      'Alternative BOM': '01',
      'Valid From': '2026-01-01',
      'Base Quantity': '1',
      'BOM Status': '1',
      'Item Category': 'L',
      'Component': 'COMP_401',
      'Component Quantity': '3'
    }
  ];
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

const VIEWPORTS = [
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1920x1080', width: 1920, height: 1080 }
];

// Recorded layout measurements to verify identical values between Copy and Create within 1px
const measurements = {
  '1366x768': { copy: {}, create: {} },
  '1920x1080': { copy: {}, create: {} }
};

test.describe('Bulk Data Preview Card Padding & Offset Assertions', () => {
  for (const vp of VIEWPORTS) {
    // ------------------------------------------------------------------------
    // BULK COPY BOM
    // ------------------------------------------------------------------------
    test(`Bulk Copy BOM preview header, padding and table offsets at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await setupMocks(page, { authenticated: true });

      const mockValidationResults = [
        {
          id: 1,
          sourceMaterial: 'MAT_READY_01',
          sourcePlant: '1012',
          sourceUsage: '1',
          sourceAltBom: '01',
          targetMaterial: 'MAT_READY_01',
          targetPlant: '1001',
          targetUsage: '1',
          targetAltBom: '02',
          status: 'VALID',
          message: 'Ready to copy',
          messageType: 'success',
          componentCount: 12,
          errors: [],
          warnings: []
        },
        {
          id: 2,
          sourceMaterial: 'MAT_WARN_02',
          sourcePlant: '1012',
          sourceUsage: '1',
          sourceAltBom: '01',
          targetMaterial: 'MAT_WARN_02',
          targetPlant: '1001',
          targetUsage: '1',
          targetAltBom: '03',
          status: 'VALID',
          message: 'Header material warning',
          messageType: 'warning',
          componentCount: 14,
          errors: [],
          warnings: ['Header material MAT_WARN_02 is not extended to plant 1001.']
        },
        {
          id: 3,
          sourceMaterial: 'MAT_FAIL_03',
          sourcePlant: '1012',
          sourceUsage: '1',
          sourceAltBom: '01',
          targetMaterial: 'MAT_FAIL_03',
          targetPlant: '1001',
          targetUsage: '1',
          targetAltBom: '04',
          status: 'FAILED',
          message: 'Component RAW_MAT_01 does not exist in plant 1001.',
          messageType: 'error',
          componentCount: 8,
          errors: ['Component RAW_MAT_01 does not exist in plant 1001.'],
          warnings: []
        },
        {
          id: 4,
          sourceMaterial: 'MAT_FAIL_04',
          sourcePlant: '1012',
          sourceUsage: '1',
          sourceAltBom: '01',
          targetMaterial: 'MAT_FAIL_04',
          targetPlant: '1001',
          targetUsage: '1',
          targetAltBom: '05',
          status: 'FAILED',
          message: 'Unit of measure error',
          messageType: 'error',
          componentCount: 6,
          errors: ['Unit of measure for component RAW_MAT_02 not found.'],
          warnings: []
        },
        {
          id: 5,
          sourceMaterial: 'MAT_SKIP_05',
          sourcePlant: '1012',
          sourceUsage: '1',
          sourceAltBom: '01',
          targetMaterial: 'MAT_SKIP_05',
          targetPlant: '1001',
          targetUsage: '1',
          targetAltBom: '01',
          status: 'SKIPPED',
          message: 'Alternative 01 already exists for MAT_SKIP_05 in plant 1001.',
          messageType: 'skipped',
          componentCount: 10,
          errors: [],
          warnings: []
        }
      ];

      const handleCopyValidationJob = async (route) => {
        const req = route.request();
        const url = req.url();
        const method = req.method();

        if (url.includes('/start') || method === 'POST') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              jobId: 'job-copy-validate-test',
              total: 5,
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
              id: 'job-copy-validate-test',
              type: 'copy_validate',
              status: 'COMPLETED',
              processed: 5,
              total: 5,
              successCount: 2,
              failedCount: 2,
              skippedCount: 1,
              notProcessedCount: 0,
              results: mockValidationResults
            }
          })
        });
      };

      await page.route('**/api/bom/jobs/**', handleCopyValidationJob);
      await page.route('**/api/bom-jobs/**', handleCopyValidationJob);

      await page.goto('/products/bom/copy/bulk', { waitUntil: 'networkidle' });
      await page.waitForSelector('.rx-bulk-upload-card, .bulk-upload-dropzone', { state: 'visible', timeout: 10000 });

      // Upload file
      const fileBuffer = createCopySpreadsheet();
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles({
        name: 'Bulk_Copy_BOMs_Q4.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: fileBuffer
      });

      const continueBtn = page.locator('button:has-text("Continue")').first();
      await expect(continueBtn).toBeEnabled({ timeout: 5000 });
      await continueBtn.click();

      // State (a): BEFORE VALIDATION (right after upload)
      const cardEl = page.locator('.rx-bulk-preview-section');
      await expect(cardEl).toBeVisible({ timeout: 5000 });

      // 1. Cards absent before validation
      const statTiles = page.locator('button.rx-stat-all, .rx-bulk-stat-tiles');
      await expect(statTiles).toHaveCount(0);

      // 2. Toolbar row removed
      await expect(page.locator('.sap-toolbar.rx-table-toolbar')).toHaveCount(0);

      // 3. Measure Card & Elements Offsets
      const cardBox = await cardEl.boundingBox();
      const titleEl = page.locator('[data-testid="rx-preview-title"]');
      const chipEl = page.locator('[data-testid="rx-preview-file-chip"]');
      const showingEl = page.locator('[data-testid="rx-preview-showing-text"]');
      const searchWrap = page.locator('[data-testid="rx-preview-search-wrap"]');
      const searchInput = page.locator('[data-testid="rx-preview-search-wrap"] input');
      const subtitleEl = page.locator('[data-testid="rx-preview-subtitle"]');
      const tableWrapper = page.locator('.sap-table-container, .sap-bulk-grid-container');

      const titleBox = await titleEl.boundingBox();
      const chipBox = await chipEl.boundingBox();
      const showingBox = await showingEl.boundingBox();
      const searchBox = await searchWrap.boundingBox();
      const subBox = await subtitleEl.boundingBox();
      const tableBox = await tableWrapper.boundingBox();

      // MEASURABLE ASSERTIONS:
      // a. Title left offset from card left edge >= 16px (target: ~20px)
      const titleLeftOffset = titleBox.x - cardBox.x;
      expect(titleLeftOffset).toBeGreaterThanOrEqual(16);

      // b. Search box right offset from card right edge >= 16px (target: ~20px)
      const searchRightOffset = (cardBox.x + cardBox.width) - (searchBox.x + searchBox.width);
      expect(searchRightOffset).toBeGreaterThanOrEqual(16);

      // c. Gap between subtitle bottom and table top >= 16px (target: ~36px)
      const subtitleTableGap = tableBox.y - (subBox.y + subBox.height);
      expect(subtitleTableGap).toBeGreaterThanOrEqual(16);

      // d. Table left and right offsets from card edges >= 16px (target: ~20px)
      const tableLeftOffset = tableBox.x - cardBox.x;
      const tableRightOffset = (cardBox.x + cardBox.width) - (tableBox.x + tableBox.width);
      expect(tableLeftOffset).toBeGreaterThanOrEqual(16);
      expect(tableRightOffset).toBeGreaterThanOrEqual(16);

      // e. Header items on one row (vertical center difference <= 4px)
      const titleCenterY = titleBox.y + titleBox.height / 2;
      const chipCenterY = chipBox.y + chipBox.height / 2;
      const showingCenterY = showingBox.y + showingBox.height / 2;
      const searchCenterY = searchBox.y + searchBox.height / 2;

      expect(Math.abs(titleCenterY - searchCenterY)).toBeLessThanOrEqual(4);
      expect(Math.abs(titleCenterY - chipCenterY)).toBeLessThanOrEqual(4);
      expect(Math.abs(titleCenterY - showingCenterY)).toBeLessThanOrEqual(4);

      // f. No horizontal overflow
      const isOverflowing = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(isOverflowing).toBe(false);

      // Store measurements for cross-flow comparison
      measurements[vp.name].copy = {
        titleLeft: Math.round(titleLeftOffset),
        searchRight: Math.round(searchRightOffset),
        subtitleGap: Math.round(subtitleTableGap),
        tableLeft: Math.round(tableLeftOffset),
        tableRight: Math.round(tableRightOffset)
      };

      // Screenshots for Bulk Copy
      await saveScreenshot(page, `bulk-copy-before-validation-${vp.name}.png`);
      await saveScreenshot(page, `bulk-copy-after-upload-${vp.name}.png`);

      // Trigger Validate data
      const validateBtn = page.locator('button:has-text("Validate data")').first();
      await expect(validateBtn).toBeVisible({ timeout: 5000 });
      await validateBtn.click();

      // State (b): AFTER VALIDATION
      await expect(page.locator('button.rx-stat-ready[aria-label="Ready: 2"]')).toBeVisible({ timeout: 10000 });

      // Assert 4 cards present
      const allCard = page.locator('button.rx-stat-all');
      const readyCard = page.locator('button.rx-stat-ready');
      const errorsCard = page.locator('button.rx-stat-errors');
      const skippedCard = page.locator('button.rx-stat-skipped');

      await expect(allCard).toBeVisible();
      await expect(readyCard).toBeVisible();
      await expect(errorsCard).toBeVisible();
      await expect(skippedCard).toBeVisible();

      // Save screenshot after validation
      await saveScreenshot(page, `bulk-copy-after-validation-${vp.name}.png`);

      // Search & filter validation
      await readyCard.click();
      await expect(readyCard).toHaveAttribute('aria-pressed', 'true');
      await searchInput.fill('MAT_READY');
      await page.waitForTimeout(200);

      await expect(page.locator('[data-testid="rx-preview-showing-text"]')).toHaveText('Showing 1 of 5');
      await expect(page.locator('.sap-bulk-table tbody tr:not(.bom-messages-row)')).toHaveCount(1);
      await saveScreenshot(page, `bulk-copy-search-filter-${vp.name}.png`);

      await searchInput.fill('');
      await allCard.click();
    });

    // ------------------------------------------------------------------------
    // BULK CREATE BOM
    // ------------------------------------------------------------------------
    test(`Bulk Create BOM preview header, padding and table offsets at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await setupMocks(page, { authenticated: true });

      const mockCreatePreflightResults = [
        {
          sequenceNum: '1',
          material: 'BOM_CREATE_01',
          plant: '1001',
          bomUsage: '1',
          alternativeBom: '01',
          status: 'Ready',
          message: 'Header and components valid',
          messageType: 'success',
          errors: [],
          warnings: [],
          components: [
            { component: 'COMP_101', status: 'VALID' },
            { component: 'COMP_102', status: 'VALID' }
          ]
        },
        {
          sequenceNum: '2',
          material: 'BOM_CREATE_02_WARN',
          plant: '1001',
          bomUsage: '1',
          alternativeBom: '01',
          status: 'Ready',
          message: 'Header plant MARC warning',
          messageType: 'warning',
          errors: [],
          warnings: ['Header material not extended to plant (MARC).'],
          components: [
            { component: 'COMP_201', status: 'VALID' }
          ]
        },
        {
          sequenceNum: '3',
          material: 'BOM_CREATE_03_FAIL',
          plant: '1001',
          bomUsage: '1',
          alternativeBom: '01',
          status: 'Ready',
          message: 'Component error',
          errors: [],
          warnings: [],
          components: [
            { component: 'COMP_301', status: 'VALID' },
            { component: 'COMP_302', status: 'ERROR', error: 'Component does not exist in plant 1001' }
          ]
        },
        {
          sequenceNum: '4',
          material: 'BOM_CREATE_04_SKIP',
          plant: '1001',
          bomUsage: '1',
          alternativeBom: '01',
          status: 'Skipped',
          message: 'Alternative 01 already exists for BOM_CREATE_04_SKIP in plant 1001.',
          messageType: 'skipped',
          errors: [],
          warnings: [],
          components: [
            { component: 'COMP_401', status: 'VALID' }
          ]
        }
      ];

      const handleCreateValidationJob = async (route) => {
        const req = route.request();
        const url = req.url();
        const method = req.method();

        if (url.includes('/start') || method === 'POST') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              jobId: 'create-job-filter-hdr',
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
              id: 'create-job-filter-hdr',
              type: 'create_preflight',
              status: 'COMPLETED',
              processed: 4,
              total: 4,
              successCount: 2,
              failedCount: 1,
              skippedCount: 1,
              notProcessedCount: 0,
              results: mockCreatePreflightResults
            }
          })
        });
      };

      await page.route('**/api/bom/jobs/**', handleCreateValidationJob);
      await page.route('**/api/bom-jobs/**', handleCreateValidationJob);

      await page.goto('/products/bom/create/bulk', { waitUntil: 'networkidle' });
      await page.waitForSelector('.rx-bulk-upload-card, .bulk-upload-dropzone', { state: 'visible', timeout: 10000 });

      // Upload spreadsheet
      const fileBuffer = createCreateSpreadsheet();
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles({
        name: 'Bulk_Create_BOMs_Production.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: fileBuffer
      });

      const continueBtn = page.locator('button:has-text("Continue")').first();
      await expect(continueBtn).toBeEnabled({ timeout: 5000 });
      await continueBtn.click();

      // State (a): BEFORE VALIDATION (right after upload)
      const cardEl = page.locator('.rx-bulk-preview-section');
      await expect(cardEl).toBeVisible({ timeout: 5000 });

      // 1. Cards absent before validation
      const statTiles = page.locator('button.rx-stat-all, .rx-bulk-stat-tiles');
      await expect(statTiles).toHaveCount(0);

      // 2. Toolbar row removed
      await expect(page.locator('.sap-toolbar.rx-table-toolbar')).toHaveCount(0);

      // 3. Measure Card & Elements Offsets
      const cardBox = await cardEl.boundingBox();
      const titleEl = page.locator('[data-testid="rx-preview-title"]');
      const chipEl = page.locator('[data-testid="rx-preview-file-chip"]');
      const showingEl = page.locator('[data-testid="rx-preview-showing-text"]');
      const searchWrap = page.locator('[data-testid="rx-preview-search-wrap"]');
      const searchInput = page.locator('[data-testid="rx-preview-search-wrap"] input');
      const subtitleEl = page.locator('[data-testid="rx-preview-subtitle"]');
      const tableWrapper = page.locator('.sap-table-container, .fiori-table-wrapper');

      const titleBox = await titleEl.boundingBox();
      const chipBox = await chipEl.boundingBox();
      const showingBox = await showingEl.boundingBox();
      const searchBox = await searchWrap.boundingBox();
      const subBox = await subtitleEl.boundingBox();
      const tableBox = await tableWrapper.boundingBox();

      // MEASURABLE ASSERTIONS:
      // a. Title left offset from card left edge >= 16px (target: ~20px)
      const titleLeftOffset = titleBox.x - cardBox.x;
      expect(titleLeftOffset).toBeGreaterThanOrEqual(16);

      // b. Search box right offset from card right edge >= 16px (target: ~20px)
      const searchRightOffset = (cardBox.x + cardBox.width) - (searchBox.x + searchBox.width);
      expect(searchRightOffset).toBeGreaterThanOrEqual(16);

      // c. Gap between subtitle bottom and table top >= 16px (target: ~36px)
      const subtitleTableGap = tableBox.y - (subBox.y + subBox.height);
      expect(subtitleTableGap).toBeGreaterThanOrEqual(16);

      // d. Table left and right offsets from card edges >= 16px (target: ~20px)
      const tableLeftOffset = tableBox.x - cardBox.x;
      const tableRightOffset = (cardBox.x + cardBox.width) - (tableBox.x + tableBox.width);
      expect(tableLeftOffset).toBeGreaterThanOrEqual(16);
      expect(tableRightOffset).toBeGreaterThanOrEqual(16);

      // e. Header items on one row (vertical center difference <= 4px)
      const titleCenterY = titleBox.y + titleBox.height / 2;
      const chipCenterY = chipBox.y + chipBox.height / 2;
      const showingCenterY = showingBox.y + showingBox.height / 2;
      const searchCenterY = searchBox.y + searchBox.height / 2;

      expect(Math.abs(titleCenterY - searchCenterY)).toBeLessThanOrEqual(4);
      expect(Math.abs(titleCenterY - chipCenterY)).toBeLessThanOrEqual(4);
      expect(Math.abs(titleCenterY - showingCenterY)).toBeLessThanOrEqual(4);

      // f. No horizontal overflow
      const isOverflowing = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(isOverflowing).toBe(false);

      // Store measurements for cross-flow comparison
      measurements[vp.name].create = {
        titleLeft: Math.round(titleLeftOffset),
        searchRight: Math.round(searchRightOffset),
        subtitleGap: Math.round(subtitleTableGap),
        tableLeft: Math.round(tableLeftOffset),
        tableRight: Math.round(tableRightOffset)
      };

      // VERIFY Create and Copy have identical offset values within 1px
      const copyM = measurements[vp.name].copy;
      const createM = measurements[vp.name].create;
      if (copyM.titleLeft !== undefined) {
        expect(Math.abs(copyM.titleLeft - createM.titleLeft)).toBeLessThanOrEqual(1);
        expect(Math.abs(copyM.searchRight - createM.searchRight)).toBeLessThanOrEqual(1);
        expect(Math.abs(copyM.tableLeft - createM.tableLeft)).toBeLessThanOrEqual(1);
        expect(Math.abs(copyM.tableRight - createM.tableRight)).toBeLessThanOrEqual(1);
      }

      // Screenshots for Bulk Create
      await saveScreenshot(page, `bulk-create-before-validation-${vp.name}.png`);
      await saveScreenshot(page, `bulk-create-after-upload-${vp.name}.png`);

      // Trigger Validate data
      const validateBtn = page.locator('button:has-text("Validate data")').first();
      await expect(validateBtn).toBeVisible({ timeout: 5000 });
      await validateBtn.click();

      // State (b): AFTER VALIDATION
      await expect(page.locator('button.rx-stat-ready[aria-label="Ready: 2"]')).toBeVisible({ timeout: 10000 });

      // Assert 4 cards present
      const allCard = page.locator('button.rx-stat-all');
      const readyCard = page.locator('button.rx-stat-ready');
      const errorsCard = page.locator('button.rx-stat-errors');
      const skippedCard = page.locator('button.rx-stat-skipped');

      await expect(allCard).toBeVisible();
      await expect(readyCard).toBeVisible();
      await expect(errorsCard).toBeVisible();
      await expect(skippedCard).toBeVisible();

      // Save screenshot after validation
      await saveScreenshot(page, `bulk-create-after-validation-${vp.name}.png`);

      // Search & filter validation
      await errorsCard.click();
      await expect(errorsCard).toHaveAttribute('aria-pressed', 'true');
      await searchInput.fill('03');
      await page.waitForTimeout(200);

      await expect(page.locator('[data-testid="rx-preview-showing-text"]')).toHaveText('Showing 1 of 4');
      await expect(page.locator('.preflight-preview-table tbody tr.bom-group-first-row')).toHaveCount(1);
      await saveScreenshot(page, `bulk-create-search-filter-${vp.name}.png`);

      await searchInput.fill('');
      await allCard.click();
    });
  }

  // ------------------------------------------------------------------------
  // STATE (c): LONG FILE NAME & 1024 VIEWPORT OVERFLOW CHECK
  // ------------------------------------------------------------------------
  test('Bulk Copy and Create Long File Name & 1024 Viewport checks', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await setupMocks(page, { authenticated: true });

    await page.goto('/products/bom/copy/bulk', { waitUntil: 'networkidle' });
    await page.waitForSelector('.rx-bulk-upload-card, .bulk-upload-dropzone', { state: 'visible', timeout: 10000 });

    const longFileName = 'Very_Long_Enterprise_Production_Plant_1001_BOM_Structure_Release_2026_Q4_Final_Approved_v2_1.xlsx';
    const fileBuffer = createCopySpreadsheet();
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: longFileName,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: fileBuffer
    });

    const continueBtn = page.locator('button:has-text("Continue")').first();
    await expect(continueBtn).toBeEnabled({ timeout: 5000 });
    await continueBtn.click();

    // Verify long file chip
    const chipEl = page.locator('[data-testid="rx-preview-file-chip"]');
    await expect(chipEl).toBeVisible();
    await expect(chipEl).toHaveAttribute('title', longFileName);

    const chipBox = await chipEl.boundingBox();
    expect(chipBox.width).toBeLessThanOrEqual(245);

    // Header items on one row
    const titleEl = page.locator('[data-testid="rx-preview-title"]');
    const searchWrap = page.locator('[data-testid="rx-preview-search-wrap"]');
    const titleBox = await titleEl.boundingBox();
    const searchBox = await searchWrap.boundingBox();

    expect(Math.abs((titleBox.y + titleBox.height / 2) - (searchBox.y + searchBox.height / 2))).toBeLessThanOrEqual(4);

    // No horizontal scrollbar / overflow at 1024
    const isOverflowing1024 = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(isOverflowing1024).toBe(false);

    // Switch to 1366x768 for state (c) screenshot
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.waitForTimeout(200);

    const isOverflowing1366 = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(isOverflowing1366).toBe(false);

    await saveScreenshot(page, 'bulk-copy-long-filename-1366x768.png');

    // Also verify Bulk Create with long file name
    await page.goto('/products/bom/create/bulk', { waitUntil: 'networkidle' });
    await page.waitForSelector('.rx-bulk-upload-card, .bulk-upload-dropzone', { state: 'visible', timeout: 10000 });

    const createInput = page.locator('input[type="file"]').first();
    await createInput.setInputFiles({
      name: longFileName,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: createCreateSpreadsheet()
    });

    const createContinueBtn = page.locator('button:has-text("Continue")').first();
    await expect(createContinueBtn).toBeEnabled({ timeout: 5000 });
    await createContinueBtn.click();

    const createChip = page.locator('[data-testid="rx-preview-file-chip"]');
    await expect(createChip).toBeVisible();
    await expect(createChip).toHaveAttribute('title', longFileName);

    await saveScreenshot(page, 'bulk-create-long-filename-1366x768.png');
  });

  test.afterAll(() => {
    console.log('MEASURED_OFFSETS:', JSON.stringify(measurements, null, 2));
  });
});
