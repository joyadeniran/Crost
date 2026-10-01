CREATE TABLE IF NOT EXISTS public.idempotency_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'POST',
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  request_hash TEXT NOT NULL,
  response JSONB,
  status_code INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idempotency_log_unique_request
  ON public.idempotency_log (
    idempotency_key,
    endpoint,
    method,
    COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS idempotency_log_user_created_at_idx
  ON public.idempotency_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idempotency_log_created_at_idx
  ON public.idempotency_log (created_at);

ALTER TABLE public.idempotency_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own idempotency records"
  ON public.idempotency_log
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own idempotency records"
  ON public.idempotency_log
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own idempotency records"
  ON public.idempotency_log
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.idempotency_log IS 'Stores short-lived POST responses keyed by Idempotency-Key to prevent duplicate user-triggered operations.';
