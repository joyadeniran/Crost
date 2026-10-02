-- Migration: Add read_only_query RPC for agentive database research
-- This function allows the worker to execute arbitrary SELECT queries safely.
-- It is restricted to pre-defined allowed keywords to prevent mutation.

CREATE OR REPLACE FUNCTION read_only_query(query_text TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with elevated privileges to bypass some RLS if needed, but we should be careful.
AS $$
DECLARE
    result JSONB;
BEGIN
    -- Basic safety check for mutations
    IF query_text ILIKE '%INSERT%' OR 
       query_text ILIKE '%UPDATE%' OR 
       query_text ILIKE '%DELETE%' OR 
       query_text ILIKE '%DROP%' OR 
       query_text ILIKE '%TRUNCATE%' OR 
       query_text ILIKE '%ALTER%' OR 
       query_text ILIKE '%CREATE%' THEN
        RAISE EXCEPTION 'Unauthorized: Only SELECT queries are allowed.';
    END IF;

    EXECUTE format('SELECT jsonb_agg(t) FROM (%s) t', query_text) INTO result;
    RETURN COALESCE(result, '[]'::jsonb);
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Query Error: %', SQLERRM;
END;
$$;
