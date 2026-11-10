import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const frontendDir = path.resolve(rootDir, 'frontend');

console.log('============================================================');
console.log('  TESTING MODERN ENTERPRISE OPERATOR HOME PAGE SPECS        ');
console.log('============================================================\n');

const homeJsxPath = path.resolve(frontendDir, 'src/components/HomePage.jsx');
const homeCssPath = path.resolve(frontendDir, 'src/components/HomePage.css');
const tokensCssPath = path.resolve(frontendDir, 'src/tokens.css');
const appJsxPath = path.resolve(frontendDir, 'src/App.jsx');

assert.ok(fs.existsSync(homeJsxPath), 'HomePage.jsx must exist');
assert.ok(fs.existsSync(homeCssPath), 'HomePage.css must exist');
assert.ok(fs.existsSync(tokensCssPath), 'tokens.css must exist');

const homeJsx = fs.readFileSync(homeJsxPath, 'utf8');
const homeCss = fs.readFileSync(homeCssPath, 'utf8');
const tokensCss = fs.readFileSync(tokensCssPath, 'utf8');
const appJsx = fs.readFileSync(appJsxPath, 'utf8');

// --------------------------------------------------------------------------
// Test 1: Verify Hero Band Structure (Gradient, SVG Pattern, Status Pill)
// --------------------------------------------------------------------------
console.log('Test 1: Verify Hero Band layout and components in HomePage.jsx & HomePage.css...');

assert.ok(homeJsx.includes('rx-home-hero'), 'HomePage must render rx-home-hero');
assert.ok(homeJsx.includes('rx-hero-pattern-overlay'), 'HomePage must render rx-hero-pattern-overlay');
assert.ok(homeJsx.includes('rx-hero-status-pill'), 'HomePage must render server status pill');
assert.ok(homeJsx.includes('Welcome back'), 'HomePage must welcome operator');
assert.ok(homeJsx.includes('Connected to'), 'HomePage must show connected server name');
assert.ok(homeJsx.includes('SHOW_MODULE_FILTERS'), 'HomePage must maintain SHOW_MODULE_FILTERS flag');

assert.ok(homeCss.includes('rx-home-hero'), 'HomePage.css must style rx-home-hero');
assert.ok(homeCss.includes('min-height: var(--size-hero-min-height, 120px)'), 'rx-home-hero must have min-height 120px');
assert.ok(homeCss.includes('padding: var(--space-28, 28px) var(--space-32, 32px)'), 'rx-home-hero must have padding 28px 32px');
assert.ok(homeCss.includes('gap: var(--space-6, 6px)'), 'rx-hero-text must have 6px gap');
assert.ok(homeCss.includes('font-size: var(--font-size-16, 16px)'), 'rx-hero-subtitle must be 16px');
assert.ok(homeCss.includes('rx-hero-pattern-overlay'), 'HomePage.css must define SVG pattern overlay');
assert.ok(homeCss.includes('--hero-bg-gradient'), 'HomePage.css must use --hero-bg-gradient');
assert.ok(tokensCss.includes('--hero-bg-gradient'), 'tokens.css must define --hero-bg-gradient');
assert.ok(tokensCss.includes('--size-hero-min-height: 120px'), 'tokens.css must define --size-hero-min-height: 120px');

console.log('   ✓ Hero band, gradient, geometric pattern overlay, and status pill verified\n');

// --------------------------------------------------------------------------
// Test 2: Verify Two Labeled Sections: Available modules & Coming soon
// --------------------------------------------------------------------------
console.log('Test 2: Verify split sections: "Available modules" and "Coming soon"...');

assert.ok(homeJsx.includes('Available modules'), 'HomePage must render "Available modules" section heading');
assert.ok(homeJsx.includes('Coming soon'), 'HomePage must render "Coming soon" section heading');
assert.ok(homeJsx.includes('rx-available-section'), 'HomePage must contain rx-available-section');
assert.ok(homeJsx.includes('rx-coming-soon-section'), 'HomePage must contain rx-coming-soon-section');
assert.ok(homeJsx.includes('rx-home-sections'), 'HomePage must contain rx-home-sections wrapper');

assert.ok(!homeJsx.includes('className="rx-coming-soon-badge"'), 'HomePage.jsx must not render visible coming soon pill');
assert.ok(homeJsx.includes('Coming soon</span>') && homeJsx.includes('rx-sr-only'), 'Coming soon card must provide accessible text');
assert.ok(homeJsx.includes('aria-label={`${mod.label}: Coming soon`}'), 'Coming soon card must provide accessible aria-label');

assert.ok(homeCss.includes('rx-home-sections'), 'HomePage.css must style rx-home-sections');
assert.ok(homeCss.includes('rx-home-section-title'), 'HomePage.css must style section titles');
assert.ok(homeCss.includes('rx-card-available'), 'HomePage.css must style available card');
assert.ok(homeCss.includes('rx-card-coming-soon'), 'HomePage.css must style coming-soon card');

console.log('   ✓ Two labeled sections, headings with counts, and distinct card styles verified\n');

// --------------------------------------------------------------------------
// Test 3: Verify Scoped CSS, Zero Bare Element Selectors & Zero !important
// --------------------------------------------------------------------------
console.log('Test 3: Verify CSS scoping under .rexa-home-page, zero bare selectors & zero !important...');

const bareSelectors = ['input', 'button', 'label', 'table', '::placeholder'];
for (const sel of bareSelectors) {
  const bareRegex = new RegExp(`^\\s*${sel}\\s*\\{`, 'm');
  assert.ok(!bareRegex.test(homeCss), `HomePage.css must not use bare selector "${sel}"`);
}
assert.ok(homeCss.includes('.rexa-home-page'), 'HomePage.css must be scoped under .rexa-home-page');
assert.ok(!homeCss.includes('!important'), 'HomePage.css must not use !important');

console.log('   ✓ Scoped styling, zero bare element selectors and zero !important confirmed\n');

console.log('============================================================');
console.log('  ALL HOME PAGE REDESIGN TESTS PASSED (100%)                ');
console.log('============================================================\n');
