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
  { width: 2560, height: 1440, name: '2560x1440' },
  { width: 2040, height: 1148, name: 'zoom-67pct' },
  { width: 1092, height: 614, name: 'zoom-125pct' }
];

test.describe('Login Hero Illustration & Left Panel Verification', () => {
  for (const vp of VIEWPORTS) {
    test(`Login left panel across viewport ${vp.name}`, async ({ page }) => {
      await setupMocks(page, { authenticated: false });
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/', { waitUntil: 'networkidle' });
      await page.waitForSelector('.login-page', { state: 'visible' });

      const brandPanel = page.locator('.lg-brand-panel');
      await expect(brandPanel).toBeVisible();

      // 1. Assert old world map and 3 pills are completely removed
      const oldMap = page.locator('.lg-map-container, .lg-map-svg, [data-testid="lg-india-home-marker"], .lg-chips-row, .lg-chip');
      await expect(oldMap).toHaveCount(0);
      await expect(page.locator('text="Production planning"')).toHaveCount(0);
      await expect(page.locator('text="Master data"')).toHaveCount(0);
      await expect(page.locator('text="Procurement"')).toHaveCount(0);

      // 2. Assert Hero Illustration inline SVG exists and is visible
      const illustrationWrap = page.locator('.lg-illustration-wrap');
      await expect(illustrationWrap).toBeVisible();

      const heroSvg = page.locator('.lg-hero-svg');
      await expect(heroSvg).toBeVisible();
      await expect(heroSvg).toHaveAttribute('viewBox', '0 0 560 410');

      // Assert no text node contains "SAP" brand marks or shapes inside the illustration
      const svgTexts = await heroSvg.locator('text').allTextContents();
      expect(svgTexts.some(t => /SAP/i.test(t))).toBe(false);

      // 3. Assert 5 floating rounded-square glass icon tiles exist
      await expect(heroSvg.locator('[data-testid="lg-tile-database"]')).toBeVisible();
      await expect(heroSvg.locator('[data-testid="lg-tile-gear"]')).toBeVisible();
      await expect(heroSvg.locator('[data-testid="lg-tile-cart"]')).toBeVisible();
      await expect(heroSvg.locator('[data-testid="lg-tile-barchart"]')).toBeVisible();
      await expect(heroSvg.locator('[data-testid="lg-tile-clipboard"]')).toBeVisible();

      // 4. Assert brand copy and footer text
      const headline = page.locator('.lg-headline');
      await expect(headline).toBeVisible();
      await expect(headline).toHaveText('SAP operations hub');

      const tagline = page.locator('.lg-tagline');
      await expect(tagline).toBeVisible();
      await expect(tagline).toHaveText('Automate. Integrate. Execute.');

      const description = page.locator('.lg-description');
      await expect(description).toBeVisible();

      const footer = page.locator('.lg-brand-footer');
      await expect(footer).toBeVisible();
      await expect(footer).toHaveText('RexaEdge a product of - Next IT Point');

      // 5. Bounding box & non-intersection assertions
      const panelBox = await brandPanel.boundingBox();
      const headlineBox = await headline.boundingBox();
      const descBox = await description.boundingBox();
      const wrapBox = await illustrationWrap.boundingBox();
      const svgBox = await heroSvg.boundingBox();
      const footerBox = await footer.boundingBox();

      expect(panelBox).not.toBeNull();
      expect(headlineBox).not.toBeNull();
      expect(descBox).not.toBeNull();
      expect(wrapBox).not.toBeNull();
      expect(svgBox).not.toBeNull();
      expect(footerBox).not.toBeNull();

      // Heading bottom is top boundary; footer top is bottom boundary
      const headingBottom = descBox.y + descBox.height;
      const illustrationTop = svgBox.y;
      const illustrationBottom = svgBox.y + svgBox.height;
      const footerTop = footerBox.y;

      // Assert heading, illustration and footer do not intersect
      expect(illustrationTop).toBeGreaterThanOrEqual(headingBottom - 1);
      expect(illustrationBottom).toBeLessThanOrEqual(footerTop + 1);

      // Assert gaps above and below are balanced within 16px
      const gapAbove = illustrationTop - headingBottom;
      const gapBelow = footerTop - illustrationBottom;
      console.log(`[${vp.name}] gapAbove: ${gapAbove.toFixed(1)}px, gapBelow: ${gapBelow.toFixed(1)}px, svgW: ${svgBox.width.toFixed(1)}px, svgH: ${svgBox.height.toFixed(1)}px, panelW: ${panelBox.width.toFixed(1)}px`);
      expect(Math.abs(gapAbove - gapBelow)).toBeLessThanOrEqual(16);

      if (vp.name === '1366x768') {
        expect(gapAbove).toBeLessThanOrEqual(48);
        expect(gapBelow).toBeLessThanOrEqual(48);
        expect(svgBox.width).toBeGreaterThanOrEqual(panelBox.width * 0.55);
      }
      if (vp.name === '1920x1080') {
        expect(gapAbove).toBeLessThanOrEqual(80);
        expect(gapBelow).toBeLessThanOrEqual(80);
        expect(svgBox.width).toBeGreaterThanOrEqual(panelBox.width * 0.55);
      }

      // Assert illustration is fully inside the left panel
      expect(svgBox.x).toBeGreaterThanOrEqual(panelBox.x - 1);
      expect(svgBox.x + svgBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width + 1);
      expect(svgBox.y).toBeGreaterThanOrEqual(panelBox.y - 1);
      expect(svgBox.y + svgBox.height).toBeLessThanOrEqual(panelBox.y + panelBox.height + 1);

      // Assert footer is centered horizontally within 2px
      const panelCenterX = panelBox.x + panelBox.width / 2;
      const footerCenterX = footerBox.x + footerBox.width / 2;
      expect(Math.abs(footerCenterX - panelCenterX)).toBeLessThanOrEqual(2.0);

      // 6. Assert no horizontal scrollbar
      const scrollDimensions = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        innerWidth: window.innerWidth
      }));
      expect(scrollDimensions.scrollWidth).toBeLessThanOrEqual(scrollDimensions.innerWidth);

      // 7. Guard: No orange/amber hue in the left panel
      const hasAmber = await brandPanel.evaluate((panel) => {
        const elements = [panel, ...panel.querySelectorAll('*')];
        const rgbToHsl = (r, g, b) => {
          r /= 255; g /= 255; b /= 255;
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          let h = 0, s = 0, l = (max + min) / 2;
          if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
              case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
              case g: h = ((b - r) / d + 2) * 60; break;
              case b: h = ((r - g) / d + 4) * 60; break;
            }
          }
          return { h, s: s * 100, l: l * 100 };
        };

        const parseColor = (str) => {
          if (!str || str === 'none' || str === 'transparent') return null;
          const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          if (!m) return null;
          return { r: parseInt(m[1], 10), g: parseInt(m[2], 10), b: parseInt(m[3], 10) };
        };

        for (const el of elements) {
          // Exclude logo image
          if (el.tagName.toLowerCase() === 'img') continue;
          const style = window.getComputedStyle(el);
          const colorsToCheck = [style.color, style.backgroundColor, style.borderColor, style.fill, style.stroke];
          for (const c of colorsToCheck) {
            const rgb = parseColor(c);
            if (!rgb) continue;
            const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
            // Disallow warm orange/amber hues: hue 20-55 with saturation > 40% and lightness 20-90%
            if (hsl.h >= 20 && hsl.h <= 55 && hsl.s > 40 && hsl.l >= 20 && hsl.l <= 90) {
              return { hasAmber: true, tag: el.tagName, class: el.className, color: c, hsl };
            }
          }
        }
        return { hasAmber: false };
      });
      expect(hasAmber.hasAmber).toBe(false);

      // Save screenshot for review
      const shotName = `login-hero-${vp.name}.png`;
      const shotPathLocal = path.join(screenshotsDir, shotName);
      const shotPathArtifact = path.join(artifactDir, shotName);
      await page.screenshot({ path: shotPathLocal, fullPage: true });
      fs.copyFileSync(shotPathLocal, shotPathArtifact);
    });
  }

  test('Prefers-reduced-motion disables animations on hero illustration', async ({ page }) => {
    await setupMocks(page, { authenticated: false });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForSelector('.lg-hero-svg', { state: 'visible' });

    const tileAnim = await page.locator('.lg-hero-tile-top').evaluate(el => window.getComputedStyle(el).animationName);
    const arcAnim = await page.locator('.lg-hero-arc').first().evaluate(el => window.getComputedStyle(el).animationName);

    expect(tileAnim).toBe('none');
    expect(arcAnim).toBe('none');
  });
});
