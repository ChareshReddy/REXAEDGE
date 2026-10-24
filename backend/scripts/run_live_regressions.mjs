import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { supabaseService } from '../services/supabaseClient.js';
import { rfcReadBom, rfcValidateSourceBom } from '../services/sapRfcClient.js';

function withTimeout(promise, ms = 30000, desc = 'RFC Call') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${desc} timed out after ${ms}ms`)), ms)
    )
  ]);
}

async function runCheck(desc, fn) {
  console.log(`\n============================================================`);
  console.log(`CHECK: ${desc}`);
  console.log(`============================================================`);
  try {
    const start = Date.now();
    const result = await withTimeout(fn(), 30000, desc);
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`[Completed in ${duration}s] Raw return:`);
    console.log(JSON.stringify(result, null, 2));
    return result;
  } catch (err) {
    console.error(`[FAILED]: ${err.message}`);
    return { error: err.message };
  }
}

async function main() {
  const servers = await supabaseService.listServers({ includeSensitive: true, role: 'admin' });
  const relaxo = servers.find((s) => String(s.client) === '500');
  const hana = servers.find((s) => String(s.client) === '800');

  if (!relaxo) {
    console.error('Relaxo server (client 500) not found in database');
    process.exit(1);
  }
  if (!hana) {
    console.error('Hana server (client 800) not found in database');
    process.exit(1);
  }

  // Check 1: Relaxo - A1PSB001B / plant 1010 / alt 01
  await runCheck('Relaxo (500) - rfcReadBom A1PSB001B plant 1010 alt 01', () =>
    rfcReadBom({
      material: 'A1PSB001B',
      plant: '1010',
      bomUsage: '1',
      alternativeBom: '01',
      server: relaxo
    })
  );

  await runCheck('Relaxo (500) - rfcValidateSourceBom A1PSB001B plant 1010 alt 01', () =>
    rfcValidateSourceBom({
      material: 'A1PSB001B',
      plant: '1010',
      bomUsage: '1',
      alternativeBom: '01',
      server: relaxo
    })
  );

  // Check 2: Relaxo - A1PSB001B / plant 1010 / alt 02
  await runCheck('Relaxo (500) - rfcReadBom A1PSB001B plant 1010 alt 02', () =>
    rfcReadBom({
      material: 'A1PSB001B',
      plant: '1010',
      bomUsage: '1',
      alternativeBom: '02',
      server: relaxo
    })
  );

  await runCheck('Relaxo (500) - rfcValidateSourceBom A1PSB001B plant 1010 alt 02', () =>
    rfcValidateSourceBom({
      material: 'A1PSB001B',
      plant: '1010',
      bomUsage: '1',
      alternativeBom: '02',
      server: relaxo
    })
  );

  // Check 3: Relaxo - XHHF001L-LBBL0003 / plant 1012 / alt 01
  await runCheck('Relaxo (500) - rfcReadBom XHHF001L-LBBL0003 plant 1012 alt 01', () =>
    rfcReadBom({
      material: 'XHHF001L-LBBL0003',
      plant: '1012',
      bomUsage: '1',
      alternativeBom: '01',
      server: relaxo
    })
  );

  await runCheck('Relaxo (500) - rfcValidateSourceBom XHHF001L-LBBL0003 plant 1012 alt 01', () =>
    rfcValidateSourceBom({
      material: 'XHHF001L-LBBL0003',
      plant: '1012',
      bomUsage: '1',
      alternativeBom: '01',
      server: relaxo
    })
  );

  // Check 4: Hana - 143 / plant 16P1 / alt 01
  await runCheck('Hana (800) - rfcReadBom 143 plant 16P1 alt 01', () =>
    rfcReadBom({
      material: '143',
      plant: '16P1',
      bomUsage: '1',
      alternativeBom: '01',
      server: hana
    })
  );

  await runCheck('Hana (800) - rfcValidateSourceBom 143 plant 16P1 alt 01', () =>
    rfcValidateSourceBom({
      material: '143',
      plant: '16P1',
      bomUsage: '1',
      alternativeBom: '01',
      server: hana
    })
  );
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
