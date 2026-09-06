-- Admin Auth creation stores custom app metadata after the initial identity
-- insert. Synchronize the trusted app_role on subsequent Auth updates too.
CREATE OR REPLACE FUNCTION public.handle_user_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_role public.user_role;
  v_requested_role text;
BEGIN
  SELECT role INTO v_role
  FROM public.users
  WHERE id = NEW.id;

  v_role := COALESCE(v_role, 'customer'::public.user_role);
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

  UPDATE public.users
  SET
    email = NEW.email,
    phone = NEW.phone,
    role = v_role,
    is_verified = (NEW.email_confirmed_at IS NOT NULL OR NEW.phone_confirmed_at IS NOT NULL),
    last_login_at = COALESCE(NEW.last_sign_in_at, public.users.last_login_at),
    updated_at = NOW()
  WHERE id = NEW.id;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_user_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_user_update() FROM anon;
REVOKE ALL ON FUNCTION public.handle_user_update() FROM authenticated;
