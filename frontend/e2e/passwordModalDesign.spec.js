import { test, expect } from '@playwright/test';
import { setupMocks, mockAdminUser } from './helpers/mockApi.js';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/chare/.gemini/antigravity/brain/670a18b0-0002-4036-b6f5-4b4c0c22c519';

function saveScreenshot(sourcePath, filename) {
  try {
    if (!fs.existsSync('screenshots')) {
      fs.mkdirSync('screenshots', { recursive: true });
    }
    if (fs.existsSync(ARTIFACT_DIR)) {
      fs.copyFileSync(sourcePath, path.join(ARTIFACT_DIR, filename));
    }
  } catch (err) {
    console.warn(`Failed to copy screenshot ${filename}:`, err.message);
  }
}

test.describe('Admin Users - Set New Password Modal Design & Behavior', () => {
  test('Validates structure, full-bleed header, live checklist, mismatch error, and screenshots states', async ({ page }, testInfo) => {
    const vp = testInfo.project.name;
    if (vp !== '1366x768' && vp !== '1920x1080') {
      test.skip();
      return;
    }

    await setupMocks(page, { authenticated: true, user: mockAdminUser });

    // Navigate to Admin > Users
    await page.goto('/admin/users', { waitUntil: 'networkidle' });
    await page.waitForSelector('table.sap-table', { state: 'visible', timeout: 10000 });

    // Open "Set password" modal for user-1
    const setPwdBtn = page.locator('button[title*="Set new password for user@rexaedge.com"]').first();
    await setPwdBtn.click();

    const modalCard = page.locator('.sap-modal-card');
    await expect(modalCard).toBeVisible({ timeout: 5000 });

    const modalHeader = page.locator('.sap-modal-header');
    await expect(modalHeader).toBeVisible();

    // 1. Structure assertions: Header spans full width (no horizontal inset / white frame)
    const cardBox = await modalCard.boundingBox();
    const headerBox = await modalHeader.boundingBox();
    expect(cardBox).not.toBeNull();
    expect(headerBox).not.toBeNull();
    // Header should span exactly the card width (within 2px border/subpixel tolerance)
    expect(Math.abs(headerBox.width - cardBox.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(headerBox.x - cardBox.x)).toBeLessThanOrEqual(2);

    // Header title and subtitle
    const titleEl = modalHeader.locator('h3');
    await expect(titleEl).toHaveText('Set New Password');

    const subtitleEl = modalHeader.locator('p');
    await expect(subtitleEl).toHaveText('Account: user@rexaedge.com');
    // Ensure subtitle stays on one line (height <= 22px)
    const subBox = await subtitleEl.boundingBox();
    expect(subBox.height).toBeLessThanOrEqual(24);

    // Locators
    const newPwdInput = page.locator('#sap-new-pwd');
    const confirmPwdInput = page.locator('#sap-confirm-pwd');
    const submitBtn = page.locator('button[type="submit"][form="password-modal-form"]');

    // Focus goes to first field on open
    await expect(newPwdInput).toBeFocused();

    // 2. Font family is normal UI font (not monospace)
    const newPwdFont = await newPwdInput.evaluate((el) => window.getComputedStyle(el).fontFamily);
    expect(newPwdFont.toLowerCase()).not.toContain('mono');

    // 3. No error text on first render
    await expect(page.locator('.rx-field-error')).toHaveCount(0);
    // Submit button disabled
    await expect(submitBtn).toBeDisabled();

    // Capture STATE 1: Empty
    const emptyShot = `screenshots/set-password-empty-${vp}.png`;
    await modalCard.screenshot({ path: emptyShot });
    saveScreenshot(emptyShot, `set-password-empty-${vp}.png`);

    // 4. Checklist state initially: all 4 rules unmet
    const ruleLength = page.locator('[data-testid="pwd-rule-length"]');
    const ruleUpper = page.locator('[data-testid="pwd-rule-upper"]');
    const ruleLower = page.locator('[data-testid="pwd-rule-lower"]');
    const ruleNumber = page.locator('[data-testid="pwd-rule-number"]');

    // 5. Partly typed: "Secret1" (7 chars: upper, lower, number met; length unmet)
    await newPwdInput.fill('Secret1');
    await expect(ruleUpper.locator('svg')).toBeVisible();
    await expect(ruleLower.locator('svg')).toBeVisible();
    await expect(ruleNumber.locator('svg')).toBeVisible();
    await expect(ruleLength.locator('svg')).toHaveCount(0); // length not met yet
    await expect(submitBtn).toBeDisabled();

    // Capture STATE 2: Partly typed
    const partlyShot = `screenshots/set-password-partly-typed-${vp}.png`;
    await modalCard.screenshot({ path: partlyShot });
    saveScreenshot(partlyShot, `set-password-partly-typed-${vp}.png`);

    // 6. Complete valid password in new password: "Enterprise@123"
    await newPwdInput.fill('Enterprise123');
    await expect(ruleLength.locator('svg')).toBeVisible();
    await expect(ruleUpper.locator('svg')).toBeVisible();
    await expect(ruleLower.locator('svg')).toBeVisible();
    await expect(ruleNumber.locator('svg')).toBeVisible();

    // Confirm password still untouched -> no error text yet
    await expect(page.locator('.rx-field-error')).toHaveCount(0);
    await expect(submitBtn).toBeDisabled();

    // 7. Mismatch: Type "DifferentPass1" in confirm field -> shows "Passwords do not match" in error style
    await confirmPwdInput.fill('DifferentPass1');
    const mismatchError = page.locator('.rx-field-error');
    await expect(mismatchError).toBeVisible();
    await expect(mismatchError).toHaveText('Passwords do not match');
    await expect(submitBtn).toBeDisabled();

    // Capture STATE 3: Mismatch
    const mismatchShot = `screenshots/set-password-mismatch-${vp}.png`;
    await modalCard.screenshot({ path: mismatchShot });
    saveScreenshot(mismatchShot, `set-password-mismatch-${vp}.png`);

    // 8. Matching: Type "Enterprise123" in confirm field
    await confirmPwdInput.fill('Enterprise123');
    // Error disappears
    await expect(page.locator('.rx-field-error')).toHaveCount(0);
    // Submit button becomes ENABLED
    await expect(submitBtn).toBeEnabled();

    // Spacing assertion: Gap between New Password field and Confirm Password field
    const newPwdBox = await newPwdInput.boundingBox();
    const confirmLabelBox = await page.locator('label[for="sap-confirm-pwd"]').boundingBox();
    expect(confirmLabelBox.y).toBeGreaterThan(newPwdBox.y + newPwdBox.height);

    // Capture STATE 4: All rules met with matching passwords
    const matchingShot = `screenshots/set-password-matching-${vp}.png`;
    await modalCard.screenshot({ path: matchingShot });
    saveScreenshot(matchingShot, `set-password-matching-${vp}.png`);

    // 9. Keyboard controls: Escape closes modal
    await page.keyboard.press('Escape');
    await expect(modalCard).not.toBeVisible();

    // 10. Verify Create User popup structure & styling
    const addUserBtn = page.locator('button:has-text("Add User")');
    await addUserBtn.click();

    const userModalCard = page.locator('.sap-modal-card');
    await expect(userModalCard).toBeVisible();

    const userModalHeader = userModalCard.locator('.sap-modal-header');
    await expect(userModalHeader.locator('h3')).toHaveText('Add New User');

    const userCardBox = await userModalCard.boundingBox();
    const userHeaderBox = await userModalHeader.boundingBox();
    expect(Math.abs(userHeaderBox.width - userCardBox.width)).toBeLessThanOrEqual(2);

    const emailInput = userModalCard.locator('#add-user-email');
    await expect(emailInput).toBeFocused();

    const createBtn = userModalCard.locator('button[type="submit"][form="add-user-modal-form"]');
    await expect(createBtn).toHaveText('Create User');

    await page.keyboard.press('Escape');
    await expect(userModalCard).not.toBeVisible();
  });
});
