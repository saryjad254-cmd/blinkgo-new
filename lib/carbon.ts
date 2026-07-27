/**
 * carbon — per-order CO₂ calculation.
 * Source: Our World in Data + EWG meat-eater guide.
 * Values are grams CO₂e per 100g of food (approximate by category).
 *
 * Tip/label texts are locale-aware: we expose the raw "level" (low/medium/high)
 * and a tips object so the UI can render the right language.
 */

const CO2_BY_KEYWORD: Array<{ keywords: string[]; co2: number }> = [
  { keywords: ['لحم', 'beef', 'burger لحم'], co2: 2700 },
  { keywords: ['دجاج', 'chicken', 'برجر دجاج'], co2: 650 },
  { keywords: ['لحم ضأن', 'lamb'], co2: 2400 },
  { keywords: ['سمك', 'fish', 'تونا'], co2: 350 },
  { keywords: ['خضار', 'vegetable', 'سلطة'], co2: 50 },
  { keywords: ['أرز', 'rice'], co2: 250 },
  { keywords: ['خبز', 'bread'], co2: 120 },
  { keywords: ['بطاطس', 'potato', 'fries'], co2: 30 },
  { keywords: ['شاورما', 'shawarma'], co2: 1500 },
  { keywords: ['كولا', 'مشروب', 'cola', 'drink', 'juice'], co2: 200 },
  { keywords: ['حلوى', 'كيك', 'dessert'], co2: 400 },
  { keywords: ['قهوة', 'شاي', 'coffee'], co2: 280 },
];

const DEFAULT_CO2_PER_ITEM = 600;

export interface CarbonItem {
  name: string;
  quantity: number;
}

export function calculateOrderCO2InGrams(items: CarbonItem[]): number {
  let total = 0;
  for (const it of items) {
    const perItem = lookupCO2(it.name) * it.quantity;
    total += perItem;
  }
  return Math.round(total);
}

function lookupCO2(name: string): number {
  const lower = (name ?? '').toLowerCase();
  for (const entry of CO2_BY_KEYWORD) {
    if (entry.keywords.some((k) => lower.includes(k.toLowerCase()))) {
      return entry.co2;
    }
  }
  return DEFAULT_CO2_PER_ITEM;
}

/** 3-locale tip text per level */
export const CARBON_TIPS: Record<'ar' | 'de' | 'en', Record<'low' | 'medium' | 'high', string>> = {
  ar: {
    low: 'بصمتكم ممتازة — شكراً لاختياراتكم المستدامة!',
    medium: 'يمكن تقليل البصمة بطلب أطباق دجاج أو سمك بدلاً من اللحم',
    high: '💡 جرب النباتي أو السمك في الطلب القادم لـ -70% بصمة',
  },
  de: {
    low: 'Hervorragend! Vielen Dank für Ihre nachhaltige Auswahl.',
    medium: 'Tipp: Hähnchen oder Fisch statt Rind senkt den Fußabdruck deutlich.',
    high: '💡 Probieren Sie beim nächsten Mal vegetarisch oder Fisch — bis zu -70 % CO₂.',
  },
  en: {
    low: 'Excellent footprint — thank you for your sustainable choices!',
    medium: 'Tip: chicken or fish instead of beef can lower your footprint significantly.',
    high: '💡 Try vegetarian or fish on your next order — up to -70% footprint.',
  },
};

/** Return level (low/medium/high) — UI maps to its own localized label. */
export function carbonBadge(grams: number) {
  const kg = grams / 1000;

  if (grams < 500) {
    return { level: 'low' as const, emoji: '🌿', color: 'green' as const, label: 'low' };
  } else if (grams < 2500) {
    return { level: 'medium' as const, emoji: '🌱', color: 'yellow' as const, label: 'medium' };
  } else {
    return { level: 'high' as const, emoji: '🌳', color: 'orange' as const, label: 'high' };
  }
}

export const carbonExamples = {
  trees: (g: number) => Math.round((g / 1000 / 22) * 100) / 100,
  carKm: (g: number) => Math.round(g / 120),
  phones: (g: number) => Math.round(g / 5),
};
