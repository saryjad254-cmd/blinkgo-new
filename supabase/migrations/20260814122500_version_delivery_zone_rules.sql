-- Versioned, schedulable delivery-zone pricing rules.
ALTER TABLE public.delivery_zones
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS effective_from timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS effective_to timestamptz;

ALTER TABLE public.delivery_zones DROP CONSTRAINT IF EXISTS delivery_zones_effective_window_check;
ALTER TABLE public.delivery_zones ADD CONSTRAINT delivery_zones_effective_window_check
  CHECK (effective_to IS NULL OR effective_to > effective_from);

CREATE INDEX IF NOT EXISTS idx_delivery_zones_effective
  ON public.delivery_zones (is_active, priority DESC, effective_from, effective_to);

CREATE OR REPLACE FUNCTION public.bump_delivery_zone_rule_version()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF ROW(NEW.polygon, NEW.center_lat, NEW.center_lng, NEW.radius_km, NEW.delivery_fee, NEW.min_order_amount, NEW.priority, NEW.effective_from, NEW.effective_to, NEW.is_active, NEW.surge_multiplier, NEW.surge_days, NEW.surge_start_local, NEW.surge_end_local, NEW.surge_timezone)
     IS DISTINCT FROM
     ROW(OLD.polygon, OLD.center_lat, OLD.center_lng, OLD.radius_km, OLD.delivery_fee, OLD.min_order_amount, OLD.priority, OLD.effective_from, OLD.effective_to, OLD.is_active, OLD.surge_multiplier, OLD.surge_days, OLD.surge_start_local, OLD.surge_end_local, OLD.surge_timezone) THEN
    NEW.version := OLD.version + 1;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delivery_zone_rule_version ON public.delivery_zones;
CREATE TRIGGER trg_delivery_zone_rule_version BEFORE UPDATE ON public.delivery_zones
FOR EACH ROW EXECUTE FUNCTION public.bump_delivery_zone_rule_version();
