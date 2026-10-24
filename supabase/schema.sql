-- ============================================================================
-- SUPABASE POSTGRESQL SCHEMA FOR SAP OPERATIONS ASSISTANT
-- Multi-User RBAC & Admin-Managed SAP Server Permissions
-- ============================================================================

-- 1. Create Public Users Table (mirrors auth.users with app role)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);

-- 2. Create SAP Servers Table
CREATE TABLE IF NOT EXISTS public.sap_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  ashost TEXT NOT NULL,
  sysnr TEXT NOT NULL,
  client TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'EN',
  environment TEXT NOT NULL CHECK (environment IN ('SANDBOX', 'DEV', 'QA', 'PROD')),
  router TEXT DEFAULT '/H/103.206.249.51/H/',
  gwserv TEXT DEFAULT '3309',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_sap_servers_env ON public.sap_servers(environment);
CREATE INDEX IF NOT EXISTS idx_sap_servers_active ON public.sap_servers(is_active);

-- 3. Create User-Server Permissions Table (Full Read + Write access per server)
CREATE TABLE IF NOT EXISTS public.user_server_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES public.sap_servers(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_user_server UNIQUE (user_id, server_id)
);

-- Migration for existing installations:
-- ALTER TABLE public.user_server_permissions DROP COLUMN IF EXISTS access_level;

CREATE INDEX IF NOT EXISTS idx_user_server_perms_user ON public.user_server_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_server_perms_server ON public.user_server_permissions(server_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sap_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_server_permissions ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
-- Users table: users can read their own profile; service_role can manage all
CREATE POLICY "Users can read own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);

-- Permissions: users can read their own permissions
CREATE POLICY "Users can read own permissions" ON public.user_server_permissions
  FOR SELECT USING (auth.uid() = user_id);

-- Servers: users can view active servers they have permission for
CREATE POLICY "Users can view permitted servers" ON public.sap_servers
  FOR SELECT USING (
    is_active = true AND EXISTS (
      SELECT 1 FROM public.user_server_permissions
      WHERE user_server_permissions.server_id = sap_servers.id
      AND user_server_permissions.user_id = auth.uid()
    )
  );

-- 6. Trigger to automatically create a public.users row on auth.users creation
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

-- 7. Seed Initial Default SAP Servers
INSERT INTO public.sap_servers (name, ashost, sysnr, client, lang, environment, router, gwserv, is_active)
VALUES
  ('Relaxo S4A Sandbox', '192.168.12.241', '09', '500', 'EN', 'DEV', '/H/103.206.249.51/H/', '3309', true),
  ('Enterprise Staging QA', '192.168.12.242', '01', '200', 'EN', 'QA', '/H/103.206.249.51/H/', '3301', true),
  ('Global S/4HANA Production', '192.168.12.250', '00', '100', 'EN', 'PROD', '/H/103.206.249.51/H/', '3300', true)
ON CONFLICT DO NOTHING;

-- 8. Create Server Modules Table
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

ALTER TABLE public.server_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view modules for permitted servers" ON public.server_modules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_server_permissions
      WHERE user_server_permissions.server_id = server_modules.server_id
      AND user_server_permissions.user_id = auth.uid()
    )
  );

-- Migration: Enable 'bom' for all existing servers so nothing breaks
INSERT INTO public.server_modules (server_id, module_key)
SELECT id, 'bom' FROM public.sap_servers
ON CONFLICT (server_id, module_key) DO NOTHING;

