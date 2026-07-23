import { X, Megaphone } from 'lucide-react';
import { cookies } from 'next/headers';
import { cn } from '@/lib/cn';

interface Props {
  audience: 'customer' | 'driver' | 'restaurant' | 'admin' | 'restaurant_owner';
}

export function AnnouncementBanner({ audience }: Props) {
  // In a real app, this would fetch from the API
  const cookieStore = cookies();
  const dismissed = cookieStore.get(`announcement-dismissed-${audience}`)?.value;
  if (dismissed) return null;

  return (
    <div className={cn(
      'bg-gradient-to-r from-brand-yellow via-brand-yellow-hover to-brand-yellow-active text-brand-black px-4 py-2.5 flex items-center justify-between gap-3 border-b border-brand-yellow-active shadow-sm',
    )}>
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <Megaphone className="w-4 h-4 flex-shrink-0" />
        <p className="text-xs sm:text-sm font-bold truncate">
          🎉 SCHNELL. ZUVERLÄSSIG. FÜR DICH. — Kostenlose Lieferung für Neukunden!
        </p>
      </div>
      <button
        type="button"
        className="w-6 h-6 rounded-md hover:bg-brand-black/10 transition-colors flex items-center justify-center flex-shrink-0"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
