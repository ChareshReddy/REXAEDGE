-- ============================================================================
-- CONSOLIDATED FULL DATABASE SETUP FOR REXAEDGE / SAP OPERATIONS ASSISTANT
-- Run this entire script in your Supabase SQL Editor (or psql / pgAdmin / DBeaver)
-- Safe, fully idempotent (all statements use IF NOT EXISTS / CREATE OR REPLACE)
-- ============================================================================

-- 1. PUBLIC USERS TABLE (Mirrors auth.users with app role & auth lifecycle flags)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  is_disabled BOOLEAN NOT NULL DEFAULT false,
  disabled_at TIMESTAMPTZ,
  disabled_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS disabled_by UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_must_change_pwd ON public.users(must_change_password);
CREATE INDEX IF NOT EXISTS idx_users_is_disabled ON public.users(is_disabled);

-- 2. SAP SERVERS TABLE (Supports user-ownership, RFC pools, credentials & limits)
CREATE TABLE IF NOT EXISTS public.sap_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  ashost TEXT NOT NULL,
  sysnr TEXT NOT NULL,
  client TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'EN',
  environment TEXT NOT NULL CHECK (environment IN ('SANDBOX', 'DEV', 'QA', 'PROD')),
  router TEXT DEFAULT NULL,
  gwserv TEXT DEFAULT '3309',
  sap_username TEXT,
  sap_password_encrypted TEXT,
  connection_test JSONB DEFAULT NULL,
  max_connections INTEGER NOT NULL DEFAULT 3,
  per_user_limit INTEGER NOT NULL DEFAULT 2,
  queue_timeout_ms INTEGER NOT NULL DEFAULT 20000,
  rfc_call_timeout_ms INTEGER NOT NULL DEFAULT 45000,
  owner_id UUID REFERENCES auth.users(id),
  is_disabled BOOLEAN NOT NULL DEFAULT false,
  is_default BOOLEAN NOT NULL DEFAULT false,
  last_used_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Ensure all additive columns exist on sap_servers
ALTER TABLE public.sap_servers ADD COLUMN IF NOT EXISTS sap_username TEXT;
ALTER TABLE public.sap_servers ADD COLUMN IF NOT EXISTS sap_password_encrypted TEXT;
ALTER TABLE public.sap_servers ADD COLUMN IF NOT EXISTS connection_test JSONB DEFAULT NULL;
ALTER TABLE public.sap_servers ADD COLUMN IF NOT EXISTS max_connections INTEGER NOT NULL DEFAULT 3;
ALTER TABLE public.sap_servers ADD COLUMN IF NOT EXISTS per_user_limit INTEGER NOT NULL DEFAULT 2;
ALTER TABLE public.sap_servers ADD COLUMN IF NOT EXISTS queue_timeout_ms INTEGER NOT NULL DEFAULT 20000;
ALTER TABLE public.sap_servers ADD COLUMN IF NOT EXISTS rfc_call_timeout_ms INTEGER NOT NULL DEFAULT 45000;
ALTER TABLE public.sap_servers ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);
ALTER TABLE public.sap_servers ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.sap_servers ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.sap_servers ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
ALTER TABLE public.sap_servers ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_sap_servers_env ON public.sap_servers(environment);
CREATE INDEX IF NOT EXISTS idx_sap_servers_active ON public.sap_servers(is_active);
CREATE INDEX IF NOT EXISTS idx_sap_servers_owner_id ON public.sap_servers(owner_id);
CREATE INDEX IF NOT EXISTS idx_sap_servers_is_disabled ON public.sap_servers(is_disabled);
CREATE INDEX IF NOT EXISTS idx_sap_servers_is_default ON public.sap_servers(is_default);

-- 3. USER-SERVER PERMISSIONS TABLE (Legacy / Multi-user assignment compatibility)
CREATE TABLE IF NOT EXISTS public.user_server_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES public.sap_servers(id) ON DELETE CASCADE,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  granted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_user_server UNIQUE (user_id, server_id)
);

ALTER TABLE public.user_server_permissions ADD COLUMN IF NOT EXISTS permissions TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_user_server_perms_user ON public.user_server_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_server_perms_server ON public.user_server_permissions(server_id);
CREATE INDEX IF NOT EXISTS idx_user_server_permissions_gin ON public.user_server_permissions USING GIN (permissions);

-- 4. SERVER MODULES TABLE
CREATE TABLE IF NOT EXISTS public.server_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.sap_servers(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  enabled_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  enabled_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_server_module UNIQUE (server_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_server_modules_server ON public.server_modules(server_id);
CREATE INDEX IF NOT EXISTS idx_server_modules_key ON public.server_modules(module_key);

-- 5. AUDIT LOGS TABLE
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

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at_desc ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_email ON public.audit_logs (user_email);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON public.audit_logs (status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_server_id ON public.audit_logs (server_id);

-- 6. ERROR LOGS TABLE
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

CREATE INDEX IF NOT EXISTS idx_error_logs_created_at_desc ON public.error_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_error_ref ON public.error_logs (error_ref);
CREATE INDEX IF NOT EXISTS idx_error_logs_user_email ON public.error_logs (user_email);
CREATE INDEX IF NOT EXISTS idx_error_logs_source ON public.error_logs (source);
CREATE INDEX IF NOT EXISTS idx_error_logs_server_id ON public.error_logs (server_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_http_status ON public.error_logs (http_status);

-- 7. BOM BACKGROUND JOBS TABLE
CREATE TABLE IF NOT EXISTS public.bom_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  server_id UUID,
  action TEXT NOT NULL CHECK (action IN ('validate', 'create', 'copy', 'delete')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted')),
  total_rows INTEGER NOT NULL DEFAULT 0,
  processed_rows INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  input JSONB DEFAULT '{}'::jsonb,
  results JSONB DEFAULT '[]'::jsonb,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bom_jobs_user_created ON public.bom_jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bom_jobs_status ON public.bom_jobs (status);
CREATE INDEX IF NOT EXISTS idx_bom_jobs_server_status ON public.bom_jobs (server_id, status);

-- 8. SERVER ALLOWLIST TABLE (Admin Managed SSRF Defense)
CREATE TABLE IF NOT EXISTS public.server_allowlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Sandbox', 'Development', 'Production', 'QA')),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_server_allowlist_type ON public.server_allowlist(type);
CREATE INDEX IF NOT EXISTS idx_server_allowlist_pattern ON public.server_allowlist(pattern);

-- 9. AUTH LOGIN ATTEMPTS TABLE (Brute-force lockout tracking)
CREATE TABLE IF NOT EXISTS public.auth_login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_auth_login_attempts_email ON public.auth_login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_auth_login_attempts_locked ON public.auth_login_attempts(locked_until);

-- 10. AUTH TRIGGER (Auto-create public.users row on auth.users insert)
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'role', 'user')
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- 11. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sap_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_server_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bom_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_allowlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_login_attempts ENABLE ROW LEVEL SECURITY;

-- Users RLS: users can read their own profile; service_role manages all
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'Users can read own profile') THEN
    CREATE POLICY "Users can read own profile" ON public.users FOR SELECT USING (auth.uid() = id);
  END IF;
END $$;

-- SAP Servers RLS: users can manage own servers; or view permitted servers
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sap_servers' AND policyname = 'Users can manage own servers') THEN
    CREATE POLICY "Users can manage own servers" ON public.sap_servers FOR ALL USING (owner_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sap_servers' AND policyname = 'Users can view permitted servers') THEN
    CREATE POLICY "Users can view permitted servers" ON public.sap_servers FOR SELECT USING (
      is_active = true AND EXISTS (
        SELECT 1 FROM public.user_server_permissions
        WHERE user_server_permissions.server_id = sap_servers.id
        AND user_server_permissions.user_id = auth.uid()
      )
    );
  END IF;
END $$;

-- Permissions RLS
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_server_permissions' AND policyname = 'Users can read own permissions') THEN
    CREATE POLICY "Users can read own permissions" ON public.user_server_permissions FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- Server Modules RLS
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'server_modules' AND policyname = 'Users can view modules for permitted servers') THEN
    CREATE POLICY "Users can view modules for permitted servers" ON public.server_modules FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.user_server_permissions
        WHERE user_server_permissions.server_id = server_modules.server_id
        AND user_server_permissions.user_id = auth.uid()
      )
    );
  END IF;
END $$;

-- Bom Jobs RLS
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bom_jobs' AND policyname = 'bom_jobs_service_role_all') THEN
    CREATE POLICY bom_jobs_service_role_all ON public.bom_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bom_jobs' AND policyname = 'bom_jobs_select_own') THEN
    CREATE POLICY bom_jobs_select_own ON public.bom_jobs FOR SELECT TO authenticated USING (
      auth.uid() = user_id OR EXISTS (
        SELECT 1 FROM public.users WHERE public.users.id = auth.uid() AND public.users.role = 'admin'
      )
    );
  END IF;
END $$;

-- Allowlist RLS
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'server_allowlist' AND policyname = 'Allowlist viewable by authenticated users') THEN
    CREATE POLICY "Allowlist viewable by authenticated users" ON public.server_allowlist FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- 12. SEED INITIAL DATA
-- Allowlist entries for local mock / development / sandbox hosts
INSERT INTO public.server_allowlist (pattern, type, comment)
VALUES
  ('127.0.0.1', 'Sandbox', 'Localhost mock SAP server'),
  ('localhost', 'Sandbox', 'Localhost mock SAP server'),
  ('192.168.12.*', 'Sandbox', 'Default sandbox cluster subnet'),
  ('10.*', 'Development', 'Internal dev network subnet'),
  ('103.206.249.51', 'Sandbox', 'SAP router host')
ON CONFLICT DO NOTHING;

-- Initial SAP servers
INSERT INTO public.sap_servers (name, ashost, sysnr, client, lang, environment, router, gwserv, is_active)
VALUES
  ('Relaxo S4A Sandbox', '192.168.12.241', '09', '500', 'EN', 'DEV', '/H/103.206.249.51/H/', '3309', true),
  ('Enterprise Staging QA', '192.168.12.242', '01', '200', 'EN', 'QA', '/H/103.206.249.51/H/', '3301', true),
  ('Global S/4HANA Production', '192.168.12.250', '00', '100', 'EN', 'PROD', '/H/103.206.249.51/H/', '3300', true)
ON CONFLICT DO NOTHING;

-- Enable 'bom' module for default servers
INSERT INTO public.server_modules (server_id, module_key)
SELECT id, 'bom' FROM public.sap_servers
ON CONFLICT (server_id, module_key) DO NOTHING;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
