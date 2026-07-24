'use client';

/**
 * DriverGPSStatusPill — compact status indicator for GPS state.
 *
 * Drivers need to know at a glance if their GPS is working.
 * The pill shows: active (green), requesting (yellow), error (red),
 * or denied (red). Includes accuracy in meters for fine detail.
 */

import { useT } from '@/lib/i18n/I18nProvider';
import { Crosshair, MapPin, AlertTriangle, XCircle, Loader2 } from 'lucide-react';

interface DriverGPSStatusPillProps {
  status: 'idle' | 'requesting' | 'active' | 'denied' | 'unavailable' | 'error';
  accuracy?: number | null;
  fixCount?: number;
}

export function DriverGPSStatusPill({ status, accuracy, fixCount }: DriverGPSStatusPillProps) {
  const t = useT();

  const config = {
    active: { Icon: MapPin, color: 'bg-success-500/15 text-success-700 border-success-500/30', label: t.driver?.gps_active ?? 'GPS aktiv' },
    requesting: { Icon: Loader2, color: 'bg-warning-500/15 text-warning-700 border-warning-500/30', label: t.driver?.gps_searching ?? 'GPS wird gesucht…', spin: true },
    error: { Icon: AlertTriangle, color: 'bg-danger-500/15 text-danger-700 border-danger-500/30', label: t.driver?.gps_error ?? 'GPS-Fehler' },
    denied: { Icon: XCircle, color: 'bg-danger-500/15 text-danger-700 border-danger-500/30', label: t.driver?.gps_denied ?? 'GPS verweigert' },
    unavailable: { Icon: XCircle, color: 'bg-ink-2/15 text-ink-2 border-ink-3/30', label: t.driver?.gps_unavailable ?? 'Nicht verfügbar' },
    idle: { Icon: Crosshair, color: 'bg-ink-2/15 text-ink-2 border-ink-3/30', label: t.driver?.gps_offline ?? 'GPS aus' },
  }[status];

  const { Icon, color, label, spin } = config;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${color}`}
    >
      <Icon className={`h-3.5 w-3.5 ${spin ? 'animate-spin' : ''}`} aria-hidden />
      <span>{label}</span>
      {status === 'active' && accuracy != null && (
        <span className="text-ink-2">· ±{Math.round(accuracy)}m</span>
      )}
    </div>
  );
}
