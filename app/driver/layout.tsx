import { requireRole } from '@/lib/rbac';
import { AnnouncementBanner } from '@/components/shared/AnnouncementBanner';
import { DriverNav } from '@/components/driver/DriverNav';
import { ToastProvider } from '@/components/ui/Toast';
import { EmergencyCallButton } from '@/components/driver/EmergencyCallButton';

export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  await requireRole('driver');
  return (
    <ToastProvider>
      <div className="min-h-screen bg-bg">
        <AnnouncementBanner audience="driver" />
      <DriverNav />
        <main className="pb-20 md:pb-8">{children}</main>
        {/* Floating emergency button — always available while driving */}
        <EmergencyCallButton />
      </div>
    </ToastProvider>
  );
}
