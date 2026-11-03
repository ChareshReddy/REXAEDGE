import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('============================================================');
console.log('  RUNNING ROUTED VIEWS ZERO-CRASH & COMPREHENSIVE RENDER TEST');
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

// Mock Users
const adminUser = { id: 'admin-1', email: 'admin@rexaedge.com', role: 'admin' };
const normalUser = { id: 'user-1', email: 'user@rexaedge.com', role: 'user' };

// Mock Servers with varied environments to ensure formatEnvironment executes
const mockServers = [
  { id: 'srv-1', name: 'SAP DEV 01', environment: 'DEV', is_active: true, host: 'sapdev.corp', sys_id: 'DEV' },
  { id: 'srv-2', name: 'SAP SANDBOX', environment: 'SANDBOX', is_active: true, host: 'sapsandbox.corp', sys_id: 'SBX' },
  { id: 'srv-3', name: 'SAP PROD', environment: 'PROD', is_active: true, host: 'sapprod.corp', sys_id: 'PRD' }
];

// Mock Permissions
const mockPermissions = [
  {
    id: 'perm-1',
    user_id: 'user-1',
    user_email: 'user@rexaedge.com',
    server_id: 'srv-1',
    server_name: 'SAP DEV 01',
    server_environment: 'DEV',
    permissions: ['bom_display', 'bom_create', 'bom_copy']
  },
  {
    id: 'perm-2',
    user_id: 'user-1',
    user_email: 'user@rexaedge.com',
    server_id: 'srv-2',
    server_name: 'SAP SANDBOX',
    server_environment: 'SANDBOX',
    permissions: ['bom_display', 'bom_validate']
  }
];

// Mock Users list for Admin
const mockAdminUsers = [
  { id: 'admin-1', email: 'admin@rexaedge.com', role: 'admin', created_at: '2026-01-01T00:00:00Z' },
  { id: 'user-1', email: 'user@rexaedge.com', role: 'user', created_at: '2026-02-01T00:00:00Z' }
];

// Helper to bundle a file with esbuild
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

// Safely render a component and catch any console.errors or throws
function safeRender(name, element) {
  const originalConsoleError = console.error;
  const loggedErrors = [];
  console.error = (...args) => {
    loggedErrors.push(args.map(a => (a?.stack || String(a))).join(' '));
    originalConsoleError.apply(console, args);
  };

  let html = '';
  try {
    assert.doesNotThrow(() => {
      html = renderToStaticMarkup(element);
    }, `Rendering "${name}" threw a synchronous execution error!`);

    assert(
      typeof html === 'string' && html.length > 0,
      `Rendering "${name}" returned empty markup!`
    );

    // Fail if React threw or logged fatal unhandled errors during render
    const fatalErrors = loggedErrors.filter(err =>
      err.includes('Error:') || err.includes('not defined') || err.includes('Cannot read properties')
    );
    if (fatalErrors.length > 0) {
      assert.fail(`Rendering "${name}" logged uncaught error(s):\n${fatalErrors.join('\n')}`);
    }

    return html;
  } finally {
    console.error = originalConsoleError;
  }
}

let testCount = 0;

try {
  // -------------------------------------------------------------
  // 1. Standalone Routed Views
  // -------------------------------------------------------------
  const standaloneViews = [
    {
      name: 'HomePage',
      file: 'src/components/HomePage.jsx',
      props: { onExploreProducts: () => {}, onNavigateHome: () => {} },
      expectedTexts: ['RexaEdge', 'Products']
    },
    {
      name: 'FioriLaunchpad (Products)',
      file: 'src/components/FioriLaunchpad.jsx',
      props: { userRole: 'admin', userPermissions: [], enabledModules: ['bom'], subView: 'home', onNavigateHome: () => {}, onNavigateProducts: () => {} },
      expectedTexts: ['Products', 'Home', 'Bill of Materials']
    },
    {
      name: 'FioriLaunchpad (Bill of Materials Hub)',
      file: 'src/components/FioriLaunchpad.jsx',
      props: { userRole: 'admin', userPermissions: [], enabledModules: ['bom'], subView: 'bom_operations', onNavigateHome: () => {}, onNavigateProducts: () => {} },
      expectedTexts: ['Bill of Materials', 'Home', 'Products', 'Operations']
    },
    {
      name: 'CreateBomView (Create Single BOM)',
      file: 'src/components/CreateBomView.jsx',
      props: { systemKey: 'DEV', onBack: () => {}, onNavigateBom: () => {}, onNavigateProducts: () => {}, onNavigateHome: () => {} },
      expectedTexts: ['Create Single BOM', 'Home', 'Products', 'Bill of Materials']
    },
    {
      name: 'BulkCreateBomView (Create Bulk BOM)',
      file: 'src/components/BulkCreateBomView.jsx',
      props: { systemKey: 'DEV', onBack: () => {}, onNavigateBom: () => {}, onNavigateProducts: () => {}, onNavigateHome: () => {} },
      expectedTexts: ['Create Bulk BOM', 'Home', 'Products', 'Bill of Materials']
    },
    {
      name: 'CopyBomView (Copy Single BOM)',
      file: 'src/components/CopyBomView.jsx',
      props: { systemKey: 'DEV', onBack: () => {}, onNavigateBom: () => {}, onNavigateProducts: () => {}, onNavigateHome: () => {} },
      expectedTexts: ['Copy Single BOM', 'Home', 'Products', 'Bill of Materials']
    },
    {
      name: 'BulkBomView (Copy Bulk BOM)',
      file: 'src/components/BulkBomView.jsx',
      props: { systemKey: 'DEV', onBack: () => {}, onNavigateBom: () => {}, onNavigateProducts: () => {}, onNavigateHome: () => {} },
      expectedTexts: ['Copy Bulk BOM', 'Home', 'Products', 'Bill of Materials']
    },
    {
      name: 'DeleteBomView (Delete BOM)',
      file: 'src/components/DeleteBomView.jsx',
      props: { systemKey: 'DEV', onBack: () => {}, onNavigateBom: () => {}, onNavigateProducts: () => {}, onNavigateHome: () => {} },
      expectedTexts: ['Delete BOM', 'Home', 'Products', 'Bill of Materials']
    },
    {
      name: 'BomExplorerView (Display BOM)',
      file: 'src/components/BomExplorerView.jsx',
      props: { systemKey: 'DEV', onBack: () => {}, onNavigateBom: () => {}, onNavigateProducts: () => {}, onNavigateHome: () => {} },
      expectedTexts: ['Display BOM', 'Home', 'Products', 'Bill of Materials']
    },
    {
      name: 'ValidateBomView (Validate BOM)',
      file: 'src/components/ValidateBomView.jsx',
      props: { systemKey: 'DEV', onBack: () => {}, onNavigateBom: () => {}, onNavigateProducts: () => {}, onNavigateHome: () => {} },
      expectedTexts: ['Validate BOM', 'Home', 'Products', 'Bill of Materials']
    },
    {
      name: 'AdminActivityLogsView',
      file: 'src/components/AdminActivityLogsView.jsx',
      props: { currentUser: adminUser, onBack: () => {} },
      expectedTexts: ['Audit Logs', 'Error Logs']
    },
    {
      name: 'Login (Authentication)',
      file: 'src/components/Login.jsx',
      props: { onLoginSuccess: () => {} },
      expectedTexts: ['Sign In', 'RexaEdge']
    }
  ];

  for (const v of standaloneViews) {
    testCount++;
    const safeName = v.name.replace(/[^a-zA-Z0-9]/g, '_');
    const outFile = bundleComponent(v.file, safeName);
    const mod = await import(pathToFileURL(outFile).href);
    const Component = mod.default;

    // Test as Admin
    const htmlAdmin = safeRender(`${v.name} [Admin]`, React.createElement(Component, { ...v.props, currentUser: adminUser, userRole: 'admin' }));
    for (const text of v.expectedTexts) {
      assert(htmlAdmin.includes(text), `${v.name} [Admin] must contain expected text "${text}"`);
    }

    // Test as Normal User
    const htmlUser = safeRender(
      `${v.name} [Normal User]`,
      React.createElement(Component, {
        ...v.props,
        currentUser: normalUser,
        userRole: 'user',
        userPermissions: ['bom_display', 'bom_create', 'bom_copy', 'bom_delete', 'bom_validate']
      })
    );
    for (const text of v.expectedTexts) {
      assert(htmlUser.includes(text), `${v.name} [Normal User] must contain expected text "${text}"`);
    }

    console.log(`Test ${testCount}: ${v.name} (Admin & Normal User) rendered cleanly`);
    console.log(`   ✓ Breadcrumb/Title assertions verified: ${v.expectedTexts.join(' › ')}`);
  }

  // -------------------------------------------------------------
  // 2. AdminView - All 4 Tabs with Mock Data & Environment Formatting
  // -------------------------------------------------------------
  const adminBundleFile = bundleComponent('src/components/AdminView.jsx', 'AdminView');
  const adminMod = await import(pathToFileURL(adminBundleFile).href);
  const AdminViewComponent = adminMod.default;

  const adminTabs = [
    {
      tab: 'users',
      label: 'Users Tab',
      expected: ['Email address', 'Created date', 'admin@rexaedge.com']
    },
    {
      tab: 'servers',
      label: 'Servers Tab (Environment Formatting Check)',
      // formatEnvironment must render 'Dev', 'Sandbox', 'Prod' without crashing
      expected: ['Server name', 'Dev', 'Sandbox', 'Prod']
    },
    {
      tab: 'permissions',
      label: 'Permissions Tab (Environment Formatting Check)',
      // formatEnvironment must render 'Dev', 'Sandbox'
      expected: ['Target SAP server', 'Dev', 'Sandbox']
    },
    {
      tab: 'activity-logs',
      label: 'Activity Logs Tab',
      expected: ['Audit Logs', 'Error Logs']
    }
  ];

  for (const t of adminTabs) {
    testCount++;
    const html = safeRender(
      `AdminView - ${t.label}`,
      React.createElement(AdminViewComponent, {
        currentUser: adminUser,
        initialTab: t.tab,
        initialUsers: mockAdminUsers,
        initialServers: mockServers,
        initialPermissions: mockPermissions,
        onBack: () => {},
        onNavigateHome: () => {},
        onNavigateProducts: () => {}
      })
    );

    for (const text of t.expected) {
      assert(
        html.includes(text),
        `AdminView ${t.label} must contain "${text}" (verifying formatEnvironment and render)`
      );
    }
    console.log(`Test ${testCount}: AdminView [${t.label}] rendered cleanly with formatEnvironment checks`);
  }

  // -------------------------------------------------------------
  // 3. Full App.jsx Root Component Across Views (Admin & Normal User)
  // -------------------------------------------------------------
  // This verifies App's header, system bar, formatEnvironment imports, and view routing
  const appBundleFile = bundleComponent('src/App.jsx', 'AppRoot');
  const appMod = await import(pathToFileURL(appBundleFile).href);
  const AppComponent = appMod.default;

  const appViewScenarios = [
    // Unauthenticated -> Login view
    {
      label: 'Unauthenticated App (Login view)',
      props: { initialUser: null, initialCheckingAuth: false },
      expected: ['Sign In', 'RexaEdge']
    },
    // Admin on /home with Single Server (tests formatEnvironment in single-server header label)
    {
      label: 'Admin on /home with Single Server',
      props: {
        initialUser: adminUser,
        initialCheckingAuth: false,
        initialActiveTab: 'home',
        initialServers: [mockServers[0]],
        initialSelectedServer: mockServers[0]
      },
      expected: ['(Dev)', 'RexaEdge', 'Server', 'Products']
    },
    // Admin on /home with Multiple Servers (tests formatEnvironment in multi-server dropdown)
    {
      label: 'Admin on /home with Multiple Servers',
      props: {
        initialUser: adminUser,
        initialCheckingAuth: false,
        initialActiveTab: 'home',
        initialServers: mockServers,
        initialSelectedServer: mockServers[0]
      },
      expected: ['(Dev)', '(Sandbox)', '(Prod)', 'RexaEdge', 'Server']
    },
    // Normal User on /home with Multiple Servers
    {
      label: 'Normal User on /home with Multiple Servers',
      props: {
        initialUser: normalUser,
        initialCheckingAuth: false,
        initialActiveTab: 'home',
        initialServers: mockServers,
        initialSelectedServer: mockServers[0]
      },
      expected: ['(Dev)', '(Sandbox)', '(Prod)', 'RexaEdge']
    },
    // Admin on /products (Launchpad)
    {
      label: 'Admin on /products (Launchpad)',
      props: {
        initialUser: adminUser,
        initialCheckingAuth: false,
        initialActiveTab: 'launchpad',
        initialLaunchpadSubView: 'home',
        initialServers: mockServers,
        initialSelectedServer: mockServers[0]
      },
      expected: ['Products', 'Bill of Materials', '(Dev)']
    },
    // Admin on /products/bom (BOM Hub)
    {
      label: 'Admin on /products/bom (BOM Hub)',
      props: {
        initialUser: adminUser,
        initialCheckingAuth: false,
        initialActiveTab: 'launchpad',
        initialLaunchpadSubView: 'bom_operations',
        initialServers: mockServers,
        initialSelectedServer: mockServers[0]
      },
      expected: ['Bill of Materials', 'Operations', 'Products']
    },
    // Admin on Create Single BOM
    {
      label: 'Admin on Create Single BOM',
      props: {
        initialUser: adminUser,
        initialCheckingAuth: false,
        initialActiveTab: 'create_bom',
        initialServers: mockServers,
        initialSelectedServer: mockServers[0]
      },
      expected: ['Create Single BOM', 'Component*', 'Base Quantity']
    },
    // Normal User on Create Single BOM
    {
      label: 'Normal User on Create Single BOM',
      props: {
        initialUser: normalUser,
        initialCheckingAuth: false,
        initialActiveTab: 'create_bom',
        initialServers: [{ ...mockServers[0], permissions: ['bom.create'] }],
        initialSelectedServer: { ...mockServers[0], permissions: ['bom.create'] }
      },
      expected: ['Create Single BOM', 'Component*']
    },
    // Admin on /admin view
    {
      label: 'Admin on /admin view',
      props: {
        initialUser: adminUser,
        initialCheckingAuth: false,
        initialActiveTab: 'admin',
        initialServers: mockServers,
        initialSelectedServer: mockServers[0]
      },
      expected: ['Enterprise Administration', 'Users', 'Servers', 'Permissions']
    }
  ];

  for (const s of appViewScenarios) {
    testCount++;
    const html = safeRender(`App [${s.label}]`, React.createElement(AppComponent, s.props));
    for (const text of s.expected) {
      assert(
        html.includes(text),
        `App [${s.label}] must contain expected text "${text}"`
      );
    }
    if (s.label !== 'Unauthenticated App (Login view)') {
      assert(
        html.includes('sap-shell-header'),
        `App [${s.label}] must render top bar (.sap-shell-header)`
      );
    }
    console.log(`Test ${testCount}: Full App Root [${s.label}] rendered cleanly with zero errors`);
  }

} finally {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

console.log('\n============================================================');
console.log(`  ALL ${testCount} ROUTED VIEWS & APP SCENARIOS RENDERED CLEANLY!`);
console.log('============================================================\n');
