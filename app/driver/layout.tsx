import { requireRole } from '@/lib/rbac';
import { AnnouncementBanner } from '@/components/shared/AnnouncementBanner';
import { DriverNav } from '@/components/driver/DriverNav';
import { ToastProvider } from '@/components/ui/Toast';
import { EmergencyCallButton } from '@/components/driver/EmergencyCallButton';
import { COMPANY } from '@/lib/legal/company-info';

// Auth-gated layout: this segment calls requireRole()/getUser(), which reads
// per-request cookies. It MUST be rendered dynamically on every request so the
// role check runs against the CURRENT session. Without this, Next.js can serve a
// cached RSC payload of the layout on Vercel — including a cached
// `redirect('/login?error=insufficient_permissions')` computed for an earlier
// (unauthenticated or customer) request — which is the production post-login bug.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole('driver');
  return (
    <ToastProvider>
      <div className="min-h-screen bg-bg">
        <AnnouncementBanner audience="driver" />
      <DriverNav user={{ email: user.email ?? '', role: user.role, name: user.name ?? 'Driver' }} />
        <main className="pb-20 md:pb-8">{children}</main>
        {/* Floating emergency button — always available while driving */}
        <EmergencyCallButton supportPhone={COMPANY.phone} supportEmail={COMPANY.supportEmail} />
      </div>
    </ToastProvider>
  );
}
