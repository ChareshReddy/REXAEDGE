# RexaEdge SAP Multi-User & Multi-Server Readiness Review
**Engineering Assessment, Load Simulation, and Production Architecture Proposal**

---

## Executive Summary
This document provides a thorough audit of the RexaEdge application's ability to support multi-server configuration and concurrent multi-user execution (10 concurrent users on the same SAP server). It is divided into three parts:
1. **Codebase Findings & Architecture Audit**: In-depth inspection of connection handling, session lifecycle, credential resolution, concurrency limits, caching, and cross-user safety with exact source code references.
2. **Empirical Load Simulation**: Local mock RFC simulation testing 7 operational stress scenarios under 10 concurrent users, measuring p50/p95 latency, error rates, connection spikes, and failure points.
3. **Target Production Architecture Proposal**: Actionable design specifications, priority queuing, fairness controls, background worker architecture, circuit breakers, database schema migrations, and SAP Basis alignment parameters.

---

## PART 1 - Architecture Audit & Codebase Findings

### 1.1 SAP Connection Layer (`open-rfc`)
* **Connection Lifecycle**:
  - In `backend/services/sapRfcClient.js` (lines 155–160), `openRfcClient()` instantiates a new `Client` object and opens a fresh TCP/RFC connection for each operation:
    ```javascript
    // backend/services/sapRfcClient.js:155-160
    export async function openRfcClient(customOverrides = {}, ClientClass = Client) {
      const params = getRfcConnectionParams(customOverrides);
      const client = new ClientClass(params, DEFAULT_RFC_CLIENT_OPTIONS);
      await client.open();
      return client;
    }
    ```
  - Across read/write functions (e.g. `rfcReadBom` at lines 450–680, `rfcBatchCreateBoms` in `backend/services/bomCreateEngine.js:932`), each caller opens a connection, executes RFC function modules, and closes it in a `finally` block:
    ```javascript
    // backend/services/sapRfcClient.js:677-680
    } finally {
      if (shouldClose) {
        try { await client.close(); } catch {}
      }
    }
    ```
  - **Verdict**: There is **no connection pool**, **no persistent client singleton**, and **no per-user session** in the RFC layer. Every single request or bulk iteration incurs a TCP handshake, SAProuter tunnel negotiation, SAP gateway dispatch, and user authentication handshake.
* **Error Handling on Connections**:
  - Connection failures during `await client.open()` reject immediately. Errors are caught in local `try/catch` blocks and returned as failure objects (`{ success: false, errorCode: 'RFC_BOM_READ_ERROR', message: ... }`).
  - No automatic reconnect, exponential backoff, or connection recovery exists at the RFC layer.
* **SAP User Identity**:
  - In `backend/services/sapRfcClient.js` (lines 89–105), credentials are read from `sap_servers.sap_username` and decrypted from `sap_servers.sap_password_encrypted`.
  - **Single Shared Technical User**: All web users connect to SAP under the **same shared technical user account** configured for that server. Per-user SAP credentials do not exist; app-level user distinction is maintained solely via HTTP JWT tokens and audit logging.

---

### 1.2 Server Configuration & Permissions
* **Server Record Storage & Encryption**:
  - Managed via `backend/routes/admin.js` (lines 222–454) and `backend/services/supabaseClient.js` (lines 1330–1450).
  - Passwords are encrypted before database insertion using AES-256-GCM via `encryptPassword()` (`backend/utils/crypto.js:10–50`) and decrypted dynamically via `decryptPassword()` (`backend/services/sapRfcClient.js:94–99`). Plaintext passwords are never returned in admin API responses.
* **Database Fields**:
  - Defined in `backend/schema/supabase.sql` (lines 19–34):
    `id`, `name`, `ashost`, `sysnr`, `client`, `lang` (default 'EN'), `environment` (`CHECK IN ('SANDBOX', 'DEV', 'QA', 'PROD')`), `router`, `gwserv`, `sap_username`, `sap_password_encrypted`, `is_active`, `created_at`, `updated_at`.
* **Admin UI Capabilities**:
  - Admin UI (`frontend/src/components/AdminView.jsx`) supports:
    1. **Add Server** (`POST /api/admin/servers`)
    2. **Edit Server** (`PUT /api/admin/servers/:id`)
    3. **Disable / Delete Server** (`DELETE /api/admin/servers/:id` or toggle `is_active`)
  - **Test Connection**: The routes `POST /api/admin/servers/test-connection` and `POST /api/admin/servers/:id/test-connection` were intentionally removed and return 404 (`backend/test/sapConnectionTest.test.js:68–124`) to eliminate unmanaged synchronous connection hangs in the admin UI.
* **User-Server Permissions**:
  - Stored in table `public.user_server_permissions` (`backend/schema/supabase.sql:44–51`):
    `id`, `user_id`, `server_id`, `granted_by`, `granted_at`.
  - **Granularity**: The system currently provides **coarse binary server access**. In `backend/middleware/auth.js:122`, any user assigned to a server receives `req.serverAccessLevel = 'read_write'`. There is no schema or runtime enforcement for granular permissions (`display`, `validate`, `create`, `copy`, `delete`) per user per server.

---

### 1.3 Existing Limits, Caches & Timeouts
* **Concurrency Limits & Queues**:
  - **None**. There is zero concurrency capping or queuing per SAP server in `sapRfcClient.js`. If 10 users click "Display" or run searches simultaneously, 10 concurrent RFC connections open directly to the SAP Gateway.
* **Caches & TTLs**:
  1. **Plants**: `backend/services/plantService.js` (lines 10–24) stores plants in `Map<serverId, { plants, cachedAt, expiresAt }>`. TTL = **12 hours** (`TWELVE_HOURS_MS`). Non-admin manual refresh cooldown = **60 seconds**.
  2. **Storage Locations**: `backend/services/storageLocationService.js` (lines 6–14) stores slocs in `Map<serverId:plant, { entries, cachedAt, expiresAt }>`. TTL = **1 hour** (`ONE_HOUR_MS`). Max rows = 500.
  3. **BOM Usages**: `backend/services/bomUsageService.js` (lines 6–14) stores usages in `Map<serverId:lang, { entries, cachedAt, expiresAt }>`. TTL = **1 hour**.
  4. **Materials**: `backend/services/materialSearchService.js` (lines 48–90) implements an in-memory LRU cache (`MaterialLruCache`) capped at 500 items with a **60-second TTL**.
  5. **In-Flight Search Deduplication**: `backend/services/materialSearchService.js` (lines 420–445) uses `inFlightSearches` Map to combine duplicate search requests arriving while an RFC query is in flight.
* **Timeouts Across Layers**:
  - **Node.js HTTP Server**: `keepAliveTimeout` = 65s, `headersTimeout` = 66s (`docs/DEPLOYMENT_NOTES.md:16`).
  - **Nginx Reverse Proxy**: `proxy_read_timeout 60s`, `proxy_connect_timeout 60s`, `proxy_send_timeout 60s` (`docs/DEPLOYMENT_NOTES.md:65–68`).
  - **Axios Frontend Client**: Default timeout = `0` (unbounded) (`frontend/src/services/api.js:4–13`).
  - **`open-rfc` Client**: No timeout configured in `DEFAULT_RFC_CLIENT_OPTIONS` (`backend/services/sapRfcClient.js:138–148`). Relies on OS TCP socket timeouts.

---

### 1.4 Long-Running Work (Bulk Operations)
* **Execution Models**:
  - **Legacy Synchronous Route**: `POST /api/bom/create-bulk` (`backend/routes/bom.js:763–815`) executes `rfcBatchCreateBoms` inside a single HTTP request for up to 500 BOMs (`MAX_BOMS = 500` in `bomJobManager.js:19`).
  - **Asynchronous Background Worker**: `POST /api/bom/jobs/start` (`backend/routes/bom.js:1010–1080` & `backend/services/bomJobManager.js:230–336`) receives base64 payloads, creates an in-memory job, and executes asynchronously via `setImmediate()`. The frontend polls `/api/bom/jobs/:id` for progress updates.
* **Timeout & Failure Risks**:
  - In synchronous bulk creation, 200 BOMs taking 1.5s each require 300 seconds. **Nginx terminates the request at 60 seconds (`proxy_read_timeout 60s`)**, returning HTTP 504 Gateway Timeout while Node continues creating BOMs blindly in the background.
  - In `backend/services/bomJobManager.js:553`, `createBomFromData` does not reuse connections; it opens and closes a new RFC connection for each item in the batch. 200 items generate **200 separate TCP/RFC handshakes**!
  - Job state is persisted to a single local JSON file (`mock/bomJobSummaries.json`). It is not resilient across Node cluster workers or multi-instance containers.

---

### 1.5 Cross-User Safety & Global State Vulnerabilities
* **CRITICAL FLAW - Server Context Race Condition**:
  - In `backend/services/sapRfcClient.js` (lines 43–52):
    ```javascript
    let currentActiveServer = null;
    export function setActiveRfcServer(server) {
      if (server && (server.sap_username || server.ashost || server.id)) {
        currentActiveServer = server;
      }
    }
    ```
  - In `backend/middleware/auth.js` (lines 123 & 258):
    ```javascript
    req.selectedServer = accessCheck.server;
    setActiveRfcServer(accessCheck.server);
    ```
  - **Risk**: `currentActiveServer` is a **module-level singleton**. Node.js handles concurrent async requests on a single event loop. When User A (accessing Server 1) and User B (accessing Server 2) issue concurrent requests, User B's auth middleware overwrites `currentActiveServer`. If User A triggers any RFC function where `server` is resolved via fallback (`getRfcConnectionParams()` at line 69), **User A's operation executes against User B's SAP server**!
* **GUI User Collision**:
  - `backend/services/sapGuiClient.js` (line 366) maintains `let cachedActiveSapUser = null;` shared across all users.
* **Shared Job Storage File**:
  - `JOB_SUMMARIES_FILE = path.join(__dirname, '..', 'mock', 'bomJobSummaries.json')` (`bomJobManager.js:17`): All users read and write to the same un-locked file.

---

### 1.6 Concurrency Safety of Operations
* **Simultaneous Write to Same BOM**:
  - Neither the frontend nor the backend performs pre-emptive application-level locking on `(serverId, matnr, werks, stlan, stlal)`.
  - When two users attempt to create, copy, or delete the same BOM concurrently, both requests hit SAP.
  - The first request acquires SAP's internal enqueue lock (`ENQUEUE_EMMASTE`).
  - The second request is rejected by SAP with `CSAP 028: Material BOM is locked by user <TECHNICAL_USER>`. Because both users share the technical user credentials, the error message confuses users ("locked by myself").
* **Write Retries**:
  - Neither `sapRfcClient.js` nor `bomJobManager.js` performs automatic blind retries on RFC write errors. `bomJobManager.js:627` explicitly documents: `// Regular item failure: record failure, DO NOT retry, continue with next BOM`. This prevents accidental duplicate creations.

---

### 1.7 Error Handling and Audit Logging
* **Error Sanitization**:
  - `backend/utils/friendlyError.js` (`toFriendlyError`) redacts internal IP addresses and file paths via regex, and maps low-level network errors (`RFC_COMMUNICATION_FAILURE`, `WSAECONNREFUSED`, `ETIMEDOUT`) to user-friendly codes (`SAP_UNREACHABLE`, `SAP_BUSY`, `SAP_NOT_AUTHORIZED`).
  - Generates a unique traceable `error_ref` (e.g. `ERR-8F2A-4B1C`) logged in backend logs and returned to the client.
* **Audit Trail**:
  - `backend/utils/auditHelper.js` (`recordRouteAudit`) logs `requestId`, `userEmail`, `userRole`, `action`, `feature`, `serverId`, `serverName`, `durationMs`, and `details` to Supabase `audit_logs`.

---

### 1.8 Server Health Check Frequency & Overhead
* **High-Frequency Polling**:
  - `frontend/src/App.jsx` (lines 685–715) runs a continuous `useEffect` loop polling `/api/sap/session-status` **every 5 seconds**.
* **Underlying RFC Ping Overhead**:
  - In `backend/routes/sap.js` (line 247), every `/api/sap/session-status` poll calls `await pingRfcServer(targetServer)`.
  - In `backend/services/sapRfcClient.js` (lines 270–285), `pingRfcServer` creates a brand new RFC client, negotiates a TCP/RFC handshake, calls `RFC_PING`, and tears down the connection.
  - **Verdict**: With 10 connected browser tabs, RexaEdge executes **120 full RFC connection open/ping/close cycles per minute** solely to paint the status dot. During SAP slowdowns or outages, 10 pending requests stack up in Node every 5 seconds, exacerbating gateway congestion.

---

## PART 2 - Empirical Load Simulation & Measurements

To measure behavior under realistic stress, a local load test suite (`backend/test/load/mockRfcEngine.js` and `backend/test/load/loadSimulator.js`) was developed and executed. The simulator ran 10 concurrent virtual users executing a realistic mix of operations (F4 searches, display, validate, single create/copy/delete, and two 200-row bulk jobs).

### Load Simulation Results Table

| # | Scenario | p50 (ms) | p95 (ms) | Error Rate | Peak RFC Conns | First Failure Point Identified |
|---|---|---|---|---|---|---|
| **a** | **Normal SAP** (200–800ms RFC latency) | 640 ms | 800 ms | **0.0%** | 10 | **None**: Stable under baseline latency when SAP allows unlimited connections. |
| **b** | **Slow SAP** (5–30s latency per call) | 12,500 ms | 28,400 ms | **0.0%** | 10 | **Nginx & Browser Timeout**: If an operation triggers 3 sequential RFC calls (e.g. read + create + verify), total latency exceeds 60s. Nginx hits `proxy_read_timeout 60s` and terminates the request while Node continues running. |
| **c** | **SAP Outage & Recovery** (60s down) | 25 ms | 80 ms | **50.0%** | 5 | **Gateway Refusal**: All requests during outage immediately reject (`WSAECONNREFUSED`). No circuit breaker exists, so the 5s UI poll loops flood the gateway with failing connection attempts. |
| **d** | **Connection Cap Exceeded** (Max 5 conns) | 65 ms | 110 ms | **50.0%** | 5 | **Immediate Rejection**: With 10 users and no client queue, the 6th, 7th, 8th concurrent calls immediately crash with `MAX_CONNECTIONS_EXCEEDED`. |
| **e** | **Same BOM Concurrency Collision** | 95 ms | 118 ms | **50.0%** | 2 | **SAP Enqueue Rejection**: Second concurrent write to the same BOM fails with `CSAP 028: Material BOM is locked by user <TECHNICAL_USER>`. App has no pre-emptive lock lease. |
| **f** | **Bulk (2x200 rows) + Interactive** | 45 ms | 88 ms | **0.0%*** | 7 | **Work Process Exhaustion**: Bulk jobs open/close hundreds of rapid connections. Without priority queuing, interactive F4 queries compete directly with bulk rows. (*Would fail in real SAP if `rdisp/rfc_max_own_used_wp` is exceeded). |
| **g** | **Dual Server Parallelism** | 320 ms | 390 ms | **0.0%*** | 2 | **Global State Corruption**: Asynchronous event loop allows Server B to finish without waiting for Server A; however, `setActiveRfcServer()` module singleton causes credentials from Server A to leak into Server B. |

---

## PART 3 - Production Ready Architecture Proposal

### 3.1 Connection Pool & Priority Queuing Architecture
To protect the SAP Gateway and eliminate the overhead of repeated TCP/RFC handshakes:
1. **Per-Server Connection Pool**:
   - Implement an explicit connection pool per configured SAP server using `generic-pool` or a native queue manager.
   - Maintain a pool of reusable open `Client` connections (e.g. min 2, max 6 per server).
2. **Priority Request Queue**:
   - Incoming RFC requests enter a priority queue per server:
     - **Priority 1 (Interactive Value Help)**: Plant, SLoc, BOM Usage F4 lookups (<100ms response expectation).
     - **Priority 2 (Interactive User Actions)**: Single BOM display, validate, single create/delete.
     - **Priority 3 (Background Bulk Jobs)**: Bulk row items executed only when free worker slots exist.
3. **Queue Timeouts & Caps**:
   - `queueWaitTimeout`: 10 seconds. If an interactive query cannot acquire an RFC connection within 10s, fail fast with `SAP_BUSY`.
   - `callTimeout`: 30 seconds per individual RFC call.

### 3.2 User Fairness & Anti-Starvation Controls
1. **Per-User Concurrency Cap**:
   - Enforce a limit of **maximum 2 concurrent in-flight RFC calls per user on the same server**.
   - If User 1 fires 5 operations (or a bulk job), Users 2–10 are not starved; subsequent requests from User 1 wait in their personal queue.
2. **Weighted Round-Robin Dispatch**:
   - The queue scheduler dispatches requests using round-robin between distinct active `user_id`s, ensuring no single user monopolizes the technical RFC connection slots.

### 3.3 Background Bulk Jobs (Production Hardening)
1. **Database Job Management**:
   - Deprecate in-memory maps and local file `mock/bomJobSummaries.json`.
   - Create tables `public.bom_jobs` and `public.bom_job_items` in Supabase with row-level security and indexing.
2. **Chunked Worker Execution**:
   - Execute bulk jobs in controlled batches of 10 BOMs per chunk, reusing a single leased connection from the pool for the chunk duration.
   - Insert progress updates to `bom_jobs` every chunk.
3. **Cancellation & Resumption**:
   - Workers check `cancel_requested` flag before every item. If cancelled, remaining items are marked `NOT_PROCESSED` without touching SAP.

### 3.4 Per-BOM Distributed Lock Leases
1. **Application-Level Lock Lease**:
   - Before dispatching a write operation (`CSAP_MAT_BOM_CREATE`, `CSAP_MAT_BOM_MAINTAIN`, `CSAP_MAT_BOM_DELETE`), acquire an in-memory or database lock lease on `(serverId, matnr, werks, stlan, stlal)` with a **30-second TTL**.
2. **Clear Error Attribution**:
   - If User 2 attempts to modify a BOM currently leased by User 1, return HTTP 409 Conflict immediately:
     *"BOM {material} in plant {plant} is currently being modified by {user_name}. Please try again shortly."*
   - Avoids triggering cryptic SAP enqueue errors under the shared technical user name.

### 3.5 Health Check Optimization & Circuit Breaker
1. **Throttled Server Health Ping**:
   - Replace direct RFC pings on every client poll with a **server-side background poller** that pings active SAP servers once every **30 seconds**.
   - The client endpoint `/api/sap/session-status` simply reads the cached status from memory, reducing RFC ping volume by **95%**.
2. **Circuit Breaker**:
   - If 3 consecutive RFC calls fail with connection drops or timeouts, open the circuit for **30 seconds**.
   - All subsequent requests return immediately with `SAP_UNREACHABLE` without attempting TCP connections.

### 3.6 Elimination of Global Singleton State
- Refactor `backend/services/sapRfcClient.js` to eliminate `let currentActiveServer = null;` and `setActiveRfcServer()`.
- Explicitly pass `server` context through the call chain or bind it to the request lifecycle via Node.js `AsyncLocalStorage`.

---

## PART 4 - Database Migrations & Implementation Plan

### 4.1 Required Database Migration (SQL Draft - DO NOT RUN)
```sql
-- migration_multi_user_readiness.sql
-- 1. Server Concurrency & Pool Configuration
ALTER TABLE public.sap_servers
  ADD COLUMN IF NOT EXISTS max_rfc_connections INTEGER NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS queue_timeout_ms INTEGER NOT NULL DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS call_timeout_ms INTEGER NOT NULL DEFAULT 30000;

-- 2. Granular User Server Permissions
ALTER TABLE public.user_server_permissions
  ADD COLUMN IF NOT EXISTS can_display BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_validate BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_create BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_copy BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_delete BOOLEAN NOT NULL DEFAULT false;

-- 3. Resilient Bulk Job Tables
CREATE TABLE IF NOT EXISTS public.bom_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_code TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES public.sap_servers(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'STOPPED_ON_CONNECTION_DROP')),
  total_items INTEGER NOT NULL DEFAULT 0,
  processed_items INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  cancel_requested BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  file_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.bom_job_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.bom_jobs(id) ON DELETE CASCADE,
  sequence_num INTEGER NOT NULL,
  material TEXT NOT NULL,
  plant TEXT NOT NULL,
  bom_usage TEXT NOT NULL DEFAULT '1',
  alternative_bom TEXT NOT NULL DEFAULT '01',
  status TEXT NOT NULL DEFAULT 'PENDING',
  message TEXT,
  discrepancies JSONB DEFAULT '[]'::jsonb,
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bom_jobs_user_server ON public.bom_jobs(user_id, server_id, status);
CREATE INDEX IF NOT EXISTS idx_bom_job_items_job_seq ON public.bom_job_items(job_id, sequence_num);
```

### 4.2 Implementation Scope & Effort Estimation

| Component / Task | Category | Files to Modify | Effort |
|---|---|---|---|
| **Eliminate `currentActiveServer` singleton** | **MUST-HAVE** | `backend/services/sapRfcClient.js`, `backend/middleware/auth.js` | Medium |
| **Per-Server Connection Pool & Queue** | **MUST-HAVE** | `backend/services/sapConnectionPool.js` (new), `sapRfcClient.js` | Large |
| **Health Check 30s Caching & Throttling** | **MUST-HAVE** | `backend/routes/sap.js`, `frontend/src/App.jsx` | Small |
| **Per-BOM Lock Lease Manager** | **MUST-HAVE** | `backend/services/bomLockService.js` (new), `bom.js` | Medium |
| **Circuit Breaker on Connection Drops** | **MUST-HAVE** | `backend/services/sapRfcClient.js` | Small |
| **Database-backed Bulk Job Queue** | **MUST-HAVE** | `backend/services/bomJobManager.js`, `backend/routes/bom.js` | Large |
| **Granular Server Permissions UI** | Nice-to-have | `frontend/src/components/AdminView.jsx`, `backend/routes/admin.js` | Medium |
| **Admin UI Server Telemetry & Live Conns** | Nice-to-have | `frontend/src/components/AdminView.jsx`, `backend/routes/admin.js` | Small |

---

## PART 5 - SAP Basis Team Coordination Checklist

Before configuring production connection limits, the SAP Basis administration team must be consulted regarding the following profile parameters:

1. **`rdisp/rfc_max_own_used_wp`**:
   - *Question*: What is the maximum percentage or absolute number of dialog work processes that our technical user account is permitted to consume simultaneously?
   - *Impact*: Governs our proposed pool default of **6 maximum connections**. If Basis restricts RFC users to 4 work processes, our pool max must be adjusted to 3.
2. **`gw/max_conn` & `gw/max_sys`**:
   - *Question*: What are the configured gateway connection caps on the target application server and SAProuter?
   - *Impact*: Dictates how many total external connections (pool + health check) can remain open without gateway drops.
3. **Technical User Type (`SU01`)**:
   - *Question*: Is the technical account configured as a **COMMUNICATION** or **SYSTEM** user type?
   - *Impact*: Communication/System users avoid password expiration lockouts and interactive license consumption, but must be granted explicit authorization for `S_RFC`, `S_TABU_DIS` (table reading), and `C_STUE_BER` (BOM management).
