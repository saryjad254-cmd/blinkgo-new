import { requireRole } from '@/lib/rbac';
import { AnnouncementBanner } from '@/components/shared/AnnouncementBanner';
import { RestaurantNav } from '@/components/restaurant/RestaurantNav';
import { ToastProvider } from '@/components/ui/Toast';

export default async function RestaurantLayout({ children }: { children: React.ReactNode }) {
  await requireRole('restaurant');
  return (
    <ToastProvider>
      <div className="min-h-screen bg-bg">
        <AnnouncementBanner audience="restaurant" />
      <RestaurantNav />
        <main className="pb-20 md:pb-8">{children}</main>
      </div>
    </ToastProvider>
  );
}
