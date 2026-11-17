const { PNG } = require('../../node_modules/playwright-core/lib/utilsBundle.js');

function calculatePixelDiff(baselineBuf, currentBuf) {
  const baseImg = PNG.sync.read(baselineBuf);
  const currImg = PNG.sync.read(currentBuf);

  if (baseImg.width !== currImg.width || baseImg.height !== currImg.height) {
    return {
      match: false,
      diffPixels: -1,
      totalPixels: -1,
      diffRatio: 1,
      diffPercent: 100,
      reason: `Dimension mismatch: baseline (${baseImg.width}x${baseImg.height}) vs current (${currImg.width}x${currImg.height})`
    };
  }

  const totalPixels = baseImg.width * baseImg.height;
  let diffPixels = 0;

  for (let i = 0; i < baseImg.data.length; i += 4) {
    const dr = Math.abs(baseImg.data[i] - currImg.data[i]);
    const dg = Math.abs(baseImg.data[i + 1] - currImg.data[i + 1]);
    const db = Math.abs(baseImg.data[i + 2] - currImg.data[i + 2]);
    const da = Math.abs(baseImg.data[i + 3] - currImg.data[i + 3]);

    if (dr > 5 || dg > 5 || db > 5 || da > 5) {
      diffPixels++;
    }
  }

  const diffRatio = diffPixels / totalPixels;
  return {
    match: diffRatio <= 0.001,
    diffPixels,
    totalPixels,
    diffRatio,
    diffPercent: diffRatio * 100
  };
}

module.exports = {
  calculatePixelDiff
};
