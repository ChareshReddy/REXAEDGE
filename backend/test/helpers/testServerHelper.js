process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.USE_MOCK_SAP = 'true';
process.env.SAP_DEV_URL = process.env.SAP_DEV_URL || 'https://sap-dev.corp.internal/sap/opu/odata/sap';
process.env.SAP_QA_URL = process.env.SAP_QA_URL || 'https://sap-qa.corp.internal/sap/opu/odata/sap';
process.env.SAP_PROD_URL = process.env.SAP_PROD_URL || 'https://sap-prod.corp.internal/sap/opu/odata/sap';
process.env.OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'test-model';
process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || 'test-key';
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = 'c4a8990172bf46e9df53e9a4e4d6d678d120a1122bfbe2580b03e05151598f82';
}

import { inMemorySupabase, supabaseCache } from '../../services/supabaseClient.js';
import { encryptPassword } from '../../utils/crypto.js';

export const TEST_SERVER_ID = '10000000-0000-0000-0000-000000000001';
export const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Ensures an owned mock SAP server exists in the in-memory store for the user.
 */
export function ensureMockOwnedServer(userId = TEST_USER_ID, serverId = TEST_SERVER_ID, customHost = '192.168.12.240') {
  if (!inMemorySupabase.allowlist) inMemorySupabase.allowlist = [];
  const mockHosts = ['192.168.12.*', '192.168.12.240', '192.168.12.241', '192.168.12.242', '192.168.1.100', '10.*', '127.0.0.1', 'localhost', customHost];
  for (const pattern of mockHosts) {
    if (pattern && !inMemorySupabase.allowlist.some(e => e.pattern === pattern)) {
      inMemorySupabase.allowlist.push({
        id: `mock-allow-${pattern.replace(/[^a-zA-Z0-9]/g, '-')}`,
        pattern,
        type: 'Sandbox',
        comment: 'Mock test host allowlist'
      });
    }
  }
  if (supabaseCache?.invalidateAllowlist) {
    supabaseCache.invalidateAllowlist();
  }

  const defaultEncryptedPassword = encryptPassword('MockPassword123!');
  let server = inMemorySupabase.servers.find(s => s.id === serverId);
  if (!server) {
    server = {
      id: serverId,
      name: 'Test Owned SAP Server',
      ashost: '192.168.12.240',
      sysnr: '00',
      client: '100',
      lang: 'EN',
      environment: 'DEV',
      router: null,
      gwserv: null,
      sap_username: 'TEST_USER',
      sap_password: 'MockPassword123!',
      sap_password_encrypted: defaultEncryptedPassword,
      owner_id: userId,
      is_disabled: false,
      is_default: true,
      is_active: true,
      created_at: new Date().toISOString()
    };
    inMemorySupabase.servers.push(server);
  } else {
    server.owner_id = userId;
    server.is_disabled = false;
    server.is_active = true;
    server.sap_username = server.sap_username || 'TEST_USER';
    server.sap_password = 'MockPassword123!';
    server.sap_password_encrypted = defaultEncryptedPassword;
  }
  return server;
}

/**
 * Returns request headers containing x-sap-server-id for user-owned server authorization.
 */
export function withServerHeaders(headers = {}, serverId = TEST_SERVER_ID) {
  return {
    'x-sap-server-id': serverId,
    ...headers
  };
}
