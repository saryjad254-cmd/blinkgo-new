'use client';

import { memo } from 'react';
import { Leaf, Car, Smartphone, TreePine } from 'lucide-react';
import { calculateOrderCO2InGrams, carbonBadge, carbonExamples, CARBON_TIPS } from '@/lib/carbon';
import { useI18n } from '@/lib/i18n/I18nProvider';

interface Props {
  items: Array<{ name: string; quantity: number }>;
  orderNumber: string;
}

const COPY: Record<'ar' | 'de' | 'en', {
  title: string;
  co2Unit: string;
  footprint: string;
  carDrive: string;
  phoneCharge: string;
  treesOffset: string;
  transparency: string;
}> = {
  ar: {
    title: 'البصمة البيئية للطلب',
    co2Unit: 'كجم CO₂',
    footprint: 'بصمة',
    carDrive: 'قيادة سيارة',
    phoneCharge: 'شحن هاتف',
    treesOffset: 'تعويض سنوي',
    transparency: '🌱 نلتزم بالشفافية البيئية — بدون greenwashing',
  },
  de: {
    title: 'CO₂-Fußabdruck dieser Bestellung',
    co2Unit: 'kg CO₂',
    footprint: 'Fußabdruck',
    carDrive: 'Autofahrt',
    phoneCharge: 'Handy-Ladungen',
    treesOffset: 'Jahresausgleich',
    transparency: '🌱 Wir stehen für Umwelttransparenz — kein Greenwashing',
  },
  en: {
    title: 'Environmental footprint of this order',
    co2Unit: 'kg CO₂',
    footprint: 'Footprint',
    carDrive: 'Driving a car',
    phoneCharge: 'Phone charges',
    treesOffset: 'Annual offset',
    transparency: '🌱 We commit to environmental transparency — no greenwashing',
  },
};

/**
 * CarbonCard — environmental impact card for an order.
 *
 * Locale-aware: every label is 3-locale (ar/de/en), wrapped in React.memo
 * so it does not re-render when its parent does.
 */
export const CarbonCard = memo(function CarbonCard({ items, orderNumber }: Props) {
  const { locale } = useI18n();
  const grams = calculateOrderCO2InGrams(items);
  const kg = (grams / 1000).toFixed(2);
  const badge = carbonBadge(grams);
  const trees = carbonExamples.trees(grams);
  const carKm = carbonExamples.carKm(grams);
  const c = COPY[locale as 'ar' | 'de' | 'en'] ?? COPY.de;

  const colorMap: Record<string, string> = {
    green: 'from-green-500 to-emerald-600',
    yellow: 'from-yellow-500 to-brand-yellow-600',
    orange: 'from-brand-500 to-red-500',
  };

  const ringColorMap: Record<string, string> = {
    green: 'text-green-600 bg-green-50 border-green-200',
    yellow: 'text-warning bg-warning/15 border-warning/30',
    orange: 'text-danger bg-danger/15 border-danger/30',
  };

  // Localised "low/medium/high" label
  const badgeLabel =
    locale === 'ar'
      ? badge.level === 'low' ? 'منخفضة' : badge.level === 'medium' ? 'متوسطة' : 'عالية'
      : locale === 'en'
      ? badge.level
      : badge.level === 'low' ? 'niedrig' : badge.level === 'medium' ? 'mittel' : 'hoch';

  // Localised tip text per level
  const tipText = CARBON_TIPS[locale as 'ar' | 'de' | 'en']?.[badge.level] ?? CARBON_TIPS.de[badge.level];

  return (
    <div className="card overflow-hidden">
      <div className={`bg-gradient-to-br ${colorMap[badge.color]} text-white p-4`}>
        <div className="flex items-center gap-2 mb-2">
          <Leaf className="w-5 h-5" />
          <h3 className="font-bold">{c.title}</h3>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold">{kg}</span>
          <span className="text-xl">{c.co2Unit}</span>
        </div>
        <p className="text-sm opacity-90 mt-1">
          {badge.emoji} {c.footprint} <strong>{badgeLabel}</strong>
        </p>
      </div>

      <div className="p-4 space-y-3">
        {/* Comparisons */}
        <div className="grid grid-cols-3 gap-2">
          <div className={`p-3 rounded-xl border ${ringColorMap[badge.color]} text-center`}>
            <Car className="w-5 h-5 mx-auto mb-1" />
            <p className="text-xs font-medium">{carKm} {locale === 'en' ? 'km' : locale === 'ar' ? 'كم' : 'km'}</p>
            <p className="text-[10px] opacity-70">{c.carDrive}</p>
          </div>
          <div className={`p-3 rounded-xl border ${ringColorMap[badge.color]} text-center`}>
            <Smartphone className="w-5 h-5 mx-auto mb-1" />
            <p className="text-xs font-medium">{carbonExamples.phones(grams)}x</p>
            <p className="text-[10px] opacity-70">{c.phoneCharge}</p>
          </div>
          <div className={`p-3 rounded-xl border ${ringColorMap[badge.color]} text-center`}>
            <TreePine className="w-5 h-5 mx-auto mb-1" />
            <p className="text-xs font-medium">{trees} 🌳</p>
            <p className="text-[10px] opacity-70">{c.treesOffset}</p>
          </div>
        </div>

        {/* Tip */}
        <div className={`p-3 rounded-xl border ${ringColorMap[badge.color]}`}>
          <p className="text-xs leading-relaxed">{tipText}</p>
        </div>

        <p className="text-[10px] text-text-muted text-center">
          {c.transparency}
        </p>
      </div>
    </div>
  );
});
