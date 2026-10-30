import { supabaseService } from '../services/supabaseClient.js';
import { runSearchRfc } from '../services/searchRfcClient.js';
import { searchMaterialsByOption } from '../services/searchByOptionService.js';
import { SAP_SEARCH_OPTIONS } from '../config/searchHelpOptions.js';

async function main() {
  const servers = await supabaseService.listServers({ includeSensitive: true, role: 'admin' });
  console.log(`Found ${servers.length} configured servers in database`);

  const results = [];

  for (const server of servers) {
    console.log(`\nTesting server: ${server.name} (${server.ashost}:${server.sysnr})`);

    let reachable = false;
    let reachError = null;
    try {
      await runSearchRfc({ server, timeoutMs: 5000 }, async (client) => {
        reachable = true;
      });
    } catch (e) {
      reachError = e.message;
    }

    if (!reachable) {
      console.log(`Server ${server.name} is unreachable / unconfigured: ${reachError}`);
      for (const opt of SAP_SEARCH_OPTIONS) {
        results.push({
          server: server.name,
          tab: opt.key,
          name: opt.name,
          status: 'Not reachable',
          table: opt.table || '-',
          fields: opt.fields ? opt.fields.map(f => f.id).join(', ') : '-',
          timeMs: '-',
          error: reachError
        });
      }
      continue;
    }

    // Server is reachable, test each of the 34 tabs!
    for (const opt of SAP_SEARCH_OPTIONS) {
      const start = Date.now();
      if (!opt.available) {
        results.push({
          server: server.name,
          tab: opt.key,
          name: opt.name,
          status: 'Not available on system',
          table: opt.table || '-',
          fields: '-',
          timeMs: 0,
          error: opt.unavailableReason || 'Not available'
        });
        console.log(`  Tab ${opt.key.padEnd(12)} -> Not available on system: ${opt.unavailableReason}`);
        continue;
      }

      // Sample query field for matching search
      const fields = {};
      if (opt.key === 'M') fields.MATNR = '1*';
      else if (opt.key === 'A') fields.BISMT = '1*';
      else if (opt.key === 'B') fields.WERKS = '1000';
      else if (opt.key === 'C') fields.MATNR = '1*';
      else if (opt.key === 'E') fields.KUNNR = '*';
      else if (opt.key === 'F') fields.WERKS = '1000';
      else if (opt.key === 'H') fields.PRDHA = '*';
      else if (opt.key === 'I') fields.IDNLF = '*';
      else if (opt.key === 'J') fields.ATTYP = '*';
      else if (opt.key === 'L') fields.MATKL = 'F*';
      else if (opt.key === 'N') fields.EAN11 = '8*';
      else if (opt.key === 'P') fields.PRDHA = '*';
      else if (opt.key === 'R') fields.WERKS = '1000';
      else if (opt.key === 'S') fields.VKORG = '1000';
      else if (opt.key === 'T') fields.MTART = 'ROH';
      else if (opt.key === 'V') fields.WERKS = '1000';
      else if (opt.key === 'W') fields.WERKS = '1000';
      else if (opt.key === 'GENERIC') fields.SATNR = 'XA1FL0464L*';
      else if (opt.key === 'G') fields.SATNR = 'XA1FL0464L*';
      else if (opt.key === 'MPN') fields.MATNR_HTN = 'SX0167L*';
      else if (opt.key === 'FFF') fields.MATNR_HTN = 'SX0167L*';
      else if (opt.key === 'SEGMENTATION') fields.SGT_CSGR = 'ZRFL*';
      else if (opt.key === 'FASHION') fields.FSH_SEASON_YEAR = '2024';
      else if (opt.key === 'ORIGINAL') fields.ORIGINAL_ART_NR = '*';
      else if (opt.key === 'FOLLOWUP') fields.FOLUP_ART_NR = '*';
      else if (opt.key === 'Z_INTER') fields.WERKS = '1000';
      else if (opt.key === 'U') fields.EAN11 = '*';
      else if (opt.key === 'Z_EAN') fields.EAN11 = '*';

      try {
        const res = await searchMaterialsByOption({
          tab: opt.key,
          fields,
          maxRows: 10,
          server,
          timeoutMs: 15000
        });
        const elapsed = Date.now() - start;

        // Also test non-matching search
        const nonMatchingFields = {};
        if (opt.fields && opt.fields.length > 0) {
          nonMatchingFields[opt.fields[0].id] = 'NONEXIST_XYZ_99999';
        }
        const nonMatchRes = await searchMaterialsByOption({
          tab: opt.key,
          fields: nonMatchingFields,
          maxRows: 10,
          server,
          timeoutMs: 15000
        });

        results.push({
          server: server.name,
          tab: opt.key,
          name: opt.name,
          status: 'Works',
          table: opt.table,
          fields: opt.fields ? opt.fields.map(f => f.id).join(', ') : '-',
          timeMs: elapsed,
          count: res.count,
          nonMatchCount: nonMatchRes.count,
          error: null
        });
        console.log(`  Tab ${opt.key.padEnd(12)} -> Works (${elapsed}ms, matching: ${res.count}, non-matching: ${nonMatchRes.count})`);
      } catch (err) {
        const elapsed = Date.now() - start;
        results.push({
          server: server.name,
          tab: opt.key,
          name: opt.name,
          status: 'Error',
          table: opt.table,
          fields: opt.fields ? opt.fields.map(f => f.id).join(', ') : '-',
          timeMs: elapsed,
          error: err.message
        });
        console.log(`  Tab ${opt.key.padEnd(12)} -> Error (${elapsed}ms): ${err.message}`);
      }
    }
  }

  console.log('\n--- BENCHMARK RESULTS SUMMARY TABLE ---');
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}

main().catch(console.error);
