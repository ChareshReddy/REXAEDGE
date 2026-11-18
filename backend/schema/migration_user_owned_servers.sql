-- ============================================================================
-- MIGRATION: User-Owned SAP Servers, First-Login Flag, Allowlist, and Lockout
-- Strictly Additive Migration (NO DROP, NO DELETE, NO TRUNCATE, NO COLUMN REMOVAL)
-- Single source of truth for user state: public.users
-- Run manually after a database backup
-- ============================================================================

-- 1. Extend public.sap_servers with User-Ownership and Lifecycle columns
ALTER TABLE public.sap_servers ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);
ALTER TABLE public.sap_servers ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.sap_servers ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.sap_servers ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
ALTER TABLE public.sap_servers ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_sap_servers_owner_id ON public.sap_servers(owner_id);
CREATE INDEX IF NOT EXISTS idx_sap_servers_is_disabled ON public.sap_servers(is_disabled);
CREATE INDEX IF NOT EXISTS idx_sap_servers_is_default ON public.sap_servers(is_default);

-- LEGACY SERVER ASSIGNMENT NOTE:
-- Existing servers in public.sap_servers will initially have owner_id = NULL.
-- Servers without an owner cannot be accessed or used by any user until assigned.
-- To assign ownership of a legacy server to a specific user, an administrator runs:
--   UPDATE public.sap_servers SET owner_id = '<user_uuid>', updated_at = now() WHERE id = '<server_uuid>';
-- To set it as the user's default server:
--   UPDATE public.sap_servers SET is_default = true WHERE id = '<server_uuid>' AND owner_id = '<user_uuid>';

-- 2. Extend public.users with must_change_password, is_disabled, and lifecycle tracking
-- Single source of truth for auth status (read on every request, write-restricted to service-role)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS disabled_by UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_users_must_change_pwd ON public.users(must_change_password);
CREATE INDEX IF NOT EXISTS idx_users_is_disabled ON public.users(is_disabled);

-- 3. Server Allowlist Table (Admin Managed)
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

ALTER TABLE public.server_allowlist ENABLE ROW LEVEL SECURITY;

-- 4. Sign-in Failed Attempts & Lockout Table
CREATE TABLE IF NOT EXISTS public.auth_login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_auth_login_attempts_email ON public.auth_login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_auth_login_attempts_locked ON public.auth_login_attempts(locked_until);

ALTER TABLE public.auth_login_attempts ENABLE ROW LEVEL SECURITY;
-- Managed exclusively by backend service-role API; no direct user access.

-- 5. Additive Row Level Security (RLS) Policies
-- public.users already has SELECT policy for own row ("Users can read own profile");
-- No UPDATE policy exists for authenticated users, ensuring must_change_password
-- and is_disabled are only writable by the backend service role.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'server_allowlist' AND policyname = 'Allowlist viewable by authenticated users'
  ) THEN
    CREATE POLICY "Allowlist viewable by authenticated users" ON public.server_allowlist FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sap_servers' AND policyname = 'Users can manage own servers'
  ) THEN
    CREATE POLICY "Users can manage own servers" ON public.sap_servers FOR ALL USING (owner_id = auth.uid());
  END IF;
END $$;

-- ============================================================================
-- ROLLBACK INSTRUCTIONS (Reference only - execute only when reversing migration)
-- ============================================================================
-- To roll back, an administrator would:
-- 1. Disable server ownership policy:
--    ALTER POLICY "Users can manage own servers" ON public.sap_servers DISABLE;
-- 2. Remove added tables:
--    TABLE public.server_allowlist, public.auth_login_attempts
-- 3. Remove added columns from public.users:
--    COLUMN must_change_password, is_disabled, disabled_at, disabled_by
-- 4. Remove added columns from public.sap_servers:
--    COLUMN owner_id, is_disabled, is_default, last_used_at, created_by
