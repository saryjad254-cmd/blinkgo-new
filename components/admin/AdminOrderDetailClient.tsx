'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { extractErrorMessage } from '@/lib/foundation/error-helper';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Bell,
  CheckCircle2,
  Clock3,
  CreditCard,
  Home,
  Mail,
  Map,
  Phone,
  ReceiptText,
  Settings,
  ShoppingBag,
  Store,
  Truck,
  User,
  Users,
} from 'lucide-react';
import { PortalShell, type NavItem } from '@/components/portal/PortalShell';
import { EmptyState, PortalCard, StatusPill } from '@/components/portal/PortalPrimitives';
import { DeliveryAddressCard } from '@/components/shared/DeliveryAddressCard';
import { useI18n, type Locale } from '@/lib/i18n/I18nProvider';

type Contact = { id?: string; name?: string | null; email?: string | null; phone?: string | null } | null;
type DriverOption = { id: string; name: string; is_online: boolean };

type DeliveryAddressValue = string | {
  address?: string | null;
  formatted_address?: string | null;
} | null;

type AdminOrderRecord = {
  id: string;
  order_number?: string | null;
  status: string;
  subtotal?: unknown;
  delivery_fee?: unknown;
  service_fee?: unknown;
  tax?: unknown;
  tip?: unknown;
  discount?: unknown;
  total?: unknown;
  payment_status?: unknown;
  payment_method?: unknown;
  delivery_address?: DeliveryAddressValue;
  delivery_instructions?: string | null;
  customer_latitude?: number | null;
  customer_longitude?: number | null;
  created_at: string;
  accepted_at?: string | null;
  prepared_at?: string | null;
  picked_up_at?: string | null;
  delivered_at?: string | null;
  cancelled_at?: string | null;
};

type AdminOrderItem = {
  id: string;
  product_name?: string | null;
  quantity: number;
  product_price?: number | string | null;
  unit_price?: number | string | null;
  subtotal?: number | string | null;
};

export type AdminOrderDetailData = {
  order: AdminOrderRecord;
  customer: Contact;
  restaurant: Contact;
  driver: Contact;
  items: AdminOrderItem[];
  drivers: DriverOption[];
};

const COPY = {
  de: {
    orders: 'Bestellungen', overview: 'Übersicht', dashboard: 'Dashboard', controlCenter: 'Control Center', management: 'Management', customers: 'Kunden', drivers: 'Fahrer', restaurants: 'Restaurants', zones: 'Lieferzonen', business: 'Business', finance: 'Finanzen', analytics: 'Analytics', system: 'System', notifications: 'Benachrichtigungen', configuration: 'Konfiguration', back: 'Zurück zu den Bestellungen', notFound: 'Bestellung nicht gefunden', notFoundBody: 'Diese Bestellung existiert nicht oder wurde entfernt.', items: 'Bestellpositionen', product: 'Produkt', quantity: 'Menge', unitPrice: 'Einzelpreis', lineTotal: 'Summe', noItems: 'Keine Positionen für diese Bestellung erfasst.', financial: 'Finanzübersicht', subtotal: 'Zwischensumme', deliveryFee: 'Liefergebühr', serviceFee: 'Servicegebühr', tax: 'Steuer', tip: 'Trinkgeld', discount: 'Rabatt', total: 'Gesamt', status: 'Bestellstatus', paymentStatus: 'Zahlungsstatus', paymentMethod: 'Zahlungsart', customer: 'Kunde', restaurant: 'Restaurant', driver: 'Fahrer', unavailable: 'Nicht verfügbar', unassigned: 'Noch nicht zugewiesen', deliveryAddress: 'Lieferadresse', workflow: 'Bestellung verwalten', changeStatus: 'Status ändern', update: 'Aktualisieren', assignDriver: 'Fahrer zuweisen', chooseDriver: 'Online-Fahrer auswählen', assign: 'Zuweisen', noOnlineDrivers: 'Zurzeit sind keine Online-Fahrer verfügbar.', confirmStatus: 'Bestellstatus wirklich ändern?', confirmDriver: 'Diesen Fahrer wirklich zuweisen?', updated: 'Bestellstatus wurde aktualisiert.', assigned: 'Fahrer wurde zugewiesen.', actionFailed: 'Aktion fehlgeschlagen. Bitte erneut versuchen.', processing: 'Wird gespeichert…', timeline: 'Zeitverlauf', created: 'Erstellt', accepted: 'Bestätigt', prepared: 'Vorbereitet', pickedUp: 'Abgeholt', delivered: 'Zugestellt', cancelled: 'Storniert', cash: 'Barzahlung', card: 'Karte', online: 'Online', paid: 'Bezahlt', unpaid: 'Offen', refunded: 'Erstattet', failed: 'Fehlgeschlagen', open: 'Offen', order: 'Bestellung', details: 'Vollständige Bestell- und Zahlungsdetails', goBack: 'Zurück', unknown: 'Unbekannt',
  },
  ar: {
    orders: 'الطلبات', overview: 'نظرة عامة', dashboard: 'لوحة التحكم', controlCenter: 'مركز التحكم', management: 'الإدارة', customers: 'الزبائن', drivers: 'السائقون', restaurants: 'المطاعم', zones: 'مناطق التوصيل', business: 'الأعمال', finance: 'المالية', analytics: 'التحليلات', system: 'النظام', notifications: 'الإشعارات', configuration: 'الإعدادات', back: 'العودة إلى الطلبات', notFound: 'الطلب غير موجود', notFoundBody: 'هذا الطلب غير موجود أو تمت إزالته.', items: 'عناصر الطلب', product: 'المنتج', quantity: 'الكمية', unitPrice: 'سعر الوحدة', lineTotal: 'المجموع', noItems: 'لا توجد عناصر مسجلة لهذا الطلب.', financial: 'الملخص المالي', subtotal: 'المجموع الفرعي', deliveryFee: 'رسوم التوصيل', serviceFee: 'رسوم الخدمة', tax: 'الضريبة', tip: 'الإكرامية', discount: 'الخصم', total: 'الإجمالي', status: 'حالة الطلب', paymentStatus: 'حالة الدفع', paymentMethod: 'طريقة الدفع', customer: 'الزبون', restaurant: 'المطعم', driver: 'السائق', unavailable: 'غير متوفر', unassigned: 'لم يُعيّن بعد', deliveryAddress: 'عنوان التوصيل', workflow: 'إدارة الطلب', changeStatus: 'تغيير الحالة', update: 'تحديث', assignDriver: 'تعيين سائق', chooseDriver: 'اختر سائقًا متصلًا', assign: 'تعيين', noOnlineDrivers: 'لا يوجد سائقون متصلون حاليًا.', confirmStatus: 'هل تريد تغيير حالة الطلب؟', confirmDriver: 'هل تريد تعيين هذا السائق؟', updated: 'تم تحديث حالة الطلب.', assigned: 'تم تعيين السائق.', actionFailed: 'تعذر تنفيذ العملية. حاول مجددًا.', processing: 'جارٍ الحفظ…', timeline: 'الخط الزمني', created: 'تم الإنشاء', accepted: 'تم التأكيد', prepared: 'تم التحضير', pickedUp: 'تم الاستلام', delivered: 'تم التوصيل', cancelled: 'تم الإلغاء', cash: 'نقدًا', card: 'بطاقة', online: 'إلكتروني', paid: 'مدفوع', unpaid: 'غير مدفوع', refunded: 'مسترد', failed: 'فشل', open: 'معلّق', order: 'الطلب', details: 'تفاصيل الطلب والدفع كاملة', goBack: 'رجوع', unknown: 'غير معروف',
  },
  en: {
    orders: 'Orders', overview: 'Overview', dashboard: 'Dashboard', controlCenter: 'Control Center', management: 'Management', customers: 'Customers', drivers: 'Drivers', restaurants: 'Restaurants', zones: 'Delivery zones', business: 'Business', finance: 'Finance', analytics: 'Analytics', system: 'System', notifications: 'Notifications', configuration: 'Configuration', back: 'Back to orders', notFound: 'Order not found', notFoundBody: 'This order does not exist or has been removed.', items: 'Order items', product: 'Product', quantity: 'Quantity', unitPrice: 'Unit price', lineTotal: 'Total', noItems: 'No items are recorded for this order.', financial: 'Financial summary', subtotal: 'Subtotal', deliveryFee: 'Delivery fee', serviceFee: 'Service fee', tax: 'Tax', tip: 'Tip', discount: 'Discount', total: 'Total', status: 'Order status', paymentStatus: 'Payment status', paymentMethod: 'Payment method', customer: 'Customer', restaurant: 'Restaurant', driver: 'Driver', unavailable: 'Unavailable', unassigned: 'Not assigned yet', deliveryAddress: 'Delivery address', workflow: 'Manage order', changeStatus: 'Change status', update: 'Update', assignDriver: 'Assign driver', chooseDriver: 'Choose an online driver', assign: 'Assign', noOnlineDrivers: 'No online drivers are currently available.', confirmStatus: 'Change this order status?', confirmDriver: 'Assign this driver?', updated: 'Order status updated.', assigned: 'Driver assigned.', actionFailed: 'The action failed. Please try again.', processing: 'Saving…', timeline: 'Timeline', created: 'Created', accepted: 'Confirmed', prepared: 'Prepared', pickedUp: 'Picked up', delivered: 'Delivered', cancelled: 'Cancelled', cash: 'Cash', card: 'Card', online: 'Online', paid: 'Paid', unpaid: 'Unpaid', refunded: 'Refunded', failed: 'Failed', open: 'Open', order: 'Order', details: 'Complete order and payment details', goBack: 'Back', unknown: 'Unknown',
  },
} satisfies Record<Locale, Record<string, string>>;

const ASSIGN_REASON_COPY = {
  de: { label: 'Grund der manuellen Zuweisung', placeholder: 'z. B. Fahrermangel oder verspätete Abholung', required: 'Bitte einen nachvollziehbaren Grund mit mindestens 5 Zeichen angeben.' },
  ar: { label: 'سبب التعيين اليدوي', placeholder: 'مثال: نقص السائقين أو تأخر الاستلام', required: 'اكتب سببًا واضحًا من 5 أحرف على الأقل.' },
  en: { label: 'Manual assignment reason', placeholder: 'e.g. courier shortage or delayed pickup', required: 'Enter a clear reason of at least 5 characters.' },
} as const;

const ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'picked_up', 'delivering', 'delivered', 'cancelled', 'could_not_deliver', 'refunded'] as const;

function orderStatusLabel(status: string, locale: Locale): string {
  const labels: Record<string, Record<Locale, string>> = {
    pending: { de: 'Neu', ar: 'جديد', en: 'New' }, confirmed: { de: 'Bestätigt', ar: 'مؤكد', en: 'Confirmed' }, preparing: { de: 'In Zubereitung', ar: 'قيد التحضير', en: 'Preparing' }, ready: { de: 'Bereit', ar: 'جاهز', en: 'Ready' }, picked_up: { de: 'Abgeholt', ar: 'تم الاستلام', en: 'Picked up' }, delivering: { de: 'Unterwegs', ar: 'في الطريق', en: 'On the way' }, delivered: { de: 'Zugestellt', ar: 'تم التوصيل', en: 'Delivered' }, cancelled: { de: 'Storniert', ar: 'ملغي', en: 'Cancelled' }, could_not_deliver: { de: 'Nicht zustellbar', ar: 'تعذر التوصيل', en: 'Could not deliver' }, refunded: { de: 'Erstattet', ar: 'مسترد', en: 'Refunded' }, cancel_refund_pending: { de: 'Erstattung ausstehend', ar: 'استرداد معلّق', en: 'Refund pending' },
  };
  return labels[status]?.[locale] ?? status.replaceAll('_', ' ');
}

function formatCurrency(value: unknown, locale: Locale) {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-DE' : locale === 'en' ? 'en-DE' : 'de-DE', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
}

function paymentMethodLabel(value: unknown, copy: typeof COPY.de) {
  const method = String(value || '').toLowerCase();
  if (method === 'cash') return copy.cash;
  if (['card', 'credit_card', 'stripe'].includes(method)) return copy.card;
  return method ? copy.online : '—';
}

function paymentStatusLabel(value: unknown, copy: typeof COPY.de) {
  const status = String(value || '').toLowerCase();
  if (['paid', 'succeeded', 'completed'].includes(status)) return copy.paid;
  if (['refunded', 'partially_refunded'].includes(status)) return copy.refunded;
  if (['failed', 'declined'].includes(status)) return copy.failed;
  if (['pending', 'processing'].includes(status)) return copy.open;
  return status ? copy.unpaid : '—';
}

function ContactCard({ title, contact, empty, icon }: { title: string; contact: Contact; empty: string; icon: React.ReactNode }) {
  return <PortalCard padding="md">
    <div className="mb-3 flex items-center gap-2 text-sm font-extrabold">{icon}{title}</div>
    {contact ? <div className="space-y-2 text-sm">
      <p className="font-bold text-text-primary">{contact.name || empty}</p>
      {contact.email && <a href={`mailto:${contact.email}`} className="flex min-h-8 items-center gap-2 break-all text-text-muted hover:text-text-primary"><Mail className="size-4 shrink-0" />{contact.email}</a>}
      {contact.phone && <a href={`tel:${contact.phone}`} dir="ltr" className="flex min-h-8 items-center gap-2 text-text-muted hover:text-text-primary"><Phone className="size-4 shrink-0" />{contact.phone}</a>}
    </div> : <p className="text-sm text-text-muted">{empty}</p>}
  </PortalCard>;
}

export function AdminOrderDetailClient({ data, userName }: { data: AdminOrderDetailData | null; userName: string }) {
  const router = useRouter();
  const { locale, setLocale } = useI18n();
  const copy = COPY[locale];
  const assignCopy = ASSIGN_REASON_COPY[locale];
  const [status, setStatus] = useState(data?.order.status ?? 'pending');
  const [nextStatus, setNextStatus] = useState(data?.order.status ?? 'pending');
  const [driverId, setDriverId] = useState('');
  const [assignmentReason, setAssignmentReason] = useState('');
  const [busy, setBusy] = useState<'status' | 'driver' | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }, [router]);

  const navSections = useMemo<{ title: string; items: NavItem[] }[]>(() => [
    { title: copy.overview, items: [{ href: '/admin/dashboard', label: copy.dashboard, icon: Home, exact: true }, { href: '/admin/control-center', label: copy.controlCenter, icon: Activity }, { href: '/admin/orders', label: copy.orders, icon: ShoppingBag }] },
    { title: copy.management, items: [{ href: '/admin/users', label: copy.customers, icon: Users }, { href: '/admin/drivers', label: copy.drivers, icon: Truck }, { href: '/admin/restaurants', label: copy.restaurants, icon: Store }, { href: '/admin/zones', label: copy.zones, icon: Map }] },
    { title: copy.business, items: [{ href: '/admin/finance', label: copy.finance, icon: CreditCard }, { href: '/admin/analytics', label: copy.analytics, icon: BarChart3 }] },
    { title: copy.system, items: [{ href: '/admin/notifications', label: copy.notifications, icon: Bell }, { href: '/admin/configuration', label: copy.configuration, icon: Settings }] },
  ], [copy]);

  async function updateStatus() {
    if (!data || nextStatus === status || !window.confirm(copy.confirmStatus)) return;
    setBusy('status'); setFeedback(null);
    try {
      const response = await fetch('/api/orders/status', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Accept-Language': locale }, body: JSON.stringify({ order_id: data.order.id, status: nextStatus }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(extractErrorMessage(payload, copy.actionFailed));
      setStatus(nextStatus); setFeedback({ tone: 'success', text: copy.updated }); router.refresh();
    } catch (error) { setFeedback({ tone: 'error', text: error instanceof Error ? error.message : copy.actionFailed }); }
    finally { setBusy(null); }
  }

  async function assignDriver() {
    if (!data || !driverId) return;
    if (assignmentReason.trim().length < 5) { setFeedback({ tone: 'error', text: assignCopy.required }); return; }
    if (!window.confirm(copy.confirmDriver)) return;
    setBusy('driver'); setFeedback(null);
    try {
      const response = await fetch(`/api/admin/orders/${data.order.id}/assign`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept-Language': locale }, body: JSON.stringify({ driver_id: driverId, reason: assignmentReason.trim() }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(extractErrorMessage(payload, copy.actionFailed));
      setFeedback({ tone: 'success', text: copy.assigned }); router.refresh();
    } catch (error) { setFeedback({ tone: 'error', text: error instanceof Error ? error.message : copy.actionFailed }); }
    finally { setBusy(null); }
  }

  return <PortalShell brand={{ name: 'BlinkGo Admin', tagline: copy.orders, emoji: '👑' }} navSections={navSections} user={{ name: userName, email: userName, role: 'admin' }} locale={locale} onLocaleChange={setLocale} onLogout={logout}>
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      {!data ? <PortalCard><EmptyState icon={<ReceiptText className="size-8" />} title={copy.notFound} description={copy.notFoundBody} action={<Link href="/admin/orders" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-red px-5 text-sm font-bold text-white">{copy.back}</Link>} /></PortalCard> : (() => {
        const { order, customer, restaurant, driver, items, drivers } = data;
        const address = typeof order.delivery_address === 'string' ? order.delivery_address : order.delivery_address?.address || order.delivery_address?.formatted_address || '';
        const timeline = [{ label: copy.created, value: order.created_at }, { label: copy.accepted, value: order.accepted_at }, { label: copy.prepared, value: order.prepared_at }, { label: copy.pickedUp, value: order.picked_up_at }, { label: copy.delivered, value: order.delivered_at }, { label: copy.cancelled, value: order.cancelled_at }].filter((entry): entry is { label: string; value: string } => typeof entry.value === 'string' && entry.value.length > 0);
        return <>
          <Link href="/admin/orders" className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-bold text-text-muted hover:bg-surface hover:text-text-primary"><ArrowLeft className="size-4 rtl:-scale-x-100" />{copy.goBack}</Link>
          <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div><div className="mb-2 flex flex-wrap items-center gap-2"><h1 className="flex flex-wrap items-baseline gap-x-2 text-2xl font-black sm:text-3xl"><span>{copy.order}</span><span dir="ltr">#{order.order_number || order.id.slice(0, 8)}</span></h1><StatusPill status={status} label={orderStatusLabel(status, locale)} /></div><p className="text-sm text-text-muted">{copy.details} · {new Date(order.created_at).toLocaleString(locale === 'ar' ? 'ar' : locale === 'en' ? 'en-GB' : 'de-DE')}</p></div>
            <div className="text-start sm:text-end"><p className="text-xs font-bold uppercase tracking-wider text-text-muted">{copy.total}</p><p className="text-3xl font-black text-status-success">{formatCurrency(order.total, locale)}</p></div>
          </header>

          {feedback && <div role={feedback.tone === 'error' ? 'alert' : 'status'} aria-live="polite" className={`mb-4 rounded-xl border px-4 py-3 text-sm font-bold ${feedback.tone === 'success' ? 'border-status-success/30 bg-status-success/10 text-status-success' : 'border-status-error/30 bg-status-error/10 text-status-error'}`}>{feedback.text}</div>}

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <div className="space-y-5 xl:col-span-2">
              <PortalCard padding="none"><div className="border-b border-border p-4 sm:p-5"><h2 className="font-extrabold">{copy.items}</h2></div>{items.length === 0 ? <EmptyState icon={<ShoppingBag className="size-7" />} title={copy.noItems} /> : <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead className="bg-bg text-xs text-text-muted"><tr><th className="px-5 py-3 text-start">{copy.product}</th><th className="px-5 py-3 text-center">{copy.quantity}</th><th className="px-5 py-3 text-end">{copy.unitPrice}</th><th className="px-5 py-3 text-end">{copy.lineTotal}</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} className="border-t border-border"><td className="px-5 py-4 font-bold">{item.product_name || copy.unknown}</td><td className="px-5 py-4 text-center tabular-nums">{item.quantity}</td><td className="px-5 py-4 text-end tabular-nums">{formatCurrency(item.product_price ?? item.unit_price, locale)}</td><td className="px-5 py-4 text-end font-bold tabular-nums">{formatCurrency(item.subtotal ?? Number(item.quantity || 0) * Number((item.product_price ?? item.unit_price) || 0), locale)}</td></tr>)}</tbody></table></div>}</PortalCard>

              <PortalCard><h2 className="mb-4 font-extrabold">{copy.financial}</h2><div className="space-y-3 text-sm">{([[copy.subtotal, order.subtotal], [copy.deliveryFee, order.delivery_fee], [copy.serviceFee, order.service_fee], [copy.tax, order.tax], [copy.tip, order.tip]] as Array<[string, unknown]>).filter(([, value]) => Number(value || 0) !== 0).map(([label, value]) => <div key={label} className="flex justify-between gap-4"><span className="text-text-muted">{label}</span><span className="font-semibold tabular-nums">{formatCurrency(value, locale)}</span></div>)}{Number(order.discount || 0) !== 0 && <div className="flex justify-between gap-4 text-status-success"><span>{copy.discount}</span><span>-{formatCurrency(order.discount, locale)}</span></div>}<div className="flex justify-between gap-4 border-t border-border pt-3 text-lg font-black"><span>{copy.total}</span><span>{formatCurrency(order.total, locale)}</span></div></div></PortalCard>

              {address && <DeliveryAddressCard address={address} lat={order.customer_latitude} lng={order.customer_longitude} instructions={order.delivery_instructions || ''} contactName={customer?.name || undefined} contactPhone={customer?.phone || undefined} variant="customer" title={copy.deliveryAddress} expandable={false} />}
            </div>

            <aside className="space-y-5">
              <PortalCard><h2 className="mb-4 font-extrabold">{copy.status}</h2><div className="space-y-3 text-sm"><div className="flex items-center justify-between gap-3"><span className="text-text-muted">{copy.status}</span><StatusPill status={status} label={orderStatusLabel(status, locale)} /></div><div className="flex items-center justify-between gap-3"><span className="text-text-muted">{copy.paymentStatus}</span><span className="font-bold">{paymentStatusLabel(order.payment_status, copy)}</span></div><div className="flex items-center justify-between gap-3"><span className="text-text-muted">{copy.paymentMethod}</span><span className="font-bold">{paymentMethodLabel(order.payment_method, copy)}</span></div></div></PortalCard>

              <PortalCard><h2 className="mb-4 font-extrabold">{copy.workflow}</h2><label htmlFor="admin-order-status" className="mb-1 block text-xs font-bold text-text-muted">{copy.changeStatus}</label><select id="admin-order-status" value={nextStatus} onChange={(e) => setNextStatus(e.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm focus:border-brand-red focus:outline-none">{ORDER_STATUSES.map((value) => <option key={value} value={value}>{orderStatusLabel(value, locale)}</option>)}</select><button type="button" onClick={updateStatus} disabled={busy !== null || nextStatus === status} className="mt-3 min-h-11 w-full rounded-xl bg-brand-red px-4 text-sm font-black text-white transition hover:bg-brand-red/90 disabled:cursor-not-allowed disabled:opacity-45">{busy === 'status' ? copy.processing : copy.update}</button>
                {!driver && ['pending', 'confirmed'].includes(status) && <div className="mt-5 border-t border-border pt-5">
                  <label htmlFor="admin-order-driver" className="mb-1 block text-xs font-bold text-text-muted">{copy.assignDriver}</label>
                  {drivers.length ? <>
                    <select id="admin-order-driver" value={driverId} onChange={(e) => setDriverId(e.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm focus:border-brand-red focus:outline-none"><option value="">{copy.chooseDriver}</option>{drivers.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
                    <label htmlFor="admin-order-assignment-reason" className="mb-1 mt-3 block text-xs font-bold text-text-muted">{assignCopy.label}</label>
                    <textarea id="admin-order-assignment-reason" rows={3} maxLength={500} value={assignmentReason} onChange={(event) => setAssignmentReason(event.target.value)} placeholder={assignCopy.placeholder} className="w-full rounded-xl border border-border bg-bg p-3 text-sm focus:border-brand-red focus:outline-none" />
                    <button type="button" onClick={assignDriver} disabled={busy !== null || !driverId || assignmentReason.trim().length < 5} className="mt-3 min-h-11 w-full rounded-xl border border-brand-yellow/40 bg-brand-yellow/10 px-4 text-sm font-black text-brand-yellow transition hover:bg-brand-yellow/15 disabled:cursor-not-allowed disabled:opacity-45">{busy === 'driver' ? copy.processing : copy.assign}</button>
                  </> : <p className="text-sm text-text-muted">{copy.noOnlineDrivers}</p>}
                </div>}
              </PortalCard>

              {timeline.length > 0 && <PortalCard><h2 className="mb-4 font-extrabold">{copy.timeline}</h2><ol className="space-y-4">{timeline.map((entry, index) => <li key={entry.label} className="flex gap-3"><div className="flex flex-col items-center"><CheckCircle2 className="size-5 text-status-success" />{index < timeline.length - 1 && <span className="mt-1 h-full w-px bg-border" />}</div><div className="pb-2"><p className="text-sm font-bold">{entry.label}</p><p className="mt-0.5 flex items-center gap-1 text-xs text-text-muted"><Clock3 className="size-3" />{new Date(entry.value).toLocaleString(locale === 'ar' ? 'ar' : locale === 'en' ? 'en-GB' : 'de-DE')}</p></div></li>)}</ol></PortalCard>}

              <ContactCard title={copy.customer} contact={customer} empty={copy.unavailable} icon={<User className="size-4 text-brand-yellow" />} />
              <ContactCard title={copy.restaurant} contact={restaurant} empty={copy.unavailable} icon={<Store className="size-4 text-brand-red" />} />
              <ContactCard title={copy.driver} contact={driver} empty={copy.unassigned} icon={<Truck className="size-4 text-status-success" />} />
            </aside>
          </div>
        </>;
      })()}
    </div>
  </PortalShell>;
}
