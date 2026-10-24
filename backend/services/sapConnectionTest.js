/**
 * ============================================================================
 * SAP RFC SERVER CONNECTION TEST ENGINE
 * ============================================================================
 * Performs comprehensive, read-only verification of a target SAP server:
 * 1. RFC reachable and logon OK
 * 2. RFC_READ_TABLE authorization confirmed
 * 3. Material number field length (MARA-MATNR: 18 or 40 chars) - Informational
 * 4. ZBOM_COPY presence check (with clear warning if missing)
 * 5. Data dictionary schema check (DD03L) querying required tables and fields
 *
 * Saves the connection test result in the database (connection_test JSONB column)
 * ============================================================================
 */

import { openRfcClient, getRfcConnectionParams } from './sapRfcClient.js';
import { supabaseService, getPersistedCredential } from './supabaseClient.js';
import { decryptPassword } from '../utils/crypto.js';

// Required tables and fields in SAP data dictionary for BOM hub operations
export const REQUIRED_SCHEMA_FIELDS = {
  MAST: ['MATNR', 'WERKS', 'STLAN', 'STLNR', 'STLAL'],
  STKO: ['BMENG', 'BMEIN', 'DATUV', 'STLST', 'STKTX'],
  MARA: ['MATNR', 'MEINS'],
  STAS: ['STLTY', 'STLKN', 'LKENZ'], // STPOZ excluded as per Step 2 fix; STLTY and LKENZ added
  STPO: ['STLTY', 'STLKN', 'POSNR', 'POSTP', 'IDNRK', 'MENGE', 'MEINS', 'POTX1', 'DATUV', 'LGORT', 'SANKA', 'SANKO', 'LKENZ'],
  MAKT: ['MATNR', 'SPRAS', 'MAKTX'],
  MARC: ['MATNR', 'WERKS'],
  T001L: ['WERKS', 'LGORT'],
  T415S: ['STLST']
};

/**
 * Wraps a promise with a timeout in milliseconds.
 */
function withTimeout(promise, ms, operationName) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms / 1000}s during ${operationName}`)), ms)
    )
  ]);
}

/**
 * Executes the 5-point read-only connection test against an SAP server.
 *
 * @param {object} server - Server configuration (or server with id)
 * @param {object} [options={}] - Options { persist: boolean, client: object }
 * @returns {Promise<object>} Test result payload
 */
export async function testServerConnection(server = {}, options = {}) {
  const { persist = true, timeoutMs = 30000 } = options;

  let resolvedServer = { ...server };

  // If server has an ID, ensure we load stored encrypted password and missing details
  if (server.id) {
    try {
      const dbServer = await supabaseService.getServerById(server.id);
      if (dbServer) {
        if (!resolvedServer.sap_password_encrypted && dbServer.sap_password_encrypted) {
          resolvedServer.sap_password_encrypted = dbServer.sap_password_encrypted;
        }
        if (!resolvedServer.sap_username && dbServer.sap_username) {
          resolvedServer.sap_username = dbServer.sap_username;
        }
        if (!resolvedServer.ashost && dbServer.ashost) {
          resolvedServer.ashost = dbServer.ashost;
        }
      }
    } catch (_) {}
    if (!resolvedServer.sap_password_encrypted) {
      const persisted = getPersistedCredential(server.id);
      if (persisted && persisted.sap_password_encrypted) {
        resolvedServer.sap_password_encrypted = persisted.sap_password_encrypted;
        if (!resolvedServer.sap_username) resolvedServer.sap_username = persisted.sap_username;
      }
    }
  }

  // Resolve password if encrypted
  let rawPassword = resolvedServer.sap_password || resolvedServer.password || resolvedServer.passwd;
  if (!rawPassword && resolvedServer.sap_password_encrypted) {
    try {
      rawPassword = decryptPassword(resolvedServer.sap_password_encrypted);
    } catch (_) {}
  }
  resolvedServer.sap_password = rawPassword;

  const checks = [];

  // Check 1: Validate minimum parameters
  const host = resolvedServer.ashost || '';
  const sysnr = resolvedServer.sysnr || '00';
  const clientNum = resolvedServer.client || '100';
  const user = resolvedServer.sap_username || '';

  if (!host || !user || !rawPassword) {
    const missing = [];
    if (!host) missing.push('Application Host (ashost)');
    if (!user) missing.push('SAP Username');
    if (!rawPassword) missing.push('SAP Password');

    const failResult = {
      success: false,
      overallStatus: 'FAIL',
      tested_at: new Date().toISOString(),
      summary: `Incomplete server configuration: missing ${missing.join(', ')}`,
      checks: [
        {
          id: 'rfc_logon',
          name: 'RFC Reachability & Logon',
          status: 'FAIL',
          message: `Missing credentials: ${missing.join(', ')}`
        },
        {
          id: 'rfc_read_table',
          name: 'RFC_READ_TABLE Authorization',
          status: 'SKIPPED',
          message: 'Skipped due to logon failure'
        },
        {
          id: 'matnr_length',
          name: 'Material Number Field Length',
          status: 'SKIPPED',
          message: 'Skipped due to logon failure'
        },
        {
          id: 'zbom_copy',
          name: 'ZBOM_COPY Interface',
          status: 'SKIPPED',
          message: 'Skipped due to logon failure'
        },
        {
          id: 'dd03l_schema',
          name: 'Data Dictionary Schema (DD03L)',
          status: 'SKIPPED',
          message: 'Skipped due to logon failure'
        }
      ]
    };

    if (persist && resolvedServer.id) {
      await supabaseService.updateServer(resolvedServer.id, { connection_test: failResult });
    }

    return failResult;
  }

  // Handle Mock Mode
  if (process.env.USE_MOCK_SAP === 'true' && !options.client) {
    if (rawPassword === 'WRONG_PASSWORD' || user === 'WRONG_USER') {
      const mockFail = {
        success: false,
        overallStatus: 'FAIL',
        tested_at: new Date().toISOString(),
        summary: 'SAP RFC Logon failed: RFC_LOGON_FAILURE (User or password incorrect)',
        checks: [
          {
            id: 'rfc_logon',
            name: 'RFC Reachability & Logon',
            status: 'FAIL',
            message: 'SAP RFC Logon failed: User or password incorrect'
          },
          {
            id: 'rfc_read_table',
            name: 'RFC_READ_TABLE Authorization',
            status: 'SKIPPED',
            message: 'Skipped due to logon failure'
          },
          {
            id: 'matnr_length',
            name: 'Material Number Field Length',
            status: 'SKIPPED',
            message: 'Skipped due to logon failure'
          },
          {
            id: 'zbom_copy',
            name: 'ZBOM_COPY Interface',
            status: 'SKIPPED',
            message: 'Skipped due to logon failure'
          },
          {
            id: 'dd03l_schema',
            name: 'Data Dictionary Schema (DD03L)',
            status: 'SKIPPED',
            message: 'Skipped due to logon failure'
          }
        ]
      };
      if (persist && resolvedServer.id) {
      await supabaseService.updateServer(resolvedServer.id, { connection_test: mockFail });
    }
      return mockFail;
    }

    const isS4 = String(resolvedServer.client) === '800' || String(resolvedServer.name).toLowerCase().includes('hana');
    const mockSuccess = {
      success: true,
      overallStatus: isS4 ? 'WARN' : 'PASS',
      tested_at: new Date().toISOString(),
      summary: isS4
        ? 'Connection to SAP server successful with warnings: ZBOM_COPY not found'
        : 'Connection to SAP server successful: All 5 RFC checks passed',
      checks: [
        {
          id: 'rfc_logon',
          name: 'RFC Reachability & Logon',
          status: 'PASS',
          message: `RFC reachable and login OK (${host}:${sysnr}, client ${clientNum}, user ${user})`
        },
        {
          id: 'rfc_read_table',
          name: 'RFC_READ_TABLE Authorization',
          status: 'PASS',
          message: 'RFC_READ_TABLE authorization confirmed'
        },
        {
          id: 'matnr_length',
          name: 'Material Number Field Length',
          status: 'INFO',
          length: isS4 ? 40 : 18,
          message: isS4
            ? 'Material number field length: 40 characters (S/4HANA schema, numeric padded to 18)'
            : 'Material number field length: 18 characters (Standard ECC schema)'
        },
        {
          id: 'zbom_copy',
          name: 'ZBOM_COPY Interface',
          status: isS4 ? 'WARN' : 'PASS',
          message: isS4
            ? 'ZBOM_COPY not found: Copy and Delete operations are unavailable on this server without ZBOM_COPY'
            : 'ZBOM_COPY present in SAP (program ZPP_BOM_COPY_CREATION)'
        },
        {
          id: 'dd03l_schema',
          name: 'Data Dictionary Schema (DD03L)',
          status: 'PASS',
          message: 'All required table fields verified (MAST, STKO, MARA, STAS, STPO, MAKT, MARC, T001L, T415S)'
        }
      ]
    };

    if (persist && resolvedServer.id) {
      await supabaseService.updateServer(resolvedServer.id, { connection_test: mockSuccess });
    }

    return mockSuccess;
  }

  // Live RFC execution
  let client = options.client;
  const shouldClose = !options.client;

  try {
    // 1. Check RFC Reachability & Logon
    try {
      if (!client) {
        client = await withTimeout(
          openRfcClient({ server: resolvedServer }),
          timeoutMs,
          'RFC Logon'
        );
      }
      await withTimeout(client.call('RFC_PING', {}), timeoutMs, 'RFC_PING');
      checks.push({
        id: 'rfc_logon',
        name: 'RFC Reachability & Logon',
        status: 'PASS',
        message: `RFC reachable and login OK (${host}:${sysnr}, client ${clientNum}, user ${user})`
      });
    } catch (logonErr) {
      const sanitized = (logonErr.message || 'Logon failed').split(rawPassword).join('***');
      checks.push({
        id: 'rfc_logon',
        name: 'RFC Reachability & Logon',
        status: 'FAIL',
        message: `RFC logon failed: ${sanitized}`
      });
      // Skip downstream checks
      const failPayload = {
        success: false,
        overallStatus: 'FAIL',
        tested_at: new Date().toISOString(),
        summary: `RFC logon failed: ${sanitized}`,
        checks: [
          ...checks,
          { id: 'rfc_read_table', name: 'RFC_READ_TABLE Authorization', status: 'SKIPPED', message: 'Skipped due to logon failure' },
          { id: 'matnr_length', name: 'Material Number Field Length', status: 'SKIPPED', message: 'Skipped due to logon failure' },
          { id: 'zbom_copy', name: 'ZBOM_COPY Interface', status: 'SKIPPED', message: 'Skipped due to logon failure' },
          { id: 'dd03l_schema', name: 'Data Dictionary Schema (DD03L)', status: 'SKIPPED', message: 'Skipped due to logon failure' }
        ]
      };
      if (persist && resolvedServer.id) {
      await supabaseService.updateServer(resolvedServer.id, { connection_test: failPayload });
    }
      return failPayload;
    }

    // 2. Check RFC_READ_TABLE Authorization
    try {
      await withTimeout(
        client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'T000',
          DELIMITER: '|',
          ROWCOUNT: 1,
          FIELDS: [{ FIELDNAME: 'MANDT' }],
          DATA: []
        }),
        timeoutMs,
        'RFC_READ_TABLE authorization'
      );
      checks.push({
        id: 'rfc_read_table',
        name: 'RFC_READ_TABLE Authorization',
        status: 'PASS',
        message: 'RFC_READ_TABLE authorization confirmed'
      });
    } catch (readErr) {
      checks.push({
        id: 'rfc_read_table',
        name: 'RFC_READ_TABLE Authorization',
        status: 'FAIL',
        message: `RFC_READ_TABLE failed: ${readErr.message}`
      });
    }

    // 3. Material Number Field Length (Informational)
    let matnrLength = 18;
    try {
      const maraLenRes = await withTimeout(
        client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'DD03L',
          DELIMITER: '|',
          OPTIONS: [{ TEXT: "TABNAME = 'MARA' AND FIELDNAME = 'MATNR'" }],
          FIELDS: [{ FIELDNAME: 'LENG' }],
          DATA: []
        }),
        timeoutMs,
        'MARA-MATNR length lookup'
      );
      if (maraLenRes.DATA && maraLenRes.DATA.length > 0) {
        matnrLength = parseInt(maraLenRes.DATA[0].WA.trim(), 10) || 18;
      }
      checks.push({
        id: 'matnr_length',
        name: 'Material Number Field Length',
        status: 'INFO',
        length: matnrLength,
        message: matnrLength === 40
          ? 'Material number field length: 40 characters (S/4HANA schema, numeric padded to 18)'
          : 'Material number field length: 18 characters (Standard ECC schema)'
      });
    } catch (lenErr) {
      checks.push({
        id: 'matnr_length',
        name: 'Material Number Field Length',
        status: 'INFO',
        length: 18,
        message: `Material number field length query note: ${lenErr.message}`
      });
    }

    // 4. Presence of ZBOM_COPY Transaction
    try {
      const tstcRes = await withTimeout(
        client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'TSTC',
          DELIMITER: '|',
          OPTIONS: [{ TEXT: "TCODE = 'ZBOM_COPY'" }],
          FIELDS: [{ FIELDNAME: 'TCODE' }, { FIELDNAME: 'PGMNA' }],
          DATA: []
        }),
        timeoutMs,
        'ZBOM_COPY presence check'
      );

      if (tstcRes.DATA && tstcRes.DATA.length > 0) {
        const pgm = tstcRes.DATA[0].WA.split('|')[1]?.trim() || 'ZPP_BOM_COPY_CREATION';
        checks.push({
          id: 'zbom_copy',
          name: 'ZBOM_COPY Interface',
          status: 'PASS',
          message: `ZBOM_COPY present in SAP (program ${pgm})`
        });
      } else {
        checks.push({
          id: 'zbom_copy',
          name: 'ZBOM_COPY Interface',
          status: 'WARN',
          message: 'ZBOM_COPY not found: Copy and Delete operations are unavailable on this server without ZBOM_COPY'
        });
      }
    } catch (zbomErr) {
      checks.push({
        id: 'zbom_copy',
        name: 'ZBOM_COPY Interface',
        status: 'WARN',
        message: `ZBOM_COPY query warning: ${zbomErr.message}`
      });
    }

    // 5. Data Dictionary Schema Check (DD03L)
    const missingFields = [];
    try {
      for (const [table, fields] of Object.entries(REQUIRED_SCHEMA_FIELDS)) {
        for (const field of fields) {
          try {
            const fRes = await withTimeout(
              client.call('RFC_READ_TABLE', {
                QUERY_TABLE: 'DD03L',
                DELIMITER: '|',
                OPTIONS: [{ TEXT: `TABNAME = '${table}' AND FIELDNAME = '${field}'` }],
                FIELDS: [{ FIELDNAME: 'FIELDNAME' }],
                DATA: []
              }),
              timeoutMs,
              `DD03L ${table}-${field}`
            );
            if (!fRes.DATA || fRes.DATA.length === 0) {
              missingFields.push(`${table}.${field}`);
            }
          } catch (fErr) {
            missingFields.push(`${table}.${field} (${fErr.message})`);
          }
        }
      }

      if (missingFields.length === 0) {
        checks.push({
          id: 'dd03l_schema',
          name: 'Data Dictionary Schema (DD03L)',
          status: 'PASS',
          message: 'All required table fields verified (MAST, STKO, MARA, STAS, STPO, MAKT, MARC, T001L, T415S)'
        });
      } else {
        checks.push({
          id: 'dd03l_schema',
          name: 'Data Dictionary Schema (DD03L)',
          status: 'WARN',
          missingFields,
          message: `Missing data dictionary fields: ${missingFields.join(', ')}`
        });
      }
    } catch (schemaErr) {
      checks.push({
        id: 'dd03l_schema',
        name: 'Data Dictionary Schema (DD03L)',
        status: 'WARN',
        message: `Schema verification warning: ${schemaErr.message}`
      });
    }

    // Determine Overall Status
    const hasFail = checks.some((c) => c.status === 'FAIL');
    const hasWarn = checks.some((c) => c.status === 'WARN');
    const overallStatus = hasFail ? 'FAIL' : hasWarn ? 'WARN' : 'PASS';

    let summary = 'Connection to SAP server successful: All 5 RFC connection and schema checks passed';
    if (hasFail) {
      const failedNames = checks.filter((c) => c.status === 'FAIL').map((c) => c.name).join(', ');
      summary = `Connection test failed: ${failedNames}`;
    } else if (hasWarn) {
      const warnNames = checks.filter((c) => c.status === 'WARN').map((c) => c.name).join(', ');
      summary = `Connection to SAP server successful with warnings (${warnNames})`;
    }

    const resultPayload = {
      success: overallStatus !== 'FAIL',
      overallStatus,
      tested_at: new Date().toISOString(),
      summary,
      checks
    };

    if (persist && resolvedServer.id) {
      await supabaseService.updateServer(resolvedServer.id, { connection_test: resultPayload });
    }

    return resultPayload;
  } finally {
    if (shouldClose && client) {
      try {
        await client.close();
      } catch (_) {}
    }
  }
}

export default {
  testServerConnection,
  REQUIRED_SCHEMA_FIELDS
};
