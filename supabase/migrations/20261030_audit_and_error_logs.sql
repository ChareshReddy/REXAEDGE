-- ============================================================================
-- IDEMPOTENT MIGRATION: Audit Logs and Error Logs (Admin-Only Activity Logging)
-- Migration: 20261030_audit_and_error_logs.sql
-- Description:
--   Creates additive audit_logs and error_logs tables with indexes and strict RLS.
--   Only the backend's Supabase service-role client can read or write to these tables.
--   No existing tables, columns, or data are modified or dropped.
--
-- IMPORTANT: DO NOT EXECUTE AUTOMATICALLY AGAINST PRODUCTION SUPABASE.
-- Back up your database before applying.
-- ============================================================================

-- 1. Create audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_id TEXT,
  user_id UUID,
  user_email TEXT,
  user_role TEXT,
  action TEXT NOT NULL,
  feature TEXT,
  server_id TEXT,
  server_name TEXT,
  target TEXT,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed')),
  message TEXT,
  ip TEXT,
  user_agent TEXT,
  duration_ms INTEGER,
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- 2. Create error_logs table
CREATE TABLE IF NOT EXISTS public.error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  error_ref TEXT NOT NULL,
  request_id TEXT,
  user_id UUID,
  user_email TEXT,
  server_id TEXT,
  server_name TEXT,
  source TEXT NOT NULL CHECK (source IN ('backend', 'sap', 'frontend')),
  method TEXT,
  route TEXT,
  http_status INTEGER,
  error_code TEXT,
  message TEXT NOT NULL,
  sap_message TEXT,
  stack TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- 3. Indexes for audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at_desc ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_email ON public.audit_logs (user_email);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON public.audit_logs (status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_server_id ON public.audit_logs (server_id);

-- 4. Indexes for error_logs
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at_desc ON public.error_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_error_ref ON public.error_logs (error_ref);
CREATE INDEX IF NOT EXISTS idx_error_logs_user_email ON public.error_logs (user_email);
CREATE INDEX IF NOT EXISTS idx_error_logs_source ON public.error_logs (source);
CREATE INDEX IF NOT EXISTS idx_error_logs_server_id ON public.error_logs (server_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_http_status ON public.error_logs (http_status);

-- 5. Enable Row Level Security (RLS) with NO public policies
-- (Ensures anon and normal user tokens cannot read or write; service-role bypasses RLS)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- 6. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- ROLLBACK SCRIPT (To revert this migration, execute the block below):
-- ============================================================================
/*
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.error_logs CASCADE;
NOTIFY pgrst, 'reload schema';
*/
