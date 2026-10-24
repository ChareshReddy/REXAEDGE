import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { supabaseService } from '../services/supabaseClient.js';
import { openRfcClient, rfcReadBom, rfcExplodeBomHierarchy, toSapMatnr } from '../services/sapRfcClient.js';

async function main() {
  const servers = await supabaseService.listServers({ includeSensitive: true, role: 'admin' });
  const relaxo = servers.find((s) => String(s.client) === '500');

  if (!relaxo) {
    console.error('Relaxo server not found');
    process.exit(1);
  }

  const client = await openRfcClient(relaxo);
  try {
    console.log('=== Checking FL0002S-BKBK0011 in plant 1004 ===');
    const read = await rfcReadBom({
      material: 'FL0002S-BKBK0011',
      plant: '1004',
      bomUsage: '1',
      client
    });
    console.log('Read BOM success:', read.success, 'bomExists:', read.bomExists, 'componentCount:', read.componentCount);
    console.log('Components:', read.components);

    console.log('\n=== Exploding hierarchy for FL0002S-BKBK0011 in plant 1004 ===');
    const hier = await rfcExplodeBomHierarchy({
      material: 'FL0002S-BKBK0011',
      plant: '1004',
      bomUsage: '1',
      client
    });
    console.log('Hier totalLevels:', hier.totalLevels, 'totalBoms:', hier.totalBoms);
    for (const itm of hier.items || []) {
      console.log(`Level ${itm.level}: Material ${itm.material} (Components: ${itm.components?.length})`);
      for (const c of itm.components || []) {
        console.log(`   - Item ${c.item}: Component ${c.component} (Qty ${c.quantity} ${c.unit})`);
      }
    }

    // Check plants in T001W
    const plantsRes = await client.call('RFC_READ_TABLE', {
      QUERY_TABLE: 'T001W',
      DELIMITER: '|',
      FIELDS: [{ FIELDNAME: 'WERKS' }, { FIELDNAME: 'NAME1' }],
      ROWCOUNT: 10,
      DATA: []
    });
    console.log('\nSample plants on Relaxo:', plantsRes.DATA?.map(r => r.WA.trim()));

  } finally {
    await client.close();
  }
}

main().catch(console.error);
