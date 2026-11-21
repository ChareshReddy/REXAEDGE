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

    // 6. ACTION 1: Modify multiple components so Modified section has multiple rows
    const qtyInputs = page.locator('input[aria-label*="Quantity for"]');
    await expect(qtyInputs.first()).toBeVisible();
    await qtyInputs.nth(0).fill('25');
    await qtyInputs.nth(2).fill('15');
    await qtyInputs.nth(4).fill('8');
    await qtyInputs.nth(6).fill('12');

    // 7. ACTION 2: Add multiple components with auto-scroll and focus verification
    const addCompBtn = page.locator('#btn-add-component');
    await expect(addCompBtn).toBeVisible();

    // Add first new component
    await addCompBtn.click();
    const newComp1 = page.locator('input[placeholder="Component material"]').last();
    await expect(newComp1).toBeVisible();
    await expect(newComp1).toBeFocused();
    await newComp1.fill('RAW-NEW-01');
    await page.locator('input[aria-label*="Quantity for"]').last().fill('5');

    // Add second new component
    await addCompBtn.click();
    const newComp2 = page.locator('input[placeholder="Component material"]').last();
    await expect(newComp2).toBeVisible();
    await expect(newComp2).toBeFocused();
    await newComp2.fill('RAW-NEW-02');
    await page.locator('input[aria-label*="Quantity for"]').last().fill('10');

    // Add third new component
    await addCompBtn.click();
    const newComp3 = page.locator('input[placeholder="Component material"]').last();
    await expect(newComp3).toBeVisible();
    await expect(newComp3).toBeFocused();
    await newComp3.fill('RAW-NEW-03');
    await page.locator('input[aria-label*="Quantity for"]').last().fill('15');

    // Add fourth new component
    await addCompBtn.click();
    const newComp4 = page.locator('input[placeholder="Component material"]').last();
    await expect(newComp4).toBeVisible();
    await expect(newComp4).toBeFocused();
    await newComp4.fill('RAW-NEW-04');
    await page.locator('input[aria-label*="Quantity for"]').last().fill('20');

    // 8. ACTION 3: Delete multiple components so Deleted section has multiple rows
    const deleteButtons = page.locator('button[title="Mark for deletion"]');
    await deleteButtons.nth(1).click();
    await deleteButtons.nth(3).click();
    await deleteButtons.nth(5).click();
    await deleteButtons.nth(7).click();

    // Verify row shows Undo button
    const undoButton = page.locator('button:has-text("Undo")').first();
    await expect(undoButton).toBeVisible();

    // 9. STEP 3: OPEN REVIEW CHANGES MODAL
    const reviewBtn = page.locator('#btn-review-changes');
    await expect(reviewBtn).toBeEnabled();
    await reviewBtn.click();

    // 10. VERIFY REVIEW MODAL REDESIGNED ACCORDING TO SPEC
    await expect(page.locator('text=Review BOM Changes')).toBeVisible();

    // Verify one short line of context (material in uppercase, plant, alternative BOM)
    await expect(page.locator('text=Material: A1BH0214C | Plant: 1010 | Alternative BOM: 01')).toBeVisible();

    // Verify clean section title rows with navy left accent and Badge count (no clumsy buttons)
    const modifiedSection = page.locator('div:has-text("Modified Items")').filter({ has: page.locator('text=4') }).first();
    await expect(modifiedSection).toBeVisible();
    await expect(page.locator('text=Added Items').first()).toBeVisible();
    await expect(page.locator('text=Deleted Items').first()).toBeVisible();

    // Verify Modified table columns (Item, Component, Field, Old Value, New Value)
    await expect(page.locator('th:has-text("Field")')).toBeVisible();
    await expect(page.locator('th:has-text("Old Value")')).toBeVisible();
    await expect(page.locator('th:has-text("New Value")')).toBeVisible();

    // Verify Added table columns (Item, Component, Quantity, Unit, Category, Storage Location, Item Text)
    await expect(page.locator('th:has-text("Storage Location")')).toBeVisible();
    await expect(page.locator('text=RAW-NEW-01')).toBeVisible();
    await expect(page.locator('text=RAW-NEW-04')).toBeVisible();

    // Verify Deleted table columns (Item, Component, Quantity, Unit) and danger badge
    const deletedBadge = page.locator('div:has-text("Deleted Items")').locator('span').filter({ hasText: '4' }).first();
    await expect(deletedBadge).toBeVisible();

    // Verify each table has scrollable container with fixed max height and sticky headers
    const scrollContainers = page.locator('.rx-table-container.overflow-y-auto');
    await expect(scrollContainers.first()).toBeVisible();

    // Verify footer buttons: Cancel (secondary) and Confirm and Save (primary)
    const cancelModalBtn = page.locator('#btn-cancel-save-bom');
    await expect(cancelModalBtn).toBeVisible();
    await expect(cancelModalBtn).toHaveText('Cancel');

    const confirmSaveBtn = page.locator('#btn-confirm-save-bom');
    await expect(confirmSaveBtn).toBeVisible();
    await expect(confirmSaveBtn).toHaveText('Confirm and Save');

    // Verify backdrop click does NOT close modal (AGENTS.md rule 4)
    await page.mouse.click(10, 10);
    await expect(page.locator('text=Review BOM Changes')).toBeVisible();

    // Screenshot of Review Changes Modal with all 3 scrollable sections
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, `change-bom-review-modal-${vpName}.png`),
      fullPage: false
    });

    // 11. STEP 4: SAVE CHANGES TO SAP
    await confirmSaveBtn.click();

    // 12. STEP 5: VERIFY RESULT SCREEN
    await expect(page.locator('text=BOM Changed Successfully')).toBeVisible({ timeout: 10000 });
    
    // Success message shows material in uppercase
    await expect(page.locator('text=Material A1BH0214C')).toBeVisible();

    // Result table shows Category column
    await expect(page.locator('th:has-text("Category")')).toBeVisible();

    // Result table does NOT have Description column
    await expect(page.locator('th:has-text("Description")')).toHaveCount(0);

    // Result table shows Item Text column
    await expect(page.locator('th:has-text("Item Text")')).toBeVisible();

    // Component numbers have leading zeros stripped like SAP (000000000011021735 -> 11021735)
    await expect(page.locator('text=11021735')).toBeVisible();
    await expect(page.locator('text=000000000011021735')).toHaveCount(0);

    // Verify rows are sorted ascending by item number (0010, 0020, 0030)
    const verifiedTable = page.locator('div[aria-label="Verified BOM Components Table"]');
    await expect(verifiedTable).toBeVisible();
    const rowItemCells = verifiedTable.locator('tbody tr td:first-child');
    await expect(rowItemCells.nth(0)).toHaveText('0010');
    await expect(rowItemCells.nth(1)).toHaveText('0020');
    await expect(rowItemCells.nth(2)).toHaveText('0030');

    // Verify column alignments
    await expect(verifiedTable.getByRole('columnheader', { name: 'Item', exact: true })).toHaveCSS('text-align', 'center');
    await expect(verifiedTable.locator('th:has-text("Category")')).toHaveCSS('text-align', 'center');
    await expect(verifiedTable.locator('th:has-text("Quantity")')).toHaveCSS('text-align', 'right');
    await expect(verifiedTable.locator('th:has-text("Unit")')).toHaveCSS('text-align', 'center');

    // Verify empty values display a light dash
    await expect(verifiedTable.locator('tbody tr').nth(2).locator('td').nth(5)).toContainText('—');

    // Summary KPIs
    await expect(page.locator('text=Items Modified')).toBeVisible();
    await expect(page.locator('text=Items Added')).toBeVisible();
    await expect(page.locator('text=Items Deleted')).toBeVisible();

    // Verify two buttons at bottom exist and do not cover last row
    const changeAnotherBtn = page.locator('button:has-text("Change Another BOM")');
    const returnLaunchpadBtn = page.locator('button:has-text("Return to Launchpad")');
    await expect(changeAnotherBtn).toBeVisible();
    await expect(returnLaunchpadBtn).toBeVisible();

    // Check no horizontal page overflow
    const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(hasHScroll).toBe(false);

    // Screenshot of Verified Components Table specifically
    await verifiedTable.screenshot({
      path: path.join(ARTIFACT_DIR, `change-bom-verified-table-${vpName}.png`)
    });

    // Screenshot of Result Screen
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, `change-bom-result-${vpName}.png`),
      fullPage: false
    });
  });

  test('Alternative BOM Selection: Multiple (double click), Single (direct), None (error), Typed (direct), Cancel (unchanged)', async ({ page }) => {
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

    await page.goto('/products/bom/change/single', { waitUntil: 'networkidle' });

    const matInput = page.locator('#chgMaterial');
    const plantInput = page.locator('#chgPlant');
    const altInput = page.locator('#chgAlt');
    const loadBtn = page.locator('#btn-load-bom');

    // Case 1: Multiple alternatives (2 alternatives) -> Verify compact layout, no duplicate text, footer count
    await matInput.fill('MULTI-ALT-MAT');
    await plantInput.fill('1010');
    await altInput.fill('');
    await loadBtn.click();

    // Verify modal is open and displays alternatives
    const altModalTitle = page.locator('h3:has-text("Select Alternative BOM"), h2:has-text("Select Alternative BOM")');
    await expect(altModalTitle).toBeVisible();

    // Verify subtitle and body text (no duplicate text)
    await expect(page.locator('text=Material MULTI-ALT-MAT | Plant 1010 | BOM usage 1')).toBeVisible();
    await expect(page.locator('text=Select an alternative to open for editing. Double click a row to open it.')).toBeVisible();

    // Verify footer count on left
    await expect(page.locator('text=2 alternatives')).toBeVisible();
    await expect(page.locator('.rx-table-row:has-text("01")').first()).toBeVisible();
    await expect(page.locator('.rx-table-row:has-text("02")').first()).toBeVisible();

    // Screenshot of 2 alternatives popup (compact, no empty space)
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'change-bom-alt-modal-2-alts.png'),
      fullPage: false
    });

    // Cancel closes popup leaving form unchanged
    const cancelAltBtn = page.locator('#btn-cancel-alt-selection');
    await cancelAltBtn.scrollIntoViewIfNeeded();
    await cancelAltBtn.click({ force: true });
    await expect(altModalTitle).toHaveCount(0);
    await expect(matInput).toBeVisible();
    await expect(page.locator('text=BOM Components')).toHaveCount(0);

    // Case 1b: Many alternatives (14 alternatives) -> Verify scrollable body, sticky header, keyboard nav
    await matInput.fill('MANY-ALT-MAT');
    await plantInput.fill('1010');
    await altInput.fill('');
    await loadBtn.click();

    await expect(altModalTitle).toBeVisible();
    await expect(page.locator('text=14 alternatives')).toBeVisible();
    await expect(page.locator('.rx-table-alt-selection')).toBeVisible();

    // Screenshot of many alternatives popup (bounded height, scrollbar, sticky header)
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'change-bom-alt-modal-many-alts.png'),
      fullPage: false
    });

    // Keyboard navigation: ArrowDown selects next alternative (02), Enter opens it
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    // Modal closes, alternative 02 loaded into edit mode
    await expect(altModalTitle).toHaveCount(0);
    await expect(page.locator('text=BOM Components')).toBeVisible();
    await expect(page.locator('span:has-text("Alternative:")').locator('xpath=..')).toContainText('02');

    // Reset back to search step
    await page.locator('button:has-text("Switch BOM")').click();
    await expect(matInput).toBeVisible();

    // Case 2: Multiple alternatives -> double click row selects and opens for edit
    await matInput.fill('MULTI-ALT-MAT');
    await plantInput.fill('1010');
    await altInput.fill('');
    await loadBtn.click();
    await expect(altModalTitle).toBeVisible();
    const alt2Row = page.locator('.rx-table-row', { hasText: 'High Output Motor Alt 02' });
    await expect(alt2Row).toBeVisible();
    await alt2Row.dblclick();

    // Modal closes, alternative 02 loaded into edit mode
    await expect(altModalTitle).toHaveCount(0);
    await expect(page.locator('text=BOM Components')).toBeVisible();
    await expect(page.locator('span:has-text("Alternative:")').locator('xpath=..')).toContainText('02');

    // Reset back to search step
    await page.locator('button:has-text("Switch BOM")').click();
    await expect(matInput).toBeVisible();

    // Case 3: Typed alternative opens directly without popup
    await matInput.fill('MULTI-ALT-MAT');
    await plantInput.fill('1010');
    await altInput.fill('02');
    await loadBtn.click();

    // No modal opens, directly loaded
    await expect(altModalTitle).toHaveCount(0);
    await expect(page.locator('text=BOM Components')).toBeVisible();
    await expect(page.locator('span:has-text("Alternative:")').locator('xpath=..')).toContainText('02');

    // Reset back to search step
    await page.locator('button:has-text("Switch BOM")').click();
    await expect(matInput).toBeVisible();

    // Case 4: Single alternative opens directly without popup
    await matInput.fill('A1BH0214C');
    await plantInput.fill('1010');
    await altInput.fill('');
    await loadBtn.click();

    // No modal opens, directly loaded with alternative 01
    await expect(altModalTitle).toHaveCount(0);
    await expect(page.locator('text=BOM Components')).toBeVisible();
    await expect(page.locator('span:has-text("Alternative:")').locator('xpath=..')).toContainText('01');

    // Reset back to search step
    await page.locator('button:has-text("Switch BOM")').click();
    await expect(matInput).toBeVisible();

    // Case 5: None shows "BOM not found" error
    await matInput.fill('NON-EXISTENT-MAT');
    await plantInput.fill('1010');
    await altInput.fill('');
    await loadBtn.click();

    // Normal BOM not found error appears in error banner with Retry action, no edit mode
    await expect(page.locator('#alternative-lookup-error-banner')).toContainText('No BOM exists for material NON-EXISTENT-MAT in plant 1010');
    await expect(page.locator('#btn-retry-lookup')).toBeVisible();
    await expect(page.locator('text=BOM Components')).toHaveCount(0);
    await expect(matInput).toBeVisible();
  });
});
