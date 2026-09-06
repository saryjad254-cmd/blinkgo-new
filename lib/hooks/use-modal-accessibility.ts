'use client';

import { useEffect, useRef, type RefObject } from 'react';

/** Shared modal lifecycle: locks page scroll, moves focus into the dialog,
 * closes on Escape, and restores focus to the control that opened it. */
export function useModalAccessibility(
  open: boolean,
  onClose: () => void,
  initialFocus: RefObject<HTMLElement | null>,
  returnFocus?: RefObject<HTMLElement | null>,
) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const returnTarget = returnFocus?.current || previousFocus;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => initialFocus.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      requestAnimationFrame(() => returnTarget?.focus());
    };
  }, [initialFocus, open, returnFocus]);
}
