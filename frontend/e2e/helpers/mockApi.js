/**
 * Mock API routes for Playwright tests.
 * Intercepts all /api/* network requests to completely isolate tests from real SAP / Supabase services.
 */

export const mockAdminUser = {
  id: 'admin-1',
  email: 'admin@rexaedge.com',
  role: 'admin'
};

export const mockNormalUser = {
  id: 'user-1',
  email: 'user@rexaedge.com',
  role: 'user'
};

export const mockServers = [
  {
    id: 'srv-1',
    name: 'SAP DEV 01',
    environment: 'DEV',
    is_active: true,
    ashost: 'sapdev.corp',
    host: 'sapdev.corp',
    sysnr: '00',
    sys_id: 'DEV',
    client: '100',
    max_connections: 5,
    per_user_limit: 3,
    queue_timeout_ms: 20000,
    rfc_call_timeout_ms: 45000,
    health_status: 'healthy',
    circuit_breaker: 'closed',
    last_checked: new Date(Date.now() - 12000).toISOString(),
    active_connections: 2,
    queued_calls: 0,
    permissions: ['bom_display', 'bom_create', 'bom_copy', 'bom_validate', 'bom_delete']
  },
  {
    id: 'srv-2',
    name: 'SAP SANDBOX',
    environment: 'SANDBOX',
    is_active: true,
    ashost: 'sapsandbox.corp',
    host: 'sapsandbox.corp',
    sysnr: '01',
    sys_id: 'SBX',
    client: '200',
    max_connections: 3,
    per_user_limit: 2,
    queue_timeout_ms: 15000,
    rfc_call_timeout_ms: 30000,
    health_status: 'degraded',
    circuit_breaker: 'half-open',
    last_checked: new Date(Date.now() - 45000).toISOString(),
    active_connections: 1,
    queued_calls: 1,
    permissions: ['bom_display', 'bom_validate']
  },
  {
    id: 'srv-3',
    name: 'SAP PROD',
    environment: 'PROD',
    is_active: false,
    ashost: 'sapprod.corp',
    host: 'sapprod.corp',
    sysnr: '00',
    sys_id: 'PRD',
    client: '300',
    max_connections: 10,
    per_user_limit: 4,
    queue_timeout_ms: 30000,
    rfc_call_timeout_ms: 60000,
    health_status: 'down',
    circuit_breaker: 'open',
    last_checked: new Date(Date.now() - 180000).toISOString(),
    active_connections: 0,
    queued_calls: 0,
    permissions: ['bom_display']
  }
];

export const mockPermissions = [
  {
    id: 'perm-1',
    user_id: 'user-1',
    user_email: 'user@rexaedge.com',
    server_id: 'srv-1',
    server_name: 'SAP DEV 01',
    server_environment: 'DEV',
    permissions: ['bom_display', 'bom_create', 'bom_copy', 'bom_validate', 'bom_delete']
  }
];

export const mockPlants = [
  { werks: '1010', name1: 'Walldorf Manufacturing Plant' },
  { werks: '1001', name1: 'Berlin Distribution Center' },
  { werks: '1020', name1: 'Newtown Production Site' }
];

export const mockBomUsages = [
  { stlan: '1', besch: 'Production', btext: 'Production BOM', prod: 'X', eng: '', plnt: '', spar: '', cost: 'X', sls: '' },
  { stlan: '2', besch: 'Engineering/Design', btext: 'Engineering/Design', prod: '', eng: 'X', plnt: '', spar: '', cost: '', sls: '' },
  { stlan: '3', besch: 'Universal', btext: 'Universal BOM', prod: 'X', eng: 'X', plnt: 'X', spar: '', cost: 'X', sls: '' },
  { stlan: '4', besch: 'Plant Maintenance', btext: 'Plant Maintenance', prod: '', eng: '', plnt: 'X', spar: '', cost: '', sls: '' },
  { stlan: '5', besch: 'Sales and Distribution', btext: 'Sales and Distribution', prod: '', eng: '', plnt: '', spar: '', cost: '', sls: 'X' },
  { stlan: '6', besch: 'Costing', btext: 'Costing BOM', prod: '', eng: '', plnt: '', spar: '', cost: 'X', sls: '' }
];

export const mockStorageLocations = [
  { werks: '1010', lgort: '0001', lgobe: 'Raw Materials Storage 1' },
  { werks: '1010', lgort: '0002', lgobe: 'Finished Goods Warehouse' },
  { werks: '1010', lgort: '0003', lgobe: 'Semi-Finished Assembly' }
];

export const mockMaterials = [
  { matnr: '0000000000000100019', maktx: 'Heavy Duty Industrial Continuous Transmission Gearbox Assembly With Integrated Dual Cooling Jacket and Temperature Sensors', werks: '1010', mtart: 'FERT', meins: 'EA', stlal: '01', spras: 'E' },
  { matnr: 'A1BH0214C', maktx: 'Main Drive Motor Housing', werks: '1010', mtart: 'FERT', meins: 'PAA', stlal: '01' },
  { matnr: 'TG0001', maktx: 'Trading Good for Consumption', werks: '1010', mtart: 'MAT', meins: 'ST', stlal: '01' },
  { matnr: 'B2CH0315D', maktx: 'Secondary Sensor Bracket', werks: '1010', mtart: 'HALB', meins: 'EA', stlal: '01' },
  { matnr: 'C3DH0416E', maktx: 'Cold Rolled Steel Plate 10mm', werks: '1010', mtart: 'ROH', meins: 'KG', stlal: '01' },
  { matnr: 'D4EH0517F', maktx: 'Hex Head Bolt M12 x 50', werks: '1010', mtart: 'ROH', meins: 'EA', stlal: '01' }
];

export const mockAdminUsers = [
  { id: 'admin-1', email: 'admin@rexaedge.com', role: 'admin', created_at: '2026-01-01T00:00:00Z' },
  { id: 'user-1', email: 'user@rexaedge.com', role: 'user', created_at: '2026-02-01T00:00:00Z' }
];

export const mockAdminLogs = [
  {
    id: 'log-audit-1',
    created_at: new Date(Date.now() - 60000).toISOString(),
    user_email: 'admin@rexaedge.com',
    action: 'admin.server_created',
    target: 'SAP SANDBOX',
    server_id: 'srv-2',
    server_name: 'SAP SANDBOX',
    status: 'success',
    duration_ms: 118,
    request_id: 'req_8f1a2c3d',
    ip: '192.168.1.100',
    message: 'Server created successfully: SAP SANDBOX (Sandbox)',
    details: { environment: 'SANDBOX', client: '200' }
  },
  {
    id: 'log-audit-2',
    created_at: new Date(Date.now() - 300000).toISOString(),
    user_email: 'lead.engineer@rexaedge.com',
    action: 'admin.server_configuration_updated',
    target: 'SAP DEV 01',
    server_id: 'srv-1',
    server_name: 'SAP DEV 01',
    status: 'success',
    duration_ms: 84,
    request_id: 'req_3b4c5d6e',
    ip: '192.168.1.105',
    message: 'Pool limits and queue timeout updated',
    details: { max_connections: 5, per_user_limit: 3 }
  },
  {
    id: 'log-audit-3',
    created_at: new Date(Date.now() - 900000).toISOString(),
    user_email: 'operator@rexaedge.com',
    action: 'bom.bulk_create',
    target: 'Batch #BOM-2026-99',
    server_id: 'srv-1',
    server_name: 'SAP DEV 01',
    status: 'failed',
    duration_ms: 412,
    request_id: 'req_failed_9901',
    ip: '10.0.4.15',
    message: 'RFC connection timed out while processing row 4',
    details: { error: 'RFC_TIMEOUT', row: 4 }
  },
  {
    id: 'log-audit-4',
    created_at: new Date(Date.now() - 1800000).toISOString(),
    user_email: 'system.maintenance@rexaedge.com',
    action: 'system.cache_cleanup',
    target: 'F4 Metadata Cache',
    server_id: null,
    server_name: null,
    status: 'success',
    duration_ms: 25,
    request_id: 'req_sys_maint_01',
    ip: '127.0.0.1',
    message: 'F4 value lookup cache invalidated after schema update',
    details: { cleared_keys: 14 }
  },
  {
    id: 'log-audit-5',
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    user_email: 'security.auditor@rexaedge.com',
    action: 'admin.permission_grant',
    target: 'srv-1',
    server_id: 'srv-1',
    server_name: 'SAP DEV 01',
    status: 'success',
    duration_ms: 65,
    request_id: 'req_sec_grant_05',
    ip: '10.0.2.20',
    message: 'Granted BOM creation permission to user-1',
    details: { permission: 'bom_create' }
  },
  {
    id: 'log-audit-6',
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    user_email: 'admin@rexaedge.com',
    action: 'admin.user_create',
    target: 'user-new@rexaedge.com',
    server_id: null,
    server_name: null,
    status: 'success',
    duration_ms: 150,
    request_id: 'req_user_add_06',
    ip: '192.168.1.100',
    message: 'Created new user account',
    details: { user_email: 'user-new@rexaedge.com' }
  }
];

export const mockBomExplorerData = {
  success: true,
  material: 'A1BH0214C',
  plant: '1010',
  usage: '1',
  alternative: '01',
  components: [
    { id: 1, itemNo: '0010', component: 'C3DH0416E', description: 'Cold Rolled Steel Plate 10mm', quantity: '25.000', unit: 'KG', itemCategory: 'L', storageLocation: '0001' },
    { id: 2, itemNo: '0020', component: 'D4EH0517F', description: 'Hex Head Bolt M12 x 50', quantity: '120.000', unit: 'PC', itemCategory: 'L', storageLocation: '0001' }
  ],
  bom: {
    material: 'A1BH0214C',
    plant: '1010',
    alternative: '01',
    usage: '1',
    description: 'Main Drive Motor Housing',
    components: [
      { id: 1, itemNo: '0010', component: 'C3DH0416E', description: 'Cold Rolled Steel Plate 10mm', quantity: '25.000', unit: 'KG', itemCategory: 'L', storageLocation: '0001' },
      { id: 2, itemNo: '0020', component: 'D4EH0517F', description: 'Hex Head Bolt M12 x 50', quantity: '120.000', unit: 'PC', itemCategory: 'L', storageLocation: '0001' }
    ]
  }
};

/**
 * Setup route interception for a Playwright page.
 */
export async function setupMocks(page, { authenticated = true, user = mockAdminUser, unmockedRequestsCollector = [] } = {}) {
  // Setup localStorage before navigation
  await page.addInitScript(({ isAuth, serverId }) => {
    if (isAuth) {
      localStorage.setItem('sb_token', 'mock-valid-bearer-token');
      localStorage.setItem('selected_server_id', serverId);
    } else {
      localStorage.removeItem('sb_token');
      localStorage.removeItem('selected_server_id');
    }
  }, { isAuth: authenticated, serverId: 'srv-1' });

  // Track failed network requests
  page.on('requestfailed', (req) => {
    unmockedRequestsCollector.push(`Failed network request: ${req.method()} ${req.url()}`);
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();

    const respondJson = (data, status = 200) => {
      return route.fulfill({
        status,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(data)
      });
    };

    // 1. Auth config
    if (url.includes('/api/auth/config')) {
      return respondJson({ skipGatewayAuth: false, bypassUser: null, mockMode: true });
    }

    // 2. Auth me / session check
    if (url.includes('/api/auth/me')) {
      if (authenticated) {
        return respondJson({ authenticated: true, user });
      }
      return respondJson({ authenticated: false, user: null }, 401);
    }

    // 3. Login
    if (url.includes('/api/auth/login')) {
      if (method === 'POST') {
        const postData = request.postDataJSON() || {};
        if (postData.password === 'wrong-password') {
          return respondJson({ error: 'Invalid email or password' }, 401);
        }
        return respondJson({ success: true, token: 'mock-valid-bearer-token', user: mockAdminUser });
      }
    }

    // 4. Logout
    if (url.includes('/api/auth/logout')) {
      return respondJson({ success: true });
    }

    // 5. Servers
    if (url.includes('/api/servers/available') || url.includes('/api/servers')) {
      if (url.includes('/modules')) {
        return respondJson({ modules: ['bom', 'admin'] });
      }
      return respondJson({ success: true, servers: mockServers, data: mockServers });
    }

    // 6. Server modules
    if (url.includes('/modules')) {
      return respondJson({ modules: ['bom', 'admin'] });
    }

    // 7. SAP Session status
    if (url.includes('/api/sap-session/status') || url.includes('/api/sap/session-status')) {
      return respondJson({
        connected: true,
        status: 'CONNECTED',
        message: 'SAP DEV connected',
        system: 'DEV',
        client: '100',
        user: 'SAPUSER',
        selectedUser: 'SAPUSER',
        selectedSessionId: 'sess-1'
      });
    }

    if (url.includes('/api/sap/sessions')) {
      return respondJson({
        sessions: [{ id: 'sess-1', system: 'DEV', client: '100', user: 'SAPUSER' }]
      });
    }

    // 8. Plants
    if (url.includes('/api/plants')) {
      return respondJson({ success: true, data: mockPlants, plants: mockPlants });
    }

    // 9. BOM Usages
    if (url.includes('/api/bom-usages')) {
      return respondJson({ success: true, data: mockBomUsages, usages: mockBomUsages });
    }

    // 10. Storage Locations
    if (url.includes('/api/storage-locations')) {
      return respondJson({ success: true, data: mockStorageLocations, storageLocations: mockStorageLocations });
    }

    // 11. Materials Search & Detail
    if (url.includes('/api/materials/search')) {
      return respondJson({ success: true, data: mockMaterials, materials: mockMaterials });
    }
    const matDetailMatch = url.match(/\/api\/materials\/([^?]+)/);
    if (matDetailMatch) {
      const targetMat = decodeURIComponent(matDetailMatch[1]).toUpperCase();
      const matched = mockMaterials.find((m) => m.matnr.toUpperCase() === targetMat || m.matnr.toUpperCase().endsWith(targetMat));
      if (matched) {
        return respondJson({ success: true, data: matched });
      } else {
        return route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: `Material ${targetMat} not found in SAP.`, code: 'NOT_FOUND' })
        });
      }
    }
    if (url.includes('/api/materials')) {
      return respondJson({ success: true, data: mockMaterials, materials: mockMaterials });
    }

    // 12. Preflight Single BOM
    if (url.includes('/api/boms/preflight') || url.includes('/api/boms/validate') || url.includes('/api/bom/create-preflight')) {
      return respondJson({
        success: true,
        boms: [
          {
            status: 'Ready',
            material: 'A1BH0214C',
            plant: '1010',
            alternativeBom: '01',
            bomUsage: '1',
            warnings: [],
            errors: []
          }
        ]
      });
    }

    // 13. Validate Source BOM (Copy BOM)
    if (url.includes('/api/boms/validate-source') || url.includes('/api/bom/validate-source')) {
      let postData = {};
      try {
        postData = request.postDataJSON() || {};
      } catch { /* ignore */ }

      const mat = (postData.material || '').toUpperCase();
      if (mat.includes('NOTFOUND') || mat.includes('INVALID') || mat.includes('ERROR')) {
        return respondJson({
          success: false,
          valid: false,
          errorCode: 'MATERIAL_NOT_FOUND',
          message: `Material ${mat || 'UNKNOWN'} not found in plant ${postData.plant || '1000'}`
        });
      }

      if (mat.includes('MULTIALT') || mat.includes('12ALTS') || mat.includes('MANY')) {
        return respondJson({
          success: true,
          valid: true,
          componentCount: 6,
          availableAlternatives: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
        });
      }

      return respondJson({
        success: true,
        valid: true,
        componentCount: 4,
        availableAlternatives: ['01', '02', '03']
      });
    }

    // 14. Chat proposal / Delete BOM proposal
    if (url.includes('/api/chat')) {
      return respondJson({
        reply: 'Proposal generated successfully.',
        proposedAction: {
          actionId: 'act-101',
          type: 'delete_bom',
          preview: { material: 'A1BH0214C', plant: '1010', alternative: '01', usage: '1' },
          riskLevel: 3,
          expiresAt: Date.now() + 300000
        }
      });
    }

    // 15. Admin Users
    if (url.includes('/api/admin/users')) {
      return respondJson({ success: true, data: mockAdminUsers, users: mockAdminUsers });
    }

    // 16. Admin Servers
    if (url.includes('/api/admin/servers')) {
      return respondJson({ success: true, data: mockServers, servers: mockServers });
    }

    // 16b. Clear Admin F4 Cache
    if (url.includes('/api/admin/cache/clear')) {
      return respondJson({ success: true, message: 'F4 cache cleared' });
    }

    // 17. Admin Permissions
    if (url.includes('/api/admin/permissions')) {
      return respondJson({ success: true, data: mockPermissions, permissions: mockPermissions });
    }

    // 18. Admin Logs
    if (url.includes('/api/admin/logs/audit/') || url.includes('/api/admin/logs/errors/')) {
      const parts = url.split('/');
      const logId = parts[parts.length - 1].split('?')[0];
      const matched = mockAdminLogs.find((l) => l.id === logId) || mockAdminLogs[0];
      return respondJson({ success: true, data: matched });
    }
    if (url.includes('/api/admin/logs') || url.includes('/api/logs')) {
      const parsedUrl = new URL(url, 'http://localhost');
      const startDateParam = parsedUrl.searchParams.get('startDate');
      const endDateParam = parsedUrl.searchParams.get('endDate');
      const statusParam = parsedUrl.searchParams.get('status');
      const serverIdParam = parsedUrl.searchParams.get('serverId');
      const userEmailParam = parsedUrl.searchParams.get('userEmail');
      const actionParam = parsedUrl.searchParams.get('action');

      let filtered = [...mockAdminLogs];

      if (startDateParam) {
        const start = new Date(startDateParam).getTime();
        filtered = filtered.filter((l) => new Date(l.created_at).getTime() >= start);
      }
      if (endDateParam) {
        const end = new Date(endDateParam).getTime();
        filtered = filtered.filter((l) => new Date(l.created_at).getTime() <= end);
      }
      if (statusParam) {
        filtered = filtered.filter((l) => l.status === statusParam);
      }
      if (serverIdParam) {
        filtered = filtered.filter((l) => l.server_id === serverIdParam);
      }
      if (userEmailParam) {
        filtered = filtered.filter((l) => l.user_email?.toLowerCase().includes(userEmailParam.toLowerCase()));
      }
      if (actionParam) {
        filtered = filtered.filter((l) => l.action === actionParam);
      }

      return respondJson({
        success: true,
        data: filtered,
        logs: filtered,
        count: filtered.length,
        total: filtered.length
      });
    }

    // 19. BOM Explorer / read / display
    if (url.includes('/api/boms/structure') || url.includes('/api/boms/display') || url.includes('/api/bom/read') || url.includes('/api/boms/')) {
      return respondJson(mockBomExplorerData);
    }

    let activeMockJobType = 'create_preflight';

    // 20. BOM Jobs (Background Job Polling for Bulk Operations)
    if (url.includes('/api/bom-jobs/start') || url.includes('/api/bom/jobs/start') || ((url.includes('/api/bom-jobs') || url.includes('/api/bom/jobs')) && method === 'POST')) {
      try {
        const postData = request.postDataJSON() || {};
        if (postData.type) activeMockJobType = postData.type;
      } catch { /* ignore */ }
      return respondJson({
        success: true,
        jobId: 'mock-job-001',
        total: 2,
        status: 'PROCESSING'
      });
    }

    if (url.includes('/api/bom-jobs/') || url.includes('/api/bom/jobs/')) {
      const isPreflight = activeMockJobType === 'create_preflight';
      return respondJson({
        success: true,
        job: {
          id: 'mock-job-001',
          type: activeMockJobType,
          status: 'COMPLETED',
          processed: 2,
          total: 2,
          successCount: 2,
          failedCount: 0,
          skippedCount: 0,
          notProcessedCount: 0,
          results: [
            { sequenceNum: '1', material: 'A1BH0214C', plant: '1010', bomUsage: '1', alternativeBom: '01', bomNumber: isPreflight ? undefined : '00001001', status: isPreflight ? 'Ready' : 'SUCCESS', message: isPreflight ? 'Ready for creation' : 'Created successfully', componentsCount: 1 },
            { sequenceNum: '2', material: 'B2CH0315D', plant: '1010', bomUsage: '1', alternativeBom: '01', bomNumber: isPreflight ? undefined : '00001002', status: isPreflight ? 'Ready' : 'SUCCESS', message: isPreflight ? 'Ready for creation' : 'Created successfully', componentsCount: 1 }
          ]
        }
      });
    }

    // 21. Batch validate and copy
    if (url.includes('/api/boms/batch-validate') || url.includes('/api/bom/batch-validate')) {
      return respondJson({
        success: true,
        summary: { total: 2, valid: 2, invalid: 0, warnings: 0 },
        results: [
          { id: 1, sourceMaterial: 'A1BH0214C', sourcePlant: '1010', sourceUsage: '1', sourceAltBom: '01', targetMaterial: 'A1BH0214C', targetPlant: '1001', targetUsage: '1', targetAltBom: '02', status: 'VALID', message: 'Ready to copy' },
          { id: 2, sourceMaterial: 'B2CH0315D', sourcePlant: '1010', sourceUsage: '1', sourceAltBom: '01', targetMaterial: 'B2CH0315D', targetPlant: '1001', targetUsage: '1', targetAltBom: '02', status: 'VALID', message: 'Ready to copy' }
        ]
      });
    }

    if (url.includes('/api/boms/batch-copy') || url.includes('/api/bom/batch-copy')) {
      return respondJson({
        success: true,
        successCount: 2,
        failedCount: 0,
        skippedCount: 0,
        results: [
          { id: 1, sourceMaterial: 'A1BH0214C', sourcePlant: '1010', targetMaterial: 'A1BH0214C', targetPlant: '1001', status: 'SUCCESS', bomNumber: '00001001', message: 'Copied successfully' },
          { id: 2, sourceMaterial: 'B2CH0315D', sourcePlant: '1010', targetMaterial: 'B2CH0315D', targetPlant: '1001', status: 'SUCCESS', bomNumber: '00001002', message: 'Copied successfully' }
        ]
      });
    }

    // Catch-all for any other unmocked /api/ endpoints to prevent failures
    unmockedRequestsCollector.push(`Unmocked endpoint caught: ${method} ${url}`);
    return respondJson({ success: true, data: [] });
  });
}
