-- ============================================================================
-- IDEMPOTENT MIGRATION: Add connection_test column to sap_servers
-- Run this script in the Supabase SQL Editor
-- ============================================================================

-- Add connection_test JSONB column to public.sap_servers idempotently
ALTER TABLE public.sap_servers ADD COLUMN IF NOT EXISTS connection_test JSONB DEFAULT NULL;

-- Notify PostgREST to immediately refresh its schema cache
NOTIFY pgrst, 'reload schema';
