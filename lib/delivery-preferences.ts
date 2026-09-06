export type DeliveryHandoff = 'hand_to_me' | 'leave_at_door';

export interface DeliveryPreferences {
  handoff: DeliveryHandoff;
  recipient_name: string;
  bell_name: string;
  floor: string;
  instructions: string;
}

export const EMPTY_DELIVERY_PREFERENCES: DeliveryPreferences = {
  handoff: 'hand_to_me',
  recipient_name: '',
  bell_name: '',
  floor: '',
  instructions: '',
};

function clean(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function sanitizeDeliveryPreferences(value: unknown): DeliveryPreferences {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    handoff: source.handoff === 'leave_at_door' ? 'leave_at_door' : 'hand_to_me',
    recipient_name: clean(source.recipient_name, 80),
    bell_name: clean(source.bell_name, 80),
    floor: clean(source.floor, 20),
    instructions: clean(source.instructions, 300),
  };
}

export function hasDeliveryPreferences(value: DeliveryPreferences): boolean {
  return value.handoff === 'leave_at_door' || Boolean(value.recipient_name || value.bell_name || value.floor || value.instructions);
}

export function formatDeliveryPreferences(value: DeliveryPreferences, locale: 'de' | 'en' | 'ar' = 'de'): string {
  const labels = locale === 'ar'
    ? { hand: 'التسليم باليد', door: 'اتركه عند الباب', recipient: 'المستلم', bell: 'الجرس', floor: 'الطابق', note: 'ملاحظة' }
    : locale === 'en'
      ? { hand: 'Hand to recipient', door: 'Leave at the door', recipient: 'Recipient', bell: 'Bell', floor: 'Floor', note: 'Note' }
      : { hand: 'Persönlich übergeben', door: 'Vor der Tür abstellen', recipient: 'Empfänger', bell: 'Klingel', floor: 'Etage', note: 'Hinweis' };
  return [
    value.handoff === 'leave_at_door' ? labels.door : labels.hand,
    value.recipient_name && `${labels.recipient}: ${value.recipient_name}`,
    value.bell_name && `${labels.bell}: ${value.bell_name}`,
    value.floor && `${labels.floor}: ${value.floor}`,
    value.instructions && `${labels.note}: ${value.instructions}`,
  ].filter(Boolean).join(' · ');
}
