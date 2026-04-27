-- Migration: Add check_user_exists RPC
-- Purpose: Safely check if an email is registered to satisfy Spec §15.6 
-- while bypassing Supabase's built-in Enumeration Protection for the signup UX.

CREATE OR REPLACE FUNCTION public.check_user_exists(email_to_check TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with elevated privileges to read auth.users
SET search_path = public, auth
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM auth.users 
    WHERE email = email_to_check
  );
END;
$$;

-- Grant permission to anonymous users to call this check
GRANT EXECUTE ON FUNCTION public.check_user_exists(TEXT) TO anon, authenticated;
