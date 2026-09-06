import { requireRole } from '@/lib/rbac';
import { ToastProvider } from '@/components/ui/Toast';
import { authTrace, AUTH_SOURCES } from '@/lib/diagnostic';
import { OfflineBanner } from '@/components/customer/OfflineBanner';

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
  // Allow customers AND admin/super_admin/manager (admins may view the
  // customer experience for support/testing). Drivers and restaurant
  // users are still blocked because they have their own dashboards.
  await requireRole(['customer', 'admin', 'super_admin', 'manager']);
  return (
    <ToastProvider>
      <OfflineBanner />
      <main className="min-h-screen bg-canvas text-ink-primary">
        {children}
      </main>
    </ToastProvider>
  );
}
