-- ============================================================
-- BlinkGo MVP — Auth Sync
-- ============================================================
-- يُصلِح الانفصال بين auth.users و public.users
-- يجب تشغيله بعد supabase-schema.sql الأساسي
-- ============================================================

-- الدالة المساعِدة: تستخرج/تُنشئ صفًا في public.users عند تسجيل دخول جديد
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_default_role TEXT := 'customer';
  v_display_name TEXT;
BEGIN
  -- اشتقاق الاسم من metadata إن وُجد، وإلا من email
  v_display_name := COALESCE(
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1),
    'مستخدم جديد'
  );

  INSERT INTO public.users (id, email, phone, name, role, is_verified)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.phone,
    v_display_name,
    COALESCE(NEW.raw_user_meta_data->>'role', v_default_role),
    NEW.email_confirmed_at IS NOT NULL OR NEW.phone_confirmed_at IS NOT NULL
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    name = COALESCE(public.users.name, EXCLUDED.name),
    is_verified = EXCLUDED.is_verified,
    last_login_at = NOW(),
    updated_at = NOW();

  RETURN NEW;
END;
$$;

-- Trigger: عند إنشاء صف في auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Trigger: عند تحديث (تأكيد email أو phone، تحديث metadata)
CREATE OR REPLACE FUNCTION public.handle_user_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users
  SET
    email = NEW.email,
    phone = NEW.phone,
    is_verified = (NEW.email_confirmed_at IS NOT NULL OR NEW.phone_confirmed_at IS NOT NULL),
    last_login_at = COALESCE(NEW.last_sign_in_at, public.users.last_login_at),
    updated_at = NOW()
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_update();

-- عند تأكيد Email أو Phone يدويًا، حدّث is_verified
CREATE OR REPLACE FUNCTION public.handle_email_confirmed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL THEN
    UPDATE public.users SET is_verified = true, updated_at = NOW() WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_email_confirmed
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_email_confirmed();

-- إصلاح auth_role() لتعمل بشكل صحيح
CREATE OR REPLACE FUNCTION auth_role() RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.users WHERE id = auth.uid()),
    'anon'
  );
$$;

-- ملاحظة: SECURITY DEFINER تجعل الدالة تنفذ بصلاحيات مالكها، مما يسمح بتجاوز RLS
-- هذا آمن هنا لأن الدالة تقرأ فقط صف المستخدم الحالي

COMMENT ON FUNCTION public.handle_new_user() IS 'Trigger function: ينسخ مستخدم جديد من auth.users إلى public.users';
COMMENT ON FUNCTION public.handle_user_update() IS 'Trigger function: يزامن تحديثات auth.users إلى public.users';
COMMENT ON FUNCTION auth_role() IS 'Helper: يُرجع دور المستخدم الحالي من public.users';