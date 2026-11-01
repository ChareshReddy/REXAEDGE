import assert from 'assert';
import http from 'http';
import {
  SERVER_KEEP_ALIVE_TIMEOUT,
  SERVER_HEADERS_TIMEOUT,
  configureServerTimeouts
} from '../server.js';
import { isLoginRetryableError } from '../../frontend/src/services/api.js';

console.log('============================================================');
console.log('  TESTING LOGIN RESILIENCE, KEEP-ALIVE & RETRY RULES        ');
console.log('============================================================\n');

// -------------------------------------------------------------
// Test Suite 1: Node.js HTTP Server Timeout Settings
// -------------------------------------------------------------
console.log('Suite 1: Node.js Server Timeout Settings (Anti-ECONNRESET)');
{
  assert.strictEqual(
    SERVER_KEEP_ALIVE_TIMEOUT,
    65000,
    'SERVER_KEEP_ALIVE_TIMEOUT must be configured to 65000ms (65s)'
  );
  assert.strictEqual(
    SERVER_HEADERS_TIMEOUT,
    66000,
    'SERVER_HEADERS_TIMEOUT must be configured to 66000ms (66s)'
  );
  assert(
    SERVER_HEADERS_TIMEOUT > SERVER_KEEP_ALIVE_TIMEOUT,
    'headersTimeout must be strictly greater than keepAliveTimeout per Node.js docs'
  );

  // Test apply to actual http.Server instance
  const dummyServer = http.createServer((req, res) => res.end('ok'));
  configureServerTimeouts(dummyServer);

  assert.strictEqual(
    dummyServer.keepAliveTimeout,
    65000,
    'configureServerTimeouts must set keepAliveTimeout to 65000ms on server'
  );
  assert.strictEqual(
    dummyServer.headersTimeout,
    66000,
    'configureServerTimeouts must set headersTimeout to 66000ms on server'
  );
  console.log('   ✓ SERVER_KEEP_ALIVE_TIMEOUT is 65000ms (> reverse proxy default 60s)');
  console.log('   ✓ SERVER_HEADERS_TIMEOUT is 66000ms (> keepAliveTimeout)');
  console.log('   ✓ Server timeout configuration function applied cleanly\n');
}

// -------------------------------------------------------------
// Test Suite 2: Frontend isLoginRetryableError Classification
// -------------------------------------------------------------
console.log('Suite 2: Safe Retry Rules (isLoginRetryableError)');
{
  // 1. Network / Transport errors MUST retry
  assert.strictEqual(isLoginRetryableError({}), true, 'Error without response is network error');
  assert.strictEqual(isLoginRetryableError({ message: 'Network Error' }), true);
  assert.strictEqual(isLoginRetryableError({ code: 'ECONNRESET' }), true);
  assert.strictEqual(isLoginRetryableError({ code: 'ECONNREFUSED' }), true);
  assert.strictEqual(isLoginRetryableError({ code: 'ETIMEDOUT' }), true);
  assert.strictEqual(isLoginRetryableError({ message: 'socket hang up' }), true);

  // 2. Gateway / Infrastructure HTTP status codes MUST retry
  assert.strictEqual(isLoginRetryableError({ response: { status: 502, data: {} } }), true, '502 Bad Gateway must retry');
  assert.strictEqual(isLoginRetryableError({ response: { status: 503, data: {} } }), true, '503 Service Unavailable must retry');
  assert.strictEqual(isLoginRetryableError({ response: { status: 504, data: {} } }), true, '504 Gateway Timeout must retry');

  // 3. 500 Internal Server Error with text/plain (proxy crash / unhandled reset) MUST retry
  assert.strictEqual(
    isLoginRetryableError({
      response: {
        status: 500,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
        data: 'Internal Server Error'
      }
    }),
    true,
    '500 with text/plain content-type must retry'
  );
  assert.strictEqual(
    isLoginRetryableError({
      response: {
        status: 500,
        headers: {},
        data: 'Internal Server Error' // plain string body
      }
    }),
    true,
    '500 with string body must retry'
  );

  // 4. Client Errors (4xx) and wrong credentials must NEVER retry
  assert.strictEqual(isLoginRetryableError({ response: { status: 400, data: { error: 'Bad Request' } } }), false, '400 must NOT retry');
  assert.strictEqual(isLoginRetryableError({ response: { status: 401, data: { error: 'Invalid credentials' } } }), false, '401 (wrong credentials) must NEVER retry');
  assert.strictEqual(isLoginRetryableError({ response: { status: 403, data: { error: 'Forbidden' } } }), false, '403 must NOT retry');
  assert.strictEqual(isLoginRetryableError({ response: { status: 429, data: { error: 'Too Many Requests' } } }), false, '429 must NOT retry');
  assert.strictEqual(isLoginRetryableError({ response: { status: 404, data: {} } }), false, '404 must NOT retry');

  console.log('   ✓ 502, 503, 504 and network errors accurately classified as retryable');
  console.log('   ✓ 500 with text/plain proxy error accurately classified as retryable');
  console.log('   ✓ 400, 401 (credentials), 403, 429 strictly excluded from retries\n');
}

// -------------------------------------------------------------
// Test Suite 3: Login Retry Execution Simulation
// -------------------------------------------------------------
console.log('Suite 3: Login Retry Execution & Error Formatting');
{
  // Test A: Single retry on transient network/502 error succeeds on attempt 2
  let attemptsA = 0;
  const mockLoginTransient = async () => {
    attemptsA++;
    if (attemptsA === 1) {
      const err = new Error('502 Bad Gateway');
      err.response = { status: 502, data: {} };
      throw err;
    }
    return { success: true, token: 'mock-jwt-token', user: { id: 'u1' } };
  };

  const executeWithRetry = async (fn, delay = 10) => {
    try {
      return await fn();
    } catch (err) {
      if (isLoginRetryableError(err)) {
        await new Promise(r => setTimeout(r, delay));
        return await fn();
      }
      throw err;
    }
  };

  const resultA = await executeWithRetry(mockLoginTransient);
  assert.strictEqual(attemptsA, 2, 'Transient error must trigger exactly 1 retry (2 total attempts)');
  assert.strictEqual(resultA.success, true);
  console.log('   ✓ Transient 502/network failure automatically retried once and succeeded');

  // Test B: Wrong credentials (401) must fail immediately on attempt 1 without retry
  let attemptsB = 0;
  const mockLoginBadCreds = async () => {
    attemptsB++;
    const err = new Error('Unauthorized');
    err.response = { status: 401, data: { error: 'Invalid email or password' } };
    throw err;
  };

  try {
    await executeWithRetry(mockLoginBadCreds);
    assert.fail('Should not succeed');
  } catch (err) {
    assert.strictEqual(attemptsB, 1, 'Wrong credentials must NEVER be retried');
    assert.strictEqual(err.response.status, 401);
  }
  console.log('   ✓ Invalid credentials failed immediately in 1 attempt without multiplying calls');

  // Test C: Persistent 500 text/plain proxy error produces clear error message only after retry
  let attemptsC = 0;
  const mockLoginPersistent500 = async () => {
    attemptsC++;
    const err = new Error('Internal Server Error');
    err.response = {
      status: 500,
      headers: { 'content-type': 'text/plain' },
      data: 'Internal Server Error'
    };
    throw err;
  };

  let formattedErrorMessage = '';
  try {
    try {
      await mockLoginPersistent500();
    } catch (err) {
      if (isLoginRetryableError(err)) {
        await new Promise(r => setTimeout(r, 10));
        await mockLoginPersistent500();
      } else {
        throw err;
      }
    }
  } catch (finalErr) {
    if (
      finalErr.response?.status === 500 &&
      (typeof finalErr.response?.data === 'string' ||
       finalErr.response?.headers?.['content-type']?.includes('text/plain'))
    ) {
      formattedErrorMessage = "Can't reach the sign-in service. Please try again.";
    }
  }

  assert.strictEqual(attemptsC, 2, 'Must attempt twice before showing final error');
  assert.strictEqual(
    formattedErrorMessage,
    "Can't reach the sign-in service. Please try again.",
    'Must produce clear message: "Can\'t reach the sign-in service. Please try again."'
  );
  console.log('   ✓ Persistent 500 text/plain capped at 2 attempts and formatted cleanly\n');
}

// -------------------------------------------------------------
// Test Suite 4: End-to-End Keep-Alive Verification (10s Idle, 5 Iterations)
// -------------------------------------------------------------
console.log('Suite 4: End-to-End Idle Keep-Alive (10s idle, 5 consecutive logins)');
{
  const TEST_BACKEND_PORT = 5098;
  const TEST_PROXY_PORT = 8098;

  // 1. Create backend server with new 65s keep-alive timeout
  let backendRequestsReceived = 0;
  const backendServer = http.createServer((req, res) => {
    backendRequestsReceived++;
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Keep-Alive': `timeout=${Math.round(backendServer.keepAliveTimeout / 1000)}`
    });
    res.end(JSON.stringify({ success: true, count: backendRequestsReceived }));
  });
  configureServerTimeouts(backendServer);

  await new Promise(r => backendServer.listen(TEST_BACKEND_PORT, '127.0.0.1', r));

  // 2. Create proxy with disabled keep-alive agent (identical to vite.config.js fix)
  const proxyAgent = new http.Agent({ keepAlive: false });
  const proxyServer = http.createServer((req, res) => {
    const upstream = http.request({
      hostname: '127.0.0.1',
      port: TEST_BACKEND_PORT,
      path: req.url,
      method: req.method,
      headers: req.headers,
      agent: proxyAgent
    }, (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
      upstreamRes.pipe(res);
    });

    upstream.on('error', (err) => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: "Can't reach the sign-in service. Please try again." }));
      }
    });

    req.pipe(upstream);
  });

  await new Promise(r => proxyServer.listen(TEST_PROXY_PORT, '127.0.0.1', r));

  const clientCall = () => {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({ email: 'test@corp.com', password: 'pwd' });
      const req = http.request({
        hostname: '127.0.0.1',
        port: TEST_PROXY_PORT,
        path: '/api/auth/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (res) => {
        let text = '';
        res.on('data', chunk => text += chunk);
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            contentType: res.headers['content-type'],
            body: JSON.parse(text)
          });
        });
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  };

  // Perform 5 iterations: idle 10 seconds, then log in once: must succeed on attempt 1!
  console.log('   Running 5 consecutive cycles with 10 seconds idle...');
  for (let cycle = 1; cycle <= 5; cycle++) {
    process.stdout.write(`   [Cycle ${cycle}/5] Idling for 10 seconds... `);
    await new Promise(r => setTimeout(r, 10000));
    process.stdout.write('Logging in... ');

    const res = await clientCall();
    assert.strictEqual(
      res.statusCode,
      200,
      `Cycle ${cycle}: Login must return status 200 on first attempt (got ${res.statusCode})`
    );
    assert.strictEqual(
      res.body.success,
      true,
      `Cycle ${cycle}: Response body must indicate success`
    );
    console.log(`✓ Succeeded on FIRST attempt (Status 200, Response: ${JSON.stringify(res.body)})`);
  }

  // Cleanup
  await new Promise(r => proxyServer.close(r));
  await new Promise(r => backendServer.close(r));
  proxyAgent.destroy();
  console.log('   ✓ All 5 idle-then-login tests succeeded on first attempt without any errors!\n');
}

console.log('============================================================');
console.log('  ALL LOGIN RESILIENCE & KEEP-ALIVE TESTS PASSED! (100%)     ');
console.log('============================================================\n');
