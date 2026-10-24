import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { supabaseService } from '../services/supabaseClient.js';
import { openRfcClient, toSapMatnr } from '../services/sapRfcClient.js';

async function testBapi(client, desc, { material, plant, bomUsage = '1', alternativeBom = '01', component }) {
  console.log(`\n============================================================`);
  console.log(`TESTRUN BAPI: ${desc}`);
  console.log(`Material: "${material}", Plant: "${plant}", Component: "${component}"`);
  console.log(`============================================================`);

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const bgrId = 'BGR_01';
  const altPadded = String(alternativeBom).padStart(2, '0');

  const bomGroup = [{
    BOM_GROUP_IDENTIFICATION: bgrId,
    BOM_USAGE: bomUsage,
    CREATED_IN_PLANT: plant
  }];

  const variants = [{
    BOM_GROUP_IDENTIFICATION: bgrId,
    OBJECT_ID: 'VAR_01',
    FUNCTION: 'NEW',
    ALTERNATIVE_BOM: altPadded,
    BOM_STATUS: '01',
    BASE_QTY: '1',
    BASE_UNIT: 'KG',
    VALID_FROM_DATE: today
  }];

  const bapiItems = [{
    BOM_GROUP_IDENTIFICATION: bgrId,
    ITEM_ID: 'ITM_001',
    OBJECT_ID: 'ITM_001',
    ITEM_NO: '0010',
    ITEM_CAT: 'L',
    COMPONENT: component,
    COMP_QTY: '5',
    COMP_UNIT: 'KG',
    VALID_FROM_DATE: today
  }];

  const itemAssignments = [{
    BOM_GROUP_IDENTIFICATION: bgrId,
    FUNCTION: 'NEW',
    SUPER_OBJECT_TYPE: 'BOM',
    SUPER_OBJECT_ID: 'VAR_01',
    SUB_OBJECT_TYPE: 'ITM',
    SUB_OBJECT_ID: 'ITM_001',
    VALID_FROM_DATE: today
  }];

  const materialRelations = [{
    BOM_GROUP_IDENTIFICATION: bgrId,
    MATERIAL: material,
    PLANT: plant,
    BOM_USAGE: bomUsage,
    ALTERNATIVE_BOM: altPadded
  }];

  const payload = {
    TESTRUN: { BAPIFLAG: 'X' },
    ALL_ERROR: 'X',
    BOMGROUP: bomGroup,
    VARIANTS: variants,
    ITEMS: bapiItems,
    ITEMASSIGNMENTS: itemAssignments,
    MATERIALRELATIONS: materialRelations,
    SUBITEMS: [],
    SUBITEMASSIGNMENTS: [],
    TEXTS: [],
    RETURN: []
  };

  const res = await client.call('BAPI_MATERIAL_BOM_GROUP_CREATE', payload);
  console.log('RETURN table:');
  console.log(JSON.stringify(res.RETURN, null, 2));
  return res.RETURN;
}

async function main() {
  const servers = await supabaseService.listServers({ includeSensitive: true, role: 'admin' });
  const hana = servers.find((s) => String(s.client) === '800');

  if (!hana) {
    console.error('Hana server (client 800) not found');
    process.exit(1);
  }

  const client = await openRfcClient(hana);

  try {
    // 1. Unpadded material "143", plant "16P2", component padded "000000000000000144"
    await testBapi(client, '1. Unpadded Material ("143") to Plant 16P2', {
      material: '143',
      plant: '16P2',
      component: '000000000000000144'
    });

    // 2. Padded material "000000000000000143", plant "16P2", component padded "000000000000000144"
    await testBapi(client, '2. Padded Material ("000000000000000143") to Plant 16P2', {
      material: '000000000000000143',
      plant: '16P2',
      component: '000000000000000144'
    });

    // 3. Padded material "000000000000000143", plant "16P2", component unpadded "144"
    await testBapi(client, '3. Padded Material + Unpadded Component ("144") to Plant 16P2', {
      material: '000000000000000143',
      plant: '16P2',
      component: '144'
    });

    // 4. Comparison: Padded material "000000000000000143", plant "16P1" (known working plant)
    await testBapi(client, '4. Padded Material to Plant 16P1 (Comparison in source plant)', {
      material: '000000000000000143',
      plant: '16P1',
      component: '000000000000000144'
    });

  } finally {
    await client.close();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
