import { BlinkSpinner } from '@/components/brand';

export default function OrdersLoading() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <BlinkSpinner size="lg" />
    </div>
  );
}
