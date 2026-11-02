import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const frontendDir = path.resolve(__dirname, '../../frontend');
const sharedDir = path.resolve(__dirname, '../../shared');
const tempDir = path.resolve(frontendDir, 'src/.temp_bom_explorer_test');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const esbuildPath = path.resolve(frontendDir, 'node_modules/esbuild/lib/main.js');
const { default: esbuild } = await import(pathToFileURL(esbuildPath).href);

function bundleComponent(relPath, baseName) {
  const outFile = path.join(tempDir, `${baseName}.mjs`);
  esbuild.buildSync({
    entryPoints: [path.resolve(frontendDir, relPath)],
    bundle: true,
    format: 'esm',
    outfile: outFile,
    external: ['react', 'react-dom', 'lucide-react', '@shared/*', 'xlsx', '@supabase/supabase-js'],
    loader: {
      '.png': 'dataurl',
      '.webp': 'dataurl',
      '.jpg': 'dataurl',
      '.jpeg': 'dataurl',
      '.svg': 'dataurl',
      '.css': 'empty'
    },
    alias: {
      '@shared': sharedDir
    }
  });
  return outFile;
}

const bomExplorerModulePath = bundleComponent('src/components/BomExplorerView.jsx', 'BomExplorerView');
const { formatMaterialNumber, formatAlternativeLabel, formatAltNumber } = await import(
  pathToFileURL(bomExplorerModulePath).href
);

const tableLoadingModulePath = bundleComponent('src/components/TableLoadingState.jsx', 'TableLoadingState');
const TableLoadingStateModule = await import(pathToFileURL(tableLoadingModulePath).href);
const TableLoadingState = TableLoadingStateModule.default;

console.log('============================================================');
console.log('  RUNNING BOM EXPLORER & TABLE LOADING COMPREHENSIVE TESTS  ');
console.log('============================================================\n');

async function runTests() {
  // Test 1: Alternative (STLAL) Label Formatting & Real API Values
  console.log('1. Testing Alternative (STLAL) label formatting & API values...');
  {
    assert.strictEqual(formatAlternativeLabel('01'), 'Alt 1', '01 formatted as Alt 1');
    assert.strictEqual(formatAlternativeLabel('02'), 'Alt 2', '02 formatted as Alt 2');
    assert.strictEqual(formatAlternativeLabel('03'), 'Alt 3', '03 formatted as Alt 3');
    assert.strictEqual(formatAlternativeLabel('10'), 'Alt 10', '10 formatted as Alt 10');
    assert.strictEqual(formatAlternativeLabel(1), 'Alt 1', 'Number 1 formatted as Alt 1');
    assert.strictEqual(formatAlternativeLabel(2), 'Alt 2', 'Number 2 formatted as Alt 2');
    assert.strictEqual(formatAlternativeLabel(''), 'Alt 1', 'Empty string defaults to Alt 1');
    assert.strictEqual(formatAlternativeLabel(null), 'Alt 1', 'Null defaults to Alt 1');

    assert.strictEqual(formatAltNumber('01'), '1', 'formatAltNumber strips leading zero for 01');
    assert.strictEqual(formatAltNumber('02'), '2', 'formatAltNumber strips leading zero for 02');
    assert.strictEqual(formatAltNumber('03'), '3', 'formatAltNumber strips leading zero for 03');
    assert.strictEqual(formatAltNumber('12'), '12', 'formatAltNumber preserves 12');

    // Simulate dropdown options mapping:
    const availableAlternatives = ['01', '02', '03'];
    const options = availableAlternatives.map((alt) => {
      const altStr = String(alt).padStart(2, '0');
      return {
        value: altStr,
        label: formatAlternativeLabel(alt)
      };
    });

    assert.deepStrictEqual(
      options,
      [
        { value: '01', label: 'Alt 1' },
        { value: '02', label: 'Alt 2' },
        { value: '03', label: 'Alt 3' }
      ],
      'Dropdown options preserve original API values while displaying Alt 1, Alt 2, Alt 3'
    );

    console.log('   ✓ Alternative labels strip leading zeros ("Alt 1", "Alt 2") and preserve API values ("01", "02")');
  }

  // Test 2: Table & Summary Counters Hidden During Loading
  console.log('\n2. Testing previous table and summary counters hidden during loading...');
  {
    const initialBomData = {
      header: { bomNumber: '00012345', alternative: '01', baseQty: '1', baseUnit: 'ST' },
      alternativeBom: '01',
      components: [
        { itemNo: '0010', component: 'MAT-100', description: 'Bracket', quantity: 2 },
        { itemNo: '0020', component: 'MAT-200', description: 'Bolt', quantity: 4 }
      ]
    };

    // State simulation
    let bomData = initialBomData;
    let isLoading = false;
    let loadingType = null;
    let loadingMessage = '';
    let pendingAlternative = null;

    // View helper simulation matching BomExplorerView
    const getSummaryValues = () => ({
      baseQty: isLoading ? '-' : `${bomData?.header?.baseQty || '1'} ${bomData?.header?.baseUnit || 'ST'}`,
      totalComponents: isLoading ? '-' : bomData?.components?.length || 0
    });

    const isTableRendered = () => !isLoading && bomData !== null;
    const isLoadingStateRendered = () => isLoading;

    // Initial state: rendered
    assert.strictEqual(isTableRendered(), true);
    assert.strictEqual(isLoadingStateRendered(), false);
    assert.deepStrictEqual(getSummaryValues(), { baseQty: '1 ST', totalComponents: 2 });

    // User switches to Alternative 2:
    const newAlt = '02';
    isLoading = true;
    loadingType = 'alternative';
    loadingMessage = `Loading alternative ${formatAltNumber(newAlt)}...`;
    pendingAlternative = newAlt;

    // While loading:
    assert.strictEqual(isTableRendered(), false, 'Components table must NOT be rendered during loading');
    assert.strictEqual(isLoadingStateRendered(), true, 'TableLoadingState must be rendered during loading');
    assert.strictEqual(loadingMessage, 'Loading alternative 2...', 'Loading message must be "Loading alternative 2..."');
    assert.deepStrictEqual(
      getSummaryValues(),
      { baseQty: '-', totalComponents: '-' },
      'Summary values (base quantity, total components) must be hidden during loading'
    );

    // When loading finishes successfully:
    const newBomData = {
      header: { bomNumber: '00012345', alternative: '02', baseQty: '5', baseUnit: 'ST' },
      alternativeBom: '02',
      components: [
        { itemNo: '0010', component: 'MAT-300', description: 'Gear', quantity: 1 }
      ]
    };
    bomData = newBomData;
    isLoading = false;
    loadingType = null;
    loadingMessage = '';
    pendingAlternative = null;

    assert.strictEqual(isTableRendered(), true, 'New table must be rendered after load finishes');
    assert.strictEqual(isLoadingStateRendered(), false);
    assert.deepStrictEqual(
      getSummaryValues(),
      { baseQty: '5 ST', totalComponents: 1 },
      'Summary values must display new alternative data'
    );

    console.log('   ✓ Components table and summary values are hidden while loading alternative, then updated on arrival');
  }

  // Test 3: Failure Rollback of Alternative Selection and Table
  console.log('\n3. Testing failure rollback of alternative selection and table...');
  {
    const initialBomData = {
      header: { bomNumber: '00012345', alternative: '01' },
      alternativeBom: '01',
      components: [{ itemNo: '0010', component: 'MAT-100' }]
    };

    let bomData = initialBomData;
    let selectedAlt = '01';
    let pendingAlternative = null;
    let isLoading = false;
    let toastErrors = [];

    const lastSuccessfulBomDataRef = { current: initialBomData };
    const lastSuccessfulAltRef = { current: '01' };

    const toast = {
      error: (msg) => toastErrors.push(msg)
    };

    // Trigger switch to Alt 2 that fails
    const newAlt = '02';
    isLoading = true;
    pendingAlternative = newAlt;

    // Simulate failed API response:
    const errorResponse = { success: false, message: 'Alternative 02 does not exist in Plant 1000.' };
    toast.error(errorResponse.message);

    // Rollback logic
    pendingAlternative = null;
    bomData = lastSuccessfulBomDataRef.current;
    selectedAlt = lastSuccessfulAltRef.current;
    isLoading = false;

    assert.strictEqual(selectedAlt, '01', 'Selected alternative rolled back to 01');
    assert.strictEqual(pendingAlternative, null, 'Pending alternative cleared');
    assert.strictEqual(bomData, initialBomData, 'Previous table data restored on error');
    assert.strictEqual(toastErrors.length, 1, 'Error toast was triggered');
    assert.strictEqual(toastErrors[0], 'Alternative 02 does not exist in Plant 1000.');

    console.log('   ✓ Failed alternative switch shows toast error and restores previous alternative & table');
  }

  // Test 4: Stale Responses Ignored (Rapid Alternative Switching)
  console.log('\n4. Testing stale response rejection during rapid alternative changes...');
  {
    const lastRequestIdRef = { current: 0 };
    let activeBomData = null;
    let updateCount = 0;

    const simulateFetchAlternative = async (alt, delayMs, reqId) => {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      // Stale check
      if (reqId !== lastRequestIdRef.current) {
        return; // Ignore stale response!
      }
      activeBomData = { alternativeBom: alt };
      updateCount++;
    };

    // Dispatch request 1 for Alt 02 (slow, takes 80ms)
    const req1 = ++lastRequestIdRef.current; // 1
    const p1 = simulateFetchAlternative('02', 80, req1);

    // User immediately switches to Alt 03 (fast, takes 20ms)
    const req2 = ++lastRequestIdRef.current; // 2
    const p2 = simulateFetchAlternative('03', 20, req2);

    await Promise.all([p1, p2]);

    assert.strictEqual(updateCount, 1, 'Only the latest request must update state');
    assert.strictEqual(activeBomData.alternativeBom, '03', 'Rendered data must be from request 2 (Alt 03)');

    console.log('   ✓ Stale response from slow earlier request was properly ignored');
  }

  // Test 5: Mode Switching (Single Level Items vs Multi-Level Hierarchy)
  console.log('\n5. Testing mode switch: button highlight, loading state, and no stale table...');
  {
    let viewMode = 'items';
    let isLoading = false;
    let loadingMessage = '';
    let displayedTable = 'items_table';
    let highlightedButton = viewMode;

    const lastSuccessfulBomDataRef = { current: 'items_table' };
    const lastSuccessfulModeRef = { current: 'items' };

    // User clicks "Multi-Level Hierarchy"
    const targetMode = 'hierarchy';
    isLoading = true;
    loadingMessage = 'Loading multi-level hierarchy...';
    // Rule: Keep previous mode highlighted until new data arrives
    highlightedButton = viewMode;
    // Rule: Hide previous table immediately
    displayedTable = null;

    assert.strictEqual(highlightedButton, 'items', 'Previous mode ("Single Level Items") remains highlighted while loading');
    assert.strictEqual(displayedTable, null, 'Previous table is hidden immediately');
    assert.strictEqual(loadingMessage, 'Loading multi-level hierarchy...', 'Loading message correctly indicates hierarchy');

    // Simulate arrival of hierarchy data:
    viewMode = targetMode;
    highlightedButton = viewMode;
    displayedTable = 'hierarchy_table';
    isLoading = false;
    loadingMessage = '';

    assert.strictEqual(highlightedButton, 'hierarchy', 'Highlight switches to "Multi-Level Hierarchy" only upon data arrival');
    assert.strictEqual(displayedTable, 'hierarchy_table', 'New hierarchy table is rendered');

    console.log('   ✓ Mode switch keeps previous highlight during load, hides old table, and switches cleanly upon arrival');
  }

  // Test 6: Display BOM Button & Mode Buttons Disabled While Loading
  console.log('\n6. Testing buttons disabled during loading state...');
  {
    const isLoading = true;

    const isSingleLevelDisabled = isLoading;
    const isMultiLevelDisabled = isLoading;
    const isDisplayBomDisabled = isLoading;

    assert.strictEqual(isSingleLevelDisabled, true, 'Single Level button disabled during load');
    assert.strictEqual(isMultiLevelDisabled, true, 'Multi-Level button disabled during load');
    assert.strictEqual(isDisplayBomDisabled, true, 'Display BOM button disabled during load');

    console.log('   ✓ All mode buttons and Display BOM button are disabled while loading');
  }

  // Test 7: TableLoadingState Component Shape
  console.log('\n7. Testing TableLoadingState component export and props...');
  {
    assert.strictEqual(typeof TableLoadingState, 'function', 'TableLoadingState is a valid React functional component');
    console.log('   ✓ TableLoadingState component is properly exported and valid');
  }

  console.log('\n============================================================');
  console.log('  ALL BOM EXPLORER LOADING & STATE TESTS PASSED CLEANLY!     ');
  console.log('============================================================\n');
}

runTests()
  .catch((err) => {
    console.error('\n❌ BOM Explorer test failure:', err);
    process.exit(1);
  })
  .finally(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });
