import { cookies } from 'next/headers';
import { DismissibleAnnouncement } from './DismissibleAnnouncement';

interface Props {
  audience: 'customer' | 'driver' | 'restaurant' | 'admin' | 'restaurant_owner';
}

/**
 * Server component: read the dismiss cookie once on the server to avoid
 * hydration mismatch. Then hand off to the client component for the
 * actual interactive dismiss button.
 */
export async function AnnouncementBanner({ audience }: Props) {
  const cookieStore = await cookies();
  const cookieName = `announcement-dismissed-${audience}`;
  const initiallyDismissed = cookieStore.get(cookieName)?.value === '1';

  return <DismissibleAnnouncement audience={audience} initiallyDismissed={initiallyDismissed} />;
}
