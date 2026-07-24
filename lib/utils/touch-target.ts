/**
 * Touch Target Utility
 * ────────────────────
 * Ensures all interactive elements meet WCAG 2.5.5 (Target Size) requirements.
 * Min target size: 44x44px (Apple HIG, WCAG AAA).
 *
 * Use as: className="min-h-11 min-w-11" or use this utility for inline styles.
 */

import { type CSSProperties } from 'react';

export const MIN_TOUCH_TARGET_PX = 44;

export function ensureTouchTarget(minSize: number = MIN_TOUCH_TARGET_PX): CSSProperties {
  return {
    minWidth: `${minSize}px`,
    minHeight: `${minSize}px`,
  };
}

export const touchTargetClass = 'min-h-11 min-w-11';

export const extendedTapClass = 'relative before:absolute before:inset-[-12px] before:content-[""]';

export function hasAdequateTouchTarget(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width >= MIN_TOUCH_TARGET_PX && rect.height >= MIN_TOUCH_TARGET_PX;
}
