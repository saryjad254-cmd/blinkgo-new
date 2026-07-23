import { requireRole } from '@/lib/rbac';
import { CustomerNav } from '@/components/customer/CustomerNav';
import { ToastProvider } from '@/components/ui/Toast';
import { AnnouncementBanner } from '@/components/shared/AnnouncementBanner';
import { authTrace, AUTH_SOURCES } from '@/lib/diagnostic';

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
