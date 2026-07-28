import { requireRole } from '@/lib/rbac';
import { CustomerNav } from '@/components/customer/CustomerNav';
import { ToastProvider } from '@/components/ui/Toast';
import { AnnouncementBanner } from '@/components/shared/AnnouncementBanner';
import { authTrace, AUTH_SOURCES } from '@/lib/diagnostic';

// Auth-gated layout: this segment calls requireRole()/getUser(), which reads
// per-request cookies. It MUST be rendered dynamically on every request so the
// role check runs against the CURRENT session. Without this, Next.js can serve a
// cached RSC payload of the layout on Vercel — including a cached
// `redirect('/login?error=insufficient_permissions')` computed for an earlier
// (unauthenticated or customer) request — which is the production post-login bug.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  authTrace('layout_entry', { source: AUTH_SOURCES.CUSTOMER_LAYOUT });
  // Block anyone who is NOT a customer from this entire route group.
  await requireRole('customer');
  return (
    <ToastProvider>
      <AnnouncementBanner audience="customer" />
      <CustomerNav />
      <main className="pb-20 md:pb-8 min-h-screen bg-bg text-text-primary">
        {children}
      </main>
    </ToastProvider>
  );
}
