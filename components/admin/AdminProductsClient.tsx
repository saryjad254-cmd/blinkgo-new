'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Search from 'lucide-react/dist/esm/icons/search';
import Check from 'lucide-react/dist/esm/icons/check';
import X from 'lucide-react/dist/esm/icons/x';
import Archive from 'lucide-react/dist/esm/icons/archive';
import Package from 'lucide-react/dist/esm/icons/package';
import type { LucideIcon } from 'lucide-react';
import Clock3 from 'lucide-react/dist/esm/icons/clock-3';
import Pencil from 'lucide-react/dist/esm/icons/pencil';
import Pause from 'lucide-react/dist/esm/icons/pause';
import Play from 'lucide-react/dist/esm/icons/play';
import RotateCcw from 'lucide-react/dist/esm/icons/rotate-ccw';
import Upload from 'lucide-react/dist/esm/icons/upload';
import Trash2 from 'lucide-react/dist/esm/icons/trash-2';
import EyeOff from 'lucide-react/dist/esm/icons/eye-off';
import Plus from 'lucide-react/dist/esm/icons/plus';
import { useToast } from '@/components/ui/Toast';
import { extractErrorMessage } from '@/lib/foundation/error-helper';

export type ProductRequest = { id: string; name: string; description?: string | null; category: string; suggested_price: number; image_url?: string | null; status: 'pending' | 'approved' | 'rejected'; rejection_reason?: string | null; created_at: string; restaurant?: { id: string; name: string } | null };
export type Product = { id: string; name: string; description?: string | null; category?: string | null; category_id?: string | null; price: number; image_url?: string | null; is_active: boolean; is_available: boolean; approval_status?: string; archived_at?: string | null; restaurant?: { id: string; name: string } | null };
export type CatalogCategory = { id: string; restaurant_id: string; name: string; description?: string | null; sort_order: number; is_active: boolean; is_hidden: boolean };
export type StoreOption = { id: string; name: string; type: string };
type ProductForm = { name: string; description: string; category: string; category_id: string; price: string };
type CategoryForm = { restaurant_id: string; name: string; description: string; sort_order: string };

export function AdminProductsClient({ initialProducts, initialRequests, initialCategories, stores, locale = 'de' }: { initialProducts: Product[]; initialRequests: ProductRequest[]; initialCategories: CatalogCategory[]; stores: StoreOption[]; locale?: 'de' | 'ar' | 'en' }) {
  const toast = useToast();
  const t = {
    de: { eyebrow: 'BlinkGo Katalogsteuerung', title: 'Produkte & Freigaben', subtitle: 'Zentrale Kontrolle über Sortiment, Freigaben und Archivierung.', pending: 'Offene Anfragen', active: 'Aktive Produkte', archived: 'Archiviert', requests: 'Anfragen', products: 'Produkte', history: 'Verlauf', search: 'Produkt, Kategorie oder Restaurant suchen…', noneProducts: 'Keine Produkte gefunden.', nonePending: 'Keine offenen Anfragen.', noneHistory: 'Kein Verlauf vorhanden.', available: 'Verfügbar', paused: 'Pausiert', approve: 'Freigeben', reject: 'Ablehnen', reason: 'Ablehnungsgrund (für das Restaurant sichtbar)', cancel: 'Abbrechen', confirmReject: 'Ablehnung bestätigen', restaurant: 'Restaurant', noCategory: 'Ohne Kategorie', archiveConfirm: 'Produkt archivieren? Es verschwindet sofort für Kunden.', reasonRequired: 'Bitte einen klaren Ablehnungsgrund eingeben.', failed: 'Aktion fehlgeschlagen', approved: 'Produkt wurde freigegeben.', rejected: 'Anfrage wurde abgelehnt.', archiveFailed: 'Archivierung fehlgeschlagen', archiveDone: 'Produkt archiviert.', edit: 'Bearbeiten', editTitle: 'Produkt bearbeiten', name: 'Name', category: 'Kategorie', description: 'Beschreibung', price: 'Preis (€)', imageUrl: 'Bild-URL', save: 'Änderungen speichern', saved: 'Produkt aktualisiert.', pauseProduct: 'Pausieren', resumeProduct: 'Aktivieren', pausedDone: 'Produkt pausiert.', resumedDone: 'Produkt aktiviert.', restore: 'Wiederherstellen', restoreConfirm: 'Dieses Produkt wiederherstellen und für Kunden aktivieren?', restored: 'Produkt wiederhergestellt.', invalid: 'Name und ein gültiger Preis sind erforderlich.' },
    en: { eyebrow: 'BlinkGo Catalog Control', title: 'Products & approvals', subtitle: 'Central control over catalog, approvals and archival.', pending: 'Open requests', active: 'Active products', archived: 'Archived', requests: 'Requests', products: 'Products', history: 'History', search: 'Search product, category or restaurant…', noneProducts: 'No products found.', nonePending: 'No open requests.', noneHistory: 'No history yet.', available: 'Available', paused: 'Paused', approve: 'Approve', reject: 'Reject', reason: 'Rejection reason (visible to restaurant)', cancel: 'Cancel', confirmReject: 'Confirm rejection', restaurant: 'Restaurant', noCategory: 'No category', archiveConfirm: 'Archive product? It will immediately disappear for customers.', reasonRequired: 'Enter a clear rejection reason.', failed: 'Action failed', approved: 'Product approved.', rejected: 'Request rejected.', archiveFailed: 'Archival failed', archiveDone: 'Product archived.', edit: 'Edit', editTitle: 'Edit product', name: 'Name', category: 'Category', description: 'Description', price: 'Price (€)', imageUrl: 'Image URL', save: 'Save changes', saved: 'Product updated.', pauseProduct: 'Pause', resumeProduct: 'Activate', pausedDone: 'Product paused.', resumedDone: 'Product activated.', restore: 'Restore', restoreConfirm: 'Restore this product and make it available to customers?', restored: 'Product restored.', invalid: 'A name and valid price are required.' },
    ar: { eyebrow: 'إدارة كتالوج BlinkGo', title: 'المنتجات والموافقات', subtitle: 'تحكم مركزي بالمنتجات والموافقات والأرشفة.', pending: 'طلبات معلقة', active: 'منتجات نشطة', archived: 'مؤرشف', requests: 'الطلبات', products: 'المنتجات', history: 'السجل', search: 'ابحث عن منتج أو فئة أو مطعم…', noneProducts: 'لا توجد منتجات.', nonePending: 'لا توجد طلبات معلقة.', noneHistory: 'لا يوجد سجل بعد.', available: 'متاح', paused: 'متوقف', approve: 'موافقة', reject: 'رفض', reason: 'سبب الرفض (ظاهر للمطعم)', cancel: 'إلغاء', confirmReject: 'تأكيد الرفض', restaurant: 'مطعم', noCategory: 'بدون فئة', archiveConfirm: 'أرشفة المنتج؟ سيختفي فورًا عن الزبائن.', reasonRequired: 'أدخل سبب رفض واضحًا.', failed: 'فشلت العملية', approved: 'تم اعتماد المنتج.', rejected: 'تم رفض الطلب.', archiveFailed: 'فشلت الأرشفة', archiveDone: 'تمت أرشفة المنتج.', edit: 'تعديل', editTitle: 'تعديل المنتج', name: 'الاسم', category: 'الفئة', description: 'الوصف', price: 'السعر (€)', imageUrl: 'رابط الصورة', save: 'حفظ التعديلات', saved: 'تم تحديث المنتج.', pauseProduct: 'إيقاف مؤقت', resumeProduct: 'تفعيل', pausedDone: 'تم إيقاف المنتج.', resumedDone: 'تم تفعيل المنتج.', restore: 'استعادة', restoreConfirm: 'هل تريد استعادة المنتج وإظهاره للزبائن؟', restored: 'تمت استعادة المنتج.', invalid: 'الاسم والسعر الصحيح مطلوبان.' },
  }[locale];
  const ct = {
    de: { categories: 'Kategorien', add: 'Kategorie hinzufügen', store: 'Geschäft', name: 'Kategoriename', description: 'Beschreibung', order: 'Reihenfolge', create: 'Erstellen', created: 'Kategorie erstellt.', updated: 'Kategorie aktualisiert.', deleted: 'Kategorie gelöscht.', hidden: 'Ausgeblendet', visible: 'Sichtbar', deleteConfirm: 'Kategorie löschen? Produkte behalten ihren Namen, werden aber von der Kategorie getrennt.', editPrompt: 'Neuer Kategoriename', orderPrompt: 'Sortierreihenfolge', upload: 'Bild hochladen', removeImage: 'Bild entfernen', imageSaved: 'Produktbild gespeichert.', imageRemoved: 'Produktbild entfernt.', invalidImage: 'Bitte JPG, PNG oder WebP bis 5 MB wählen.' },
    en: { categories: 'Categories', add: 'Add category', store: 'Store', name: 'Category name', description: 'Description', order: 'Sort order', create: 'Create', created: 'Category created.', updated: 'Category updated.', deleted: 'Category deleted.', hidden: 'Hidden', visible: 'Visible', deleteConfirm: 'Delete category? Products keep their text label but are detached from it.', editPrompt: 'New category name', orderPrompt: 'Sort order', upload: 'Upload image', removeImage: 'Remove image', imageSaved: 'Product image saved.', imageRemoved: 'Product image removed.', invalidImage: 'Choose a JPG, PNG, or WebP image up to 5 MB.' },
    ar: { categories: 'الفئات', add: 'إضافة فئة', store: 'المتجر', name: 'اسم الفئة', description: 'الوصف', order: 'الترتيب', create: 'إنشاء', created: 'تم إنشاء الفئة.', updated: 'تم تحديث الفئة.', deleted: 'تم حذف الفئة.', hidden: 'مخفية', visible: 'ظاهرة', deleteConfirm: 'حذف الفئة؟ ستبقى أسماء الفئة على المنتجات لكن سيتم فك الربط.', editPrompt: 'اسم الفئة الجديد', orderPrompt: 'ترتيب العرض', upload: 'رفع صورة', removeImage: 'حذف الصورة', imageSaved: 'تم حفظ صورة المنتج.', imageRemoved: 'تم حذف صورة المنتج.', invalidImage: 'اختر JPG أو PNG أو WebP بحجم لا يتجاوز 5 ميغابايت.' },
  }[locale];
  const [products, setProducts] = useState(initialProducts);
  const [requests, setRequests] = useState(initialRequests);
  const [categories, setCategories] = useState(initialCategories);
  const [tab, setTab] = useState<'pending' | 'products' | 'categories' | 'history'>('pending');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [editing, setEditing] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState<ProductForm>({ name: '', description: '', category: '', category_id: '', price: '' });
  const [productImage, setProductImage] = useState<File | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>({ restaurant_id: stores[0]?.id ?? '', name: '', description: '', sort_order: '0' });
  const pending = requests.filter((item) => item.status === 'pending');
  const visibleRequests = useMemo(() => requests.filter((item) => (tab === 'history' ? item.status !== 'pending' : item.status === 'pending')).filter((item) => `${item.name} ${item.category} ${item.restaurant?.name ?? ''}`.toLowerCase().includes(query.toLowerCase())), [requests, tab, query]);
  const visibleProducts = useMemo(() => products.filter((item) => `${item.name} ${item.category ?? ''} ${item.restaurant?.name ?? ''}`.toLowerCase().includes(query.toLowerCase())), [products, query]);

  async function review(id: string, action: 'approve' | 'reject') {
    if (action === 'reject' && reason.trim().length < 3) return toast.error(t.reasonRequired);
    setBusy(id);
    const response = await fetch('/api/admin/product-requests', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action === 'reject' ? { id, action, reason } : { id, action }) });
    const result = await response.json().catch(() => ({})); setBusy(null);
    if (!response.ok) return toast.error(extractErrorMessage(result, t.failed));
    setRequests((all) => all.map((item) => item.id === id ? { ...item, status: action === 'approve' ? 'approved' : 'rejected', rejection_reason: action === 'reject' ? reason : null } : item));
    setRejecting(null); setReason(''); toast.success(action === 'approve' ? t.approved : t.rejected);
  }

  async function archiveProduct(id: string) {
    if (!window.confirm(t.archiveConfirm)) return;
    setBusy(id);
    const response = await fetch('/api/products/manage', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    const result = await response.json().catch(() => ({})); setBusy(null);
    if (!response.ok) return toast.error(extractErrorMessage(result, t.archiveFailed));
    setProducts((all) => all.map((item) => item.id === id ? { ...item, approval_status: 'archived', archived_at: new Date().toISOString(), is_active: false, is_available: false } : item));
    toast.success(t.archiveDone);
  }

  function openEdit(product: Product) {
    setEditing(product);
    setProductImage(null);
    setEditForm({ name: product.name, description: product.description ?? '', category: product.category ?? '', category_id: product.category_id ?? '', price: String(product.price) });
  }

  async function saveProduct() {
    if (!editing || editForm.name.trim().length < 2 || !Number.isFinite(Number(editForm.price)) || Number(editForm.price) <= 0) return toast.error(t.invalid);
    setBusy(editing.id);
    try {
      const response = await fetch('/api/products/manage', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing.id, ...editForm, price: Number(editForm.price) }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) return toast.error(extractErrorMessage(result, t.failed));
      let imageUrl = result.product?.image_url ?? editing.image_url;
      if (productImage) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(productImage.type) || productImage.size > 5 * 1024 * 1024) return toast.error(ct.invalidImage);
        const media = new FormData(); media.set('id', editing.id); media.set('kind', 'product_image'); media.set('file', productImage);
        const imageResponse = await fetch('/api/admin/catalog-media', { method: 'POST', body: media });
        const imageResult = await imageResponse.json().catch(() => ({}));
        if (!imageResponse.ok) return toast.error(extractErrorMessage(imageResult, t.failed));
        imageUrl = imageResult.url;
      }
      setProducts((all) => all.map((item) => item.id === editing.id ? { ...item, ...(result.product ?? editForm), image_url: imageUrl, price: Number(editForm.price) } : item));
      setEditing(null); setProductImage(null); toast.success(productImage ? ct.imageSaved : t.saved);
    } finally { setBusy(null); }
  }

  async function removeProductImage() {
    if (!editing?.image_url) return;
    setBusy(editing.id);
    const response = await fetch('/api/admin/catalog-media', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing.id, kind: 'product_image' }) });
    const result = await response.json().catch(() => ({})); setBusy(null);
    if (!response.ok) return toast.error(extractErrorMessage(result, t.failed));
    setProducts((all) => all.map((item) => item.id === editing.id ? { ...item, image_url: null } : item));
    setEditing({ ...editing, image_url: null }); toast.success(ct.imageRemoved);
  }

  async function createCategory() {
    if (!categoryForm.restaurant_id || !categoryForm.name.trim()) return toast.error(t.invalid);
    setBusy('category-new');
    const response = await fetch('/api/admin/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...categoryForm, sort_order: Number(categoryForm.sort_order) }) });
    const result = await response.json().catch(() => ({})); setBusy(null);
    if (!response.ok) return toast.error(extractErrorMessage(result, t.failed));
    setCategories((all) => [...all, result.category].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
    setCategoryForm((form) => ({ ...form, name: '', description: '', sort_order: '0' })); toast.success(ct.created);
  }

  async function updateCategory(category: CatalogCategory, changes: Partial<CatalogCategory>) {
    setBusy(category.id);
    const response = await fetch('/api/admin/categories', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: category.id, ...changes }) });
    const result = await response.json().catch(() => ({})); setBusy(null);
    if (!response.ok) return toast.error(extractErrorMessage(result, t.failed));
    setCategories((all) => all.map((item) => item.id === category.id ? result.category : item).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
    if (changes.name) setProducts((all) => all.map((product) => product.category_id === category.id ? { ...product, category: changes.name } : product));
    toast.success(ct.updated);
  }

  async function editCategory(category: CatalogCategory) {
    const name = window.prompt(ct.editPrompt, category.name)?.trim(); if (!name) return;
    const orderText = window.prompt(ct.orderPrompt, String(category.sort_order)); if (orderText == null) return;
    const sortOrder = Number(orderText); if (!Number.isInteger(sortOrder) || sortOrder < 0) return toast.error(t.invalid);
    await updateCategory(category, { name, sort_order: sortOrder });
  }

  async function deleteCategory(category: CatalogCategory) {
    if (!window.confirm(ct.deleteConfirm)) return;
    setBusy(category.id);
    const response = await fetch('/api/admin/categories', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: category.id }) });
    const result = await response.json().catch(() => ({})); setBusy(null);
    if (!response.ok) return toast.error(extractErrorMessage(result, t.failed));
    setCategories((all) => all.filter((item) => item.id !== category.id));
    setProducts((all) => all.map((product) => product.category_id === category.id ? { ...product, category_id: null } : product)); toast.success(ct.deleted);
  }

  async function toggleProduct(product: Product) {
    const available = !product.is_available;
    setBusy(product.id);
    const response = await fetch('/api/products/manage', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: product.id, is_available: available, is_active: available }) });
    const result = await response.json().catch(() => ({})); setBusy(null);
    if (!response.ok) return toast.error(extractErrorMessage(result, t.failed));
    setProducts((all) => all.map((item) => item.id === product.id ? { ...item, is_available: available, is_active: available } : item));
    toast.success(available ? t.resumedDone : t.pausedDone);
  }

  async function restoreProduct(product: Product) {
    if (!window.confirm(t.restoreConfirm)) return;
    setBusy(product.id);
    const response = await fetch('/api/products/manage', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: product.id, action: 'restore' }) });
    const result = await response.json().catch(() => ({})); setBusy(null);
    if (!response.ok) return toast.error(extractErrorMessage(result, t.failed));
    setProducts((all) => all.map((item) => item.id === product.id ? { ...item, approval_status: 'approved', archived_at: null, is_active: true, is_available: true } : item));
    toast.success(t.restored);
  }

  return <div className="space-y-6" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-extrabold uppercase tracking-[.2em] text-brand-red-400">{t.eyebrow}</p><h1 className="text-3xl font-extrabold text-white mt-2">{t.title}</h1><p className="text-text-secondary mt-2">{t.subtitle}</p></div><Link href="/admin/onboarding?type=product" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-red-500 px-5 text-sm font-extrabold text-white hover:bg-brand-red-600"><Package className="h-4 w-4" />{locale === 'ar' ? 'إضافة منتج' : locale === 'de' ? 'Produkt hinzufügen' : 'Add product'}</Link></header>
    <div className="grid grid-cols-3 gap-3"><Metric icon={Clock3} value={pending.length} label={t.pending} tone="yellow" /><Metric icon={Package} value={products.filter((p) => !p.archived_at).length} label={t.active} tone="red" /><Metric icon={Archive} value={products.filter((p) => p.archived_at).length} label={t.archived} tone="gray" /></div>
    <div className="card !p-2 flex flex-wrap gap-2">{([['pending', `${t.requests} (${pending.length})`], ['products', t.products], ['categories', ct.categories], ['history', t.history]] as const).map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`min-h-11 px-4 rounded-xl text-sm font-bold ${tab === key ? 'bg-brand-gradient text-white' : 'text-text-secondary hover:bg-surface-tertiary'}`}>{label}</button>)}</div>
    <div className="relative"><Search className="absolute start-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" /><input value={query} onChange={(e) => setQuery(e.target.value)} className="input ps-11" placeholder={t.search} /></div>
    {tab === 'products' ? <div className="space-y-3">{visibleProducts.length === 0 ? <Empty text={t.noneProducts} /> : visibleProducts.map((product) => <article key={product.id} className="card !p-4 flex flex-wrap items-center gap-4"><div className="h-12 w-12 rounded-xl bg-brand-red-500/10 bg-cover bg-center flex items-center justify-center" style={product.image_url ? { backgroundImage: `url(${JSON.stringify(product.image_url).slice(1, -1)})` } : undefined}>{!product.image_url && <Package className="w-5 h-5 text-brand-red-400" />}</div><div className="min-w-0 flex-1"><h2 className="font-bold text-white truncate">{product.name}</h2><p className="text-xs text-text-secondary">{product.restaurant?.name ?? '—'} · {product.category || t.noCategory} · €{Number(product.price).toFixed(2)}</p></div><span className={`px-2.5 py-1 rounded-full text-xs font-bold ${product.archived_at ? 'bg-surface-tertiary text-text-muted' : product.is_available ? 'bg-emerald-500/10 text-emerald-400' : 'bg-yellow-500/10 text-yellow-400'}`}>{product.archived_at ? t.archived : product.is_available ? t.available : t.paused}</span><div className="flex flex-wrap gap-1">{product.archived_at ? <button disabled={busy === product.id} onClick={() => restoreProduct(product)} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-emerald-400 hover:bg-emerald-500/10"><RotateCcw className="w-4 h-4" />{t.restore}</button> : <><button disabled={busy === product.id} onClick={() => openEdit(product)} className="min-h-11 rounded-xl px-3 text-text-secondary hover:bg-surface-tertiary hover:text-white" aria-label={`${t.edit} ${product.name}`}><Pencil className="w-4 h-4" /></button><button disabled={busy === product.id} onClick={() => toggleProduct(product)} className="min-h-11 rounded-xl px-3 text-brand-yellow-400 hover:bg-brand-yellow-500/10" aria-label={`${product.is_available ? t.pauseProduct : t.resumeProduct} ${product.name}`}>{product.is_available ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}</button><button disabled={busy === product.id} onClick={() => archiveProduct(product.id)} className="min-h-11 px-3 rounded-xl text-red-400 hover:bg-red-500/10" aria-label={`${product.name} ${t.archived}`}><Archive className="w-4 h-4" /></button></>}</div></article>)}</div> : tab === 'categories' ? <div className="space-y-4"><section className="card !p-5"><h2 className="mb-4 text-lg font-extrabold text-white">{ct.add}</h2><div className="grid gap-3 md:grid-cols-4"><select className="input" value={categoryForm.restaurant_id} onChange={(event) => setCategoryForm((form) => ({ ...form, restaurant_id: event.target.value }))} aria-label={ct.store}><option value="">{ct.store}</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select><input className="input" value={categoryForm.name} onChange={(event) => setCategoryForm((form) => ({ ...form, name: event.target.value }))} placeholder={ct.name} maxLength={100} /><input className="input" value={categoryForm.description} onChange={(event) => setCategoryForm((form) => ({ ...form, description: event.target.value }))} placeholder={ct.description} maxLength={500} /><div className="flex gap-2"><input className="input min-w-0" type="number" min="0" value={categoryForm.sort_order} onChange={(event) => setCategoryForm((form) => ({ ...form, sort_order: event.target.value }))} aria-label={ct.order} /><button disabled={busy === 'category-new'} onClick={createCategory} className="btn-primary min-h-11 shrink-0"><Plus className="size-4" />{ct.create}</button></div></div></section><div className="space-y-3">{categories.map((category) => <article key={category.id} className="card !p-4 flex flex-wrap items-center gap-4"><div className="min-w-0 flex-1"><h3 className="font-bold text-white">{category.name}</h3><p className="text-xs text-text-secondary">{stores.find((store) => store.id === category.restaurant_id)?.name ?? '—'} · {ct.order}: {category.sort_order}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${category.is_hidden || !category.is_active ? 'bg-yellow-500/10 text-yellow-400' : 'bg-emerald-500/10 text-emerald-400'}`}>{category.is_hidden ? ct.hidden : category.is_active ? ct.visible : t.paused}</span><div className="flex gap-1"><button disabled={busy === category.id} onClick={() => void editCategory(category)} className="grid size-11 place-items-center rounded-xl text-text-secondary hover:bg-surface-tertiary" aria-label={t.edit}><Pencil className="size-4" /></button><button disabled={busy === category.id} onClick={() => void updateCategory(category, { is_hidden: !category.is_hidden })} className="grid size-11 place-items-center rounded-xl text-brand-yellow-400 hover:bg-yellow-500/10" aria-label={category.is_hidden ? ct.visible : ct.hidden}><EyeOff className="size-4" /></button><button disabled={busy === category.id} onClick={() => void updateCategory(category, { is_active: !category.is_active })} className="grid size-11 place-items-center rounded-xl text-emerald-400 hover:bg-emerald-500/10" aria-label={category.is_active ? t.pauseProduct : t.resumeProduct}>{category.is_active ? <Pause className="size-4" /> : <Play className="size-4" />}</button><button disabled={busy === category.id} onClick={() => void deleteCategory(category)} className="grid size-11 place-items-center rounded-xl text-red-400 hover:bg-red-500/10" aria-label={ct.deleted}><Trash2 className="size-4" /></button></div></article>)}</div></div> : <div className="space-y-3">{visibleRequests.length === 0 ? <Empty text={tab === 'pending' ? t.nonePending : t.noneHistory} /> : visibleRequests.map((item) => <article key={item.id} className="card !p-5"><div className="flex flex-wrap gap-4 justify-between"><div><div className="flex items-center gap-2"><h2 className="text-lg font-extrabold text-white">{item.name}</h2><span className={`px-2 py-1 rounded-full text-[10px] font-extrabold uppercase ${item.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400' : item.status === 'rejected' ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-400'}`}>{item.status}</span></div><p className="text-sm text-text-secondary mt-1">{item.restaurant?.name ?? t.restaurant} · {item.category} · €{Number(item.suggested_price).toFixed(2)}</p>{item.description && <p className="text-sm text-text-secondary mt-3 max-w-2xl">{item.description}</p>}{item.rejection_reason && <p className="text-sm text-red-400 mt-3">{t.reason}: {item.rejection_reason}</p>}</div>{item.status === 'pending' && <div className="flex items-start gap-2"><button disabled={busy === item.id} onClick={() => review(item.id, 'approve')} className="min-h-11 px-4 rounded-xl bg-emerald-500 text-white font-bold flex items-center gap-2"><Check className="w-4 h-4" />{t.approve}</button><button disabled={busy === item.id} onClick={() => setRejecting(item.id)} className="min-h-11 px-4 rounded-xl bg-red-500/10 text-red-400 font-bold flex items-center gap-2"><X className="w-4 h-4" />{t.reject}</button></div>}</div>{rejecting === item.id && <div className="mt-4 p-4 rounded-xl bg-surface-tertiary"><label className="label">{t.reason}</label><textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} className="input min-h-24" autoFocus /><div className="flex justify-end gap-2 mt-3"><button onClick={() => { setRejecting(null); setReason(''); }} className="btn-secondary">{t.cancel}</button><button onClick={() => review(item.id, 'reject')} className="btn-primary">{t.confirmReject}</button></div></div>}</article>)}</div>}
    {editing && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}><section role="dialog" aria-modal="true" aria-labelledby="edit-product-title" className="card w-full max-w-2xl !p-5 shadow-2xl"><div className="flex items-center justify-between gap-3"><h2 id="edit-product-title" className="text-xl font-extrabold text-white">{t.editTitle}</h2><button type="button" onClick={() => setEditing(null)} className="grid size-11 place-items-center rounded-xl text-text-secondary hover:bg-surface-tertiary hover:text-white" aria-label={t.cancel}><X className="size-5" /></button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><EditField label={t.name} value={editForm.name} onChange={(value) => setEditForm((form) => ({ ...form, name: value }))} required /><label><span className="label">{t.category}</span><select className="input" value={editForm.category_id} onChange={(event) => { const category = categories.find((item) => item.id === event.target.value); setEditForm((form) => ({ ...form, category_id: event.target.value, category: category?.name ?? '' })); }}><option value="">{t.noCategory}</option>{categories.filter((category) => category.restaurant_id === editing.restaurant?.id).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><EditField label={t.price} value={editForm.price} onChange={(value) => setEditForm((form) => ({ ...form, price: value }))} type="number" required /><label><span className="label">{ct.upload}</span><span className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border bg-bg px-3 text-sm text-text-secondary hover:border-brand-red"><Upload className="size-4" />{productImage?.name ?? ct.upload}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => setProductImage(event.target.files?.[0] ?? null)} /></span></label><label className="sm:col-span-2"><span className="label">{t.description}</span><textarea value={editForm.description} onChange={(event) => setEditForm((form) => ({ ...form, description: event.target.value }))} maxLength={1000} rows={4} className="input" /></label>{editing.image_url && <button type="button" disabled={busy === editing.id} onClick={() => void removeProductImage()} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-red-400 hover:bg-red-500/10"><Trash2 className="size-4" />{ct.removeImage}</button>}</div><div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setEditing(null)} className="btn-secondary min-h-11">{t.cancel}</button><button type="button" disabled={busy === editing.id} onClick={saveProduct} className="btn-primary min-h-11 disabled:opacity-50">{t.save}</button></div></section></div>}
  </div>;
}

function Metric({ icon: Icon, value, label, tone }: { icon: LucideIcon; value: number; label: string; tone: string }) { return <div className="card !p-4"><Icon className={`w-5 h-5 ${tone === 'yellow' ? 'text-brand-yellow-400' : tone === 'red' ? 'text-brand-red-400' : 'text-text-muted'}`} /><p className="text-2xl font-extrabold text-white mt-3">{value}</p><p className="text-xs text-text-secondary mt-1">{label}</p></div>; }
function Empty({ text }: { text: string }) { return <div className="card text-center py-14"><Package className="w-10 h-10 text-text-muted mx-auto mb-3" /><p className="text-text-secondary">{text}</p></div>; }
function EditField({ label, value, onChange, type = 'text', required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) { return <label><span className="label">{label}{required ? ' *' : ''}</span><input type={type} required={required} value={value} onChange={(event) => onChange(event.target.value)} className="input" min={type === 'number' ? '0.01' : undefined} step={type === 'number' ? '0.01' : undefined} /></label>; }
