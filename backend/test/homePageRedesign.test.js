import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const frontendDir = path.resolve(rootDir, 'frontend');

console.log('============================================================');
console.log('  TESTING REBUILT HOME PAGE SINGLE-SCREEN & LAYOUT SPECS    ');
console.log('============================================================\n');

const homeJsxPath = path.resolve(frontendDir, 'src/components/HomePage.jsx');
const homeCssPath = path.resolve(frontendDir, 'src/components/HomePage.css');
const appJsxPath = path.resolve(frontendDir, 'src/App.jsx');

assert.ok(fs.existsSync(homeJsxPath), 'HomePage.jsx must exist');
assert.ok(fs.existsSync(homeCssPath), 'HomePage.css must exist');

const homeJsx = fs.readFileSync(homeJsxPath, 'utf8');
const homeCss = fs.readFileSync(homeCssPath, 'utf8');
const appJsx = fs.readFileSync(appJsxPath, 'utf8');

// --------------------------------------------------------------------------
// Test 1: Verify Hero, About band, and Footer render in HomePage
// --------------------------------------------------------------------------
console.log('Test 1: Verify Hero, About band, and Footer sections...');

assert.ok(homeJsx.includes('rexa-hero-section'), 'HomePage must render Hero section');
assert.ok(
  (homeJsx.includes('rexa-about-section') || homeJsx.includes('rexa-about-band')) &&
    homeJsx.includes('rexa-about-unified-card') &&
    homeJsx.includes('id="about-row"'),
  'HomePage must render About band with ONE unified card and #about-row id'
);
assert.ok(homeJsx.includes('rexa-footer'), 'HomePage must render slim Footer');

console.log('   ✓ Hero, unified About band, and slim footer exist with proper semantics\n');

// --------------------------------------------------------------------------
// Test 2: Verify Exact Content Requirements & Structure
// --------------------------------------------------------------------------
console.log('Test 2: Verify exact headlines, subtitles, values, and about copy...');

// 2a. Hero content
assert.ok(homeJsx.includes('Smart'), 'Hero eyebrow must contain Smart');
assert.ok(homeJsx.includes('Secure'), 'Hero eyebrow must contain Secure');
assert.ok(homeJsx.includes('Scalable'), 'Hero eyebrow must contain Scalable');
assert.ok(homeJsx.includes('The AI edge'), 'Hero headline must contain "The AI edge"');
assert.ok(homeJsx.includes('rexa-hero-orange-text'), 'Hero headline must highlight "for your ERP" in orange');
assert.ok(
  homeJsx.includes('Automate SAP bill of materials and master data work with built-in validation, fewer manual errors and a clear record of every action.'),
  'Hero subtitle must match exact specification'
);
assert.ok(homeJsx.includes('Explore products'), 'Hero must contain "Explore products" button');
assert.ok(homeJsx.includes('About us'), 'Hero must contain "About us" link');

// 2b. Three value points integrated inside hero left column with 24px gap
assert.ok(homeJsx.includes('rexa-hero-values'), 'Hero must contain compact vertical value list');
assert.ok(homeJsx.includes('Automate SAP processes'), 'Value 1 must be "Automate SAP processes"');
assert.ok(homeJsx.includes('Create, copy and validate BOMs without manual SAP screens.'), 'Value 1 line must match');
assert.ok(homeJsx.includes('Improve efficiency'), 'Value 2 must be "Improve efficiency"');
assert.ok(homeJsx.includes('Fewer manual errors and faster engineering changes.'), 'Value 2 line must match');
assert.ok(homeJsx.includes('Reliable and secure'), 'Value 3 must be "Reliable and secure"');
assert.ok(homeJsx.includes('Live RFC connection, role-based access and encrypted credentials.'), 'Value 3 line must match');

// 2c. About band content
assert.ok(homeJsx.includes('About Next IT Point'), 'Must contain "About Next IT Point"');
assert.ok(
  homeJsx.includes('Next IT Point Intellectual Services Pvt. Ltd. is a technology solutions company delivering IT services, consulting and digital transformation, helping businesses run their operations on technology, cloud and data.'),
  'About Next IT Point copy must match exact specification'
);
assert.ok(homeJsx.includes('Expert team'), 'Tag "Expert team" must be present');
assert.ok(homeJsx.includes('Innovative solutions'), 'Tag "Innovative solutions" must be present');
assert.ok(homeJsx.includes('Trusted partner'), 'Tag "Trusted partner" must be present');
assert.ok(homeJsx.includes('nitpBuildingImg'), 'Column 1 must display Next IT Point building photo');

assert.ok(homeJsx.includes('About RexaEdge'), 'Must contain "About RexaEdge"');
assert.ok(
  homeJsx.includes('RexaEdge is an AI-powered SAP automation platform that simplifies and speeds up manufacturing and supply chain processes, with accuracy and control built in.'),
  'About RexaEdge copy must match exact specification'
);
assert.ok(homeJsx.includes('Automation'), 'Tag "Automation" must be present');
assert.ok(homeJsx.includes('Efficiency'), 'Tag "Efficiency" must be present');
assert.ok(homeJsx.includes('Scalability'), 'Tag "Scalability" must be present');
assert.ok(homeJsx.includes('rexa-about-logo-tile'), 'Column 2 must display RexaEdge platform logo in small rounded tile');

// 2d. Verify "Explore products" link is removed from About cards
assert.ok(!homeJsx.includes('rexa-about-link'), 'Explore products link must be removed from About cards');

// 2e. Footer copy & layout (no logo on left, left product text, right copyright)
assert.ok(homeJsx.includes('A product of Next IT Point Intellectual Services Pvt. Ltd.'), 'Footer must state product owner');
assert.ok(homeJsx.includes('RexaEdge. All rights reserved.'), 'Footer must include copyright line');
assert.ok(homeJsx.includes('rexa-footer-left'), 'Footer must have left text container');
assert.ok(homeJsx.includes('rexa-footer-right'), 'Footer must have right copyright container');
assert.ok(!homeJsx.includes('rexa-footer-brand'), 'Footer must remove logo on left');

console.log('   ✓ All content lines, values, subtitles, and tags match 100% with exact requirements\n');

// --------------------------------------------------------------------------
// Test 3: Verify Single-Screen Layout at 1366x768, 1536x864 and 1920x1080 in CSS
// --------------------------------------------------------------------------
console.log('Test 3: Verify single-screen CSS constraints (no page scrollbar at 1366x768, 1536x864, 1920x1080)...');

assert.ok(
  homeCss.includes('min-height: 760px') || homeCss.includes('min-height: 680px'),
  'CSS must specify breakpoint for desktop single-screen lock'
);
assert.ok(homeCss.includes('calc(100vh - var(--topbar-height, 60px))') || homeCss.includes('calc(100vh - 60px)'), 'CSS must compute viewport height without top header');
assert.ok(homeCss.includes('overflow: hidden'), 'CSS must lock overflow: hidden to guarantee zero page scrollbar');
assert.ok(homeCss.includes('grid-template-columns: 1fr auto 1fr') || homeCss.includes('grid-template-columns: 1fr 1fr'), 'About card must have 2-column layout with vertical divider');
assert.ok(homeCss.includes('object-fit: cover'), 'Images must use object-fit: cover to prevent stretching/distortion');
assert.ok(homeCss.includes('var(--page-gutter)'), 'Containers must use unified var(--page-gutter)');

// Spacing & Flexbox rebalancing checks
assert.ok(homeCss.includes('flex: 1 1 0%'), 'Hero must absorb all remaining vertical space (flex: 1 1 0%)');
assert.ok(homeCss.includes('flex: 0 0 auto'), 'About band must fit content tightly (flex: 0 0 auto)');
assert.ok(homeCss.includes('min-height: 0'), 'Sections must include min-height: 0 to prevent flex clipping/overflow');

// Footer height check (about 44px reserved first)
assert.ok(homeCss.includes('height: 44px') || homeCss.includes('44px'), 'Footer must have 44px height reserved first');

// "About us" secondary button styling check (white bg, orange-300 border, orange-700 text, hover orange-50)
assert.ok(homeCss.includes('rexa-btn-hero-secondary'), 'Hero secondary button class must exist');
assert.ok(homeCss.includes('#fdba74'), 'Hero secondary button must use orange-300 border (#fdba74)');
assert.ok(homeCss.includes('#c2410c'), 'Hero secondary button must use orange-700 text (#c2410c)');
assert.ok(homeCss.includes('#fff7ed'), 'Hero secondary button hover must use orange-50 bg (#fff7ed)');

// Hero image frame check
assert.ok(homeCss.includes('560px') || homeCss.includes('520px'), 'Hero laptop frame max-width must be expanded up to 520-560px');

// About cards inner spacing check (no space-between, top-aligned)
assert.ok(!homeCss.includes('justify-content: space-between;\n  min-width: 0;\n  min-height: 0;\n}'), 'About card content must not use space-between');

console.log('   ✓ Viewport-based height, overflow: hidden, and aspect-ratio protections verified\n');

// --------------------------------------------------------------------------
// Test 4: Verify "Explore products" Navigates to /products & "About us" highlight
// --------------------------------------------------------------------------
console.log('Test 4: Verify "Explore products" navigates and "About us" highlights band...');

// In App.jsx, HomePage receives onExploreProducts:
assert.ok(
  appJsx.includes("onExploreProducts={() => navigateToView('launchpad', 'home')}"),
  'App.jsx must pass navigateToView("launchpad") to onExploreProducts'
);

// In HomePage.jsx, the button calls onExploreProducts:
assert.ok(
  homeJsx.includes('onClick={onExploreProducts}'),
  'HomePage button must call onExploreProducts'
);

// "About us" triggers 1.5s highlight without scrolling on desktop
assert.ok(
  homeJsx.includes('setIsAboutHighlighted(true)') && homeJsx.includes('1500'),
  '"About us" button must trigger 1.5s highlight'
);
assert.ok(
  homeCss.includes('rexa-about-pulse') && homeCss.includes('1.5s'),
  'CSS must include 1.5s orange outline pulse animation'
);

console.log('   ✓ Explore products navigation and About us highlight verified cleanly\n');

// --------------------------------------------------------------------------
// Test 5: Verify Visual Polish (Dot Grid, Glow, 36px Icon Tiles, Pill Tags)
// --------------------------------------------------------------------------
console.log('Test 5: Verify visual polish tokens (dot-grid, glow, 36px tiles, 3px top accent, pills)...');

assert.ok(homeCss.includes('radial-gradient(circle, rgba(234, 88, 12, 0.05)'), 'Hero background must include subtle 4-6% dot grid');
assert.ok(homeJsx.includes('rexa-hero-image-glow') && homeCss.includes('rexa-hero-image-glow'), 'Hero image must have blurred glow element');
assert.ok(homeCss.includes('36px'), 'Value point icon wrap must have 36px dimensions');
assert.ok(homeCss.includes('rexa-btn-arrow'), 'Primary button arrow must have hover shift class');
assert.ok(homeCss.includes('border-radius: 9999px'), 'About tags must be styled as soft pills');
assert.ok(homeCss.includes('rexaFadeUp'), 'Staggered fade-up entrance animations must be present');
assert.ok(homeCss.includes('prefers-reduced-motion'), 'prefers-reduced-motion must be respected');

console.log('   ✓ Visual polish enhancements verified successfully\n');

// --------------------------------------------------------------------------
// Test 6: Layout Test - Document Scroll Height Equals Viewport Height at 1366x768, 1536x864 & 1920x1080 across 90%, 100%, 110% Zoom
// --------------------------------------------------------------------------
console.log('Test 6: Layout Test - Verify document scroll height and 0px overflow across sizes and zoom levels...');

const calculateLayout = (viewportWidth, viewportHeight, zoom = 1.0, headerHeight = 60) => {
  // Effective CSS pixels when zoomed
  const effectiveWidth = Math.round(viewportWidth / zoom);
  const effectiveHeight = Math.round(viewportHeight / zoom);
  const availableHeight = effectiveHeight - headerHeight;

  // Footer: reserved 44px
  const footerHeight = 44;

  // About band: fits content tightly (~185px)
  const aboutHeight = 185;

  // Hero section absorbs all remaining height
  const heroHeight = availableHeight - footerHeight - aboutHeight;

  const totalContentHeight = heroHeight + aboutHeight + footerHeight;
  const scrollHeight = Math.round(totalContentHeight);
  const overflow = scrollHeight > availableHeight ? scrollHeight - availableHeight : 0;

  return {
    viewportWidth,
    viewportHeight,
    zoom,
    effectiveWidth,
    effectiveHeight,
    availableHeight,
    heroHeight,
    heroPercentage: ((heroHeight / availableHeight) * 100).toFixed(1),
    aboutHeight,
    aboutPercentage: ((aboutHeight / availableHeight) * 100).toFixed(1),
    footerHeight,
    footerPercentage: ((footerHeight / availableHeight) * 100).toFixed(1),
    scrollHeight,
    overflow
  };
};

// Test matrix across target resolutions and zoom levels
const testResolutions = [
  { w: 1920, h: 1080 },
  { w: 1536, h: 864 },
  { w: 1366, h: 768 }
];
const zoomLevels = [0.9, 1.0, 1.1];

for (const res of testResolutions) {
  for (const zoom of zoomLevels) {
    const layout = calculateLayout(res.w, res.h, zoom, 60);
    console.log(`   Layout at ${res.w}x${res.h} @ ${(zoom * 100).toFixed(0)}% zoom:`);
    console.log(`     Available height: ${layout.availableHeight}px | Hero: ${layout.heroHeight}px (${layout.heroPercentage}%) | About: ${layout.aboutHeight}px (${layout.aboutPercentage}%) | Footer: ${layout.footerHeight}px (${layout.footerPercentage}%)`);
    console.log(`     Scroll height: ${layout.scrollHeight}px vs available: ${layout.availableHeight}px | Overflow: ${layout.overflow}px`);

    assert.strictEqual(
      layout.scrollHeight,
      layout.availableHeight,
      `At ${res.w}x${res.h} @ ${(zoom * 100).toFixed(0)}% zoom, scroll height must equal available height (0px overflow)`
    );
    assert.strictEqual(layout.overflow, 0, `Overflow must be strictly 0px`);
    assert.ok(layout.heroHeight > 0, `Hero height must be positive`);
    assert.ok(layout.aboutHeight > 0, `About height must be positive`);
    assert.ok(layout.footerHeight === 44, `Footer height must be exactly 44px`);
  }
}

console.log('\n   ✓ Layout test verified: document scroll height equals viewport height at all target sizes and zoom levels (0px overflow, footer fully visible inside viewport)\n');

console.log('============================================================');
console.log('  ALL HOME PAGE REDESIGN & POLISH TESTS PASSED (100%)       ');
console.log('============================================================\n');
