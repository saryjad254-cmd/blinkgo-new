/**
 * Driver State Machine
 * 
 * Represents all possible states a driver can be in.
 * Used for UI rendering and logic gating.
 */

export type DriverState =
  | 'offline'              // Driver app open but not working
  | 'going_online'         // Transitioning to online
  | 'online'               // Online, waiting for orders
  | 'waiting_for_orders'   // Online, no active order
  | 'new_order'            // New order received
  | 'driving_to_store'     // Heading to restaurant
  | 'waiting_at_store'     // At restaurant, waiting for food
  | 'delivering'           // On the way to customer
  | 'completed'            // Just completed a delivery
  | 'shift_closed_by_admin'// Admin closed the shift
  | 'outside_working_hours'// Outside working hours
  | 'connection_lost';     // Lost connection to server

export const STRINGS: Record<DriverState, { ar: string; de: string; en: string }> = {
  offline: { ar: 'غير متصل', de: 'Offline', en: 'Offline' },
  going_online: { ar: 'جاري الاتصال...', de: 'Wird online...', en: 'Going online...' },
  online: { ar: 'متصل', de: 'Online', en: 'Online' },
  waiting_for_orders: { ar: 'بانتظار طلب', de: 'Warte auf Bestellung', en: 'Waiting for order' },
  new_order: { ar: 'طلب جديد!', de: 'Neue Bestellung!', en: 'New order!' },
  driving_to_store: { ar: 'في الطريق للمطعم', de: 'Fahre zum Restaurant', en: 'Driving to store' },
  waiting_at_store: { ar: 'بانتظار الطعام في المطعم', de: 'Warte im Restaurant', en: 'Waiting at store' },
  delivering: { ar: 'قيد التوصيل', de: 'Lieferung läuft', en: 'Delivering' },
  completed: { ar: 'تم التوصيل', de: 'Abgeschlossen', en: 'Completed' },
  shift_closed_by_admin: { ar: 'أغلق الأدمن الدوام', de: 'Schicht vom Admin beendet', en: 'Shift closed by admin' },
  outside_working_hours: { ar: 'خارج ساعات العمل', de: 'Außerhalb der Arbeitszeiten', en: 'Outside working hours' },
  connection_lost: { ar: 'انقطع الاتصال', de: 'Verbindung verloren', en: 'Connection lost' },
};

export const COLORS: Record<DriverState, { bg: string; text: string; border: string; ring: string }> = {
  offline: { bg: 'bg-zinc-800', text: 'text-zinc-400', border: 'border-zinc-700', ring: 'ring-zinc-700' },
  going_online: { bg: 'bg-brand-yellow-500/20', text: 'text-brand-yellow-400', border: 'border-brand-yellow-500/40', ring: 'ring-yellow-500/40' },
  online: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/40', ring: 'ring-green-500/40' },
  waiting_for_orders: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/40', ring: 'ring-emerald-500/40' },
  new_order: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/40', ring: 'ring-blue-500/40' },
  driving_to_store: { bg: 'bg-brand-red-500/20', text: 'text-brand-red-400', border: 'border-brand-red-500/40', ring: 'ring-brand-red-500/40' },
  waiting_at_store: { bg: 'bg-brand-yellow-500/20', text: 'text-brand-yellow-400', border: 'border-brand-yellow-500/40', ring: 'ring-brand-yellow-500/40' },
  delivering: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/40', ring: 'ring-cyan-500/40' },
  completed: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/40', ring: 'ring-purple-500/40' },
  shift_closed_by_admin: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/40', ring: 'ring-red-500/40' },
  outside_working_hours: { bg: 'bg-brand-yellow-500/20', text: 'text-brand-yellow-400', border: 'border-brand-yellow-500/40', ring: 'ring-yellow-500/40' },
  connection_lost: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/40', ring: 'ring-red-500/40' },
};

export function stateLabel(s: DriverState, locale: 'ar' | 'de' | 'en' = 'de'): string {
  return STRINGS[s]?.[locale] || STRINGS[s]?.de || s;
}
