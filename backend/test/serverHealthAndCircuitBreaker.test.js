import assert from 'assert';
import {
  CircuitBreaker,
  BREAKER_STATE,
  HEALTH_STATE,
  getCircuitBreaker,
  getServerHealth,
  updateServerHealth,
  recordServerActivity,
  hasRecentActivity,
  performBackgroundHealthCheck,
  resetAllHealthAndBreakers
} from '../services/serverHealthService.js';
import {
  getSapConnectionPool,
  resetAllPools,
  RFC_PRIORITY
} from '../services/sapConnectionPool.js';

process.env.NODE_ENV = 'test';
process.env.USE_MOCK_SAP = 'true';

console.log('============================================================');
console.log('  TESTING SERVER HEALTH CACHE & CIRCUIT BREAKER (STAGE 3)   ');
console.log('============================================================\n');

async function runTests() {
  // Reset initial state
  resetAllHealthAndBreakers();
  await resetAllPools();

  // --------------------------------------------------------------------------
  // Test 1: Health cache makes 0 RFC calls on repeated health polls
  // --------------------------------------------------------------------------
  console.log('Test 1: Health cache makes 0 RFC calls on repeated health checks...');
  const testServerId = 'server-poll-cache-test';
  const testPool = getSapConnectionPool(testServerId);

  for (let i = 0; i < 20; i++) {
    const health = getServerHealth(testServerId);
    assert.strictEqual(health.status, HEALTH_STATE.HEALTHY, 'Status should be healthy');
    assert.strictEqual(health.circuit_breaker, BREAKER_STATE.CLOSED, 'Breaker should be closed');
  }

  assert.strictEqual(testPool.stats.totalCalls, 0, 'Zero RFC calls must be made on repeated health cache reads');
  console.log('   ✓ Verified 0 RFC calls across 20 consecutive health status reads\n');

  // --------------------------------------------------------------------------
  // Test 2: Idle servers (no activity in 10 min) are not pinged by background health check
  // --------------------------------------------------------------------------
  console.log('Test 2: Idle servers not pinged; active servers are pinged by background check...');
  const idleServerId = 'server-idle-1';
  const activeServerId = 'server-active-1';

  // Create pools so they exist in registry
  const idlePool = getSapConnectionPool(idleServerId);
  const activePool = getSapConnectionPool(activeServerId);

  // Active server has recent activity; idle server does not
  recordServerActivity(activeServerId);

  assert.strictEqual(hasRecentActivity(idleServerId), false, 'Idle server should have no recent activity');
  assert.strictEqual(hasRecentActivity(activeServerId), true, 'Active server should have recent activity');

  const results = await performBackgroundHealthCheck();

  assert.strictEqual(idlePool.stats.totalCalls, 0, 'Idle server must NOT have any RFC calls');
  assert.strictEqual(activePool.stats.totalCalls, 1, 'Active server MUST be pinged once');
  console.log('   ✓ Verified idle servers are skipped (0 calls) and active servers are pinged (1 call)\n');

  // --------------------------------------------------------------------------
  // Test 3: Breaker opens after 3 failures and fails fast (< 1ms, 0 RFC calls)
  // --------------------------------------------------------------------------
  console.log('Test 3: Breaker opens after 3 connection failures and fails fast...');
  const breakerServerId = 'server-trip-test';
  const breaker = getCircuitBreaker(breakerServerId);
  breaker.reset();

  assert.strictEqual(breaker.getState(), BREAKER_STATE.CLOSED, 'Breaker starts closed');

  // Failure 1
  breaker.onFailure(true, 'ECONNREFUSED');
  assert.strictEqual(breaker.getState(), BREAKER_STATE.CLOSED, 'Breaker closed after 1 failure');
  assert.strictEqual(breaker.consecutiveFailures, 1);

  // Failure 2
  breaker.onFailure(true, 'ETIMEDOUT');
  assert.strictEqual(breaker.getState(), BREAKER_STATE.CLOSED, 'Breaker closed after 2 failures');
  assert.strictEqual(breaker.consecutiveFailures, 2);

  // Failure 3: Tripped!
  breaker.onFailure(true, 'NI (network interface) unreachable');
  assert.strictEqual(breaker.getState(), BREAKER_STATE.OPEN, 'Breaker must OPEN after 3 connection failures');
  assert.strictEqual(breaker.consecutiveFailures, 3);

  // Fail fast check (< 1ms, no RFC call)
  const failFastStart = Date.now();
  const execCheck = breaker.canExecute();
  const failFastDuration = Date.now() - failFastStart;
  assert.strictEqual(execCheck.allowed, false, 'Execution must not be allowed when breaker is OPEN');
  assert.strictEqual(typeof execCheck.retryAfter, 'number', 'retryAfter must be provided');
  assert(failFastDuration < 5, 'Must fail fast in < 5ms');

  // Test fail-fast at pool level
  const tripPool = getSapConnectionPool(breakerServerId);
  const initialTripCalls = tripPool.stats.totalCalls;

  let caughtError = null;
  try {
    await tripPool.run(RFC_PRIORITY.READ, 'user-fail-fast', async (client) => {
      return client.call('BAPI_TEST', {});
    });
  } catch (err) {
    caughtError = err;
  }

  assert(caughtError, 'Pool.run must throw when circuit breaker is OPEN');
  assert.strictEqual(caughtError.code, 'SERVER_UNAVAILABLE', 'Error code must be SERVER_UNAVAILABLE');
  assert.strictEqual(caughtError.status, 503, 'HTTP status must be 503');
  assert.strictEqual(tripPool.stats.totalCalls, initialTripCalls, 'No RFC client call should have been attempted');
  console.log('   ✓ Verified circuit breaker OPENs after 3 failures and fails fast with SERVER_UNAVAILABLE (503)\n');

  // --------------------------------------------------------------------------
  // Test 4: Breaker half-opens after timeout, probes, closes on success / re-opens on failure
  // --------------------------------------------------------------------------
  console.log('Test 4: Breaker transitions to half-open, single probe, closes on success / re-opens on failure...');
  const probeBreaker = new CircuitBreaker('server-probe-test', {
    failureThreshold: 3,
    openDurationMs: 40 // short duration for fast deterministic test
  });

  // Trip to OPEN
  probeBreaker.onFailure(true, 'ERR1');
  probeBreaker.onFailure(true, 'ERR2');
  probeBreaker.onFailure(true, 'ERR3');
  assert.strictEqual(probeBreaker.getState(), BREAKER_STATE.OPEN);

  // Wait for open duration to elapse
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.strictEqual(probeBreaker.getState(), BREAKER_STATE.HALF_OPEN, 'Breaker should be HALF_OPEN after timeout');

  // 1st caller gets probe privilege
  const probe1 = probeBreaker.canExecute();
  assert.strictEqual(probe1.allowed, true, 'Probe call must be allowed in HALF_OPEN');
  assert.strictEqual(probe1.isProbe, true, 'Must be flagged as probe');

  // 2nd caller blocked while probe is running
  const probe2 = probeBreaker.canExecute();
  assert.strictEqual(probe2.allowed, false, 'Concurrent callers blocked while probe is running');

  // Probe succeeds -> Breaker CLOSES
  probeBreaker.onSuccess();
  assert.strictEqual(probeBreaker.getState(), BREAKER_STATE.CLOSED, 'Breaker must CLOSE after successful probe');
  assert.strictEqual(probeBreaker.consecutiveFailures, 0, 'Consecutive failures reset to 0');

  // Trip again and test probe failure -> Breaker RE-OPENS
  probeBreaker.onFailure(true, 'ERR1');
  probeBreaker.onFailure(true, 'ERR2');
  probeBreaker.onFailure(true, 'ERR3');
  assert.strictEqual(probeBreaker.getState(), BREAKER_STATE.OPEN);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.strictEqual(probeBreaker.getState(), BREAKER_STATE.HALF_OPEN);

  const probeFail = probeBreaker.canExecute();
  assert.strictEqual(probeFail.allowed, true);
  probeBreaker.onFailure(true, 'Connection refused on probe');
  assert.strictEqual(probeBreaker.getState(), BREAKER_STATE.OPEN, 'Breaker must RE-OPEN on probe failure');
  console.log('   ✓ Verified half-open state, single probe gating, close-on-success and re-open-on-failure\n');

  // --------------------------------------------------------------------------
  // Test 5: Business errors do NOT trip circuit breaker
  // --------------------------------------------------------------------------
  console.log('Test 5: Business and validation errors do NOT trip circuit breaker...');
  const businessBreaker = getCircuitBreaker('server-business-test');
  businessBreaker.reset();

  // Simulate 10 business/validation errors
  for (let i = 0; i < 10; i++) {
    businessBreaker.onFailure(false, 'BOM not found (CSAP_MAT_BOM_READ error 029)');
    businessBreaker.onFailure(false, 'Material 100-100 does not exist in plant 1000');
    businessBreaker.onFailure(false, 'Alternative text exceeds 40 characters');
  }

  assert.strictEqual(businessBreaker.getState(), BREAKER_STATE.CLOSED, 'Breaker must stay CLOSED on business errors');
  assert.strictEqual(businessBreaker.consecutiveFailures, 0, 'Failures count must stay 0');
  console.log('   ✓ Verified business/validation errors never increment failures or trip breaker\n');

  // --------------------------------------------------------------------------
  // Test 6: Two servers have completely independent breakers and health cache
  // --------------------------------------------------------------------------
  console.log('Test 6: Two servers have completely independent breakers and health cache...');
  const serverAId = 'server-independence-A';
  const serverBId = 'server-independence-B';

  const breakerA = getCircuitBreaker(serverAId);
  const breakerB = getCircuitBreaker(serverBId);
  breakerA.reset();
  breakerB.reset();

  // Trip Server A
  breakerA.onFailure(true, 'Host down A');
  breakerA.onFailure(true, 'Host down A');
  breakerA.onFailure(true, 'Host down A');
  updateServerHealth(serverAId, { success: false, error: new Error('Host down A') });

  // Update Server B with success
  updateServerHealth(serverBId, { success: true, latencyMs: 5 });

  const healthA = getServerHealth(serverAId);
  const healthB = getServerHealth(serverBId);

  assert.strictEqual(breakerA.getState(), BREAKER_STATE.OPEN, 'Server A breaker must be OPEN');
  assert.strictEqual(healthA.status, HEALTH_STATE.DOWN, 'Server A health must be DOWN');

  assert.strictEqual(breakerB.getState(), BREAKER_STATE.CLOSED, 'Server B breaker must be CLOSED');
  assert.strictEqual(healthB.status, HEALTH_STATE.HEALTHY, 'Server B health must be HEALTHY');

  console.log('   ✓ Verified complete independence between Server A (down) and Server B (healthy)\n');

  // Cleanup
  resetAllHealthAndBreakers();
  await resetAllPools();

  console.log('============================================================');
  console.log('  ALL SERVER HEALTH & CIRCUIT BREAKER TESTS PASSED CLEANLY! ');
  console.log('============================================================\n');
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
