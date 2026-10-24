-- ============================================================================
-- IDEMPOTENT MIGRATION: SAP Servers, Credentials, Modules & Security Hardening
-- Run this script in the Supabase SQL Editor
-- ============================================================================

-- 1. Add missing credential columns to sap_servers if they do not exist
ALTER TABLE public.sap_servers ADD COLUMN IF NOT EXISTS sap_username TEXT;
ALTER TABLE public.sap_servers ADD COLUMN IF NOT EXISTS sap_password_encrypted TEXT;

-- 2. Update environment check constraint on sap_servers to allow SANDBOX, DEV, QA, PROD
ALTER TABLE public.sap_servers DROP CONSTRAINT IF EXISTS sap_servers_environment_check;
ALTER TABLE public.sap_servers ADD CONSTRAINT sap_servers_environment_check 
  CHECK (environment IN ('SANDBOX', 'DEV', 'QA', 'PROD'));

-- 3. Create server_modules table with ON DELETE CASCADE and unique constraint
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

-- 4. Enable default 'bom' module for every existing server that does not have it
INSERT INTO public.server_modules (server_id, module_key)
SELECT id, 'bom' FROM public.sap_servers
ON CONFLICT (server_id, module_key) DO NOTHING;

-- 5. Enable Row Level Security (RLS) on sensitive tables
ALTER TABLE public.sap_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_server_permissions ENABLE ROW LEVEL SECURITY;

-- 6. Remove any client-facing policies for anon/authenticated roles
-- With RLS enabled and NO policies granted to anon or authenticated,
-- ONLY the backend service_role key can access these tables.
DROP POLICY IF EXISTS "Users can view permitted servers" ON public.sap_servers;
DROP POLICY IF EXISTS "Users can view modules for permitted servers" ON public.server_modules;
DROP POLICY IF EXISTS "Users can read own permissions" ON public.user_server_permissions;
DROP POLICY IF EXISTS "Allow anon read sap_servers" ON public.sap_servers;
DROP POLICY IF EXISTS "Allow authenticated read sap_servers" ON public.sap_servers;
DROP POLICY IF EXISTS "Allow anon read server_modules" ON public.server_modules;
DROP POLICY IF EXISTS "Allow authenticated read server_modules" ON public.server_modules;
DROP POLICY IF EXISTS "Allow anon read user_server_permissions" ON public.user_server_permissions;
DROP POLICY IF EXISTS "Allow authenticated read user_server_permissions" ON public.user_server_permissions;

-- 7. Notify PostgREST to immediately refresh its schema cache
NOTIFY pgrst, 'reload schema';
