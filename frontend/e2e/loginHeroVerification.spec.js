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
if (!fs.existsSync(artifactDir)) {
  fs.mkdirSync(artifactDir, { recursive: true });
}

const VIEWPORTS = [
  { width: 1024, height: 768, name: '1024x768' },
  { width: 1366, height: 768, name: '1366x768' },
  { width: 1920, height: 1080, name: '1920x1080' },
  { width: 2560, height: 1440, name: '2560x1440' }
];

const BASELINE_1920_HEADLINE_Y = 368.203125;
const BASELINE_1920_CARD_Y = 296.203125;

test.describe('Login Hero Panel Redesign Verification', () => {
  for (const vp of VIEWPORTS) {
    test(`Login left panel across viewport ${vp.name}`, async ({ page }) => {
      await setupMocks(page, { authenticated: false });
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/', { waitUntil: 'networkidle' });
      await page.waitForSelector('.login-page', { state: 'visible' });

      // 1. Assert NO element with old workflow card classes or text
      const oldPreview = page.locator('.lg-preview-container, .lg-preview-card-front, .lg-preview-card-back');
      await expect(oldPreview).toHaveCount(0);
      await expect(page.locator('text="BOM creation workflow"')).toHaveCount(0);
      await expect(page.locator('text="Completed"')).toHaveCount(0);

      // 2. Assert left brand panel, logo, headline, tagline, chips, and footer are visible
      const brandPanel = page.locator('.lg-brand-panel');
      await expect(brandPanel).toBeVisible();

      const logoImg = page.locator('.lg-logo-img');
      await expect(logoImg).toBeVisible();

      const headline = page.locator('.lg-headline');
      await expect(headline).toBeVisible();
      await expect(headline).toHaveText('SAP operations hub');

      const chips = page.locator('.lg-chip');
      await expect(chips).toHaveCount(3);

      const footer = page.locator('.lg-brand-footer');
      await expect(footer).toBeVisible();
      await expect(footer).toContainText('RexaEdge ERP Platform');

      // 3. Assert the three capability rows exist and are fully visible
      const capList = page.locator('.lg-capabilities-list');
      await expect(capList).toBeVisible();

      const capRows = page.locator('.lg-capability-row');
      await expect(capRows).toHaveCount(3);

      const titles = page.locator('.lg-capability-title');
      await expect(titles.nth(0)).toHaveText('Validated before every create');
      await expect(titles.nth(1)).toHaveText('Access you control');
      await expect(titles.nth(2)).toHaveText('Complete audit trail');

      const descs = page.locator('.lg-capability-desc');
      await expect(descs.nth(0)).toHaveText('Every BOM is checked against SAP master data first.');
      await expect(descs.nth(1)).toHaveText('Permissions per user and per SAP server.');
      await expect(descs.nth(2)).toHaveText('Every action is logged for review.');

      // Check no clipping or overlap: capability list bottom must be strictly above footer top
      const capBox = await capList.boundingBox();
      const footerBox = await footer.boundingBox();
      expect(capBox).not.toBeNull();
      expect(footerBox).not.toBeNull();
      expect(capBox.y + capBox.height).toBeLessThan(footerBox.y);

      // Footer bottom must not exceed viewport height
      expect(footerBox.y + footerBox.height).toBeLessThanOrEqual(vp.height);

      // 4. Assert no horizontal overflow
      const scrollDimensions = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        innerWidth: window.innerWidth
      }));
      expect(scrollDimensions.scrollWidth).toBeLessThanOrEqual(scrollDimensions.innerWidth);

      // 5. Position assertion at 1920x1080: within 2px of baseline
      if (vp.name === '1920x1080') {
        const headlineBox = await headline.boundingBox();
        const card = page.locator('.lg-card');
        const cardBox = await card.boundingBox();

        expect(headlineBox).not.toBeNull();
        expect(cardBox).not.toBeNull();

        const headlineDiff = Math.abs(headlineBox.y - BASELINE_1920_HEADLINE_Y);
        const cardDiff = Math.abs(cardBox.y - BASELINE_1920_CARD_Y);

        console.log(`1920x1080 Headline Y: ${headlineBox.y} (diff: ${headlineDiff.toFixed(3)}px)`);
        console.log(`1920x1080 Card Y: ${cardBox.y} (diff: ${cardDiff.toFixed(3)}px)`);

        expect(headlineDiff).toBeLessThanOrEqual(2.0);
        expect(cardDiff).toBeLessThanOrEqual(2.0);
      }

      // Save screenshot for review
      const shotName = `login-hero-${vp.name}.png`;
      const shotPathLocal = path.join(screenshotsDir, shotName);
      const shotPathArtifact = path.join(artifactDir, shotName);
      await page.screenshot({ path: shotPathLocal, fullPage: true });
      fs.copyFileSync(shotPathLocal, shotPathArtifact);
    });
  }
});
