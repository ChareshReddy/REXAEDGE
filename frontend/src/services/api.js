import axios from 'axios';

// Create Axios client with credentials included for HttpOnly cookie persistence
const apiClient = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  }
});

/**
 * Updates Authorization Bearer header and synchronizes with localStorage
 */
export function setAuthToken(token) {
  if (token) {
    try { localStorage.setItem('sb_token', token); } catch (_) {}
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    try { localStorage.removeItem('sb_token'); } catch (_) {}
    delete apiClient.defaults.headers.common['Authorization'];
  }
}

let activePlantPrefetch = null;
let lastPrefetchedServerId = null;
const globalPlantCache = new Map(); // serverId -> { list, error }

/**
 * Initiates non-blocking background prefetch of plant catalog from T001W for the selected SAP server.
 */
export function prefetchPlants(serverId) {
  const targetServerId =
    serverId ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('selected_server_id') : null) ||
    'default';

  if (!targetServerId) return Promise.resolve([]);

  // If already cached successfully, return cached list
  const existing = globalPlantCache.get(targetServerId);
  if (existing && !existing.error && existing.list?.length > 0) {
    return Promise.resolve(existing.list);
  }

  // If already actively prefetching this server, return in-flight promise
  if (activePlantPrefetch && lastPrefetchedServerId === targetServerId) {
    return activePlantPrefetch;
  }

  lastPrefetchedServerId = targetServerId;
  activePlantPrefetch = getPlants()
    .then((res) => {
      const list = res?.data || [];
      globalPlantCache.set(targetServerId, { list, error: null });
      return list;
    })
    .catch((err) => {
      console.warn('[prefetchPlants] Background prefetch failed:', err.message);
      globalPlantCache.set(targetServerId, {
        list: [],
        error: err.response?.data?.error || err.message || 'Could not verify plant'
      });
      return [];
    })
    .finally(() => {
      activePlantPrefetch = null;
    });

  return activePlantPrefetch;
}

export function getPrefetchedPlants(serverId) {
  const targetServerId =
    serverId ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('selected_server_id') : null) ||
    'default';
  return globalPlantCache.get(targetServerId) || null;
}

export function getActivePlantPrefetchPromise(serverId) {
  const targetServerId =
    serverId ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('selected_server_id') : null) ||
    'default';
  if (lastPrefetchedServerId === targetServerId && activePlantPrefetch) {
    return activePlantPrefetch;
  }
  return null;
}

/**
 * Updates x-server-id header and synchronizes with localStorage
 */
export function setSelectedServerHeader(serverId) {
  if (serverId) {
    try { localStorage.setItem('selected_server_id', serverId); } catch (_) {}
    apiClient.defaults.headers.common['x-server-id'] = serverId;
  } else {
    try { localStorage.removeItem('selected_server_id'); } catch (_) {}
    delete apiClient.defaults.headers.common['x-server-id'];
  }

  // Trigger non-blocking background prefetch for the newly selected server
  if (serverId) {
    prefetchPlants(serverId);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sap-server-changed', { detail: { serverId } }));
  }
}

// Restore saved session token and server ID on startup
try {
  const savedToken = localStorage.getItem('sb_token');
  if (savedToken) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`;
  }
  const savedServerId = localStorage.getItem('selected_server_id');
  if (savedServerId) {
    apiClient.defaults.headers.common['x-server-id'] = savedServerId;
  }
} catch (_) {}

/**
 * Validates credentials via Supabase authentication endpoint.
 * Stores token in client state.
 */
export async function loginUser(email, password) {
  const response = await apiClient.post('/auth/login', { email, username: email, password });
  if (response.data?.token) {
    setAuthToken(response.data.token);
  }
  return response.data;
}

/**
 * Logs out user, invalidating session in backend and clearing tokens.
 */
export async function logoutUser() {
  const response = await apiClient.post('/auth/logout');
  setAuthToken(null);
  setSelectedServerHeader(null);
  return response.data;
}

/**
 * Checks if current session is active and valid.
 */
export async function checkSession() {
  const response = await apiClient.get('/auth/me');
  return response.data;
}

/**
 * Retrieves authentication configuration (e.g. skipGatewayAuth, bypassUser, mockMode).
 */
export async function getAuthConfig() {
  const response = await apiClient.get('/auth/config');
  return response.data;
}

/**
 * Fetches available SAP entities from registry.
 */
export async function getEntities() {
  const response = await apiClient.get('/entities');
  return response.data?.entities || [];
}

/**
 * Fetches records for a specific SAP entity with pagination and filtering.
 * @param {string} entityKey
 * @param {object} options
 */
export async function getEntityRecords(entityKey, { from, to, top = 50, skip = 0, systemKey } = {}) {
  const params = {};
  if (from) params.from = from;
  if (to) params.to = to;
  if (top !== undefined) params.top = top;
  if (skip !== undefined) params.skip = skip;
  if (systemKey) params.systemKey = systemKey;

  const response = await apiClient.get(`/entities/${entityKey}`, { params });
  return response.data;
}

/**
 * Legacy helper: Fetches SAP Business Partners with optional ID range filter and pagination.
 * @param {object} options { from, to, top, skip }
 */
export async function getBusinessPartners(options = {}) {
  return getEntityRecords('businessPartner', options);
}

/**
 * Sends user prompt and prior history to the conversational AI endpoint.
 * Returns { reply: string, data: array | null, proposedAction: object | null, entityKey?: string }
 * 
 * @param {string} message
 * @param {Array} [history]
 * @param {string} [systemKey='DEV']
 */
export async function sendChatMessage(message, history = [], systemKey = 'DEV', extra = {}, config = {}) {
  const response = await apiClient.post('/chat', { message, history, systemKey, ...extra }, config);
  return response.data;
}

/**
 * Confirms and executes a proposed write action by its unique actionId.
 * Supports optional business reason and PROD double-confirmation.
 * @param {string} actionId
 * @param {object} [options]
 * @param {string} [options.reason]
 * @param {string} [options.prodConfirmation]
 * @param {string} [options.systemKey]
 * @param {boolean} [options.copySubBoms]
 */
export async function confirmChatAction(actionId, { reason, prodConfirmation, systemKey, copySubBoms } = {}) {
  const response = await apiClient.post('/chat', {
    confirmAction: actionId,
    reason: reason || undefined,
    prodConfirmation: prodConfirmation || undefined,
    systemKey: systemKey || undefined,
    copySubBoms: copySubBoms !== undefined ? copySubBoms : undefined
  });
  return response.data;
}

/**
 * Cancels a proposed write action.
 * @param {string} actionId
 */
export async function cancelChatAction(actionId) {
  const response = await apiClient.post('/chat', { cancelAction: actionId });
  return response.data;
}

/**
 * Fetches available SAP system environments (DEV, QA, PROD).
 */
export async function getSystems() {
  const response = await apiClient.get('/systems');
  return response.data;
}

/**
 * Fetches the Error Knowledge Base catalogue with occurrence metrics.
 */
export async function getKnowledgeBase() {
  const response = await apiClient.get('/knowledge-base');
  return response.data;
}

/**
 * Creates a new Error Knowledge Base rule.
 */
export async function createKnowledgeBaseRule(rule) {
  const response = await apiClient.post('/knowledge-base', rule);
  return response.data;
}

/**
 * Updates an existing Error Knowledge Base rule.
 */
export async function updateKnowledgeBaseRule(id, updates) {
  const response = await apiClient.put(`/knowledge-base/${id}`, updates);
  return response.data;
}

/**
 * Deletes an Error Knowledge Base rule.
 */
export async function deleteKnowledgeBaseRule(id) {
  const response = await apiClient.delete(`/knowledge-base/${id}`);
  return response.data;
}

/**
 * Validates a Source / Reference BOM against SAP GUI (CS03) or mock data.
 * @param {object} params { material, plant, bomUsage, alternativeBom }
 * @returns {Promise<{ success: boolean, materialExists?: boolean, plantValid?: boolean, bomExists?: boolean, alternativeValid?: boolean, availableAlternatives?: string[], componentCount?: number, message: string, errorCode?: string }>}
 */
export async function validateSourceBom(params, config = {}) {
  const response = await apiClient.post('/bom/validate-source', params, config);
  return response.data;
}

/**
 * Validates a batch of BOM items against SAP via high-speed RFC.
 * @param {Array<object>} items
 * @returns {Promise<{ success: boolean, totalItems: number, validCount: number, warningCount: number, errorCount: number, results: Array<object> }>}
 */
export async function batchValidateBoms(items) {
  const response = await apiClient.post('/bom/batch-validate', { items });
  return response.data;
}

/**
 * Executes batch BOM copy sequentially via SAP RFC.
 * @param {Array<object>} items
 * @param {object} [options={ skipErrors: true }]
 * @returns {Promise<{ success: boolean, totalProcessed: number, successCount: number, failedCount: number, results: Array<object> }>}
 */
export async function batchCopyBoms(items, options = { skipErrors: true }) {
  const response = await apiClient.post('/bom/batch-copy', { items, ...options });
  return response.data;
}

/**
 * Downloads the official Excel template for Bulk BOM Copy.
 */
export async function downloadBomTemplate() {
  const response = await apiClient.get('/bom/template', {
    responseType: 'blob'
  });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'BOM_Copy_Template.xlsx');
  document.body.appendChild(link);
  link.click();
  link.parentNode.removeChild(link);
  window.URL.revokeObjectURL(url);
}

/**
 * Pre-flight validation for BOM Creation (Single or Bulk).
 * @param {object} payload { fileContent?: string, boms?: Array, bom?: object }
 */
export async function preflightCreateBoms(payload) {
  const response = await apiClient.post('/bom/create-preflight', payload);
  return response.data;
}

/**
 * Creates a single BOM in SAP with full header and component parameters.
 * @param {object} payload { bom: object, confirmText?: string, reason?: string }
 */
export async function createSingleBom(payload) {
  const response = await apiClient.post('/bom/create-single', payload);
  return response.data;
}

/**
 * Executes sequential bulk creation of BOMs in SAP.
 * @param {object} payload { boms: Array, fileName?: string, confirmText?: string, reason?: string }
 */
export async function createBulkBoms(payload) {
  const response = await apiClient.post('/bom/create-bulk', payload);
  return response.data;
}

/**
 * Starts an asynchronous background job for BOM pre-flight, validation, or execution.
 * @param {object} payload { type, items, boms, fileContent, fileName, copyHierarchy, skipErrors, confirmText, reason }
 */
export async function startBomJob(payload, config = {}) {
  const response = await apiClient.post('/bom/jobs/start', payload, config);
  return response.data;
}

/**
 * Polls the current progress, status, and results of a background job.
 * @param {string} jobId
 */
export async function getBomJob(jobId) {
  const response = await apiClient.get(`/bom/jobs/${jobId}`);
  return response.data;
}

/**
 * Requests cancellation of an in-flight background job.
 * @param {string} jobId
 */
export async function cancelBomJob(jobId) {
  const response = await apiClient.post(`/bom/jobs/${jobId}/cancel`);
  return response.data;
}

/**
 * Checks if there is an active job running on the server for the current user.
 * @param {string} [serverId]
 */
export async function getActiveBomJob(serverId) {
  const params = serverId ? { server: serverId } : {};
  const response = await apiClient.get('/bom/jobs/active', { params });
  return response.data;
}

/**
 * Downloads the official Excel template for Create BOM (Bulk).
 */
export async function downloadCreateBomTemplate() {
  const response = await apiClient.get('/bom/create-template', {
    responseType: 'blob'
  });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'Create_BOM_Template.xlsx');
  document.body.appendChild(link);
  link.click();
  link.parentNode.removeChild(link);
  window.URL.revokeObjectURL(url);
}

/**
 * Fetches current SAP GUI or RFC session health and connectivity status.
 * @param {string} [serverId]
 * @returns {Promise<{ connected: boolean, status: string, system?: string, client?: string, user?: string, message?: string, code?: string, selectedSessionId?: string, sessions?: Array<object> }>}
 */
export async function getSapSessionStatus(serverId) {
  const sid = serverId || (typeof localStorage !== 'undefined' ? localStorage.getItem('selected_server_id') : null);
  const config = sid ? { params: { serverId: sid }, headers: { 'x-server-id': sid } } : {};
  const response = await apiClient.get('/sap/session-status', config);
  return response.data;
}

/**
 * Fetches all available SAP GUI sessions and active selection.
 * @param {string} [serverId]
 * @returns {Promise<{ success: boolean, selectedSessionId: string|null, selectedUser: string|null, sessions: Array<object>, status?: string, connected?: boolean }>}
 */
export async function getSapSessions(serverId) {
  const sid = serverId || (typeof localStorage !== 'undefined' ? localStorage.getItem('selected_server_id') : null);
  const config = sid ? { params: { serverId: sid }, headers: { 'x-server-id': sid } } : {};
  const response = await apiClient.get('/sap/sessions', config);
  return response.data;
}

/**
 * Selects an active SAP GUI session for all future SAP operations.
 * @param {string} sessionId
 * @returns {Promise<{ success: boolean, selectedSessionId: string, selectedUser: string, message: string, session?: object }>}
 */
export async function selectSapSession(sessionId) {
  const response = await apiClient.post('/sap/sessions/select', { sessionId });
  return response.data;
}

/**
 * Reads a BOM header and components via SAP RFC CSAP_MAT_BOM_READ.
 * @param {object} params { material, plant, bomUsage, alternativeBom }
 */
export async function readBom(params) {
  const response = await apiClient.post('/bom/read', params);
  return response.data;
}

/**
 * Explodes and returns full multi-level BOM hierarchy.
 * @param {object} params { material, plant, bomUsage, alternativeBom }
 */
export async function explodeBomHierarchy(params) {
  const response = await apiClient.post('/bom/hierarchy', params);
  return response.data;
}

/**
 * Reads back and strictly verifies the copied BOM hierarchy from SAP database.
 * @param {object} params
 */
export async function verifyCopiedBom(params) {
  const response = await apiClient.post('/bom/verify-copy', params);
  return response.data;
}

/**
 * Retrieves list of active SAP servers the logged-in user is permitted to access.
 */
export async function getAvailableServers() {
  const response = await apiClient.get('/servers/available');
  return response.data?.servers || [];
}

/**
 * Retrieves list of enabled modules for a specific SAP server.
 */
export async function getServerModules(serverId) {
  if (!serverId) return [];
  const response = await apiClient.get(`/servers/${serverId}/modules`);
  return response.data?.modules || [];
}

/**
 * Retrieves global module list (admin gets all modules; non-admin gets permitted modules).
 */
export async function getAllModules() {
  const response = await apiClient.get('/modules');
  return response.data?.modules || [];
}

/**
 * ============================================================================
 * ADMIN MANAGEMENT API METHODS (Role: admin required)
 * ============================================================================
 */

export async function getAdminUsers() {
  const response = await apiClient.get('/admin/users');
  return response.data?.users || [];
}

export async function createAdminUser(userData) {
  const response = await apiClient.post('/admin/users', userData);
  return response.data;
}

export async function deleteAdminUser(id) {
  const response = await apiClient.delete(`/admin/users/${id}`);
  return response.data;
}

export async function getAdminServers() {
  const response = await apiClient.get('/admin/servers');
  return response.data?.servers || [];
}

export async function createAdminServer(serverData) {
  const response = await apiClient.post('/admin/servers', serverData);
  return response.data;
}

export async function updateAdminServer(id, serverData) {
  const response = await apiClient.put(`/admin/servers/${id}`, serverData);
  return response.data;
}

export async function deleteAdminServer(id) {
  const response = await apiClient.delete(`/admin/servers/${id}`);
  return response.data;
}

export async function testServerConnection(connectionData) {
  const response = await apiClient.post('/admin/servers/test-connection', connectionData);
  return response.data;
}

export async function testServerById(serverId) {
  const response = await apiClient.post(`/admin/servers/${serverId}/test-connection`);
  return response.data;
}

export async function getAdminPermissions() {
  const response = await apiClient.get('/admin/permissions');
  return response.data?.permissions || [];
}

export async function grantAdminPermission(permissionData) {
  const response = await apiClient.post('/admin/permissions', permissionData);
  return response.data;
}

export async function revokeAdminPermission(id) {
  const response = await apiClient.delete(`/admin/permissions/${id}`);
  return response.data;
}

/**
 * Changes password for currently authenticated user.
 */
export async function changeUserPassword(currentPassword, newPassword, confirmPassword) {
  const response = await apiClient.post('/auth/change-password', {
    currentPassword,
    newPassword,
    confirmPassword
  });
  return response.data;
}

/**
 * Sets new password for a user (Admin only).
 */
export async function adminSetUserPassword(userId, password, confirmPassword) {
  const response = await apiClient.post(`/admin/users/${userId}/password`, {
    password,
    confirmPassword
  });
  return response.data;
}

/**
 * Searches SAP materials by description or number with optional plant, type and BOM checks.
 */
export async function searchMaterials(
  { query = '', plant, limit = 100, mtart, checkBom = false, bomUsage = '1', mode },
  options = {}
) {
  const params = { q: query, limit };
  if (plant) params.plant = plant;
  if (mtart) params.mtart = mtart;
  if (checkBom) params.checkBom = checkBom;
  if (bomUsage) params.bomUsage = bomUsage;
  if (mode) params.mode = mode;
  const config = { params };
  if (options?.signal) config.signal = options.signal;
  const response = await apiClient.get('/materials/search', config);
  return response.data;
}

/**
 * Fetches full master detail and plant extension status for a single material.
 */
export async function getMaterialDetail(matnr, { plant, bomUsage = '1' } = {}, options = {}) {
  const params = {};
  if (plant) params.plant = plant;
  if (bomUsage) params.bomUsage = bomUsage;
  const config = { params };
  if (options?.signal) config.signal = options.signal;
  const response = await apiClient.get(`/materials/${encodeURIComponent(matnr)}`, config);
  return response.data;
}

/**
 * Fetches SAP plant definitions from T001W with optional filtering, material extension check, and manual refresh.
 */
export async function getPlants({ q, material, refresh } = {}, options = {}) {
  const params = {};
  if (q) params.q = q;
  if (material) params.material = material;
  if (refresh) params.refresh = refresh;
  const config = { params };
  if (options?.signal) config.signal = options.signal;
  const response = await apiClient.get('/plants', config);
  return response.data;
}

export default apiClient;



