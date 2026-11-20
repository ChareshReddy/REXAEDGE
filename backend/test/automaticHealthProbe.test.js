process.env.NODE_ENV = 'test';
process.env.USE_MOCK_SAP = 'false';

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  probeServerHealth,
  getServerHealth,
  getCircuitBreaker,
  resetAllHealthAndBreakers,
  BREAKER_STATE,
  HEALTH_STATE
} from '../services/serverHealthService.js';
import { setTestPingOverride } from '../services/sapRfcClient.js';
import { inMemorySupabase } from '../services/supabaseClient.js';

inMemorySupabase.server_allowlist = [
  {
    id: 'al-test-auto-probe',
    pattern: '192.168.12.*',
    type: 'Sandbox',
    comment: 'Test CIDR'
  }
];
inMemorySupabase.allowlist = inMemorySupabase.server_allowlist;

test('Automatic Health Probe: First status with no cache probes once and returns connected', async () => {
  resetAllHealthAndBreakers();

  let pingCount = 0;
  setTestPingOverride(async () => {
    pingCount++;
    return { success: true, latencyMs: 12 };
  });

  const testServer = {
    id: 'srv-auto-probe-1',
    ashost: '192.168.12.241',
    sysnr: '00',
    client: '100',
    sap_username: 'TEST_USER',
    sap_password: 'testPassword123'
  };

  const health = await probeServerHealth(testServer);
  assert.equal(pingCount, 1, 'Expected exactly 1 probe on initial cold check');
  assert.equal(health.status, HEALTH_STATE.HEALTHY);
  assert.equal(health.circuit_breaker, BREAKER_STATE.CLOSED);
  assert.equal(health.latency_ms, 12);

  setTestPingOverride(null);
  resetAllHealthAndBreakers();
});

test('Automatic Health Probe: Two parallel polls cause one probe (in-flight coalescing)', async () => {
  resetAllHealthAndBreakers();

  let pingCount = 0;
  setTestPingOverride(async () => {
    pingCount++;
    // Simulate short network latency
    await new Promise((r) => setTimeout(r, 50));
    return { success: true, latencyMs: 15 };
  });

  const testServer = {
    id: 'srv-auto-probe-parallel',
    ashost: '192.168.12.241',
    sysnr: '00',
    client: '100',
    sap_username: 'TEST_USER',
    sap_password: 'testPassword123'
  };

  // Launch two parallel polls
  const [h1, h2] = await Promise.all([
    probeServerHealth(testServer),
    probeServerHealth(testServer)
  ]);

  assert.equal(pingCount, 1, 'Two parallel polls must coalesce into exactly 1 RFC ping probe');
  assert.equal(h1.status, HEALTH_STATE.HEALTHY);
  assert.equal(h2.status, HEALTH_STATE.HEALTHY);

  setTestPingOverride(null);
  resetAllHealthAndBreakers();
});

test('Automatic Health Probe: Fresh cache causes no probe', async () => {
  resetAllHealthAndBreakers();

  let pingCount = 0;
  setTestPingOverride(async () => {
    pingCount++;
    return { success: true, latencyMs: 8 };
  });

  const testServer = {
    id: 'srv-auto-probe-cache',
    ashost: '192.168.12.241',
    sysnr: '00',
    client: '100',
    sap_username: 'TEST_USER',
    sap_password: 'testPassword123'
  };

  // 1. Initial probe
  await probeServerHealth(testServer);
  assert.equal(pingCount, 1, 'Expected initial probe to execute');

  // 2. Immediate second poll with fresh cache (< 60s)
  const cachedHealth = await probeServerHealth(testServer);
  assert.equal(pingCount, 1, 'Subsequent poll with fresh cache must NOT trigger RFC ping');
  assert.equal(cachedHealth.status, HEALTH_STATE.HEALTHY);

  setTestPingOverride(null);
  resetAllHealthAndBreakers();
});

test('Automatic Health Probe: Failing probe returns reason and opens breaker after 3 failures', async () => {
  resetAllHealthAndBreakers();

  let pingCount = 0;
  setTestPingOverride(async () => {
    pingCount++;
    const err = new Error('WSAECONNREFUSED: SAP Gateway connection refused');
    err.code = 'RFC_CONN_ERROR';
    return { success: false, message: err.message, code: err.code };
  });

  const testServer = {
    id: 'srv-auto-probe-failing',
    ashost: '192.168.12.241',
    sysnr: '00',
    client: '100',
    sap_username: 'TEST_USER',
    sap_password: 'testPassword123'
  };

  const breaker = getCircuitBreaker(testServer.id);

  // Failure 1 (force bypass of freshness to simulate 3 poll attempts)
  const f1 = await probeServerHealth(testServer, { force: true });
  assert.equal(pingCount, 1);
  assert.equal(breaker.consecutiveFailures, 1);
  assert.equal(breaker.getState(), BREAKER_STATE.CLOSED);
  assert.equal(f1.status, HEALTH_STATE.DEGRADED);
  assert.ok(f1.last_error.includes('SAP Gateway connection refused'));

  // Failure 2
  const f2 = await probeServerHealth(testServer, { force: true });
  assert.equal(pingCount, 2);
  assert.equal(breaker.consecutiveFailures, 2);
  assert.equal(breaker.getState(), BREAKER_STATE.CLOSED);

  // Failure 3 -> should open circuit breaker
  const f3 = await probeServerHealth(testServer, { force: true });
  assert.equal(pingCount, 3);
  assert.equal(breaker.consecutiveFailures, 3);
  assert.equal(breaker.getState(), BREAKER_STATE.OPEN);
  assert.equal(f3.status, HEALTH_STATE.DOWN);
  assert.equal(f3.circuit_breaker, BREAKER_STATE.OPEN);

  // Poll while breaker is OPEN must NOT trigger another probe
  const f4 = await probeServerHealth(testServer, { force: true });
  assert.equal(pingCount, 3, 'When breaker is OPEN, no RFC probe must be dispatched');
  assert.equal(f4.status, HEALTH_STATE.DOWN);
  assert.equal(f4.circuit_breaker, BREAKER_STATE.OPEN);

  setTestPingOverride(null);
  resetAllHealthAndBreakers();
});
