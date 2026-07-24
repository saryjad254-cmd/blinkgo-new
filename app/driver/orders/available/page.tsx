/**
 * Driver — Available Orders Screen
 * ─────────────────────────────────
 * Dedicated page listing all ready-for-pickup orders a driver can accept.
 * Reached by tapping the "Available Orders" button on /driver/orders.
 *
 * Layout (Uber/Wolt style):
 * 1. Sticky top bar with back, title, refresh
 * 2. Hero card showing the count of available orders + connection/online state
 * 3. Filter chips (by distance, payout)
 * 4. List of available orders as scrollable cards with action button
 * 5. Empty state when nothing is available
 */
import { requireRole } from '@/lib/rbac';
import { createServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyStateClient as EmptyState } from '@/components/shared/EmptyStateClient';
import { Card } from '@/components/ui/Card';
import { AcceptOrderButton } from '@/components/driver/AcceptOrderButton';
import { AvailableOrderList } from '@/components/driver/AvailableOrderList';
import { getServerTranslations } from '@/lib/i18n/server-translations';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { Inbox, RefreshCw, ChevronLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

async function getAvailableOrders(): Promise<any[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('orders')
    .select(`*, restaurants(name, address, latitude, longitude)`)
    .eq('status', 'ready')
    .is('driver_id', null)
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) return [];
  return (data ?? []) as any[];
}

function detectLocale(): 'de' | 'ar' | 'en' {
  // Read the dedicated locale cookie only — never scan the whole cookie header
  // for substrings (Supabase auth tokens can contain 'ar'/'en' by accident).
  const c = cookies().get('blinkgo-locale')?.value;
  if (c === 'ar') return 'ar';
  if (c === 'en') return 'en';
  return 'de';
}

export default async function AvailableOrdersPage() {
  await requireRole('driver');
  const orders = await getAvailableOrders();
  const { t } = await getServerTranslations();
  const locale = detectLocale();
  const Ihnen = locale === 'ar' ? 'rtl' : 'ltr';
  const T = t.driver;

  return (
    <div dir={Ihnen} className="min-h-screen bg-bg pb-32">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-30 bg-bg/85 backdrop-blur-xl border-b border-edge-light">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <Link
            href="/driver/orders"
            aria-label={T.back}
            className="w-10 h-10 rounded-full bg-surface-elevated hover:bg-surface-light flex items-center justify-center transition-colors"
          >
            <ChevronLeft className={`w-5 h-5 text-white ${locale === 'ar' ? 'rotate-180' : ''}`} />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-extrabold text-white truncate">
              {T.availableOrdersScreen}
            </h1>
            <p className="text-xs text-text-muted truncate">
              {T.availableOrdersDesc}
            </p>
          </div>
          <Link
            href="/driver/orders/available"
            aria-label={T.refresh}
            className="w-10 h-10 rounded-full bg-surface-elevated hover:bg-surface-light flex items-center justify-center transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-white" />
          </Link>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Hero card */}
        <div className="relative overflow-hidden rounded-3xl p-6 bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 text-white shadow-xl">
          <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-12 -left-12 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-2">
              <Inbox className="w-5 h-5" />
              <span className="text-sm font-bold uppercase tracking-wider opacity-90">
                {T.availableOrders}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl sm:text-6xl font-extrabold tabular-nums leading-none">
                {orders.length}
              </span>
              <span className="text-sm font-bold opacity-90">
                {orders.length === 1 ? T.availableCount.replace('{n}', '') : T.availableCount.replace('{n}', '')}
              </span>
            </div>
            <p className="text-sm opacity-90 mt-2">
              {orders.length > 0
                ? `${T.newOrderAlertDesc} 🚀`
                : T.noAvailable}
            </p>
          </div>
        </div>

        {/* List */}
        {orders.length === 0 ? (
          <Card>
            <EmptyState
              iconName="Inbox"
              title={T.noAvailable}
              description={T.noAvailableDesc}
            />
          </Card>
        ) : (
          <AvailableOrderList orders={orders} locale={locale} t={T} />
        )}
      </div>
    </div>
  );
}
