import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { supabaseService } from '../services/supabaseClient.js';
import { openRfcClient, toSapMatnr, formatRfcTableOptions } from '../services/sapRfcClient.js';

async function main() {
  const servers = await supabaseService.listServers({ includeSensitive: true, role: 'admin' });
  const relaxo = servers.find((s) => String(s.client) === '500');
  const client = await openRfcClient(relaxo);

  try {
    const testPlants = ['1001', '1002', '1003', '1005', '1010'];
    const matsToCheck = ['FL0002S-BKBK0011', 'PCFL0003G', 'A1FL0002S-BKBK0011', '000000000012001525', 'PPFL0010G', 'B1FL0002S-BKBK0011', 'H2EVBLK0001'];

    for (const plt of testPlants) {
      const orSql = matsToCheck.map(m => `MATNR = '${toSapMatnr(m)}'`).join(' OR ');
      const marcRes = await client.call('RFC_READ_TABLE', {
        QUERY_TABLE: 'MARC',
        DELIMITER: '|',
        OPTIONS: formatRfcTableOptions(`WERKS = '${plt}' AND ( ${orSql} )`),
        FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'WERKS' }],
        DATA: []
      });
      const foundMats = new Set(marcRes.DATA?.map(r => r.WA.split('|')[0]?.trim()));
      const missing = matsToCheck.filter(m => !foundMats.has(toSapMatnr(m)) && !foundMats.has(m));
      console.log(`Plant ${plt}: ${foundMats.size}/${matsToCheck.length} maintained. Missing in ${plt}:`, missing);
    }
  } finally {
    await client.close();
  }
}

main().catch(console.error);
