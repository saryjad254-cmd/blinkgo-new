import X from 'lucide-react/dist/esm/icons/x';
import Megaphone from 'lucide-react/dist/esm/icons/megaphone';
import { cookies } from 'next/headers';
import { cn } from '@/lib/cn';
import { DismissibleAnnouncement } from './DismissibleAnnouncement';

interface Props {
  audience: 'customer' | 'driver' | 'restaurant' | 'admin' | 'restaurant_owner';
}

/**
 * Server component: read the dismiss cookie once on the server to avoid
 * hydration mismatch. Then hand off to the client component for the
 * actual interactive dismiss button.
 */
export function AnnouncementBanner({ audience }: Props) {
  const cookieStore = cookies();
  const cookieName = `announcement-dismissed-${audience}`;
  const initiallyDismissed = cookieStore.get(cookieName)?.value === '1';

  return <DismissibleAnnouncement audience={audience} initiallyDismissed={initiallyDismissed} />;
}
