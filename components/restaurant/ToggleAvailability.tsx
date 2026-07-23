'use client';

import { useState, useTransition } from 'react';
import { toggleProductAvailability } from '@/lib/restaurant-actions';
import { Loader2 } from 'lucide-react';

export function ToggleAvailability({
  productId,
  initial,
}: {
  productId: string;
  initial: boolean;
}) {
  const [isAvailable, setIsAvailable] = useState(initial);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !isAvailable;
    setIsAvailable(next);
    startTransition(async () => {
      const result = await toggleProductAvailability(productId, next);
      if (!result.ok) setIsAvailable(!next); // rollback
    });
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        isAvailable ? 'bg-green-500' : 'bg-gray-300'
      } ${pending ? 'opacity-50' : ''}`}
      aria-label={isAvailable ? 'متاح' : 'غير متاح'}
    >
      {pending && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-3 h-3 animate-spin text-white" />
        </span>
      )}
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
          isAvailable ? 'translate-x-1' : '-translate-x-6'
        }`}
        dir="ltr"
      />
    </button>
  );
}