import Link from 'next/link';
import { notFound } from 'next/navigation';
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left';
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right';
import Check from 'lucide-react/dist/esm/icons/check';
import ChefHat from 'lucide-react/dist/esm/icons/chef-hat';
import CircleCheck from 'lucide-react/dist/esm/icons/circle-check';
import Clock3 from 'lucide-react/dist/esm/icons/clock-3';
import CreditCard from 'lucide-react/dist/esm/icons/credit-card';
import Euro from 'lucide-react/dist/esm/icons/euro';
import Download from 'lucide-react/dist/esm/icons/download';
import MapPin from 'lucide-react/dist/esm/icons/map-pin';
import Store from 'lucide-react/dist/esm/icons/store';
import Navigation from 'lucide-react/dist/esm/icons/navigation';
import PackageCheck from 'lucide-react/dist/esm/icons/package-check';
import Phone from 'lucide-react/dist/esm/icons/phone';
import ReceiptText from 'lucide-react/dist/esm/icons/receipt-text';
import UserRound from 'lucide-react/dist/esm/icons/user-round';
import XCircle from 'lucide-react/dist/esm/icons/x-circle';
import { requireRestaurantId } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { RestaurantOrderActions } from '@/components/restaurant/RestaurantOrderActions';
import { ReplacementProposal } from '@/components/restaurant/ReplacementProposal';
import { formatAddress } from '@/lib/format-address';
import { getServerTranslations } from '@/lib/i18n/server-translations';
import type { OrderStatus } from '@/lib/types';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type DetailOrder = {
  id: string;
  order_number?: string | null;
  status: string;
  fulfillment_type?: 'delivery' | 'pickup';
  pickup_code?: string | null;
  total?: number | null;
  subtotal?: number | null;
  delivery_fee?: number | null;
  service_fee?: number | null;
  tax?: number | null;
  tip?: number | null;
  discount?: number | null;
  payment_method?: string | null;
  payment_status?: string | null;
  delivery_address?: unknown;
  delivery_instructions?: string | null;
  customer_id?: string | null;
  driver_id?: string | null;
  created_at: string;
  accepted_at?: string | null;
  prepared_at?: string | null;
  picked_up_at?: string | null;
  delivered_at?: string | null;
  cancelled_at?: string | null;
};

type DetailItem = { id: string; product_id?: string | null; product_name?: string | null; product_price?: number | null; quantity?: number | null; subtotal?: number | null; configuration?: { substitution_preference?: 'best_match' | 'contact_me' | 'refund_item'; fulfillment_status?: string } | null };
type Person = { name?: string | null; phone?: string | null };
type ReplacementHistoryRow = { id: string; original_product_name: string; replacement_product_name: string; status: string };

async function getOrder(id: string, restaurantId: string) {
  const supabase = createServiceClient();
  const { data: orderData, error } = await supabase
    .from('orders')
    .select('id, order_number, status, fulfillment_type, pickup_code, total, subtotal, delivery_fee, service_fee, tax, tip, discount, payment_method, payment_status, delivery_address, delivery_instructions, customer_id, driver_id, created_at, accepted_at, prepared_at, picked_up_at, delivered_at, cancelled_at')
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();
  if (error || !orderData) return null;
  const order = orderData as DetailOrder;

  const [itemsResult, customerResult, driverResult, productsResult, replacementsResult] = await Promise.all([
    supabase.from('order_items').select('id, product_id, product_name, product_price, quantity, subtotal, configuration').eq('order_id', id),
    order.customer_id ? supabase.from('users').select('name, phone').eq('id', order.customer_id).maybeSingle() : Promise.resolve({ data: null }),
    order.driver_id ? supabase.from('users').select('name, phone').eq('id', order.driver_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('products').select('id,name,price,discount_price').eq('restaurant_id', restaurantId).eq('is_active', true).eq('is_available', true).eq('approval_status', 'approved').is('archived_at', null).order('name'),
    supabase.from('order_item_replacements').select('id,order_item_id,status,original_product_name,replacement_product_name,expires_at').eq('order_id', id).order('created_at', { ascending: false }),
  ]);

  return { order, items: (itemsResult.data ?? []) as DetailItem[], customer: customerResult.data as Person | null, driver: driverResult.data as Person | null, products: productsResult.data ?? [], replacements: (replacementsResult.data ?? []) as ReplacementHistoryRow[] };
}

const WORKFLOW = ['pending', 'confirmed', 'preparing', 'ready', 'assigned', 'picked_up', 'delivered'] as const;
const PICKUP_WORKFLOW = ['pending', 'confirmed', 'preparing', 'ready', 'delivered'] as const;

export default async function RestaurantOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { restaurantId } = await requireRestaurantId();
  const data = await getOrder(id, restaurantId);
  if (!data) notFound();
  const { order, items, customer, driver, products, replacements } = data;
  const { locale } = await getServerTranslations();
  const lang = locale as 'ar' | 'de' | 'en';
  const rtl = lang === 'ar';
  const isPickup = order.fulfillment_type === 'pickup';

  const copy = {
    de: {
      eyebrow: 'BLINKGO · BESTELLDETAILS', order: 'Bestellung', back: 'Zurück zu Bestellungen', kitchen: 'Küchenansicht', received: 'Eingegangen', customer: 'Kunde', driver: 'Fahrer', unassigned: 'Noch kein Fahrer zugewiesen', call: 'Anrufen', delivery: 'Lieferadresse', notes: 'Lieferhinweis', items: 'Bestellpositionen', quantity: 'Menge', unit: 'Einzelpreis', sum: 'Summe', finance: 'Abrechnung', subtotal: 'Zwischensumme', deliveryFee: 'Liefergebühr', serviceFee: 'Servicegebühr', tip: 'Trinkgeld', discount: 'Rabatt', total: 'Gesamt', payment: 'Zahlung', status: 'Status', statement: 'Transaktionsübersicht herunterladen', statementNote: 'Vorläufige Abrechnung, keine Steuerrechnung oder Auszahlungsbestätigung.', waitingDriver: 'Die Bestellung ist fertig und wartet auf den Fahrer.', onWay: 'Der Fahrer hat die Bestellung übernommen.', completed: 'Diese Bestellung wurde zugestellt.', cancelled: 'Diese Bestellung wurde storniert.', noNotes: 'Keine zusätzlichen Hinweise.', stages: { pending: 'Neu', confirmed: 'Bestätigt', preparing: 'Zubereitung', ready: 'Bereit', picked_up: 'Abgeholt', delivering: 'Unterwegs', delivered: 'Zugestellt', cancelled: 'Storniert', could_not_deliver: 'Nicht zustellbar', refunded: 'Erstattet' },
    },
    ar: {
      eyebrow: 'BLINKGO · تفاصيل الطلب', order: 'طلب', back: 'العودة إلى الطلبات', kitchen: 'شاشة المطبخ', received: 'وقت الوصول', customer: 'الزبون', driver: 'السائق', unassigned: 'لم يتم تعيين سائق بعد', call: 'اتصال', delivery: 'عنوان التوصيل', notes: 'ملاحظات التوصيل', items: 'عناصر الطلب', quantity: 'الكمية', unit: 'السعر', sum: 'المجموع', finance: 'الحساب', subtotal: 'المجموع الفرعي', deliveryFee: 'رسوم التوصيل', serviceFee: 'رسوم الخدمة', tip: 'الإكرامية', discount: 'الخصم', total: 'الإجمالي', payment: 'الدفع', status: 'الحالة', waitingDriver: 'الطلب جاهز وينتظر استلام السائق.', onWay: 'استلم السائق الطلب وهو في الطريق.', completed: 'تم توصيل هذا الطلب.', cancelled: 'تم إلغاء هذا الطلب.', noNotes: 'لا توجد ملاحظات إضافية.', stages: { pending: 'جديد', confirmed: 'مؤكد', preparing: 'تحضير', ready: 'جاهز', picked_up: 'تم الاستلام', delivering: 'في الطريق', delivered: 'تم التوصيل', cancelled: 'ملغي', could_not_deliver: 'تعذر التوصيل', refunded: 'مسترد' },
    },
    en: {
      eyebrow: 'BLINKGO · ORDER DETAILS', order: 'Order', back: 'Back to orders', kitchen: 'Kitchen display', received: 'Received', customer: 'Customer', driver: 'Driver', unassigned: 'No driver assigned yet', call: 'Call', delivery: 'Delivery address', notes: 'Delivery note', items: 'Order items', quantity: 'Quantity', unit: 'Unit price', sum: 'Line total', finance: 'Financial summary', subtotal: 'Subtotal', deliveryFee: 'Delivery fee', serviceFee: 'Service fee', tip: 'Tip', discount: 'Discount', total: 'Total', payment: 'Payment', status: 'Status', waitingDriver: 'The order is ready and waiting for the driver.', onWay: 'The driver has picked up this order.', completed: 'This order was delivered.', cancelled: 'This order was cancelled.', noNotes: 'No additional notes.', stages: { pending: 'New', confirmed: 'Confirmed', preparing: 'Preparing', ready: 'Ready', picked_up: 'Picked up', delivering: 'Delivering', delivered: 'Delivered', cancelled: 'Cancelled', could_not_deliver: 'Could not deliver', refunded: 'Refunded' },
    },
  }[lang];

  const workflow: readonly string[] = isPickup ? PICKUP_WORKFLOW : WORKFLOW;
  const statusIndex = workflow.indexOf(order.status);
  const displayNumber = order.order_number || order.id.slice(0, 8).toUpperCase();
  const currency = (value: number) => new Intl.NumberFormat(rtl ? 'ar-DE' : lang === 'en' ? 'en-DE' : 'de-DE', { style: 'currency', currency: 'EUR' }).format(value);
  const date = new Date(order.created_at).toLocaleString(rtl ? 'ar-DE' : lang === 'en' ? 'en-GB' : 'de-DE', { dateStyle: 'medium', timeStyle: 'short' });
  const paymentLabel = order.payment_method === 'cash' ? (rtl ? 'نقدي' : lang === 'en' ? 'Cash' : 'Bargeld') : order.payment_method === 'stripe' ? (rtl ? 'بطاقة' : lang === 'en' ? 'Card' : 'Karte') : order.payment_method || '—';
  const orderNotesLabel = isPickup ? (rtl ? 'ملاحظات الطلب' : lang === 'en' ? 'Order note' : 'Bestellhinweis') : copy.notes;
  const fulfillmentFeeLabel = isPickup ? (rtl ? 'رسوم الاستلام' : lang === 'en' ? 'Pickup fee' : 'Abholgebühr') : copy.deliveryFee;
  const substitutionLabel = (preference?: string) => preference === 'best_match'
    ? (rtl ? 'أفضل بديل مشابه' : lang === 'en' ? 'Best similar substitute' : 'Bester ähnlicher Ersatz')
    : preference === 'contact_me'
      ? (rtl ? 'تواصل مع الزبون أولًا' : lang === 'en' ? 'Contact customer first' : 'Kunden zuerst kontaktieren')
      : preference === 'refund_item'
        ? (rtl ? 'إعادة ثمن المنتج' : lang === 'en' ? 'Refund the item' : 'Artikel erstatten')
        : null;

  const stateMessage = order.status === 'ready' ? (isPickup ? (rtl ? 'الطلب جاهز وينتظر الزبون.' : lang === 'en' ? 'The order is ready for customer pickup.' : 'Die Bestellung ist zur Selbstabholung bereit.') : copy.waitingDriver) : order.status === 'picked_up' || order.status === 'delivering' ? copy.onWay : order.status === 'delivered' ? copy.completed : order.status === 'cancelled' ? copy.cancelled : null;

  return (
    <section data-testid="restaurant-order-detail" className="min-h-[calc(100vh-7rem)] bg-[#09090b] px-3 py-4 text-white sm:px-6 lg:px-8 lg:py-7" dir={rtl ? 'rtl' : 'ltr'}>
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(225,6,0,.2),transparent_38%),linear-gradient(145deg,#17171b,#0d0d10)] p-4 shadow-2xl shadow-black/30 sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <Link href="/restaurant/orders" aria-label={copy.back} data-testid="restaurant-order-back" className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]">{rtl ? <ArrowRight className="h-5 w-5" /> : <ArrowLeft className="h-5 w-5" />}</Link>
              <div className="min-w-0"><p className="text-[11px] font-black tracking-[0.19em] text-[#ff3029]">{copy.eyebrow}</p><h1 className="mt-1 break-all font-mono text-xl font-black sm:text-3xl" dir="ltr">{copy.order} #{displayNumber}</h1><p className="mt-1 flex items-center gap-2 text-sm text-zinc-400"><Clock3 className="h-4 w-4" />{copy.received}: {date}</p></div>
            </div>
            <Link href="/restaurant/kitchen" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#e10600] px-4 text-sm font-black hover:bg-[#ff1e17]"><ChefHat className="h-4 w-4" />{copy.kitchen}</Link>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-3"><p className="text-xs font-bold text-zinc-500">{copy.status}</p><strong className="mt-1 block text-sm font-black text-[#ffca0a]">{copy.stages[order.status as keyof typeof copy.stages] ?? order.status}</strong></div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-3"><p className="text-xs font-bold text-zinc-500">{copy.payment}</p><strong className="mt-1 block truncate text-sm font-black">{paymentLabel}</strong></div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-3"><p className="text-xs font-bold text-zinc-500">{copy.total}</p><strong className="mt-1 block text-sm font-black text-emerald-300 sm:text-lg">{currency(Number(order.total ?? 0))}</strong></div>
          </div>
        </header>

        <div className="overflow-x-auto rounded-[24px] border border-white/10 bg-[#121216] p-4 sm:p-5">
          <div className="flex min-w-[650px] items-start">
            {workflow.map((stage, index) => {
              const reached = statusIndex >= index && order.status !== 'cancelled';
              const current = statusIndex === index;
              const stageLabel = stage === 'assigned'
                ? (rtl ? 'تم تعيين السائق' : lang === 'en' ? 'Driver assigned' : 'Fahrer zugewiesen')
                : isPickup && stage === 'delivered'
                  ? (rtl ? 'تم الاستلام' : lang === 'en' ? 'Picked up' : 'Abgeholt')
                  : copy.stages[stage as keyof typeof copy.stages];
              return <div key={stage} className="relative flex flex-1 flex-col items-center text-center"><div className={cn('absolute top-5 h-0.5 w-full', rtl ? 'right-1/2' : 'left-1/2', index === workflow.length - 1 && 'hidden', statusIndex > index ? 'bg-emerald-500' : 'bg-white/10')} /><span className={cn('relative z-10 grid h-10 w-10 place-items-center rounded-full border-2', reached ? 'border-emerald-400 bg-emerald-500 text-black' : 'border-white/15 bg-[#17171b] text-zinc-600', current && 'ring-4 ring-emerald-500/15')}>{reached ? <Check className="h-4 w-4" /> : index + 1}</span><span className={cn('mt-2 text-[11px] font-black', reached ? 'text-zinc-200' : 'text-zinc-600')}>{stageLabel}</span></div>;
            })}
          </div>
        </div>

        {stateMessage ? <div data-testid="restaurant-detail-state-message" className={cn('flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-black', order.status === 'cancelled' ? 'border-red-400/30 bg-red-400/10 text-red-200' : 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200')}>{order.status === 'cancelled' ? <XCircle className="h-5 w-5" /> : <CircleCheck className="h-5 w-5" />}{stateMessage}</div> : null}

        <div className="grid gap-4 lg:grid-cols-[1.35fr_.65fr]">
          <div className="space-y-4">
            <section className="rounded-[24px] border border-white/10 bg-[#121216] p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between"><h2 className="flex items-center gap-2 text-lg font-black"><ReceiptText className="h-5 w-5 text-[#ff3029]" />{copy.items}</h2><span className="rounded-full bg-white/[0.06] px-3 py-1 text-xs font-black text-zinc-400">{items.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0)}</span></div>
              <div className="space-y-2">
                {items.map((item) => { const substitution = substitutionLabel(item.configuration?.substitution_preference); return <div key={item.id} data-testid="restaurant-detail-item" className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border border-white/[0.07] bg-black/20 p-3"><span className="grid h-9 min-w-9 place-items-center rounded-xl bg-[#e10600] px-1 text-sm font-black">{Number(item.quantity ?? 0)}×</span><div className="min-w-0"><p className="break-words text-sm font-black">{item.product_name || '—'}</p><p className="mt-0.5 text-xs text-zinc-600">{currency(Number(item.product_price ?? 0))}</p>{substitution && <p data-testid="restaurant-item-substitution" className="mt-1 text-xs font-bold text-emerald-300">{substitution}</p>}</div><strong className="text-sm font-black tabular-nums">{currency(Number(item.subtotal ?? 0))}</strong></div>; })}
              </div>
              <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/[0.06] p-3"><p className="text-xs font-black text-amber-300">{orderNotesLabel}</p><p className="mt-1 text-sm text-amber-50">{order.delivery_instructions || copy.noNotes}</p></div>
            </section>

            {['pending', 'confirmed', 'preparing'].includes(order.status) ? <ReplacementProposal orderId={order.id} locale={lang} items={items.filter((item) => !item.configuration?.fulfillment_status).map((item) => ({ id: item.id, product_name: item.product_name || '—', product_price: Number(item.product_price ?? 0), quantity: Number(item.quantity ?? 0), subtotal: Number(item.subtotal ?? 0), preference: item.configuration?.substitution_preference }))} products={(products as Array<{ id: string; name: string; price: number; discount_price?: number | null }>).filter((product) => !items.some((item) => item.product_id === product.id))} /> : null}

            {replacements.length ? <section data-testid="merchant-replacement-history" className="rounded-[24px] border border-white/10 bg-[#121216] p-4 sm:p-5"><h2 className="text-lg font-black">{rtl ? 'سجل البدائل' : lang === 'en' ? 'Replacement history' : 'Ersatzverlauf'}</h2><div className="mt-3 space-y-2">{replacements.map((replacement) => <div key={replacement.id} className="rounded-xl bg-black/20 p-3 text-sm"><p className="font-bold">{replacement.original_product_name} → {replacement.replacement_product_name}</p><p className="mt-1 text-xs uppercase text-zinc-500">{replacement.status}</p></div>)}</div></section> : null}

            <section data-testid={isPickup ? 'restaurant-pickup-handover' : undefined} className="rounded-[24px] border border-white/10 bg-[#121216] p-4 sm:p-5"><h2 className="flex items-center gap-2 text-lg font-black">{isPickup ? <Store className="h-5 w-5 text-[#ffca0a]" /> : <MapPin className="h-5 w-5 text-[#ff3029]" />}{isPickup ? (rtl ? 'استلام الزبون' : lang === 'en' ? 'Customer pickup' : 'Selbstabholung') : copy.delivery}</h2>{isPickup ? <div className="mt-3 rounded-2xl border border-[#ffca0a]/20 bg-[#ffca0a]/10 p-4 text-center"><p className="text-xs font-black text-[#ffca0a]">{rtl ? 'طابق هذا الرمز مع الزبون' : lang === 'en' ? 'Match this code with the customer' : 'Code mit dem Kunden abgleichen'}</p><strong className="mt-2 block font-mono text-3xl font-black tracking-[0.2em]" dir="ltr">{order.pickup_code}</strong></div> : <p className="mt-3 break-words rounded-2xl bg-black/20 p-4 text-sm leading-6 text-zinc-300">{formatAddress(order.delivery_address)}</p>}</section>
          </div>

          <aside className="space-y-4">
            <section className="rounded-[24px] border border-white/10 bg-[#121216] p-4 sm:p-5">
              <div className="flex items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sky-400/10 text-sky-300"><UserRound className="h-5 w-5" /></span><div className="min-w-0"><p className="text-xs font-bold text-zinc-600">{copy.customer}</p><p className="truncate font-black">{customer?.name || '—'}</p></div>{customer?.phone ? <a href={`tel:${customer.phone}`} aria-label={`${copy.call} ${customer.name || copy.customer}`} className="ms-auto grid min-h-11 min-w-11 place-items-center rounded-xl border border-white/10 text-zinc-300 hover:bg-white/[0.08]"><Phone className="h-4 w-4" /></a> : null}</div>
              {!isPickup ? <><div className="my-4 h-px bg-white/[0.07]" /><div className="flex items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-400/10 text-emerald-300"><Navigation className="h-5 w-5" /></span><div className="min-w-0"><p className="text-xs font-bold text-zinc-600">{copy.driver}</p><p className="truncate font-black">{driver?.name || copy.unassigned}</p></div>{driver?.phone ? <a href={`tel:${driver.phone}`} aria-label={`${copy.call} ${driver.name || copy.driver}`} className="ms-auto grid min-h-11 min-w-11 place-items-center rounded-xl border border-white/10 text-zinc-300 hover:bg-white/[0.08]"><Phone className="h-4 w-4" /></a> : null}</div></> : null}
            </section>

            <section className="rounded-[24px] border border-white/10 bg-[#121216] p-4 sm:p-5"><h2 className="flex items-center gap-2 text-lg font-black"><Euro className="h-5 w-5 text-[#ffca0a]" />{copy.finance}</h2><div className="mt-4 space-y-3 text-sm">
              {[[copy.subtotal, order.subtotal], [fulfillmentFeeLabel, order.delivery_fee], [copy.serviceFee, order.service_fee], [copy.tip, order.tip]].map(([label, value]) => <div key={String(label)} className="flex justify-between gap-3 text-zinc-400"><span>{label}</span><span className="tabular-nums text-zinc-200">{currency(Number(value ?? 0))}</span></div>)}
              {Number(order.discount ?? 0) > 0 ? <div className="flex justify-between gap-3 text-emerald-300"><span>{copy.discount}</span><span className="tabular-nums">-{currency(Number(order.discount))}</span></div> : null}
              <div className="flex justify-between gap-3 border-t border-white/10 pt-3 text-base font-black"><span>{copy.total}</span><span className="text-[#ffca0a] tabular-nums">{currency(Number(order.total ?? 0))}</span></div>
              <div className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-xs text-zinc-400"><CreditCard className="h-4 w-4" />{paymentLabel} · {order.payment_status || '—'}</div>
            </div></section>

            {['delivered', 'cancelled', 'refunded'].includes(order.status) ? <section data-testid="restaurant-order-statement-download" className="rounded-[24px] border border-amber-400/20 bg-amber-400/[0.06] p-4"><p className="text-xs leading-5 text-amber-100/70">{lang === 'ar' ? 'كشف أولي، وليس فاتورة ضريبية أو تأكيد دفع.' : lang === 'en' ? 'Preliminary statement, not a tax invoice or payout confirmation.' : 'Vorläufige Abrechnung, keine Steuerrechnung oder Auszahlungsbestätigung.'}</p><a href={`/api/restaurant/orders/${order.id}/statement`} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#ffca0a] px-4 font-black text-black hover:bg-[#ffd43b]"><Download className="h-5 w-5" />{lang === 'ar' ? 'تنزيل كشف المعاملة' : lang === 'en' ? 'Download transaction statement' : 'Transaktionsübersicht herunterladen'}</a></section> : null}

            {(['pending', 'confirmed', 'preparing'].includes(order.status) || (isPickup && order.status === 'ready')) ? <section className="rounded-[24px] border border-white/10 bg-[#121216] p-4"><RestaurantOrderActions orderId={order.id} currentStatus={order.status as OrderStatus} locale={lang} fulfillmentType={isPickup ? 'pickup' : 'delivery'} /></section> : order.status === 'ready' ? <div data-testid="restaurant-detail-waiting-driver" className="rounded-[24px] border border-emerald-400/20 bg-emerald-400/10 p-4 text-center font-black text-emerald-300"><PackageCheck className="mx-auto mb-2 h-6 w-6" />{copy.waitingDriver}</div> : null}
          </aside>
        </div>
      </div>
    </section>
  );
}
