'use client';

import { useEffect, useState, useTransition } from 'react';
import Trash2 from 'lucide-react/dist/esm/icons/trash-2';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import { deleteProduct } from '@/lib/restaurant-actions';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { extractErrorMessage } from '@/lib/foundation/error-helper';

export function DeleteProductButton({
  productId,
  productName,
  onDeleted,
}: {
  productId: string;
  productName: string;
  onDeleted?: (productId: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { locale } = useI18n();
  const labels = locale === 'ar'
    ? { delete: 'حذف', title: 'تأكيد الحذف', question: 'هل أنت متأكد من حذف', warning: 'لا يمكن التراجع.', cancel: 'إلغاء', final: 'حذف نهائي' }
    : locale === 'en'
      ? { delete: 'Delete', title: 'Confirm deletion', question: 'Are you sure you want to delete', warning: 'This cannot be undone.', cancel: 'Cancel', final: 'Delete permanently' }
      : { delete: 'Löschen', title: 'Löschen bestätigen', question: 'Möchtest du dieses Produkt wirklich löschen:', warning: 'Dies kann nicht rückgängig gemacht werden.', cancel: 'Abbrechen', final: 'Endgültig löschen' };

  useEffect(() => {
    if (!confirming) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) setConfirming(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirming, pending]);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteProduct(productId);
      if (!result.ok) {
        setError(extractErrorMessage(result, 'Produkt konnte nicht gelöscht werden'));
        setConfirming(false);
      } else {
        onDeleted?.(productId);
        setConfirming(false);
      }
    });
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="p-2 text-danger hover:bg-danger/15 rounded-lg transition-colors"
        aria-label={`${labels.delete}: ${productName}`}
      >
        <Trash2 className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby={`delete-product-${productId}`} className="bg-white rounded-2xl p-6 max-w-sm w-full">
        <h3 id={`delete-product-${productId}`} className="text-lg font-bold text-gray-900 mb-2">{labels.title}</h3>
        <p className="text-sm text-gray-600 mb-4">
          {labels.question} <strong>{productName}</strong>? {labels.warning}
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
            {labels.cancel}
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
            {labels.final}
          </button>
        </div>
      </div>
    </div>
  );
}
