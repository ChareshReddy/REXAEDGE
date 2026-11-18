-- Migration: Enable Row Level Security (RLS) on all public tables
-- Safe and idempotent: can be run repeatedly in Supabase SQL editor

ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sap_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_server_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.server_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bom_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.server_allowlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.auth_login_attempts ENABLE ROW LEVEL SECURITY;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
