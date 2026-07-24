'use client';

/**
 * useBatteryStatus — reports device battery level for driver awareness.
 *
 * Drivers on long shifts need to know when their phone is low so they
 * can wrap up or charge. This hook surfaces battery state and warns
 * the driver when it drops below 20%.
 */

import { useEffect, useState, useCallback } from 'react';

interface BatteryManager {
  level: number;
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
}

interface UseBatteryStatusResult {
  level: number; // 0-1
  isCharging: boolean;
  isLow: boolean; // level < 0.2 && !charging
  isCritical: boolean; // level < 0.1 && !charging
  isSupported: boolean;
  chargingTime: number;
  dischargingTime: number;
}

export function useBatteryStatus(): UseBatteryStatusResult {
  const [state, setState] = useState<UseBatteryStatusResult>({
    level: 1,
    isCharging: false,
    isLow: false,
    isCritical: false,
    isSupported: false,
    chargingTime: 0,
    dischargingTime: 0,
  });

  const update = useCallback((bm: BatteryManager) => {
    setState({
      level: bm.level,
      isCharging: bm.charging,
      isLow: bm.level < 0.2 && !bm.charging,
      isCritical: bm.level < 0.1 && !bm.charging,
      isSupported: true,
      chargingTime: bm.chargingTime,
      dischargingTime: bm.dischargingTime,
    });
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManager> };
    if (typeof nav.getBattery !== 'function') return;
    let bm: BatteryManager | null = null;
    let mounted = true;

    nav.getBattery().then((b) => {
      if (!mounted) return;
      bm = b;
      update(b);
      b.addEventListener('levelchange', () => update(b));
      b.addEventListener('chargingchange', () => update(b));
    }).catch(() => {});

    return () => {
      mounted = false;
      if (bm) {
        bm.removeEventListener('levelchange', () => {});
        bm.removeEventListener('chargingchange', () => {});
      }
    };
  }, [update]);

  return state;
}
