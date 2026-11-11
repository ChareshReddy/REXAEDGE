import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { setupMocks } from './helpers/mockApi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const screenshotsDir = path.resolve(__dirname, '../screenshots');
const artifactDir = 'C:/Users/chare/.gemini/antigravity/brain/670a18b0-0002-4036-b6f5-4b4c0c22c519';

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

function parseRgb(colorStr) {
  if (!colorStr) return null;
  const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return null;
  return {
    r: parseInt(match[1], 10),
    g: parseInt(match[2], 10),
    b: parseInt(match[3], 10)
  };
}

function rgbToHsl({ r, g, b }) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

function isAmberOrOrange(colorStr) {
  const rgb = parseRgb(colorStr);
  if (!rgb) return false;
  const hsl = rgbToHsl(rgb);
  // Orange/amber hue band 15°-45° with saturation > 50%
  return hsl.h >= 15 && hsl.h <= 45 && hsl.s > 50;
}

test.describe('Delete BOM Confirmation and Popup Header Colors', () => {
  for (const viewport of [
    { width: 1366, height: 768, name: '1366x768' },
    { width: 1920, height: 1080, name: '1920x1080' }
  ]) {
    test(`Popups and Delete Confirmation at ${viewport.name}`, async ({ page }, testInfo) => {
      if (testInfo.project.name !== viewport.name) {
        test.skip();
      }

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await setupMocks(page, { authenticated: true });

      // Mock BOM endpoints for single delete
      await page.route('**/api/bom/details**', async (route) => {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              material: 'A1BH0214C',
              plant: '1010',
              alternativeBom: '01',
              bomUsage: '1',
              components: [
                { id: 1, component: 'COMP-100', quantity: '2', itemCategory: 'L' }
              ]
            }
          })
        });
      });

      // Mock chat API action for delete proposal
      await page.route('**/api/chat', async (route) => {
        const req = route.request();
        let body = {};
        try { body = req.postDataJSON() || {}; } catch (_) {}

        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            reply: 'Confirm permanent deletion of BOM for A1BH0214C.',
            proposedAction: {
              actionId: 'act_del_123',
              type: 'delete_bom',
              entityKey: 'bom',
              expiresAt: Date.now() + 300000,
              preview: {
                material: 'A1BH0214C',
                plant: '1010',
                alternativeBom: '01',
                bomUsage: '1',
                riskLevel: 3
              }
            }
          })
        });
      });

      // ------------------------------------------------------------------
      // 1. DELETE BOM CONFIRMATION SCREEN
      // ------------------------------------------------------------------
      await page.goto('/products/bom/delete');
      await page.waitForLoadState('networkidle');

      // Wait for delete form material input
      await page.waitForSelector('#delMaterial', { state: 'visible', timeout: 10000 });
      await page.locator('#delMaterial').fill('A1BH0214C');

      const plantInput = page.locator('#delPlant');
      if (await plantInput.isVisible()) {
        await plantInput.fill('1010');
      }

      const altInput = page.locator('#delAlternativeBom');
      if (await altInput.isVisible()) {
        await altInput.fill('01');
      }

      const usageInput = page.locator('#delBomUsage');
      if (await usageInput.isVisible()) {
        await usageInput.fill('1');
      }

      // Click "Proceed" to trigger Safety Gate proposal
      const proceedBtn = page.getByRole('button', { name: /proceed/i }).first();
      await proceedBtn.click();

      // Wait for confirmation gate card
      const proposalCard = page.locator('.sap-confirm-card');
      await expect(proposalCard).toBeVisible({ timeout: 5000 });

      // Check header icon / badge color is NOT amber/orange
      const confirmHeader = page.locator('.sap-confirm-header');
      await expect(confirmHeader).toBeVisible();

      const headerIcon = confirmHeader.locator('svg').first();
      const iconColor = await headerIcon.evaluate((el) => {
        const cs = window.getComputedStyle(el);
        return cs.color || cs.stroke || cs.fill;
      });
      expect(isAmberOrOrange(iconColor)).toBe(false);

      // Check timer pill color is NOT amber/orange
      const timerBadge = confirmHeader.locator('.sap-badge-timer');
      if (await timerBadge.isVisible()) {
        const timerBg = await timerBadge.evaluate((el) => window.getComputedStyle(el).backgroundColor);
        expect(isAmberOrOrange(timerBg)).toBe(false);
      }

      // Check safety gate banner above card
      const safetyGateBanner = page.locator('.sap-proposal-header-card');
      if (await safetyGateBanner.isVisible()) {
        const bannerBg = await safetyGateBanner.evaluate((el) => window.getComputedStyle(el).backgroundColor);
        expect(isAmberOrOrange(bannerBg)).toBe(false);
      }

      // Check parameter table
      const paramTable = page.locator('[data-testid="delete-bom-param-table"]');
      await expect(paramTable).toBeVisible();
      const cells = paramTable.locator('tbody tr td');
      await expect(cells.nth(0)).toContainText('A1BH0214C');
      await expect(cells.nth(1)).toContainText('1010');
      await expect(cells.nth(2)).toContainText('01');
      await expect(cells.nth(3)).toContainText('1');

      // Check Confirm Delete BOM button is initially disabled
      const confirmDeleteBtn = page.getByRole('button', { name: /confirm delete bom/i });
      await expect(confirmDeleteBtn).toBeDisabled();

      // Screenshot Delete Confirmation screen
      const deleteShotPath = path.resolve(screenshotsDir, `delete-confirmation-${viewport.name}.png`);
      const deleteArtifactPath = path.resolve(artifactDir, `delete-confirmation-${viewport.name}.png`);
      await page.screenshot({ path: deleteShotPath, fullPage: true });
      if (fs.existsSync(deleteShotPath)) {
        fs.copyFileSync(deleteShotPath, deleteArtifactPath);
      }

      // ------------------------------------------------------------------
      // 2. ADMIN POPUPS: Create User, Edit User, Add Server, Edit Server, Delete Server
      // ------------------------------------------------------------------
      await page.goto('/admin');
      await page.waitForLoadState('networkidle');

      // Click "Users" tab if not active
      const usersTab = page.getByRole('button', { name: /users/i }).first();
      if (await usersTab.isVisible()) {
        await usersTab.click();
      }

      // 2a. Create User popup
      const addUserBtn = page.getByRole('button', { name: /add user|new user|create user/i }).first();
      if (await addUserBtn.isVisible()) {
        await addUserBtn.click();
        const userModal = page.locator('.sap-modal-card');
        await expect(userModal).toBeVisible({ timeout: 5000 });

        const modalIconBadge = userModal.locator('.sap-bulk-icon-badge').first();
        if (await modalIconBadge.isVisible()) {
          const badgeBg = await modalIconBadge.evaluate((el) => window.getComputedStyle(el).backgroundColor);
          expect(isAmberOrOrange(badgeBg)).toBe(false);
        }

        const createUserShot = path.resolve(screenshotsDir, `create-user-modal-${viewport.name}.png`);
        const createUserArt = path.resolve(artifactDir, `create-user-modal-${viewport.name}.png`);
        await page.screenshot({ path: createUserShot, fullPage: true });
        if (fs.existsSync(createUserShot)) fs.copyFileSync(createUserShot, createUserArt);

        // Close modal
        const closeBtn = userModal.locator('.sap-modal-close-btn, button[title*="Close" i]').first();
        await closeBtn.click();
      }

      // 2b. Set Password popup (User Action)
      const setPasswordBtn = page.getByRole('button', { name: /set password/i }).first();
      if (await setPasswordBtn.isVisible()) {
        await setPasswordBtn.click();
        const pwdModal = page.locator('.sap-modal-card');
        await expect(pwdModal).toBeVisible({ timeout: 5000 });

        const modalIconBadge = pwdModal.locator('.sap-bulk-icon-badge').first();
        if (await modalIconBadge.isVisible()) {
          const badgeBg = await modalIconBadge.evaluate((el) => window.getComputedStyle(el).backgroundColor);
          expect(isAmberOrOrange(badgeBg)).toBe(false);
        }

        const editUserShot = path.resolve(screenshotsDir, `edit-user-modal-${viewport.name}.png`);
        const editUserArt = path.resolve(artifactDir, `edit-user-modal-${viewport.name}.png`);
        await page.screenshot({ path: editUserShot, fullPage: true });
        if (fs.existsSync(editUserShot)) fs.copyFileSync(editUserShot, editUserArt);

        const closeBtn = pwdModal.locator('.sap-modal-close-btn, button[title*="Close" i]').first();
        await closeBtn.click();
      }

      // 2c. Switch to SAP Servers tab
      const serversTab = page.getByRole('button', { name: /sap servers|servers/i }).first();
      if (await serversTab.isVisible()) {
        await serversTab.click();
      }

      // Add Server popup
      const addServerBtn = page.getByRole('button', { name: /add server|new server|add sap server/i }).first();
      if (await addServerBtn.isVisible()) {
        await addServerBtn.click();
        const serverModal = page.locator('.sap-modal-card');
        await expect(serverModal).toBeVisible({ timeout: 5000 });

        const modalIconBadge = serverModal.locator('.sap-bulk-icon-badge').first();
        if (await modalIconBadge.isVisible()) {
          const badgeBg = await modalIconBadge.evaluate((el) => window.getComputedStyle(el).backgroundColor);
          expect(isAmberOrOrange(badgeBg)).toBe(false);
        }

        const addServerShot = path.resolve(screenshotsDir, `add-server-modal-${viewport.name}.png`);
        const addServerArt = path.resolve(artifactDir, `add-server-modal-${viewport.name}.png`);
        await page.screenshot({ path: addServerShot, fullPage: true });
        if (fs.existsSync(addServerShot)) fs.copyFileSync(addServerShot, addServerArt);

        const closeBtn = serverModal.locator('.sap-modal-close-btn, button[title*="Close" i]').first();
        await closeBtn.click();
      }

      // Edit Server popup
      const editServerBtn = page.locator('button[title*="Edit Server" i], button[aria-label*="Edit Server" i]').first();
      if (await editServerBtn.isVisible()) {
        await editServerBtn.click();
        const serverModal = page.locator('.sap-modal-card');
        await expect(serverModal).toBeVisible({ timeout: 5000 });

        const modalIconBadge = serverModal.locator('.sap-bulk-icon-badge').first();
        if (await modalIconBadge.isVisible()) {
          const badgeBg = await modalIconBadge.evaluate((el) => window.getComputedStyle(el).backgroundColor);
          expect(isAmberOrOrange(badgeBg)).toBe(false);
        }

        const editServerShot = path.resolve(screenshotsDir, `edit-server-modal-${viewport.name}.png`);
        const editServerArt = path.resolve(artifactDir, `edit-server-modal-${viewport.name}.png`);
        await page.screenshot({ path: editServerShot, fullPage: true });
        if (fs.existsSync(editServerShot)) fs.copyFileSync(editServerShot, editServerArt);

        const closeBtn = serverModal.locator('.sap-modal-close-btn, button[title*="Close" i]').first();
        await closeBtn.click();
      }

      // Delete Server popup
      const deleteServerBtn = page.locator('button[title*="Delete Server" i], button[aria-label*="Delete Server" i]').first();
      if (await deleteServerBtn.isVisible()) {
        await deleteServerBtn.click();
        const confirmModal = page.locator('.sap-modal-card');
        await expect(confirmModal).toBeVisible({ timeout: 5000 });

        const modalIconBadge = confirmModal.locator('.sap-bulk-icon-badge').first();
        if (await modalIconBadge.isVisible()) {
          const badgeBg = await modalIconBadge.evaluate((el) => window.getComputedStyle(el).backgroundColor);
          expect(isAmberOrOrange(badgeBg)).toBe(false);
        }

        const deleteServerShot = path.resolve(screenshotsDir, `delete-server-modal-${viewport.name}.png`);
        const deleteServerArt = path.resolve(artifactDir, `delete-server-modal-${viewport.name}.png`);
        await page.screenshot({ path: deleteServerShot, fullPage: true });
        if (fs.existsSync(deleteServerShot)) fs.copyFileSync(deleteServerShot, deleteServerArt);

        const cancelBtn = confirmModal.getByRole('button', { name: /cancel/i }).first();
        await cancelBtn.click();
      }

      // ------------------------------------------------------------------
      // 3. F4 POPUP: Plant Value Help
      // ------------------------------------------------------------------
      await page.goto('/products/bom/delete');
      await page.waitForLoadState('networkidle');

      // Click Plant F4 button in the Plant FieldWrapper
      const plantField = page.locator('.rx-field-wrapper:has(#delPlant), div:has(> #delPlant)');
      const plantF4Btn = plantField.locator('.rx-value-help-btn').first();
      await expect(plantF4Btn).toBeVisible({ timeout: 5000 });
      await plantF4Btn.click();

      const f4Dialog = page.locator('.sap-f4-modal-dialog');
      await expect(f4Dialog).toBeVisible({ timeout: 5000 });

      const f4Header = f4Dialog.locator('.sap-f4-header').first();
      const headerBg = await f4Header.evaluate((el) => window.getComputedStyle(el).backgroundColor);
      expect(isAmberOrOrange(headerBg)).toBe(false);

      const plantF4Shot = path.resolve(screenshotsDir, `plant-f4-modal-${viewport.name}.png`);
      const plantF4Art = path.resolve(artifactDir, `plant-f4-modal-${viewport.name}.png`);
      await page.screenshot({ path: plantF4Shot, fullPage: true });
      if (fs.existsSync(plantF4Shot)) fs.copyFileSync(plantF4Shot, plantF4Art);

      const f4Close = f4Dialog.locator('.sap-f4-header-close, button[aria-label*="Cancel" i]').first();
      await f4Close.click();
    });
  }
});
