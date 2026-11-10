import { test, expect } from '@playwright/test';
import { setupMocks } from './helpers/mockApi.js';
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

test.describe('Stage 12: Admin Add/Edit SAP Server Modal Refinements', () => {
  test('Admin Add/Edit SAP Server Modal layout, labels, focus & limits', async ({ page }, testInfo) => {
    const vp = testInfo.project.name;
    if (vp !== '1366x768' && vp !== '1920x1080') {
      test.skip();
      return;
    }

    const [widthStr, heightStr] = vp.split('x');
    const width = parseInt(widthStr, 10);
    const height = parseInt(heightStr, 10);

    await setupMocks(page, { authenticated: true, role: 'admin' });
    await page.goto('/admin/servers', { waitUntil: 'networkidle' });

    // Navigate to SAP Servers tab if not active
    const serversTab = page.locator('button.sap-admin-nav-tab:has-text("SAP Servers")');
    if (await serversTab.count() > 0) {
      await serversTab.click();
    }
    await page.waitForSelector('table.sap-admin-compact-table', { state: 'visible', timeout: 10000 });

    // =========================================================================
    // 1. ADD SERVER MODAL
    // =========================================================================
    const addServerBtn = page.locator('button:has-text("Add Server")').first();
    await addServerBtn.click();

    const modal = page.locator('.sap-modal-card');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // C-2: First input (#server-name) focused on open, NOT close button
    await page.waitForTimeout(100);
    const focusedElementId = await page.evaluate(() => document.activeElement?.id);
    expect(focusedElementId).toBe('server-name');

    // Close button must not have focus
    const closeBtnFocused = await page.evaluate(() => document.activeElement?.classList.contains('sap-modal-close-btn'));
    expect(closeBtnFocused).toBe(false);

    // A-1: Modal width between 760px and 820px
    const modalBox = await modal.boundingBox();
    expect(modalBox).not.toBeNull();
    expect(modalBox.width).toBeGreaterThanOrEqual(760);
    expect(modalBox.width).toBeLessThanOrEqual(820);

    // Verify FormSections: "Server", "Connection", "Credentials", "Connection limits"
    const sections = modal.locator('.rx-server-modal-section');
    await expect(sections).toHaveCount(4);
    await expect(sections.nth(0).locator('.rx-form-section-title')).toHaveText('Server');
    await expect(sections.nth(1).locator('.rx-form-section-title')).toHaveText('Connection');
    await expect(sections.nth(2).locator('.rx-form-section-title')).toHaveText('Credentials');
    await expect(sections.nth(3).locator('.rx-form-section-title')).toHaveText('Connection limits');

    // Active checkbox after sections
    const activeCheck = modal.locator('#server-active-check');
    await expect(activeCheck).toBeVisible();

    // B-1 & B-3: Check all labels (no wrapping, no (Optional) text, stars on same line)
    const labels = modal.locator('.rx-field-label');
    const labelCount = await labels.count();
    expect(labelCount).toBeGreaterThanOrEqual(12);

    for (let i = 0; i < labelCount; i++) {
      const lbl = labels.nth(i);
      const text = await lbl.innerText();

      // No "(Optional)" text
      expect(text).not.toContain('(Optional)');
      expect(text).not.toContain('Optional');

      // Gateway Service renamed from Gateway Serv
      if (text.includes('Gateway')) {
        expect(text).toContain('Gateway Service');
      }

      // Connection limits labels clean (no ranges in labels)
      if (text.includes('Max connections')) {
        expect(text).toBe('Max connections');
      }
      if (text.includes('Per-user limit')) {
        expect(text).toBe('Per-user limit');
      }
      if (text.includes('Queue wait timeout')) {
        expect(text).toBe('Queue wait timeout (seconds)');
      }
      if (text.includes('SAP call timeout')) {
        expect(text).toBe('SAP call timeout (seconds)');
      }

      // Single line / no clipping (scrollWidth <= clientWidth + 2)
      const isSingleLine = await lbl.evaluate((el) => el.scrollWidth <= el.clientWidth + 2);
      expect(isSingleLine).toBe(true);

      // Required stars on the same line as label (within 2.5px vertically)
      const star = lbl.locator('.rx-field-required');
      if (await star.count() > 0) {
        const starBox = await star.boundingBox();
        const lblBox = await lbl.boundingBox();
        if (starBox && lblBox) {
          expect(Math.abs(starBox.y - lblBox.y)).toBeLessThanOrEqual(2.5);
        }
      }
    }

    // Check one-line helpers in Connection limits
    const maxConnHint = modal.locator('#server-max-conn').locator('xpath=ancestor::div[contains(@class, "rx-field-wrapper")]//div[contains(@class, "rx-field-hint")]');
    await expect(maxConnHint).toHaveText('1 to 20. Allowed parallel connections.');

    const queueHint = modal.locator('#server-queue-timeout').locator('xpath=ancestor::div[contains(@class, "rx-field-wrapper")]//div[contains(@class, "rx-field-hint")]');
    await expect(queueHint).toHaveText('5 to 120 seconds. Wait before fast fail.');

    // A-2: Row gap consistency (14px/16px between rows inside sections, identical between sections)
    const sec0Box = await sections.nth(0).boundingBox();
    const sec1Box = await sections.nth(1).boundingBox();
    const sec2Box = await sections.nth(2).boundingBox();
    const sec3Box = await sections.nth(3).boundingBox();

    const secGap0_1 = sec1Box.y - (sec0Box.y + sec0Box.height);
    const secGap1_2 = sec2Box.y - (sec1Box.y + sec1Box.height);
    const secGap2_3 = sec3Box.y - (sec2Box.y + sec2Box.height);

    expect(Math.abs(secGap0_1 - secGap1_2)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(secGap1_2 - secGap2_3)).toBeLessThanOrEqual(1.5);

    // A-3: Sticky footer buttons within viewport at all times
    const footer = modal.locator('.sap-modal-footer');
    await expect(footer).toBeVisible();
    const footerBox = await footer.boundingBox();
    expect(footerBox).not.toBeNull();
    expect(footerBox.y + footerBox.height).toBeLessThanOrEqual(height);

    // Body horizontal fit
    const bodyOverflowX = await modal.locator('.sap-modal-body').evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(bodyOverflowX).toBe(false);

    // Check 1920x1080 vertical fit without scroll
    if (vp === '1920x1080') {
      const dimensions = await modal.locator('.sap-modal-body').evaluate((el) => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        overflowY: el.scrollHeight - el.clientHeight
      }));
      console.log(`[1920x1080 Add Modal] scrollHeight: ${dimensions.scrollHeight}, clientHeight: ${dimensions.clientHeight}, overflowY: ${dimensions.overflowY}`);
      expect(dimensions.overflowY).toBeLessThanOrEqual(0);
    }

    // Screenshot 1: Add Modal
    const addSsName = `admin-server-add-${vp}.png`;
    const addSsPath = `screenshots/${addSsName}`;
    await page.screenshot({ path: addSsPath, fullPage: false });
    saveScreenshot(addSsPath, addSsName);

    // Close modal
    await modal.locator('.sap-modal-close-btn').click();
    await expect(modal).not.toBeVisible();

    // =========================================================================
    // 2. EDIT SERVER MODAL
    // =========================================================================
    const editBtn = page.locator('button[title*="Edit Server"], button[title*="Edit"]').first();
    await editBtn.click();
    await expect(modal).toBeVisible({ timeout: 5000 });

    // First field focused on open
    await page.waitForTimeout(100);
    const editFocusedId = await page.evaluate(() => document.activeElement?.id);
    expect(editFocusedId).toBe('server-name');

    // B-2: Password helper appears exactly ONCE in edit mode
    const passwordHints = modal.locator('text="Leave blank to keep the current password"');
    expect(await passwordHints.count()).toBe(1);

    // Header does NOT contain duplicate hint
    const credSection = sections.nth(2);
    const credHeader = credSection.locator('.rx-form-section-header');
    const credHeaderText = await credHeader.innerText();
    expect(credHeaderText).not.toContain('Leave password');

    // Password placeholder is short ("Unchanged") and not clipped
    const passInput = modal.locator('#server-password');
    await expect(passInput).toBeVisible();
    const placeholder = await passInput.getAttribute('placeholder');
    expect(placeholder).toBe('Unchanged');

    // B-4: Font check (normal font for Display Name, mono for technical values)
    const nameFont = await modal.locator('#server-name').evaluate((el) => window.getComputedStyle(el).fontFamily);
    const hostFont = await modal.locator('#server-ashost').evaluate((el) => window.getComputedStyle(el).fontFamily);
    expect(hostFont).toContain('Mono');
    expect(nameFont).not.toBe(hostFont);

    // Screenshot 2: Edit Modal
    const editSsName = `admin-server-edit-${vp}.png`;
    const editSsPath = `screenshots/${editSsName}`;
    await page.screenshot({ path: editSsPath, fullPage: false });
    saveScreenshot(editSsPath, editSsName);

    // =========================================================================
    // 3. VALIDATION ERROR STATE
    // =========================================================================
    // Set invalid connection limits (e.g. max connections = 25) with valid required fields
    await modal.locator('#server-username').fill('RFC_USER');
    await modal.locator('#server-max-conn').fill('25');
    await modal.locator('button[type="submit"]:has-text("Update Server")').click();

    // Errors must be visible
    const errorDivs = modal.locator('.sap-field-error, .rx-field-error');
    await expect(errorDivs.first()).toBeVisible({ timeout: 5000 });

    // Scroll modal body down if scrollable so the error in Connection limits is clearly visible in the screenshot
    await modal.locator('.sap-modal-body').evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(100);

    // Screenshot 3: Validation Error State
    const errSsName = `admin-server-error-${vp}.png`;
    const errSsPath = `screenshots/${errSsName}`;
    await page.screenshot({ path: errSsPath, fullPage: false });
    saveScreenshot(errSsPath, errSsName);

    // Close modal
    await modal.locator('.sap-modal-close-btn').click();
    await expect(modal).not.toBeVisible();
  });
});
