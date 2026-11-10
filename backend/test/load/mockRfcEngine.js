/**
 * Mock SAP RFC Engine for Multi-User Concurrency & Load Simulation
 * Emulates open-rfc Client and SAP Gateway behavior with:
 * - Configurable latency (normal: 200-800ms, slow: 5-30s)
 * - Maximum concurrent connection cap (e.g. 5 connections)
 * - Service outages and connection drops
 * - SAP Enqueue Lock collisions on BOM keys (MATNR+WERKS+STLAN+STLAL)
 * - Live connection tracking and telemetry (p50, p95, error rates)
 */

export class MockRfcEngine {
  constructor(options = {}) {
    this.name = options.name || 'MOCK_SAP';
    this.minLatencyMs = options.minLatencyMs ?? 200;
    this.maxLatencyMs = options.maxLatencyMs ?? 800;
    this.maxConnections = options.maxConnections ?? Infinity;
    this.isDown = options.isDown ?? false;
    this.outageRecoveryMs = options.outageRecoveryMs ?? null;

    // State tracking
    this.activeConnections = 0;
    this.peakConnections = 0;
    this.totalConnectionsOpened = 0;
    this.totalConnectionsClosed = 0;
    this.totalCalls = 0;
    this.errors = [];
    this.latencies = [];

    // Enqueue lock table: Map<lockKey, { lockedBy: string, lockedAt: number }>
    this.activeLocks = new Map();

    if (this.outageRecoveryMs) {
      setTimeout(() => {
        this.isDown = false;
      }, this.outageRecoveryMs);
    }
  }

  getLockKey(matnr, werks, stlan = '1', stlal = '01') {
    return `${String(matnr || '').trim().toUpperCase()}:${String(werks || '').trim().toUpperCase()}:${stlan}:${stlal}`;
  }

  async acquireLock(lockKey, user) {
    if (this.activeLocks.has(lockKey)) {
      const lockInfo = this.activeLocks.get(lockKey);
      const err = new Error(`CSAP 028: Material BOM is locked by user ${lockInfo.lockedBy || 'SAP_TECH_USER'}`);
      err.code = 'SAP_LOCKED';
      throw err;
    }
    this.activeLocks.set(lockKey, { lockedBy: user, lockedAt: Date.now() });
  }

  releaseLock(lockKey) {
    this.activeLocks.delete(lockKey);
  }

  _calculateLatency() {
    if (this.minLatencyMs === this.maxLatencyMs) return this.minLatencyMs;
    return Math.floor(Math.random() * (this.maxLatencyMs - this.minLatencyMs + 1)) + this.minLatencyMs;
  }

  async openConnection() {
    if (this.isDown) {
      const err = new Error('RFC_COMMUNICATION_FAILURE: WSAECONNREFUSED - Connection refused by SAP gateway');
      err.code = 'RFC_COMMUNICATION_FAILURE';
      throw err;
    }

    if (this.activeConnections >= this.maxConnections) {
      const err = new Error(`RFC_COMMUNICATION_FAILURE: Maximum number of active RFC connections reached (${this.maxConnections}). Gateway refused connection.`);
      err.code = 'MAX_CONNECTIONS_EXCEEDED';
      throw err;
    }

    this.activeConnections++;
    this.totalConnectionsOpened++;
    if (this.activeConnections > this.peakConnections) {
      this.peakConnections = this.activeConnections;
    }

    // Emulate TCP handshake / RFC logon latency (~50-100ms)
    await new Promise((r) => setTimeout(r, 50));
  }

  async closeConnection() {
    if (this.activeConnections > 0) {
      this.activeConnections--;
      this.totalConnectionsClosed++;
    }
  }

  async executeCall(functionName, params = {}, options = {}) {
    const callStart = Date.now();
    this.totalCalls++;

    if (this.isDown) {
      const err = new Error('RFC_COMMUNICATION_FAILURE: Partner terminated connection unexpectedly');
      err.code = 'RFC_COMMUNICATION_FAILURE';
      this.errors.push(err);
      throw err;
    }

    const latency = this._calculateLatency();
    await new Promise((r) => setTimeout(r, latency));

    const totalDuration = Date.now() - callStart;
    this.latencies.push(totalDuration);

    // Mock specific responses
    switch (functionName) {
      case 'RFC_PING':
        return {};

      case 'RFC_READ_TABLE':
        return this._mockReadTable(params);

      case 'CSAP_MAT_BOM_READ':
        return this._mockBomRead(params);

      case 'CSAP_MAT_BOM_CREATE':
        return this._mockBomCreate(params, options);

      case 'CSAP_MAT_BOM_DELETE':
        return this._mockBomDelete(params, options);

      default:
        return { success: true };
    }
  }

  _mockReadTable(params) {
    const query = (params.OPTIONS || []).map((o) => o.TEXT).join(' ');
    const table = params.QUERY_TABLE || '';

    if (table === 'T001W') {
      return {
        DATA: [
          { WA: '1000|Plant Hamburg|Hamburg|DE' },
          { WA: '1010|Plant Berlin|Berlin|DE' },
          { WA: '1020|Plant Frankfurt|Frankfurt|DE' }
        ],
        FIELDS: [{ FIELDNAME: 'WERKS' }, { FIELDNAME: 'NAME1' }, { FIELDNAME: 'ORT01' }, { FIELDNAME: 'LAND1' }]
      };
    }
    if (table === 'T001L') {
      return {
        DATA: [
          { WA: '1000|FG01|Finished Goods Store' },
          { WA: '1000|RM01|Raw Material Store' }
        ],
        FIELDS: [{ FIELDNAME: 'WERKS' }, { FIELDNAME: 'LGORT' }, { FIELDNAME: 'LGOBE' }]
      };
    }
    if (table === 'MAST') {
      return {
        DATA: [{ WA: 'TEST-MAT|1000|1|00001001|01' }],
        FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'WERKS' }, { FIELDNAME: 'STLAN' }, { FIELDNAME: 'STLNR' }, { FIELDNAME: 'STLAL' }]
      };
    }
    return { DATA: [], FIELDS: [] };
  }

  _mockBomRead(params) {
    return {
      T_STPO: [
        { IDNRK: 'COMP-A', MENGE: '2.0', MEINS: 'PC', POSTP: 'L', POSNR: '0010' },
        { IDNRK: 'COMP-B', MENGE: '5.0', MEINS: 'KG', POSTP: 'L', POSNR: '0020' }
      ]
    };
  }

  _mockBomCreate(params, options) {
    return {
      BOM_HEADER: { BOM_NO: '00012345' },
      T_STPO: []
    };
  }

  _mockBomDelete(params, options) {
    return { FL_WARNING: '' };
  }

  getMetrics() {
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const p50 = sorted.length ? sorted[Math.floor(sorted.length * 0.5)] : 0;
    const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0;
    const avg = sorted.length ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : 0;

    return {
      totalCalls: this.totalCalls,
      totalErrors: this.errors.length,
      peakConnections: this.peakConnections,
      activeConnections: this.activeConnections,
      p50LatencyMs: p50,
      p95LatencyMs: p95,
      avgLatencyMs: avg,
      errorRatePct: this.totalCalls ? Number(((this.errors.length / this.totalCalls) * 100).toFixed(1)) : 0
    };
  }
}

/**
 * Creates an open-rfc compatible Client wrapper attached to the mock engine.
 */
export function createMockClientClass(mockEngine) {
  return class MockOpenRfcClient {
    constructor(params, options) {
      this.params = params;
      this.options = options;
      this.isOpen = false;
      this.user = params.user || 'MOCK_USER';
    }

    async open() {
      await mockEngine.openConnection();
      this.isOpen = true;
    }

    async call(functionName, params = {}) {
      if (!this.isOpen) {
        throw new Error('RFC client is not connected');
      }
      return mockEngine.executeCall(functionName, params, { user: this.user });
    }

    async close() {
      if (this.isOpen) {
        this.isOpen = false;
        await mockEngine.closeConnection();
      }
    }
  };
}
