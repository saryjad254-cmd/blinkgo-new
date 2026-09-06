-- Supabase reserves app_metadata.role for the Postgres JWT role
-- (normally "authenticated"). BlinkGo authorization uses app_role instead.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_role public.user_role := 'customer'::public.user_role;
  v_requested_role text;
  v_display_name text;
BEGIN
  v_requested_role := NEW.raw_app_meta_data->>'app_role';

  IF v_requested_role IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public'
         AND t.typname = 'user_role'
         AND e.enumlabel = v_requested_role
     ) THEN
    v_role := v_requested_role::public.user_role;
  END IF;

  v_display_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'name', ''),
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
    'New user'
  );

  INSERT INTO public.users (id, email, phone, name, role, is_verified)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.phone,
    v_display_name,
    v_role,
    NEW.email_confirmed_at IS NOT NULL OR NEW.phone_confirmed_at IS NOT NULL
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    name = COALESCE(NULLIF(public.users.name, ''), EXCLUDED.name),
    is_verified = EXCLUDED.is_verified,
    last_login_at = NOW(),
    updated_at = NOW();

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;
