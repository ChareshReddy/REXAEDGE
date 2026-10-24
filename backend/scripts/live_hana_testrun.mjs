import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { supabaseService } from '../services/supabaseClient.js';
import { rfcSimulateCopyBom } from '../services/sapRfcClient.js';
import { validateCopyBomParameters } from '../routes/chat.js';

async function main() {
  const servers = await supabaseService.listServers({ includeSensitive: true, role: 'admin' });
  const hana = servers.find((s) => String(s.client) === '800');

  if (!hana) {
    console.error('Hana server (client 800) not found');
    process.exit(1);
  }

  console.log('\n============================================================');
  console.log('LIVE TESTRUN on Hana (client 800)');
  console.log('Source: 143 / 16P1 / Usage 1');
  console.log('Target: 143 / 16P2 / Usage 1');
  console.log('============================================================\n');

  // 1. Direct rfcSimulateCopyBom call
  console.log('--- 1. Calling rfcSimulateCopyBom ---');
  const simRes = await rfcSimulateCopyBom({
    sourceMaterial: '143',
    sourcePlant: '16P1',
    sourceUsage: '1',
    sourceAlternative: '01',
    targetMaterial: '143',
    targetPlant: '16P2',
    targetUsage: '1',
    copyHierarchy: false,
    server: hana
  });

  console.log('Raw result from rfcSimulateCopyBom:');
  console.log(JSON.stringify(simRes, null, 2));

  // 2. Through validateCopyBomParameters (same function chat / Copy Single BOM calls)
  console.log('\n--- 2. Calling validateCopyBomParameters ---');
  const valRes = await validateCopyBomParameters({
    sourceMaterial: '143',
    sourcePlant: '16P1',
    sourceUsage: '1',
    sourceAltBom: '01',
    targetMaterial: '143',
    targetPlant: '16P2',
    targetUsage: '1',
    targetAltBom: '01',
    server: hana
  });

  console.log('Raw result from validateCopyBomParameters:');
  console.log(JSON.stringify(valRes, null, 2));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
