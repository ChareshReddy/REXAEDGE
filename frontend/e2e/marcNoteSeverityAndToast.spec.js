import { test, expect } from '@playwright/test';
import { setupMocks } from './helpers/mockApi.js';
import { createSampleBulkCreateFile } from './helpers/sampleFiles.js';
import path from 'path';

const SCREENSHOT_DIR = 'C:/Users/chare/.gemini/antigravity/brain/6fce99f3-5f59-4200-af87-677b5d74db10/screenshots';

test.describe('MARC Informational Notes Classification & Toast Suite', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page, { authenticated: true, role: 'admin' });
  });

  test('Single Create with MARC notes shows green success toast with muted notes and no amber', async ({ page }) => {
    const viewport = page.viewportSize();
    const vpSuffix = `${viewport.width}x${viewport.height}`;

    // Intercept single BOM preflight with MARC informational notes
    await page.route('**/api/**create-preflight*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          boms: [
            {
              status: 'Ready',
              material: 'A1BH0214C',
              plant: '1010',
              bomUsage: '1',
              alternativeBom: '01',
              validFrom: '14.11.2026',
              baseQty: '1',
              baseUnit: 'EA',
              bomStatus: '01',
              warnings: [
                { text: 'Header material "A1BH0214C" is not extended to plant 1010 (MARC)', type: 'info' },
                { text: 'Component "C3DH0416E" is not extended to plant 1010 (MARC)', type: 'info' }
              ],
              errors: []
            }
          ]
        })
      });
    });

    await page.goto('/products/bom/create/single', { waitUntil: 'networkidle' });
    await page.waitForSelector('.rx-components-table', { state: 'visible' });

    // Fill valid form fields with materials that exist in mock catalog
    await page.locator('#createBomMaterial').fill('A1BH0214C');
    await page.locator('#createBomPlant').fill('1010');

    // Fill component row with valid component and required storage location
    await page.locator('input[aria-label="Component 1"]').fill('C3DH0416E');
    await page.locator('input[aria-label="Storage location 1"]').fill('0001');

    // Click "Validate Master Data"
    const validateBtn = page.locator('button:has-text("Validate Master Data")').first();
    await expect(validateBtn).toBeVisible();
    await validateBtn.click();

    // 1. Toast must be GREEN success toast
    const successToast = page.locator('.sap-toast-success').first();
    await expect(successToast).toBeVisible({ timeout: 5000 });

    const toastBg = await successToast.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    // var(--color-success-bg) is #F0FDF4 -> rgb(240, 253, 244) or #ECFDF3 -> rgb(236, 253, 243)
    expect(['rgb(240, 253, 244)', 'rgb(236, 253, 243)']).toContain(toastBg);

    // 2. Title must be "Pre-flight passed"
    const toastTitle = successToast.locator('.sap-toast-title');
    await expect(toastTitle).toHaveText('Pre-flight passed');

    // 3. Message must be "Material master data, units and SAP simulation verified."
    const toastMsg = successToast.locator('.sap-toast-message');
    await expect(toastMsg).toContainText('Material master data, units and SAP simulation verified.');

    // 4. Notes must be visible in muted neutral text (13px, no amber, no warning icon)
    const noteItems = successToast.locator('.sap-toast-note-item');
    await expect(noteItems).toHaveCount(2);
    await expect(noteItems.first()).toContainText('Note: A1BH0214C is not extended to plant 1010 (MARC).');
    await expect(noteItems.nth(1)).toContainText('Note: C3DH0416E is not extended to plant 1010 (MARC).');

    const noteColor = await noteItems.first().evaluate((el) => window.getComputedStyle(el).color);
    // rgb(74, 95, 119) is #4A5F77
    expect(noteColor).toBe('rgb(74, 95, 119)');

    // 5. Assert NO amber toast and NO warning icon for MARC notes
    await expect(page.locator('.sap-toast-warning')).toHaveCount(0);
    await expect(successToast.locator('svg.lucide-alert-triangle, svg.lucide-triangle-alert')).toHaveCount(0);

    // Capture screenshot
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `single-create-marc-toast-${vpSuffix}.png`),
      fullPage: false
    });
  });

  test('Bulk preview: row with MARC note stays Ready without amber icon or visible message row, while real warning shows amber', async ({ page }) => {
    const viewport = page.viewportSize();
    const vpSuffix = `${viewport.width}x${viewport.height}`;

    // Intercept bulk job endpoints to serve step 2 Data Preview with:
    // Row 1: Ready with MARC note (must NOT show message line or amber icon)
    // Row 2: Ready with Real warning (MUST show message line with amber icon)
    const mockPreflightResults = [
      {
        id: 1,
        sequenceNum: '1',
        material: 'A1BH0214C',
        plant: '1010',
        bomUsage: '1',
        alternativeBom: '01',
        validFrom: '01.01.2026',
        baseQty: 1,
        bomStatus: '01',
        status: 'Ready',
        message: 'Ready for creation',
        warnings: [
          { text: 'Header material "A1BH0214C" is not extended to plant 1010 (MARC)', type: 'info' }
        ],
        errors: [],
        components: [
          { itemNo: '0010', component: 'C3DH0416E', quantity: 5, unit: 'KG', storageLocation: '0001', itemCategory: 'L' }
        ]
      },
      {
        id: 2,
        sequenceNum: '2',
        material: 'B2CH0315D',
        plant: '1010',
        bomUsage: '1',
        alternativeBom: '01',
        validFrom: '01.01.2026',
        baseQty: 1,
        bomStatus: '01',
        status: 'Ready',
        message: 'Ready for creation',
        warnings: [
          { text: 'Storage location PR67 is not valid for plant 1010 (T001L)', type: 'warning' }
        ],
        errors: [],
        components: [
          { itemNo: '0010', component: 'D4EH0517F', quantity: 10, unit: 'EA', storageLocation: '0001', itemCategory: 'L' }
        ]
      }
    ];

    await page.route('**/api/bom/jobs/start', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          jobId: 'mock-job-marc-01',
          total: 2,
          status: 'PROCESSING'
        })
      });
    });

    await page.route('**/api/bom/jobs/mock-job-marc-01', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          job: {
            id: 'mock-job-marc-01',
            jobId: 'mock-job-marc-01',
            type: 'create_preflight',
            status: 'COMPLETED',
            processed: 2,
            total: 2,
            successCount: 2,
            failedCount: 0,
            skippedCount: 0,
            results: mockPreflightResults
          }
        })
      });
    });

    await page.goto('/products/bom/create/bulk', { waitUntil: 'networkidle' });

    // Upload mock spreadsheet
    const createBuffer = createSampleBulkCreateFile();
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'Batch_BOM_Create.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: createBuffer
    });

    // Advance to Step 2
    const continueBtn = page.locator('button:has-text("Continue")').first();
    await expect(continueBtn).toBeEnabled({ timeout: 5000 });
    await continueBtn.click();

    // In Step 2, click "Validate Master Data" to run SAP preflight
    const validateBtn = page.locator('.validate-with-sap-btn, button:has-text("Validate Master Data")').first();
    await expect(validateBtn).toBeVisible({ timeout: 5000 });
    await validateBtn.click();

    // Wait for preflight results to merge into table
    await page.waitForSelector('.preflight-preview-table', { state: 'visible', timeout: 8000 });

    // 1. Row 1 (MARC note): Result badge is Ready (green)
    const row1Badge = page.locator('tbody tr.bom-group-first-row').first().locator('.sap-badge-success');
    await expect(row1Badge).toBeVisible();
    await expect(row1Badge).toContainText('Ready');

    // Row 1 badge cell has tooltip with the note
    const row1ResultCell = page.locator('tbody tr.bom-group-first-row').first().locator('.col-result');
    const row1Title = await row1ResultCell.getAttribute('title');
    expect(row1Title).toContain('not extended to plant 1010 (MARC)');

    // Row 1 has NO visible message row in the table
    const row1MessageRow = page.locator('tr.bom-messages-row').filter({
      hasText: 'Header material "A1BH0214C" is not extended'
    });
    await expect(row1MessageRow).toHaveCount(0);

    // Row 1 has NO amber warning icon
    const row1FirstRow = page.locator('tbody tr.bom-group-first-row').first();
    await expect(row1FirstRow.locator('.lucide-alert-triangle, .lucide-triangle-alert')).toHaveCount(0);

    // 2. Row 2 (Real warning): message line IS rendered with amber icon
    const row2MessageRow = page.locator('tr.bom-messages-row').filter({
      hasText: 'Storage location PR67 is not valid'
    });
    await expect(row2MessageRow).toBeVisible();
    await expect(row2MessageRow.locator('.bom-msg-warning')).toBeVisible();
    await expect(row2MessageRow.locator('.bom-msg-warning svg')).toBeVisible();

    // Capture screenshot
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `bulk-preview-marc-row-${vpSuffix}.png`),
      fullPage: false
    });
  });
});
