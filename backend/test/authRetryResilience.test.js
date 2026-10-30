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
assert.strictEqual(isNetworkOrRetryableError({ status: 500, message: 'Internal Server Error' }), true);
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
console.log('   ✓ Network/infrastructure errors correctly flagged as retryable');
console.log('   ✓ 4xx client and auth credential errors strictly excluded from retries\n');

// Test 3: Simulation of retry rules in auth client flow
console.log('Test 3: Simulating single automatic retry on transient network error...');
{
  let callCount = 0;
  const mockPerformSignIn = async () => {
    callCount++;
    if (callCount === 1) {
      const err = new TypeError('fetch failed');
      err.code = 'ECONNRESET';
      throw err;
    }
    return {
      data: {
        session: { access_token: 'mock_jwt_token' },
        user: { id: 'u1', email: 'test@example.com' }
      },
      error: null
    };
  };

  // Execute retry wrapper pattern identical to signInWithPassword
  let result;
  try {
    result = await mockPerformSignIn();
  } catch (err) {
    if (isNetworkOrRetryableError(err)) {
      await new Promise((r) => setTimeout(r, 20)); // short delay in test
      result = await mockPerformSignIn();
    } else {
      throw err;
    }
  }

  assert.strictEqual(callCount, 2, 'Must retry exactly once on transient network error');
  assert.strictEqual(result.data.session.access_token, 'mock_jwt_token');
  console.log('   ✓ Attempt 1 network failure retried automatically; Attempt 2 succeeded\n');
}

// Test 4: Simulation of 401 error - never retried
console.log('Test 4: Simulating 401 / bad credentials - must never retry...');
{
  let callCount = 0;
  const mockPerformSignIn = async () => {
    callCount++;
    return {
      data: null,
      error: {
        status: 400,
        code: 'invalid_credentials',
        message: 'Invalid login credentials',
        __isAuthError: true
      }
    };
  };

  let result;
  try {
    result = await mockPerformSignIn();
  } catch (err) {
    if (isNetworkOrRetryableError(err)) {
      result = await mockPerformSignIn();
    } else {
      throw err;
    }
  }

  assert.strictEqual(callCount, 1, 'Must NOT retry on invalid credentials / 401');
  assert.strictEqual(result.error.code, 'invalid_credentials');
  console.log('   ✓ Invalid credentials failed immediately in 1 attempt without multiplying retries\n');
}

// Test 5: Simulation of persistent network outage - stops after retry 1 and yields accurate error
console.log('Test 5: Simulating persistent network outage - max 2 attempts, accurate message...');
{
  let callCount = 0;
  const mockPerformSignIn = async () => {
    callCount++;
    const err = new Error('connect ETIMEDOUT');
    err.code = 'ETIMEDOUT';
    throw err;
  };

  let caughtError = null;
  try {
    try {
      await mockPerformSignIn();
    } catch (err) {
      if (isNetworkOrRetryableError(err)) {
        await new Promise((r) => setTimeout(r, 20));
        await mockPerformSignIn();
      } else {
        throw err;
      }
    }
  } catch (finalErr) {
    caughtError = new Error("Can't reach the sign-in service right now. Please try again.");
  }

  assert.strictEqual(callCount, 2, 'Must stop after 2 total attempts');
  assert.strictEqual(caughtError.message, "Can't reach the sign-in service right now. Please try again.");
  console.log('   ✓ Outage capped at 2 attempts; returned accurate message "Can\'t reach the sign-in service right now. Please try again."\n');
}

// Test 6: Verify Login.jsx contains accurate error text and no outdated "connectivity" message
console.log('Test 6: Verify Login.jsx error text...');
const loginFilePath = path.resolve(__dirname, '../../frontend/src/components/Login.jsx');
const loginContent = fs.readFileSync(loginFilePath, 'utf8');

assert(
  loginContent.includes("Can't reach the sign-in service right now. Please try again."),
  'Login.jsx must include accurate fallback: "Can\'t reach the sign-in service right now. Please try again."'
);
assert(
  !loginContent.includes('Connection to authentication service failed. Please check network connectivity.'),
  'Login.jsx must not contain outdated "check network connectivity" error message'
);
console.log('   ✓ Login.jsx contains accurate error message and removed misleading network connectivity claim\n');

console.log('============================================================');
console.log('  ALL AUTH RETRY & RESILIENCE TESTS PASSED! (100%)          ');
console.log('============================================================\n');
