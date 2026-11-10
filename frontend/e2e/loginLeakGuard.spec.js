import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { setupMocks } from './helpers/mockApi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const screenshotsDir = path.resolve(__dirname, '../screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

function decodePng(buf) {
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const colorType = buf[25];
  const bpp = colorType === 6 ? 4 : 3;
  const idatChunks = [];
  let pos = 8;
  while (pos < buf.length) {
    const chunkLen = buf.readUInt32BE(pos);
    const chunkType = buf.toString('ascii', pos + 4, pos + 8);
    if (chunkType === 'IDAT') {
      idatChunks.push(buf.slice(pos + 8, pos + 8 + chunkLen));
    }
    pos += 8 + chunkLen + 4;
  }
  const compressed = Buffer.concat(idatChunks);
  const raw = zlib.inflateSync(compressed);

  const rowBytes = width * bpp;
  const stride = rowBytes + 1;
  const rgb = Buffer.alloc(width * height * bpp);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * stride];
    const prevRowOffset = (y - 1) * rowBytes;
    const curRowOffset = y * rowBytes;
    const inRowOffset = y * stride + 1;
    for (let x = 0; x < rowBytes; x++) {
      const a = x >= bpp ? rgb[curRowOffset + x - bpp] : 0;
      const b = y > 0 ? rgb[prevRowOffset + x] : 0;
      const c = (x >= bpp && y > 0) ? rgb[prevRowOffset + x - bpp] : 0;
      const val = raw[inRowOffset + x];
      let rawVal = 0;
      if (filter === 0) rawVal = val;
      else if (filter === 1) rawVal = (val + a) & 0xff;
      else if (filter === 2) rawVal = (val + b) & 0xff;
      else if (filter === 3) rawVal = (val + Math.floor((a + b) / 2)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        let pr = c;
        if (pa <= pb && pa <= pc) pr = a;
        else if (pb <= pc) pr = b;
        rawVal = (val + pr) & 0xff;
      }
      rgb[curRowOffset + x] = rawVal;
    }
  }
  return { width, height, bpp, rgb };
}

test.describe('Login Style Leak Guard Suite', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await setupMocks(page, { authenticated: true, role: 'admin' });
  });

  const views = [
    {
      name: 'home',
      url: '/home',
      waitFor: async (page) => {
        await page.waitForSelector('.rexa-home-page', { state: 'visible' });
        await page.waitForSelector('.rx-welcome-subtitle', { state: 'visible' });
        await expect(page.locator('.rx-welcome-subtitle')).toContainText('Connected to SAP DEV 01');
      }
    },
    {
      name: 'create-bom',
      url: '/products/bom/create/single',
      waitFor: async (page) => {
        await page.waitForSelector('#createBomMaterial', { state: 'visible' });
      }
    },
    {
      name: 'copy-bom',
      url: '/products/bom/copy/single',
      waitFor: async (page) => {
        await page.waitForSelector('#sourceMaterial', { state: 'visible' });
      }
    },
    {
      name: 'delete-bom',
      url: '/products/bom/delete',
      waitFor: async (page) => {
        await page.waitForSelector('#delMaterial', { state: 'visible' });
      }
    },
    {
      name: 'admin-users',
      url: '/admin/users',
      waitFor: async (page) => {
        await page.waitForSelector('.fiori-ph-title', { state: 'visible' });
        await page.waitForSelector('table tbody tr', { state: 'visible' });
      }
    }
  ];

  test('Verify leak guard against baselines @leak', async ({ page }, testInfo) => {
    const vp = testInfo.project.name;
    if (vp !== '1366x768' && vp !== '1920x1080') {
      test.skip();
      return;
    }

    const isCapture = process.env.CAPTURE_LEAK_BASELINES === '1';

    for (const v of views) {
      await page.goto(v.url, { waitUntil: 'networkidle' });
      await v.waitFor(page);
      await page.mouse.move(0, 0);
      await page.waitForTimeout(500);

      const shotPath = path.join(screenshotsDir, `leak-baseline-${v.name}-${vp}.png`);
      if (isCapture || !fs.existsSync(shotPath)) {
        await page.screenshot({ path: shotPath, fullPage: true });
      } else {
        const baselineBuf = fs.readFileSync(shotPath);
        const currentBuf = await page.screenshot({ fullPage: true });
        const bDec = decodePng(baselineBuf);
        const cDec = decodePng(currentBuf);
        expect(bDec.width).toBe(cDec.width);
        expect(bDec.height).toBe(cDec.height);

        let diffs = 0;
        const rowBytes = bDec.width * bDec.bpp;
        for (let y = 60; y < bDec.height; y++) {
          const rowOffset = y * rowBytes;
          for (let x = 0; x < bDec.width; x++) {
            const p = rowOffset + x * bDec.bpp;
            const dr = Math.abs(bDec.rgb[p] - cDec.rgb[p]);
            const dg = Math.abs(bDec.rgb[p + 1] - cDec.rgb[p + 1]);
            const db = Math.abs(bDec.rgb[p + 2] - cDec.rgb[p + 2]);
            if (dr > 1 || dg > 1 || db > 1) {
              diffs++;
            }
          }
        }
        console.log(`[${vp}] View ${v.name}: diffs = ${diffs}`);
        // Allow <= 50 pixels for forms/tables; allow <= 1000 pixels (0.09%) strictly for SVG hero pattern jitter on Home
        const allowedDiffs = v.name === 'home' ? 1000 : 50;
        expect(diffs).toBeLessThanOrEqual(allowedDiffs);
      }
    }

    // F4 Popup modal check
    await page.goto('/products/bom/create/single', { waitUntil: 'networkidle' });
    await page.waitForSelector('#createBomMaterial', { state: 'visible' });
    const matContainer = page.locator('#createBomMaterial').locator('..');
    const matF4Btn = matContainer.locator('button.rx-value-help-btn, button[title*="F4"], button[aria-label="Search help"]');
    await matF4Btn.click();
    const restrictDialog = page.locator('.sap-restrict-modal-dialog, .sap-restrict-dialog').first();
    await expect(restrictDialog).toBeVisible();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(500);

    const f4ShotPath = path.join(screenshotsDir, `leak-baseline-f4-popup-${vp}.png`);
    if (isCapture || !fs.existsSync(f4ShotPath)) {
      await page.screenshot({ path: f4ShotPath, fullPage: true });
    } else {
      const baselineBuf = fs.readFileSync(f4ShotPath);
      const currentBuf = await page.screenshot({ fullPage: true });
      const bDec = decodePng(baselineBuf);
      const cDec = decodePng(currentBuf);
      expect(bDec.width).toBe(cDec.width);
      expect(bDec.height).toBe(cDec.height);

      let diffs = 0;
      const rowBytes = bDec.width * bDec.bpp;
      for (let y = 60; y < bDec.height; y++) {
        const rowOffset = y * rowBytes;
        for (let x = 0; x < bDec.width; x++) {
          const p = rowOffset + x * bDec.bpp;
          const dr = Math.abs(bDec.rgb[p] - cDec.rgb[p]);
          const dg = Math.abs(bDec.rgb[p + 1] - cDec.rgb[p + 1]);
          const db = Math.abs(bDec.rgb[p + 2] - cDec.rgb[p + 2]);
          if (dr > 1 || dg > 1 || db > 1) {
            diffs++;
          }
        }
      }
      console.log(`[${vp}] View f4-popup: diffs = ${diffs}`);
      expect(diffs).toBeLessThanOrEqual(50);
    }
  });
});
