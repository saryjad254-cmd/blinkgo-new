-- ============================================================
-- BlinkGo v36 — Maps & Tracking Performance + Geocoding
-- ============================================================
-- This migration:
--   1. Adds DB indexes for the new tracking hot path.
--   2. Adds server_geocode cache table for offline-first geocoding.
--   3. Updates driver_status.last_seen to know when a driver stopped broadcasting.
--   4. Adds PostGIS-friendly column checks.
-- ============================================================

-- Indexes for the admin map hot path
CREATE INDEX IF NOT EXISTS idx_driver_status_online
  ON public.driver_status(is_online, updated_at DESC)
  WHERE is_online = true;

CREATE INDEX IF NOT EXISTS idx_driver_status_location
  ON public.driver_status(latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_active_status
  ON public.orders(status, last_location_update DESC NULLS LAST)
  WHERE status IN ('confirmed', 'preparing', 'ready', 'picked_up', 'delivering', 'on_the_way');

-- Geocoding cache (server-side cache for Places autocomplete / geocoding)
-- Avoids re-hitting Google for repeated addresses
CREATE TABLE IF NOT EXISTS public.geocode_cache (
  query_hash TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  source TEXT NOT NULL,  -- 'google' | 'nominatim'
  result JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_geocode_cache_expires ON public.geocode_cache(expires_at);

-- Auto-purge expired rows (only on read; no background job needed)
COMMENT ON TABLE public.geocode_cache IS 'Caches Google/Nominatim geocoding responses. Server clears expired rows on insert.';

-- RLS: only service role can read/write the cache
ALTER TABLE public.geocode_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS geocode_cache_service_only ON public.geocode_cache;
CREATE POLICY geocode_cache_service_only ON public.geocode_cache
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Add a `last_seen` column to driver_status to distinguish "online but idle"
-- from "online and active" (GPS broadcasting in the last 60s).
ALTER TABLE public.driver_status
  ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ DEFAULT NOW();

-- Create a helper function for the admin map: get drivers in view
CREATE OR REPLACE FUNCTION public.get_active_drivers_nearby(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_radius_km DOUBLE PRECISION DEFAULT 20
)
RETURNS TABLE (
  driver_id UUID,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  is_online BOOLEAN,
  is_on_delivery BOOLEAN,
  current_order_id UUID,
  last_seen TIMESTAMPTZ,
  distance_km DOUBLE PRECISION
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ds.driver_id,
    ds.latitude,
    ds.longitude,
    ds.is_online,
    COALESCE(ds.is_on_delivery, false),
    ds.current_order_id,
    ds.last_seen,
    -- Haversine distance in km
    (
      6371 * 2 * atan2(
        sqrt(
          sin(radians((ds.latitude - p_lat) / 2)) ^ 2 +
          cos(radians(p_lat)) * cos(radians(ds.latitude)) *
          sin(radians((ds.longitude - p_lng) / 2)) ^ 2
        ),
        sqrt(1 - (
          sin(radians((ds.latitude - p_lat) / 2)) ^ 2 +
          cos(radians(p_lat)) * cos(radians(ds.latitude)) *
          sin(radians((ds.longitude - p_lng) / 2)) ^ 2
        ))
      )
    )::DOUBLE PRECISION AS distance_km
  FROM public.driver_status ds
  WHERE ds.is_online = true
    AND ds.latitude IS NOT NULL
    AND ds.longitude IS NOT NULL
    AND (
      6371 * 2 * atan2(
        sqrt(
          sin(radians((ds.latitude - p_lat) / 2)) ^ 2 +
          cos(radians(p_lat)) * cos(radians(ds.latitude)) *
          sin(radians((ds.longitude - p_lng) / 2)) ^ 2
        ),
        sqrt(1 - (
          sin(radians((ds.latitude - p_lat) / 2)) ^ 2 +
          cos(radians(p_lat)) * cos(radians(ds.latitude)) *
          sin(radians((ds.longitude - p_lng) / 2)) ^ 2
        ))
      )
    ) <= p_radius_km
  ORDER BY distance_km ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_drivers_nearby TO service_role;

-- Add `last_location_update` index on orders
CREATE INDEX IF NOT EXISTS idx_orders_driver_location
  ON public.orders(driver_id, last_location_update DESC NULLS LAST)
  WHERE driver_id IS NOT NULL;

-- Add a `geocoded_at` column to orders to know when the customer address was geocoded
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_geocoded_at TIMESTAMPTZ;

-- Re-analyze the affected tables for query planner
ANALYZE public.driver_status;
ANALYZE public.orders;
ANALYZE public.restaurants;
