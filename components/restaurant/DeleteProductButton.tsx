'use client';

import { useState, useTransition } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import { deleteProduct } from '@/lib/restaurant-actions';

export function DeleteProductButton({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteProduct(productId);
      if (!result.ok) {
        setError(result.error);
        setConfirming(false);
      }
    });
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="p-2 text-danger hover:bg-danger/15 rounded-lg transition-colors"
        aria-label={`حذف ${productName}`}
      >
        <Trash2 className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-bg-card border border-edge rounded-2xl p-6 max-w-sm w-full shadow-speed-lg">
        <h3 className="text-lg font-bold text-text mb-2">تأكيد الحذف</h3>
        <p className="text-sm text-gray-600 mb-4">
          هل أنت متأكد من حذف <strong>{productName}</strong>؟ لا يمكن التراجع.
        </p>
        {error && (
          <p className="text-sm text-danger mb-3 bg-danger/15 p-2 rounded">{error}</p>
        )}
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="btn-secondary text-sm px-4 py-2"
          >
            إلغاء
          </button>
          <button
            onClick={handleDelete}
            disabled={pending}
            className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
          >
            {pending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            حذف نهائي
          </button>
        </div>
      </div>
    </div>
  );
}