import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { openRfcClient } from '../services/sapRfcClient.js';
import { supabaseService } from '../services/supabaseClient.js';

async function checkFields(server, serverName) {
  console.log(`\n============================================================`);
  console.log(`Checking DD03L on ${serverName} (Client: ${server.client}, Host: ${server.ashost})`);
  console.log(`============================================================`);

  const client = await openRfcClient(server);
  try {
    const checks = [
      { tab: 'STAS', field: 'STLTY' },
      { tab: 'STAS', field: 'LKENZ' },
      { tab: 'STPO', field: 'STLTY' },
      { tab: 'STPO', field: 'LKENZ' }
    ];

    for (const c of checks) {
      const res = await client.call('RFC_READ_TABLE', {
        QUERY_TABLE: 'DD03L',
        DELIMITER: '|',
        OPTIONS: [{ TEXT: `TABNAME = '${c.tab}' AND FIELDNAME = '${c.field}'` }],
        FIELDS: [{ FIELDNAME: 'TABNAME' }, { FIELDNAME: 'FIELDNAME' }, { FIELDNAME: 'LENG' }, { FIELDNAME: 'DATATYPE' }],
        DATA: []
      });

      if (res.DATA && res.DATA.length > 0) {
        console.log(`✓ ${c.tab}-${c.field} EXISTS: "${res.DATA[0].WA.trim()}"`);
      } else {
        console.error(`✗ MISSING: ${c.tab}-${c.field} DOES NOT EXIST!`);
      }
    }
  } finally {
    await client.close();
  }
}

async function main() {
  const servers = await supabaseService.listServers({ includeSensitive: true, role: 'admin' });
  const relaxo = servers.find((s) => String(s.client) === '500');
  const hana = servers.find((s) => String(s.client) === '800');

  if (relaxo) {
    await checkFields(relaxo, 'Relaxo');
  } else {
    console.error('Relaxo server not found');
  }

  if (hana) {
    await checkFields(hana, 'Hana system');
  } else {
    console.error('Hana server not found');
  }
}

main().catch(console.error);
