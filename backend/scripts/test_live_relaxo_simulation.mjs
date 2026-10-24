import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { supabaseService } from '../services/supabaseClient.js';
import { openRfcClient, rfcExplodeBomHierarchy, rfcCreateBom } from '../services/sapRfcClient.js';

async function main() {
  const servers = await supabaseService.listServers({ includeSensitive: true, role: 'admin' });
  const relaxo = servers.find((s) => String(s.client) === '500');

  if (!relaxo) {
    console.error('Relaxo server not found');
    process.exit(1);
  }

  const client = await openRfcClient(relaxo);
  try {
    console.log('=== Exploding FL0002S-BKBK0011 in plant 1004 ===');
    const hier = await rfcExplodeBomHierarchy({
      material: 'FL0002S-BKBK0011',
      plant: '1004',
      bomUsage: '1',
      client
    });

    console.log(`Found ${hier.items?.length} BOMs in hierarchy.`);

    for (const itm of hier.items || []) {
      console.log(`\n--- Simulating BOM for Material ${itm.material} (Level ${itm.level}) to Plant 1001 ---`);
      const sim = await rfcCreateBom({
        material: itm.material,
        plant: '1001',
        bomUsage: itm.bomUsage || '1',
        alternativeBom: itm.alternativeBom || '01',
        components: itm.components,
        baseQty: itm.baseQty,
        baseUnit: itm.baseUnit,
        testRun: true,
        client
      });
      console.log('Result success:', sim.success);
      console.log('Result errors:', JSON.stringify(sim.errors, null, 2));
      console.log('Result returnMessages:', JSON.stringify(sim.returnMessages, null, 2));
    }
  } finally {
    await client.close();
  }
}

main().catch(console.error);
