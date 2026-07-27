import { createServiceClient } from '@/lib/supabase/service';
import { BrandedNotFound } from '@/components/shared/BrandedNotFound';
import { ShareOrderView } from '@/components/orders/ShareOrderView';

export const dynamic = 'force-dynamic';

export default async function SharePage({ params }: { params: { token: string } }) {
  const supabase = createServiceClient();
  const { data: link } = await supabase
    .from('share_links')
    .select('*')
    .eq('token', params.token)
    .maybeSingle();
  if (!link) {
    return <BrandedNotFound variant="share" />;
  }
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return (
      <BrandedNotFound
        variant="share"
        title="Link Expired"
        message="رابط المشاركة منتهي الصلاحية. يرجى طلب رابط جديد."
      />
    );
  }
  // Increment view count (best-effort)
  try {
    await supabase.rpc('increment_share_view', { link_id: link.id });
  } catch {}

  if (link.resource_type === 'order') {
    const { data: order } = await supabase
      .from('orders')
      .select('*, restaurants(name, address, phone)')
      .eq('id', link.resource_id)
      .maybeSingle();
    if (!order) {
      return <BrandedNotFound variant="order" />;
    }
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <ShareOrderView order={order} />
      </div>
    );
  }
  return <BrandedNotFound variant="share" />;
}
