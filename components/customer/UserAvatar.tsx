'use client';

/**
 * UserAvatar — Real user avatar with smart fallback
 *
 * Priority:
 * 1. Supabase user_metadata.avatar_url (if real URL)
 * 2. Local BlinkGo initials (private, instant and network-independent)
 */

import { useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/cn';

interface UserAvatarProps {
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}

export function UserAvatar({
  name,
  email,
  avatarUrl,
  size = 56,
  className,
}: UserAvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const fallbackInitials = (name || email || 'U').trim().split(/\s+/).map((part) => part[0]?.toUpperCase() || '').slice(0, 2).join('') || 'U';

  // Priority 1: explicit avatar URL (Supabase)
  if (avatarUrl && failedUrl !== avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={name || 'User'}
        width={size}
        height={size}
        unoptimized
        onError={() => setFailedUrl(avatarUrl)}
        className={cn('rounded-full object-cover bg-surface-2', className)}
        style={{ width: size, height: size }}
      />
    );
  }

  // Local fallback avoids leaking a user's email hash to third-party avatar services.
  return (
    <span role="img" aria-label={name || email || 'User'} className={cn('inline-grid shrink-0 place-items-center rounded-full border border-brand/30 bg-gradient-to-br from-brand via-brand-active to-canvas font-black text-white shadow-glow', className)} style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.3)) }}>
      {fallbackInitials}
    </span>
  );
}
