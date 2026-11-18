import { test, expect } from '@playwright/test';
import { setupMocks, mockAdminUser, mockServers } from './helpers/mockApi.js';
import path from 'path';

const ARTIFACT_DIR = 'C:\\Users\\chare\\.gemini\\antigravity\\brain\\6fce99f3-5f59-4200-af87-677b5d74db10\\screenshots';

test.describe('Change BOM (CS02) End-to-End Journey', () => {
  test('Load -> Change Quantity -> Add Item -> Delete Item -> Review Modal (3 diffs) -> Save -> Result', async ({ page }, testInfo) => {
    const vpName = testInfo.project.name || 'desktop';

    // 1. Setup mock APIs and user authentication
    await setupMocks(page, {
      authenticated: true,
      user: mockAdminUser,
      servers: mockServers
    });

    await page.addInitScript(() => {
      localStorage.setItem('sb_user', JSON.stringify({
        id: 'admin-1',
        email: 'admin@rexaedge.com',
        role: 'admin'
      }));
      localStorage.setItem('sb_user_email', 'admin@rexaedge.com');
      localStorage.setItem('sb_user_id', 'admin-1');
      localStorage.setItem('sb_user_role', 'admin');
      localStorage.setItem('sb_token', 'mock-admin-token');
      localStorage.setItem('rexa_selected_server_id', 'srv-1');
      localStorage.setItem('rexa_sidebar_expanded_groups', JSON.stringify({ bom: true, admin: false }));
    });

    // 2. Navigate to Change BOM single route
    await page.goto('/products/bom/change/single', { waitUntil: 'networkidle' });

    // 3. Verify Page Title and Header
    await expect(page.locator('h1:has-text("Change Bill of Materials")')).toBeVisible();

    // Verify Sidebar link exists and is labeled "Change BOM"
    const changeBomLink = page.locator('nav a[href="/products/bom/change/single"], nav button:has-text("Change BOM")');
    if (await changeBomLink.count() > 0) {
      await expect(changeBomLink.first()).toBeVisible();
    }

    // 4. STEP 1: LOAD BOM FORM
    // Fill Material and Plant
    const matInput = page.locator('#chgMaterial');
    await expect(matInput).toBeVisible();
    await matInput.fill('A1BH0214C');

    const plantInput = page.locator('#chgPlant');
    await plantInput.fill('1010');

    // Click Load BOM
    const loadBtn = page.locator('#btn-load-bom');
    await expect(loadBtn).toBeVisible();
    await loadBtn.click();

    // 5. STEP 2: VERIFY EDIT TABLE LOADED
    await expect(page.locator('text=BOM Components')).toBeVisible();
    await expect(page.locator('text=C3DH0416E').first()).toBeVisible();

    // Screenshot of Initial Loaded BOM
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, `change-bom-loaded-${vpName}.png`),
      fullPage: false
    });

    // 6. ACTION 1: Change Quantity of first component from 1 to 25
    const firstQtyInput = page.locator('input[aria-label*="Quantity for"]').first();
    await expect(firstQtyInput).toBeVisible();
    await firstQtyInput.fill('25');

    // 7. ACTION 2: Add Component
    const addCompBtn = page.locator('#btn-add-component');
    await expect(addCompBtn).toBeVisible();
    await addCompBtn.click();

    // Fill newly added component row
    const newCompInput = page.locator('input[placeholder="Component material"]').last();
    await expect(newCompInput).toBeVisible();
    await newCompInput.fill('RAW-NEW-99');

    const newQtyInput = page.locator('input[aria-label*="Quantity for"]').last();
    await newQtyInput.fill('5');

    // 8. ACTION 3: Delete second component
    const deleteButtons = page.locator('button[title="Mark for deletion"]');
    await expect(deleteButtons.nth(1)).toBeVisible();
    await deleteButtons.nth(1).click();

    // Verify row shows Undo button
    const undoButton = page.locator('button:has-text("Undo")');
    await expect(undoButton).toBeVisible();

    // 9. STEP 3: OPEN REVIEW CHANGES MODAL
    const reviewBtn = page.locator('#btn-review-changes');
    await expect(reviewBtn).toBeEnabled();
    await reviewBtn.click();

    // 10. VERIFY REVIEW MODAL HAS 3 DIFFERENCES
    await expect(page.locator('text=Review BOM Changes')).toBeVisible();
    await expect(page.locator('text=Changed Components (1)')).toBeVisible();
    await expect(page.locator('text=Added Components (1)')).toBeVisible();
    await expect(page.locator('text=Deleted Components (1)')).toBeVisible();
    await expect(page.locator('text=RAW-NEW-99')).toBeVisible();

    // Verify backdrop click does NOT close modal (AGENTS.md rule 4)
    await page.mouse.click(10, 10);
    await expect(page.locator('text=Review BOM Changes')).toBeVisible();

    // Screenshot of Review Changes Modal
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, `change-bom-review-modal-${vpName}.png`),
      fullPage: false
    });

    // 11. STEP 4: SAVE CHANGES TO SAP
    const confirmSaveBtn = page.locator('#btn-confirm-save-bom');
    await expect(confirmSaveBtn).toBeVisible();
    await confirmSaveBtn.click();

    // 12. STEP 5: VERIFY RESULT SCREEN
    await expect(page.locator('text=BOM Changed Successfully')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Items Modified')).toBeVisible();
    await expect(page.locator('text=Items Added')).toBeVisible();
    await expect(page.locator('text=Items Deleted')).toBeVisible();
    await expect(page.locator('button:has-text("Change Another BOM")')).toBeVisible();

    // Check no horizontal page overflow
    const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(hasHScroll).toBe(false);

    // Screenshot of Result Screen
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, `change-bom-result-${vpName}.png`),
      fullPage: false
    });
  });
});
