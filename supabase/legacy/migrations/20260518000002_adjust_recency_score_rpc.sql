-- Migration: Atomic recency score adjustment RPC
-- Provides an atomic update for orc_context.recency_score that avoids
-- read-modify-write races when adjustRecencyScores runs concurrently.

CREATE OR REPLACE FUNCTION adjust_orc_context_recency_score(
  p_context_id UUID,
  p_user_id    UUID,
  p_delta      INTEGER
)
RETURNS INTEGER  -- returns the new score
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_score INTEGER;
BEGIN
  UPDATE orc_context
  SET recency_score = GREATEST(10, LEAST(100, recency_score + p_delta))
  WHERE id = p_context_id
    AND user_id = p_user_id
  RETURNING recency_score INTO v_new_score;

  RETURN COALESCE(v_new_score, -1);  -- -1 signals row not found
END;
$$;

-- Grant execute to authenticated users and service role
GRANT EXECUTE ON FUNCTION adjust_orc_context_recency_score(UUID, UUID, INTEGER)
  TO authenticated, service_role;
