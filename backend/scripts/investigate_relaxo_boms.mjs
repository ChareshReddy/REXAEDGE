import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { openRfcClient, rfcReadBom, rfcValidateSourceBom, rfcGetBomDisplayData, toSapMatnr } from '../services/sapRfcClient.js';
import { supabaseService } from '../services/supabaseClient.js';

async function main() {
  console.log('=== INVESTIGATION OF RELAXO BOMS (READ-ONLY, ZERO SAP WRITES) ===\n');

  const servers = await supabaseService.listServers({ includeSensitive: true, role: 'admin' });
  const relaxoServer = servers.find((s) => String(s.client) === '500' || s.name.toLowerCase().includes('relaxo'));
  if (!relaxoServer) {
    console.error('Relaxo server not found!');
    return;
  }

  const client = await openRfcClient(relaxoServer);
  console.log('Connected to Relaxo RFC successfully.\n');

  try {
    const testCases = [
      { mat: 'A1PSB001B', plant: '1010', usage: '1' },
      { mat: 'XHHF001L-LBBL0003', plant: '1012', usage: '1' }
    ];

    for (const tc of testCases) {
      console.log('================================================================================');
      console.log(`MATERIAL: ${tc.mat} | PLANT: ${tc.plant} | USAGE: ${tc.usage}`);
      console.log('================================================================================');

      // 1. Raw MAST table query
      const sapMat = toSapMatnr(tc.mat);
      const mastWhere = `MATNR = '${sapMat}' AND WERKS = '${tc.plant}'`;
      console.log(`\n[MAST QUERY] WHERE: ${mastWhere}`);
      const mastRes = await client.call('RFC_READ_TABLE', {
        QUERY_TABLE: 'MAST',
        DELIMITER: '|',
        OPTIONS: [{ TEXT: mastWhere }],
        FIELDS: [
          { FIELDNAME: 'MATNR' },
          { FIELDNAME: 'WERKS' },
          { FIELDNAME: 'STLAN' },
          { FIELDNAME: 'STLNR' },
          { FIELDNAME: 'STLAL' }
        ],
        DATA: []
      });

      const mastRows = (mastRes.DATA || []).map((r) => {
        const parts = r.WA.split('|');
        return {
          MATNR: parts[0]?.trim(),
          WERKS: parts[1]?.trim(),
          STLAN: parts[2]?.trim(),
          STLNR: parts[3]?.trim(),
          STLAL: parts[4]?.trim()
        };
      });
      console.log(`Found ${mastRows.length} MAST row(s):`, JSON.stringify(mastRows, null, 2));

      // For each distinct BOM group (STLNR)
      const stlnrs = [...new Set(mastRows.map((r) => r.STLNR))];
      for (const stlnr of stlnrs) {
        console.log(`\n--- Inspecting BOM Group STLNR = '${stlnr}' ---`);

        // Check STAS for all alternatives
        const stasWhere = `STLNR = '${stlnr}'`;
        console.log(`[STAS QUERY] WHERE: ${stasWhere}`);
        const stasRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'STAS',
          DELIMITER: '|',
          OPTIONS: [{ TEXT: stasWhere }],
          FIELDS: [
            { FIELDNAME: 'STLTY' },
            { FIELDNAME: 'STLNR' },
            { FIELDNAME: 'STLAL' },
            { FIELDNAME: 'STLKN' },
            { FIELDNAME: 'LKENZ' }
          ],
          DATA: []
        });
        const stasRows = (stasRes.DATA || []).map((r) => {
          const p = r.WA.split('|');
          return {
            STLTY: p[0]?.trim(),
            STLNR: p[1]?.trim(),
            STLAL: p[2]?.trim(),
            STLKN: p[3]?.trim(),
            LKENZ: p[4]?.trim()
          };
        });
        console.log(`STAS returned ${stasRows.length} row(s):`, JSON.stringify(stasRows, null, 2));

        // Check STPO for this BOM group
        const stpoWhere = `STLNR = '${stlnr}'`;
        console.log(`[STPO QUERY] WHERE: ${stpoWhere}`);
        const stpoRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'STPO',
          DELIMITER: '|',
          OPTIONS: [{ TEXT: stpoWhere }],
          FIELDS: [
            { FIELDNAME: 'STLTY' },
            { FIELDNAME: 'STLNR' },
            { FIELDNAME: 'STLKN' },
            { FIELDNAME: 'POSNR' },
            { FIELDNAME: 'IDNRK' },
            { FIELDNAME: 'MENGE' },
            { FIELDNAME: 'MEINS' }
          ],
          DATA: []
        });
        const stpoRows = (stpoRes.DATA || []).map((r) => {
          const p = r.WA.split('|');
          return {
            STLTY: p[0]?.trim(),
            STLNR: p[1]?.trim(),
            STLKN: p[2]?.trim(),
            POSNR: p[3]?.trim(),
            IDNRK: p[4]?.trim(),
            MENGE: p[5]?.trim(),
            MEINS: p[6]?.trim()
          };
        });
        console.log(`STPO returned ${stpoRows.length} row(s):`, JSON.stringify(stpoRows, null, 2));
      }

      // Now test rfcReadBom, rfcValidateSourceBom, and rfcGetBomDisplayData:
      // (a) with explicit alternative "01"
      console.log(`\n--- Calling Functions with EXPLICIT alternative "01" ---`);
      const read01 = await rfcReadBom({
        material: tc.mat,
        plant: tc.plant,
        bomUsage: tc.usage,
        alternativeBom: '01',
        client
      });
      console.log(`rfcReadBom("01"): success=${read01.success}, alt=${read01.alternativeBom}, count=${read01.componentCount}`);
      console.log('Components:', (read01.components || []).map((c) => ({ item: c.item, comp: c.component, qty: c.quantity })));

      const val01 = await rfcValidateSourceBom({
        material: tc.mat,
        plant: tc.plant,
        bomUsage: tc.usage,
        alternativeBom: '01',
        client
      });
      console.log(`rfcValidateSourceBom("01"): success=${val01.success}, alt=${val01.alternativeBom}, count=${val01.componentCount}`);
      console.log('Components:', (val01.components || []).map((c) => ({ item: c.item, comp: c.component, qty: c.quantity })));

      const disp01 = await rfcGetBomDisplayData({
        material: tc.mat,
        plant: tc.plant,
        bomUsage: tc.usage,
        alternativeBom: '01',
        multiLevel: false,
        client
      });
      console.log(`rfcGetBomDisplayData("01"): success=${disp01.success}, alt=${disp01.alternativeBom}, count=${disp01.componentCount}`);
      console.log('Components:', (disp01.components || []).map((c) => ({ item: c.item, comp: c.component, qty: c.quantity })));

      // (b) with BLANK alternative ""
      console.log(`\n--- Calling Functions with BLANK alternative "" ---`);
      const readBlank = await rfcReadBom({
        material: tc.mat,
        plant: tc.plant,
        bomUsage: tc.usage,
        alternativeBom: '',
        client
      });
      console.log(`rfcReadBom(""): success=${readBlank.success}, alt=${readBlank.alternativeBom}, count=${readBlank.componentCount}`);
      console.log('Components:', (readBlank.components || []).map((c) => ({ item: c.item, comp: c.component, qty: c.quantity })));

      const valBlank = await rfcValidateSourceBom({
        material: tc.mat,
        plant: tc.plant,
        bomUsage: tc.usage,
        alternativeBom: '',
        client
      });
      console.log(`rfcValidateSourceBom(""): success=${valBlank.success}, alt=${valBlank.alternativeBom}, count=${valBlank.componentCount}`);
      console.log('Components:', (valBlank.components || []).map((c) => ({ item: c.item, comp: c.component, qty: c.quantity })));

      const dispBlank = await rfcGetBomDisplayData({
        material: tc.mat,
        plant: tc.plant,
        bomUsage: tc.usage,
        alternativeBom: '',
        multiLevel: false,
        client
      });
      console.log(`rfcGetBomDisplayData(""): success=${dispBlank.success}, alt=${dispBlank.alternativeBom}, count=${dispBlank.componentCount}`);
      console.log('Components:', (dispBlank.components || []).map((c) => ({ item: c.item, comp: c.component, qty: c.quantity })));
    }
  } finally {
    await client.close();
    console.log('\nClosed Relaxo RFC client.');
  }
}

main().catch(console.error);
