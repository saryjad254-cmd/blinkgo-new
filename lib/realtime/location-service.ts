/**
 * Driver Location Service
 * - Subscribes to Supabase Realtime for orders, notifications, tracking events
 */

import { createBrowserClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface LocationUpdate {
  latitude: number;
  longitude: number;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
  is_online?: boolean;
  active_order_id?: string | null;
}

const MIN_DISTANCE_DELTA_METERS = 5;
const MIN_TIME_DELTA_MS = 2000;

export function haversineDistance(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const aa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}

let lastSentLocation: { lat: number; lng: number; t: number } | null = null;

/**
 * Send driver location update - throttled by distance and time
 */
export async function sendDriverLocation(update: LocationUpdate): Promise<boolean> {
  const now = Date.now();
  const candidate = { lat: update.latitude, lng: update.longitude, t: now };

  if (lastSentLocation) {
    const dt = now - lastSentLocation.t;
    const dist = haversineDistance(lastSentLocation, candidate);
    if (dt < MIN_TIME_DELTA_MS && dist < MIN_DISTANCE_DELTA_METERS) {
      return false;
    }
  }

  lastSentLocation = candidate;

  try {
    // Use cookie-based auth (browser session). No Authorization header needed.
    const res = await fetch('/api/driver/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(update),
    });
    // 200 with throttled:true means rate-limited, which is fine — the server
    // is signaling us to back off, but the data is still safe.
    if (res.status === 429) return false;
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      // If the server says we are throttled, treat as soft fail so the caller
      // doesn't trigger a back-off loop.
      if (data?.data?.throttled) return false;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Subscribe to a specific order's updates (customer-facing tracking)
 * Listens to orders table changes for status + location updates
 */
export function subscribeToOrder(orderId: string, onUpdate: (payload: any) => void): () => void {
  const supabase = createBrowserClient();
  const channel: RealtimeChannel = supabase
    .channel(`order:${orderId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `id=eq.${orderId}`,
      },
      (payload) => {
        onUpdate(payload.new);
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'order_tracking_events',
        filter: `order_id=eq.${orderId}`,
      },
      (payload) => {
        onUpdate({ trackingEvent: payload.new });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribe to driver orders (for driver dashboard)
 */
export function subscribeToDriverOrders(driverId: string, onUpdate: (payload: any) => void): () => void {
  const supabase = createBrowserClient();
  const channel: RealtimeChannel = supabase
    .channel(`driver-orders:${driverId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `driver_id=eq.${driverId}`,
      },
      (payload) => {
        onUpdate(payload);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribe to customer notifications
 */
export function subscribeToNotifications(userId: string, onNotification: (n: any) => void): () => void {
  const supabase = createBrowserClient();
  const channel: RealtimeChannel = supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        onNotification(payload.new);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
