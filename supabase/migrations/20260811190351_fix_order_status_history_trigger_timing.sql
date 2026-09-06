-- The parent order must exist before its history row can satisfy the FK.
-- Keep timestamp mutation in a BEFORE trigger and audit insertion in AFTER.
DROP TRIGGER IF EXISTS trg_log_order_status_change ON public.orders;

CREATE OR REPLACE FUNCTION public.set_order_status_changed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.last_status_change_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.order_status_history
      (order_id, from_status, to_status, changed_by_role, note)
    VALUES
      (NEW.id, NULL, NEW.status, 'system', 'order created');
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.order_status_history
      (order_id, from_status, to_status, changed_by_role, note)
    VALUES
      (NEW.id, OLD.status, NEW.status, COALESCE(NEW.cancelled_by, 'system'), NEW.cancellation_reason);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_set_order_status_changed_at
BEFORE UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.set_order_status_changed_at();

CREATE TRIGGER trg_log_order_status_change
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.log_order_status_change();

REVOKE ALL ON FUNCTION public.set_order_status_changed_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_order_status_change() FROM PUBLIC, anon, authenticated;
