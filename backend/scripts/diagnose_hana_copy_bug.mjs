import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { supabaseService } from '../services/supabaseClient.js';
import { openRfcClient, toSapMatnr } from '../services/sapRfcClient.js';

async function main() {
  const servers = await supabaseService.listServers({ includeSensitive: true, role: 'admin' });
  const hana = servers.find((s) => String(s.client) === '800');

  if (!hana) {
    console.error('Hana server (client 800) not found in database');
    process.exit(1);
  }

  const client = await openRfcClient(hana);

  try {
    console.log('=== PART (b): Query MARA and MARC on Hana (client 800) ===');
    // Check MARA
    const maraPadded = await client.call('RFC_READ_TABLE', {
      QUERY_TABLE: 'MARA',
      DELIMITER: '|',
      OPTIONS: [{ TEXT: `MATNR = '${toSapMatnr('143')}'` }],
      FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'MTART' }, { FIELDNAME: 'MEINS' }, { FIELDNAME: 'LVORM' }],
      DATA: []
    });
    console.log('MARA (padded 000000000000000143):', maraPadded.DATA);

    // Check MARC in 16P1
    const marc16P1 = await client.call('RFC_READ_TABLE', {
      QUERY_TABLE: 'MARC',
      DELIMITER: '|',
      OPTIONS: [{ TEXT: `MATNR = '${toSapMatnr('143')}' AND WERKS = '16P1'` }],
      FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'WERKS' }, { FIELDNAME: 'LVORM' }, { FIELDNAME: 'PSTAT' }],
      DATA: []
    });
    console.log('MARC in 16P1:', marc16P1.DATA);

    // Check MARC in 16P2
    const marc16P2 = await client.call('RFC_READ_TABLE', {
      QUERY_TABLE: 'MARC',
      DELIMITER: '|',
      OPTIONS: [{ TEXT: `MATNR = '${toSapMatnr('143')}' AND WERKS = '16P2'` }],
      FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'WERKS' }, { FIELDNAME: 'LVORM' }, { FIELDNAME: 'PSTAT' }],
      DATA: []
    });
    console.log('MARC in 16P2:', marc16P2.DATA);

    // Check all plants for material 143 in MARC
    const marcAll = await client.call('RFC_READ_TABLE', {
      QUERY_TABLE: 'MARC',
      DELIMITER: '|',
      OPTIONS: [{ TEXT: `MATNR = '${toSapMatnr('143')}'` }],
      FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'WERKS' }, { FIELDNAME: 'LVORM' }, { FIELDNAME: 'PSTAT' }],
      DATA: []
    });
    console.log('MARC all plants for 143:', marcAll.DATA);

    // Check plant 16P2 in T001W to see if plant 16P2 exists
    const t001w = await client.call('RFC_READ_TABLE', {
      QUERY_TABLE: 'T001W',
      DELIMITER: '|',
      OPTIONS: [{ TEXT: `WERKS = '16P2'` }],
      FIELDS: [{ FIELDNAME: 'WERKS' }, { FIELDNAME: 'NAME1' }],
      DATA: []
    });
    console.log('T001W for plant 16P2:', t001w.DATA);

    // Check Component 144 in MARC for 16P2
    const marc144 = await client.call('RFC_READ_TABLE', {
      QUERY_TABLE: 'MARC',
      DELIMITER: '|',
      OPTIONS: [{ TEXT: `MATNR = '${toSapMatnr('144')}'` }],
      FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'WERKS' }, { FIELDNAME: 'LVORM' }],
      DATA: []
    });
    console.log('MARC all plants for component 144:', marc144.DATA);

    console.log('\n=== Check Function Interface for BAPI_MATERIAL_BOM_GROUP_CREATE ===');
    try {
      const funcInt = await client.call('RFC_GET_FUNCTION_INTERFACE', {
        FUNCNAME: 'BAPI_MATERIAL_BOM_GROUP_CREATE'
      });
      const paramList = (funcInt.PARAMS || []).map(p => ({
        param: p.PARAMETER,
        type: p.PARAMCLASS,
        default: p.DEFAULT,
        optional: p.OPTIONAL
      }));
      console.log('BAPI parameters:', paramList);
    } catch (err) {
      console.log('Could not get function interface:', err.message);
    }

  } finally {
    await client.close();
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
