'use client';

import { OrderCalendar } from './OrderCalendar';
import { CompletedOrderCard, type CompletedOrderSummary } from './CompletedOrderCard';

interface Props {
  orders: CompletedOrderSummary[];
  locale: 'de' | 'ar' | 'en';
}

/**
 * Customer order list — uses the shared OrderCalendar to group
 * orders by day/week/month + status filter.
 */
export function CustomerOrderCalendar({ orders, locale }: Props) {
  return (
    <OrderCalendar
      orders={orders}
      locale={locale}
      showGrouping
      showStatusFilter
      showSummary
      defaultGrouping="day"
      defaultStatusFilter="all"
      renderOrder={(order) => (
        <CompletedOrderCard
          order={order as CompletedOrderSummary}
          locale={locale}
          t={{
            reorder: 'Nochmal bestellen',
            reorderLoading: 'Lädt...',
            reorderAdded: 'Hinzugefügt',
          }}
        />
      )}
    />
  );
}
