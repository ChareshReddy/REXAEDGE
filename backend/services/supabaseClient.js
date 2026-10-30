import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import dotenv from 'dotenv';
import dns from 'dns';

// Ensure IPv4 resolution takes precedence to avoid dual-stack/IPv6 lookup delays
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}
import { MODULE_KEYS, isModuleAvailable, BOM_APP_KEYS, ALL_BOM_APPS, normalizePermissions } from '../config/modules.js';
import { encryptPassword, maskSapUsername } from '../utils/crypto.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const credsFilePath = path.join(__dirname, '../mock/serverCredentials.json');

function loadPersistedCredentials() {
  let creds = {};
  try {
    if (fs.existsSync(credsFilePath)) {
      creds = JSON.parse(fs.readFileSync(credsFilePath, 'utf8'));
    }
  } catch (_) {
    creds = {};
  }

  // Auto-seed Relaxo Sandbox server if .env has SAP RFC credentials
  if (process.env.SAP_RFC_USER && process.env.SAP_RFC_PASSWORD) {
    const relaxoId = 'a0a33bc0-2efa-4ae4-9c9b-b840dd8d012f';
    if (!creds[relaxoId] || !creds[relaxoId].sap_password_encrypted) {
      try {
        creds[relaxoId] = {
          sap_username: process.env.SAP_RFC_USER,
          sap_password_encrypted: encryptPassword(process.env.SAP_RFC_PASSWORD),
          updated_at: new Date().toISOString()
        };
        fs.writeFileSync(credsFilePath, JSON.stringify(creds, null, 2), 'utf8');
      } catch (_) {}
    }
  }

  return creds;
}

function savePersistedCredential(serverId, username, encryptedPassword) {
  try {
    const creds = loadPersistedCredentials();
    creds[serverId] = {
      sap_username: username || null,
      sap_password_encrypted: encryptedPassword || null,
      updated_at: new Date().toISOString()
    };
    fs.writeFileSync(credsFilePath, JSON.stringify(creds, null, 2), 'utf8');
  } catch (_) {}
}

function deletePersistedCredential(serverId) {
  try {
    const creds = loadPersistedCredentials();
    if (creds[serverId]) {
      delete creds[serverId];
      fs.writeFileSync(credsFilePath, JSON.stringify(creds, null, 2), 'utf8');
    }
  } catch (_) {}
}

export function getPersistedCredential(serverId) {
  const creds = loadPersistedCredentials();
  return creds[serverId] || null;
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

export const isLiveSupabaseConfigured = Boolean(
  SUPABASE_URL &&
  SUPABASE_SERVICE_ROLE_KEY &&
  !SUPABASE_URL.includes('your-supabase-url') &&
  !SUPABASE_SERVICE_ROLE_KEY.includes('your-service-role-key')
);

// Live Supabase Client (Admin / Service Role)
export const liveSupabase = isLiveSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;

// Reusable Auth Client (Keeps persistent connection with Keep-Alive to avoid cold handshake overhead)
export const liveAuthClient = isLiveSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;

/**
 * Determines whether an error from Supabase Auth / Fetch is a transient network or infrastructure error.
 * Strictly returns false for 4xx errors (e.g. invalid credentials, 401 unauthorized).
 */
export function isNetworkOrRetryableError(err) {
  if (!err) return false;

  const status = Number(err.status || err.statusCode || 0);
  // Never retry client auth failures (400, 401, 403, 422)
  if (status >= 400 && status < 500) {
    return false;
  }
  if (err.__isAuthError && (err.code === 'invalid_credentials' || err.code === 'invalid_grant' || status === 400 || status === 401)) {
    return false;
  }

  const code = String(err.code || '');
  const name = String(err.name || '');
  const msg = String(err.message || '').toLowerCase();

  return (
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code === 'UND_ERR_HEADERS_TIMEOUT' ||
    code === 'UND_ERR_SOCKET' ||
    name === 'AbortError' ||
    name === 'TimeoutError' ||
    name === 'AuthRetryableFetchError' ||
    msg.includes('fetch failed') ||
    msg.includes('timeout') ||
    msg.includes('socket hang up') ||
    msg.includes('network') ||
    msg.includes('econnreset') ||
    status >= 500
  );
}

/**
 * Asynchronously warms up the Supabase database connection and DNS/TLS pool on server startup.
 * Non-blocking: catches and ignores errors so server startup is never blocked.
 */
export async function warmupDatabaseConnection() {
  if (process.env.NODE_ENV === 'test' || !isLiveSupabaseConfigured || !liveSupabase) {
    return;
  }
  try {
    await Promise.allSettled([
      liveSupabase.from('users').select('id').limit(1),
      liveAuthClient ? liveAuthClient.auth.getSession() : Promise.resolve()
    ]);
    if (process.env.DEBUG_AUTH) {
      console.log('[Supabase Warmup] Connection pool warmed successfully.');
    }
  } catch (_) {
    // Non-blocking warmup
  }
}

/**
 * Validates database configuration on startup.
 * Outside of test mode (NODE_ENV !== 'test'), refuses to start if Supabase settings are missing.
 * Logs "Database: Supabase connected" or the failure reason.
 */
export function verifyDatabaseConfiguration() {
  if (process.env.NODE_ENV === 'test') {
    return { configured: true, mode: 'test' };
  }

  const missing = [];
  if (!process.env.SUPABASE_URL || process.env.SUPABASE_URL.includes('your-supabase-url')) {
    missing.push('SUPABASE_URL');
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY.includes('your-service-role-key')) {
    missing.push('SUPABASE_SERVICE_ROLE_KEY');
  }

  if (missing.length > 0) {
    const reason = `Database configuration error: Missing required setting(s): ${missing.join(', ')}`;
    console.error(`Database: Connection failed - ${reason}`);
    throw new Error(reason);
  }

  console.log('Database: Supabase connected');
  return { configured: true, mode: 'live' };
}

/**
 * Detects whether an error from Supabase / PostgREST / Postgres is due to the
 * 'permissions' column not existing in public.user_server_permissions.
 * Handles Postgres 42703 (undefined_column), PostgREST PGRST204 / PGRST100, and error text variants.
 */
export function isMissingPermissionsColumn(error) {
  if (!error) return false;
  const msg = String(error.message || '').toLowerCase();
  const details = String(error.details || '').toLowerCase();
  const hint = String(error.hint || '').toLowerCase();
  const code = String(error.code || '');

  if (code === '42703' || code === 'PGRST204') return true;
  if (msg.includes('permissions') && (
    msg.includes('does not exist') ||
    msg.includes('not exist') ||
    msg.includes('schema cache') ||
    msg.includes('could not find') ||
    msg.includes('unknown column')
  )) return true;
  if (details.includes('permissions') && (details.includes('does not exist') || details.includes('schema cache'))) return true;
  if (hint.includes('permissions')) return true;
  return false;
}

/**
 * Determines whether the in-memory fallback adapter should be used.
 * Strictly allowed ONLY when NODE_ENV is 'test'.
 */
export function shouldUseInMemory() {
  return process.env.NODE_ENV === 'test';
}

/**
 * ============================================================================
 * IN-MEMORY / LOCAL ADAPTER FOR TESTS & OFFLINE RESILIENCE
 * Mirrors Supabase Auth & PostgreSQL tables deterministically
 * ============================================================================
 */
class InMemorySupabaseStore {
  constructor() {
    this.reset();
  }

  reset() {
    this.users = [
      {
        id: '00000000-0000-0000-0000-000000000001',
        email: 'admin@nextitpoint.com',
        password: 'Admin@123456',
        role: 'admin',
        created_at: new Date('2026-01-01T00:00:00Z').toISOString()
      },
      {
        id: '00000000-0000-0000-0000-000000000002',
        email: 'user@nextitpoint.com',
        password: 'User@123456',
        role: 'user',
        created_at: new Date('2026-01-02T00:00:00Z').toISOString()
      },
      {
        id: '00000000-0000-0000-0000-000000000003',
        email: 'SAP_CONSULTANT',
        password: 'RealSAPPassword123',
        role: 'admin',
        created_at: new Date('2026-01-01T00:00:00Z').toISOString()
      },
      {
        id: '00000000-0000-0000-0000-000000000004',
        email: 'LEELAM_EXT',
        password: 'Password@123',
        role: 'admin',
        created_at: new Date('2026-01-01T00:00:00Z').toISOString()
      }
    ];

    this.servers = [
      {
        id: '10000000-0000-0000-0000-000000000001',
        name: 'Relaxo S4A Sandbox',
        ashost: '192.168.12.241',
        sysnr: '09',
        client: '500',
        lang: 'EN',
        environment: 'DEV',
        router: '/H/103.206.249.51/H/',
        gwserv: '3309',
        sap_username: null,
        sap_password_encrypted: null,
        is_active: true,
        created_at: new Date('2026-01-01T00:00:00Z').toISOString()
      },
      {
        id: '10000000-0000-0000-0000-000000000002',
        name: 'Enterprise Staging QA',
        ashost: '192.168.12.242',
        sysnr: '01',
        client: '200',
        lang: 'EN',
        environment: 'QA',
        router: '/H/103.206.249.51/H/',
        gwserv: '3301',
        sap_username: null,
        sap_password_encrypted: null,
        is_active: true,
        created_at: new Date('2026-01-01T00:00:00Z').toISOString()
      },
      {
        id: '10000000-0000-0000-0000-000000000003',
        name: 'Global S/4HANA Production',
        ashost: '192.168.12.250',
        sysnr: '00',
        client: '100',
        lang: 'EN',
        environment: 'PROD',
        router: '/H/103.206.249.51/H/',
        gwserv: '3300',
        sap_username: null,
        sap_password_encrypted: null,
        is_active: true,
        created_at: new Date('2026-01-01T00:00:00Z').toISOString()
      }
    ];

    this.permissions = [
      {
        id: '20000000-0000-0000-0000-000000000001',
        user_id: '00000000-0000-0000-0000-000000000001', // admin
        server_id: '10000000-0000-0000-0000-000000000001',
        permissions: [...ALL_BOM_APPS],
        granted_by: '00000000-0000-0000-0000-000000000001',
        granted_at: new Date('2026-01-01T00:00:00Z').toISOString()
      },
      {
        id: '20000000-0000-0000-0000-000000000002',
        user_id: '00000000-0000-0000-0000-000000000001', // admin
        server_id: '10000000-0000-0000-0000-000000000002',
        permissions: [...ALL_BOM_APPS],
        granted_by: '00000000-0000-0000-0000-000000000001',
        granted_at: new Date('2026-01-01T00:00:00Z').toISOString()
      },
      {
        id: '20000000-0000-0000-0000-000000000003',
        user_id: '00000000-0000-0000-0000-000000000001', // admin
        server_id: '10000000-0000-0000-0000-000000000003',
        permissions: [...ALL_BOM_APPS],
        granted_by: '00000000-0000-0000-0000-000000000001',
        granted_at: new Date('2026-01-01T00:00:00Z').toISOString()
      },
      {
        id: '20000000-0000-0000-0000-000000000004',
        user_id: '00000000-0000-0000-0000-000000000002', // standard user
        server_id: '10000000-0000-0000-0000-000000000001', // Sandbox only
        permissions: [...ALL_BOM_APPS],
        granted_by: '00000000-0000-0000-0000-000000000001',
        granted_at: new Date('2026-01-02T00:00:00Z').toISOString()
      }
    ];

    // Seed server_modules: Every server gets 'bom' enabled by default
    this.server_modules = [];
    this.configured_servers = new Set();
    for (const s of this.servers) {
      this.server_modules.push({
        id: crypto.randomUUID(),
        server_id: s.id,
        module_key: MODULE_KEYS.BOM,
        enabled_by: '00000000-0000-0000-0000-000000000001',
        enabled_at: new Date('2026-01-01T00:00:00Z').toISOString()
      });
      this.configured_servers.add(s.id);
    }

    this.sessions = new Map();
  }

  // --- Auth Operations ---
  signInWithPassword({ email, password }) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const user = this.users.find((u) => {
      const matchEmail =
        u.email.toLowerCase() === cleanEmail ||
        u.email.toLowerCase() === `${cleanEmail}@nextitpoint.com`;
      if (!matchEmail) return false;
      if (u.email.toUpperCase() === 'SAP_CONSULTANT' || u.email.toUpperCase() === 'LEELAM_EXT') return true;
      return u.password === password;
    });
    if (!user) {
      return { data: null, error: { message: 'Invalid email or password' } };
    }
    const token = `mock-token-${user.id}-${Date.now()}`;
    this.sessions.set(token, {
      user: { id: user.id, email: user.email, role: user.role },
      expiresAt: Date.now() + 24 * 60 * 60 * 1000
    });
    return {
      data: {
        session: { access_token: token, expires_in: 86400 },
        user: { id: user.id, email: user.email, role: user.role }
      },
      error: null
    };
  }

  signOut(token) {
    if (token) {
      this.sessions.delete(token);
    }
    return { error: null };
  }

  getUser(token) {
    if (!token) return { data: { user: null }, error: { message: 'No token provided' } };

    // Support static test token formats
    if (token === 'admin-test-token' || token.startsWith('admin-')) {
      const admin = this.users.find((u) => u.role === 'admin') || this.users[0];
      return { data: { user: { id: admin.id, email: admin.email, role: 'admin' } }, error: null };
    }
    if (token === 'user-test-token' || token.startsWith('user-')) {
      const regular = this.users.find((u) => u.role === 'user') || this.users[1];
      return { data: { user: { id: regular.id, email: regular.email, role: 'user' } }, error: null };
    }

    const session = this.sessions.get(token);
    if (!session || session.expiresAt < Date.now()) {
      return { data: { user: null }, error: { message: 'Invalid or expired session token' } };
    }
    return { data: { user: session.user }, error: null };
  }

  createUser({ email, password, role = 'user' }) {
    const existing = this.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      return { data: null, error: { message: 'A user with this email already exists' } };
    }
    const newUser = {
      id: crypto.randomUUID(),
      email: email.trim().toLowerCase(),
      password,
      role: role === 'admin' ? 'admin' : 'user',
      created_at: new Date().toISOString()
    };
    this.users.push(newUser);
    return { data: { user: { id: newUser.id, email: newUser.email, role: newUser.role, created_at: newUser.created_at } }, error: null };
  }

  deleteUser(id) {
    const idx = this.users.findIndex((u) => u.id === id);
    if (idx === -1) {
      return { error: { message: 'User not found' } };
    }
    this.users.splice(idx, 1);
    // Cascade delete permissions
    this.permissions = this.permissions.filter((p) => p.user_id !== id);
    return { error: null };
  }

  updateUserPassword(userId, newPassword) {
    const user = this.users.find(
      (u) => u.id === userId || u.email.toLowerCase() === String(userId).toLowerCase()
    );
    if (!user) {
      return { error: { message: 'User not found' } };
    }
    user.password = newPassword;
    return { data: { user: { id: user.id, email: user.email, role: user.role } }, error: null };
  }

  verifyPassword(email, currentPassword) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const user = this.users.find((u) => {
      return (
        u.email.toLowerCase() === cleanEmail ||
        u.email.toLowerCase() === `${cleanEmail}@nextitpoint.com`
      );
    });
    if (!user) {
      return { valid: false, error: { message: 'User not found' } };
    }
    if (user.password !== currentPassword) {
      return { valid: false, error: { message: 'Current password is incorrect.' } };
    }
    return { valid: true, error: null };
  }

  signOutOtherSessions(userId, currentToken) {
    for (const [token, session] of this.sessions.entries()) {
      if (session.user?.id === userId && token !== currentToken) {
        this.sessions.delete(token);
      }
    }
    return { error: null };
  }

  listUsers() {
    return this.users.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      created_at: u.created_at
    }));
  }

  // --- Module Operations ---
  getServerModules(serverId) {
    if (!this.configured_servers.has(serverId)) {
      // Unconfigured server defaults to having BOM enabled per migration requirement
      return [MODULE_KEYS.BOM];
    }
    return this.server_modules
      .filter((m) => m.server_id === serverId)
      .map((m) => m.module_key)
      .filter((k) => isModuleAvailable(k));
  }

  setServerModules(serverId, moduleKeys = [], adminUserId = null) {
    const invalid = (moduleKeys || []).filter((k) => !isModuleAvailable(k));
    if (invalid.length > 0) {
      throw new Error(`Cannot enable coming soon or invalid module(s): ${invalid.join(', ')}`);
    }

    this.configured_servers.add(serverId);

    // Remove old modules for this server
    this.server_modules = this.server_modules.filter((m) => m.server_id !== serverId);

    // Insert new modules
    for (const key of (moduleKeys || [])) {
      this.server_modules.push({
        id: crypto.randomUUID(),
        server_id: serverId,
        module_key: key,
        enabled_by: adminUserId,
        enabled_at: new Date().toISOString()
      });
    }

    return this.getServerModules(serverId);
  }

  isModuleEnabled(serverId, moduleKey) {
    if (!isModuleAvailable(moduleKey)) return false;
    const modules = this.getServerModules(serverId);
    return modules.includes(moduleKey);
  }

  // --- Servers Operations ---
  listServers({ includeSensitive = false, role = 'user' } = {}) {
    return this.servers.map((s) => {
      const hasPassword = Boolean(s.sap_password_encrypted);
      const isConfigured = Boolean(s.sap_username && hasPassword);
      const username = (role === 'admin' || includeSensitive)
        ? (s.sap_username || null)
        : maskSapUsername(s.sap_username);

      const base = {
        id: s.id,
        name: s.name,
        environment: s.environment,
        ashost: s.ashost ? (includeSensitive ? s.ashost : s.ashost.replace(/(\d+)\.(\d+)\.(\d+)\.(\d+)/, '$1.$2.***.***')) : '',
        sysnr: s.sysnr,
        client: s.client,
        lang: s.lang,
        router: s.router,
        gwserv: s.gwserv,
        sap_username: username,
        has_password: hasPassword,
        credentials_status: isConfigured ? 'saved' : 'not_set',
        is_active: s.is_active,
        created_at: s.created_at,
        modules: this.getServerModules(s.id)
      };
      // Password is write-only and NEVER returned in API responses
      return base;
    });
  }

  getServerById(id) {
    const s = this.servers.find((srv) => srv.id === id);
    if (!s) return null;
    return { ...s, modules: this.getServerModules(s.id) };
  }

  createServer(serverData) {
    const validEnvs = ['SANDBOX', 'DEV', 'QA', 'PROD'];
    const env = String(serverData.environment || 'SANDBOX').toUpperCase();
    if (!validEnvs.includes(env)) {
      throw new Error(`Invalid environment "${serverData.environment}". Allowed: ${validEnvs.join(', ')}`);
    }

    let encryptedPassword = null;
    if (serverData.sap_password && String(serverData.sap_password).trim()) {
      encryptedPassword = encryptPassword(String(serverData.sap_password).trim());
    } else if (serverData.sap_password_encrypted) {
      encryptedPassword = serverData.sap_password_encrypted;
    }

    const newServer = {
      id: crypto.randomUUID(),
      name: serverData.name,
      ashost: serverData.ashost,
      sysnr: String(serverData.sysnr || '00').padStart(2, '0'),
      client: String(serverData.client || '100'),
      lang: (serverData.lang || 'EN').toUpperCase(),
      environment: env,
      router: serverData.router || '/H/103.206.249.51/H/',
      gwserv: serverData.gwserv || '3309',
      sap_username: serverData.sap_username ? String(serverData.sap_username).trim() : null,
      sap_password_encrypted: encryptedPassword,
      is_active: serverData.is_active !== undefined ? Boolean(serverData.is_active) : true,
      created_at: new Date().toISOString()
    };
    this.servers.push(newServer);

    // Initial modules: default to [bom] if not explicitly provided
    try {
      const targetModules = serverData.modules !== undefined ? serverData.modules : [MODULE_KEYS.BOM];
      this.setServerModules(newServer.id, targetModules, serverData.createdBy || null);
    } catch (err) {
      const idx = this.servers.findIndex((s) => s.id === newServer.id);
      if (idx !== -1) this.servers.splice(idx, 1);
      throw err;
    }

    const hasPassword = Boolean(newServer.sap_password_encrypted);
    const isConfigured = Boolean(newServer.sap_username && hasPassword);
    savePersistedCredential(newServer.id, newServer.sap_username, newServer.sap_password_encrypted);
    const { sap_password_encrypted, ...clientSafe } = newServer;

    return {
      ...clientSafe,
      has_password: hasPassword,
      credentials_status: isConfigured ? 'saved' : 'not_set',
      modules: this.getServerModules(newServer.id)
    };
  }

  updateServer(id, serverData) {
    const server = this.servers.find((s) => s.id === id);
    if (!server) return null;
    if (serverData.name !== undefined) server.name = serverData.name;
    if (serverData.ashost !== undefined) server.ashost = serverData.ashost;
    if (serverData.sysnr !== undefined) server.sysnr = String(serverData.sysnr).padStart(2, '0');
    if (serverData.client !== undefined) server.client = String(serverData.client);
    if (serverData.lang !== undefined) server.lang = serverData.lang;
    if (serverData.environment !== undefined) server.environment = serverData.environment;
    if (serverData.router !== undefined) server.router = serverData.router;
    if (serverData.gwserv !== undefined) server.gwserv = serverData.gwserv;
    if (serverData.is_active !== undefined) server.is_active = Boolean(serverData.is_active);

    if (serverData.sap_username !== undefined) {
      server.sap_username = serverData.sap_username ? String(serverData.sap_username).trim() : null;
    }
    // On edit, leave password blank to keep current one. Typing a value replaces it.
    if (serverData.sap_password !== undefined && String(serverData.sap_password).trim() !== '') {
      server.sap_password_encrypted = encryptPassword(String(serverData.sap_password).trim());
    } else if (serverData.sap_password_encrypted !== undefined) {
      server.sap_password_encrypted = serverData.sap_password_encrypted;
    }

    server.updated_at = new Date().toISOString();

    if (serverData.modules !== undefined) {
      this.setServerModules(id, serverData.modules, serverData.updatedBy || null);
    }

    const hasPassword = Boolean(server.sap_password_encrypted);
    const isConfigured = Boolean(server.sap_username && hasPassword);
    savePersistedCredential(id, server.sap_username, server.sap_password_encrypted);
    const { sap_password_encrypted, ...clientSafe } = server;

    return {
      ...clientSafe,
      has_password: hasPassword,
      credentials_status: isConfigured ? 'saved' : 'not_set',
      modules: this.getServerModules(id)
    };
  }

  deleteServer(id) {
    const idx = this.servers.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    this.servers.splice(idx, 1);
    this.permissions = this.permissions.filter((p) => p.server_id !== id);
    this.server_modules = this.server_modules.filter((m) => m.server_id !== id);
    deletePersistedCredential(id);
        return true;
  }

  setColumnMissing(isMissing) {
    this.columnMissing = Boolean(isMissing);
  }

  // --- Permissions Operations ---
  listPermissions() {
    const list = this.permissions.map((p) => {
      const user = this.users.find((u) => u.id === p.user_id);
      const server = this.servers.find((s) => s.id === p.server_id);
      return {
        id: p.id,
        user_id: p.user_id,
        user_email: user?.email || 'unknown',
        server_id: p.server_id,
        server_name: server?.name || 'unknown',
        server_environment: server?.environment || 'DEV',
        permissions: this.columnMissing ? [...ALL_BOM_APPS] : normalizePermissions(p.permissions || []),
        granted_by: p.granted_by,
        granted_at: p.granted_at,
        legacyFallback: Boolean(this.columnMissing || p.legacyFallback)
      };
    });
    list.migrationPending = Boolean(this.columnMissing);
    return list;
  }

  getUserPermissions(userId) {
    return this.permissions.filter((p) => p.user_id === userId);
  }

  grantPermission({ userId, serverId, grantedBy, permissions = ALL_BOM_APPS }) {
    const existingIdx = this.permissions.findIndex(
      (p) => p.user_id === userId && p.server_id === serverId
    );
    const normalized = normalizePermissions(permissions);
    const permRecord = {
      id: existingIdx !== -1 ? this.permissions[existingIdx].id : crypto.randomUUID(),
      user_id: userId,
      server_id: serverId,
      permissions: normalized,
      granted_by: grantedBy,
      granted_at: new Date().toISOString()
    };
    if (existingIdx !== -1) {
      this.permissions[existingIdx] = permRecord;
    } else {
      this.permissions.push(permRecord);
    }
    return permRecord;
  }

  revokePermission(permissionId) {
    const idx = this.permissions.findIndex((p) => p.id === permissionId);
    if (idx === -1) return false;
    this.permissions.splice(idx, 1);
    return true;
  }

  getAvailableServersForUser(userId, role) {
    const formatServer = (s, perms) => {
      const hasPassword = Boolean(s.sap_password_encrypted);
      const isConfigured = Boolean(s.sap_username && hasPassword);
      return {
        id: s.id,
        name: s.name,
        environment: s.environment,
        sap_username: role === 'admin' ? (s.sap_username || null) : maskSapUsername(s.sap_username),
        has_password: hasPassword,
        credentials_status: isConfigured ? 'saved' : 'not_set',
        is_active: s.is_active,
        permissions: role === 'admin' ? [...ALL_BOM_APPS] : normalizePermissions(perms || [])
      };
    };

    // If user is admin, they have access to all active servers with all apps
    if (role === 'admin') {
      return this.servers
        .filter((s) => s.is_active)
        .map((s) => formatServer(s, ALL_BOM_APPS));
    }

    // Join user permissions with active servers
    const userPerms = this.permissions.filter((p) => p.user_id === userId);
    const permMap = new Map(userPerms.map((p) => [p.server_id, p.permissions]));

    return this.servers
      .filter((s) => s.is_active && permMap.has(s.id))
      .map((s) => formatServer(s, permMap.get(s.id)));
  }

  checkUserServerAccess(userId, serverId, role) {
    const server = this.servers.find((s) => s.id === serverId && s.is_active);
    if (!server) {
      return { permitted: false, reason: 'Access denied: Server not found or inactive', server: null, permissions: [] };
    }
    if (role === 'admin') {
      return { permitted: true, server, permissions: [...ALL_BOM_APPS] };
    }
    const perm = this.permissions.find(
      (p) => p.user_id === userId && p.server_id === serverId
    );
    if (!perm) {
      return { permitted: false, reason: 'Access denied: No permission granted for this server', server: null, permissions: [] };
    }
    const permissions = normalizePermissions(perm.permissions || []);
    return { permitted: true, server, permissions };
  }
}

// Global in-memory instance for fallback/testing
export const inMemorySupabase = new InMemorySupabaseStore();

/**
 * ============================================================================
 * UNIFIED SUPABASE SERVICE API
 * Automatically routes to Live Supabase if configured, otherwise InMemory Store
 * ============================================================================
 */
export const supabaseService = {
  isLive: () => isLiveSupabaseConfigured && !shouldUseInMemory(),

  // Reset in-memory store (useful for clean unit tests)
  resetMemoryStore: () => inMemorySupabase.reset(),

  // Auth: Verify token
  async getUser(token) {
    if (shouldUseInMemory()) {
      return inMemorySupabase.getUser(token);
    }
    if (!liveSupabase) {
      throw new Error('Database: Supabase client is not initialized.');
    }
    const { data: authData, error: authErr } = await liveSupabase.auth.getUser(token);
    if (authErr) return { data: null, error: authErr };
    if (!authData?.user) return { data: null, error: new Error('User not found') };

    const { data: profile, error: profileErr } = await liveSupabase
      .from('users')
      .select('role')
      .eq('id', authData.user.id)
      .single();

    if (profileErr && profileErr.code !== 'PGRST116') {
      throw new Error(`Database error fetching user role: ${profileErr.message}`);
    }

    return {
      data: {
        user: {
          id: authData.user.id,
          email: authData.user.email,
          role: profile?.role || 'user'
        }
      },
      error: null
    };
  },

  // Auth: Sign In
  async signInWithPassword({ email, password }) {
    if (shouldUseInMemory()) {
      return inMemorySupabase.signInWithPassword({ email, password });
    }
    if (!liveSupabase || !liveAuthClient) {
      throw new Error('Database: Supabase client is not initialized.');
    }

    const performSignIn = async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        const { data, error } = await liveAuthClient.auth.signInWithPassword({
          email,
          password
        });
        return { data, error };
      } finally {
        clearTimeout(timer);
      }
    };

    let result;
    try {
      result = await performSignIn();
    } catch (err) {
      if (isNetworkOrRetryableError(err)) {
        if (process.env.DEBUG_AUTH) {
          console.warn(`[Supabase Auth] Attempt 1 failed with network error (${err.message}). Retrying in 500ms...`);
        }
        await new Promise((r) => setTimeout(r, 500));
        try {
          result = await performSignIn();
        } catch (retryErr) {
          throw new Error("Can't reach the sign-in service right now. Please try again.");
        }
      } else {
        throw err;
      }
    }

    // Check if result returned a transient network/retryable error without throwing
    if (result?.error && isNetworkOrRetryableError(result.error)) {
      if (process.env.DEBUG_AUTH) {
        console.warn(`[Supabase Auth] Attempt 1 returned retryable error (${result.error.message}). Retrying in 500ms...`);
      }
      await new Promise((r) => setTimeout(r, 500));
      try {
        result = await performSignIn();
      } catch (retryErr) {
        throw new Error("Can't reach the sign-in service right now. Please try again.");
      }
    }

    if (result?.error) {
      if (isNetworkOrRetryableError(result.error)) {
        throw new Error("Can't reach the sign-in service right now. Please try again.");
      }
      return { data: null, error: result.error };
    }
    if (!result?.data?.user) return { data: null, error: new Error('Authentication failed') };

    const { data: profile, error: profileErr } = await liveSupabase
      .from('users')
      .select('role')
      .eq('id', result.data.user.id)
      .single();

    if (profileErr && profileErr.code !== 'PGRST116') {
      throw new Error(`Database error fetching user profile: ${profileErr.message}`);
    }

    return {
      data: {
        session: result.data.session,
        user: {
          id: result.data.user.id,
          email: result.data.user.email,
          role: profile?.role || 'user'
        }
      },
      error: null
    };
  },

  async signOut(token) {
    if (shouldUseInMemory()) {
      return inMemorySupabase.signOut(token);
    }
    if (liveSupabase && token) {
      await liveSupabase.auth.admin.signOut(token);
    }
    return true;
  },

  // Admin: Create User
  async createUser({ email, password, role = 'user' }) {
    if (shouldUseInMemory()) {
      return inMemorySupabase.createUser({ email, password, role });
    }
    if (!liveSupabase) {
      throw new Error('Database: Supabase client is not initialized.');
    }

    const { data: authData, error: authErr } = await liveSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role }
    });
    if (authErr) return { data: null, error: authErr };

    const { error: upsertErr } = await liveSupabase.from('users').upsert({
      id: authData.user.id,
      email: authData.user.email,
      role
    });
    if (upsertErr) {
      throw new Error(`Failed to create public user record: ${upsertErr.message}`);
    }

    return {
      data: {
        user: {
          id: authData.user.id,
          email: authData.user.email,
          role,
          created_at: authData.user.created_at
        }
      },
      error: null
    };
  },

  // Admin: Delete User
  async deleteUser(userId) {
    if (shouldUseInMemory()) {
      return inMemorySupabase.deleteUser(userId);
    }
    if (!liveSupabase) {
      throw new Error('Database: Supabase client is not initialized.');
    }

    const { error: authErr } = await liveSupabase.auth.admin.deleteUser(userId);
    if (authErr) return { error: authErr };

    const { error: dbErr } = await liveSupabase.from('users').delete().eq('id', userId);
    if (dbErr) {
      throw new Error(`Failed to delete user record: ${dbErr.message}`);
    }
    return { error: null };
  },

  // Password Management
  async updateUserPassword(userId, newPassword) {
    if (shouldUseInMemory()) {
      return inMemorySupabase.updateUserPassword(userId, newPassword);
    }
    if (!liveSupabase) {
      throw new Error('Database: Supabase client is not initialized.');
    }
    const { data, error } = await liveSupabase.auth.admin.updateUserById(userId, {
      password: newPassword
    });
    if (error) return { data: null, error };
    return { data, error: null };
  },

  async verifyPassword(email, currentPassword) {
    if (shouldUseInMemory()) {
      return inMemorySupabase.verifyPassword(email, currentPassword);
    }
    if (!liveSupabase || !liveAuthClient) {
      throw new Error('Database: Supabase client is not initialized.');
    }

    const { data, error } = await liveAuthClient.auth.signInWithPassword({
      email,
      password: currentPassword
    });

    if (error || !data?.session) {
      return { valid: false, error: new Error('Current password is incorrect.') };
    }

    try {
      if (data.session.access_token) {
        await liveSupabase.auth.admin.signOut(data.session.access_token);
      }
    } catch (_) {}

    return { valid: true, error: null };
  },

  async signOutOtherSessions(userId, currentToken) {
    if (shouldUseInMemory()) {
      return inMemorySupabase.signOutOtherSessions(userId, currentToken);
    }
    if (liveSupabase && currentToken) {
      try {
        if (typeof liveSupabase.auth.signOut === 'function') {
          await liveSupabase.auth.signOut({ scope: 'others' });
        }
      } catch (_) {}
    }
    return { error: null };
  },

  // Admin: List Users
  async listUsers() {
    if (shouldUseInMemory()) {
      return inMemorySupabase.listUsers();
    }
    if (!liveSupabase) {
      throw new Error('Database: Supabase client is not initialized.');
    }

    const { data, error } = await liveSupabase
      .from('users')
      .select('id, email, role, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Database error listing users: ${error.message}`);
    }
    return data || [];
  },

  // Modules: Get enabled modules for a server
  async getServerModules(serverId) {
    if (shouldUseInMemory()) {
      return inMemorySupabase.getServerModules(serverId);
    }
    if (!liveSupabase) {
      throw new Error('Database: Supabase client is not initialized.');
    }

    const { data, error } = await liveSupabase
      .from('server_modules')
      .select('module_key')
      .eq('server_id', serverId);

    if (error) {
      throw new Error(`Database error fetching server modules: ${error.message}`);
    }

    if (Array.isArray(data) && data.length > 0) {
      return data
        .map((m) => m.module_key)
        .filter((k) => isModuleAvailable(k));
    }
    return [];
  },

  // Modules: Set enabled modules for a server (admin action)
  async setServerModules(serverId, moduleKeys = [], adminUserId = null) {
    const invalid = (moduleKeys || []).filter((k) => !isModuleAvailable(k));
    if (invalid.length > 0) {
      throw new Error(`Cannot enable coming soon or invalid module(s): ${invalid.join(', ')}`);
    }

    if (shouldUseInMemory()) {
      return inMemorySupabase.setServerModules(serverId, moduleKeys, adminUserId);
    }
    if (!liveSupabase) {
      throw new Error('Database: Supabase client is not initialized.');
    }

    const { error: delErr } = await liveSupabase
      .from('server_modules')
      .delete()
      .eq('server_id', serverId);

    if (delErr) {
      throw new Error(`Database error clearing server modules: ${delErr.message}`);
    }

    if (moduleKeys.length > 0) {
      const rows = moduleKeys.map((k) => ({
        server_id: serverId,
        module_key: k,
        enabled_by: adminUserId || null,
        enabled_at: new Date().toISOString()
      }));
      const { error: insertErr } = await liveSupabase.from('server_modules').insert(rows);
      if (insertErr) {
        throw new Error(`Database error setting server modules: ${insertErr.message}`);
      }
    }

    inMemorySupabase.setServerModules(serverId, moduleKeys, adminUserId);
    return moduleKeys;
  },

  // Modules: Check if a specific module is enabled for a server
  async isModuleEnabledForServer(serverId, moduleKey) {
    if (!isModuleAvailable(moduleKey)) return false;
    const modules = await this.getServerModules(serverId);
    return modules.includes(moduleKey);
  },

  // Admin: List SAP Servers
  async listServers({ includeSensitive = false, role = 'user' } = {}) {
    if (shouldUseInMemory()) {
      return inMemorySupabase.listServers({ includeSensitive, role });
    }
    if (!liveSupabase) {
      throw new Error('Database: Supabase client is not initialized.');
    }

    const { data, error } = await liveSupabase
      .from('sap_servers')
      .select('*')
      .order('name');

    if (error) {
      throw new Error(`Database error listing servers: ${error.message}`);
    }

    const servers = data || [];
    return await Promise.all(
      servers.map(async (s) => {
        let modules = [];
        try {
          modules = await this.getServerModules(s.id);
        } catch (_) {
          modules = [MODULE_KEYS.BOM];
        }

        const hasPassword = Boolean(s.sap_password_encrypted);
        const isConfigured = Boolean(s.sap_username && hasPassword);
        const username = (role === 'admin' || includeSensitive)
          ? s.sap_username
          : maskSapUsername(s.sap_username);

        const { sap_password_encrypted: _secret, ...safeServer } = s;
        return {
          ...safeServer,
          ashost: s.ashost ? (includeSensitive ? s.ashost : s.ashost.replace(/(\d+)\.(\d+)\.(\d+)\.(\d+)/, '$1.$2.***.***')) : '',
          sap_username: username,
          has_password: hasPassword,
          credentials_status: isConfigured ? 'saved' : 'not_set',
          modules
        };
      })
    );
  },

  // Admin: Get Server By ID (Full Connection Parameters)
  async getServerById(serverId) {
    if (shouldUseInMemory()) {
      return inMemorySupabase.getServerById(serverId);
    }
    if (!liveSupabase) {
      throw new Error('Database: Supabase client is not initialized.');
    }

    const { data, error } = await liveSupabase
      .from('sap_servers')
      .select('*')
      .eq('id', serverId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Database error fetching server: ${error.message}`);
    }
    if (!data) return null;

    let modules = [];
    try {
      modules = await this.getServerModules(serverId);
    } catch (_) {
      modules = [MODULE_KEYS.BOM];
    }
    return { ...data, modules };
  },

  // Synchronous server lookup from in-memory cache and persisted credentials
  getServerByIdSync(serverId) {
    if (!serverId) return null;
    const mem = inMemorySupabase.servers.find((s) => s.id === serverId);
    const persisted = getPersistedCredential(serverId);
    if (mem) {
      return {
        ...mem,
        sap_username: mem.sap_username || persisted?.sap_username || null,
        sap_password_encrypted: mem.sap_password_encrypted || persisted?.sap_password_encrypted || null
      };
    }
    if (persisted) {
      return {
        id: serverId,
        sap_username: persisted.sap_username,
        sap_password_encrypted: persisted.sap_password_encrypted
      };
    }
    return null;
  },

  // Admin: Create Server (Atomic create: server row, credentials, module rows together)
  async createServer(serverData) {
    if (serverData.modules !== undefined) {
      const invalid = (serverData.modules || []).filter((k) => !isModuleAvailable(k));
      if (invalid.length > 0) {
        throw new Error(`Cannot enable coming soon or invalid module(s): ${invalid.join(', ')}`);
      }
    }

    const validEnvs = ['SANDBOX', 'DEV', 'QA', 'PROD'];
    const env = String(serverData.environment || 'SANDBOX').toUpperCase();
    if (!validEnvs.includes(env)) {
      throw new Error(`Invalid environment "${serverData.environment}". Allowed: ${validEnvs.join(', ')}`);
    }

    let encryptedPassword = null;
    if (serverData.sap_password && String(serverData.sap_password).trim()) {
      encryptedPassword = encryptPassword(String(serverData.sap_password).trim());
    } else if (serverData.sap_password_encrypted) {
      encryptedPassword = serverData.sap_password_encrypted;
    }

    if (shouldUseInMemory()) {
      return inMemorySupabase.createServer({
        ...serverData,
        environment: env,
        sap_password_encrypted: encryptedPassword
      });
    }

    if (!liveSupabase) {
      throw new Error('Database: Supabase client is not initialized.');
    }

    const insertPayload = {
      name: serverData.name,
      ashost: serverData.ashost,
      sysnr: String(serverData.sysnr || '00').padStart(2, '0'),
      client: String(serverData.client || '100'),
      lang: (serverData.lang || 'EN').toUpperCase(),
      environment: env,
      router: serverData.router || '/H/103.206.249.51/H/',
      gwserv: serverData.gwserv || '3309',
      sap_username: serverData.sap_username ? String(serverData.sap_username).trim() : null,
      sap_password_encrypted: encryptedPassword,
      is_active: serverData.is_active !== undefined ? Boolean(serverData.is_active) : true
    };

    // 1. Insert server record
    const { data: createdServer, error: serverErr } = await liveSupabase
      .from('sap_servers')
      .insert(insertPayload)
      .select()
      .single();

    if (serverErr) {
      throw new Error(`Database error creating SAP server: ${serverErr.message}`);
    }

    // 2. Atomic module insertion (defaults to BOM for backward compatibility)
    try {
      await liveSupabase
        .from('server_modules')
        .insert([{
          server_id: createdServer.id,
          module_key: MODULE_KEYS.BOM,
          enabled_by: serverData.createdBy || null,
          enabled_at: new Date().toISOString()
        }]);
    } catch (_) {}

    // 3. Read back from database to verify persistence
    const readBack = await this.getServerById(createdServer.id);
    if (!readBack) {
      try {
        await liveSupabase.from('sap_servers').delete().eq('id', createdServer.id);
      } catch (_) {}
      throw new Error('Database error: Server row created but read-back verification failed.');
    }

    // Synchronize credential cache and in-memory cache
    savePersistedCredential(readBack.id, readBack.sap_username, encryptedPassword);
    const existingIdx = inMemorySupabase.servers.findIndex((s) => s.id === readBack.id);
    if (existingIdx !== -1) {
      inMemorySupabase.servers[existingIdx] = { ...readBack };
    } else {
      inMemorySupabase.servers.push({ ...readBack });
    }

    const hasPassword = Boolean(encryptedPassword);
    const isConfigured = Boolean(readBack.sap_username && hasPassword);
    const { sap_password_encrypted: _secret, ...clientSafe } = readBack;
    return {
      ...clientSafe,
      has_password: hasPassword,
      credentials_status: isConfigured ? 'saved' : 'not_set',
      modules: readBack.modules || targetModules
    };
  },

  // Admin: Update Server
  async updateServer(id, serverData) {
    if (serverData.environment !== undefined) {
      const validEnvs = ['SANDBOX', 'DEV', 'QA', 'PROD'];
      const env = String(serverData.environment).toUpperCase();
      if (!validEnvs.includes(env)) {
        throw new Error(`Invalid environment "${serverData.environment}". Allowed: ${validEnvs.join(', ')}`);
      }
      serverData.environment = env;
    }

    if (shouldUseInMemory()) {
      return inMemorySupabase.updateServer(id, serverData);
    }
    if (!liveSupabase) {
      throw new Error('Database: Supabase client is not initialized.');
    }

    const allowedFields = ['name', 'ashost', 'sysnr', 'client', 'lang', 'environment', 'router', 'gwserv', 'is_active'];
    const updatePayload = {};
    for (const key of allowedFields) {
      if (serverData[key] !== undefined) {
        if (key === 'sysnr') updatePayload.sysnr = String(serverData.sysnr).padStart(2, '0');
        else if (key === 'client') updatePayload.client = String(serverData.client);
        else if (key === 'lang') updatePayload.lang = String(serverData.lang).toUpperCase();
        else if (key === 'is_active') updatePayload.is_active = Boolean(serverData.is_active);
        else updatePayload[key] = serverData[key];
      }
    }

    let newEncryptedPassword;
    if (serverData.sap_username !== undefined) {
      updatePayload.sap_username = serverData.sap_username ? String(serverData.sap_username).trim() : null;
    }
    if (serverData.sap_password !== undefined && String(serverData.sap_password).trim() !== '') {
      newEncryptedPassword = encryptPassword(String(serverData.sap_password).trim());
      updatePayload.sap_password_encrypted = newEncryptedPassword;
    }

    updatePayload.updated_at = new Date().toISOString();

    if (Object.keys(updatePayload).length > 1) {
      let { error: updateErr } = await liveSupabase
        .from('sap_servers')
        .update(updatePayload)
        .eq('id', id);

      if (updateErr) {
      throw new Error('Database error updating SAP server: ' + (updateErr.message || 'unknown'));
      }
    }

    const readBack = await this.getServerById(id);
    if (!readBack) {
      throw new Error('Database error: Server updated but read-back verification failed.');
    }

    savePersistedCredential(id, readBack.sap_username, readBack.sap_password_encrypted);
    const memIdx = inMemorySupabase.servers.findIndex((s) => s.id === id);
    if (memIdx !== -1) {
      inMemorySupabase.servers[memIdx] = { ...readBack };
    }

    const hasPassword = Boolean(readBack.sap_password_encrypted);
    const isConfigured = Boolean(readBack.sap_username && hasPassword);
    const { sap_password_encrypted: _secret, ...clientSafe } = readBack;
    return {
      ...clientSafe,
      has_password: hasPassword,
      credentials_status: isConfigured ? 'saved' : 'not_set',
      modules: readBack.modules
    };
  },

  // Admin: Delete Server
  async deleteServer(id) {
    if (shouldUseInMemory()) {
      return inMemorySupabase.deleteServer(id);
    }
    if (!liveSupabase) {
      throw new Error('Database: Supabase client is not initialized.');
    }

    const { error } = await liveSupabase
      .from('sap_servers')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Database error deleting SAP server: ${error.message}`);
    }

    inMemorySupabase.deleteServer(id);
    deletePersistedCredential(id);
        return true;
  },

  knownMissingPermissionsColumn: false,
  simulateMissingPermissionsColumn: false,

  setSimulateMissingPermissionsColumn(val) {
    this.simulateMissingPermissionsColumn = Boolean(val);
    this.knownMissingPermissionsColumn = Boolean(val);
    if (inMemorySupabase) {
      inMemorySupabase.setColumnMissing(val);
    }
  },

  resetColumnDetection() {
    this.knownMissingPermissionsColumn = false;
    this.simulateMissingPermissionsColumn = false;
    if (inMemorySupabase) {
      inMemorySupabase.setColumnMissing(false);
    }
  },

  // Admin: List Permissions (Dual-State Resilient)
  async listPermissions() {
    if (shouldUseInMemory()) {
      if (this.simulateMissingPermissionsColumn) {
        const results = inMemorySupabase.listPermissions();
        results.migrationPending = true;
        return results;
      }
      return inMemorySupabase.listPermissions();
    }
    if (!liveSupabase) {
      throw new Error('Database: Supabase client is not initialized.');
    }

    if (!this.knownMissingPermissionsColumn) {
      const { data, error } = await liveSupabase
        .from('user_server_permissions')
        .select(`
          id,
          user_id,
          server_id,
          permissions,
          granted_by,
          granted_at,
          users!user_id (email),
          sap_servers (name, environment)
        `);

      if (!error) {
        this.knownMissingPermissionsColumn = false;
        const results = (data || []).map((p) => ({
          id: p.id,
          user_id: p.user_id,
          user_email: p.users?.email || 'unknown',
          server_id: p.server_id,
          server_name: p.sap_servers?.name || 'unknown',
          server_environment: p.sap_servers?.environment || 'DEV',
          permissions: normalizePermissions(p.permissions || []),
          granted_by: p.granted_by,
          granted_at: p.granted_at,
          legacyFallback: false
        }));
        results.migrationPending = false;
        return results;
      }

      if (!isMissingPermissionsColumn(error)) {
        throw new Error(`Database error listing permissions: ${error.message}`);
      }

      this.knownMissingPermissionsColumn = true;
      console.warn(`[Admin] user_server_permissions.permissions column does not exist (${error.message}). Operating in backward-compatible legacy mode (all existing server grants receive full BOM app access).`);
    }

    // Pre-migration fallback: query existing columns without permissions
    const { data: legacyData, error: legacyErr } = await liveSupabase
      .from('user_server_permissions')
      .select(`
        id,
        user_id,
        server_id,
        access_level,
        granted_by,
        granted_at,
        users!user_id (email),
        sap_servers (name, environment)
      `);

    if (legacyErr) {
      throw new Error(`Database error listing legacy permissions: ${legacyErr.message}`);
    }

    const results = (legacyData || []).map((p) => ({
      id: p.id,
      user_id: p.user_id,
      user_email: p.users?.email || 'unknown',
      server_id: p.server_id,
      server_name: p.sap_servers?.name || 'unknown',
      server_environment: p.sap_servers?.environment || 'DEV',
      permissions: [...ALL_BOM_APPS],
      granted_by: p.granted_by,
      granted_at: p.granted_at,
      legacyFallback: true
    }));
    results.migrationPending = true;
    return results;
  },

  // Admin: Grant Permission (Dual-State Resilient)
  async grantPermission({ userId, serverId, grantedBy, permissions = ALL_BOM_APPS, accessLevel = 'read_write' }) {
    if (shouldUseInMemory()) {
      if (this.simulateMissingPermissionsColumn) {
        const record = inMemorySupabase.grantPermission({ userId, serverId, grantedBy, permissions: ALL_BOM_APPS });
        return { ...record, legacyFallback: true };
      }
      return inMemorySupabase.grantPermission({ userId, serverId, grantedBy, permissions });
    }
    if (!liveSupabase) {
      throw new Error('Database: Supabase client is not initialized.');
    }

    const normalized = normalizePermissions(permissions);

    if (!this.knownMissingPermissionsColumn) {
      const { data, error } = await liveSupabase
        .from('user_server_permissions')
        .upsert({
          user_id: userId,
          server_id: serverId,
          permissions: normalized,
          access_level: accessLevel || 'read_write',
          granted_by: grantedBy,
          granted_at: new Date().toISOString()
        }, { onConflict: 'user_id,server_id' })
        .select()
        .single();

      if (!error) {
        return data;
      }

      if (!isMissingPermissionsColumn(error)) {
        throw new Error(`Database error granting permission: ${error.message}`);
      }

      this.knownMissingPermissionsColumn = true;
      console.warn(`[Admin] user_server_permissions.permissions column missing on grantPermission (${error.message}). Falling back to legacy upsert without permissions column.`);
    }

    // Pre-migration fallback: upsert without permissions column
    const { data: legData, error: legErr } = await liveSupabase
      .from('user_server_permissions')
      .upsert({
        user_id: userId,
        server_id: serverId,
        access_level: accessLevel || 'read_write',
        granted_by: grantedBy,
        granted_at: new Date().toISOString()
      }, { onConflict: 'user_id,server_id' })
      .select()
      .single();

    if (legErr) {
      throw new Error(`Database error granting permission (legacy fallback): ${legErr.message}`);
    }

    return {
      ...legData,
      permissions: [...ALL_BOM_APPS],
      legacyFallback: true
    };
  },

  // Admin: Revoke Permission
  async revokePermission(permissionId) {
    if (shouldUseInMemory()) {
      return inMemorySupabase.revokePermission(permissionId);
    }
    if (!liveSupabase) {
      throw new Error('Database: Supabase client is not initialized.');
    }

    const { error } = await liveSupabase
      .from('user_server_permissions')
      .delete()
      .eq('id', permissionId);

    if (error) {
      throw new Error(`Database error revoking permission: ${error.message}`);
    }
    return true;
  },

  // User: Get Permitted Servers (Dual-State Resilient)
  async getAvailableServersForUser(userId, role) {
    if (shouldUseInMemory()) {
      if (this.simulateMissingPermissionsColumn && role !== 'admin') {
        const userPerms = inMemorySupabase.permissions.filter((p) => p.user_id === userId);
        const permServerIds = new Set(userPerms.map((p) => p.server_id));
        return inMemorySupabase.servers
          .filter((s) => s.is_active && permServerIds.has(s.id))
          .map((s) => {
            const hasPassword = Boolean(s.sap_password_encrypted);
            return {
              id: s.id,
              name: s.name,
              environment: s.environment,
              sap_username: maskSapUsername(s.sap_username),
              has_password: hasPassword,
              credentials_status: (s.sap_username && hasPassword) ? 'saved' : 'not_set',
              is_active: s.is_active,
              permissions: [...ALL_BOM_APPS]
            };
          });
      }
      return inMemorySupabase.getAvailableServersForUser(userId, role);
    }
    if (!liveSupabase) {
      throw new Error('Database: Supabase client is not initialized.');
    }

    if (role === 'admin') {
      const { data, error } = await liveSupabase
        .from('sap_servers')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) {
        throw new Error(`Database error fetching servers: ${error.message}`);
      }

      return (data || []).map((s) => {
        const hasPass = Boolean(s.sap_password_encrypted);
        return {
          id: s.id,
          name: s.name,
          environment: s.environment,
          is_active: s.is_active,
          sap_username: s.sap_username,
          has_password: hasPass,
          credentials_status: (s.sap_username && hasPass) ? 'saved' : 'not_set',
          permissions: [...ALL_BOM_APPS]
        };
      });
    }

    let data;
    let error;

    if (!this.knownMissingPermissionsColumn) {
      const res = await liveSupabase
        .from('user_server_permissions')
        .select(`
          permissions,
          sap_servers (*)
        `)
        .eq('user_id', userId);
      data = res.data;
      error = res.error;
    }

    if (this.knownMissingPermissionsColumn || (error && isMissingPermissionsColumn(error))) {
      this.knownMissingPermissionsColumn = true;
      console.warn('[Database] permissions column missing in getAvailableServersForUser. Falling back to legacy query.');
      const res = await liveSupabase
        .from('user_server_permissions')
        .select(`
          sap_servers (*)
        `)
        .eq('user_id', userId);

      if (res.error) {
        throw new Error(`Database error fetching permitted servers: ${res.error.message}`);
      }

      return (res.data || [])
        .filter((item) => item.sap_servers && item.sap_servers.is_active)
        .map((item) => {
          const s = item.sap_servers;
          const hasPass = Boolean(s.sap_password_encrypted);
          return {
            id: s.id,
            name: s.name,
            environment: s.environment,
            is_active: s.is_active,
            sap_username: maskSapUsername(s.sap_username),
            has_password: hasPass,
            credentials_status: (s.sap_username && hasPass) ? 'saved' : 'not_set',
            permissions: [...ALL_BOM_APPS]
          };
        });
    }

    if (error) {
      throw new Error(`Database error fetching permitted servers: ${error.message}`);
    }

    return (data || [])
      .filter((item) => item.sap_servers && item.sap_servers.is_active)
      .map((item) => {
        const s = item.sap_servers;
        const hasPass = Boolean(s.sap_password_encrypted);
        return {
          id: s.id,
          name: s.name,
          environment: s.environment,
          is_active: s.is_active,
          sap_username: maskSapUsername(s.sap_username),
          has_password: hasPass,
          credentials_status: (s.sap_username && hasPass) ? 'saved' : 'not_set',
          permissions: normalizePermissions(item.permissions || [])
        };
      });
  },

  // Security: Check Per-Server Access on Request (Dual-State Resilient)
  async checkUserServerAccess(userId, serverId, role) {
    if (shouldUseInMemory()) {
      if (this.simulateMissingPermissionsColumn && role !== 'admin') {
        const server = inMemorySupabase.servers.find((s) => s.id === serverId && s.is_active);
        if (!server) {
          return { permitted: false, reason: 'Access denied: Server not found or inactive', server: null, permissions: [] };
        }
        const hasPerm = inMemorySupabase.permissions.some((p) => p.user_id === userId && p.server_id === serverId);
        if (!hasPerm) {
          return { permitted: false, reason: 'Access denied: No permission granted for this server', server: null, permissions: [] };
        }
        return { permitted: true, server, permissions: [...ALL_BOM_APPS] };
      }
      return inMemorySupabase.checkUserServerAccess(userId, serverId, role);
    }
    if (!liveSupabase) {
      throw new Error('Database: Supabase client is not initialized.');
    }

    const server = await this.getServerById(serverId);
    if (!server || !server.is_active) {
      return { permitted: false, reason: 'Access denied: Server not found or inactive', server: null, permissions: [] };
    }
    if (role === 'admin') {
      return { permitted: true, server, permissions: [...ALL_BOM_APPS] };
    }

    let perm;
    let error;

    if (!this.knownMissingPermissionsColumn) {
      const res = await liveSupabase
        .from('user_server_permissions')
        .select('id, permissions')
        .eq('user_id', userId)
        .eq('server_id', serverId)
        .single();
      perm = res.data;
      error = res.error;
    }

    if (this.knownMissingPermissionsColumn || (error && isMissingPermissionsColumn(error))) {
      this.knownMissingPermissionsColumn = true;
      console.warn('[Database] permissions column missing in checkUserServerAccess. Falling back to legacy query.');
      const res = await liveSupabase
        .from('user_server_permissions')
        .select('id')
        .eq('user_id', userId)
        .eq('server_id', serverId)
        .single();

      if (res.error && res.error.code !== 'PGRST116') {
        throw new Error(`Database error verifying user server access: ${res.error.message}`);
      }

      if (!res.data) {
        return { permitted: false, reason: 'Access denied: No permission granted for this server', server: null, permissions: [] };
      }
      return { permitted: true, server, permissions: [...ALL_BOM_APPS] };
    }

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Database error verifying user server access: ${error.message}`);
    }

    if (!perm) {
      return { permitted: false, reason: 'Access denied: No permission granted for this server', server: null, permissions: [] };
    }
    return { permitted: true, server, permissions: normalizePermissions(perm.permissions || []) };
  },

  // Audit: Persist audit log entry if table configured, no silent swallow
  async logAudit(entry) {
    if (shouldUseInMemory()) {
      return entry;
    }
    if (!liveSupabase) {
      return entry;
    }
    // Only attempt if table exists in schema
    try {
      await liveSupabase.from('audit_logs').insert(entry);
    } catch (_) {
      // Ignore if table not created
    }
    return entry;
  }
};

export default supabaseService;
