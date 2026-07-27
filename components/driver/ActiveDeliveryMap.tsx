'use client';

import { useEffect, useState, useMemo } from 'react';
import { useDriverGPS } from '@/lib/hooks/useDriverGPS';
import { DriverOrderMap } from '@/components/driver/DriverOrderMap';

interface Props {
  orderId: string;
  /** Initial driver position from the server (from order.driver_latitude/longitude or user_metadata) */
  initialDriverLat: number | null;
  initialDriverLng: number | null;
  restaurantLat: number | null;
  restaurantLng: number | null;
  customerLat: number | null;
  customerLng: number | null;
  restaurantName?: string;
  customerName?: string;
  /** Whether the driver's next destination is the restaurant (true) or customer (false) */
  driverIsPrimary?: boolean;
}

/**
 * ActiveDeliveryMap
 * ─────────────────
 * Wraps DriverOrderMap with the live GPS broadcaster.
 * - Starts GPS automatically on mount (driver is on a delivery, so they're online).
 * - Broadcasts position every ~3s / 8m to the server with this order's id.
 * - Smoothly interpolates the driver marker between fixes.
 * - Auto-pauses GPS on unmount.
 */
export function ActiveDeliveryMap({
  orderId,
  initialDriverLat,
  initialDriverLng,
  restaurantLat,
  restaurantLng,
  customerLat,
  customerLng,
  restaurantName,
  customerName,
  driverIsPrimary = false,
}: Props) {
  const [driverPos, setDriverPos] = useState<{ lat: number; lng: number } | null>(
    initialDriverLat != null && initialDriverLng != null
      ? { lat: initialDriverLat, lng: initialDriverLng }
      : null
  );

  // GPS broadcaster. Drivers on an active delivery are presumed online.
  const gps = useDriverGPS({
    enabled: true,
    activeOrderId: orderId,
    minDistanceMeters: 6,
    minTimeMs: 2_500,
    maxTimeMs: 20_000,
    maxAccuracyMeters: 75,
    onFix: (fix) => {
      setDriverPos({ lat: fix.lat, lng: fix.lng });
    },
  });

  // If the hook emits its first fix, use it
  useEffect(() => {
    if (gps.currentFix) {
      setDriverPos({ lat: gps.currentFix.lat, lng: gps.currentFix.lng });
    }
  }, [gps.currentFix?.lat, gps.currentFix?.lng]);

  return (
    <DriverOrderMap
      driverLat={driverPos?.lat ?? null}
      driverLng={driverPos?.lng ?? null}
      restaurantLat={restaurantLat}
      restaurantLng={restaurantLng}
      customerLat={customerLat}
      customerLng={customerLng}
      restaurantName={restaurantName}
      customerName={customerName}
      driverIsPrimary={driverIsPrimary}
    />
  );
}
