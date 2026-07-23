'use client';

/**
 * DriverBatteryBanner — surfaces battery state during active shift.
 *
 * Drivers on long shifts need proactive battery awareness so they
 * can wrap up or charge before their phone dies. Banner appears
 * when battery is low (≤20%) or critical (≤10%) and they're online.
 */

import { Battery, BatteryLow, BatteryWarning, Plug } from 'lucide-react';
import { useBatteryStatus } from '@/lib/hooks/use-battery-status';
import { useT } from '@/lib/i18n/I18nProvider';

export function DriverBatteryBanner({ online }: { online: boolean }) {
  const battery = useBatteryStatus();
  const t = useT();

  if (!online) return null;
  if (!battery.isSupported) return null;
  if (battery.isCharging) return null;
  if (battery.level > 0.2) return null;

  const isCritical = battery.isCritical;
  const Icon = isCritical ? BatteryWarning : BatteryLow;
  const level = Math.round(battery.level * 100);

  return (
    <div
      role={isCritical ? 'alert' : 'status'}
      aria-live={isCritical ? 'assertive' : 'polite'}
      className={`
        flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium
        ${isCritical
          ? 'bg-danger-500/20 text-danger-700 border-2 border-danger-500/40'
          : 'bg-warning-500/20 text-warning-700 border border-warning-500/30'
        }
      `}
    >
      <Icon className="h-5 w-5 flex-shrink-0" aria-hidden />
      <span className="flex-1">
        {isCritical
          ? (t.driver?.battery_critical ?? `Akku kritisch (${level}%) — bald aufladen`)
          : (t.driver?.battery_low ?? `Akku schwach (${level}%)`)
        }
      </span>
      <Plug className="h-4 w-4" aria-hidden />
    </div>
  );
}
