import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('============================================================');
console.log('  RUNNING FIORILAUNCHPAD & ERROR BOUNDARY RENDERING TESTS    ');
console.log('============================================================\n');

// 1. Transpile FioriLaunchpad.jsx and ErrorBoundary.jsx using esbuild
const frontendDir = path.resolve(__dirname, '../../frontend');
const tempDir = path.resolve(frontendDir, 'src/.temp_test_build');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const launchpadOut = path.join(tempDir, 'FioriLaunchpad.mjs');
const errorBoundaryOut = path.join(tempDir, 'ErrorBoundary.mjs');

const esbuildPath = path.resolve(frontendDir, 'node_modules/esbuild/lib/main.js');
const { default: esbuild } = await import(pathToFileURL(esbuildPath).href);

// Bundle FioriLaunchpad
esbuild.buildSync({
  entryPoints: [path.resolve(frontendDir, 'src/components/FioriLaunchpad.jsx')],
  bundle: true,
  format: 'esm',
  outfile: launchpadOut,
  external: ['react', 'react-dom', 'lucide-react', '@shared/*'],
  alias: {
    '@shared': path.resolve(__dirname, '../../shared')
  }
});

// Bundle ErrorBoundary
esbuild.buildSync({
  entryPoints: [path.resolve(frontendDir, 'src/components/ErrorBoundary.jsx')],
  bundle: true,
  format: 'esm',
  outfile: errorBoundaryOut,
  external: ['react', 'react-dom', 'lucide-react']
});

// Import React and ReactDOMServer
const ReactPath = path.resolve(frontendDir, 'node_modules/react/index.js');
const ReactDOMServerPath = path.resolve(frontendDir, 'node_modules/react-dom/server.node.js');

const ReactModule = await import(pathToFileURL(ReactPath).href);
const React = ReactModule.default || ReactModule;
const { renderToStaticMarkup } = await import(pathToFileURL(ReactDOMServerPath).href);

// Import bundled components
const FioriLaunchpadModule = await import(pathToFileURL(launchpadOut).href);
const FioriLaunchpad = FioriLaunchpadModule.default;

const ErrorBoundaryModule = await import(pathToFileURL(errorBoundaryOut).href);
const ErrorBoundary = ErrorBoundaryModule.default;

assert(FioriLaunchpad, 'FioriLaunchpad default export must be defined');
assert(ErrorBoundary, 'ErrorBoundary default export must be defined');

try {
  // Test 1: Rendering as Admin on Level 1 (Home)
  console.log('Test 1: Render FioriLaunchpad as Admin on Products...');
  const adminHomeHtml = renderToStaticMarkup(
    React.createElement(FioriLaunchpad, {
      userRole: 'admin',
      userPermissions: [],
      enabledModules: ['bom'],
      subView: 'home'
    })
  );

  assert(adminHomeHtml.includes('Products'), 'Admin home should include Products title');
  assert(adminHomeHtml.includes('Home'), 'Admin home should include Home in breadcrumbs');
  assert(adminHomeHtml.includes('Bill of Materials'), 'Admin home should include Bill of Materials tile');
  console.log('✓ PASS: Admin Home renders cleanly with zero reference errors\n');


  // Test 2: Rendering as Admin on Level 2 (BOM Hub - 5 Cards)
  console.log('Test 2: Render FioriLaunchpad as Admin on BOM Hub (5 cards)...');
  const adminHubHtml = renderToStaticMarkup(
    React.createElement(FioriLaunchpad, {
      userRole: 'admin',
      userPermissions: [],
      enabledModules: ['bom'],
      subView: 'bom_operations'
    })
  );

  assert(adminHubHtml.includes('Create BOM'), 'BOM Hub must render Create BOM group card');
  assert(adminHubHtml.includes('Create a single BOM or many from a file'), 'Create BOM card subtitle present');
  assert(adminHubHtml.includes('Copy BOM'), 'BOM Hub must render Copy BOM group card');
  assert(adminHubHtml.includes('Copy a single BOM or many at once'), 'Copy BOM card subtitle present');
  assert(adminHubHtml.includes('Display BOM'), 'BOM Hub must render Display BOM card');
  assert(adminHubHtml.includes('Validate BOM'), 'BOM Hub must render Validate BOM card');
  assert(adminHubHtml.includes('Delete BOM'), 'BOM Hub must render Delete BOM card');

  // Verify exactly 5 .fiori-op-card elements are rendered
  const cardCount = (adminHubHtml.match(/class="[^"]*fiori-op-card[^"]*"/g) || []).length;
  assert.strictEqual(cardCount, 5, `Admin must see exactly 5 cards on BOM Hub; got ${cardCount}`);
  console.log('✓ PASS: Admin BOM Hub renders exactly 5 cards with all metadata\n');


  // Test 3: Rendering as Admin on Level 3 (Create BOM Sub-page - 2 Cards)
  console.log('Test 3: Render FioriLaunchpad as Admin on Create BOM Sub-Page...');
  const createSubHtml = renderToStaticMarkup(
    React.createElement(FioriLaunchpad, {
      userRole: 'admin',
      userPermissions: [],
      enabledModules: ['bom'],
      subView: 'bom_create_operations'
    })
  );

  assert(createSubHtml.includes('Create Single BOM'), 'Must render Create Single BOM card');
  assert(createSubHtml.includes('Create Bulk BOM'), 'Must render Create Bulk BOM card');
  const createSubCardCount = (createSubHtml.match(/class="[^"]*fiori-op-card[^"]*"/g) || []).length;
  assert.strictEqual(createSubCardCount, 2, 'Create BOM sub-page must render 2 cards');
  console.log('✓ PASS: Create BOM sub-page renders both Single and Bulk cards\n');


  // Test 4: Rendering as Admin on Level 3 (Copy BOM Sub-page - 2 Cards)
  console.log('Test 4: Render FioriLaunchpad as Admin on Copy BOM Sub-Page...');
  const copySubHtml = renderToStaticMarkup(
    React.createElement(FioriLaunchpad, {
      userRole: 'admin',
      userPermissions: [],
      enabledModules: ['bom'],
      subView: 'bom_copy_operations'
    })
  );

  assert(copySubHtml.includes('Copy Single BOM'), 'Must render Copy Single BOM card');
  assert(copySubHtml.includes('Copy Bulk BOM'), 'Must render Copy Bulk BOM card');
  const copySubCardCount = (copySubHtml.match(/class="[^"]*fiori-op-card[^"]*"/g) || []).length;
  assert.strictEqual(copySubCardCount, 2, 'Copy BOM sub-page must render 2 cards');
  console.log('✓ PASS: Copy BOM sub-page renders both Single and Bulk cards\n');


  // Test 5: Rendering as Restricted User (Only 'bulk' permission)
  console.log('Test 5: Render FioriLaunchpad as Restricted User (Bulk-only)...');
  const restrictedBulkHubHtml = renderToStaticMarkup(
    React.createElement(FioriLaunchpad, {
      userRole: 'user',
      userPermissions: ['bulk'],
      enabledModules: ['bom'],
      subView: 'bom_operations'
    })
  );

  // On Hub:
  assert(restrictedBulkHubHtml.includes('Copy BOM'), 'Bulk-only user must see Copy BOM group card on hub');
  assert(!restrictedBulkHubHtml.includes('Create BOM'), 'Bulk-only user must NOT see Create BOM card');
  assert(!restrictedBulkHubHtml.includes('Display BOM'), 'Bulk-only user must NOT see Display BOM card');
  assert(!restrictedBulkHubHtml.includes('Validate BOM'), 'Bulk-only user must NOT see Validate BOM card');
  assert(!restrictedBulkHubHtml.includes('Delete BOM'), 'Bulk-only user must NOT see Delete BOM card');

  const bulkUserCardCount = (restrictedBulkHubHtml.match(/class="[^"]*fiori-op-card[^"]*"/g) || []).length;
  assert.strictEqual(bulkUserCardCount, 1, 'Bulk-only user must see exactly 1 card on BOM Hub');

  // On Copy Sub-page:
  const restrictedBulkSubHtml = renderToStaticMarkup(
    React.createElement(FioriLaunchpad, {
      userRole: 'user',
      userPermissions: ['bulk'],
      enabledModules: ['bom'],
      subView: 'bom_copy_operations'
    })
  );

  assert(restrictedBulkSubHtml.includes('Copy Bulk BOM'), 'Subpage must render Copy Bulk BOM');
  assert(!restrictedBulkSubHtml.includes('Copy Single BOM'), 'Subpage must NOT render Copy Single BOM');
  const bulkSubCardCount = (restrictedBulkSubHtml.match(/class="[^"]*fiori-op-card[^"]*"/g) || []).length;
  assert.strictEqual(bulkSubCardCount, 1, 'Bulk-only user must see exactly 1 card on Copy subpage');
  console.log('✓ PASS: Restricted bulk-only user sees only Copy BOM group on hub and Copy Bulk BOM on subpage\n');


  // Test 6: Rendering as Restricted User (Zero BOM permissions)
  console.log('Test 6: Render FioriLaunchpad as Restricted User with No BOM Permissions...');
  const noPermsHubHtml = renderToStaticMarkup(
    React.createElement(FioriLaunchpad, {
      userRole: 'user',
      userPermissions: ['unrelated_permission'],
      enabledModules: ['bom'],
      subView: 'bom_operations'
    })
  );

  const noPermsCardCount = (noPermsHubHtml.match(/class="[^"]*fiori-op-card[^"]*"/g) || []).length;
  assert.strictEqual(noPermsCardCount, 0, 'User with no BOM permissions must see 0 operational cards');
  console.log('✓ PASS: User with no BOM permissions sees 0 cards on BOM hub\n');


  // Test 7: ErrorBoundary Fallback UI and Reload Button
  console.log('Test 7: ErrorBoundary error state rendering...');
  // Instantiate ErrorBoundary in errored state
  const testError = new Error('Simulated React crash in component hierarchy');
  const errorDerivedState = ErrorBoundary.getDerivedStateFromError(testError);
  assert.strictEqual(errorDerivedState.hasError, true);
  assert.strictEqual(errorDerivedState.error, testError);

  const boundaryElement = React.createElement(ErrorBoundary, null, React.createElement('div', null, 'Normal content'));
  // Set internal state to error to render fallback UI
  const errorBoundaryInstance = new ErrorBoundary({});
  errorBoundaryInstance.state = { hasError: true, error: testError, errorInfo: { componentStack: 'at Component (<anonymous>:1:1)' } };

  const errorFallbackHtml = renderToStaticMarkup(errorBoundaryInstance.render());
  assert(errorFallbackHtml.includes('Application Render Error'), 'Fallback UI must display title');
  assert(errorFallbackHtml.includes('Simulated React crash in component hierarchy'), 'Fallback UI must display error message');
  assert(errorFallbackHtml.includes('Reload Application'), 'Fallback UI must provide Reload Application button');
  assert(errorFallbackHtml.includes('Try Again'), 'Fallback UI must provide Try Again button');
  console.log('✓ PASS: ErrorBoundary displays readable error, stack trace, and Reload button\n');

  // Test 8: ErrorBoundary passes through normal children
  console.log('Test 8: ErrorBoundary normal rendering...');
  const normalHtml = renderToStaticMarkup(
    React.createElement(ErrorBoundary, null, React.createElement('span', { id: 'test-child' }, 'Clean App Tree'))
  );
  assert(normalHtml.includes('Clean App Tree'), 'ErrorBoundary renders children normally when no error');
  console.log('✓ PASS: ErrorBoundary passes through normal children\n');

} finally {
  // Clean up test build directory
  try {
    if (fs.existsSync(launchpadOut)) fs.unlinkSync(launchpadOut);
    if (fs.existsSync(errorBoundaryOut)) fs.unlinkSync(errorBoundaryOut);
    if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
  } catch {
    // Ignore cleanup errors
  }
}

console.log('============================================================');
console.log('  ALL FIORILAUNCHPAD RENDERING & ERROR TESTS PASSED (100%)  ');
console.log('============================================================\n');
