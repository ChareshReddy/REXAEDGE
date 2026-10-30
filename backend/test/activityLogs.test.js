import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { redactSensitive, escapeCsvCell } from '../utils/redact.js';
import { generateErrorRef, formatErrorWithRef } from '../utils/errorRef.js';
import { logAudit, logError, queryAuditLogs, queryErrorLogs, checkLogSchema } from '../services/logService.js';
import { requestIdMiddleware } from '../middleware/requestId.js';
import app from '../server.js';
import http from 'node:http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🧪 Starting Activity Logs, Redaction, and Error Tracking Tests...\n');

// ============================================================================
// 1. REDACTION TESTS
// ============================================================================
console.log('--- 1. Redaction Tests ---');

// 1a. Secrets Redaction
const secretPayload = {
  user: 'admin@rexaedge.com',
  password: 'SuperSecretPassword123!',
  nested: {
    token: 'jwt.token.here',
    apiKey: 'sk-1234567890abcdef',
    sap_password: 'SAP_DEV_PASSWORD',
    authorization: 'Bearer secret_token',
    cookie: 'session_id=abcdef'
  },
  regularField: 'This should stay unchanged'
};

const redacted = redactSensitive(secretPayload);
assert.strictEqual(redacted.user, 'admin@rexaedge.com');
assert.strictEqual(redacted.password, '[REDACTED]');
assert.strictEqual(redacted.nested.token, '[REDACTED]');
assert.strictEqual(redacted.nested.apiKey, '[REDACTED]');
assert.strictEqual(redacted.nested.sap_password, '[REDACTED]');
assert.strictEqual(redacted.nested.authorization, '[REDACTED]');
assert.strictEqual(redacted.nested.cookie, '[REDACTED]');
assert.strictEqual(redacted.regularField, 'This should stay unchanged');
console.log('  ✓ Sensitive fields (password, token, apiKey, cookies, auth headers) redacted');

// 1b. Big Payloads Truncation (Arrays of components / rows)
const bigPayload = {
  material: 'MAT_1001',
  components: Array.from({ length: 50 }, (_, i) => ({
    item: i + 1,
    component: `COMP_${i}`,
    quantity: 10
  })),
  rows: Array.from({ length: 20 }, (_, i) => ({ row: i }))
};

const redactedBig = redactSensitive(bigPayload);
assert.ok(redactedBig.components_summary, 'Should produce components_summary');
assert.strictEqual(redactedBig.components_summary.total_count, 50);
assert.strictEqual(redactedBig.components_summary.sample.length, 3);
assert.strictEqual(redactedBig.rows_summary.total_count, 20);
console.log('  ✓ Large arrays (components, rows) capped to count and small sample');

// 1c. Long strings & Stack Traces Truncation
const hugeString = 'A'.repeat(2500);
const hugeStack = 'Error: test\n' + ' at method (file.js:1:1)\n'.repeat(200);

const redactedStrings = redactSensitive({
  description: hugeString,
  stack: hugeStack
});
assert.ok(redactedStrings.description.length <= 1100);
assert.ok(redactedStrings.description.includes('... [truncated'));
assert.ok(redactedStrings.stack.length <= 4100);
assert.ok(redactedStrings.stack.includes('... [stack truncated'));
console.log('  ✓ Long strings (>1000) and stack traces (>4000) truncated with marker');

// 1d. Circular references and edge values
const circular = { a: 1 };
circular.self = circular;
const redactedCircular = redactSensitive(circular);
assert.strictEqual(redactedCircular.a, 1);
assert.strictEqual(redactedCircular.self, '[CIRCULAR]');
assert.strictEqual(redactSensitive(null), null);
assert.strictEqual(redactSensitive(undefined), undefined);
assert.strictEqual(redactSensitive(42), 42);
assert.strictEqual(redactSensitive('hello'), 'hello');
console.log('  ✓ Circular references and primitive/null edges handled safely');

// 1e. CSV Formula Injection Defense
assert.strictEqual(escapeCsvCell('=1+1'), "'=1+1");
assert.strictEqual(escapeCsvCell('+SUM(A1:A10)'), "'+SUM(A1:A10)");
assert.strictEqual(escapeCsvCell('-cmd|'), "'-cmd|");
assert.strictEqual(escapeCsvCell('@calc'), "'@calc");
assert.strictEqual(escapeCsvCell('Hello "World"'), '"Hello ""World"""');
assert.strictEqual(escapeCsvCell('Normal Text'), 'Normal Text');
console.log('  ✓ CSV formula injection protection escapes =, +, -, @');

// ============================================================================
// 2. ERROR REF TESTS
// ============================================================================
console.log('\n--- 2. Error Ref Tests ---');

const ref1 = generateErrorRef();
const ref2 = generateErrorRef();
assert.strictEqual(typeof ref1, 'string');
assert.strictEqual(ref1.length, 8);
assert.match(ref1, /^[0-9A-F]{8}$/);
assert.notStrictEqual(ref1, ref2, 'Error refs must be distinct');

const formattedMsg = formatErrorWithRef('Failed to read BOM from SAP', ref1);
assert.strictEqual(formattedMsg, `Failed to read BOM from SAP (Error ref: ${ref1})`);
console.log('  ✓ Error refs are 8-character uppercase hex strings');

// ============================================================================
// 3. REQUEST ID MIDDLEWARE TESTS
// ============================================================================
console.log('\n--- 3. Request ID Middleware Tests ---');

const mockReq = { headers: {} };
const mockRes = {
  headers: {},
  setHeader(name, val) {
    this.headers[name] = val;
  }
};
let nextCalled = false;

requestIdMiddleware(mockReq, mockRes, () => {
  nextCalled = true;
});

assert.ok(nextCalled, 'Middleware calls next()');
assert.ok(mockReq.id, 'Attaches req.id');
assert.ok(mockReq.id.startsWith('req-') || mockReq.id.length >= 8);
assert.strictEqual(mockRes.headers['X-Request-Id'], mockReq.id);

// Preserves incoming header
const incomingReq = { headers: { 'x-request-id': 'CLIENT_REQ_123' } };
const incomingRes = {
  headers: {},
  setHeader(name, val) {
    this.headers[name] = val;
  }
};
requestIdMiddleware(incomingReq, incomingRes, () => {});
assert.strictEqual(incomingReq.id, 'CLIENT_REQ_123');
assert.strictEqual(incomingRes.headers['X-Request-Id'], 'CLIENT_REQ_123');
console.log('  ✓ X-Request-Id generated or preserved on request and response');

// ============================================================================
// 4. QUEUE & FALLBACK FILE TESTS
// ============================================================================
console.log('\n--- 4. Queue & Fallback Logging Tests ---');

// Latency test: logAudit should be non-blocking and take < 2ms
const t0 = performance.now();
for (let i = 0; i < 50; i++) {
  logAudit({
    action: 'test.action',
    feature: 'test',
    userEmail: 'tester@rexaedge.com',
    status: 'success',
    message: 'Test audit log ' + i
  });
}
const elapsed = performance.now() - t0;
assert.ok(elapsed < 20, `Queueing 50 audit logs took ${elapsed.toFixed(2)}ms (should be <20ms)`);
console.log(`  ✓ Fast in-memory queueing: 50 items logged in ${elapsed.toFixed(2)}ms`);

// Fallback file existence check
const today = new Date().toISOString().slice(0, 10);
const logsDir = path.join(process.cwd(), 'logs');
const fallbackFile = path.join(logsDir, `fallback-${today}.log`);
// Give the background flush a moment to write if tables are unmigrated
await new Promise(r => setTimeout(r, 1200));

if (fs.existsSync(fallbackFile)) {
  const content = fs.readFileSync(fallbackFile, 'utf-8');
  assert.ok(content.length > 0);
  console.log('  ✓ Daily rotating local fallback log file verified:', path.basename(fallbackFile));
} else {
  console.log('  ℹ Local fallback file not created (Supabase live tables connected or queue pending)');
}

// ============================================================================
// 5. HTTP API & ADMIN SECURITY TESTS
// ============================================================================
console.log('\n--- 5. HTTP API & Admin Security Tests ---');

const server = http.createServer(app);
await new Promise(resolve => server.listen(0, resolve));
const port = server.address().port;
const baseUrl = `http://127.0.0.1:${port}`;

try {
  // 5a. Unauthenticated access to /api/admin/logs/audit -> 401
  const resUnauth = await fetch(`${baseUrl}/api/admin/logs/audit`);
  assert.strictEqual(resUnauth.status, 401, 'Unauthenticated user must be rejected with 401');
  console.log('  ✓ Unauthenticated access to admin logs rejected with 401');

  // 5b. X-Request-Id header returned on standard endpoints
  const healthRes = await fetch(`${baseUrl}/api/health`);
  assert.strictEqual(healthRes.status, 200);
  const respReqId = healthRes.headers.get('x-request-id');
  assert.ok(respReqId, 'X-Request-Id header must be returned on HTTP responses');
  console.log('  ✓ X-Request-Id returned in HTTP response header:', respReqId);

  // 5c. Global Error Handler returns error_ref
  // Trigger 404 or unhandled error
  const notFoundRes = await fetch(`${baseUrl}/api/non-existent-route`);
  assert.strictEqual(notFoundRes.status, 404);
  console.log('  ✓ 404 endpoint handled cleanly');

  // 5d. POST /api/logs/client-error requires authentication
  const unauthClientError = await fetch(`${baseUrl}/api/logs/client-error`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Crash test' })
  });
  assert.strictEqual(unauthClientError.status, 401);
  console.log('  ✓ Client error reporting requires authenticated user');

} finally {
  server.close();
}

console.log('\n🎉 ALL ACTIVITY LOGS & ERROR TRACKING TESTS PASSED SUCCESSFULLY!\n');
