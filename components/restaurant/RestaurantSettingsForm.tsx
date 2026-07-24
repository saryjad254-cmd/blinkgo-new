'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Loader2 } from 'lucide-react';
import { updateRestaurantSettings } from '@/lib/restaurant-actions';
import type { Restaurant } from '@/lib/types';

export function RestaurantSettingsForm({ restaurant }: { restaurant: Restaurant }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await updateRestaurantSettings(formData);
      if (!result.ok) {
        setError(result.error);
      } else {
        setSuccess(true);
        router.refresh();
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-danger/15 border border-danger/30 rounded-lg p-3 text-sm text-danger">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-success">
          ✅ تم الحفظ بنجاح
        </div>
      )}

      <div>
        <label htmlFor="name" className="label">اسم المطعم *</label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={restaurant.name}
          className="input"
        />
      </div>

      <div>
        <label htmlFor="description" className="label">الوصف</label>
        <textarea
          id="description"
          name="description"
          defaultValue={restaurant.description ?? ''}
          className="input min-h-[80px]"
        />
      </div>

      <div>
        <label htmlFor="address" className="label">العنوان *</label>
        <input
          id="address"
          name="address"
          type="text"
          required
          defaultValue={restaurant.address}
          className="input"
        />
      </div>

      <div>
        <label htmlFor="phone" className="label">رقم الهاتف</label>
        <input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={restaurant.phone ?? ''}
          className="input"
          dir="ltr"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="delivery_fee" className="label">رسوم التوصيل (€)</label>
          <input
            id="delivery_fee"
            name="delivery_fee"
            type="number"
            step="0.01"
            min="0"
            defaultValue={restaurant.delivery_fee}
            className="input"
          />
        </div>
        <div>
          <label htmlFor="min_order_amount" className="label">الحد الأدنى للطلب</label>
          <input
            id="min_order_amount"
            name="min_order_amount"
            type="number"
            step="0.01"
            min="0"
            defaultValue={restaurant.min_order_amount ?? 0}
            className="input"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer p-3 hover:bg-gray-50 rounded-lg border border-gray-200">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={restaurant.is_active}
          className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand"
        />
        <div>
          <p className="font-medium text-text text-sm">المطعم نشط</p>
          <p className="text-xs text-gray-500">يستقبل طلبات جديدة</p>
        </div>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="btn-primary w-full py-3"
      >
        {pending ? (
          <>
            <Loader2 className="w-4 h-4 ml-2 animate-spin" />
            جاري الحفظ...
          </>
        ) : (
          <>
            <Save className="w-4 h-4 ms-2" />
            حفظ التغييرات
          </>
        )}
      </button>
    </form>
  );
}