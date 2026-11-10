-- Migration: Add RFC connection pool and queue configuration columns to sap_servers table
-- Created: 2026-11-09
-- Stage 2: Per-Server RFC Connection Pool & Priority Queue

ALTER TABLE public.sap_servers
  ADD COLUMN IF NOT EXISTS max_connections INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS per_user_limit INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS queue_timeout_ms INTEGER NOT NULL DEFAULT 20000,
  ADD COLUMN IF NOT EXISTS rfc_call_timeout_ms INTEGER NOT NULL DEFAULT 45000;

COMMENT ON COLUMN public.sap_servers.max_connections IS 'Maximum concurrent open RFC connections allowed for this SAP server (default 3)';
COMMENT ON COLUMN public.sap_servers.per_user_limit IS 'Maximum concurrent RFC connections a single user can hold simultaneously (default 2)';
COMMENT ON COLUMN public.sap_servers.queue_timeout_ms IS 'Maximum milliseconds a request may wait in queue before returning 503 SERVER_BUSY (default 20000)';
COMMENT ON COLUMN public.sap_servers.rfc_call_timeout_ms IS 'Maximum milliseconds an individual RFC/BAPI call may run before timing out (default 45000)';
