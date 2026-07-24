'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/client';

export function AcceptOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleAccept() {
    setLoading(true);
    try {
      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('غير مسجل');

      // 1) تعيين السائق + تحديث الحالة في transaction
      // ⚠️ الـ status 'assigned' غير موجود في enum — نستخدم 'picked_up' (السائق قبل الطلب)
      const { error: assignError } = await supabase
        .from('orders')
        .update({ driver_id: user.id, status: 'picked_up' })
        .eq('id', orderId)
        .is('driver_id', null);

      if (assignError) throw assignError;

      // 2) تحديث driver_status
      await supabase
        .from('driver_status')
        .upsert({
          driver_id: user.id,
          is_on_delivery: true,
          current_order_id: orderId,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'driver_id',
        });

      router.push(`/driver/orders/${orderId}`);
      router.refresh();
    } catch (err: any) {
      alert(err.message ?? 'فشل قبول الطلب');
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleAccept}
      disabled={loading}
      className="btn-primary text-sm px-4 py-2 flex items-center gap-1.5"
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <>
          <Check className="w-4 h-4" />
          قبول
        </>
      )}
    </button>
  );
}