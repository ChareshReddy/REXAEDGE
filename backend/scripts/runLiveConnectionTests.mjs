import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { supabaseService } from '../services/supabaseClient.js';
import { testServerConnection } from '../services/sapConnectionTest.js';

async function main() {
  console.log('=== Running Live SAP Connection Tests ===\n');

  const servers = await supabaseService.listServers({ includeSensitive: true, role: 'admin' });
  console.log(`Found ${servers.length} configured servers:`);
  for (const s of servers) {
    console.log(`- [${s.id}] "${s.name}" (Client: ${s.client}, Host: ${s.ashost}, HasCreds: ${s.has_password && Boolean(s.sap_username)})`);
  }

  // 1. Relaxo Server
  const relaxoServer = servers.find((s) => String(s.client) === '500' || s.name.toLowerCase().includes('relaxo'));
  if (relaxoServer) {
    console.log('\n------------------------------------------------------------');
    console.log(`[TEST 1] Running 5-point test on Relaxo (Client: ${relaxoServer.client}, Name: "${relaxoServer.name}")...`);
    console.log('------------------------------------------------------------');
    const start = Date.now();
    const result = await testServerConnection(relaxoServer, { persist: true });
    const dur = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`Relaxo Overall Status: ${result.overallStatus} (${dur}s)`);
    console.log(`Summary: ${result.summary}`);
    console.log('Checklist:');
    result.checks.forEach((c, idx) => {
      console.log(`  ${idx + 1}. [${c.status}] ${c.name}: ${c.message}`);
    });
  } else {
    console.log('Relaxo server not found.');
  }

  // 2. Hana Server
  const hanaServer = servers.find((s) => String(s.client) === '800' || s.name.toLowerCase().includes('hana'));
  if (hanaServer) {
    console.log('\n------------------------------------------------------------');
    console.log(`[TEST 2] Running 5-point test on Hana (Client: ${hanaServer.client}, Name: "${hanaServer.name}")...`);
    console.log('------------------------------------------------------------');
    const start = Date.now();
    const result = await testServerConnection(hanaServer, { persist: true });
    const dur = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`Hana Overall Status: ${result.overallStatus} (${dur}s)`);
    console.log(`Summary: ${result.summary}`);
    console.log('Checklist:');
    result.checks.forEach((c, idx) => {
      console.log(`  ${idx + 1}. [${c.status}] ${c.name}: ${c.message}`);
    });
  } else {
    console.log('Hana server not found.');
  }
}

main().catch(console.error);
