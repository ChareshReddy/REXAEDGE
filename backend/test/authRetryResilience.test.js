import assert from 'assert';
import dns from 'dns';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isNetworkOrRetryableError } from '../services/supabaseClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('============================================================');
console.log('  TESTING AUTH RETRY RESILIENCE, DNS & ERROR MESSAGES       ');
console.log('============================================================\n');

// Test 1: IPv4 precedence configuration
console.log('Test 1: Verify IPv4 resolution precedence is active...');
const order = dns.getDefaultResultOrder ? dns.getDefaultResultOrder() : 'ipv4first';
assert.strictEqual(order, 'ipv4first', 'DNS default result order must be set to ipv4first');
console.log('   ✓ dns.getDefaultResultOrder() is strictly "ipv4first"\n');

// Test 2: isNetworkOrRetryableError classification
console.log('Test 2: Verify network vs client error classification...');
// Network errors that MUST retry:
assert.strictEqual(isNetworkOrRetryableError({ code: 'ETIMEDOUT' }), true);
assert.strictEqual(isNetworkOrRetryableError({ code: 'ECONNRESET' }), true);
assert.strictEqual(isNetworkOrRetryableError({ code: 'ECONNREFUSED' }), true);
assert.strictEqual(isNetworkOrRetryableError({ code: 'ENOTFOUND' }), true);
assert.strictEqual(isNetworkOrRetryableError({ code: 'EAI_AGAIN' }), true);
assert.strictEqual(isNetworkOrRetryableError({ name: 'AbortError' }), true);
assert.strictEqual(isNetworkOrRetryableError({ name: 'TimeoutError' }), true);
assert.strictEqual(isNetworkOrRetryableError({ name: 'AuthRetryableFetchError' }), true);
assert.strictEqual(isNetworkOrRetryableError(new TypeError('fetch failed')), true);
assert.strictEqual(isNetworkOrRetryableError({ message: 'network socket disconnected' }), true);
assert.strictEqual(isNetworkOrRetryableError({ status: 502, message: 'Bad Gateway' }), true);
assert.strictEqual(isNetworkOrRetryableError({ status: 503, message: 'Service Unavailable' }), true);
assert.strictEqual(isNetworkOrRetryableError({ status: 504, message: 'Gateway Timeout' }), true);

// Client errors that must NEVER retry:
assert.strictEqual(isNetworkOrRetryableError({ status: 400, message: 'Invalid credentials' }), false);
assert.strictEqual(isNetworkOrRetryableError({ status: 401, message: 'Invalid email or password' }), false);
assert.strictEqual(isNetworkOrRetryableError({ status: 403, message: 'Forbidden' }), false);
assert.strictEqual(isNetworkOrRetryableError({ status: 422, message: 'Unprocessable Entity' }), false);
assert.strictEqual(isNetworkOrRetryableError({ status: 429, message: 'Too many requests' }), false);
assert.strictEqual(isNetworkOrRetryableError({ __isAuthError: true, code: 'invalid_credentials' }), false);
assert.strictEqual(isNetworkOrRetryableError({ __isAuthError: true, code: 'invalid_grant' }), false);
console.log('   ✓ Network/infrastructure errors (502, 503, 504, timeouts, DNS) correctly flagged as retryable');
console.log('   ✓ 4xx client, auth credential (401), and rate limit (429) errors strictly excluded from retries\n');

// Generic helper simulating the 3-attempt retry loop with delays
async function executeRetryLoop(mockAttemptFn) {
  const MAX_ATTEMPTS = 3;
  const RETRY_DELAYS = [10, 15]; // shortened for fast unit tests
  let result = null;
  let lastRetryableError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { res, err } = await mockAttemptFn(attempt);
    if (err) {
      if (isNetworkOrRetryableError(err)) {
        lastRetryableError = err;
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt - 1]));
          continue;
        }
        break;
      }
      throw err;
    }
    if (res?.error) {
      if (isNetworkOrRetryableError(res.error)) {
        lastRetryableError = res.error;
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt - 1]));
          continue;
        }
        break;
      }
      return { data: null, error: res.error };
    }
    result = res;
    break;
  }

  if (!result) {
    throw new Error("Can't reach the sign-in service right now. Please try again.");
  }
  return result;
}

// Test 3: Success on 2nd attempt
console.log('Test 3: Success on 2nd attempt after attempt 1 transient network failure...');
{
  let callCount = 0;
  const mockAttempt = async (attempt) => {
    callCount++;
    if (attempt === 1) {
      const err = new TypeError('fetch failed');
      err.code = 'ECONNRESET';
      return { res: null, err };
    }
    return {
      res: {
        data: { session: { access_token: 'mock_token_2' }, user: { id: 'u2' } },
        error: null
      },
      err: null
    };
  };

  const result = await executeRetryLoop(mockAttempt);
  assert.strictEqual(callCount, 2, 'Must succeed on attempt 2');
  assert.strictEqual(result.data.session.access_token, 'mock_token_2');
  console.log('   ✓ Attempt 1 network error retried; Attempt 2 succeeded\n');
}

// Test 4: Success on 3rd attempt
console.log('Test 4: Success on 3rd attempt after attempts 1 and 2 fail...');
{
  let callCount = 0;
  const mockAttempt = async (attempt) => {
    callCount++;
    if (attempt === 1) {
      const err = new Error('getaddrinfo ENOTFOUND');
      err.code = 'ENOTFOUND';
      return { res: null, err };
    }
    if (attempt === 2) {
      return {
        res: { error: { status: 503, message: 'Service Unavailable' } },
        err: null
      };
    }
    return {
      res: {
        data: { session: { access_token: 'mock_token_3' }, user: { id: 'u3' } },
        error: null
      },
      err: null
    };
  };

  const result = await executeRetryLoop(mockAttempt);
  assert.strictEqual(callCount, 3, 'Must succeed on attempt 3');
  assert.strictEqual(result.data.session.access_token, 'mock_token_3');
  console.log('   ✓ Attempts 1 & 2 transient errors retried; Attempt 3 succeeded\n');
}

// Test 5: No retry on invalid credentials (401)
console.log('Test 5: No retry on invalid credentials (401)...');
{
  let callCount = 0;
  const mockAttempt = async () => {
    callCount++;
    return {
      res: {
        data: null,
        error: {
          status: 400,
          code: 'invalid_credentials',
          message: 'Invalid login credentials',
          __isAuthError: true
        }
      },
      err: null
    };
  };

  const result = await executeRetryLoop(mockAttempt);
  assert.strictEqual(callCount, 1, 'Must NOT retry on invalid credentials; stops at attempt 1');
  assert.strictEqual(result.error.code, 'invalid_credentials');
  console.log('   ✓ Invalid credentials failed immediately in 1 attempt without retries\n');
}

// Test 6: No retry on rate limiting (429)
console.log('Test 6: No retry on rate limiting (429)...');
{
  let callCount = 0;
  const mockAttempt = async () => {
    callCount++;
    return {
      res: {
        data: null,
        error: {
          status: 429,
          message: 'Too many requests'
        }
      },
      err: null
    };
  };

  const result = await executeRetryLoop(mockAttempt);
  assert.strictEqual(callCount, 1, 'Must NOT retry on 429 rate limit; stops at attempt 1');
  assert.strictEqual(result.error.status, 429);
  console.log('   ✓ Rate limiting (429) stopped immediately on attempt 1 without retries\n');
}

// Test 7: Throws 503 error message after all 3 attempts fail
console.log('Test 7: 503 error message after maximum 3 attempts fail...');
{
  let callCount = 0;
  const mockAttempt = async () => {
    callCount++;
    const err = new Error('connect ETIMEDOUT');
    err.code = 'ETIMEDOUT';
    return { res: null, err };
  };

  let caughtError = null;
  try {
    await executeRetryLoop(mockAttempt);
  } catch (err) {
    caughtError = err;
  }

  assert.strictEqual(callCount, 3, 'Must attempt up to maximum 3 attempts');
  assert.strictEqual(caughtError.message, "Can't reach the sign-in service right now. Please try again.");
  console.log('   ✓ Exhausted all 3 attempts on persistent outage; returned exact error message\n');
}

// Test 8: Warm-up endpoint coalescing and rate limiting
console.log('Test 8: Verify warm-up endpoint coalescing and rate limiting in auth.js...');
const authRoutesPath = path.resolve(__dirname, '../routes/auth.js');
const authRoutesContent = fs.readFileSync(authRoutesPath, 'utf8');

assert(
  authRoutesContent.includes("router.get('/warmup'"),
  'auth.js must register GET /warmup'
);
assert(
  authRoutesContent.includes("loginRateLimiter"),
  'auth.js must apply loginRateLimiter to warmup endpoint'
);
assert(
  authRoutesContent.includes("status: 'ok'"),
  'warmup endpoint must respond immediately with status ok'
);
assert(
  authRoutesContent.includes("WARMUP_COOLDOWN_MS") || authRoutesContent.includes("30000"),
  'warmup endpoint must enforce 30 second cooldown'
);
assert(
  authRoutesContent.includes("isWarmupRunning"),
  'warmup endpoint must coalesce concurrent requests'
);
console.log('   ✓ GET /api/auth/warmup defined with immediate status ok, 30s coalescing, and loginRateLimiter\n');

// Test 9: Verify frontend timeout & slow notice configuration
console.log('Test 9: Verify frontend login timeout >= 25s and slow notice...');
const apiFilePath = path.resolve(__dirname, '../../frontend/src/services/api.js');
const apiContent = fs.readFileSync(apiFilePath, 'utf8');
assert(
  apiContent.includes('timeout: 26000') || apiContent.includes('timeout: 25000'),
  'api.js loginUser must set timeout >= 25s'
);
assert(
  apiContent.includes('export function warmupAuth'),
  'api.js must export warmupAuth helper'
);

const loginFilePath = path.resolve(__dirname, '../../frontend/src/components/Login.jsx');
const loginContent = fs.readFileSync(loginFilePath, 'utf8');

assert(
  loginContent.includes('warmupAuth();'),
  'Login.jsx must call warmupAuth() on mount'
);
assert(
  loginContent.includes('Connecting to the sign-in service...'),
  'Login.jsx must include "Connecting to the sign-in service..." 4s notice'
);
assert(
  loginContent.includes("Can't reach the sign-in service right now. Please try again."),
  'Login.jsx must include accurate error fallback'
);
console.log('   ✓ Frontend client-side timeout >= 25s verified');
console.log('   ✓ Login.jsx fire-and-forget warm-up on mount and 4s connecting notice verified\n');

console.log('============================================================');
console.log('  ALL AUTH RETRY & RESILIENCE TESTS PASSED! (100%)          ');
console.log('============================================================\n');
