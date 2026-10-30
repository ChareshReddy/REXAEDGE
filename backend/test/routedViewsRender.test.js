import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('============================================================');
console.log('  RUNNING ROUTED VIEWS ZERO-CRASH & BREADCRUMB TEST SUITE   ');
console.log('============================================================\n');

const frontendDir = path.resolve(__dirname, '../../frontend');
const sharedDir = path.resolve(__dirname, '../../shared');
const tempDir = path.resolve(frontendDir, 'src/.temp_routed_views_test');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const esbuildPath = path.resolve(frontendDir, 'node_modules/esbuild/lib/main.js');
const { default: esbuild } = await import(pathToFileURL(esbuildPath).href);

const ReactPath = path.resolve(frontendDir, 'node_modules/react/index.js');
const ReactDOMServerPath = path.resolve(frontendDir, 'node_modules/react-dom/server.node.js');

const ReactModule = await import(pathToFileURL(ReactPath).href);
const React = ReactModule.default || ReactModule;
const { renderToStaticMarkup } = await import(pathToFileURL(ReactDOMServerPath).href);

const viewsToTest = [
  {
    name: 'HomePage',
    file: 'src/components/HomePage.jsx',
    props: {
      onExploreProducts: () => {},
      onNavigateHome: () => {}
    },
    expectedTexts: ['RexaEdge', 'Products']
  },
  {
    name: 'FioriLaunchpad (Products)',
    file: 'src/components/FioriLaunchpad.jsx',
    props: {
      userRole: 'admin',
      userPermissions: [],
      enabledModules: ['bom'],
      subView: 'home',
      onNavigateHome: () => {},
      onNavigateProducts: () => {}
    },
    expectedTexts: ['Products', 'Home', 'Bill of Materials']
  },
  {
    name: 'FioriLaunchpad (Bill of Materials Hub)',
    file: 'src/components/FioriLaunchpad.jsx',
    props: {
      userRole: 'admin',
      userPermissions: [],
      enabledModules: ['bom'],
      subView: 'bom_operations',
      onNavigateHome: () => {},
      onNavigateProducts: () => {}
    },
    expectedTexts: ['Bill of Materials', 'Home', 'Products', 'Operations']
  },
  {
    name: 'CreateBomView (Create Single BOM)',
    file: 'src/components/CreateBomView.jsx',
    props: {
      systemKey: 'DEV',
      onBack: () => {},
      onNavigateBom: () => {},
      onNavigateProducts: () => {},
      onNavigateHome: () => {}
    },
    expectedTexts: ['Create Single BOM', 'Home', 'Products', 'Bill of Materials']
  },
  {
    name: 'BulkCreateBomView (Create Bulk BOM)',
    file: 'src/components/BulkCreateBomView.jsx',
    props: {
      systemKey: 'DEV',
      onBack: () => {},
      onNavigateBom: () => {},
      onNavigateProducts: () => {},
      onNavigateHome: () => {}
    },
    expectedTexts: ['Create Bulk BOM', 'Home', 'Products', 'Bill of Materials']
  },
  {
    name: 'CopyBomView (Copy Single BOM)',
    file: 'src/components/CopyBomView.jsx',
    props: {
      systemKey: 'DEV',
      onBack: () => {},
      onNavigateBom: () => {},
      onNavigateProducts: () => {},
      onNavigateHome: () => {}
    },
    expectedTexts: ['Copy Single BOM', 'Home', 'Products', 'Bill of Materials']
  },
  {
    name: 'BulkBomView (Copy Bulk BOM)',
    file: 'src/components/BulkBomView.jsx',
    props: {
      systemKey: 'DEV',
      onBack: () => {},
      onNavigateBom: () => {},
      onNavigateProducts: () => {},
      onNavigateHome: () => {}
    },
    expectedTexts: ['Copy Bulk BOM', 'Home', 'Products', 'Bill of Materials']
  },
  {
    name: 'DeleteBomView (Delete BOM)',
    file: 'src/components/DeleteBomView.jsx',
    props: {
      systemKey: 'DEV',
      onBack: () => {},
      onNavigateBom: () => {},
      onNavigateProducts: () => {},
      onNavigateHome: () => {}
    },
    expectedTexts: ['Delete BOM', 'Home', 'Products', 'Bill of Materials']
  },
  {
    name: 'BomExplorerView (Display BOM)',
    file: 'src/components/BomExplorerView.jsx',
    props: {
      systemKey: 'DEV',
      onBack: () => {},
      onNavigateBom: () => {},
      onNavigateProducts: () => {},
      onNavigateHome: () => {}
    },
    expectedTexts: ['Display BOM', 'Home', 'Products', 'Bill of Materials']
  },
  {
    name: 'ValidateBomView (Validate BOM)',
    file: 'src/components/ValidateBomView.jsx',
    props: {
      systemKey: 'DEV',
      onBack: () => {},
      onNavigateBom: () => {},
      onNavigateProducts: () => {},
      onNavigateHome: () => {}
    },
    expectedTexts: ['Validate BOM', 'Home', 'Products', 'Bill of Materials']
  },
  {
    name: 'AdminView (Enterprise Administration)',
    file: 'src/components/AdminView.jsx',
    props: {
      currentUser: { email: 'admin@example.com', role: 'admin' },
      onBack: () => {},
      onNavigateProducts: () => {},
      onNavigateHome: () => {}
    },
    expectedTexts: ['Enterprise Administration', 'Home']
  },
  {
    name: 'Login (Authentication)',
    file: 'src/components/Login.jsx',
    props: {
      onLoginSuccess: () => {}
    },
    expectedTexts: ['Sign In', 'RexaEdge']
  }
];

try {
  for (const [idx, v] of viewsToTest.entries()) {
    const safeName = v.name.replace(/[^a-zA-Z0-9]/g, '_');
    const outFile = path.join(tempDir, `${safeName}.mjs`);

    esbuild.buildSync({
      entryPoints: [path.resolve(frontendDir, v.file)],
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

    const mod = await import(pathToFileURL(outFile).href);
    const Component = mod.default;
    assert(Component, `${v.name} default export must be defined`);

    // Render component
    let html = '';
    assert.doesNotThrow(() => {
      html = renderToStaticMarkup(React.createElement(Component, v.props));
    }, `Rendering ${v.name} must not throw any runtime error`);

    assert(typeof html === 'string' && html.length > 0, `${v.name} must render valid HTML`);

    for (const text of v.expectedTexts) {
      assert(
        html.includes(text),
        `${v.name} rendered HTML must contain expected text "${text}"`
      );
    }

    console.log(`Test ${idx + 1}: ${v.name} rendered cleanly with zero errors`);
    console.log(`   ✓ Breadcrumb/Title assertions verified: ${v.expectedTexts.join(' › ')}`);
  }
} finally {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

console.log('\n============================================================');
console.log('  ALL 12 ROUTED VIEWS RENDERED CLEANLY WITHOUT CRASHING!    ');
console.log('============================================================\n');
