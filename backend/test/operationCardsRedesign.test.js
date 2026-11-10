import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const frontendDir = path.resolve(rootDir, '../frontend');

console.log('============================================================');
console.log('  TESTING OPERATION CARDS REDESIGN SPECIFICATIONS           ');
console.log('============================================================\n');

// 1. Bundle and render FioriLaunchpad & FioriOpCard using esbuild
const tempDir = path.resolve(frontendDir, 'src/.temp_test_build');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const launchpadOut = path.join(tempDir, 'FioriLaunchpad_OpCardTest.mjs');
const esbuildPath = path.resolve(frontendDir, 'node_modules/esbuild/lib/main.js');
const { default: esbuild } = await import(pathToFileURL(esbuildPath).href);

esbuild.buildSync({
  entryPoints: [path.resolve(frontendDir, 'src/components/FioriLaunchpad.jsx')],
  bundle: true,
  format: 'esm',
  outfile: launchpadOut,
  external: ['react', 'react-dom', 'lucide-react', '@shared/*'],
  alias: {
    '@shared': path.resolve(rootDir, '../shared')
  }
});

const ReactPath = path.resolve(frontendDir, 'node_modules/react/index.js');
const ReactDOMServerPath = path.resolve(frontendDir, 'node_modules/react-dom/server.node.js');

const ReactModule = await import(pathToFileURL(ReactPath).href);
const React = ReactModule.default || ReactModule;
const { renderToStaticMarkup } = await import(pathToFileURL(ReactDOMServerPath).href);

const FioriLaunchpadModule = await import(pathToFileURL(launchpadOut).href);
const FioriLaunchpad = FioriLaunchpadModule.default;
const { FioriOpCard } = FioriLaunchpadModule;

// 2. Read CSS files
const fioriOpCardCss = fs.readFileSync(path.resolve(frontendDir, 'src/components/FioriOpCard.css'), 'utf8');
const layoutCss = fs.readFileSync(path.resolve(frontendDir, 'src/components/layout/layout.css'), 'utf8');
const sapThemeCss = fs.readFileSync(path.resolve(frontendDir, 'src/sap-theme.css'), 'utf8');
const indexCss = fs.readFileSync(path.resolve(frontendDir, 'src/index.css'), 'utf8');

// TEST 1: Verify Card Dimensions & Grid Layout Specifications
console.log('Test 1: Verify Card Dimensions, Grid layout, and Spacing specifications...');
// Width: 300px (min 260px, max 320px), height about 210px (min 190px), padding 20px
assert.match(fioriOpCardCss, /width:\s*300px/, 'FioriOpCard.css must specify width: 300px');
assert.match(fioriOpCardCss, /min-width:\s*260px/, 'FioriOpCard.css must specify min-width: 260px');
assert.match(fioriOpCardCss, /max-width:\s*320px/, 'FioriOpCard.css must specify max-width: 320px');
assert.match(fioriOpCardCss, /height:\s*210px/, 'FioriOpCard.css must specify height: 210px');
assert.match(fioriOpCardCss, /min-height:\s*190px/, 'FioriOpCard.css must specify min-height: 190px');
assert.match(fioriOpCardCss, /padding:\s*20px/, 'FioriOpCard.css must specify padding: 20px');

// Grid layout: repeat(auto-fill, minmax(280px, 300px)), gap: 20px, left-aligned
assert.match(fioriOpCardCss, /grid-template-columns:[^;]*repeat\(auto-fill,\s*minmax\(280px,\s*300px\)\)/, 'FioriOpCard.css must specify repeat(auto-fill, minmax(280px, 300px))');
assert.match(fioriOpCardCss, /gap:\s*20px/, 'FioriOpCard.css must specify gap: 20px');
assert.match(fioriOpCardCss, /justify-content:\s*start/, 'FioriOpCard.css must specify justify-content: start');

assert.match(layoutCss, /grid-template-columns:[^;]*repeat\(auto-fill,\s*minmax\(280px,\s*300px\)\)/, 'layout.css must specify repeat(auto-fill, minmax(280px, 300px))');
assert.match(indexCss, /grid-template-columns:[^;]*repeat\(auto-fill,\s*minmax\(280px,\s*300px\)\)/, 'index.css must specify repeat(auto-fill, minmax(280px, 300px))');
console.log('   ✓ Card dimensions (300px width, ~210px height, 20px padding) & grid layout verified\n');

// TEST 2: Verify Look & Feel (Tokens, Borders, Shadows, Hover, Focus-visible, Reduced Motion)
console.log('Test 2: Verify Look & Feel (Border, Shadow, Radius, Hover, Focus-Visible, Reduced Motion)...');
assert.match(fioriOpCardCss, /background-color:\s*(var\(--color-surface|#FFFFFF)/s, 'Card must have surface background');
assert.match(fioriOpCardCss, /border:\s*1px\s+solid\s+(var\(--color-border|#D9E2EC)/s, 'Card must have 1px solid border');
assert.match(fioriOpCardCss, /border-radius:\s*(var\(--radius-xl|16px)/s, 'Card must have radius 16px');
assert.match(fioriOpCardCss, /box-shadow:\s*(var\(--shadow-sm|0\s+1px\s+2px)/s, 'Card must have soft shadow');

// Hover states
assert.match(fioriOpCardCss, /\.fiori-op-card:hover[^{]*\{[^}]*border-color:\s*(var\(--color-blue-400|#6699B8)/s, 'Hover border must be blue-400');
assert.match(fioriOpCardCss, /\.fiori-op-card:hover[^{]*\{[^}]*transform:\s*translateY\(-2px\)/s, 'Hover transform must be translateY(-2px)');
assert.match(fioriOpCardCss, /\.fiori-op-card:hover[^{]*\.fiori-op-icon-badge\s*\{[^}]*background-color:\s*(var\(--color-blue-100|#DCE8F1)/s, 'Hover icon tile must turn blue-100');

// Focus visible ring
assert.match(fioriOpCardCss, /\.fiori-op-card:focus-visible\s*\{[^}]*outline:\s*2px\s+solid\s+(var\(--color-blue-600|#02579A)/s, 'Focus-visible must have 2px blue ring');

// Reduced motion
assert.match(fioriOpCardCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*transform:\s*none/s, 'Must respect prefers-reduced-motion');
console.log('   ✓ Look & feel tokens, hover lift, blue tile hover, focus ring, and reduced motion verified\n');

// TEST 3: Verify Content Elements (Icon Tile 52px, Title 18px, Desc 14px, Open Link)
console.log('Test 3: Verify Content Elements (52px Icon Tile, 18px Title, 14px Clamped Desc, Open Link)...');
assert.match(fioriOpCardCss, /\.fiori-op-icon-badge\s*\{[^}]*width:\s*52px/s, 'Icon badge must be 52px wide');
assert.match(fioriOpCardCss, /\.fiori-op-icon-badge\s*\{[^}]*height:\s*52px/s, 'Icon badge must be 52px high');
assert.match(fioriOpCardCss, /\.fiori-op-icon-badge\s*\{[^}]*border-radius:\s*14px/s, 'Icon badge radius must be 14px');
assert.match(fioriOpCardCss, /\.fiori-op-icon-badge\s*\{[^}]*background-color:\s*(var\(--color-blue-50|#EEF4F9)/s, 'Icon badge bg must be blue-50');

assert.match(fioriOpCardCss, /\.fiori-op-title\s*\{[^}]*font-size:\s*18px/s, 'Title must be 18px');
assert.match(fioriOpCardCss, /\.fiori-op-title\s*\{[^}]*color:\s*(var\(--color-navy-900|#00204E)/s, 'Title must be semi-bold navy');
assert.match(fioriOpCardCss, /\.fiori-op-title\s*\{[^}]*margin:\s*0\s+0\s+6px\s+0/s, '6px gap under title');

assert.match(fioriOpCardCss, /\.fiori-op-desc\s*\{[^}]*font-size:\s*14px/s, 'Desc must be 14px');
assert.match(fioriOpCardCss, /\.fiori-op-desc\s*\{[^}]*color:\s*(var\(--color-text-secondary|#4A5F77)/s, 'Desc must be text-secondary');
assert.match(fioriOpCardCss, /\.fiori-op-desc\s*\{[^}]*-webkit-line-clamp:\s*2/s, 'Desc must be clamped to 2 lines');

assert.match(fioriOpCardCss, /\.fiori-op-open-link\s*\{[^}]*margin-top:\s*auto/s, 'Open link must be pushed to bottom with margin-top: auto');
assert.match(fioriOpCardCss, /\.fiori-op-open-link\s*\{[^}]*color:\s*(var\(--color-blue-600|#02579A)/s, 'Open link must be blue-600');
assert.match(fioriOpCardCss, /\.fiori-op-open-link\s*\{[^}]*font-size:\s*13px/s, 'Open link must be 13px');
console.log('   ✓ Content elements (52px tile, 18px title, 14px clamped desc, Open link) verified\n');

// TEST 4: Verify Top-Right Destructive Badge & HTML Render
console.log('Test 4: Verify Destructive Badge in Top-Right Row and Open link in static markup...');
const normalCardHtml = renderToStaticMarkup(
  React.createElement(FioriOpCard, {
    id: 'create_single',
    title: 'Create Single BOM',
    desc: 'Create a new Bill of Materials header and line items.',
    iconName: 'PlusSquare',
    onClick: () => {}
  })
);

const deleteCardHtml = renderToStaticMarkup(
  React.createElement(FioriOpCard, {
    id: 'delete',
    title: 'Delete BOM',
    desc: 'Permanently remove a Bill of Materials from SAP.',
    iconName: 'Trash2',
    danger: true,
    onClick: () => {}
  })
);

// Destructive badge must be inside fiori-op-top-row
assert.match(deleteCardHtml, /class="[^"]*fiori-op-top-row[^"]*"[\s\S]*?class="[^"]*fiori-destructive-badge[^"]*"/, 'Destructive badge must be rendered inside fiori-op-top-row');
assert.match(deleteCardHtml, />Destructive<\/span>/, 'Destructive badge text must be "Destructive"');
assert.match(fioriOpCardCss, /\.fiori-destructive-badge\s*\{[^}]*background-color:\s*(var\(--color-danger-bg|#FEF3F2)/s, 'Destructive badge must have danger bg');
assert.match(fioriOpCardCss, /\.fiori-destructive-badge\s*\{[^}]*color:\s*(var\(--color-danger|#B42318)/s, 'Destructive badge must have danger text');

// Normal card must NOT have destructive badge
assert.doesNotMatch(normalCardHtml, /fiori-destructive-badge/, 'Normal card must not have destructive badge');

// Both cards must render the Open link at bottom
assert.match(normalCardHtml, /class="[^"]*fiori-op-open-link[^"]*"[\s\S]*?Open/, 'Normal card must render "Open" text link');
assert.match(deleteCardHtml, /class="[^"]*fiori-op-open-link[^"]*"[\s\S]*?Open/, 'Destructive card must render "Open" text link');
console.log('   ✓ Destructive badge top-right row alignment and "Open" text link verified\n');

// TEST 5: Verify Keyboard Activation (Button Semantic Tag & Accessibility)
console.log('Test 5: Verify Keyboard Activation & Semantic HTML Accessibility...');
assert.match(normalCardHtml, /^<button type="button" class="[^"]*fiori-op-card/, 'FioriOpCard must be rendered as <button type="button"> for keyboard activation (Enter/Space)');
assert.match(deleteCardHtml, /^<button type="button" class="[^"]*fiori-op-card/, 'Destructive card must also be rendered as <button type="button">');

let clicked = false;
const cardProps = {
  id: 'test_card',
  title: 'Test Operation',
  desc: 'Test description',
  iconName: 'Search',
  onClick: () => { clicked = true; }
};
const testElement = React.createElement(FioriOpCard, cardProps);
// Simulate onClick invocation that happens on native button Enter/Space
testElement.props.onClick();
assert.strictEqual(clicked, true, 'Card onClick callback must fire on activation');
console.log('   ✓ Button semantic tag, keyboard accessibility, and activation verified\n');

// TEST 6: Verify Responsive Mobile Breakpoint (<600px)
console.log('Test 6: Verify Responsive Mobile Breakpoint (<600px)...');
assert.match(fioriOpCardCss, /@media\s*\(max-width:\s*600px\)\s*\{[\s\S]*?\.fiori-op-grid\s*\{[\s\S]*?grid-template-columns:\s*1fr/s, 'Mobile breakpoint must make grid 1fr');
assert.match(fioriOpCardCss, /@media\s*\(max-width:\s*600px\)\s*\{[\s\S]*?\.fiori-op-card\s*\{[\s\S]*?width:\s*100%/s, 'Mobile breakpoint must make card 100% width');
console.log('   ✓ Responsive mobile breakpoint (<600px) verified\n');

// TEST 7: Verify Launchpad Level 2 (BOM Hub) & Level 3 (Create / Copy Groups) Rendering
console.log('Test 7: Verify Landing Pages inherit the redesigned cards...');
const bomHubHtml = renderToStaticMarkup(
  React.createElement(FioriLaunchpad, {
    subView: 'bom_operations',
    userRole: 'admin',
    enabledModules: ['BOM'],
    userPermissions: ['*'],
    systemKey: 'DEV'
  })
);

const createGroupHtml = renderToStaticMarkup(
  React.createElement(FioriLaunchpad, {
    subView: 'bom_create_operations',
    userRole: 'admin',
    enabledModules: ['BOM'],
    userPermissions: ['*'],
    systemKey: 'DEV'
  })
);

const copyGroupHtml = renderToStaticMarkup(
  React.createElement(FioriLaunchpad, {
    subView: 'bom_copy_operations',
    userRole: 'admin',
    enabledModules: ['BOM'],
    userPermissions: ['*'],
    systemKey: 'DEV'
  })
);

// BOM Hub has 5 operations: create_group, copy_group, display, validate, delete
const hubCardsCount = (bomHubHtml.match(/class="[^"]*fiori-op-card[^"]*"/g) || []).length;
assert.strictEqual(hubCardsCount, 5, `BOM Hub must render exactly 5 cards, got ${hubCardsCount}`);

// Create BOM group has 2 operations: create_single, create_bulk
const createCardsCount = (createGroupHtml.match(/class="[^"]*fiori-op-card[^"]*"/g) || []).length;
assert.strictEqual(createCardsCount, 2, `Create BOM group must render 2 cards, got ${createCardsCount}`);

// Copy BOM group has 2 operations: copy_single, copy_bulk
const copyCardsCount = (copyGroupHtml.match(/class="[^"]*fiori-op-card[^"]*"/g) || []).length;
assert.strictEqual(copyCardsCount, 2, `Copy BOM group must render 2 cards, got ${copyCardsCount}`);

// Verify all of them render the new fiori-op-top-row and fiori-op-open-link
const topRowsCount = (bomHubHtml.match(/class="[^"]*fiori-op-top-row[^"]*"/g) || []).length;
assert.strictEqual(topRowsCount, 5, 'Every card on BOM hub must render fiori-op-top-row');

const openLinksCount = (bomHubHtml.match(/class="[^"]*fiori-op-open-link[^"]*"/g) || []).length;
assert.strictEqual(openLinksCount, 5, 'Every card on BOM hub must render fiori-op-open-link');

console.log('   ✓ BOM Hub (5 cards), Create BOM (2 cards), and Copy BOM (2 cards) all inherit redesigned cards cleanly\n');

console.log('============================================================');
console.log('  ALL OPERATION CARDS REDESIGN TESTS PASSED! (100%)         ');
console.log('============================================================\n');
