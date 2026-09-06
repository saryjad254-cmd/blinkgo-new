import { PageHeader } from '@/components/shared/PageHeader';
import { SkeletonRestaurantCard } from '@/components/ui/Skeleton';

export default function RestaurantsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading restaurants">
      <PageHeader title="…" back backHref="/home" />
      <div className="border-b border-edge-light bg-bg-card/80 px-4 py-3">
        <div className="mx-auto h-11 max-w-7xl animate-pulse rounded-xl bg-surface-elevated" />
      </div>
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 py-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => <SkeletonRestaurantCard key={index} />)}
      </div>
    </div>
  );
}
