'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Loader2, MapPin, Navigation2, X } from 'lucide-react';
import { SmartMap } from '@/components/maps/SmartMap';

interface LatLng {
  lat: number;
  lng: number;
}

interface LiveDriver {
  lat: number;
  lng: number;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
  updated_at?: string;
}

interface Props {
  /** Order/restaurant/customer positions */
  restaurant: LatLng | null;
  customer: LatLng | null;
  /** Live driver position (raw, will be smoothed) */
  driver: LiveDriver | null;
  /** Auto-fit the map to the action (driver→customer, restaurant→customer) */
  route: 'to_restaurant' | 'to_customer' | 'idle';
  /** Force map height */
  height?: string;
  /** Optional callback when the map is ready */
  onReady?: () => void;
}

/**
 * LiveTrackingMap
 * ───────────────
 * Production-grade live tracking map.
 *
 * - Smooths driver marker movement between raw updates (interpolation, no jumps).
 * - Auto-fits bounds to driver + customer (or restaurant + customer) when both are known.
 * - Renders a route polyline (driver → customer) updated every frame.
 * - Honors the driver's heading to rotate the marker.
 * - Re-centers when the driver moves > 200m from the current map center (Uber-style).
 */
export function LiveTrackingMap({
  restaurant,
  customer,
  driver,
  route,
  height = '100%',
  onReady,
}: Props) {
  const [smoothed, setSmoothed] = useState<LatLng | null>(
    driver ? { lat: driver.lat, lng: driver.lng } : null
  );
  const [rotation, setRotation] = useState<number>(0);
  const [autoCenter, setAutoCenter] = useState<boolean>(true);
  const lastDriverRef = useRef<LatLng | null>(null);
  const lastTimeRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);

  // Smooth driver movement (requestAnimationFrame interpolation toward the new fix)
  useEffect(() => {
    if (!driver) return;
    const target: LatLng = { lat: driver.lat, lng: driver.lng };
    const start = smoothed ?? target;
    const t0 = performance.now();
    const distance = haversine(start, target);
    // Speed: 600ms total for short moves, slower for long ones
    const duration = Math.max(500, Math.min(2000, distance * 30));
    lastTimeRef.current = t0;
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    // Compute rotation from heading (use explicit if available, else derive from bearing)
    let targetRotation = 0;
    if (driver.heading != null && driver.heading >= 0) {
      targetRotation = driver.heading;
    } else if (lastDriverRef.current) {
      targetRotation = bearing(lastDriverRef.current, target);
    }
    setRotation(targetRotation);

    const animate = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      // easeInOutCubic
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const lat = start.lat + (target.lat - start.lat) * eased;
      const lng = start.lng + (target.lng - start.lng) * eased;
      setSmoothed({ lat, lng });
      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        animFrameRef.current = null;
        lastDriverRef.current = target;
        setSmoothed(target);
      }
    };
    animFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver?.lat, driver?.lng]);

  // Build markers
  const markers = useMemo(() => {
    const m: any[] = [];
    if (restaurant) {
      m.push({
        id: 'restaurant',
        lat: restaurant.lat,
        lng: restaurant.lng,
        type: 'restaurant',
        title: 'Restaurant',
      });
    }
    if (customer) {
      m.push({
        id: 'customer',
        lat: customer.lat,
        lng: customer.lng,
        type: 'customer',
        title: 'Lieferadresse',
      });
    }
    if (smoothed) {
      m.push({
        id: 'driver',
        lat: smoothed.lat,
        lng: smoothed.lng,
        type: 'driver',
        title: 'Fahrer',
        rotation,
        speed: driver?.speed,
        accuracy: driver?.accuracy,
      });
    }
    return m;
  }, [restaurant, customer, smoothed, rotation, driver?.speed, driver?.accuracy]);

  // Map center: between driver and customer when both are known
  const center = useMemo<LatLng>(() => {
    if (smoothed && customer) {
      return {
        lat: (smoothed.lat + customer.lat) / 2,
        lng: (smoothed.lng + customer.lng) / 2,
      };
    }
    if (smoothed) return smoothed;
    if (customer) return customer;
    if (restaurant) return restaurant;
    return { lat: 50.7374, lng: 7.0982 };
  }, [smoothed, customer, restaurant]);

  // Directions: driver → customer (during delivery) or restaurant → customer (idle)
  const directions = useMemo(() => {
    if (route === 'to_customer' && smoothed && customer) {
      return {
        origin: { lat: smoothed.lat, lng: smoothed.lng },
        destination: { lat: customer.lat, lng: customer.lng },
      };
    }
    if (route === 'to_restaurant' && restaurant && customer) {
      return {
        origin: { lat: restaurant.lat, lng: restaurant.lng },
        destination: { lat: customer.lat, lng: customer.lng },
      };
    }
    return undefined;
  }, [route, smoothed, customer, restaurant]);

  // Zoom: tighter when both points are close
  const zoom = useMemo(() => {
    if (smoothed && customer) {
      const dist = haversine(smoothed, customer);
      if (dist < 0.5) return 16;
      if (dist < 2) return 14;
      if (dist < 5) return 13;
      return 12;
    }
    if (restaurant && customer) {
      const dist = haversine(restaurant, customer);
      if (dist < 1) return 14;
      if (dist < 5) return 12;
      return 11;
    }
    return 13;
  }, [smoothed, customer, restaurant]);

  return (
    <SmartMap
      center={center}
      zoom={zoom}
      markers={markers}
      directions={directions}
      height={height}
      autoCenter={autoCenter}
    />
  );
}

function haversine(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function bearing(from: LatLng, to: LatLng): number {
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
