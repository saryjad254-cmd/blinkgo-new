-- Scheduled, bounded peak delivery pricing for the German launch market.
-- The final delivery fee remains server-calculated and is snapshotted into
-- the signed checkout draft; clients never select or calculate multipliers.
ALTER TABLE public.delivery_zones
  ADD COLUMN IF NOT EXISTS surge_multiplier numeric(4,2) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS surge_days smallint[] NOT NULL DEFAULT '{}'::smallint[],
  ADD COLUMN IF NOT EXISTS surge_start_local time,
  ADD COLUMN IF NOT EXISTS surge_end_local time,
  ADD COLUMN IF NOT EXISTS surge_timezone text NOT NULL DEFAULT 'Europe/Berlin';

ALTER TABLE public.delivery_zones DROP CONSTRAINT IF EXISTS delivery_zones_surge_multiplier_check;
ALTER TABLE public.delivery_zones ADD CONSTRAINT delivery_zones_surge_multiplier_check
  CHECK (surge_multiplier >= 1 AND surge_multiplier <= 2);

ALTER TABLE public.delivery_zones DROP CONSTRAINT IF EXISTS delivery_zones_surge_days_check;
ALTER TABLE public.delivery_zones ADD CONSTRAINT delivery_zones_surge_days_check
  CHECK (surge_days <@ ARRAY[0,1,2,3,4,5,6]::smallint[]);

ALTER TABLE public.delivery_zones DROP CONSTRAINT IF EXISTS delivery_zones_surge_schedule_check;
ALTER TABLE public.delivery_zones ADD CONSTRAINT delivery_zones_surge_schedule_check
  CHECK (
    surge_multiplier = 1 OR (
      cardinality(surge_days) > 0 AND
      surge_start_local IS NOT NULL AND
      surge_end_local IS NOT NULL AND
      surge_start_local <> surge_end_local
    )
  );

ALTER TABLE public.delivery_zones DROP CONSTRAINT IF EXISTS delivery_zones_surge_timezone_check;
ALTER TABLE public.delivery_zones ADD CONSTRAINT delivery_zones_surge_timezone_check
  CHECK (surge_timezone = 'Europe/Berlin');
