process.env.NODE_ENV = 'test';
process.env.USE_MOCK_SAP = 'true';
process.env.USE_MOCK_SUPABASE = 'true';
process.env.SKIP_GATEWAY_AUTH = 'false';
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = 'c4a8990172bf46e9df53e9a4e4d6d678d120a1122bfbe2580b03e05151598f82';
}

import assert from 'assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import app from '../server.js';
import { inMemorySupabase, supabaseService, SAP_SERVERS_ALLOWED_COLUMNS } from '../services/supabaseClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

let server;
let baseUrl;

function makeRequest(method, pathStr, body = null, token = 'admin-test-token') {
  return new Promise((resolve, reject) => {
    const url = new URL(pathStr, baseUrl);
    const headers = {
      'Authorization': `Bearer ${token}`
    };
    if (body) headers['Content-Type'] = 'application/json';

    const req = http.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (_) {
          json = data;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Dynamically extract all defined column names for public.sap_servers from schema & migration SQL files.
 */
function extractSchemaColumnsForSapServers() {
  const sqlFiles = [
    path.resolve(rootDir, '../supabase/schema.sql'),
    path.resolve(rootDir, '../supabase/migrations/20261015_sap_servers_and_modules.sql'),
    path.resolve(rootDir, '../supabase/migrations/20261109_server_rfc_pool_and_queue.sql'),
    path.resolve(rootDir, 'schema/migration_user_owned_servers.sql'),
    path.resolve(rootDir, 'schema/migration_server_connection_test.sql')
  ];

  const columns = new Set();
  for (const filePath of sqlFiles) {
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');

    // Parse CREATE TABLE sap_servers (...)
    const createMatch = content.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?sap_servers\s*\(([\s\S]*?)\);/i);
    if (createMatch) {
      const lines = createMatch[1].split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('--') || trimmed.toUpperCase().startsWith('CONSTRAINT') || trimmed.toUpperCase().startsWith('PRIMARY')) continue;
        const colMatch = trimmed.match(/^([a-z0-9_]+)\s+/i);
        if (colMatch && !['CHECK', 'UNIQUE', 'FOREIGN'].includes(colMatch[1].toUpperCase())) {
          columns.add(colMatch[1].toLowerCase());
        }
      }
    }

    // Parse ALTER TABLE sap_servers ADD COLUMN ...
    const alterBlocks = content.matchAll(/ALTER\s+TABLE\s+(?:public\.)?sap_servers\s+([\s\S]*?);/gi);
    for (const b of alterBlocks) {
      const colMatches = b[1].matchAll(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z0-9_]+)/gi);
      for (const m of colMatches) {
        columns.add(m[1].toLowerCase());
      }
    }
  }

  return columns;
}

async function run() {
  server = http.createServer(app);
  await new Promise(r => server.listen(0, r));
  baseUrl = `http://localhost:${server.address().port}`;

  try {
    // 1. Assert removed endpoints return 404 in User-Owned Servers architecture
    {
      const res = await makeRequest('POST', '/api/admin/servers', { name: 'Test' });
      assert.strictEqual(res.status, 404, 'POST /api/admin/servers must return 404 on removed route');
      console.log('   ✓ Verified POST /api/admin/servers returns 404 (removed route)');
    }

    // 2. Extract schema columns dynamically from SQL files
    const schemaColumns = extractSchemaColumnsForSapServers();
    assert.ok(schemaColumns.has('queue_timeout_ms'), 'Schema must define queue_timeout_ms');
    assert.ok(schemaColumns.has('rfc_call_timeout_ms'), 'Schema must define rfc_call_timeout_ms');
    assert.ok(schemaColumns.has('sap_password_encrypted'), 'Schema must define sap_password_encrypted');
    assert.strictEqual(schemaColumns.has('queue_timeout_seconds'), false, 'Schema must NOT define queue_timeout_seconds');
    assert.strictEqual(schemaColumns.has('rfc_call_timeout_seconds'), false, 'Schema must NOT define rfc_call_timeout_seconds');
    assert.strictEqual(schemaColumns.has('validated_ip'), false, 'Schema must NOT define validated_ip');
    console.log(`   ✓ Successfully extracted ${schemaColumns.size} schema columns from database SQL files`);

    // Ensure allowlist has mock host and allow untested servers
    inMemorySupabase.allowlist = [
      { pattern: '10.0.0.0/8', type: 'Sandbox', comment: 'Sandbox CIDR' },
      { pattern: '10.20.30.40', type: 'Development', comment: 'Dev host' },
      { pattern: '192.168.1.100', type: 'Production', comment: 'Prod host' }
    ];
    inMemorySupabase.admin_settings = { allow_untested_servers: true, require_test_connection: false };

    // Seed test user token
    const testUser = inMemorySupabase.users[0] || {
      id: 'usr_schema_test_1',
      email: 'test@rexaedge.com',
      role: 'admin',
      is_disabled: false
    };

    // 3. Spy on createUserServer and updateUserServer writes
    const writtenServerPayloads = [];
    const origCreate = inMemorySupabase.createUserServer.bind(inMemorySupabase);
    inMemorySupabase.createUserServer = function(serverData, ownerId) {
      writtenServerPayloads.push({ action: 'create', data: { ...serverData } });
      return origCreate(serverData, ownerId);
    };

    const origUpdate = inMemorySupabase.updateUserServer.bind(inMemorySupabase);
    inMemorySupabase.updateUserServer = function(serverId, ownerId, updateData) {
      writtenServerPayloads.push({ action: 'update', data: { ...updateData } });
      return origUpdate(serverId, ownerId, updateData);
    };

    // 4. Test POST /api/servers writes ONLY valid schema columns and converts units correctly
    const createRes = await makeRequest('POST', '/api/servers', {
      name: 'Schema Guard Test Server',
      ashost: '10.20.30.40',
      sysnr: '00',
      client: '100',
      sap_username: 'TEST_USER',
      sap_password: 'SecretPassword123!',
      max_connections: 3,
      per_user_limit: 2,
      queue_timeout_seconds: 15, // Test unit conversion from seconds
      rfc_call_timeout_seconds: 30, // Test unit conversion from seconds
      allow_untested: true
    });

    assert.strictEqual(createRes.status, 201, `Failed to create server: ${JSON.stringify(createRes.body)}`);
    const createdServerId = createRes.body.server.id;

    // Verify intercepted creation payload
    const lastCreate = writtenServerPayloads.find(p => p.action === 'create');
    assert.ok(lastCreate, 'Server creation write must be intercepted');

    for (const key of Object.keys(lastCreate.data)) {
      assert.ok(
        schemaColumns.has(key),
        `Column mismatch: Servers API attempted to write column "${key}" which does not exist in schema files!`
      );
    }

    // Verify unit conversions and field mappings
    assert.strictEqual(lastCreate.data.queue_timeout_ms, 15000, 'queue_timeout_seconds must be converted to queue_timeout_ms in ms');
    assert.strictEqual(lastCreate.data.rfc_call_timeout_ms, 30000, 'rfc_call_timeout_seconds must be converted to rfc_call_timeout_ms in ms');
    assert.strictEqual(lastCreate.data.environment, 'DEV', 'DB environment must satisfy sap_servers_environment_check constraint');
    assert.strictEqual(createRes.body.server.environment, 'Development', 'API response environment must match allowlist type');
    assert.strictEqual(createRes.body.server.type, 'Development', 'API response type must match allowlist type');
    assert.strictEqual('queue_timeout_seconds' in lastCreate.data, false, 'queue_timeout_seconds must not be written');
    assert.strictEqual('rfc_call_timeout_seconds' in lastCreate.data, false, 'rfc_call_timeout_seconds must not be written');
    assert.strictEqual('type' in lastCreate.data, false, 'type must not be written as database column');
    assert.strictEqual('validated_ip' in lastCreate.data, false, 'validated_ip must not be written to database');
    assert.strictEqual('sap_password' in lastCreate.data, false, 'Plaintext sap_password must not be written');
    console.log('   ✓ Verified POST /api/servers writes ONLY schema columns with correct ms unit conversion');

    // 5. Test PUT /api/servers/:id writes ONLY valid schema columns and converts units correctly
    const updateRes = await makeRequest('PUT', `/api/servers/${createdServerId}`, {
      queue_timeout_seconds: 25,
      rfc_call_timeout_seconds: 50
    });

    assert.strictEqual(updateRes.status, 200, `Failed to update server: ${JSON.stringify(updateRes.body)}`);
    const lastUpdate = writtenServerPayloads.find(p => p.action === 'update');
    assert.ok(lastUpdate, 'Server update write must be intercepted');

    for (const key of Object.keys(lastUpdate.data)) {
      assert.ok(
        schemaColumns.has(key),
        `Column mismatch on update: Servers API attempted to write column "${key}" which does not exist in schema files!`
      );
    }

    assert.strictEqual(lastUpdate.data.queue_timeout_ms, 25000, 'Updated queue_timeout_seconds must convert to queue_timeout_ms');
    assert.strictEqual(lastUpdate.data.rfc_call_timeout_ms, 50000, 'Updated rfc_call_timeout_seconds must convert to rfc_call_timeout_ms');
    assert.strictEqual('queue_timeout_seconds' in lastUpdate.data, false);
    assert.strictEqual('rfc_call_timeout_seconds' in lastUpdate.data, false);
    console.log('   ✓ Verified PUT /api/servers/:id writes ONLY schema columns with correct ms unit conversion');

    // 6. Test connection-test endpoint returns allowlist type, NOT "Verified"
    const testConnRes = await makeRequest('POST', '/api/servers/test', {
      ashost: '10.20.30.40',
      sysnr: '00',
      client: '100'
    });

    assert.strictEqual(testConnRes.status, 200, `Connection test failed: ${JSON.stringify(testConnRes.body)}`);
    assert.strictEqual(testConnRes.body.type, 'Development', 'Connection test must return allowlist type (Development)');
    assert.ok(testConnRes.body.message.includes('Type: Development'), `Message must include allowlist type: ${testConnRes.body.message}`);
    assert.strictEqual(testConnRes.body.message.includes('Type: Verified'), false, 'Message must NOT show "Type: Verified"');
    console.log('   ✓ Verified test-connection returns allowlist type (Development), not "Type: Verified"');

    // 7. Verify SAP_SERVERS_ALLOWED_COLUMNS matches schemaColumns
    for (const col of SAP_SERVERS_ALLOWED_COLUMNS) {
      assert.ok(schemaColumns.has(col), `SAP_SERVERS_ALLOWED_COLUMNS entry "${col}" not found in schema files`);
    }
    console.log('   ✓ Verified SAP_SERVERS_ALLOWED_COLUMNS whitelist strictly matches schema files');

    console.log('✓ serverCreationResilience.test.js: All schema integrity and allowlist type tests passed');
  } finally {
    server.close();
  }
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
