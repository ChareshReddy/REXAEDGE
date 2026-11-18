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
  { id: 'admin-1', email: 'admin@rexaedge.com', role: 'admin', created_at: '2026-01-01T00:00:00Z', is_disabled: false },
  { id: 'user-1', email: 'user@rexaedge.com', role: 'user', created_at: '2026-02-01T00:00:00Z', is_disabled: false },
  { id: 'user-2', email: 'contractor@rexaedge.com', role: 'user', created_at: '2026-02-15T00:00:00Z', is_disabled: true }
];

export const mockAllowlist = [
  { id: 'al-1', pattern: '103.206.249.51', type: 'Sandbox', comment: 'Sandbox Gateway', created_at: '2026-03-01T00:00:00Z' },
  { id: 'al-2', pattern: '192.168.100.0/24', type: 'Development', comment: 'Internal Dev Network', created_at: '2026-03-02T00:00:00Z' },
  { id: 'al-3', pattern: '10.*', type: 'QA', comment: 'QA VPC Range', created_at: '2026-03-03T00:00:00Z' }
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

const sample16Components = [
  { id: 1, itemNo: '0010', component: 'C3DH0416E', material: 'C3DH0416E', description: 'Cold Rolled Steel Plate 10mm', quantity: '25.000', unit: 'KG', itemCategory: 'L', storageLocation: '0001', level: 1, hasSubBom: false, validFrom: '2026-01-01' },
  { id: 2, itemNo: '0020', component: 'D4EH0517F', material: 'D4EH0517F', description: 'Hex Head Bolt M12 x 50', quantity: '120.000', unit: 'PC', itemCategory: 'L', storageLocation: '0001', level: 2, hasSubBom: false, validFrom: '2026-01-01' },
  { id: 3, itemNo: '0030', component: 'E5FH0618G', material: 'E5FH0618G', description: 'Spring Washer M12 DIN 127', quantity: '120.000', unit: 'PC', itemCategory: 'L', storageLocation: '0001', level: 2, hasSubBom: false, validFrom: '2026-01-01' },
  { id: 4, itemNo: '0040', component: 'F6GH0719H', material: 'F6GH0719H', description: 'Sub-Assembly Motor Bracket', quantity: '1.000', unit: 'PC', itemCategory: 'L', storageLocation: '0001', level: 1, hasSubBom: true, validFrom: '2026-01-01' },
  { id: 5, itemNo: '0050', component: 'G7HH0820I', material: 'G7HH0820I', description: 'Bracket Arm Aluminum 6061', quantity: '2.000', unit: 'PC', itemCategory: 'L', storageLocation: '0001', level: 2, hasSubBom: false, validFrom: '2026-01-01' },
  { id: 6, itemNo: '0060', component: 'H8IH0921J', material: 'H8IH0921J', description: 'Dowel Pin 8mm x 40mm', quantity: '4.000', unit: 'PC', itemCategory: 'L', storageLocation: '0001', level: 3, hasSubBom: false, validFrom: '2026-01-01' },
  { id: 7, itemNo: '0070', component: 'I9JH1022K', material: 'I9JH1022K', description: 'Gasket Neoprene High-Temp', quantity: '1.000', unit: 'PC', itemCategory: 'L', storageLocation: '0001', level: 1, hasSubBom: false, validFrom: '2026-01-01' },
  { id: 8, itemNo: '0080', component: 'J0KH1123L', material: 'J0KH1123L', description: 'Stator Assembly 240V 50Hz', quantity: '1.000', unit: 'PC', itemCategory: 'L', storageLocation: '0001', level: 1, hasSubBom: true, validFrom: '2026-01-01' },
  { id: 9, itemNo: '0090', component: 'K1LH1224M', material: 'K1LH1224M', description: 'Copper Wire Spool 0.8mm', quantity: '150.000', unit: 'M', itemCategory: 'L', storageLocation: '0001', level: 2, hasSubBom: false, validFrom: '2026-01-01' },
  { id: 10, itemNo: '0100', component: 'L2MH1325N', material: 'L2MH1325N', description: 'Insulation Paper Nomex 0.25', quantity: '12.000', unit: 'M2', itemCategory: 'L', storageLocation: '0001', level: 2, hasSubBom: false, validFrom: '2026-01-01' },
  { id: 11, itemNo: '0110', component: 'M3NH1426O', material: 'M3NH1426O', description: 'Rotor Core Silicon Steel', quantity: '1.000', unit: 'PC', itemCategory: 'L', storageLocation: '0001', level: 1, hasSubBom: false, validFrom: '2026-01-01' },
  { id: 12, itemNo: '0120', component: 'N4OH1527P', material: 'N4OH1527P', description: 'Deep Groove Ball Bearing 6205', quantity: '2.000', unit: 'PC', itemCategory: 'L', storageLocation: '0001', level: 1, hasSubBom: false, validFrom: '2026-01-01' },
  { id: 13, itemNo: '0130', component: 'O5PH1628Q', material: 'O5PH1628Q', description: 'Terminal Box Enclosure IP66', quantity: '1.000', unit: 'PC', itemCategory: 'L', storageLocation: '0001', level: 1, hasSubBom: false, validFrom: '2026-01-01' },
  { id: 14, itemNo: '0140', component: 'P6QH1729R', material: 'P6QH1729R', description: 'Cable Gland M20 Brass Nickel', quantity: '3.000', unit: 'PC', itemCategory: 'L', storageLocation: '0001', level: 2, hasSubBom: false, validFrom: '2026-01-01' },
  { id: 15, itemNo: '0150', component: 'Q7RH1830S', material: 'Q7RH1830S', description: 'Grounding Screw Brass M5', quantity: '2.000', unit: 'PC', itemCategory: 'L', storageLocation: '0001', level: 2, hasSubBom: false, validFrom: '2026-01-01' },
  { id: 16, itemNo: '0160', component: 'R8SH1931T', material: 'R8SH1931T', description: 'Nameplate Aluminum Anodized', quantity: '1.000', unit: 'PC', itemCategory: 'L', storageLocation: '0001', level: 1, hasSubBom: false, validFrom: '2026-01-01' }
];

export const mockBomExplorerData = {
  success: true,
  material: 'A1BH0214C',
  plant: '1010',
  usage: '1',
  alternative: '01',
  header: {
    bomNumber: '00001001',
    stlnr: '00001001',
    alternative: '01',
    stlal: '01',
    baseQty: '1',
    baseUnit: 'PC',
    material: 'A1BH0214C',
    plant: '1010',
    usage: '1',
    description: 'Main Drive Motor Housing'
  },
  components: sample16Components,
  bom: {
    material: 'A1BH0214C',
    plant: '1010',
    alternative: '01',
    usage: '1',
    description: 'Main Drive Motor Housing',
    components: sample16Components
  }
};

/**
 * Setup route interception for a Playwright page.
 */
export async function setupMocks(page, { authenticated = true, user = mockAdminUser, servers = mockServers, unmockedRequestsCollector = [] } = {}) {
  // Setup initial token before navigation
  await page.addInitScript(({ isAuth }) => {
    if (isAuth) {
      localStorage.setItem('sb_token', 'mock-valid-bearer-token');
    } else {
      localStorage.removeItem('sb_token');
    }
    try {
      localStorage.removeItem('selected_server_id');
    } catch (_) {}
  }, { isAuth: authenticated });

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

    // 4. Logout & Password Change
    if (url.includes('/api/auth/logout')) {
      return respondJson({ success: true });
    }
    if (url.includes('/api/auth/change-password')) {
      return respondJson({ success: true, message: 'Password changed successfully.' });
    }

    // 5. Servers
    if (url.includes('/api/servers/available') || url.includes('/api/servers')) {
      if (url.includes('/modules')) {
        return respondJson({ modules: ['bom', 'admin'] });
      }
      if (url.includes('/test')) {
        return respondJson({ success: true, message: 'Connection test successful.', type: 'Sandbox', responseTimeMs: 42 });
      }
      if (method === 'POST') {
        const body = request.postDataJSON() || {};
        const created = { id: `srv-${Date.now()}`, ...body, type: 'Sandbox', environment: 'Sandbox', is_default: true };
        return respondJson({ success: true, server: created }, 201);
      }
      const serverList = servers !== undefined ? servers : mockServers;
      return respondJson({ success: true, servers: serverList, data: serverList });
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

    // 11b. BOM Change
    if (url.includes('/api/bom/change')) {
      let postData = {};
      try { postData = request.postDataJSON() || {}; } catch {}
      const items = postData.items || [];
      const modifiedCount = items.filter(i => i.changeType === 'CHANGE').length;
      const addedCount = items.filter(i => i.changeType === 'ADD').length;
      const deletedCount = items.filter(i => i.changeType === 'DELETE').length;

      return respondJson({
        success: true,
        verified: true,
        code: 'OK',
        material: postData.material || 'A1BH0214C',
        plant: postData.plant || '1010',
        bomUsage: postData.bomUsage || '1',
        alternativeBom: postData.alternativeBom || '01',
        summary: {
          headerChanged: Boolean(postData.header && Object.keys(postData.header).length > 0),
          itemsModified: modifiedCount,
          itemsAdded: addedCount,
          itemsDeleted: deletedCount,
          totalComponentsAfter: Math.max(1, 16 - deletedCount + addedCount)
        },
        components: [
          { item: '0010', itemNode: '00000001', component: 'P1GH1215A', description: 'Modified part', quantity: 25, unit: 'PC', storageLocation: '0001', itemText: 'Updated quantity' },
          { item: '0020', itemNode: '00000002', component: 'RAW-NEW-99', description: 'Newly added part', quantity: 5, unit: 'EA', storageLocation: '0001', itemText: 'New component' }
        ],
        message: `BOM changed and verified successfully (${modifiedCount} modified, ${addedCount} added, ${deletedCount} deleted)`
      });
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
    if (url.includes('/api/admin/users/') && url.includes('/reset-password')) {
      return respondJson({ success: true, message: 'Password reset successfully.', initialPassword: 'TempInitialPass99!' });
    }
    if (url.includes('/api/admin/users/') && url.includes('/status')) {
      return respondJson({ success: true, message: 'User status updated.' });
    }
    if (url.includes('/api/admin/users')) {
      if (method === 'POST') {
        const body = request.postDataJSON() || {};
        return respondJson({
          success: true,
          user: { id: `user-${Date.now()}`, email: body.email, role: body.role || 'user', must_change_password: true },
          initialPassword: 'TempInitialPass99!'
        }, 201);
      }
      return respondJson({ success: true, data: mockAdminUsers, users: mockAdminUsers });
    }

    // 15b. Admin Server Allowlist
    if (url.includes('/api/admin/allowlist')) {
      if (method === 'POST') {
        const postData = request.postDataJSON() || {};
        const newEntry = {
          id: `al-${Date.now()}`,
          pattern: postData.pattern || '192.168.1.0/24',
          type: postData.type || 'Sandbox',
          comment: postData.comment || 'Test rule',
          created_at: new Date().toISOString()
        };
        return respondJson(newEntry, 201);
      }
      if (method === 'DELETE') {
        return respondJson({ success: true });
      }
      return respondJson(mockAllowlist);
    }

    // 16. Admin Servers
    if (url.includes('/api/admin/servers')) {
      return respondJson({ success: true, data: mockServers, servers: mockServers });
    }

    // 16c. User-Owned Servers (/api/servers)
    if (url.includes('/api/servers') && !url.includes('/api/admin/servers')) {
      if (url.includes('/test')) {
        return respondJson({ success: true, message: 'Connection test successful.', environment: 'Sandbox', responseTimeMs: 42 });
      }
      if (method === 'POST') {
        const body = request.postDataJSON() || {};
        const created = { id: `srv-${Date.now()}`, ...body, environment: 'Sandbox', is_default: false };
        return respondJson({ success: true, server: created }, 201);
      }
      return respondJson({ success: true, servers });
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

    if (url.includes('/api/bom-jobs/active') || url.includes('/api/bom/jobs/active')) {
      return respondJson({ success: false, job: null });
    }

    if (url.includes('/api/bom-jobs/') || url.includes('/api/bom/jobs/')) {
      const isPreflight = activeMockJobType === 'create_preflight';
      const bulkMaterials = [
        'A1BH0214C', 'B2CH0315D', 'C3DH0416E', 'D4EH0517F', 'E5FH0618G',
        'F6GH0719H', 'G7HH0820I', 'H8IH0921J', 'I9JH1022K', 'J0KH1123L',
        'K1LH1224M', 'L2MH1325N', 'M3NH1426O', 'N4OH1527P'
      ];
      const jobResults = bulkMaterials.map((mat, idx) => ({
        sequenceNum: String(idx + 1),
        material: mat,
        plant: '1010',
        bomUsage: '1',
        alternativeBom: '01',
        bomNumber: isPreflight ? undefined : `000010${String(idx + 1).padStart(2, '0')}`,
        status: isPreflight ? 'Ready' : 'SUCCESS',
        message: isPreflight ? 'Ready for creation' : 'Created successfully',
        messageType: 'success',
        type: 'success',
        componentsCount: (idx % 3) + 1
      }));

      return respondJson({
        success: true,
        job: {
          id: 'mock-job-001',
          type: activeMockJobType,
          status: 'COMPLETED',
          processed: jobResults.length,
          total: jobResults.length,
          successCount: jobResults.length,
          failedCount: 0,
          skippedCount: 0,
          notProcessedCount: 0,
          results: jobResults
        }
      });
    }

    // 21. Batch validate and copy
    if (url.includes('/api/boms/batch-validate') || url.includes('/api/bom/batch-validate')) {
      return respondJson({
        success: true,
        summary: { total: 2, valid: 2, invalid: 0, warnings: 0 },
        results: [
          { id: 1, sourceMaterial: 'A1BH0214C', sourcePlant: '1010', sourceUsage: '1', sourceAltBom: '01', targetMaterial: 'A1BH0214C', targetPlant: '1001', targetUsage: '1', targetAltBom: '02', status: 'VALID', message: 'Ready to copy', messageType: 'success', type: 'success' },
          { id: 2, sourceMaterial: 'B2CH0315D', sourcePlant: '1010', sourceUsage: '1', sourceAltBom: '01', targetMaterial: 'B2CH0315D', targetPlant: '1001', targetUsage: '1', targetAltBom: '02', status: 'VALID', message: 'Ready to copy', messageType: 'success', type: 'success' }
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
          { id: 1, sourceMaterial: 'A1BH0214C', sourcePlant: '1010', targetMaterial: 'A1BH0214C', targetPlant: '1001', status: 'SUCCESS', bomNumber: '00001001', message: 'Copied successfully', messageType: 'success', type: 'success' },
          { id: 2, sourceMaterial: 'B2CH0315D', sourcePlant: '1010', targetMaterial: 'B2CH0315D', targetPlant: '1001', status: 'SUCCESS', bomNumber: '00001002', message: 'Copied successfully', messageType: 'success', type: 'success' }
        ]
      });
    }

    // Catch-all for any other unmocked /api/ endpoints to prevent failures
    unmockedRequestsCollector.push(`Unmocked endpoint caught: ${method} ${url}`);
    return respondJson({ success: true, data: [] });
  });
}
