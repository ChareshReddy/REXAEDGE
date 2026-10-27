-- ============================================================================
-- IDEMPOTENT MIGRATION: Per-User, Per-Server BOM App Permissions
-- Migration: 20261027_per_user_per_server_app_permissions.sql
-- Description:
--   Extends public.user_server_permissions with a granular permissions array.
--   Migrates existing user-server access rows:
--     - If server had 'bom' module enabled in server_modules, grants all 5 apps:
--       ARRAY['bom.display', 'bom.validate', 'bom.create', 'bom.copy', 'bom.delete']
--     - If server did not have 'bom' module enabled, leaves permissions as '{}' (none).
--   Existing users lose nothing they have today.
--   Includes complete rollback script.
--
-- IMPORTANT: DO NOT EXECUTE AUTOMATICALLY AGAINST PRODUCTION SUPABASE.
-- ============================================================================

-- 1. Add permissions array column if not already present
ALTER TABLE public.user_server_permissions
ADD COLUMN IF NOT EXISTS permissions TEXT[] NOT NULL DEFAULT '{}';

-- 2. Data Migration:
--    For every existing user-server access row, grant all 5 bom.* apps if that server
--    had the 'bom' module enabled in server_modules, otherwise grant none.
UPDATE public.user_server_permissions usp
SET permissions = ARRAY[
  'bom.display',
  'bom.validate',
  'bom.create',
  'bom.copy',
  'bom.delete'
]
WHERE EXISTS (
  SELECT 1 FROM public.server_modules sm
  WHERE sm.server_id = usp.server_id
    AND sm.module_key = 'bom'
)
AND (usp.permissions IS NULL OR cardinality(usp.permissions) = 0);

-- 3. GIN index for efficient array containment operations
CREATE INDEX IF NOT EXISTS idx_user_server_permissions_gin
ON public.user_server_permissions USING GIN (permissions);

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- ROLLBACK SCRIPT (To revert this migration, run the following block):
-- ============================================================================
/*
DROP INDEX IF EXISTS public.idx_user_server_permissions_gin;
ALTER TABLE public.user_server_permissions DROP COLUMN IF EXISTS permissions;
NOTIFY pgrst, 'reload schema';
*/
