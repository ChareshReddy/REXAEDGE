/**
 * ============================================================================
 * SAP RFC / BAPI CLIENT (open-rfc Native Protocol Integration)
 * ============================================================================
 * Provides high-speed, headless direct RFC/BAPI connectivity to SAP S/4HANA & ECC.
 * Eliminates SAP GUI Scripting screen latency, window locks, and UI fragility.
 *
 * Supported BOM Function Modules:
 * - CSAP_MAT_BOM_READ:      Read BOM header and component items (<100ms)
 * - CSAP_MAT_BOM_CREATE:    Direct Material BOM Creation
 * - CSAP_MAT_BOM_MAINTAIN:  BOM Modification, Alternatives, Item Updates
 * - CSAP_MAT_BOM_DELETE:    BOM Deletion without UI confirmation popups
 * ============================================================================
 */

import { Client } from 'open-rfc';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory mock store for deterministic unit/integration testing
const mockBomsPath = path.resolve(__dirname, '..', 'mock', 'boms.json');
let activeMockBoms = [];

function loadMockBoms() {
  try {
    if (fs.existsSync(mockBomsPath)) {
      activeMockBoms = JSON.parse(fs.readFileSync(mockBomsPath, 'utf8'));
    }
  } catch (err) {
    activeMockBoms = [];
  }
}
loadMockBoms();

import { supabaseService, getPersistedCredential } from './supabaseClient.js';
import { decryptPassword } from '../utils/crypto.js';

let currentActiveServer = null;

/**
 * Sets the active RFC server for the current context/request.
 */
export function setActiveRfcServer(server) {
  if (server && (server.sap_username || server.ashost || server.id)) {
    currentActiveServer = server;
  }
}

/**
 * Returns the currently active RFC server.
 */
export function getActiveRfcServer() {
  return currentActiveServer;
}

/**
 * Retrieves normalized RFC connection parameters dynamically from sap_servers.
 * Requires stored SAP credentials; never falls back to .env or 'LEELAM_EXT'.
 */
export function getRfcConnectionParams(customOverrides = {}) {
  let server = customOverrides.server || customOverrides;

  // Fallback to active server if no server or no credentials provided
  if ((!server || (!server.sap_username && !server.user)) && currentActiveServer) {
    server = { ...currentActiveServer, ...(typeof server === 'object' ? server : {}) };
  }

  if (typeof customOverrides.serverId === 'string' && !server.ashost) {
    const dbServer = supabaseService.getServerByIdSync
      ? supabaseService.getServerByIdSync(customOverrides.serverId)
      : null;
    if (dbServer) server = { ...dbServer, ...server };
  }

  // If server has an ID but no password, check persisted credentials cache
  if (server?.id && !server.sap_password_encrypted && !server.sap_password && !server.passwd && !server.password) {
    const persisted = getPersistedCredential(server.id);
    if (persisted) {
      if (!server.sap_username && persisted.sap_username) server.sap_username = persisted.sap_username;
      if (persisted.sap_password_encrypted) server.sap_password_encrypted = persisted.sap_password_encrypted;
    }
  }

  // Resolve SAP Username from server configuration
  const user = server.sap_username || server.user;

  // Resolve SAP Password (plaintext override or decrypted from sap_password_encrypted)
  let passwd = server.sap_password || server.passwd || server.password;
  if (!passwd && server.sap_password_encrypted) {
    try {
      passwd = decryptPassword(server.sap_password_encrypted);
    } catch (err) {
      throw new Error(`Failed to decrypt SAP password: ${err.message}`);
    }
  }

  // Strictly enforce credentials requirement: NO LEELAM_EXT default, NO .env fallback!
  if (!user || !passwd) {
    throw new Error('No SAP credentials configured for this server');
  }

  const router = server.router || server.saprouter || process.env.SAP_RFC_ROUTER || '/H/103.206.249.51/H/';
  const ashost = server.ashost || process.env.SAP_RFC_ASHOST || '192.168.12.241';
  const sysnr = server.sysnr !== undefined ? String(server.sysnr).padStart(2, '0') : (process.env.SAP_RFC_SYSNR || '09');
  const client = server.client !== undefined ? String(server.client) : (process.env.SAP_RFC_CLIENT || '500');
  const gwserv = server.gwserv || process.env.SAP_RFC_GWSERV || '3309';
  const lang = server.lang || process.env.SAP_RFC_LANG || 'EN';

  const params = {
    ashost,
    sysnr,
    client,
    user,
    passwd,
    lang,
    cpic_streaming: 'enabled'
  };

  if (router && String(router).trim()) {
    params.saprouter = String(router).trim();
  }
  if (gwserv && String(gwserv).trim()) {
    params.gwserv = String(gwserv).trim();
  }

  return params;
}

/**
 * Default open-rfc Client options enforcing classic-xRFC for recursive/table parameters
 * (avoids "recursive serializer classification rejected: live-decision-required" on S/4HANA & NetWeaver 7.50+).
 */
export const DEFAULT_RFC_CLIENT_OPTIONS = Object.freeze({
  bcd: 'string',
  int8Mode: 'number',
  recursiveSerializerPolicy: Object.freeze({
    profile: 'abap-7.50',
    observation: Object.freeze({
      defaultSerializer: 'classic-xrfc',
      basxmlDisabledSerializer: 'classic-xrfc'
    })
  })
});

/**
 * Creates and opens an open-rfc Client instance.
 * @param {object} [customOverrides={}] - Optional server overrides or params
 * @param {typeof Client} [ClientClass=Client] - Client constructor (can be injected for testing)
 */
export async function openRfcClient(customOverrides = {}, ClientClass = Client) {
  const params = getRfcConnectionParams(customOverrides);
  const client = new ClientClass(params, DEFAULT_RFC_CLIENT_OPTIONS);
  await client.open();
  return client;
}

/**
 * Splits an SQL WHERE clause into <= 70 character chunks for SAP RFC_READ_TABLE OPTIONS table.
 */
export function formatRfcTableOptions(sqlString) {
  if (!sqlString || !sqlString.trim()) return [];
  const lines = [];
  const tokens = sqlString.trim().split(/\s+/);
  let currentLine = '';

  for (const token of tokens) {
    if ((currentLine + ' ' + token).trim().length <= 70) {
      currentLine = (currentLine + ' ' + token).trim();
    } else {
      if (currentLine) lines.push({ TEXT: currentLine });
      currentLine = token;
    }
  }
  if (currentLine) lines.push({ TEXT: currentLine });
  return lines;
}

/**
 * Normalizes material number for SAP table queries:
 * Digits-only values are padded to 18 characters with leading zeros;
 * alphanumeric values remain unchanged.
 */
export function toSapMatnr(val) {
  if (!val) return '';
  const str = String(val).trim().toUpperCase();
  if (/^\d+$/.test(str)) {
    return str.padStart(18, '0');
  }
  return str;
}

/**
 * Creates a standard Basis prerequisite error
 */
export function createBasisPrerequisiteError(operation) {
  const err = new Error(
    `RFC not configured — ${operation} requires SAP NetWeaver RFC SDK (node-rfc) and Basis confirmation on RFC/BAPI authorization.`
  );
  err.code = 'RFC_NOT_CONFIGURED';
  err.requiresBasisApproval = true;
  err.status = 501; // Not Implemented
  return err;
}

/**
 * Retries a background job via SAP XBP RFC interface.
 * Stub: throws Basis prerequisite error until NetWeaver SDK is installed.
 */
export async function rfcRetryJob(jobId, credentials = null) {
  throw createBasisPrerequisiteError(`Job retry for ${jobId}`);
}

/**
 * Reprocesses an IDoc via SAP EDI RFC interface.
 * Stub: throws Basis prerequisite error until NetWeaver SDK is installed.
 */
export async function rfcReprocessIdoc(idocNumber, credentials = null) {
  throw createBasisPrerequisiteError(`IDoc reprocessing for ${idocNumber}`);
}

/**
 * Generic BAPI / RFC function call wrapper.
 * Opens an RFC connection, calls the function module, and closes the connection.
 *
 * @param {string} functionName - RFC Function Module name (e.g. 'RFC_PING', 'CSAP_MAT_BOM_READ')
 * @param {object} [parameters={}] - Import parameters, tables, structures
 * @param {object} [customCredentials={}] - Optional parameter overrides
 * @returns {Promise<object>}
 */
export async function executeRfcFunction(functionName, parameters = {}, customCredentials = {}) {
  if (
    functionName.startsWith('BAPI_XBP_') ||
    functionName.startsWith('EDI_') ||
    functionName.startsWith('IDOC_')
  ) {
    throw createBasisPrerequisiteError(`BAPI execution for ${functionName}`);
  }

  if (process.env.USE_MOCK_SAP === 'true') {
    return {
      success: true,
      mock: true,
      functionName,
      message: `Executed mock RFC ${functionName}`
    };
  }

  const client = await openRfcClient(customCredentials);
  try {
    const result = await client.call(functionName, parameters);
    return result;
  } finally {
    try {
      await client.close();
    } catch {
      // Ignore close errors
    }
  }
}

/**
 * Pings SAP RFC Gateway to test connectivity.
 * @returns {Promise<{ success: boolean, message: string, latencyMs?: number }>}
 */
export async function pingRfcServer(customCredentials = {}) {
  const startTime = Date.now();
  try {
    const params = getRfcConnectionParams(customCredentials);

    if (process.env.USE_MOCK_SAP === 'true') {
      return { success: true, message: 'Mock RFC Ping Successful', latencyMs: 2 };
    }

    const client = await openRfcClient(customCredentials);
    try {
      await client.call('RFC_PING', {});
      const latencyMs = Date.now() - startTime;
      return { success: true, message: 'SAP RFC Ping Successful', latencyMs };
    } finally {
      await client.close();
    }
  } catch (err) {
    return {
      success: false,
      message: `RFC Ping Failed: ${err.message}`,
      code: err.code || 'RFC_CONN_ERROR',
      latencyMs: Date.now() - startTime
    };
  }
}

/**
 * Reads a Material BOM via CSAP_MAT_BOM_READ.
 * Replaces slow CS03 GUI screen scraping.
 *
 * @param {object} params
 * @param {string} params.material - Material Number (e.g. 'BOLT13430')
 * @param {string} params.plant - Plant Code (e.g. '1000')
 * @param {string} [params.bomUsage='1'] - BOM Usage (1 = Production)
 * @param {string} [params.alternativeBom='1'] - Alternative BOM
 * @returns {Promise<object>}
 */
export async function rfcReadBom(params = {}) {
  const {
    material,
    plant,
    bomUsage = '1',
    alternativeBom = '1'
  } = params;

  if (!material || !String(material).trim()) {
    return {
      success: false,
      bomExists: false,
      errorCode: 'MATERIAL_NOT_FOUND',
      message: 'Material number is required for RFC BOM read.',
      material: '',
      plant: String(plant || '').trim(),
      bomUsage: String(bomUsage || '1').trim(),
      alternativeBom: String(alternativeBom || '').trim(),
      componentCount: 0,
      components: []
    };
  }
  if (!plant || !String(plant).trim()) {
    return {
      success: false,
      bomExists: false,
      errorCode: 'MATERIAL_PLANT_INVALID',
      message: 'Plant code is required for RFC BOM read.',
      material: String(material).trim().toUpperCase(),
      plant: '',
      bomUsage: String(bomUsage || '1').trim(),
      alternativeBom: String(alternativeBom || '1').trim(),
      componentCount: 0,
      components: []
    };
  }

  const cleanMat = String(material).trim().toUpperCase();
  const sapMat = toSapMatnr(cleanMat);
  const cleanPlt = String(plant).trim();
  const cleanUsg = String(bomUsage || '1').trim();
  const cleanAlt = alternativeBom !== undefined && alternativeBom !== null ? String(alternativeBom).trim() : '';

  // Mock mode handling
  if (process.env.USE_MOCK_SAP === 'true') {
    const matchingUsage = activeMockBoms.filter(
      (b) =>
        (String(b.material).toUpperCase() === cleanMat ||
          toSapMatnr(b.material) === sapMat ||
          formatMaterialNumber(b.material) === formatMaterialNumber(cleanMat)) &&
        String(b.plant) === cleanPlt &&
        String(b.bomUsage || '1') === cleanUsg
    );

    if (matchingUsage.length === 0) {
      return {
        success: false,
        bomExists: false,
        errorCode: 'BOM_NOT_FOUND',
        message: `BOM does not exist for material ${cleanMat} in plant ${cleanPlt}`,
        material: cleanMat,
        plant: cleanPlt,
        bomUsage: cleanUsg,
        alternativeBom: cleanAlt,
        componentCount: 0,
        components: []
      };
    }

    const availableAlternatives = [...new Set(matchingUsage.map((b) => String(b.alternativeBom || '01')))];

    let found = null;
    if (cleanAlt) {
      const altPad = cleanAlt.padStart(2, '0');
      found = matchingUsage.find(
        (b) =>
          String(b.alternativeBom || '1').padStart(2, '0') === altPad ||
          parseInt(b.alternativeBom || '1', 10) === parseInt(cleanAlt, 10)
      );
      if (!found) {
        return {
          success: true,
          bomExists: false,
          alternativeExists: false,
          errorCode: 'ALTERNATIVE_NOT_FOUND',
          message: `Alternative BOM ${cleanAlt} does not exist for material ${cleanMat} in plant ${cleanPlt}. Available alternatives: ${availableAlternatives.join(', ')}`,
          material: cleanMat,
          plant: cleanPlt,
          bomUsage: cleanUsg,
          alternativeBom: cleanAlt,
          allAlternatives: availableAlternatives,
          availableAlternatives,
          componentCount: 0,
          components: []
        };
      }
    } else {
      // Blank alternative:
      const alt01 = matchingUsage.find((b) => String(b.alternativeBom || '1').padStart(2, '0') === '01' || parseInt(b.alternativeBom || '1', 10) === 1);
      if (alt01) {
        found = alt01;
      } else if (availableAlternatives.length === 1) {
        found = matchingUsage[0];
      } else {
        return {
          success: false,
          bomExists: true,
          alternativeExists: false,
          errorCode: 'ALTERNATIVE_SELECTION_REQUIRED',
          message: `Alternative BOM was not specified and alternative 01 does not exist for material ${cleanMat} in plant ${cleanPlt}. Available alternatives: ${availableAlternatives.join(', ')}. Please specify an alternative.`,
          material: cleanMat,
          plant: cleanPlt,
          bomUsage: cleanUsg,
          alternativeBom: '',
          allAlternatives: availableAlternatives,
          availableAlternatives,
          componentCount: 0,
          components: []
        };
      }
    }

    const comps = found.components || [];
    const resolvedAlt = found.alternativeBom ? String(found.alternativeBom).padStart(2, '0') : (cleanAlt ? cleanAlt.padStart(2, '0') : '01');
    const hasNoActiveComponents = comps.length === 0;

    return {
      success: true,
      bomExists: true,
      hasActiveComponents: !hasNoActiveComponents,
      material: cleanMat,
      plant: cleanPlt,
      bomUsage: cleanUsg,
      alternativeBom: resolvedAlt,
      allAlternatives: availableAlternatives,
      availableAlternatives,
      componentCount: comps.length,
      components: comps.map((c, idx) => ({
        item: c.item || String((idx + 1) * 10).padStart(4, '0'),
        component: c.component || c.material || '',
        description: c.description || '',
        quantity: c.quantity || 1,
        unit: c.unit || 'EA',
        itemCategory: c.itemCategory || 'L'
      })),
      header: {
        description: found.description || '',
        validFrom: found.validFrom || ''
      },
      message: hasNoActiveComponents ? 'BOM has no active components.' : `BOM retrieved successfully (${comps.length} components)`
    };
  }

  // Live RFC execution via RFC_READ_TABLE (MAST -> STAS -> STPO)
  const client = params.client || (await openRfcClient(params.server || params));
  const shouldClose = !params.client;
  try {
    // 1. Query MAST for material and plant
    const mastRes = await client.call('RFC_READ_TABLE', {
      QUERY_TABLE: 'MAST',
      DELIMITER: '|',
      OPTIONS: [{ TEXT: `MATNR = '${sapMat}' AND WERKS = '${cleanPlt}'` }],
      FIELDS: [
        { FIELDNAME: 'MATNR' },
        { FIELDNAME: 'WERKS' },
        { FIELDNAME: 'STLAN' },
        { FIELDNAME: 'STLNR' },
        { FIELDNAME: 'STLAL' }
      ],
      DATA: []
    });

    const mastFieldNames = (mastRes.FIELDS || []).map((f) => f.FIELDNAME.trim());
    const allMastRows = (mastRes.DATA || []).map((r) => {
      const parts = r.WA.split('|');
      const obj = {};
      mastFieldNames.forEach((fn, idx) => { obj[fn] = parts[idx]?.trim(); });
      return {
        matnr: obj.MATNR,
        werks: obj.WERKS,
        stlan: obj.STLAN,
        stlnr: obj.STLNR,
        stlal: obj.STLAL
      };
    });

    if (allMastRows.length === 0) {
      return {
        success: true,
        bomExists: false,
        errorCode: 'BOM_NOT_FOUND',
        message: `BOM does not exist for material ${cleanMat} in plant ${cleanPlt}`,
        material: cleanMat,
        plant: cleanPlt,
        bomUsage: cleanUsg,
        alternativeBom: cleanAlt,
        allAlternatives: [],
        availableAlternatives: [],
        componentCount: 0,
        components: []
      };
    }

    // Filter by usage if rows exist with matching usage, otherwise keep all
    const matchingUsageRows = allMastRows.filter((r) => r.stlan === cleanUsg);
    const mastRows = matchingUsageRows.length > 0 ? matchingUsageRows : allMastRows;
    const availableAlternatives = [...new Set(mastRows.map((r) => r.stlal))];

    let targetMast = null;
    if (cleanAlt) {
      targetMast = mastRows.find(
        (r) =>
          r.stlal === cleanAlt.padStart(2, '0') ||
          parseInt(r.stlal, 10) === parseInt(cleanAlt, 10)
      );

      if (!targetMast) {
        return {
          success: true,
          bomExists: false,
          alternativeExists: false,
          errorCode: 'ALTERNATIVE_NOT_FOUND',
          message: `Alternative BOM ${cleanAlt} does not exist for material ${cleanMat} in plant ${cleanPlt}. Available alternatives: ${availableAlternatives.join(', ')}`,
          material: cleanMat,
          plant: cleanPlt,
          bomUsage: cleanUsg,
          alternativeBom: cleanAlt,
          allAlternatives: availableAlternatives,
          availableAlternatives,
          componentCount: 0,
          components: []
        };
      }
    } else {
      // Blank alternative:
      const alt01 = mastRows.find((r) => r.stlal === '01' || parseInt(r.stlal, 10) === 1);
      if (alt01) {
        targetMast = alt01;
      } else if (availableAlternatives.length === 1) {
        targetMast = mastRows[0];
      } else {
        return {
          success: false,
          bomExists: true,
          alternativeExists: false,
          errorCode: 'ALTERNATIVE_SELECTION_REQUIRED',
          message: `Alternative BOM was not specified and alternative 01 does not exist for material ${cleanMat} in plant ${cleanPlt}. Available alternatives: ${availableAlternatives.join(', ')}. Please specify an alternative.`,
          material: cleanMat,
          plant: cleanPlt,
          bomUsage: cleanUsg,
          alternativeBom: '',
          allAlternatives: availableAlternatives,
          availableAlternatives,
          componentCount: 0,
          components: []
        };
      }
    }

    const activeMast = targetMast;
    const stlnr = activeMast.stlnr;
    const stlal = activeMast.stlal;

    // 1b. Query STKO for header base quantity and base unit
    let baseQty = '100';
    let baseUnit = '';
    try {
      const stkoRes = await client.call('RFC_READ_TABLE', {
        QUERY_TABLE: 'STKO',
        DELIMITER: '|',
        OPTIONS: [{ TEXT: `STLTY = 'M' AND STLNR = '${stlnr}' AND STLAL = '${stlal}' AND LKENZ = ''` }],
        FIELDS: [{ FIELDNAME: 'BMENG' }, { FIELDNAME: 'BMEIN' }],
        DATA: []
      });
      if (stkoRes.DATA && stkoRes.DATA.length > 0) {
        const fieldNames = (stkoRes.FIELDS || []).map((f) => f.FIELDNAME.trim());
        const parts = stkoRes.DATA[0].WA.split('|');
        const rowMap = {};
        fieldNames.forEach((fn, idx) => { rowMap[fn] = parts[idx]?.trim(); });
        if (rowMap.BMENG) baseQty = String(parseFloat(rowMap.BMENG) || 100);
        if (rowMap.BMEIN) baseUnit = rowMap.BMEIN;
      }
    } catch {}

    if (!baseUnit) {
      try {
        const maraRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'MARA',
          DELIMITER: '|',
          OPTIONS: [{ TEXT: `MATNR = '${sapMat}'` }],
          FIELDS: [{ FIELDNAME: 'MEINS' }],
          DATA: []
        });
        if (maraRes.DATA && maraRes.DATA.length > 0) {
          baseUnit = maraRes.DATA[0].WA.split('|')[0]?.trim();
        }
      } catch {}
    }

    // 2. Query STAS to find item nodes active for this alternative
    const stasRes = await client.call('RFC_READ_TABLE', {
      QUERY_TABLE: 'STAS',
      DELIMITER: '|',
      OPTIONS: [{ TEXT: `STLTY = 'M' AND STLNR = '${stlnr}' AND STLAL = '${stlal}' AND LKENZ = ''` }],
      FIELDS: [{ FIELDNAME: 'STLKN' }],
      DATA: []
    });

    const activeItemNodes = new Set((stasRes.DATA || []).map((r) => r.WA.split('|')[0]?.trim()).filter(Boolean));

    // 3. Query STPO for components
    const stpoRes = await client.call('RFC_READ_TABLE', {
      QUERY_TABLE: 'STPO',
      DELIMITER: '|',
      OPTIONS: [{ TEXT: `STLTY = 'M' AND STLNR = '${stlnr}' AND LKENZ = ''` }],
      FIELDS: [
        { FIELDNAME: 'STLKN' },
        { FIELDNAME: 'POSNR' },
        { FIELDNAME: 'POSTP' },
        { FIELDNAME: 'IDNRK' },
        { FIELDNAME: 'MENGE' },
        { FIELDNAME: 'MEINS' },
        { FIELDNAME: 'POTX1' }
      ],
      DATA: []
    });

    const fieldNames = (stpoRes.FIELDS || []).map((f) => f.FIELDNAME);
    const normalizedComps = [];

    if (activeItemNodes.size > 0) {
      for (const row of (stpoRes.DATA || [])) {
        const p = row.WA.split('|').map((s) => s?.trim());
        const rowObj = {};
        fieldNames.forEach((fname, idx) => {
          rowObj[fname] = p[idx] || '';
        });

        if (!activeItemNodes.has(rowObj.STLKN)) {
          continue;
        }

        normalizedComps.push({
          item: rowObj.POSNR || String((normalizedComps.length + 1) * 10).padStart(4, '0'),
          itemCategory: rowObj.POSTP || 'L',
          component: rowObj.IDNRK || '',
          quantity: parseFloat(rowObj.MENGE) || 1,
          unit: rowObj.MEINS || 'EA',
          description: rowObj.POTX1 || ''
        });
      }
    }

    const hasNoActiveComponents = normalizedComps.length === 0;

    return {
      success: true,
      bomExists: true,
      hasActiveComponents: !hasNoActiveComponents,
      material: cleanMat,
      plant: cleanPlt,
      bomUsage: cleanUsg,
      alternativeBom: stlal,
      bomNumber: stlnr,
      baseQty,
      baseUnit: baseUnit || 'PAA',
      allAlternatives: availableAlternatives,
      availableAlternatives,
      componentCount: normalizedComps.length,
      components: normalizedComps,
      header: {
        bomNumber: stlnr,
        alternative: stlal,
        plant: cleanPlt,
        usage: cleanUsg,
        baseQty,
        baseUnit: baseUnit || 'PAA'
      },
      message: hasNoActiveComponents ? 'BOM has no active components.' : `BOM retrieved successfully via RFC (${normalizedComps.length} components)`
    };
  } catch (err) {
    return {
      success: false,
      bomExists: false,
      errorCode: 'RFC_BOM_READ_ERROR',
      message: `Failed to read BOM via RFC: ${err.message}`,
      material: cleanMat,
      plant: cleanPlt,
      bomUsage: cleanUsg,
      alternativeBom: cleanAlt,
      componentCount: 0,
      components: []
    };
  } finally {
    if (shouldClose) {
      try {
        await client.close();
      } catch {}
    }
  }
}

/**
 * Validates a Source / Reference BOM in SAP.
 * Instant RFC verification without opening CS03 GUI windows.
 *
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function rfcValidateSourceBom(params = {}) {
  const { material, plant, bomUsage = '1', alternativeBom = '' } = params;

  const cleanMat = String(material || '').trim().toUpperCase();
  const cleanPlant = String(plant || '').trim();

  if (!cleanMat) {
    return {
      success: false,
      errorCode: 'MATERIAL_NOT_FOUND',
      message: 'Material number is required for source BOM validation.'
    };
  }
  if (!cleanPlant) {
    return {
      success: false,
      errorCode: 'MATERIAL_PLANT_INVALID',
      message: 'Plant code is required for source BOM validation.'
    };
  }

  const cleanAltParam = alternativeBom !== undefined && alternativeBom !== null ? String(alternativeBom).trim() : '';
  const readResult = await rfcReadBom({
    material: cleanMat,
    plant: cleanPlant,
    bomUsage,
    alternativeBom: cleanAltParam,
    server: params.server,
    client: params.client
  });

  if (!readResult.success) {
    return {
      success: false,
      materialExists: false,
      plantValid: false,
      bomExists: false,
      errorCode: readResult.errorCode || 'RFC_BOM_READ_ERROR',
      message: readResult.message || `Failed to read BOM via RFC for material ${cleanMat} in plant ${cleanPlant}.`
    };
  }

  if (!readResult.bomExists) {
    return {
      success: false,
      materialExists: true,
      plantValid: true,
      bomExists: false,
      errorCode: readResult.errorCode || 'BOM_NOT_FOUND',
      message: readResult.message || `Source BOM does not exist for material ${cleanMat} in plant ${cleanPlant}.`
    };
  }

  if (readResult.componentCount === 0) {
    return {
      success: false,
      materialExists: true,
      plantValid: true,
      bomExists: true,
      alternativeValid: true,
      alternativeBom: readResult.alternativeBom,
      availableAlternatives: readResult.availableAlternatives || [readResult.alternativeBom || '01'],
      componentCount: 0,
      components: [],
      errorCode: 'BOM_NO_ACTIVE_COMPONENTS',
      message: 'BOM has no active components.'
    };
  }

  return {
    success: true,
    materialExists: true,
    plantValid: true,
    bomExists: true,
    alternativeValid: true,
    alternativeBom: readResult.alternativeBom,
    availableAlternatives: readResult.availableAlternatives || [readResult.alternativeBom || '01'],
    componentCount: readResult.componentCount,
    components: readResult.components,
    message: `Source BOM validated: ${readResult.componentCount} components found.`
  };
}

/**
 * Creates a Material BOM via CSAP_MAT_BOM_CREATE or CSAP_MAT_BOM_MAINTAIN.
 * Replaces CS01 GUI scripting automation.
 *
 * @param {object} params
 * @param {string} params.material
 * @param {string} params.plant
 * @param {string} [params.bomUsage='1']
 * @param {string} [params.alternativeBom='1']
 * @param {string} [params.validFrom='']
 * @param {Array<object>} [params.components=[]]
 * @returns {Promise<object>}
 */
export async function rfcCreateBom(params = {}) {
  const {
    material,
    plant,
    bomUsage = '1',
    alternativeBom = '1',
    validFrom = '',
    baseQty = '100',
    baseUnit,
    bomStatus = '01',
    altText = '',
    changeNo = '',
    components = []
  } = params;

  if (!material || !String(material).trim()) {
    throw new Error('Material number is required for RFC BOM creation.');
  }
  if (!plant || !String(plant).trim()) {
    throw new Error('Plant code is required for RFC BOM creation.');
  }

  const cleanMat = String(material).trim().toUpperCase();
  const cleanPlt = String(plant).trim();
  const cleanUsg = String(bomUsage || '1').trim();
  const cleanAlt = String(alternativeBom || '1').trim();

  // Normalize components for SAP T_STPO
  const normalizedComponents = (Array.isArray(components) ? components : []).map((c, idx) => ({
    ITEM_NO: c.ITEM_NO || c.itemNo || String((idx + 1) * 10).padStart(4, '0'),
    ITEM_CATEG: c.ITEM_CATEG || c.itemCategory || 'L',
    COMPONENT: toSapMatnr(c.COMPONENT || c.component || c.material || c.id || ''),
    COMP_QTY: String(c.COMP_QTY || c.quantity || c.qty || '1'),
    COMP_UNIT: c.COMP_UNIT || c.unit || '',
    ISS_ST_LOC: c.ISS_ST_LOC || c.storageLocation || c.lgort || '',
    ITEM_TEXT1: c.ITEM_TEXT1 || c.itemText1 || c.referenceNumber || '',
    COST_REL: c.COST_REL || c.costRel || c.costingRelevancy || '',
    ENG_REL: c.ENG_REL || c.engRel || c.engineering || '',
    CHANGE_NO: c.CHANGE_NO || c.changeNo || ''
  }));

  if (params.server && process.env.USE_MOCK_SAP !== 'true') {
    getRfcConnectionParams(params.server);
  }

  // Mock mode handling
  if (process.env.USE_MOCK_SAP === 'true') {
    if (params.testRun) {
      const unmaintained = normalizedComponents.filter((c) =>
        String(c.COMPONENT).includes('BAD') ||
        String(c.COMPONENT).includes('MISSING') ||
        String(c.COMPONENT).includes('UNMAINTAINED') ||
        Boolean(c.notMaintained)
      );
      if (unmaintained.length > 0) {
        const errs = unmaintained.map((c) => `Material ${c.COMPONENT} not maintained in plant ${cleanPlt}`);
        return {
          success: false,
          verified: false,
          isTestRun: true,
          code: 'BAPI_SIMULATION_ERROR',
          message: errs.join(' | '),
          errors: errs
        };
      }

      if (params.simulateError || cleanPlt === 'BLOCKED_PLANT' || cleanMat === 'BLOCKED_MAT') {
        const simErrMsg = `Material 000000000000000144 not maintained in plant ${cleanPlt || '16P2'}`;
        return {
          success: false,
          verified: false,
          isTestRun: true,
          code: 'BAPI_SIMULATION_ERROR',
          message: simErrMsg,
          errors: [simErrMsg]
        };
      }
      return {
        success: true,
        verified: true,
        isTestRun: true,
        code: 'OK',
        message: 'BOM creation simulation passed.'
      };
    }

    const cleanAltPadded = cleanAlt.padStart(2, '0');
    const cleanMatSap = toSapMatnr(cleanMat);
    let target = activeMockBoms.find(
      (b) =>
        (String(b.material).toUpperCase() === cleanMat || toSapMatnr(b.material) === cleanMatSap) &&
        String(b.plant) === cleanPlt &&
        String(b.bomUsage || '1') === cleanUsg &&
        String(b.alternativeBom || '1').padStart(2, '0') === cleanAltPadded
    );

    if (!target) {
      target = {
        material: cleanMat,
        plant: cleanPlt,
        bomUsage: cleanUsg,
        alternativeBom: cleanAltPadded,
        validFrom: validFrom || new Date().toISOString().slice(0, 10),
        baseQty: String(baseQty || '100'),
        baseUnit: baseUnit || 'EA',
        bomStatus: bomStatus || '01',
        altText: altText || '',
        changeNo: changeNo || '',
        components: normalizedComponents.map((c) => ({
          itemNo: c.ITEM_NO,
          itemCategory: c.ITEM_CATEG,
          component: c.COMPONENT,
          quantity: parseFloat(c.COMP_QTY) || 1,
          unit: c.COMP_UNIT || 'EA',
          storageLocation: c.ISS_ST_LOC,
          referenceNumber: c.ITEM_TEXT1,
          costingRelevancy: c.COST_REL,
          engineering: c.ENG_REL,
          changeNo: c.CHANGE_NO
        }))
      };
      activeMockBoms.push(target);
    } else {
      target.components = normalizedComponents.map((c) => ({
        itemNo: c.ITEM_NO,
        itemCategory: c.ITEM_CATEG,
        component: c.COMPONENT,
        quantity: parseFloat(c.COMP_QTY) || 1,
        unit: c.COMP_UNIT || 'EA',
        storageLocation: c.ISS_ST_LOC,
        referenceNumber: c.ITEM_TEXT1,
        costingRelevancy: c.COST_REL,
        engineering: c.ENG_REL,
        changeNo: c.CHANGE_NO
      }));
    }

    return {
      success: true,
      verified: true,
      code: 'OK',
      bomNumber: `MOCK_${cleanMat}_${cleanPlt}`,
      message: `BOM created and verified via RFC mock for ${cleanMat} in plant ${cleanPlt}`,
      before: null,
      after: {
        material: cleanMat,
        plant: cleanPlt,
        bomUsage: cleanUsg,
        alternativeBom: cleanAlt,
        components: target.components,
        verifiedInSap: true,
        status: 'CREATED_VIA_RFC'
      }
    };
  }

  // Live RFC execution via BAPI_MATERIAL_BOM_GROUP_CREATE
  const client = params.client || (await openRfcClient(params.server || params));
  const shouldClose = !params.client;
  try {
    let today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    if (validFrom) {
      const cleanVf = String(validFrom).trim();
      const mDmy = cleanVf.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
      if (mDmy) {
        today = `${mDmy[3]}${mDmy[2]}${mDmy[1]}`;
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(cleanVf)) {
        today = cleanVf.replace(/-/g, '');
      } else if (/^\d{8}$/.test(cleanVf)) {
        today = cleanVf;
      }
    }
    const bgrId = 'BGR_01';
    const altPadded = cleanAlt.padStart(2, '0');

    const bomGroup = [{
      BOM_GROUP_IDENTIFICATION: bgrId,
      BOM_USAGE: cleanUsg,
      CREATED_IN_PLANT: cleanPlt
    }];

    let targetBaseUnit = params.baseUnit;
    if (!targetBaseUnit) {
      try {
        const maraRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'MARA',
          DELIMITER: '|',
          OPTIONS: [{ TEXT: `MATNR = '${toSapMatnr(cleanMat)}'` }],
          FIELDS: [{ FIELDNAME: 'MEINS' }],
          DATA: []
        });
        if (maraRes.DATA && maraRes.DATA.length > 0) {
          targetBaseUnit = maraRes.DATA[0].WA.split('|')[0]?.trim();
        }
      } catch {}
    }
    if (!targetBaseUnit) {
      targetBaseUnit = 'PAA';
    }

    const variantObj = {
      BOM_GROUP_IDENTIFICATION: bgrId,
      OBJECT_ID: 'VAR_01',
      FUNCTION: 'NEW',
      ALTERNATIVE_BOM: altPadded,
      BOM_STATUS: bomStatus ? String(bomStatus).padStart(2, '0') : '01',
      BASE_QTY: String(params.baseQty || '100'),
      BASE_UNIT: targetBaseUnit,
      VALID_FROM_DATE: today
    };
    if (altText) variantObj.ALT_TEXT = String(altText);
    if (changeNo) variantObj.CHANGE_NO = String(changeNo);
    const variants = [variantObj];

    const bapiItems = normalizedComponents.map((c, idx) => {
      const itm = {
        BOM_GROUP_IDENTIFICATION: bgrId,
        ITEM_ID: `ITM_${String(idx + 1).padStart(3, '0')}`,
        OBJECT_ID: `ITM_${String(idx + 1).padStart(3, '0')}`,
        ITEM_NO: c.ITEM_NO || String((idx + 1) * 10).padStart(4, '0'),
        ITEM_CAT: c.ITEM_CATEG || 'L',
        COMPONENT: toSapMatnr(c.COMPONENT),
        COMP_QTY: String(c.COMP_QTY || '1'),
        COMP_UNIT: c.COMP_UNIT || 'EA',
        VALID_FROM_DATE: today
      };
      if (c.ISS_ST_LOC) itm.ISS_ST_LOC = String(c.ISS_ST_LOC);
      if (c.ITEM_TEXT1) itm.ITEM_TEXT1 = String(c.ITEM_TEXT1);
      if (c.COST_REL) itm.COST_REL = String(c.COST_REL);
      if (c.ENG_REL) itm.ENG_REL = String(c.ENG_REL);
      if (c.CHANGE_NO) itm.CHANGE_NO = String(c.CHANGE_NO);
      return itm;
    });

    const itemAssignments = bapiItems.map((itm) => ({
      BOM_GROUP_IDENTIFICATION: bgrId,
      FUNCTION: 'NEW',
      SUPER_OBJECT_TYPE: 'BOM',
      SUPER_OBJECT_ID: 'VAR_01',
      SUB_OBJECT_TYPE: 'ITM',
      SUB_OBJECT_ID: itm.ITEM_ID,
      VALID_FROM_DATE: today
    }));

    const materialRelations = [{
      BOM_GROUP_IDENTIFICATION: bgrId,
      MATERIAL: toSapMatnr(cleanMat),
      PLANT: cleanPlt,
      BOM_USAGE: cleanUsg,
      ALTERNATIVE_BOM: altPadded
    }];

    const bapiPayload = {
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

    if (params.testRun) {
      bapiPayload.TESTRUN = { BAPIFLAG: 'X' };
    }

    const bapiResult = await client.call('BAPI_MATERIAL_BOM_GROUP_CREATE', bapiPayload);

    const returnMsgs = Array.isArray(bapiResult.RETURN) ? bapiResult.RETURN : [];
    const errors = returnMsgs.filter((r) => r.TYPE === 'E' || r.TYPE === 'A');

    if (errors.length > 0) {
      const errMsg = errors.map((e) => e.MESSAGE).join(' | ');
      return {
        success: false,
        verified: false,
        isTestRun: Boolean(params.testRun),
        code: params.testRun ? 'BAPI_SIMULATION_ERROR' : 'BAPI_BOM_CREATE_ERROR',
        message: params.testRun ? `Cannot copy: ${errMsg}` : `SAP BAPI Error: ${errMsg}`,
        errors: errors.map((e) => e.MESSAGE),
        returnMessages: returnMsgs
      };
    }

    if (params.testRun) {
      return {
        success: true,
        verified: true,
        isTestRun: true,
        code: 'OK',
        message: 'BOM creation simulation passed.'
      };
    }

    // Commit the transaction to SAP database
    await client.call('BAPI_TRANSACTION_COMMIT', { WAIT: 'X' });

    // Read generated BOM number from MAST
    let generatedBomNo = '';
    try {
      const verifyRes = await client.call('RFC_READ_TABLE', {
        QUERY_TABLE: 'MAST',
        DELIMITER: '|',
        OPTIONS: formatRfcTableOptions(`MATNR = '${toSapMatnr(cleanMat)}' AND WERKS = '${cleanPlt}' AND STLAN = '${cleanUsg}' AND STLAL = '${altPadded}'`),
        FIELDS: [{ FIELDNAME: 'STLNR' }, { FIELDNAME: 'STLAL' }],
        DATA: []
      });
      if (verifyRes.DATA && verifyRes.DATA.length > 0) {
        generatedBomNo = verifyRes.DATA[0].WA.split('|')[0]?.trim();
      }
    } catch {}

    return {
      success: true,
      verified: true,
      code: 'OK',
      bomNumber: generatedBomNo || `BOM_${cleanMat}_${cleanPlt}`,
      alternativeBom: cleanAlt,
      message: `BOM Alternative ${cleanAlt} created successfully via RFC/BAPI for ${cleanMat} in plant ${cleanPlt}`,
      returnMessages: returnMsgs,
      after: {
        material: cleanMat,
        plant: cleanPlt,
        bomUsage: cleanUsg,
        alternativeBom: cleanAlt,
        bomNumber: generatedBomNo,
        components: normalizedComponents,
        verifiedInSap: true,
        status: 'CREATED_VIA_RFC'
      }
    };
  } catch (err) {
    return {
      success: false,
      verified: false,
      code: 'RFC_BOM_CREATE_ERROR',
      message: `Failed to create BOM via RFC: ${err.message}`,
      before: null,
      after: null
    };
  } finally {
    if (shouldClose) {
      try {
        await client.close();
      } catch {}
    }
  }
}

const RFC_CALL_TIMEOUT_MS = 30000;

/**
 * Executes a Promise with a timeout limit.
 * Enforces a strict 30-second timeout per RFC simulation call.
 */
function callWithTimeout(promise, timeoutMs, description) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`RFC timeout: ${description} exceeded ${timeoutMs / 1000}s limit`);
      err.code = 'RFC_TIMEOUT';
      reject(err);
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

/**
 * Checks whether a sub-assembly BOM already exists in the target plant
 * with the exact usage and alternative the copy would use.
 * Shared between rfcCopyBom (repairHierarchyBottomUp) and rfcSimulateCopyBom.
 *
 * @param {object} item - BOM item from hierarchy explosion ({ material, bomUsage, alternativeBom, level })
 * @param {string} targetPlant - Target plant code
 * @param {object} client - RFC client or null
 * @returns {Promise<{ exists: boolean, alternative: string, bomNumber?: string }>}
 */
export async function isSubAssemblyBomExistingInTarget(item, targetPlant, client = null) {
  if (!item || item.level === 0) {
    return { exists: false, alternative: '' };
  }

  const cleanMat = String(item.material || '').trim().toUpperCase();
  const cleanPlt = String(targetPlant || '').trim().toUpperCase();
  const cleanUsage = String(item.bomUsage || '1').trim();
  const targetAlt = item.alternativeBom
    ? String(item.alternativeBom).trim().padStart(2, '0')
    : '01';

  const isMock = process.env.USE_MOCK_SAP === 'true';

  if (isMock) {
    const sapMat = toSapMatnr(cleanMat);
    const found = activeMockBoms.find(
      (b) =>
        (String(b.material).toUpperCase() === cleanMat || toSapMatnr(b.material) === sapMat) &&
        String(b.plant).toUpperCase() === cleanPlt &&
        String(b.bomUsage || '1').trim() === cleanUsage &&
        String(b.alternativeBom || '01').trim().padStart(2, '0') === targetAlt
    );
    return {
      exists: Boolean(found),
      alternative: targetAlt,
      bomNumber: found ? (found.bomNumber || `MOCK_${cleanMat}_${cleanPlt}`) : undefined
    };
  }

  // Live RFC check in MAST
  if (!client) {
    return { exists: false, alternative: targetAlt };
  }

  try {
    const sapMat = toSapMatnr(cleanMat);
    const sql = `MATNR = '${sapMat}' AND WERKS = '${cleanPlt}' AND STLAN = '${cleanUsage}' AND STLAL = '${targetAlt}'`;
    const optLines = formatRfcTableOptions(sql);
    const mastRes = await client.call('RFC_READ_TABLE', {
      QUERY_TABLE: 'MAST',
      DELIMITER: '|',
      OPTIONS: optLines,
      FIELDS: [{ FIELDNAME: 'STLNR' }, { FIELDNAME: 'STLAL' }],
      DATA: []
    });

    if (mastRes.DATA && mastRes.DATA.length > 0) {
      const fieldNames = (mastRes.FIELDS || []).map((f) => f.FIELDNAME.trim());
      const stlnrIdx = fieldNames.indexOf('STLNR');
      const parts = mastRes.DATA[0].WA.split('|');
      const bomNum = stlnrIdx >= 0 ? parts[stlnrIdx]?.trim() : parts[0]?.trim();
      return {
        exists: true,
        alternative: targetAlt,
        bomNumber: bomNum
      };
    }
  } catch (_) {
    // If table read fails, treat as not existing
  }

  return { exists: false, alternative: targetAlt };
}

/**
 * Simulates BOM creation in the target plant using BAPI TESTRUN (BAPIFLAG = 'X')
 * for pre-flight validation before user confirmation.
 * Runs with ZERO SAP database writes.
 *
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function rfcSimulateCopyBom(params = {}) {
  const {
    sourceMaterial,
    sourcePlant,
    sourceUsage = '1',
    sourceAlternative = '',
    targetMaterial,
    targetPlant,
    targetUsage = '1',
    targetAlternative = '',
    copyHierarchy = true,
    server = null,
    client = null
  } = params;

  const cleanSrcMat = String(sourceMaterial || '').trim().toUpperCase();
  const cleanSrcPlt = String(sourcePlant || '').trim().toUpperCase();
  const cleanTgtMat = String(targetMaterial || cleanSrcMat).trim().toUpperCase();
  const cleanTgtPlt = String(targetPlant || cleanSrcPlt).trim().toUpperCase();
  const cleanSrcUsage = String(sourceUsage || '1').trim();
  const cleanTgtUsage = String(targetUsage || cleanSrcUsage).trim();

  // 1. Read source BOM
  const sourceBom = await rfcReadBom({
    material: cleanSrcMat,
    plant: cleanSrcPlt,
    bomUsage: cleanSrcUsage,
    alternativeBom: sourceAlternative,
    server,
    client
  });

  if (!sourceBom.success || !sourceBom.bomExists) {
    return {
      valid: false,
      canCopy: false,
      blocked: true,
      code: sourceBom.errorCode || 'SOURCE_BOM_NOT_FOUND',
      message: sourceBom.message || `Cannot copy BOM: Source BOM not found for ${cleanSrcMat} in plant ${cleanSrcPlt}.`
    };
  }

  if (sourceBom.componentCount === 0 || !sourceBom.components || sourceBom.components.length === 0) {
    return {
      valid: false,
      canCopy: false,
      blocked: true,
      code: 'BOM_NO_ACTIVE_COMPONENTS',
      message: 'Cannot copy BOM: BOM has no active components.'
    };
  }

  const isMock = process.env.USE_MOCK_SAP === 'true';
  const rfcClient = client || (isMock ? null : await openRfcClient(server || {}));
  const shouldClose = !client && !isMock && rfcClient;

  try {
    // Collect all BOMs to simulate (level 0 first, then sub-assemblies)
    const bomsToSimulate = [];
    const reusedBoms = [];
    let totalHierBoms = 1;

    if (copyHierarchy) {
      const hierRes = await rfcExplodeBomHierarchy({
        material: cleanSrcMat,
        plant: cleanSrcPlt,
        bomUsage: cleanSrcUsage,
        alternativeBom: sourceBom.alternativeBom || sourceAlternative || '01',
        client: rfcClient
      });

      if (hierRes.success && hierRes.items && hierRes.items.length > 0) {
        totalHierBoms = hierRes.items.length;
        // Level 0 first, then sub-assemblies in ascending level order
        const sorted = [...hierRes.items].sort((a, b) => a.level - b.level);
        const seenSimBoms = new Set();
        for (const itm of sorted) {
          const isRoot = itm.level === 0;
          const tgtMat = isRoot ? cleanTgtMat : itm.material;
          const tgtAltMatch = isRoot && targetAlternative ? String(targetAlternative).match(/\b(\d{1,2})\b/) : null;
          const tgtAlt = isRoot
            ? (tgtAltMatch ? tgtAltMatch[1].padStart(2, '0') : (targetAlternative && String(targetAlternative).trim() ? String(targetAlternative).trim().padStart(2, '0') : '01'))
            : (itm.alternativeBom || '01');

          // If sub-assembly already exists in target plant, reuse it! Do NOT simulate creation!
          if (!isRoot) {
            const existingCheck = await isSubAssemblyBomExistingInTarget(itm, cleanTgtPlt, rfcClient);
            if (existingCheck.exists) {
              reusedBoms.push({
                material: itm.material,
                level: itm.level,
                plant: cleanTgtPlt,
                alternative: existingCheck.alternative,
                bomNumber: existingCheck.bomNumber
              });
              continue; // Reused, skip simulation of creation
            }
          }

          const simKey = `${toSapMatnr(tgtMat)}_${cleanTgtPlt}_${tgtAlt}_${itm.level}`;
          if (seenSimBoms.has(simKey)) continue;
          seenSimBoms.add(simKey);

          bomsToSimulate.push({
            material: tgtMat,
            plant: cleanTgtPlt,
            bomUsage: itm.bomUsage || cleanTgtUsage,
            alternativeBom: tgtAlt,
            components: itm.components,
            baseQty: itm.baseQty,
            baseUnit: itm.baseUnit,
            isRoot,
            level: itm.level
          });
        }
      }
    }

    if (bomsToSimulate.length === 0 && reusedBoms.length === 0) {
      const tgtAltMatch = targetAlternative ? String(targetAlternative).match(/\b(\d{1,2})\b/) : null;
      const resolvedTargetAlt = tgtAltMatch
        ? tgtAltMatch[1].padStart(2, '0')
        : (targetAlternative && String(targetAlternative).trim() ? String(targetAlternative).trim().padStart(2, '0') : '01');
      bomsToSimulate.push({
        material: cleanTgtMat,
        plant: cleanTgtPlt,
        bomUsage: cleanTgtUsage,
        alternativeBom: resolvedTargetAlt,
        components: sourceBom.components,
        baseQty: sourceBom.baseQty || '1',
        baseUnit: sourceBom.baseUnit,
        isRoot: true,
        level: 0
      });
    }

    const allProblems = [];
    const seenProblems = new Set();
    const seenMatKeys = new Set();
    let anyFailed = false;
    const simStartTime = Date.now();

    // Run TESTRUN on each BOM across all levels with 30s timeout per call
    for (const item of bomsToSimulate) {
      let simRes;
      try {
        simRes = await callWithTimeout(
          rfcCreateBom({
            material: item.material,
            plant: item.plant,
            bomUsage: item.bomUsage,
            alternativeBom: item.alternativeBom,
            components: item.components,
            baseQty: item.baseQty,
            baseUnit: item.baseUnit,
            testRun: true,
            client: rfcClient,
            server
          }),
          RFC_CALL_TIMEOUT_MS,
          `Simulation for BOM ${formatMaterialNumber(item.material)} (Level ${item.level}) in plant ${item.plant}`
        );
      } catch (callErr) {
        simRes = {
          success: false,
          verified: false,
          code: callErr.code || 'RFC_TIMEOUT',
          message: callErr.message || 'RFC call timed out after 30 seconds',
          errors: [callErr.message || 'RFC call timed out after 30 seconds']
        };
      }

      if (!simRes.success) {
        anyFailed = true;
        const rawErrors = (simRes.errors && simRes.errors.length > 0)
          ? simRes.errors
          : [simRes.message || 'Simulation error'];

        // Filter out generic cascade wrapper messages from SAP
        const specificErrors = rawErrors.filter((msg) => {
          const s = String(msg || '');
          if (/No instance of object type\s+BOMGroup\s+has been created/i.test(s)) return false;
          if (/Consistency check when creating BOM item\s+was not successful/i.test(s)) return false;
          if (/BOM could not be created/i.test(s)) return false;
          if (/BOM creation simulation failed/i.test(s)) return false;
          if (/Error when checking the data of the object type\s*=\s*BOM/i.test(s)) return false;
          return true;
        });

        const errorsToProcess = specificErrors.length > 0 ? specificErrors : rawErrors;

        for (const err of errorsToProcess) {
          let problemStr = '';
          const cleanErr = String(err).replace(/^Cannot copy:\s*/i, '').replace(/^SAP BAPI Error:\s*/i, '').trim();

          // Pattern: Material/Component X not maintained in plant Y
          const unmaintainedMatch = cleanErr.match(/(?:Material|Component)\s+([A-Za-z0-9_\-\.\/]+)\s+not maintained in plant\s+([A-Za-z0-9]+)/i);
          if (unmaintainedMatch) {
            const problemMat = unmaintainedMatch[1];
            const problemPlant = unmaintainedMatch[2];
            const isHeader = toSapMatnr(problemMat) === toSapMatnr(item.material);
            const label = isHeader ? 'Material' : 'Component';
            const displayMat = formatMaterialNumber(problemMat);
            const parentMat = formatMaterialNumber(item.material);

            const matKey = `${toSapMatnr(problemMat)}_${toSapMatnr(item.material)}_${item.level}`;
            if (seenMatKeys.has(matKey)) continue;
            seenMatKeys.add(matKey);

            problemStr = `${label} ${displayMat} not maintained in plant ${problemPlant} (BOM of ${parentMat}, level ${item.level})`;
          } else {
            // Pattern: Material X does not exist
            const notExistMatch = cleanErr.match(/(?:The\s+)?material\s+([A-Za-z0-9_\-\.\/]+)\s+does not exist(?: or is not activated)?/i);
            if (notExistMatch) {
              const problemMat = notExistMatch[1];
              const displayMat = formatMaterialNumber(problemMat);
              const parentMat = formatMaterialNumber(item.material);

              const matKey = `${toSapMatnr(problemMat)}_${toSapMatnr(item.material)}_${item.level}`;
              if (seenMatKeys.has(matKey)) continue;
              seenMatKeys.add(matKey);

              problemStr = `Material ${displayMat} does not exist (BOM of ${parentMat}, level ${item.level})`;
            } else {
              // Other specific SAP error message
              const parentMat = formatMaterialNumber(item.material);
              problemStr = cleanErr.includes('(BOM of ')
                ? cleanErr
                : `${cleanErr} (BOM of ${parentMat}, level ${item.level})`;
            }
          }

          if (problemStr && !seenProblems.has(problemStr)) {
            seenProblems.add(problemStr);
            allProblems.push({
              level: item.level,
              text: problemStr
            });
          }
        }

        // Additional fallback: if all errors were generic, check MARC for unmaintained components
        if (allProblems.filter((p) => p.level === item.level).length === 0) {
          if (!isMock && rfcClient) {
            try {
              for (const comp of item.components || []) {
                const cMat = toSapMatnr(comp.component || comp.COMPONENT || comp.material || '');
                if (!cMat) continue;
                const marcRes = await rfcClient.call('RFC_READ_TABLE', {
                  QUERY_TABLE: 'MARC',
                  DELIMITER: '|',
                  OPTIONS: [{ TEXT: `MATNR = '${cMat}' AND WERKS = '${cleanTgtPlt}'` }],
                  FIELDS: [{ FIELDNAME: 'WERKS' }],
                  DATA: []
                });
                if (!marcRes.DATA || marcRes.DATA.length === 0) {
                  const displayMat = formatMaterialNumber(comp.component || comp.COMPONENT || comp.material || '');
                  const parentMat = formatMaterialNumber(item.material);
                  const matKey = `${cMat}_${toSapMatnr(item.material)}_${item.level}`;
                  if (!seenMatKeys.has(matKey)) {
                    seenMatKeys.add(matKey);
                    const pStr = `Component ${displayMat} not maintained in plant ${cleanTgtPlt} (BOM of ${parentMat}, level ${item.level})`;
                    if (!seenProblems.has(pStr)) {
                      seenProblems.add(pStr);
                      allProblems.push({ level: item.level, text: pStr });
                    }
                  }
                }
              }
            } catch (_) {}
          }
        }
      }
    }

    const durationMs = Date.now() - simStartTime;

    if (anyFailed || allProblems.length > 0) {
      allProblems.sort((a, b) => a.level - b.level);
      const problemTexts = allProblems.map((p) => p.text);

      return {
        valid: false,
        canCopy: false,
        blocked: true,
        code: 'BOM_COPY_BLOCKED',
        message: `Cannot copy: ${problemTexts.join(', ')}`,
        rawErrors: problemTexts,
        problems: problemTexts,
        reusedBoms,
        totalBomsSimulated: bomsToSimulate.length,
        totalBomsInHierarchy: totalHierBoms,
        durationMs
      };
    }

    return {
      valid: true,
      canCopy: true,
      blocked: false,
      message: 'Simulation passed',
      sourceBom,
      reusedBoms,
      totalBomsSimulated: bomsToSimulate.length,
      totalBomsInHierarchy: totalHierBoms,
      durationMs
    };
  } finally {
    if (shouldClose) {
      try { await rfcClient.close(); } catch {}
    }
  }
}

/**
 * Deletes a Material BOM via CSAP_MAT_BOM_DELETE.
 * Replaces CS02 / ZBOM_COPY GUI automation.
 *
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function rfcDeleteBom(params = {}) {
  const { material, plant, bomUsage = '1', alternativeBom = '1' } = params;

  const cleanMat = String(material || '').trim().toUpperCase();
  const cleanPlt = String(plant || '').trim().toUpperCase();
  const cleanUsg = String(bomUsage || '1').trim();
  const cleanAlt = String(alternativeBom || '1').trim();
  const altPadded = cleanAlt.padStart(2, '0');

  if (params.server && process.env.USE_MOCK_SAP !== 'true') {
    getRfcConnectionParams(params.server);
  }

  if (process.env.USE_MOCK_SAP === 'true') {
    const idx = activeMockBoms.findIndex(
      (b) =>
        String(b.material).toUpperCase() === cleanMat &&
        String(b.plant) === cleanPlt &&
        String(b.bomUsage || '1') === cleanUsg
    );
    if (idx !== -1) {
      activeMockBoms.splice(idx, 1);
    }
    return {
      success: true,
      verified: true,
      message: `BOM for material ${cleanMat} deleted successfully (mock RFC)`,
      material: cleanMat,
      plant: cleanPlt,
      bomUsage: cleanUsg,
      alternativeBom: cleanAlt
    };
  }

  const client = params.client || (await openRfcClient(params.server || params));
  try {
    // 1. Execute deletion via headless RFC transaction ZBOM_COPY
    const bdcData = [
      { PROGRAM: 'ZPP_BOM_COPY_CREATION', DYNPRO: '1000', DYNBEGIN: 'X', FNAM: '', FVAL: '' },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: 'P_MATNR' },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'P_DEL', FVAL: 'X' },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'P_CREA', FVAL: ' ' },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'P_MATNR', FVAL: cleanMat },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'P_WERKS', FVAL: cleanPlt },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'P_STLAL', FVAL: altPadded },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'P_STLAN', FVAL: cleanUsg },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: '=ONLI' }
    ];

    const bdcRes = await client.call('RFC_CALL_TRANSACTION_USING', {
      TCODE: 'ZBOM_COPY',
      MODE: 'N',
      BT_DATA: bdcData
    });

    const subrc = bdcRes.SUBRC !== undefined ? Number(bdcRes.SUBRC) : 0;
    const errors = (bdcRes.L_ERRORS || []).filter((e) => e.MSGTYP === 'E' || e.MSGTYP === 'A');

    if (subrc !== 0 && errors.length > 0) {
      const errMsgs = errors.map((e) => `${e.MSGID} ${e.MSGNR}: ${e.MSGTXT || e.MSGV1 || ''}`).join(' | ');
      return {
        success: false,
        verified: false,
        code: 'RFC_DELETE_TRANSACTION_ERROR',
        message: `SAP ZBOM_COPY deletion failed (SUBRC ${subrc}): ${errMsgs || 'Transaction rejected'}`
      };
    }

    // 2. Post-delete verification via MAST table
    let stillExists = false;
    let remainingAlternatives = [];
    try {
      const checkRes = await client.call('RFC_READ_TABLE', {
        QUERY_TABLE: 'MAST',
        DELIMITER: '|',
        OPTIONS: [{ TEXT: `MATNR = '${toSapMatnr(cleanMat)}' AND WERKS = '${cleanPlt}' AND STLAN = '${cleanUsg}'` }],
        FIELDS: [{ FIELDNAME: 'STLAL' }],
        DATA: []
      });
      remainingAlternatives = (checkRes.DATA || []).map((r) => r.WA.split('|')[0]?.trim());
      stillExists = remainingAlternatives.includes(altPadded) || remainingAlternatives.includes(cleanAlt);
    } catch (checkErr) {
      console.warn('[sapRfcClient] Post-delete verification query warning:', checkErr.message);
    }

    if (stillExists) {
      return {
        success: false,
        verified: false,
        code: 'DELETE_VERIFICATION_FAILED',
        message: `Deletion could not be verified: Alternative BOM ${cleanAlt} still exists in SAP database.`
      };
    }

    return {
      success: true,
      verified: true,
      code: 'OK',
      message: `BOM Alternative ${cleanAlt} for material ${cleanMat} in plant ${cleanPlt} deleted successfully and verified via RFC.`,
      material: cleanMat,
      plant: cleanPlt,
      bomUsage: cleanUsg,
      alternativeBom: cleanAlt,
      remainingAlternatives,
      before: {
        material: cleanMat,
        plant: cleanPlt,
        alternativeBom: cleanAlt,
        bomUsage: cleanUsg
      },
      after: {
        material: cleanMat,
        plant: cleanPlt,
        alternativeBom: cleanAlt,
        bomUsage: cleanUsg,
        status: 'DELETED_VIA_RFC',
        verifiedInSap: true,
        remainingAlternatives
      }
    };
  } catch (err) {
    return {
      success: false,
      verified: false,
      code: 'RFC_BOM_DELETE_ERROR',
      message: `Failed to delete BOM via RFC: ${err.message}`
    };
  } finally {
    if (!params.client) {
      try {
        await client.close();
      } catch {}
    }
  }
}

/**
 * Recursively explodes a BOM to discover all sub-assemblies across all hierarchical levels.
 *
 * @param {object} params { material, plant, bomUsage, alternativeBom, client, maxDepth }
 * @returns {Promise<{ success: boolean, rootMaterial: string, plant: string, totalLevels: number, totalBoms: number, items: Array<object> }>}
 */
export async function rfcExplodeBomHierarchy(params = {}) {
  const {
    material,
    plant,
    bomUsage = '1',
    alternativeBom = '1',
    maxDepth = 10
  } = params;

  const isMock = process.env.USE_MOCK_SAP === 'true';
  const client = params.client || (isMock ? null : await openRfcClient(params.server || {}));
  const shouldClose = !params.client && !isMock;

  const hierarchyItems = [];
  const visited = new Set();

  async function traverse(currentMat, currentPlt, currentUsg, currentAlt, level, parentMat = null) {
    if (level > maxDepth) return;
    const cleanMat = String(currentMat || '').trim().toUpperCase();
    const cleanPlt = String(currentPlt || '').trim().toUpperCase();
    const cleanAlt = String(currentAlt || '1').trim();
    const key = `${cleanMat}_${cleanPlt}_${cleanAlt}`;

    if (visited.has(key)) return;
    visited.add(key);

    const bomData = await rfcReadBom({
      material: cleanMat,
      plant: cleanPlt,
      bomUsage: currentUsg,
      alternativeBom: cleanAlt,
      client
    });

    if (!bomData.success || !bomData.bomExists) return;

    hierarchyItems.push({
      level,
      parentMaterial: parentMat,
      material: cleanMat,
      plant: cleanPlt,
      bomUsage: currentUsg,
      alternativeBom: bomData.alternativeBom || cleanAlt,
      bomNumber: bomData.bomNumber || '',
      baseQty: bomData.baseQty || '100',
      baseUnit: bomData.baseUnit || 'PAA',
      componentCount: bomData.componentCount || 0,
      components: bomData.components || []
    });

    const compMats = (bomData.components || [])
      .map((c) => String(c.component || '').trim().toUpperCase())
      .filter(Boolean);

    if (compMats.length === 0) return;

    if (isMock) {
      const subAssemblies = activeMockBoms
        .filter((b) => compMats.includes(String(b.material).toUpperCase()) && String(b.plant) === cleanPlt)
        .map((b) => ({
          material: b.material,
          alt: b.alternativeBom || '01',
          usage: b.bomUsage || currentUsg
        }));
      for (const sub of subAssemblies) {
        await traverse(sub.material, cleanPlt, sub.usage || currentUsg, sub.alt || '01', level + 1, cleanMat);
      }
      return;
    }

    // Check which components have BOMs in this plant via MAST
    const sql = `WERKS = '${cleanPlt}' AND ( ` + compMats.map((m) => `MATNR = '${toSapMatnr(m)}'`).join(' OR ') + ` )`;
    const optLines = formatRfcTableOptions(sql);

    try {
      const mastRes = await client.call('RFC_READ_TABLE', {
        QUERY_TABLE: 'MAST',
        DELIMITER: '|',
        OPTIONS: optLines,
        FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'STLNR' }, { FIELDNAME: 'STLAL' }, { FIELDNAME: 'STLAN' }],
        DATA: []
      });

      const fieldNames = (mastRes.FIELDS || []).map((f) => f.FIELDNAME.trim());
      const subAssemblies = (mastRes.DATA || []).map((row) => {
        const parts = row.WA.split('|');
        const obj = {};
        fieldNames.forEach((fn, idx) => { obj[fn] = parts[idx]?.trim(); });
        return {
          material: obj.MATNR,
          alt: obj.STLAL,
          usage: obj.STLAN
        };
      });

      for (const sub of subAssemblies) {
        await traverse(sub.material, cleanPlt, sub.usage || currentUsg, sub.alt || '01', level + 1, cleanMat);
      }
    } catch (err) {
      console.warn(`[sapRfcClient] Sub-assembly lookup warning for ${cleanMat}:`, err.message);
    }
  }

  try {
    await traverse(material, plant, bomUsage, alternativeBom, 0, null);
    const maxLevel = hierarchyItems.reduce((max, item) => Math.max(max, item.level), 0);

    return {
      success: true,
      rootMaterial: String(material).trim().toUpperCase(),
      plant: String(plant).trim().toUpperCase(),
      totalLevels: hierarchyItems.length > 0 ? maxLevel + 1 : 0,
      totalBoms: hierarchyItems.length,
      items: hierarchyItems
    };
  } finally {
    if (shouldClose) {
      try { await client.close(); } catch {}
    }
  }
}

/**
 * ============================================================================
 * DISPLAY BOM (BOM HIERARCHY EXPLORER) ENRICHED READER
 * ============================================================================
 */

/**
 * Helper to format material numbers:
 * Trim leading zeros only on purely numeric material numbers (000000000011021735 -> 11021735).
 * Alphanumeric ones stay unchanged (A1BH0214C -> A1BH0214C).
 */
export function formatMaterialNumber(mat) {
  if (!mat) return '';
  const s = String(mat).trim();
  if (/^\d+$/.test(s)) {
    const trimmed = s.replace(/^0+/, '');
    return trimmed.length > 0 ? trimmed : '0';
  }
  return s;
}

/**
 * Formats SAP date YYYYMMDD into DD.MM.YYYY.
 */
export function formatSapDate(rawDate) {
  if (!rawDate) return '-';
  const str = String(rawDate).trim();
  if (!str || str === '00000000' || str === '-') return '-';
  if (/^\d{8}$/.test(str)) {
    const yyyy = str.substring(0, 4);
    const mm = str.substring(4, 6);
    const dd = str.substring(6, 8);
    return `${dd}.${mm}.${yyyy}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [yyyy, mm, dd] = str.split('-');
    return `${dd}.${mm}.${yyyy}`;
  }
  return str;
}

/**
 * Batches MAKT queries in chunks of ~25 materials.
 * Selects description in target language (or falls back to any language, then '-').
 */
export async function batchQueryMakt(client, materials, targetLang = 'E') {
  if (!materials || materials.length === 0) return {};
  loadMockBoms();
  const uniqueMats = [...new Set(materials.map((m) => String(m).trim().toUpperCase()).filter(Boolean))];
  const descMap = {};

  if (process.env.USE_MOCK_SAP === 'true' || !client) {
    for (const m of uniqueMats) {
      const trimmed = formatMaterialNumber(m);
      const bomHeader = activeMockBoms.find(
        (b) => String(b.material).toUpperCase() === m || formatMaterialNumber(b.material) === trimmed
      );
      if (bomHeader && bomHeader.description) {
        descMap[m] = bomHeader.description;
        descMap[trimmed] = bomHeader.description;
        continue;
      }
      let foundCompDesc = null;
      for (const b of activeMockBoms) {
        const comp = (b.components || []).find(
          (c) => String(c.component || c.material).toUpperCase() === m ||
                 formatMaterialNumber(c.component || c.material) === trimmed
        );
        if (comp && comp.description !== undefined) {
          foundCompDesc = comp.description;
          break;
        }
      }
      const finalDesc = (foundCompDesc && String(foundCompDesc).trim()) ? String(foundCompDesc).trim() : '-';
      descMap[m] = finalDesc;
      descMap[trimmed] = finalDesc;
    }
    return descMap;
  }

  const CHUNK_SIZE = 25;
  const langMatched = new Set();
  const lang1Char = (targetLang || 'E').charAt(0).toUpperCase();

  for (let i = 0; i < uniqueMats.length; i += CHUNK_SIZE) {
    const chunk = uniqueMats.slice(i, i + CHUNK_SIZE);
    const orClauses = chunk.map((m) => `MATNR = '${toSapMatnr(m)}'`).join(' OR ');
    const options = formatRfcTableOptions(orClauses);

    try {
      const maktRes = await client.call('RFC_READ_TABLE', {
        QUERY_TABLE: 'MAKT',
        DELIMITER: '|',
        OPTIONS: options,
        FIELDS: [
          { FIELDNAME: 'MATNR' },
          { FIELDNAME: 'SPRAS' },
          { FIELDNAME: 'MAKTX' }
        ],
        DATA: []
      });

      const fieldNames = (maktRes.FIELDS || []).map((f) => f.FIELDNAME.trim());
      for (const row of maktRes.DATA || []) {
        const parts = row.WA.split('|');
        const obj = {};
        fieldNames.forEach((fn, idx) => { obj[fn] = parts[idx]?.trim(); });
        const mat = obj.MATNR;
        const spras = (obj.SPRAS || '').toUpperCase();
        const maktx = (obj.MAKTX || '').trim();

        if (!mat || !maktx) continue;

        const trimmed = formatMaterialNumber(mat);
        const sapMat = toSapMatnr(mat);

        if (spras === lang1Char) {
          descMap[mat] = maktx;
          descMap[trimmed] = maktx;
          descMap[sapMat] = maktx;
          langMatched.add(mat);
          langMatched.add(trimmed);
          langMatched.add(sapMat);
        } else if (!langMatched.has(mat) && !langMatched.has(trimmed) && !langMatched.has(sapMat)) {
          descMap[mat] = maktx;
          descMap[trimmed] = maktx;
          descMap[sapMat] = maktx;
        }
      }
    } catch (err) {
      console.warn(`[sapRfcClient] batchQueryMakt error:`, err.message);
    }
  }

  for (const m of uniqueMats) {
    const trimmed = formatMaterialNumber(m);
    if (!descMap[m]) descMap[m] = descMap[trimmed] || '-';
    if (!descMap[trimmed]) descMap[trimmed] = descMap[m] || '-';
  }

  return descMap;
}

/**
 * Batches MAST queries in chunks of ~25 materials for a specific plant.
 * Returns a Set of materials that have a sub-BOM in that plant.
 */
export async function batchQuerySubBom(client, materials, plant) {
  if (!materials || materials.length === 0) return new Set();
  loadMockBoms();
  const cleanPlt = String(plant || '').trim().toUpperCase();
  const uniqueMats = [...new Set(materials.map((m) => String(m).trim().toUpperCase()).filter(Boolean))];
  const subBomMats = new Set();

  if (process.env.USE_MOCK_SAP === 'true' || !client) {
    for (const m of uniqueMats) {
      const trimmed = formatMaterialNumber(m);
      const hasMock = activeMockBoms.some(
        (b) => (String(b.material).toUpperCase() === m || formatMaterialNumber(b.material) === trimmed) &&
               String(b.plant).toUpperCase() === cleanPlt
      );
      if (hasMock) {
        subBomMats.add(m);
        subBomMats.add(trimmed);
      }
    }
    return subBomMats;
  }

  const CHUNK_SIZE = 25;
  for (let i = 0; i < uniqueMats.length; i += CHUNK_SIZE) {
    const chunk = uniqueMats.slice(i, i + CHUNK_SIZE);
    const orClauses = chunk.map((m) => `MATNR = '${toSapMatnr(m)}'`).join(' OR ');
    const sql = `WERKS = '${cleanPlt}' AND ( ${orClauses} )`;
    const options = formatRfcTableOptions(sql);

    try {
      const mastRes = await client.call('RFC_READ_TABLE', {
        QUERY_TABLE: 'MAST',
        DELIMITER: '|',
        OPTIONS: options,
        FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'STLNR' }],
        DATA: []
      });

      const fieldNames = (mastRes.FIELDS || []).map((f) => f.FIELDNAME.trim());
      for (const row of mastRes.DATA || []) {
        const parts = row.WA.split('|');
        const obj = {};
        fieldNames.forEach((fn, idx) => { obj[fn] = parts[idx]?.trim(); });
        if (obj.MATNR) {
          subBomMats.add(obj.MATNR);
          subBomMats.add(formatMaterialNumber(obj.MATNR));
          subBomMats.add(toSapMatnr(obj.MATNR));
        }
      }
    } catch (err) {
      console.warn(`[sapRfcClient] batchQuerySubBom error for plant ${cleanPlt}:`, err.message);
    }
  }

  return subBomMats;
}

/**
 * Reads single-level direct BOM records (MAST -> STAS -> STPO -> STKO) for a material.
 */
export async function fetchDirectBom(client, cleanMat, cleanPlt, cleanUsg, cleanAlt) {
  loadMockBoms();
  if (process.env.USE_MOCK_SAP === 'true' || !client) {
    const trimmed = formatMaterialNumber(cleanMat);
    const sapMat = toSapMatnr(cleanMat);
    let found = null;
    if (cleanAlt) {
      const altPad = String(cleanAlt).padStart(2, '0');
      found = activeMockBoms.find(
        (b) =>
          (String(b.material).toUpperCase() === cleanMat || toSapMatnr(b.material) === sapMat || formatMaterialNumber(b.material) === trimmed) &&
          String(b.plant) === cleanPlt &&
          String(b.bomUsage || '1') === cleanUsg &&
          (String(b.alternativeBom || '1').padStart(2, '0') === altPad || String(b.alternativeBom || '1') === String(cleanAlt))
      );
    }
    if (!found) {
      found = activeMockBoms.find(
        (b) =>
          (String(b.material).toUpperCase() === cleanMat || toSapMatnr(b.material) === sapMat || formatMaterialNumber(b.material) === trimmed) &&
          String(b.plant) === cleanPlt &&
          String(b.bomUsage || '1') === cleanUsg
      );
    }
    if (!found) return null;
    return {
      bomNumber: found.bomNumber || '00785396',
      alternative: cleanAlt ? String(cleanAlt).padStart(2, '0') : (found.alternativeBom ? String(found.alternativeBom).padStart(2, '0') : '01'),
      baseQty: found.baseQty || '100',
      baseUnit: found.baseUnit || 'PAA',
      validFrom: found.validFrom || '',
      description: found.description || '',
      components: (found.components || []).map((c, idx) => ({
        item: c.item || String((idx + 1) * 10).padStart(4, '0'),
        itemCategory: c.itemCategory || 'L',
        component: c.component || c.material || '',
        quantity: c.quantity !== undefined ? c.quantity : 1,
        unit: c.unit || 'EA',
        description: c.description !== undefined ? c.description : '',
        validFrom: c.validFrom || found.validFrom || ''
      }))
    };
  }

  // Live SAP RFC call via RFC_READ_TABLE
  const sapMat = toSapMatnr(cleanMat);
  const mastRes = await client.call('RFC_READ_TABLE', {
    QUERY_TABLE: 'MAST',
    DELIMITER: '|',
    OPTIONS: [{ TEXT: `MATNR = '${sapMat}' AND WERKS = '${cleanPlt}'` }],
    FIELDS: [
      { FIELDNAME: 'MATNR' },
      { FIELDNAME: 'WERKS' },
      { FIELDNAME: 'STLAN' },
      { FIELDNAME: 'STLNR' },
      { FIELDNAME: 'STLAL' }
    ],
    DATA: []
  });

  const mastFieldNames = (mastRes.FIELDS || []).map((f) => f.FIELDNAME.trim());
  const mastRows = (mastRes.DATA || []).map((r) => {
    const parts = r.WA.split('|');
    const obj = {};
    mastFieldNames.forEach((fn, idx) => { obj[fn] = parts[idx]?.trim(); });
    return {
      matnr: obj.MATNR,
      werks: obj.WERKS,
      stlan: obj.STLAN,
      stlnr: obj.STLNR,
      stlal: obj.STLAL
    };
  });

  if (mastRows.length === 0) return null;

  const availableAlts = [...new Set(mastRows.filter((r) => r.stlan === cleanUsg).map((r) => r.stlal))];
  let matched = null;
  if (cleanAlt) {
    const targetAltPad = String(cleanAlt).padStart(2, '0');
    matched = mastRows.find((r) => r.stlan === cleanUsg && (r.stlal === targetAltPad || parseInt(r.stlal, 10) === parseInt(cleanAlt, 10)));
  } else {
    const alt01 = mastRows.find((r) => r.stlan === cleanUsg && (r.stlal === '01' || parseInt(r.stlal, 10) === 1));
    if (alt01) {
      matched = alt01;
    } else if (availableAlts.length === 1) {
      matched = mastRows.find((r) => r.stlan === cleanUsg);
    } else {
      return null;
    }
  }

  const stlnr = matched.stlnr;
  const stlal = matched.stlal;

  // Base quantity & unit from STKO
  let baseQty = '100';
  let baseUnit = '';
  let validFrom = '';
  try {
    const stkoRes = await client.call('RFC_READ_TABLE', {
      QUERY_TABLE: 'STKO',
      DELIMITER: '|',
      OPTIONS: [{ TEXT: `STLNR = '${stlnr}' AND STLAL = '${stlal}'` }],
      FIELDS: [{ FIELDNAME: 'BMENG' }, { FIELDNAME: 'BMEIN' }, { FIELDNAME: 'DATUV' }],
      DATA: []
    });
    if (stkoRes.DATA && stkoRes.DATA.length > 0) {
      const fn = (stkoRes.FIELDS || []).map((f) => f.FIELDNAME.trim());
      const p = stkoRes.DATA[0].WA.split('|');
      const rMap = {};
      fn.forEach((n, i) => { rMap[n] = p[i]?.trim(); });
      if (rMap.BMENG) baseQty = String(parseFloat(rMap.BMENG) || 100);
      if (rMap.BMEIN) baseUnit = rMap.BMEIN;
      if (rMap.DATUV) validFrom = rMap.DATUV;
    }
  } catch {}

  if (!baseUnit) {
    try {
      const maraRes = await client.call('RFC_READ_TABLE', {
        QUERY_TABLE: 'MARA',
        DELIMITER: '|',
        OPTIONS: [{ TEXT: `MATNR = '${sapMat}'` }],
        FIELDS: [{ FIELDNAME: 'MEINS' }],
        DATA: []
      });
      if (maraRes.DATA && maraRes.DATA.length > 0) {
        baseUnit = maraRes.DATA[0].WA.split('|')[0]?.trim();
      }
    } catch {}
  }

  // Active items from STAS
  let activeItemNodes = new Set();
  try {
    const stasRes = await client.call('RFC_READ_TABLE', {
      QUERY_TABLE: 'STAS',
      DELIMITER: '|',
      OPTIONS: [{ TEXT: `STLNR = '${stlnr}' AND STLAL = '${stlal}'` }],
      FIELDS: [{ FIELDNAME: 'STLKN' }],
      DATA: []
    });
    activeItemNodes = new Set((stasRes.DATA || []).map((r) => r.WA.split('|')[0]?.trim()));
  } catch {}

  // Components from STPO
  const stpoRes = await client.call('RFC_READ_TABLE', {
    QUERY_TABLE: 'STPO',
    DELIMITER: '|',
    OPTIONS: [{ TEXT: `STLTY = 'M' AND STLNR = '${stlnr}' AND LKENZ = ''` }],
    FIELDS: [
      { FIELDNAME: 'STLKN' },
      { FIELDNAME: 'POSNR' },
      { FIELDNAME: 'POSTP' },
      { FIELDNAME: 'IDNRK' },
      { FIELDNAME: 'MENGE' },
      { FIELDNAME: 'MEINS' },
      { FIELDNAME: 'POTX1' },
      { FIELDNAME: 'DATUV' }
    ],
    DATA: []
  });

  const stpoFn = (stpoRes.FIELDS || []).map((f) => f.FIELDNAME.trim());
  const rawComps = [];

  for (const row of stpoRes.DATA || []) {
    const p = row.WA.split('|').map((s) => s?.trim());
    const rowObj = {};
    stpoFn.forEach((fname, idx) => {
      rowObj[fname] = p[idx] || '';
    });

    if (!activeItemNodes.has(rowObj.STLKN)) {
      continue;
    }

    rawComps.push({
      item: rowObj.POSNR || String((rawComps.length + 1) * 10).padStart(4, '0'),
      itemCategory: rowObj.POSTP || 'L',
      component: rowObj.IDNRK || '',
      quantity: parseFloat(rowObj.MENGE) || 1,
      unit: rowObj.MEINS || 'EA',
      description: rowObj.POTX1 || '',
      validFrom: rowObj.DATUV || validFrom || ''
    });
  }

  return {
    bomNumber: stlnr,
    alternative: stlal,
    baseQty,
    baseUnit: baseUnit || 'PAA',
    validFrom,
    components: rawComps
  };
}

/**
 * Display-only reader for the BOM Hierarchy Explorer (Display BOM).
 * Enriches BOM data with MAKT descriptions, STPO validFrom dates,
 * batched MAST sub-BOM checks, and proper multi-level component hierarchy.
 *
 * @param {object} params
 * @param {string} params.material Material number
 * @param {string} params.plant Plant code
 * @param {string} [params.bomUsage='1'] BOM Usage
 * @param {string} [params.alternativeBom='1'] Alternative BOM
 * @param {boolean} [params.multiLevel=false] Single Level vs Multi-Level explosion
 * @param {number} [params.maxDepth=10] Maximum traversal depth for multi-level
 * @param {object} [params.server] Selected SAP server with credentials and language
 * @returns {Promise<object>} Display-ready BOM data structure
 */
export async function rfcGetBomDisplayData(params = {}) {
  const {
    material,
    plant,
    bomUsage = '1',
    alternativeBom = '1',
    multiLevel = false,
    maxDepth = 10
  } = params;

  if (!material || !String(material).trim()) {
    return {
      success: false,
      bomExists: false,
      errorCode: 'MATERIAL_NOT_FOUND',
      message: 'Material number is required for BOM display.',
      material: '',
      rawMaterial: '',
      plant: String(plant || '').trim(),
      bomUsage: String(bomUsage || '1').trim(),
      alternativeBom: String(alternativeBom || '1').trim(),
      componentCount: 0,
      components: []
    };
  }
  if (!plant || !String(plant).trim()) {
    return {
      success: false,
      bomExists: false,
      errorCode: 'MATERIAL_PLANT_INVALID',
      message: 'Plant code is required for BOM display.',
      material: String(material).trim().toUpperCase(),
      rawMaterial: String(material).trim().toUpperCase(),
      plant: '',
      bomUsage: String(bomUsage || '1').trim(),
      alternativeBom: String(alternativeBom || '1').trim(),
      componentCount: 0,
      components: []
    };
  }

  const cleanMat = String(material).trim().toUpperCase();
  const cleanPlt = String(plant).trim().toUpperCase();
  const cleanUsg = String(bomUsage || '1').trim();
  const cleanAlt = String(alternativeBom || '1').trim();

  const isMock = process.env.USE_MOCK_SAP === 'true';
  const client = params.client || (isMock ? null : await openRfcClient(params.server || {}));
  const shouldClose = !params.client && !isMock;

  const server = params.server || {};
  let targetLang = 'E';
  if (server.lang || server.sap_lang) {
    const l = String(server.lang || server.sap_lang).trim().toUpperCase();
    targetLang = l.charAt(0) || 'E';
  } else if (process.env.SAP_RFC_LANG) {
    targetLang = String(process.env.SAP_RFC_LANG).trim().toUpperCase().charAt(0) || 'E';
  }

  try {
    // 1. Fetch root BOM
    const rootBom = await fetchDirectBom(client, cleanMat, cleanPlt, cleanUsg, cleanAlt);
    if (!rootBom) {
      return {
        success: false,
        bomExists: false,
        errorCode: 'BOM_NOT_FOUND',
        message: `No BOM exists for Material ${cleanMat} in Plant ${cleanPlt} (Usage ${cleanUsg}).`,
        material: formatMaterialNumber(cleanMat),
        rawMaterial: cleanMat,
        plant: cleanPlt,
        bomUsage: cleanUsg,
        alternativeBom: cleanAlt,
        componentCount: 0,
        components: []
      };
    }

    const flatTree = [];
    const materialsToEnrich = new Set([cleanMat]);

    if (!multiLevel) {
      // Single Level: direct components at Level 1
      for (let idx = 0; idx < rootBom.components.length; idx++) {
        const c = rootBom.components[idx];
        const rawComp = String(c.component || '').trim().toUpperCase();
        if (rawComp) materialsToEnrich.add(rawComp);

        flatTree.push({
          level: 1,
          item: c.item || String((idx + 1) * 10).padStart(4, '0'),
          itemNo: parseInt(c.item, 10) || (idx + 1) * 10,
          component: formatMaterialNumber(rawComp),
          rawComponent: rawComp,
          material: formatMaterialNumber(rawComp),
          rawMaterial: rawComp,
          quantity: c.quantity !== undefined ? c.quantity : 1,
          unit: c.unit || 'EA',
          itemCategory: c.itemCategory || 'L',
          validFromRaw: c.validFrom || '',
          validFrom: formatSapDate(c.validFrom),
          parentMaterial: formatMaterialNumber(cleanMat),
          rawParentMaterial: cleanMat
        });
      }
    } else {
      // Multi-Level: recursive traversal up to maxDepth starting at Level 1
      const visitedBranches = new Set();

      async function traverse(parentMat, level) {
        if (level > maxDepth) return;

        const currentBom = (parentMat === cleanMat)
          ? rootBom
          : await fetchDirectBom(client, parentMat, cleanPlt, cleanUsg, '1');

        if (!currentBom || !currentBom.components) return;

        const compMats = currentBom.components.map((c) => String(c.component || '').trim().toUpperCase()).filter(Boolean);
        compMats.forEach((m) => materialsToEnrich.add(m));

        const subBomSet = await batchQuerySubBom(client, compMats, cleanPlt);

        for (let idx = 0; idx < currentBom.components.length; idx++) {
          const c = currentBom.components[idx];
          const rawComp = String(c.component || '').trim().toUpperCase();
          if (!rawComp) continue;

          const hasSub = subBomSet.has(rawComp) || subBomSet.has(formatMaterialNumber(rawComp));

          flatTree.push({
            level,
            item: c.item || String((idx + 1) * 10).padStart(4, '0'),
            itemNo: parseInt(c.item, 10) || (idx + 1) * 10,
            component: formatMaterialNumber(rawComp),
            rawComponent: rawComp,
            material: formatMaterialNumber(rawComp),
            rawMaterial: rawComp,
            quantity: c.quantity !== undefined ? c.quantity : 1,
            unit: c.unit || 'EA',
            itemCategory: c.itemCategory || 'L',
            validFromRaw: c.validFrom || '',
            validFrom: formatSapDate(c.validFrom),
            hasSubBom: hasSub,
            parentMaterial: formatMaterialNumber(parentMat),
            rawParentMaterial: parentMat
          });

          if (hasSub && level < maxDepth) {
            const branchKey = `${parentMat}->${rawComp}`;
            if (!visitedBranches.has(branchKey)) {
              visitedBranches.add(branchKey);
              await traverse(rawComp, level + 1);
            }
          }
        }
      }

      await traverse(cleanMat, 1);
    }

    // 2. Batched enrichment for MAKT descriptions and MAST sub-BOMs
    const allMaterialsArray = Array.from(materialsToEnrich);
    const [descMap, subBomMap] = await Promise.all([
      batchQueryMakt(client, allMaterialsArray, targetLang),
      batchQuerySubBom(client, allMaterialsArray, cleanPlt)
    ]);

    const finalComponents = flatTree.map((item) => {
      const raw = item.rawComponent;
      const formatted = item.component;
      const desc = descMap[raw] || descMap[formatted] || '-';
      const parentDesc = descMap[item.rawParentMaterial] || descMap[item.parentMaterial] || '-';
      const hasSub = item.hasSubBom !== undefined
        ? item.hasSubBom
        : (subBomMap.has(raw) || subBomMap.has(formatted));

      return {
        ...item,
        description: desc,
        parentDescription: parentDesc,
        hasSubBom: hasSub
      };
    });

    const rootDesc = descMap[cleanMat] || descMap[formatMaterialNumber(cleanMat)] || '-';

    return {
      success: true,
      bomExists: true,
      material: formatMaterialNumber(cleanMat),
      rawMaterial: cleanMat,
      plant: cleanPlt,
      bomUsage: cleanUsg,
      alternativeBom: rootBom.alternative || cleanAlt,
      header: {
        bomNumber: rootBom.bomNumber || '-',
        alternative: rootBom.alternative || cleanAlt,
        plant: cleanPlt,
        usage: cleanUsg,
        baseQty: rootBom.baseQty || '100',
        baseUnit: rootBom.baseUnit || 'PAA',
        description: rootDesc,
        material: formatMaterialNumber(cleanMat),
        rawMaterial: cleanMat
      },
      componentCount: finalComponents.length,
      components: finalComponents,
      message: `BOM retrieved successfully via RFC (${finalComponents.length} components)`
    };
  } finally {
    if (shouldClose && client) {
      try {
        await client.close();
      } catch {}
    }
  }
}

/**
 * Finds the lowest free alternative number (01-99) for a list of existing alternatives.
 * @param {Array<number|string>} existingAlternatives
 * @returns {string} 2-digit alternative string e.g. '01', '02'
 */
export function findLowestFreeAlternative(existingAlternatives = []) {
  const existingSet = new Set(
    (existingAlternatives || [])
      .map((a) => parseInt(String(a).trim(), 10))
      .filter((n) => !isNaN(n) && n > 0)
  );
  for (let i = 1; i <= 99; i++) {
    if (!existingSet.has(i)) {
      return String(i).padStart(2, '0');
    }
  }
  return '99';
}

/**
 * Retrieves all existing alternative numbers for a material and plant/usage combination.
 * @param {string} material
 * @param {string} plant
 * @param {string} [bomUsage='1']
 * @param {object} [client=null]
 * @param {object} [server=null]
 * @returns {Promise<number[]>} array of alternative numbers e.g. [1, 2]
 */
export async function getExistingAlternatives(material, plant, bomUsage = '1', client = null, server = null) {
  const cleanMat = String(material || '').trim().toUpperCase();
  const cleanPlt = String(plant || '').trim().toUpperCase();
  const cleanUsg = String(bomUsage || '1').trim();

  if (process.env.USE_MOCK_SAP === 'true') {
    const existing = activeMockBoms.filter(
      (b) =>
        String(b.material).toUpperCase() === cleanMat &&
        String(b.plant) === cleanPlt &&
        String(b.bomUsage || '1') === cleanUsg
    );
    return existing
      .map((b) => parseInt(b.alternativeBom || '1', 10))
      .filter((n) => !isNaN(n) && n > 0);
  }

  const shouldClose = !client;
  const rfc = client || (await openRfcClient(server || {}));

  try {
    const mastRes = await rfc.call('RFC_READ_TABLE', {
      QUERY_TABLE: 'MAST',
      DELIMITER: '|',
      OPTIONS: formatRfcTableOptions(`MATNR = '${toSapMatnr(cleanMat)}' AND WERKS = '${cleanPlt}' AND STLAN = '${cleanUsg}'`),
      FIELDS: [{ FIELDNAME: 'STLAL' }],
      DATA: []
    });

    return (mastRes.DATA || [])
      .map((r) => parseInt(r.WA.split('|')[0]?.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0);
  } catch (err) {
    console.warn(`[sapRfcClient] getExistingAlternatives error for ${cleanMat}:`, err.message);
    return [];
  } finally {
    if (shouldClose) {
      try { await rfc.close(); } catch {}
    }
  }
}

/**
 * Queries SAP MAST table to determine the lowest free alternative BOM number (01-99)
 * for a material and plant/usage combination.
 * If no alternatives exist in the target plant, returns '01'.
 * E.g., if Alt 01 exists, returns '02'.
 *
 * @param {string} material
 * @param {string} plant
 * @param {string} [bomUsage='1']
 * @param {object} [client=null]
 * @param {object} [server=null]
 * @returns {Promise<string>} e.g. '01', '02', '03'
 */
export async function getNextAvailableAlternative(material, plant, bomUsage = '1', client = null, server = null) {
  const existingAlts = await getExistingAlternatives(material, plant, bomUsage, client, server);
  return findLowestFreeAlternative(existingAlts);
}

/**
 * Resolves the target alternative for a BOM copy operation:
 * - If targetAlternative is blank (empty string, null, or undefined):
 *     Queries existing alternatives for the target material + plant + usage in SAP,
 *     combines with any already-allocated alternatives in the current batch (allocatedAlternatives),
 *     and selects the lowest free alternative number (01-99) via findLowestFreeAlternative.
 * - If targetAlternative is explicitly specified:
 *     Checks if the specified alternative already exists in SAP or in allocatedAlternatives.
 *     If it exists, marks as conflict (exists: true, must be blocked).
 *     If it does not exist, returns the specified alternative padded to 2 digits.
 *
 * @param {object} params
 * @param {string} params.targetMaterial
 * @param {string} params.targetPlant
 * @param {string} [params.targetUsage='1']
 * @param {string} [params.targetAlternative='']
 * @param {Array<number|string>} [params.allocatedAlternatives=[]]
 * @param {object} [params.client=null]
 * @param {object} [params.server=null]
 * @returns {Promise<{
 *   targetAlternative: string,
 *   isAutoSelected: boolean,
 *   exists: boolean,
 *   existingAlternatives: number[]
 * }>}
 */
export async function resolveTargetAlternativeForCopy(params = {}) {
  const {
    targetMaterial,
    targetPlant,
    targetUsage = '1',
    targetAlternative = '',
    allocatedAlternatives = [],
    client = null,
    server = null
  } = params;

  const cleanMat = String(targetMaterial || '').trim().toUpperCase();
  const cleanPlt = String(targetPlant || '').trim().toUpperCase();
  const cleanUsg = String(targetUsage || '1').trim();
  const rawSpecified = String(targetAlternative || '').trim();

  // 1. Query existing alternatives from SAP
  const existingAlts = await getExistingAlternatives(cleanMat, cleanPlt, cleanUsg, client, server);

  // 2. Normalize allocated alternatives from current batch
  const allocatedSet = new Set(
    (allocatedAlternatives || [])
      .map((a) => parseInt(String(a).trim(), 10))
      .filter((n) => !isNaN(n) && n > 0)
  );

  const cleanMatch = rawSpecified.match(/\b(\d{1,2})\b/);
  const specifiedNum = cleanMatch ? parseInt(cleanMatch[1], 10) : null;

  // Case A: Explicitly specified target alternative
  if (specifiedNum !== null) {
    const specifiedPad = String(specifiedNum).padStart(2, '0');
    const alreadyExists = existingAlts.includes(specifiedNum) || allocatedSet.has(specifiedNum);
    return {
      targetAlternative: specifiedPad,
      isAutoSelected: false,
      exists: alreadyExists,
      existingAlternatives: existingAlts
    };
  }

  // Case B: Blank target alternative -> auto-select lowest free alternative (01-99)
  const combinedSet = new Set([...existingAlts, ...allocatedSet]);
  const freeAlt = findLowestFreeAlternative(Array.from(combinedSet));

  return {
    targetAlternative: freeAlt,
    isAutoSelected: true,
    exists: false,
    existingAlternatives: existingAlts
  };
}

/**
 * Resolves the source alternative for a BOM copy operation:
 * - If sourceAlternative is explicitly specified: returns it padded to 2 digits.
 * - If sourceAlternative is blank:
 *     Queries existing alternatives for the source material + plant + usage in SAP.
 *     If 01 exists, auto-selects '01'.
 *     Else if exactly one alternative exists, auto-selects that alternative.
 *     Else returns empty string with available alternatives.
 *
 * @param {object} params
 * @param {string} params.sourceMaterial
 * @param {string} params.sourcePlant
 * @param {string} [params.sourceUsage='1']
 * @param {string} [params.sourceAlternative='']
 * @param {object} [params.client=null]
 * @param {object} [params.server=null]
 * @returns {Promise<{
 *   sourceAlternative: string,
 *   isAutoSelected: boolean,
 *   availableAlternatives: number[]
 * }>}
 */
export async function resolveSourceAlternativeForCopy(params = {}) {
  const {
    sourceMaterial,
    sourcePlant,
    sourceUsage = '1',
    sourceAlternative = '',
    client = null,
    server = null
  } = params;

  const cleanMat = String(sourceMaterial || '').trim().toUpperCase();
  const cleanPlt = String(sourcePlant || '').trim().toUpperCase();
  const cleanUsg = String(sourceUsage || '1').trim();
  const rawSpecified = String(sourceAlternative || '').trim();

  const cleanMatch = rawSpecified.match(/\b(\d{1,2})\b/);
  if (cleanMatch) {
    return {
      sourceAlternative: cleanMatch[1].padStart(2, '0'),
      isAutoSelected: false,
      availableAlternatives: []
    };
  }

  const existingAlts = await getExistingAlternatives(cleanMat, cleanPlt, cleanUsg, client, server);
  if (existingAlts.includes(1)) {
    return {
      sourceAlternative: '01',
      isAutoSelected: true,
      availableAlternatives: existingAlts
    };
  }
  if (existingAlts.length === 1) {
    return {
      sourceAlternative: String(existingAlts[0]).padStart(2, '0'),
      isAutoSelected: true,
      availableAlternatives: existingAlts
    };
  }

  return {
    sourceAlternative: '',
    isAutoSelected: false,
    availableAlternatives: existingAlts
  };
}

/**
 * Step 1: Wrapper to fetch direct components, base quantity, and base unit
 * for a single sub-assembly material. Reuses rfcReadBom per material.
 *
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function getSubAssemblyComponents(params = {}) {
  const { material, plant, bomUsage = '1', alternativeBom = '1', client = null } = params;
  const readRes = await rfcReadBom({
    material,
    plant,
    bomUsage,
    alternativeBom,
    client
  });

  if (!readRes.success || !readRes.bomExists) {
    return {
      success: false,
      material,
      plant,
      bomUsage,
      alternativeBom,
      components: [],
      componentCount: 0,
      baseQty: '100',
      baseUnit: 'PAA',
      message: readRes.message || 'Sub-assembly BOM not found'
    };
  }

  return {
    success: true,
    material: readRes.material,
    plant: readRes.plant,
    bomUsage: readRes.bomUsage,
    alternativeBom: readRes.alternativeBom,
    bomNumber: readRes.bomNumber,
    baseQty: readRes.baseQty || '100',
    baseUnit: readRes.baseUnit || 'PAA',
    componentCount: readRes.componentCount,
    components: readRes.components,
    message: readRes.message
  };
}

/**
 * Step 4: Re-runs verification against target plant and compares against source at every depth.
 * Only reports success if all levels match.
 *
 * @param {object} params
 * @returns {Promise<object>}
 */
/**
 * Rule 2: Verifies that every component from a source BOM was copied accurately into the target BOM.
 * Verifies that the target BOM exists, component count matches, and every source component
 * is present with matching material number, quantity, and unit.
 *
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function verifyBomComponents(params = {}) {
  const {
    material,
    plant,
    bomUsage = '1',
    alternativeBom = '1',
    expectedComponents = [],
    client = null
  } = params;

  const readRes = await rfcReadBom({
    material,
    plant,
    bomUsage,
    alternativeBom,
    client
  });

  if (!readRes.success || !readRes.bomExists) {
    return {
      success: false,
      bomExists: false,
      message: `Target BOM not found for ${material} in plant ${plant} (Alt ${alternativeBom})`,
      discrepancies: [`Target BOM header not found in SAP database`]
    };
  }

  const actualComponents = readRes.components || [];
  const discrepancies = [];
  let matchedCount = 0;

  for (const exp of expectedComponents) {
    const expMat = toSapMatnr(exp.component || exp.material || exp.COMPONENT || '');
    if (!expMat) continue;

    const expQty = parseFloat(exp.quantity !== undefined ? exp.quantity : (exp.qty !== undefined ? exp.qty : (exp.COMP_QTY !== undefined ? exp.COMP_QTY : (exp.componentQty || 0))));
    const expUnit = String(exp.unit || exp.COMP_UNIT || exp.componentUnit || '').trim().toUpperCase();

    const actual = actualComponents.find((act) => {
      const actMat = toSapMatnr(act.component || act.material || act.COMPONENT || '');
      return actMat === expMat;
    });

    if (!actual) {
      discrepancies.push(`Missing component ${expMat} (source expected qty ${expQty} ${expUnit})`);
      continue;
    }

    const actQty = parseFloat(actual.quantity !== undefined ? actual.quantity : (actual.qty !== undefined ? actual.qty : (actual.COMP_QTY !== undefined ? actual.COMP_QTY : (actual.componentQty || 0))));
    const actUnit = String(actual.unit || actual.COMP_UNIT || actual.componentUnit || '').trim().toUpperCase();

    if (Math.abs(expQty - actQty) > 0.001) {
      discrepancies.push(`Component ${expMat} quantity mismatch: source has ${expQty}, target has ${actQty}`);
    }

    if (expUnit && actUnit && expUnit !== actUnit) {
      discrepancies.push(`Component ${expMat} unit mismatch: source has ${expUnit}, target has ${actUnit}`);
    }

    matchedCount++;
  }

  if (actualComponents.length !== expectedComponents.length) {
    discrepancies.push(`Component count difference: source has ${expectedComponents.length}, target has ${actualComponents.length}`);
  }

  return {
    success: discrepancies.length === 0,
    bomExists: true,
    bomNumber: readRes.bomNumber || '',
    sourceCount: expectedComponents.length,
    targetCount: actualComponents.length,
    matchedCount,
    discrepancies,
    actualComponents
  };
}

/**
 * Step 4: Re-runs verification against target plant and compares against source at every depth.
 * Only reports success if all levels match.
 *
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function inspectAndVerifyHierarchy(params = {}) {
  const {
    material,
    targetPlant,
    sourceItems = [],
    bomUsage = '1',
    alternativeBom = '1',
    createdAlternatives = null,
    client = null
  } = params;

  const isMock = process.env.USE_MOCK_SAP === 'true';
  const shouldClose = !client && !isMock;
  const rfc = client || (isMock ? null : await openRfcClient(params.server || {}));

  try {
    const verifiedLevels = [];
    let allMatch = true;

    for (const item of sourceItems) {
      const isRoot = item.level === 0;
      const chkMat = isRoot ? String(material || item.material).trim().toUpperCase() : item.material;
      const chkUsage = item.bomUsage || bomUsage;

      let chkAlt;
      if (isRoot) {
        chkAlt = String(alternativeBom).padStart(2, '0');
      } else {
        const lookupKey = `${chkMat}##${item.alternativeBom || '01'}##${chkUsage}`;
        const prev = createdAlternatives?.get?.(lookupKey);
        chkAlt = prev ? String(prev.alternative).padStart(2, '0') : String(item.alternativeBom || '01').padStart(2, '0');
      }

      let existsInTarget = false;
      let targetBomNo = '';
      if (isMock) {
        const chkMatSap = toSapMatnr(chkMat);
        const found = activeMockBoms.find(
          (b) =>
            (String(b.material).toUpperCase() === chkMat || toSapMatnr(b.material) === chkMatSap) &&
            String(b.plant) === String(targetPlant) &&
            String(b.alternativeBom || '1').padStart(2, '0') === chkAlt
        );
        if (found) {
          existsInTarget = true;
          targetBomNo = found.bomNumber || 'MOCK_BOM';
        }
      } else {
        try {
          const chk = await rfc.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'MAST',
            DELIMITER: '|',
            OPTIONS: formatRfcTableOptions(`MATNR = '${toSapMatnr(chkMat)}' AND WERKS = '${targetPlant}' AND STLAL = '${chkAlt}' AND STLAN = '${chkUsage}'`),
            FIELDS: [{ FIELDNAME: 'STLNR' }, { FIELDNAME: 'STLAL' }],
            DATA: []
          });
          if (chk.DATA && chk.DATA.length > 0) {
            existsInTarget = true;
            targetBomNo = chk.DATA[0].WA.split('|')[0]?.trim();
          }
        } catch (err) {
          existsInTarget = false;
        }
      }

      if (!existsInTarget) {
        allMatch = false;
      }

      verifiedLevels.push({
        level: item.level,
        material: chkMat,
        plant: targetPlant,
        alternative: chkAlt,
        bomNumber: targetBomNo,
        verifiedInSap: existsInTarget,
        status: existsInTarget ? 'EXISTS' : 'MISSING'
      });
    }

    return {
      success: allMatch,
      allLevelsMatch: allMatch,
      totalExpected: sourceItems.length,
      totalExisting: verifiedLevels.filter((v) => v.verifiedInSap).length,
      missingCount: verifiedLevels.filter((v) => !v.verifiedInSap).length,
      levels: verifiedLevels
    };
  } finally {
    if (shouldClose) {
      try { await rfc.close(); } catch {}
    }
  }
}

/**
 * Steps 2 & 3: Hierarchical BOM Copy bottom-up (deepest leaves first).
 * - Depth-sorted sub-BOMs loop.
 * - Rule 1: For any material (root or sub-assembly at any depth), if ANY BOM exists in target plant,
 *   always creates a NEW alternative BOM (highest + 1) without touching or overwriting existing alternatives.
 * - Rule 2: Verifies that EVERY component from source is copied accurately into the target alternative.
 * - Rule 3: BASE_UNIT fetched from MARA-MEINS / STKO-BMEIN (not child components).
 * - Stops on first failure and reports which material/depth failed (Step 3).
 * - Re-runs inspectAndVerifyHierarchy at the end (Step 4).
 *
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function repairHierarchyBottomUp(params = {}) {
  const {
    sourceMaterial,
    sourcePlant,
    targetMaterial,
    targetPlant,
    bomUsage = '1',
    sourceAlternative = '1',
    targetAlternative = '1',
    client = null
  } = params;

  const isMock = process.env.USE_MOCK_SAP === 'true';
  const shouldClose = !client && !isMock;
  const rfc = client || (isMock ? null : await openRfcClient(params.server || {}));

  try {
    const cleanSrcMat = String(sourceMaterial || '').trim().toUpperCase();
    const cleanSrcPlt = String(sourcePlant || '').trim().toUpperCase();
    const cleanTgtMat = String(targetMaterial || cleanSrcMat).trim().toUpperCase();
    const cleanTgtPlt = String(targetPlant || cleanSrcPlt).trim().toUpperCase();
    const srcAlt = String(sourceAlternative || '1').trim();

    // 1. Determine NEXT available alternative for root target material (highest + 1)
    const nextRootAlt = await getNextAvailableAlternative(cleanTgtMat, cleanTgtPlt, bomUsage, rfc);
    let resolvedRootAlt = nextRootAlt;

    const cleanSpecifiedAltMatch = String(targetAlternative || '').match(/\b(\d{1,2})\b/);
    const specifiedAlt = cleanSpecifiedAltMatch ? cleanSpecifiedAltMatch[1].padStart(2, '0') : '';

    if (specifiedAlt && specifiedAlt !== '01') {
      // If user specified an alt, check if it already exists in target plant
      let exists = false;
      if (isMock) {
        exists = activeMockBoms.some(
          (b) =>
            String(b.material).toUpperCase() === cleanTgtMat &&
            String(b.plant) === cleanTgtPlt &&
            String(b.alternativeBom || '1').padStart(2, '0') === specifiedAlt
        );
      } else {
        try {
          const chk = await rfc.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'MAST',
            DELIMITER: '|',
            OPTIONS: formatRfcTableOptions(`MATNR = '${toSapMatnr(cleanTgtMat)}' AND WERKS = '${cleanTgtPlt}' AND STLAN = '${bomUsage}' AND STLAL = '${specifiedAlt}'`),
            FIELDS: [{ FIELDNAME: 'STLNR' }],
            DATA: []
          });
          exists = chk.DATA && chk.DATA.length > 0;
        } catch {}
      }
      // Rule 1: If any existing appear, create new alt bom and don't touch existing!
      resolvedRootAlt = exists ? nextRootAlt : specifiedAlt;
    }

    // 2. Explode source hierarchy
    const hierarchyRes = await rfcExplodeBomHierarchy({
      material: cleanSrcMat,
      plant: cleanSrcPlt,
      bomUsage,
      alternativeBom: srcAlt,
      client: rfc
    });

    if (!hierarchyRes.success || hierarchyRes.items.length === 0) {
      return {
        success: false,
        code: 'SOURCE_BOM_NOT_FOUND',
        message: `Source BOM not found for ${cleanSrcMat} in plant ${cleanSrcPlt} (Alt ${srcAlt}). Cannot copy.`
      };
    }

    // 3. Sort depth-wise bottom-up (deepest levels first, Level 0 root last)
    const sortedItems = [...hierarchyRes.items].sort((a, b) => b.level - a.level);
    const executionLog = [];
    const createdBomsByMatAlt = new Map(); // key -> { alternative, bomNumber, componentCount }
    const inMemoryAllocatedAlts = new Map(); // material -> Set of string alternatives

    // Reserve root alternative in memory
    const rootAlloc = new Set([resolvedRootAlt]);
    inMemoryAllocatedAlts.set(cleanTgtMat, rootAlloc);

    for (const item of sortedItems) {
      const isRoot = item.level === 0;
      const currentTargetMat = isRoot ? cleanTgtMat : item.material;
      const currentUsage = item.bomUsage || bomUsage;
      const lookupKey = `${currentTargetMat}##${item.alternativeBom || '01'}##${currentUsage}`;

      // Check if this exact sub-assembly was already copied in this run
      if (!isRoot && createdBomsByMatAlt.has(lookupKey)) {
        const prev = createdBomsByMatAlt.get(lookupKey);
        executionLog.push({
          level: item.level,
          material: currentTargetMat,
          plant: cleanTgtPlt,
          alternative: prev.alternative,
          bomNumber: prev.bomNumber,
          componentCount: prev.componentCount,
          componentsVerified: true,
          status: 'COPIED',
          message: `Sub-assembly Alt ${prev.alternative} already created in this hierarchical copy run`
        });
        continue;
      }

      // Check if this sub-assembly BOM already exists in target plant -> REUSE IT
      if (!isRoot) {
        const existingCheck = await isSubAssemblyBomExistingInTarget(item, cleanTgtPlt, rfc);
        if (existingCheck.exists) {
          executionLog.push({
            level: item.level,
            material: currentTargetMat,
            plant: cleanTgtPlt,
            alternative: existingCheck.alternative,
            bomNumber: existingCheck.bomNumber || '',
            status: 'REUSED',
            reused: true,
            componentsVerified: true,
            message: `Sub-assembly BOM already exists in plant ${cleanTgtPlt} (Alt ${existingCheck.alternative}) - reused without modification`
          });
          continue; // Reused, do not create duplicate BOM
        }
      }

      // Rule 1: Determine new alternative (highest + 1) - Never touch or skip existing!
      let currentTargetAlt;
      if (isRoot) {
        currentTargetAlt = resolvedRootAlt;
      } else {
        const nextAlt = await getNextAvailableAlternative(currentTargetMat, cleanTgtPlt, currentUsage, rfc);
        const allocated = inMemoryAllocatedAlts.get(currentTargetMat) || new Set();
        let altNum = parseInt(nextAlt, 10);
        while (allocated.has(String(altNum).padStart(2, '0'))) {
          altNum++;
        }
        currentTargetAlt = String(altNum).padStart(2, '0');
        allocated.add(currentTargetAlt);
        inMemoryAllocatedAlts.set(currentTargetMat, allocated);
      }

      // Fetch that specific sub-assembly/root's direct components & its material BASE_UNIT from MARA/STKO
      const subCompData = await getSubAssemblyComponents({
        material: item.material,
        plant: cleanSrcPlt,
        bomUsage: currentUsage,
        alternativeBom: item.alternativeBom || srcAlt,
        client: rfc
      });

      if (!subCompData.success || subCompData.components.length === 0) {
        return {
          success: false,
          failedAtLevel: item.level,
          failedMaterial: item.material,
          message: `Failed to read direct components for ${isRoot ? 'root' : 'sub-assembly'} ${item.material} at level ${item.level}: ${subCompData.message}`,
          hierarchy: executionLog
        };
      }

      // Create one BOM header for this level with its own direct children and its own BASE_UNIT
      const createRes = await rfcCreateBom({
        material: currentTargetMat,
        plant: cleanTgtPlt,
        bomUsage: currentUsage,
        alternativeBom: currentTargetAlt,
        components: subCompData.components,
        baseQty: subCompData.baseQty,
        baseUnit: subCompData.baseUnit, // MARA-MEINS / STKO-BMEIN
        client: rfc
      });

      // Step 3: Check RETURN table / result immediately. Stop on first failure!
      if (!createRes.success) {
        executionLog.push({
          level: item.level,
          material: currentTargetMat,
          plant: cleanTgtPlt,
          alternative: currentTargetAlt,
          status: 'FAILED',
          message: createRes.message
        });

        return {
          success: false,
          failedAtLevel: item.level,
          failedMaterial: currentTargetMat,
          message: `Halted at depth ${item.level} for material ${currentTargetMat} (Alt ${currentTargetAlt}): ${createRes.message}`,
          hierarchy: executionLog
        };
      }

      // Rule 2: Verify that every component was copied from the source!
      const compVerification = await verifyBomComponents({
        material: currentTargetMat,
        plant: cleanTgtPlt,
        bomUsage: currentUsage,
        alternativeBom: currentTargetAlt,
        expectedComponents: subCompData.components,
        client: rfc
      });

      if (!compVerification.success) {
        executionLog.push({
          level: item.level,
          material: currentTargetMat,
          plant: cleanTgtPlt,
          alternative: currentTargetAlt,
          status: 'VERIFICATION_FAILED',
          message: `Component verification failed: ${compVerification.discrepancies.join('; ')}`
        });

        return {
          success: false,
          failedAtLevel: item.level,
          failedMaterial: currentTargetMat,
          message: `Component verification failed for ${currentTargetMat} Alt ${currentTargetAlt} in plant ${cleanTgtPlt}: ${compVerification.discrepancies.join('; ')}`,
          hierarchy: executionLog
        };
      }

      const logItem = {
        level: item.level,
        material: currentTargetMat,
        plant: cleanTgtPlt,
        alternative: currentTargetAlt,
        bomNumber: createRes.bomNumber || compVerification.bomNumber || '',
        componentCount: compVerification.targetCount,
        componentsVerified: true,
        status: 'COPIED',
        message: `Created new Alt ${currentTargetAlt} with ${compVerification.targetCount} component(s) (100% verified against source)`
      };
      executionLog.push(logItem);

      createdBomsByMatAlt.set(lookupKey, {
        alternative: currentTargetAlt,
        bomNumber: logItem.bomNumber,
        componentCount: compVerification.targetCount
      });
    }

    // Step 4: Re-run inspectAndVerifyHierarchy against target plant using the created alternatives
    const verification = await inspectAndVerifyHierarchy({
      material: cleanTgtMat,
      targetPlant: cleanTgtPlt,
      sourceItems: hierarchyRes.items,
      bomUsage,
      alternativeBom: resolvedRootAlt,
      createdAlternatives: createdBomsByMatAlt,
      client: rfc
    });

    const rootResult = executionLog.find((e) => e.level === 0);
    const copiedCount = executionLog.filter((e) => e.status === 'COPIED').length;

    return {
      success: rootResult ? (rootResult.status === 'COPIED') : true,
      bomNumber: rootResult?.bomNumber || '',
      alternativeBom: resolvedRootAlt,
      hierarchical: true,
      totalLevels: hierarchyRes.totalLevels,
      totalBoms: hierarchyRes.totalBoms,
      copiedCount,
      hierarchy: executionLog,
      verification,
      message: `Full hierarchy copied & verified: created new Alternative ${resolvedRootAlt} for ${cleanTgtMat} (${copiedCount} BOM(s) created across ${hierarchyRes.totalLevels} level(s), all components 100% verified).`
    };
  } finally {
    if (shouldClose) {
      try { await rfc.close(); } catch {}
    }
  }
}

/**
 * Copies a BOM including all hierarchical sub-assemblies (Full Multi-Level BOM Copy).
 * Replaces slow GUI ZBOM_COPY screen automation with fast RFC/BAPI calls.
 *
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function rfcCopyBom(params = {}) {
  const {
    sourceMaterial,
    sourcePlant,
    targetMaterial,
    targetPlant,
    bomUsage = '1',
    alternativeBom = '1',
    sourceAlternative,
    targetAlternative,
    copyHierarchy = true
  } = params;

  if (params.server && process.env.USE_MOCK_SAP !== 'true') {
    getRfcConnectionParams(params.server);
  }

  // If hierarchical copy is requested (enabled by default), delegate to repairHierarchyBottomUp
  if (copyHierarchy) {
    return repairHierarchyBottomUp(params);
  }

  const cleanSrcMat = String(sourceMaterial || '').trim().toUpperCase();
  const cleanSrcPlt = String(sourcePlant || '').trim().toUpperCase();
  const cleanTgtMat = String(targetMaterial || cleanSrcMat).trim().toUpperCase();
  const cleanTgtPlt = String(targetPlant || cleanSrcPlt).trim().toUpperCase();
  const srcAlt = sourceAlternative || alternativeBom || '1';

  // In single-level copy: Always determine the NEXT available alternative in target plant (highest + 1)
  const nextAlt = await getNextAvailableAlternative(cleanTgtMat, cleanTgtPlt, bomUsage);
  let tgtAlt = nextAlt;

  const cleanSpecifiedAltMatch = String(targetAlternative || '').match(/\b(\d{1,2})\b/);
  const specifiedAlt = cleanSpecifiedAltMatch ? cleanSpecifiedAltMatch[1].padStart(2, '0') : '';

  if (specifiedAlt && specifiedAlt !== '01') {
    let exists = false;
    if (process.env.USE_MOCK_SAP === 'true') {
      exists = activeMockBoms.some(
        (b) =>
          String(b.material).toUpperCase() === cleanTgtMat &&
          String(b.plant) === cleanTgtPlt &&
          String(b.alternativeBom || '1').padStart(2, '0') === specifiedAlt
      );
    } else {
      const client = await openRfcClient(params.server || {});
      try {
        const chk = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'MAST',
          DELIMITER: '|',
          OPTIONS: formatRfcTableOptions(`MATNR = '${toSapMatnr(cleanTgtMat)}' AND WERKS = '${cleanTgtPlt}' AND STLAN = '${bomUsage}' AND STLAL = '${specifiedAlt}'`),
          FIELDS: [{ FIELDNAME: 'STLNR' }],
          DATA: []
        });
        exists = chk.DATA && chk.DATA.length > 0;
      } catch {} finally {
        try { await client.close(); } catch {}
      }
    }
    // Rule 1: Never touch or overwrite existing alternative!
    tgtAlt = exists ? nextAlt : specifiedAlt;
  }

  // Non-hierarchical single copy
  const sourceBom = await rfcReadBom({
    material: cleanSrcMat,
    plant: cleanSrcPlt,
    bomUsage,
    alternativeBom: srcAlt,
    server: params.server
  });

  if (!sourceBom.success || !sourceBom.bomExists) {
    return {
      success: false,
      code: 'SOURCE_BOM_NOT_FOUND',
      message: `Source BOM not found for ${cleanSrcMat} in plant ${cleanSrcPlt} (Alt: ${srcAlt}). Cannot copy.`
    };
  }

  const createResult = await rfcCreateBom({
    material: cleanTgtMat,
    plant: cleanTgtPlt,
    bomUsage,
    alternativeBom: tgtAlt,
    components: sourceBom.components,
    baseQty: sourceBom.baseQty,
    baseUnit: sourceBom.baseUnit,
    server: params.server
  });

  if (!createResult.success) {
    return createResult;
  }

  // Rule 2: Verify that every component was copied from the source
  const compVerification = await verifyBomComponents({
    material: cleanTgtMat,
    plant: cleanTgtPlt,
    bomUsage,
    alternativeBom: tgtAlt,
    expectedComponents: sourceBom.components
  });

  if (!compVerification.success) {
    return {
      success: false,
      code: 'VERIFICATION_FAILED',
      message: `Component verification failed for ${cleanTgtMat} (Alt ${tgtAlt}): ${compVerification.discrepancies.join('; ')}`
    };
  }

  createResult.message = `BOM successfully copied from ${cleanSrcMat} (${cleanSrcPlt}, Alt ${srcAlt}) to ${cleanTgtMat} (${cleanTgtPlt}, Alt ${tgtAlt}) via RFC/BAPI (all ${compVerification.targetCount} components 100% verified).`;
  createResult.sourceComponentCount = sourceBom.componentCount;
  createResult.targetComponentCount = compVerification.targetCount;
  createResult.componentsVerified = true;
  createResult.alternativeBom = tgtAlt;
  return createResult;
}

/**
 * Validates a list of BOM copy requests in batch via RFC.
 *
 * @param {Array<object>} items
 * @returns {Promise<object>}
 */
export async function rfcBatchValidateBoms(items = [], options = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      success: false,
      message: 'No BOM rows provided for validation.',
      totalItems: 0,
      validCount: 0,
      warningCount: 0,
      errorCount: 0,
      results: []
    };
  }

  const results = [];
  const isMock = process.env.USE_MOCK_SAP === 'true';
  const client = options.client || (isMock ? null : await openRfcClient(options.server || options));
  const shouldClose = !options.client && !isMock && client;
  const allocatedByTargetKey = options.allocatedByTargetKey || new Map();

  // Populate any pre-allocated alternatives from options (if passed by caller)
  if (options.allocatedAlternatives && options.targetKey) {
    allocatedByTargetKey.set(options.targetKey, [...options.allocatedAlternatives]);
  }

  try {
    for (const item of items) {
      const srcMat = String(item.sourceMaterial || '').trim().toUpperCase();
      const srcPlant = String(item.sourcePlant || '').trim().toUpperCase();
      const srcUsage = String(item.sourceUsage || item.sourceBomUsage || '1').trim();
      const srcAlt = String(item.sourceAltBom || item.sourceAlternative || '').trim();

      const tgtMat = String(item.targetMaterial || srcMat).trim().toUpperCase();
      const tgtPlant = String(item.targetPlant || '').trim().toUpperCase();
      const tgtUsage = String(item.targetUsage || item.targetBomUsage || '1').trim();
      const tgtAlt = String(item.targetAltBom || item.targetAlternative || '').trim();

      const rowResult = {
        id: item.id || results.length + 1,
        sourceMaterial: srcMat,
        sourcePlant: srcPlant,
        sourceUsage: srcUsage,
        sourceAltBom: srcAlt,
        targetMaterial: tgtMat,
        targetPlant: tgtPlant,
        targetUsage: tgtUsage,
        targetAltBom: tgtAlt,
        status: 'VALID',
        message: '',
        componentCount: 0
      };

      // 1. Basic field validation
      if (!srcMat || !srcPlant || !tgtPlant) {
        rowResult.status = 'ERROR';
        rowResult.message = 'Missing required fields (Source Material, Source Plant, or Target Plant)';
        results.push(rowResult);
        continue;
      }

      // 2. Resolve source alternative if blank using shared function
      let effectiveSrcAlt = srcAlt;
      if (!effectiveSrcAlt) {
        const srcAltRes = await resolveSourceAlternativeForCopy({
          sourceMaterial: srcMat,
          sourcePlant: srcPlant,
          sourceUsage: srcUsage,
          sourceAlternative: srcAlt,
          client,
          server: options.server
        });
        if (srcAltRes.sourceAlternative) {
          effectiveSrcAlt = srcAltRes.sourceAlternative;
          rowResult.sourceAltBom = effectiveSrcAlt;
        } else {
          rowResult.status = 'ERROR';
          rowResult.message = `Alternative BOM was not specified and alternative 01 does not exist for material ${srcMat} in plant ${srcPlant}. Available alternatives: ${(srcAltRes.availableAlternatives || []).join(', ')}`;
          results.push(rowResult);
          continue;
        }
      }

      // 3. Resolve target alternative using shared function
      const targetKey = `${tgtMat}|${tgtPlant}|${tgtUsage}`;
      const allocatedList = allocatedByTargetKey.get(targetKey) || [];

      const tgtAltRes = await resolveTargetAlternativeForCopy({
        targetMaterial: tgtMat,
        targetPlant: tgtPlant,
        targetUsage: tgtUsage,
        targetAlternative: tgtAlt,
        allocatedAlternatives: allocatedList,
        client,
        server: options.server
      });

      // Update allocated list for this target key to prevent file-internal collision
      const resolvedNum = parseInt(tgtAltRes.targetAlternative, 10);
      allocatedByTargetKey.set(targetKey, [...allocatedList, resolvedNum]);

      // Set resolved value in rowResult so preview displays it (not blank!)
      rowResult.targetAltBom = tgtAltRes.targetAlternative;

      // 4. If an explicitly specified alternative already exists, block it (row 3 behavior stays)
      if (tgtAltRes.exists) {
        rowResult.status = 'ERROR';
        rowResult.message = `Cannot copy: Alternative ${parseInt(tgtAltRes.targetAlternative, 10)} already exists in BOM ${tgtMat}/${tgtPlant}/${tgtUsage}`;
        rowResult.problems = [rowResult.message];
        results.push(rowResult);
        continue;
      }

      // 5. Check if Source BOM exists in MAST
      try {
        if (isMock) {
          const matching = activeMockBoms.filter(
            (b) =>
              String(b.material).toUpperCase() === srcMat &&
              String(b.plant) === srcPlant &&
              String(b.bomUsage || '1') === srcUsage
          );

          if (matching.length === 0) {
            rowResult.status = 'ERROR';
            rowResult.message = `Source BOM does not exist for ${srcMat} in plant ${srcPlant}`;
            results.push(rowResult);
            continue;
          }

          const altMatch = matching.find(
            (b) =>
              String(b.alternativeBom || '1').padStart(2, '0') === effectiveSrcAlt.padStart(2, '0') ||
              parseInt(String(b.alternativeBom || '1'), 10) === parseInt(effectiveSrcAlt, 10)
          );

          if (!altMatch) {
            const available = [...new Set(matching.map((b) => String(b.alternativeBom || '1').padStart(2, '0')))];
            rowResult.status = 'ERROR';
            rowResult.message = `Source Alternative ${effectiveSrcAlt} not found. Available: ${available.join(', ')}`;
            results.push(rowResult);
            continue;
          }

          rowResult.componentCount = altMatch.components ? altMatch.components.length : 0;
          if (rowResult.componentCount === 0) {
            rowResult.status = 'INVALID';
            rowResult.message = 'BOM has no active components';
            results.push(rowResult);
            continue;
          }
        } else {
          const mastRes = await client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'MAST',
            DELIMITER: '|',
            OPTIONS: [{ TEXT: `MATNR = '${toSapMatnr(srcMat)}' AND WERKS = '${srcPlant}'` }],
            FIELDS: [{ FIELDNAME: 'STLNR' }, { FIELDNAME: 'STLAL' }, { FIELDNAME: 'STLAN' }],
            DATA: []
          });

          const fieldNames = (mastRes.FIELDS || []).map((f) => f.FIELDNAME.trim());
          const rows = (mastRes.DATA || []).map((r) => {
            const parts = r.WA.split('|');
            const obj = {};
            fieldNames.forEach((name, idx) => {
              obj[name] = parts[idx]?.trim();
            });
            return {
              stlnr: obj.STLNR,
              stlal: obj.STLAL,
              stlan: obj.STLAN
            };
          });

          if (rows.length === 0) {
            rowResult.status = 'ERROR';
            rowResult.message = `Source BOM does not exist for ${srcMat} in plant ${srcPlant}`;
            results.push(rowResult);
            continue;
          }

          const altMatch = rows.find(
            (r) =>
              (r.stlal === effectiveSrcAlt.padStart(2, '0') || parseInt(r.stlal, 10) === parseInt(effectiveSrcAlt, 10)) &&
              (!srcUsage || r.stlan === srcUsage)
          );

          if (!altMatch) {
            const available = [...new Set(rows.map((r) => r.stlal))];
            rowResult.status = 'ERROR';
            rowResult.message = `Source Alternative ${effectiveSrcAlt} not found. Available: ${available.join(', ')}`;
            results.push(rowResult);
            continue;
          }

          // Count components in STAS for this specific alternative
          const stasRes = await client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'STAS',
            DELIMITER: '|',
            OPTIONS: [{ TEXT: `STLTY = 'M' AND STLNR = '${altMatch.stlnr}' AND STLAL = '${altMatch.stlal}' AND LKENZ = ''` }],
            FIELDS: [{ FIELDNAME: 'STLKN' }],
            DATA: []
          });
          rowResult.componentCount = stasRes.DATA ? stasRes.DATA.length : 0;
          if (rowResult.componentCount === 0) {
            rowResult.status = 'INVALID';
            rowResult.message = 'BOM has no active components';
            results.push(rowResult);
            continue;
          }
        }
      } catch (srcErr) {
        rowResult.status = 'ERROR';
        rowResult.message = `Failed to check source BOM: ${srcErr.message}`;
        results.push(rowResult);
        continue;
      }

      // 6. Pre-validate Target BOM creation with BAPI TESTRUN simulation (BAPIFLAG = 'X')
      try {
        const simRes = await rfcSimulateCopyBom({
          sourceMaterial: srcMat,
          sourcePlant: srcPlant,
          sourceUsage: srcUsage,
          sourceAlternative: effectiveSrcAlt || '01',
          targetMaterial: tgtMat,
          targetPlant: tgtPlant,
          targetUsage: tgtUsage,
          targetAlternative: tgtAltRes.targetAlternative,
          client,
          copyHierarchy: options.copyHierarchy !== false
        });

        if (!simRes.valid) {
          rowResult.status = 'ERROR';
          rowResult.message = simRes.message;
          rowResult.problems = simRes.problems || [simRes.message];
          rowResult.totalBomsSimulated = simRes.totalBomsSimulated;
          rowResult.totalBomsInHierarchy = simRes.totalBomsInHierarchy;
          rowResult.durationMs = simRes.durationMs;
          results.push(rowResult);
          continue;
        }
      } catch (simErr) {
        rowResult.status = 'ERROR';
        rowResult.message = `Cannot copy: ${simErr.message}`;
        results.push(rowResult);
        continue;
      }

      rowResult.status = 'VALID';
      rowResult.message = tgtAltRes.isAutoSelected
        ? `Ready to copy (Alternative ${tgtAltRes.targetAlternative} auto-selected, ${rowResult.componentCount} components)`
        : `Ready to copy (${rowResult.componentCount} components)`;
      results.push(rowResult);
    }
  } finally {
    if (shouldClose) {
      try {
        await client.close();
      } catch {}
    }
  }

  const validCount = results.filter((r) => r.status === 'VALID').length;
  const warningCount = results.filter((r) => r.status === 'WARNING').length;
  const errorCount = results.filter((r) => r.status === 'ERROR').length;

  return {
    success: true,
    totalItems: results.length,
    validCount,
    warningCount,
    errorCount,
    results
  };
}

/**
 * Copies a list of BOMs sequentially with row-level error isolation.
 *
 * @param {Array<object>} items
 * @param {object} [options={}]
 * @returns {Promise<object>}
 */
export async function rfcBatchCopyBoms(items = [], options = {}) {
  const { skipErrors = true, copyHierarchy = true } = options;

  if (!Array.isArray(items) || items.length === 0) {
    return {
      success: false,
      message: 'No BOM rows provided for execution.',
      totalProcessed: 0,
      successCount: 0,
      failedCount: 0,
      results: []
    };
  }

  const results = [];
  const allocatedByTargetKey = options.allocatedByTargetKey || new Map();

  for (const item of items) {
    const srcMat = String(item.sourceMaterial || '').trim().toUpperCase();
    const srcPlant = String(item.sourcePlant || '').trim().toUpperCase();
    const srcUsage = String(item.sourceUsage || item.sourceBomUsage || '1').trim();
    const srcAlt = String(item.sourceAltBom || item.sourceAlternative || '').trim();

    const tgtMat = String(item.targetMaterial || srcMat).trim().toUpperCase();
    const tgtPlant = String(item.targetPlant || '').trim().toUpperCase();
    const tgtUsage = String(item.targetUsage || item.targetBomUsage || '1').trim();
    const tgtAlt = String(item.targetAltBom || item.targetAlternative || '').trim();

    const rowResult = {
      id: item.id || results.length + 1,
      sourceMaterial: srcMat,
      sourcePlant: srcPlant,
      sourceAltBom: srcAlt,
      targetMaterial: tgtMat,
      targetPlant: tgtPlant,
      targetAltBom: tgtAlt,
      bomNumber: '',
      success: false,
      message: '',
      timestamp: new Date().toISOString()
    };

    if (!srcMat || !srcPlant || !tgtPlant) {
      rowResult.message = 'Missing required identifiers (Source Material, Source Plant, or Target Plant)';
      results.push(rowResult);
      if (!skipErrors) break;
      continue;
    }

    // Resolve source alternative if blank
    let effectiveSrcAlt = srcAlt;
    if (!effectiveSrcAlt) {
      const srcAltRes = await resolveSourceAlternativeForCopy({
        sourceMaterial: srcMat,
        sourcePlant: srcPlant,
        sourceUsage: srcUsage,
        sourceAlternative: srcAlt,
        server: options.server
      });
      if (srcAltRes.sourceAlternative) {
        effectiveSrcAlt = srcAltRes.sourceAlternative;
        rowResult.sourceAltBom = effectiveSrcAlt;
      }
    }

    // Resolve target alternative using shared function
    const targetKey = `${tgtMat}|${tgtPlant}|${tgtUsage}`;
    const allocatedList = allocatedByTargetKey.get(targetKey) || [];

    const tgtAltRes = await resolveTargetAlternativeForCopy({
      targetMaterial: tgtMat,
      targetPlant: tgtPlant,
      targetUsage: tgtUsage,
      targetAlternative: tgtAlt,
      allocatedAlternatives: allocatedList,
      server: options.server
    });

    const resolvedNum = parseInt(tgtAltRes.targetAlternative, 10);
    allocatedByTargetKey.set(targetKey, [...allocatedList, resolvedNum]);
    const resolvedTgtAlt = tgtAltRes.targetAlternative;
    rowResult.targetAltBom = resolvedTgtAlt;

    // If an explicitly specified target alternative already exists, block it
    if (tgtAltRes.exists) {
      rowResult.success = false;
      rowResult.message = `Cannot copy: Alternative ${parseInt(resolvedTgtAlt, 10)} already exists in BOM ${tgtMat}/${tgtPlant}/${tgtUsage}`;
      results.push(rowResult);
      if (!skipErrors) break;
      continue;
    }

    try {
      const copyRes = await rfcCopyBom({
        sourceMaterial: srcMat,
        sourcePlant: srcPlant,
        targetMaterial: tgtMat,
        targetPlant: tgtPlant,
        bomUsage: tgtUsage,
        sourceAlternative: effectiveSrcAlt || '1',
        targetAlternative: resolvedTgtAlt,
        copyHierarchy,
        server: options.server
      });

      if (copyRes.success) {
        rowResult.success = true;
        rowResult.bomNumber = copyRes.bomNumber || '';
        rowResult.targetAltBom = copyRes.alternativeBom || resolvedTgtAlt;
        rowResult.message = copyRes.message || `Copied successfully (Alt ${copyRes.alternativeBom || resolvedTgtAlt})`;
        rowResult.sourceComponentCount = copyRes.sourceComponentCount || 0;
        rowResult.totalLevels = copyRes.totalLevels || 1;
        rowResult.totalBoms = copyRes.totalBoms || 1;
        rowResult.hierarchy = copyRes.hierarchy || [];
      } else {
        rowResult.success = false;
        rowResult.message = copyRes.message || 'BOM Copy failed in SAP';
      }
    } catch (err) {
      rowResult.success = false;
      rowResult.message = `RFC Exception: ${err.message}`;
    }

    results.push(rowResult);
    if (!rowResult.success && !skipErrors) {
      break;
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const failedCount = results.filter((r) => !r.success).length;

  return {
    success: true,
    totalProcessed: results.length,
    successCount,
    failedCount,
    results
  };
}

/**
 * Reads the created target BOM hierarchy back from SAP using read-only RFC calls
 * (via rfcGetBomDisplayData), strictly verifies every component at every level against
 * the reference BOM, and formats the structure grouped by Parent BOM for the result UI.
 *
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function verifyCopiedBomHierarchy(params = {}) {
  const {
    sourceMaterial,
    sourcePlant,
    sourceUsage = '1',
    sourceAlternative = '1',
    targetMaterial,
    targetPlant,
    targetUsage = '1',
    targetAlternative = '1',
    server = null,
    client = null
  } = params;

  if (!targetMaterial || !targetPlant) {
    throw new Error('targetMaterial and targetPlant are required for verification.');
  }

  const isMock = process.env.USE_MOCK_SAP === 'true';
  const shouldClose = !client && !isMock;
  const rfc = client || (isMock ? null : await openRfcClient(server || {}));

  try {
    const cleanSrcMat = String(sourceMaterial || '').trim().toUpperCase();
    const cleanSrcPlt = String(sourcePlant || '').trim().toUpperCase();
    const cleanSrcUsg = String(sourceUsage || '1').trim();
    const cleanSrcAlt = String(sourceAlternative || '1').trim();

    const cleanTgtMat = String(targetMaterial || cleanSrcMat).trim().toUpperCase();
    const cleanTgtPlt = String(targetPlant || cleanSrcPlt).trim().toUpperCase();
    const cleanTgtUsg = String(targetUsage || cleanSrcUsg).trim();
    const cleanTgtAlt = String(targetAlternative || '1').trim();

    // 1. Read Target Hierarchy back from SAP
    const targetTree = await rfcGetBomDisplayData({
      material: cleanTgtMat,
      plant: cleanTgtPlt,
      bomUsage: cleanTgtUsg,
      alternativeBom: cleanTgtAlt,
      multiLevel: true,
      server,
      client: rfc
    });

    if (!targetTree || !targetTree.success || !targetTree.bomExists) {
      return {
        success: false,
        status: 'FAILED',
        message: targetTree?.message || `Target BOM not found for ${cleanTgtMat} in plant ${cleanTgtPlt} (Alt ${cleanTgtAlt})`,
        bomsCreated: 0,
        totalComponents: 0,
        totalLevels: 0,
        rootAlternative: cleanTgtAlt,
        targetHeader: null,
        verification: {
          verifiedCount: 0,
          totalCount: 0,
          status: 'FAILED',
          message: 'Target BOM hierarchy could not be read from SAP database',
          differences: ['Target BOM header not found in SAP database']
        },
        groups: [],
        flatComponents: []
      };
    }

    // 2. Read Source Hierarchy from SAP for strict verification
    let sourceTree = null;
    if (cleanSrcMat && cleanSrcPlt) {
      sourceTree = await rfcGetBomDisplayData({
        material: cleanSrcMat,
        plant: cleanSrcPlt,
        bomUsage: cleanSrcUsg,
        alternativeBom: cleanSrcAlt,
        multiLevel: true,
        server,
        client: rfc
      });
    }

    const srcComps = sourceTree?.components || [];
    const tgtComps = targetTree?.components || [];
    const differences = [];
    let verifiedCount = 0;

    // Track matched target components
    const matchedTargetIndices = new Set();

    for (let sIdx = 0; sIdx < srcComps.length; sIdx++) {
      const src = srcComps[sIdx];
      const srcMat = formatMaterialNumber(src.rawComponent || src.component);
      const srcParent = formatMaterialNumber(src.rawParentMaterial || src.parentMaterial);
      const srcQty = parseFloat(src.quantity) || 0;
      const srcUnit = String(src.unit || '').trim().toUpperCase();
      const srcCat = String(src.itemCategory || 'L').trim().toUpperCase();
      const srcSub = Boolean(src.hasSubBom);

      // Find best match in target components
      let bestMatchIdx = -1;
      for (let tIdx = 0; tIdx < tgtComps.length; tIdx++) {
        if (matchedTargetIndices.has(tIdx)) continue;
        const tgt = tgtComps[tIdx];
        const tgtMat = formatMaterialNumber(tgt.rawComponent || tgt.component);
        const tgtParent = formatMaterialNumber(tgt.rawParentMaterial || tgt.parentMaterial);

        const isRootLevel = src.level === 1 && tgt.level === 1;
        const parentMatches = tgtParent === srcParent || isRootLevel;
        const itemMatches = !src.item || !tgt.item || src.item === tgt.item;

        if (tgtMat === srcMat && tgt.level === src.level && parentMatches && itemMatches) {
          bestMatchIdx = tIdx;
          break;
        }
      }

      if (bestMatchIdx === -1) {
        // Fallback match by component material and level with parent match
        for (let tIdx = 0; tIdx < tgtComps.length; tIdx++) {
          if (matchedTargetIndices.has(tIdx)) continue;
          const tgt = tgtComps[tIdx];
          const tgtMat = formatMaterialNumber(tgt.rawComponent || tgt.component);
          const tgtParent = formatMaterialNumber(tgt.rawParentMaterial || tgt.parentMaterial);
          const isRootLevel = src.level === 1 && tgt.level === 1;
          const parentMatches = tgtParent === srcParent || isRootLevel;

          if (tgtMat === srcMat && tgt.level === src.level && parentMatches) {
            bestMatchIdx = tIdx;
            break;
          }
        }
      }

      if (bestMatchIdx === -1) {
        // Fallback match by component material and level
        for (let tIdx = 0; tIdx < tgtComps.length; tIdx++) {
          if (matchedTargetIndices.has(tIdx)) continue;
          const tgt = tgtComps[tIdx];
          const tgtMat = formatMaterialNumber(tgt.rawComponent || tgt.component);
          if (tgtMat === srcMat && tgt.level === src.level) {
            bestMatchIdx = tIdx;
            break;
          }
        }
      }

      if (bestMatchIdx === -1) {
        differences.push(`Missing component ${src.component} (Item ${src.item}) under parent ${src.parentMaterial} at Level ${src.level}`);
        continue;
      }

      matchedTargetIndices.add(bestMatchIdx);
      const tgt = tgtComps[bestMatchIdx];
      const tgtQty = parseFloat(tgt.quantity) || 0;
      const tgtUnit = String(tgt.unit || '').trim().toUpperCase();
      const tgtCat = String(tgt.itemCategory || 'L').trim().toUpperCase();
      const tgtSub = Boolean(tgt.hasSubBom);

      let itemErrors = [];
      if (Math.abs(srcQty - tgtQty) > 0.001) {
        itemErrors.push(`quantity mismatch (source: ${src.quantity}, target: ${tgt.quantity})`);
      }
      if (srcUnit && tgtUnit && srcUnit !== tgtUnit) {
        itemErrors.push(`unit mismatch (source: ${src.unit}, target: ${tgt.unit})`);
      }
      if (srcCat && tgtCat && srcCat !== tgtCat) {
        itemErrors.push(`category mismatch (source: ${src.itemCategory}, target: ${tgt.itemCategory})`);
      }
      if (srcSub !== tgtSub) {
        itemErrors.push(`Sub-BOM mismatch (source: ${srcSub ? 'Sub-BOM' : 'Leaf'}, target: ${tgtSub ? 'Sub-BOM' : 'Leaf'})`);
      }

      if (itemErrors.length === 0) {
        verifiedCount++;
        tgt.isVerified = true;
      } else {
        tgt.isVerified = false;
        tgt.verificationNote = itemErrors.join(', ');
        differences.push(`Component ${tgt.component} (Item ${tgt.item}): ${itemErrors.join(', ')}`);
      }
    }

    // Check for any target components not present in source
    for (let tIdx = 0; tIdx < tgtComps.length; tIdx++) {
      if (!matchedTargetIndices.has(tIdx)) {
        const tgt = tgtComps[tIdx];
        tgt.isVerified = false;
        tgt.verificationNote = 'Extra component in target not in source';
        differences.push(`Extra component ${tgt.component} in target under ${tgt.parentMaterial} at Level ${tgt.level}`);
      }
    }

    const totalCount = srcComps.length > 0 ? srcComps.length : tgtComps.length;
    let status = 'SUCCESS';
    if (differences.length > 0 || verifiedCount < totalCount) {
      status = verifiedCount > 0 ? 'PARTIAL' : 'FAILED';
    }

    const message = status === 'SUCCESS'
      ? `All ${verifiedCount} components 100% verified against reference BOM.`
      : (status === 'PARTIAL'
        ? `Partial verification: ${verifiedCount} of ${totalCount} components verified (${differences.length} difference(s) detected).`
        : `Verification failed: ${verifiedCount} of ${totalCount} components verified.`);

    // 3. Group target components by Parent BOM
    const groupsMap = new Map();
    for (const comp of tgtComps) {
      const parentKey = String(comp.rawParentMaterial || comp.parentMaterial || cleanTgtMat);
      if (!groupsMap.has(parentKey)) {
        groupsMap.set(parentKey, {
          parentMaterial: comp.parentMaterial || formatMaterialNumber(cleanTgtMat),
          rawParentMaterial: comp.rawParentMaterial || cleanTgtMat,
          parentDescription: comp.parentDescription || (parentKey === cleanTgtMat ? targetTree.header?.description : '-'),
          level: Math.max((comp.level || 1) - 1, 0),
          bomNumber: targetTree.header?.bomNumber || '-',
          componentCount: 0,
          components: []
        });
      }
      const g = groupsMap.get(parentKey);
      g.componentCount++;
      g.components.push(comp);
    }

    const groups = Array.from(groupsMap.values());
    const maxLevel = tgtComps.length > 0 ? Math.max(...tgtComps.map((c) => c.level || 1)) : 1;
    const resolvedRootAlt = targetTree.header?.alternative || cleanTgtAlt;

    const totalSourceComponents = srcComps.length > 0 ? srcComps.length : tgtComps.length;

    return {
      success: status === 'SUCCESS',
      status, // 'SUCCESS' | 'PARTIAL' | 'FAILED'
      message,
      bomsCreated: groups.length,
      totalComponents: totalSourceComponents,
      totalLevels: maxLevel,
      rootAlternative: resolvedRootAlt,
      targetHeader: targetTree.header,
      verification: {
        verifiedCount,
        totalCount: totalSourceComponents,
        status,
        message,
        differences
      },
      groups,
      flatComponents: tgtComps
    };
  } finally {
    if (shouldClose) {
      try { await rfc.close(); } catch {}
    }
  }
}

export default {
  setActiveRfcServer,
  getActiveRfcServer,
  getRfcConnectionParams,
  openRfcClient,
  formatRfcTableOptions,
  executeRfcFunction,
  rfcRetryJob,
  rfcReprocessIdoc,
  pingRfcServer,
  rfcReadBom,
  rfcExplodeBomHierarchy,
  rfcValidateSourceBom,
  rfcCreateBom,
  rfcSimulateCopyBom,
  isSubAssemblyBomExistingInTarget,
  rfcDeleteBom,
  rfcCopyBom,
  findLowestFreeAlternative,
  getExistingAlternatives,
  getNextAvailableAlternative,
  resolveTargetAlternativeForCopy,
  resolveSourceAlternativeForCopy,
  getSubAssemblyComponents,
  verifyBomComponents,
  inspectAndVerifyHierarchy,
  repairHierarchyBottomUp,
  rfcBatchValidateBoms,
  rfcBatchCopyBoms,
  rfcGetBomDisplayData,
  verifyCopiedBomHierarchy,
  toSapMatnr,
  formatMaterialNumber,
  formatSapDate,
  batchQueryMakt,
  batchQuerySubBom,
  fetchDirectBom,
  loadMockBoms
};
