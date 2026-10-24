import assert from 'assert';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import app from '../server.js';
import { supabaseService } from '../services/supabaseClient.js';
import { MODULE_REGISTRY, MODULE_KEYS } from '../config/modules.js';

console.log('============================================================');
console.log('  RUNNING ADMIN SERVERLESS VISIBILITY & ACCESS TESTS        ');
console.log('============================================================\n');

let server;
let baseUrl;

function makeRequest(method, reqPath, body = null, tokenOrHeaders = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(reqPath, baseUrl);
    const headers = {};

    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    if (typeof tokenOrHeaders === 'string') {
      headers['Authorization'] = `Bearer ${tokenOrHeaders}`;
    } else if (tokenOrHeaders && typeof tokenOrHeaders === 'object') {
      Object.assign(headers, tokenOrHeaders);
    }

    const req = http.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {
          json = data;
        }

        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// ---------------------------------------------------------------------------
// PART 1: Backend Endpoint Access Tests
// ---------------------------------------------------------------------------
server = http.createServer(app);
await new Promise((resolve) => server.listen(0, resolve));
const port = server.address().port;
baseUrl = `http://localhost:${port}`;

process.env.USE_MOCK_SAP = 'true';
process.env.SKIP_GATEWAY_AUTH = 'false';

try {
  console.log('Test 1: Setting up test users (admin and regular users)...');
  const adminLogin = await makeRequest('POST', '/api/auth/login', {
    email: 'admin@nextitpoint.com',
    password: 'Admin@123456'
  });
  assert.strictEqual(adminLogin.status, 200, 'Admin login must succeed');
  const adminToken = adminLogin.data.token;

  // Regular user with zero server access
  const zeroServerUserEmail = `zero_server_${Date.now()}@nextitpoint.com`;
  const zeroUserRes = await makeRequest(
    'POST',
    '/api/admin/users',
    {
      email: zeroServerUserEmail,
      password: 'Password@123',
      role: 'user'
    },
    adminToken
  );
  assert.strictEqual(zeroUserRes.status, 201);

  const zeroUserLogin = await makeRequest('POST', '/api/auth/login', {
    email: zeroServerUserEmail,
    password: 'Password@123'
  });
  assert.strictEqual(zeroUserLogin.status, 200);
  const zeroUserToken = zeroUserLogin.data.token;

  // Regular user with 1 server access (with BOM enabled)
  const oneServerUserEmail = `one_server_${Date.now()}@nextitpoint.com`;
  const oneUserRes = await makeRequest(
    'POST',
    '/api/admin/users',
    {
      email: oneServerUserEmail,
      password: 'Password@123',
      role: 'user'
    },
    adminToken
  );
  assert.strictEqual(oneUserRes.status, 201);
  const oneUserId = oneUserRes.data.user.id;

  // Create test server with only 'bom' enabled
  const srvRes = await makeRequest(
    'POST',
    '/api/admin/servers',
    {
      name: `Test Server ${Date.now()}`,
      ashost: '192.168.1.100',
      sysnr: '00',
      client: '100',
      environment: 'DEV',
      modules: ['bom'],
      sap_username: 'TEST_USER',
      sap_password: 'TestPassword123'
    },
    adminToken
  );
  assert.strictEqual(srvRes.status, 201);
  const testServerId = srvRes.data.server.id;

  // Grant oneServerUser access to testServer
  await makeRequest(
    'POST',
    '/api/admin/permissions',
    { user_id: oneUserId, server_id: testServerId },
    adminToken
  );

  const oneUserLogin = await makeRequest('POST', '/api/auth/login', {
    email: oneServerUserEmail,
    password: 'Password@123'
  });
  assert.strictEqual(oneUserLogin.status, 200);
  const oneUserToken = oneUserLogin.data.token;
  console.log('✓ PASS: Test users and server permissions initialized\n');


  // Test 2: Admin calls GET /api/modules with 0 servers
  console.log('Test 2: Admin calls GET /api/modules (always receives full module registry)...');
  const adminModulesRes = await makeRequest('GET', '/api/modules', null, adminToken);
  assert.strictEqual(adminModulesRes.status, 200);
  assert.strictEqual(adminModulesRes.data.success, true);
  const allRegistryKeys = MODULE_REGISTRY.map((m) => m.key);
  assert.deepStrictEqual(
    adminModulesRes.data.modules,
    allRegistryKeys,
    'Admin must receive all registered module keys independent of server existence'
  );
  console.log('✓ PASS: Admin receives all registered modules from GET /api/modules\n');


  // Test 3: Non-admin cannot get full list by calling GET /api/modules directly
  console.log('Test 3: Non-admin calling GET /api/modules directly is restricted...');
  // Case A: User with 0 servers
  const zeroUserModulesRes = await makeRequest('GET', '/api/modules', null, zeroUserToken);
  assert.strictEqual(zeroUserModulesRes.status, 200);
  assert.deepStrictEqual(
    zeroUserModulesRes.data.modules,
    [],
    'User with 0 servers must receive empty module list, not the full registry'
  );

  // Case B: User with 1 server having only 'bom'
  const oneUserModulesRes = await makeRequest('GET', '/api/modules', null, oneUserToken);
  assert.strictEqual(oneUserModulesRes.status, 200);
  assert.deepStrictEqual(
    oneUserModulesRes.data.modules,
    ['bom'],
    'User with 1 server must only receive modules enabled for their server (cannot get full list)'
  );
  console.log('✓ PASS: Non-admin cannot get the full module list by calling GET /api/modules directly\n');


  // Test 4: Admin calling GET /api/servers/:id/modules bypasses server_modules table
  console.log('Test 4: Admin calling GET /api/servers/:id/modules gets all modules...');
  const adminServerModsRes = await makeRequest('GET', `/api/servers/${testServerId}/modules`, null, adminToken);
  assert.strictEqual(adminServerModsRes.status, 200);
  assert.deepStrictEqual(
    adminServerModsRes.data.modules,
    allRegistryKeys,
    'Admin must receive all module keys from server modules endpoint'
  );

  const nonAdminServerModsRes = await makeRequest('GET', `/api/servers/${testServerId}/modules`, null, oneUserToken);
  assert.strictEqual(nonAdminServerModsRes.status, 200);
  assert.deepStrictEqual(
    nonAdminServerModsRes.data.modules,
    ['bom'],
    'Non-admin only receives server-configured modules'
  );
  console.log('✓ PASS: Admin bypass applies to server modules endpoint while non-admin remains guarded\n');

} finally {
  server.close();
}


// ---------------------------------------------------------------------------
// PART 2: Frontend Launchpad & Gate Component Tests
// ---------------------------------------------------------------------------
console.log('Test 5: Frontend FioriLaunchpad rendering tests (esbuild bundle)...');
const frontendDir = path.resolve(__dirname, '../../frontend');
const tempDir = path.resolve(frontendDir, 'src/.temp_serverless_test_build');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const launchpadOut = path.join(tempDir, 'FioriLaunchpad.mjs');
const esbuildPath = path.resolve(frontendDir, 'node_modules/esbuild/lib/main.js');
const { default: esbuild } = await import(pathToFileURL(esbuildPath).href);

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

const ReactPath = path.resolve(frontendDir, 'node_modules/react/index.js');
const ReactDOMServerPath = path.resolve(frontendDir, 'node_modules/react-dom/server.node.js');

const ReactModule = await import(pathToFileURL(ReactPath).href);
const React = ReactModule.default || ReactModule;
const { renderToStaticMarkup } = await import(pathToFileURL(ReactDOMServerPath).href);

const FioriLaunchpadModule = await import(pathToFileURL(launchpadOut).href);
const FioriLaunchpad = FioriLaunchpadModule.default;

try {
  // Test 5A: Admin with 0 servers (enabledModules = [])
  console.log('Test 5A: Admin with 0 servers on My Home...');
  const adminZeroServerHomeHtml = renderToStaticMarkup(
    React.createElement(FioriLaunchpad, {
      userRole: 'admin',
      userPermissions: [],
      enabledModules: [],
      subView: 'home',
      isLoading: false
    })
  );

  assert(adminZeroServerHomeHtml.includes('Bill of Materials'), 'Admin with 0 servers must see Bill of Materials on home');
  assert(!adminZeroServerHomeHtml.includes('No Modules Enabled'), 'Admin with 0 servers must NOT see "No Modules Enabled"');
  console.log('✓ PASS: Admin with 0 servers sees all modules on My Home (never empty state)\n');

  // Test 5B: Admin with 0 servers on BOM Hub (5 cards)
  console.log('Test 5B: Admin with 0 servers on BOM Hub...');
  const adminZeroServerHubHtml = renderToStaticMarkup(
    React.createElement(FioriLaunchpad, {
      userRole: 'admin',
      userPermissions: [],
      enabledModules: [],
      subView: 'bom_operations',
      isLoading: false
    })
  );

  assert(adminZeroServerHubHtml.includes('Create BOM'), 'Must see Create BOM group card');
  assert(adminZeroServerHubHtml.includes('Copy BOM'), 'Must see Copy BOM group card');
  assert(adminZeroServerHubHtml.includes('Display BOM'), 'Must see Display BOM card');
  assert(adminZeroServerHubHtml.includes('Validate BOM'), 'Must see Validate BOM card');
  assert(adminZeroServerHubHtml.includes('Delete BOM'), 'Must see Delete BOM card');

  const cardCount = (adminZeroServerHubHtml.match(/class="[^"]*fiori-op-card[^"]*"/g) || []).length;
  assert.strictEqual(cardCount, 5, `Admin must see all 5 cards on BOM Hub with 0 servers; got ${cardCount}`);
  console.log('✓ PASS: Admin with 0 servers sees all 5 cards on BOM Hub\n');

  // Test 5C: Admin on sub-pages with 0 servers
  console.log('Test 5C: Admin on sub-pages with 0 servers...');
  const createSubHtml = renderToStaticMarkup(
    React.createElement(FioriLaunchpad, {
      userRole: 'admin',
      userPermissions: [],
      enabledModules: [],
      subView: 'bom_create_operations'
    })
  );
  assert(createSubHtml.includes('Create Single BOM') && createSubHtml.includes('Create Bulk BOM'));

  const copySubHtml = renderToStaticMarkup(
    React.createElement(FioriLaunchpad, {
      userRole: 'admin',
      userPermissions: [],
      enabledModules: [],
      subView: 'bom_copy_operations'
    })
  );
  assert(copySubHtml.includes('Copy Single BOM') && copySubHtml.includes('Copy Bulk BOM'));
  console.log('✓ PASS: Admin sees all child cards on Create and Copy sub-pages with 0 servers\n');

  // Test 5D: Skeleton loading state while servers are loading
  console.log('Test 5D: Skeleton loading state during server discovery...');
  const skeletonHtml = renderToStaticMarkup(
    React.createElement(FioriLaunchpad, {
      userRole: 'admin',
      enabledModules: [],
      subView: 'home',
      isLoading: true
    })
  );
  assert(skeletonHtml.includes('Loading modules'), 'Skeleton grid must render when isLoading is true');
  assert(!skeletonHtml.includes('No Modules Enabled'), 'Must NOT show "No Modules Enabled" while loading');
  console.log('✓ PASS: Skeleton loading state renders cleanly without showing empty state\n');

  // Test 5E: Normal user with no access sees nothing new
  console.log('Test 5E: Normal user with no access sees empty state...');
  const normalUserNoAccessHtml = renderToStaticMarkup(
    React.createElement(FioriLaunchpad, {
      userRole: 'user',
      enabledModules: [],
      subView: 'home',
      isLoading: false
    })
  );
  assert(normalUserNoAccessHtml.includes('No Modules Enabled'), 'Normal user with 0 modules sees No Modules Enabled');

  const normalUserHubHtml = renderToStaticMarkup(
    React.createElement(FioriLaunchpad, {
      userRole: 'user',
      userPermissions: [],
      enabledModules: [],
      subView: 'bom_operations',
      isLoading: false
    })
  );
  const normalCardCount = (normalUserHubHtml.match(/class="[^"]*fiori-op-card[^"]*"/g) || []).length;
  assert.strictEqual(normalCardCount, 0, 'Normal user with no permissions sees 0 cards on hub');
  console.log('✓ PASS: Normal user with no access sees nothing new (current behavior preserved)\n');

} finally {
  try {
    if (fs.existsSync(launchpadOut)) fs.unlinkSync(launchpadOut);
    if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
  } catch {
    // Ignore cleanup errors
  }
}

// ---------------------------------------------------------------------------
// PART 3: Serverless Gate Mock Test (Simulating App.jsx View Gate)
// ---------------------------------------------------------------------------
console.log('Test 6: Admin opening operational card with 0 servers...');
function renderAppViewGate({ activeTab, selectedServer, user }) {
  if (activeTab !== 'launchpad' && activeTab !== 'admin' && !selectedServer && user?.role === 'admin') {
    return {
      type: 'SERVERLESS_GATE',
      title: 'Add a SAP server first',
      hasAdminLink: true,
      hasBOMHubLink: true
    };
  }
  if (activeTab === 'create_bom') {
    return { type: 'CREATE_BOM_VIEW' };
  }
  return { type: 'OTHER' };
}

// Case A: Admin opens create_bom with 0 servers
const adminZeroGate = renderAppViewGate({
  activeTab: 'create_bom',
  selectedServer: null,
  user: { role: 'admin' }
});
assert.strictEqual(adminZeroGate.type, 'SERVERLESS_GATE');
assert.strictEqual(adminZeroGate.title, 'Add a SAP server first');
assert.strictEqual(adminZeroGate.hasAdminLink, true);

// Case B: Admin opens create_bom with 1+ servers
const adminWithServerGate = renderAppViewGate({
  activeTab: 'create_bom',
  selectedServer: { id: 'srv-1', name: 'DEV Server' },
  user: { role: 'admin' }
});
assert.strictEqual(adminWithServerGate.type, 'CREATE_BOM_VIEW');

// Case C: Normal user with server opens create_bom
const normalUserGate = renderAppViewGate({
  activeTab: 'create_bom',
  selectedServer: { id: 'srv-1', name: 'DEV Server' },
  user: { role: 'user' }
});
assert.strictEqual(normalUserGate.type, 'CREATE_BOM_VIEW');
console.log('✓ PASS: Serverless gate correctly prompts admin to add server first when 0 servers exist\n');

console.log('============================================================');
console.log('  ALL ADMIN SERVERLESS VISIBILITY TESTS PASSED (100%)       ');
console.log('============================================================\n');
