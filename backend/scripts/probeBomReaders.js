import { Client } from 'open-rfc';
import { getRfcConnectionParams, DEFAULT_RFC_CLIENT_OPTIONS } from '../services/sapRfcClient.js';

const scriptServer = {
  id: process.env.SAP_SERVER_ID || 'script-probe',
  ashost: process.env.SAP_RFC_ASHOST || '192.168.12.241',
  sap_username: process.env.SAP_RFC_USER || 'MOCK_USER',
  sap_password: process.env.SAP_RFC_PASSWORD || 'MOCK_PASS',
  client: process.env.SAP_RFC_CLIENT || '500',
  sysnr: process.env.SAP_RFC_SYSNR || '09',
  router: process.env.SAP_RFC_ROUTER || '/H/103.206.249.51/H/'
};

const client = new Client(getRfcConnectionParams({ server: scriptServer }), DEFAULT_RFC_CLIENT_OPTIONS);

async function findBomReaders() {
  await client.open();
  console.log('Connected to S4A! Probing available BOM reading RFCs...');

  const candidates = [
    'BAPI_MATERIAL_BOM_GROUP_GETDET',
    'BAPI_BUS2001_GETBOM',
    'CS_BOM_EXPL_MAT_V2_HANA',
    'CSAP_MAT_BOM_READ',
    'CSON_BOM_READ',
    'RFC_GET_STRUCTURE_DEFINITION'
  ];

  for (const fn of candidates) {
    try {
      const res = await client.call(fn, {});
      console.log(`✅ ${fn}: SUCCESS or RETURN:`, res.RETURN || Object.keys(res));
    } catch (e) {
      console.log(`❌ ${fn}: ${e.message}`);
    }
  }

  await client.close();
}

findBomReaders();
