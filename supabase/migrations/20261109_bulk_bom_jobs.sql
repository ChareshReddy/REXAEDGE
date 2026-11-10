-- Migration: Create bom_jobs table for background bulk BOM operations
-- Created: 2026-11-09
-- Stage 4: Bulk Operations as Background Jobs

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

-- Indices for fast user lookup and status queue polling
CREATE INDEX IF NOT EXISTS idx_bom_jobs_user_created ON public.bom_jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bom_jobs_status ON public.bom_jobs (status);
CREATE INDEX IF NOT EXISTS idx_bom_jobs_server_status ON public.bom_jobs (server_id, status);

-- Enable Row Level Security (RLS)
ALTER TABLE public.bom_jobs ENABLE ROW LEVEL SECURITY;

-- Backend / Service Role has full access
CREATE POLICY bom_jobs_service_role_all ON public.bom_jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can view their own jobs
CREATE POLICY bom_jobs_select_own ON public.bom_jobs
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE public.users.id = auth.uid()
      AND public.users.role = 'admin'
    )
  );

COMMENT ON TABLE public.bom_jobs IS 'Stores background bulk BOM jobs (validate, create, copy, delete) with chunk progress and row results';
