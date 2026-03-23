-- Audit Logs Table
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  user_email text,
  action text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Index for quick lookups by action and time
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);

-- Enable RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Authenticated users can INSERT audit logs (needed for logging)
CREATE POLICY "Authenticated users can insert audit logs"
  ON audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Only admin can view audit logs
CREATE POLICY "Admin can view audit logs"
  ON audit_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = '2fc7703e-c987-489b-ab3c-43181b4ca24d');

-- Nobody can update or delete audit logs (immutable)
-- No UPDATE or DELETE policies = no one can modify them
