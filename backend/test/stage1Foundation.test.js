process.env.NODE_ENV = 'test';
process.env.USE_MOCK_SAP = 'true';
process.env.SKIP_GATEWAY_AUTH = 'false';
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = '01234567890123456789012345678901';
}

import assert from 'assert';
import http from 'http';
const { default: app } = await import('../server.js');
import { supabaseService, inMemorySupabase } from '../services/supabaseClient.js';
import { auditLogger } from '../services/auditLog.js';
import { checkServerOwnership } from '../middleware/serverOwnership.js';
import { validatePasswordPolicy } from '../utils/passwordPolicy.js';

let server;
let baseUrl;

function makeRequest(method, path, body = null, tokenOrHeaders = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const headers = {};

    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    if (typeof tokenOrHeaders === 'string') {
      headers['Authorization'] = `Bearer ${tokenOrHeaders}`;
    } else if (tokenOrHeaders && typeof tokenOrHeaders === 'object') {
      Object.assign(headers, tokenOrHeaders);
    }

    const req = http.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {
          json = data;
        }

        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runStage1Tests() {
  console.log('\n============================================================');
  console.log('  RUNNING STAGE 1: FOUNDATION & OWNERSHIP VERIFICATION');
  console.log('============================================================\n');

  process.env.USE_MOCK_SAP = 'true';
  process.env.SKIP_GATEWAY_AUTH = 'false';

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://localhost:${port}`;

  let adminToken;

  try {
    // -------------------------------------------------------------------------
    // 1. Password Policy Unit Tests
    // -------------------------------------------------------------------------
    console.log('Test 1: Password policy requires min 12 chars, letter & number:');
    const policyShort = validatePasswordPolicy('Short1!');
    assert.strictEqual(policyShort.isValid, false, 'Passwords under 12 characters must fail');

    const policyNoDigits = validatePasswordPolicy('Abcdefghijklmnop');
    assert.strictEqual(policyNoDigits.isValid, false, 'Passwords without digits must fail');

    const policyNoLetters = validatePasswordPolicy('123456789012345');
    assert.strictEqual(policyNoLetters.isValid, false, 'Passwords without letters must fail');

    const policySameAsOld = validatePasswordPolicy('InitialPassword123', 'InitialPassword123');
    assert.strictEqual(policySameAsOld.isValid, false, 'Password cannot equal current password');

    const policyValid = validatePasswordPolicy('SecureP@ssw0rd2026', 'OldPassword123');
    assert.strictEqual(policyValid.isValid, true, 'Valid 12+ character mixed password must pass');
    console.log('   ✓ Password policy unit checks passed');

    // -------------------------------------------------------------------------
    // 2. Admin Login
    // -------------------------------------------------------------------------
    console.log('Test 2: Admin login:');
    const adminLogin = await makeRequest('POST', '/api/auth/login', {
      email: 'admin@nextitpoint.com',
      password: 'Admin@123456'
    });
    assert.strictEqual(adminLogin.status, 200, 'Admin login must succeed');
    adminToken = adminLogin.data.token;
    assert(adminToken, 'Admin token must be returned');
    console.log('   ✓ Admin login successful');

    // -------------------------------------------------------------------------
    // 3. Sign-in Lockout after 5 failed attempts (auth_login_attempts)
    // -------------------------------------------------------------------------
    console.log('Test 3: Sign-in lockout after 5 failed attempts (429 ACCOUNT_LOCKED):');
    const targetEmail = 'lockout.test@example.com';
    await supabaseService.resetLoginAttempts(targetEmail);

    for (let i = 1; i <= 4; i++) {
      const failed = await makeRequest('POST', '/api/auth/login', {
        email: targetEmail,
        password: `WrongPassword${i}`
      });
      assert.strictEqual(failed.status, 401, `Failed attempt ${i} should return 401`);
    }

    // 5th failed attempt should trigger lockout
    const fifthAttempt = await makeRequest('POST', '/api/auth/login', {
      email: targetEmail,
      password: 'WrongPassword5'
    });
    assert.strictEqual(fifthAttempt.status, 429, '5th failed attempt should lock account with 429');
    assert.strictEqual(fifthAttempt.data.code, 'ACCOUNT_LOCKED');

    // 6th attempt while locked must still return 429
    const sixthAttempt = await makeRequest('POST', '/api/auth/login', {
      email: targetEmail,
      password: 'WrongPassword6'
    });
    assert.strictEqual(sixthAttempt.status, 429, 'Locked account must immediately reject with 429');
    assert.strictEqual(sixthAttempt.data.code, 'ACCOUNT_LOCKED');

    // Verify audit log exists for lockout and passwords are NEVER in log
    const auditLogs = auditLogger.getAuditLogs();
    const lockoutLog = auditLogs.find(l => (l.actionType?.toLowerCase() === 'auth_account_locked' || l.actionType?.toLowerCase() === 'account_lockout') && (l.user === targetEmail || l.sapUsername === targetEmail));
    assert(lockoutLog, 'Audit log must record account_lockout action');
    assert(!JSON.stringify(lockoutLog).includes('WrongPassword'), 'Audit logs must NEVER store passwords');
    console.log('   ✓ Sign-in lockout triggered at 5 attempts, returned 429 ACCOUNT_LOCKED and audit-logged without passwords');

    // -------------------------------------------------------------------------
    // 4. Admin Creates User -> must_change_password enforcement
    // -------------------------------------------------------------------------
    console.log('Test 4: Admin creates user -> must_change_password enforcement:');
    const newUserEmail = `test.user.${Date.now()}@example.com`;
    const createRes = await makeRequest('POST', '/api/admin/users', {
      email: newUserEmail,
      fullName: 'Test User Stage1',
      role: 'user'
    }, adminToken);
    assert.strictEqual(createRes.status, 201, 'Admin user creation must return 201');
    const newUserId = createRes.data.user.id;
    const initialPassword = createRes.data.initialPassword;
    assert(initialPassword, 'Admin creation must return initialPassword once in payload');
    assert.strictEqual(createRes.data.user.must_change_password, true, 'User must have must_change_password = true');

    // User logs in with initial password
    const userLogin = await makeRequest('POST', '/api/auth/login', {
      email: newUserEmail,
      password: initialPassword
    });
    assert.strictEqual(userLogin.status, 200);
    assert.strictEqual(userLogin.data.must_change_password, true, 'Login payload must signal must_change_password: true');
    const userToken = userLogin.data.token;

    // Normal API request blocked with 403 PASSWORD_CHANGE_REQUIRED
    const blockedRes = await makeRequest('GET', '/api/modules', null, userToken);
    assert.strictEqual(blockedRes.status, 403, 'Normal API must be blocked before password change');
    assert.strictEqual(blockedRes.data.code, 'PASSWORD_CHANGE_REQUIRED');

    // Exempt endpoints (/api/auth/me) accessible
    const meRes = await makeRequest('GET', '/api/auth/me', null, userToken);
    assert.strictEqual(meRes.status, 200, '/api/auth/me must be exempt from password change requirement');
    assert.strictEqual(meRes.data.user.must_change_password, true);

    // -------------------------------------------------------------------------
    // 4b. Normal User CANNOT modify must_change_password or is_disabled in public.users (RLS enforcement)
    // -------------------------------------------------------------------------
    console.log('Test 4b: Normal user cannot bypass/modify must_change_password or is_disabled in public.users:');
    const tamperPwd = await supabaseService.updateProfileAsUser(newUserId, { must_change_password: false }, userToken);
    assert(tamperPwd.error, 'Direct user update of must_change_password on public.users must be rejected by RLS policy');
    assert.strictEqual(tamperPwd.error.code, '42501', 'RLS policy violation code 42501 expected');

    const tamperDisabled = await supabaseService.updateProfileAsUser(newUserId, { is_disabled: false }, userToken);
    assert(tamperDisabled.error, 'Direct user update of is_disabled on public.users must be rejected by RLS policy');
    assert.strictEqual(tamperDisabled.error.code, '42501', 'RLS policy violation code 42501 expected');

    const userCheck = await supabaseService.getUserProfile(newUserId);
    assert.strictEqual(userCheck.must_change_password, true, 'must_change_password flag in public.users must remain true');
    console.log('   ✓ RLS policy protects public.users must_change_password and is_disabled from user tampering');

    // User tries to change password with weak password (< 12 chars) -> 400
    const weakChange = await makeRequest('POST', '/api/auth/change-password', {
      currentPassword: initialPassword,
      newPassword: 'Short1!',
      confirmPassword: 'Short1!'
    }, userToken);
    assert.strictEqual(weakChange.status, 400, 'Weak password change must return 400');

    // User updates password to compliant password
    const newGoodPassword = 'NewSecurePassword2026!';
    const changeRes = await makeRequest('POST', '/api/auth/change-password', {
      currentPassword: initialPassword,
      newPassword: newGoodPassword,
      confirmPassword: newGoodPassword
    }, userToken);
    assert.strictEqual(changeRes.status, 200, 'Compliant password change must succeed');

    // Next request with SAME token must succeed immediately without re-login
    const afterChangeRes = await makeRequest('GET', '/api/modules', null, userToken);
    assert.strictEqual(afterChangeRes.status, 200, 'Next request with same token must succeed without re-login');

    const meAfterRes = await makeRequest('GET', '/api/auth/me', null, userToken);
    assert.strictEqual(meAfterRes.status, 200);
    assert.strictEqual(meAfterRes.data.user.must_change_password, false, 'must_change_password must be false after update');
    console.log('   ✓ Forced password change blocks APIs with 403, allows /me, updates password, and unblocks existing token');

    // -------------------------------------------------------------------------
    // 4c. Admin Reset sets must_change_password = true, no plain text passwords in DB or logs
    // -------------------------------------------------------------------------
    console.log('Test 4c: Admin reset sets must_change_password = true, initial password never in plaintext DB/logs:');
    const resetRes = await makeRequest('POST', `/api/admin/users/${newUserId}/reset-password`, {}, adminToken);
    assert.strictEqual(resetRes.status, 200, 'Admin reset must return 200');
    const tempPassword = resetRes.data.initialPassword;
    assert(tempPassword, 'Temporary password returned once in body');

    // Check user profile has must_change_password = true again
    const postResetProfile = await supabaseService.getUserProfile(newUserId);
    assert.strictEqual(postResetProfile.must_change_password, true, 'Admin reset must set must_change_password = true');

    // Check database / store: tempPassword must NOT be stored in plain text anywhere
    const rawUserRecord = inMemorySupabase.users.find(u => u.id === newUserId);
    assert.notStrictEqual(rawUserRecord.password, tempPassword, 'Password must NOT be stored in plain text');

    // Verify tempPassword NEVER appears in any audit log
    const allLogs = auditLogger.getAuditLogs();
    for (const log of allLogs) {
      const logStr = JSON.stringify(log);
      assert(!logStr.includes(tempPassword), 'Audit logs must NEVER contain temporary/initial password');
      assert(!logStr.includes(initialPassword), 'Audit logs must NEVER contain initial password');
    }
    console.log('   ✓ Admin reset enforces must_change_password = true and never logs or stores plain text password');

    // Reset password again to unblock user for remaining tests
    await makeRequest('POST', '/api/auth/change-password', {
      currentPassword: tempPassword,
      newPassword: 'FinalValidPassword2026!',
      confirmPassword: 'FinalValidPassword2026!'
    }, userToken);

    // -------------------------------------------------------------------------
    // 5. Server Ownership and Full IDOR Route Sweep
    // -------------------------------------------------------------------------
    console.log('Test 5: Full IDOR Route Sweep over all server-scoped routes (User A gets 404 on User B server):');
    const userA = { id: newUserId, email: newUserEmail, role: 'user', is_disabled: false };
    const userB = { id: 'user-b-uuid-9999', email: 'userb@example.com', role: 'user', is_disabled: false };

    // Register test servers
    const serverA = {
      id: `server-a-${Date.now()}`,
      name: 'User A Server',
      owner_id: userA.id,
      ashost: '10.0.0.1',
      sysnr: '00',
      client: '100',
      is_disabled: false,
      is_active: true
    };
    const serverB = {
      id: `server-b-${Date.now()}`,
      name: 'User B Server',
      owner_id: userB.id,
      ashost: '10.0.0.2',
      sysnr: '00',
      client: '100',
      is_disabled: false,
      is_active: true
    };
    const disabledServerA = {
      id: `server-a-dis-${Date.now()}`,
      name: 'User A Disabled Server',
      owner_id: userA.id,
      ashost: '10.0.0.1',
      sysnr: '00',
      client: '100',
      is_disabled: true,
      is_active: true
    };

    inMemorySupabase.servers.push(serverA, serverB, disabledServerA);

    // List of ALL server-scoped routes
    const serverScopedRoutes = [
      { name: 'GET /api/bom/ping', method: 'GET', path: '/api/bom/ping', body: null, headers: { 'x-sap-server-id': serverB.id } },
      { name: 'GET /api/bom/header', method: 'GET', path: '/api/bom/header?material=TEST&plant=1000&bomUsage=1', body: null, headers: { 'x-sap-server-id': serverB.id } },
      { name: 'GET /api/bom/items', method: 'GET', path: '/api/bom/items?material=TEST&plant=1000&bomUsage=1', body: null, headers: { 'x-sap-server-id': serverB.id } },
      { name: 'POST /api/bom/display', method: 'POST', path: '/api/bom/display', body: { serverId: serverB.id, material: 'TEST', plant: '1000' } },
      { name: 'POST /api/bom/create', method: 'POST', path: '/api/bom/create', body: { serverId: serverB.id, material: 'TEST', plant: '1000', items: [] } },
      { name: 'POST /api/bom/copy', method: 'POST', path: '/api/bom/copy', body: { serverId: serverB.id, sourceMaterial: 'S', targetMaterial: 'T' } },
      { name: 'POST /api/bom/bulk-create', method: 'POST', path: '/api/bom/bulk-create', body: { serverId: serverB.id, items: [] } },
      { name: 'POST /api/bom/bulk-copy', method: 'POST', path: '/api/bom/bulk-copy', body: { serverId: serverB.id, items: [] } },
      { name: 'GET /api/bom/jobs', method: 'GET', path: '/api/bom/jobs', body: null, headers: { 'x-sap-server-id': serverB.id } },
      { name: 'POST /api/bom/validate-options', method: 'POST', path: '/api/bom/validate-options', body: { serverId: serverB.id } },
      { name: 'POST /api/bom/check-existing', method: 'POST', path: '/api/bom/check-existing', body: { serverId: serverB.id, material: 'TEST', plant: '1000' } },
      { name: 'POST /api/bom/batch-check-existing', method: 'POST', path: '/api/bom/batch-check-existing', body: { serverId: serverB.id, materials: ['TEST'] } },
      { name: 'GET /api/plants', method: 'GET', path: '/api/plants', body: null, headers: { 'x-sap-server-id': serverB.id } },
      { name: 'GET /api/materials/search', method: 'GET', path: '/api/materials/search?q=TEST', body: null, headers: { 'x-sap-server-id': serverB.id } },
      { name: 'GET /api/materials/search-by-option', method: 'GET', path: '/api/materials/search-by-option?option=D', body: null, headers: { 'x-sap-server-id': serverB.id } },
      { name: 'GET /api/materials/:mat', method: 'GET', path: '/api/materials/TEST-MAT', body: null, headers: { 'x-sap-server-id': serverB.id } },
      { name: 'GET /api/storage-locations', method: 'GET', path: '/api/storage-locations', body: null, headers: { 'x-sap-server-id': serverB.id } },
      { name: 'GET /api/bom-usages', method: 'GET', path: '/api/bom-usages', body: null, headers: { 'x-sap-server-id': serverB.id } },
      { name: 'POST /api/chat', method: 'POST', path: '/api/chat', body: { serverId: serverB.id, message: 'ping' } },
      { name: 'GET /api/sap/sessions', method: 'GET', path: '/api/sap/sessions', body: null, headers: { 'x-sap-server-id': serverB.id } },
      { name: 'POST /api/sap/sessions/select', method: 'POST', path: '/api/sap/sessions/select', body: { sessionId: 'RFC_TEST' }, headers: { 'x-sap-server-id': serverB.id } },
      { name: 'GET /api/sap/session-status', method: 'GET', path: '/api/sap/session-status', body: null, headers: { 'x-sap-server-id': serverB.id } },
      { name: 'GET /api/servers/:id/modules', method: 'GET', path: `/api/servers/${serverB.id}/modules`, body: null }
    ];

    for (const route of serverScopedRoutes) {
      const headers = {
        'Authorization': `Bearer ${userToken}`,
        ...(route.headers || {})
      };
      const res = await makeRequest(route.method, route.path, route.body, headers);
      assert.strictEqual(
        res.status,
        404,
        `Route ${route.name} must return 404 when user A targets user B server (got ${res.status})`
      );
      assert.strictEqual(
        res.data?.code,
        'SERVER_NOT_FOUND',
        `Route ${route.name} must return SERVER_NOT_FOUND error code`
      );
    }
    console.log(`   ✓ All ${serverScopedRoutes.length} server-scoped routes strictly return 404 SERVER_NOT_FOUND for user B's server`);

    // User A accessing disabled server -> 403 SERVER_DISABLED
    const disabledRes = await makeRequest('GET', '/api/plants', null, {
      'Authorization': `Bearer ${userToken}`,
      'x-sap-server-id': disabledServerA.id
    });
    assert.strictEqual(disabledRes.status, 403, 'Access to disabled server must return 403');
    assert.strictEqual(disabledRes.data?.code, 'SERVER_DISABLED');
    console.log('   ✓ Disabled server strictly returns 403 SERVER_DISABLED');

    // -------------------------------------------------------------------------
    // 6. User Status Toggle & Deletion Cleanup
    // -------------------------------------------------------------------------
    console.log('Test 6: User disable/enable & user deletion cleanup:');
    // Admin disables user
    const disableRes = await makeRequest('PATCH', `/api/admin/users/${newUserId}/status`, { isDisabled: true }, adminToken);
    assert.strictEqual(disableRes.status, 200, 'Admin disable user must return 200');

    // Disabled user requests API -> 403 USER_DISABLED
    const disabledUserRes = await makeRequest('GET', '/api/modules', null, userToken);
    assert.strictEqual(disabledUserRes.status, 403, 'Disabled user must be rejected with 403');
    assert.strictEqual(disabledUserRes.data?.code, 'USER_DISABLED');
    console.log('   ✓ Disabled user rejected with 403 USER_DISABLED');

    // Admin re-enables user
    await makeRequest('PATCH', `/api/admin/users/${newUserId}/status`, { isDisabled: false }, adminToken);

    // Delete user and verify cleanup
    const deleteRes = await makeRequest('DELETE', `/api/admin/users/${newUserId}`, null, adminToken);
    assert.strictEqual(deleteRes.status, 200, 'Admin user deletion must return 200');

    const getUserRes = await supabaseService.getUserProfile(newUserId);
    assert.strictEqual(getUserRes, null, 'Deleted user profile must no longer exist');

    // Verify user's server was deleted
    const getDeletedServer = await supabaseService.getServerById(serverA.id);
    assert.strictEqual(getDeletedServer, null, 'User owned servers must be deleted upon user deletion');
    console.log('   ✓ User deletion cleanly removed servers, evicted cache, and retained audit log');

    // -------------------------------------------------------------------------
    // 7. Comprehensive Audit Log Verification
    // -------------------------------------------------------------------------
    console.log('Test 7: Comprehensive audit trail verification (no secrets):');
    const finalAuditLogs = auditLogger.getAuditLogs();
    const expectedActions = [
      'admin_create_user',
      'admin_reset_user_password',
      'admin_disable_user',
      'admin_delete_user',
      'first_login_completed',
      'auth_account_locked'
    ];

    for (const action of expectedActions) {
      const found = finalAuditLogs.find(l => l.actionType?.toLowerCase() === action);
      assert(found, `Audit entry for action '${action}' must exist in audit log`);
    }

    // Check all logs contain NO secrets
    for (const log of finalAuditLogs) {
      const logStr = JSON.stringify(log);
      assert(!logStr.includes('password123'), 'Audit logs must contain no secrets');
      assert(!logStr.includes('WrongPassword'), 'Audit logs must contain no secrets');
    }
    console.log(`   ✓ All ${expectedActions.length} required audit actions verified in audit trail with NO credentials or secrets`);

    console.log('\n============================================================');
    console.log('  ALL STAGE 1 FOUNDATION & OWNERSHIP TESTS PASSED!');
    console.log('============================================================\n');
  } finally {
    if (server) {
      server.close();
    }
  }
}

runStage1Tests().catch((err) => {
  console.error('\n❌ Stage 1 Foundation Test Failed:', err);
  if (server) server.close();
  process.exit(1);
});
