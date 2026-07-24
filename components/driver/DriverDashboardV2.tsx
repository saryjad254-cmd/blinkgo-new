'use client';

/**
 * DriverDashboardV2 — driver-first dashboard for 8-12h shifts.
 *
 * Designed for sustained use:
 * - DriverShiftCard: at-a-glance shift performance
 * - DriverQuickActions: 2x2 grid of large, glove-friendly actions
 * - ActiveDeliveryCardV2: contextual delivery control
 * - DriverGPSStatusPill: always-visible GPS state
 * - Wake lock while online
 * - Battery warnings when low
 * - Auto-refresh active delivery state
 * - Skeletons on initial load
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useT } from '@/lib/i18n/I18nProvider';
import { useWakeLock } from '@/lib/hooks/use-wake-lock';
import { useSmoothedGPS } from '@/lib/hooks/use-smoothed-gps';
import { useOnlineStatus } from '@/lib/hooks/use-online-status';
import { apiGet } from '@/lib/api/client';
import { DriverShiftCard } from './DriverShiftCard';
import { DriverQuickActions } from './DriverQuickActions';
import { ActiveDeliveryCardV2 } from './ActiveDeliveryCardV2';
import { DriverGPSStatusPill } from './DriverGPSStatusPill';
import { DriverBatteryBanner } from './DriverBatteryBanner';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { computeETA } from '@/lib/utils/driver-eta';
import { Truck, MapPin, AlertTriangle } from 'lucide-react';
import { sendDriverLocation } from '@/lib/realtime/location-service';

export interface DriverDashboardV2Props {
  driverId: string;
  driverName: string;
  initialActiveOrder: any | null;
  initialAvailableCount: number;
  initialShiftEarnings: number;
  initialShiftDeliveries: number;
  onlineSince: string | null;
  isOnline: boolean;
}

export function DriverDashboardV2({
  driverId,
  driverName,
  initialActiveOrder,
  initialAvailableCount,
  initialShiftEarnings,
  initialShiftDeliveries,
  onlineSince: initialOnlineSince,
  isOnline: initialIsOnline,
}: DriverDashboardV2Props) {
  const t = useT();
  const [isOnline, setIsOnline] = useState(initialIsOnline);
  const [onlineSince, setOnlineSince] = useState<string | null>(initialOnlineSince);
  const [activeOrder, setActiveOrder] = useState<any | null>(initialActiveOrder);
  const [availableCount, setAvailableCount] = useState(initialAvailableCount);
  const [shiftEarnings, setShiftEarnings] = useState(initialShiftEarnings);
  const [shiftDeliveries, setShiftDeliveries] = useState(initialShiftDeliveries);
  const [busy, setBusy] = useState(false);
  const [eta, setEta] = useState<{ km: number; min: number } | null>(null);
  const [stage, setStage] = useState<'to_restaurant' | 'at_restaurant' | 'to_customer' | 'at_customer' | 'completed'>(
    initialActiveOrder ? 'to_restaurant' : 'completed'
  );

  const networkOnline = useOnlineStatus();
  const wakeLock = useWakeLock(isOnline);

  // Smoothed GPS
  const smoothedGPS = useSmoothedGPS({
    enabled: isOnline,
    alpha: 0.4,
    outlierThresholdMeters: 80,
    maxAccuracyMeters: 100,
    onFix: (fix) => {
      if (!isOnline) return;
      // Send to server (throttled inside)
      sendDriverLocation({
        latitude: fix.lat,
        longitude: fix.lng,
        heading: fix.heading,
        speed: fix.speed,
        accuracy: fix.accuracy,
        is_online: true,
        active_order_id: activeOrder?.id ?? null,
      }).catch(() => {});
    },
  });

  // Compute ETA based on current GPS + next waypoint
  useEffect(() => {
    if (!smoothedGPS.current || !activeOrder) {
      setEta(null);
      return;
    }
    const target = stage === 'to_restaurant' || stage === 'at_restaurant'
      ? { lat: activeOrder.restaurant_latitude, lng: activeOrder.restaurant_longitude }
      : { lat: activeOrder.customer_latitude, lng: activeOrder.customer_longitude };
    const result = computeETA(
      { lat: smoothedGPS.current.lat, lng: smoothedGPS.current.lng },
      target,
      'driving-traffic'
    );
    setEta({ km: result.distanceKm, min: Math.ceil(result.etaSeconds / 60) });
  }, [smoothedGPS.current?.lat, smoothedGPS.current?.lng, activeOrder?.id, stage]);

  // Auto-determine stage from active order status
  useEffect(() => {
    if (!activeOrder) {
      setStage('completed');
      return;
    }
    switch (activeOrder.status) {
      case 'pending':
      case 'confirmed':
      case 'preparing':
        setStage('to_restaurant');
        break;
      case 'ready':
        setStage('at_restaurant');
        break;
      case 'picked_up':
        setStage('to_customer');
        break;
      default:
        setStage('to_customer');
    }
  }, [activeOrder?.id, activeOrder?.status]);

  // Toggle online
  const handleToggleOnline = useCallback(async () => {
    setBusy(true);
    try {
      const newState = !isOnline;
      const res = await fetch('/api/driver/online', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_online: newState }),
      });
      if (res.ok) {
        setIsOnline(newState);
        if (newState) {
          setOnlineSince(new Date().toISOString());
        } else {
          setOnlineSince(null);
        }
      }
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  }, [isOnline]);

  // Auto-refresh active order every 15s
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!networkOnline) return;
      try {
        const ar = await apiGet<any>('/api/driver/active-order', { cacheTtl: 10000 });
        if (ar.ok && ar.data?.order) {
          setActiveOrder(ar.data.order);
        } else {
          setActiveOrder(null);
        }
      } catch {
        // ignore
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [networkOnline]);

  // Refresh shift stats every 60s while online
  useEffect(() => {
    if (!isOnline) return;
    const interval = setInterval(async () => {
      try {
        const sr = await apiGet<any>('/api/driver/stats', { cacheTtl: 5000 });
        if (sr.ok && sr.data) {
          setShiftEarnings(Number(sr.data.todayEarnings ?? 0));
          setShiftDeliveries(Number(sr.data.todayDeliveries ?? 0));
        }
      } catch {
        // ignore
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [isOnline]);

  return (
    <div className="min-h-screen bg-bg-base pb-32">
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* Welcome header */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ink-1">
              {t.driver?.hello ?? 'Hallo'}, {driverName.split(' ')[0]} 👋
            </h1>
            <p className="text-sm text-ink-2 mt-0.5">
              {isOnline
                ? (t.driver?.ready_to_deliver ?? 'Bereit für Lieferungen')
                : (t.driver?.goOnline ?? 'Gehen Sie online, um zu starten')}
            </p>
          </div>
          <button
            type="button"
            onClick={handleToggleOnline}
            disabled={busy}
            aria-pressed={isOnline}
            className={`
              relative w-20 h-11 rounded-full transition-colors flex-shrink-0
              ${isOnline ? 'bg-success-500' : 'bg-ink-3'}
              ${busy ? 'opacity-50' : ''}
            `}
            aria-label={isOnline ? (t.driver?.goOffline ?? 'Offline gehen') : (t.driver?.goOnline ?? 'Online gehen')}
          >
            <span
              className={`
                absolute top-1 h-9 w-9 rounded-full bg-white shadow-md transition-transform
                ${isOnline ? 'translate-x-10' : 'translate-x-1'}
              `}
            />
          </button>
        </header>

        {/* GPS + Battery + Network status row */}
        <div className="flex flex-wrap items-center gap-2">
          <DriverGPSStatusPill
            status={smoothedGPS.status}
            accuracy={smoothedGPS.current?.accuracy ?? null}
            fixCount={smoothedGPS.totalFixes}
          />
          {!networkOnline && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-danger-500/15 text-danger-700 border-danger-500/30">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              Offline
            </span>
          )}
        </div>

        {/* Battery warning */}
        <DriverBatteryBanner online={isOnline} />

        {/* Shift summary */}
        <DriverShiftCard
          online={isOnline}
          onlineSince={onlineSince}
          deliveriesThisShift={shiftDeliveries}
          earningsThisShift={shiftEarnings}
          activeOrderId={activeOrder?.id ?? null}
        />

        {/* Active delivery — top of the visual hierarchy when present */}
        {activeOrder && (
          <ActiveDeliveryCardV2
            order={activeOrder}
            distanceToNextKm={eta?.km ?? 0}
            etaMinutes={eta?.min ?? 0}
            stage={stage}
            busy={busy}
            onPrimaryAction={async () => {
              if (stage === 'at_restaurant') {
                // Confirm pickup
                setBusy(true);
                try {
                  const res = await fetch(`/api/driver/orders/${activeOrder.id}/pickup`, { method: 'POST' });
                  if (res.ok) {
                    const updated = await res.json();
                    setActiveOrder({ ...activeOrder, status: 'picked_up' });
                  }
                } finally { setBusy(false); }
              } else {
                // Open external maps for navigation
                const lat = stage === 'to_restaurant' ? activeOrder.restaurant_latitude : activeOrder.customer_latitude;
                const lng = stage === 'to_restaurant' ? activeOrder.restaurant_longitude : activeOrder.customer_longitude;
                window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`, '_blank');
              }
            }}
            onMarkArrived={() => {/* handled via geofence auto-detection */}}
            onComplete={async () => {
              setBusy(true);
              try {
                const res = await fetch(`/api/driver/orders/${activeOrder.id}/complete`, { method: 'POST' });
                if (res.ok) {
                  setActiveOrder(null);
                  setStage('completed');
                  setShiftDeliveries(c => c + 1);
                  setShiftEarnings(e => e + (activeOrder.tip ?? 0) + (activeOrder.delivery_fee ?? 0));
                }
              } finally { setBusy(false); }
            }}
          />
        )}

        {/* Quick actions — only show when no active order */}
        {!activeOrder && (
          <DriverQuickActions
            availableCount={availableCount}
            hasActiveOrder={false}
          />
        )}

        {/* No active + no offers state */}
        {!activeOrder && availableCount === 0 && isOnline && (
          <EmptyState
            icon={<Truck className="h-7 w-7" />}
            title={t.driver?.waiting_for_offers ?? 'Warte auf Aufträge'}
            description={t.driver?.waiting_for_offers_desc ?? 'Wir benachrichtigen Sie, sobald ein neuer Auftrag verfügbar ist. Bleiben Sie online.'}
            size="md"
          />
        )}
      </div>
    </div>
  );
}
