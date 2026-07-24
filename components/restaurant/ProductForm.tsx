'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save } from 'lucide-react';
import {
  createProduct,
  updateProduct,
  type ActionResult,
} from '@/lib/restaurant-actions';

interface Category {
  id: string;
  name: string;
}

interface ProductInitial {
  id?: string;
  name?: string;
  description?: string | null;
  price?: number;
  discount_price?: number | null;
  category_id?: string | null;
  is_available?: boolean;
  is_featured?: boolean;
  preparation_time?: number;
}

export function ProductForm({
  initial,
  categories,
}: {
  initial?: ProductInitial;
  categories: Category[];
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setError(null);

    const action = initial?.id
      ? updateProduct(initial.id, formData)
      : createProduct(formData);

    const result: ActionResult<{ id: string }> | ActionResult = await action;

    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    // بعد النجاح → ارجع للـ menu
    router.push('/restaurant/menu');
    router.refresh();
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-danger/15 border border-danger/30 rounded-lg p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="name" className="label">
          اسم المنتج <span className="text-danger">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={initial?.name ?? ''}
          placeholder="برجر كلاسيك"
          className="input"
        />
      </div>

      <div>
        <label htmlFor="description" className="label">
          الوصف
        </label>
        <textarea
          id="description"
          name="description"
          defaultValue={initial?.description ?? ''}
          placeholder="لحم أنجوس مع جبنة شيدر..."
          className="input min-h-[80px]"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="price" className="label">
            السعر (€) <span className="text-danger">*</span>
          </label>
          <input
            id="price"
            name="price"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={initial?.price ?? ''}
            placeholder="12.00"
            className="input"
          />
        </div>
        <div>
          <label htmlFor="discount_price" className="label">
            سعر الخصم
          </label>
          <input
            id="discount_price"
            name="discount_price"
            type="number"
            step="0.01"
            min="0"
            defaultValue={initial?.discount_price ?? ''}
            placeholder="اختياري"
            className="input"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="category_id" className="label">
            الفئة
          </label>
          <select
            id="category_id"
            name="category_id"
            defaultValue={initial?.category_id ?? ''}
            className="input"
          >
            <option value="">— بدون فئة —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="preparation_time" className="label">
            وقت التحضير (دقيقة)
          </label>
          <input
            id="preparation_time"
            name="preparation_time"
            type="number"
            min="1"
            max="180"
            defaultValue={initial?.preparation_time ?? 15}
            className="input"
          />
        </div>
      </div>

      <div className="space-y-2 pt-2 border-t border-gray-100">
        <Checkbox
          name="is_available"
          label="متاح للطلب"
          defaultChecked={initial?.is_available ?? true}
        />
        <Checkbox
          name="is_featured"
          label="منتج مميز (يظهر في الأعلى)"
          defaultChecked={initial?.is_featured ?? false}
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="btn-primary w-full text-base py-3"
      >
        {submitting ? (
          <>
            <Loader2 className="w-4 h-4 ml-2 animate-spin" />
            جاري الحفظ...
          </>
        ) : (
          <>
            <Save className="w-4 h-4 ms-2" />
            {initial?.id ? 'حفظ التعديلات' : 'إضافة المنتج'}
          </>
        )}
      </button>
    </form>
  );
}

function Checkbox({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-50 rounded-lg">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand"
      />
      <span className="text-sm text-text-secondary">{label}</span>
    </label>
  );
}