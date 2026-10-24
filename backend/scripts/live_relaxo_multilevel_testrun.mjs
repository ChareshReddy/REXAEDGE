import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { supabaseService } from '../services/supabaseClient.js';
import { openRfcClient, rfcSimulateCopyBom } from '../services/sapRfcClient.js';

async function main() {
  const servers = await supabaseService.listServers({ includeSensitive: true, role: 'admin' });
  const relaxo = servers.find((s) => String(s.client) === '500');

  if (!relaxo) {
    console.error('Relaxo server not found');
    process.exit(1);
  }

  const client = await openRfcClient(relaxo);
  try {
    console.log('=== Running Live Read-Only rfcSimulateCopyBom on Relaxo ===');
    console.log('Source: FL0002S-BKBK0011 (Plant 1004) -> Target: FL0002S-BKBK0011 (Plant 1001)');
    console.log('copyHierarchy: true');

    const result = await rfcSimulateCopyBom({
      sourceMaterial: 'FL0002S-BKBK0011',
      sourcePlant: '1004',
      targetMaterial: 'FL0002S-BKBK0011',
      targetPlant: '1001',
      copyHierarchy: true,
      client
    });

    console.log('\n--- EXACT RAW RESULT ---');
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await client.close();
  }
}

main().catch(console.error);
