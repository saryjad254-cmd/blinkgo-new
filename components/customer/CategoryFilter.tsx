'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { cn } from '@/lib/cn';

interface Props {
  categories: string[];
  active?: string;
}

// Translate known cuisine types from German to Arabic (and back if needed)
const CUISINE_TRANSLATIONS: Record<string, { de: string; ar: string; en: string }> = {
  'Deutsch': { de: 'Deutsch', ar: 'ألماني', en: 'Deutsch' },
  'Amerikanisch': { de: 'Amerikanisch', ar: 'أمريكي', en: 'Amerikanisch' },
  'Italienisch': { de: 'Italienisch', ar: 'إيطالي', en: 'Italienisch' },
  'Burger': { de: 'Burger', ar: 'برغر', en: 'Burger' },
  'Pizza': { de: 'Pizza', ar: 'بيتزا', en: 'Pizza' },
  'Asiatisch': { de: 'Asiatisch', ar: 'آسيوي', en: 'Asiatisch' },
  'Sushi': { de: 'Sushi', ar: 'سوشي', en: 'Sushi' },
  'Mexikanisch': { de: 'Mexikanisch', ar: 'مكسيكي', en: 'Mexikanisch' },
  'Indisch': { de: 'Indisch', ar: 'هندي', en: 'Indisch' },
  'Vegetarisch': { de: 'Vegetarisch', ar: 'نباتي', en: 'Vegetarisch' },
  'Vegan': { de: 'Vegan', ar: 'نباتي صرف', en: 'Vegan' },
  'Döner': { de: 'Döner', ar: 'دونر', en: 'Döner' },
  'Pizza & Pasta': { de: 'Pizza & Pasta', ar: 'بيتزا وباستا', en: 'Pizza & Pasta' },
  'Arabisch': { de: 'Arabisch', ar: 'عربي', en: 'Arabisch' },
  'Türkisch': { de: 'Türkisch', ar: 'تركي', en: 'Türkisch' },
  'Griechisch': { de: 'Griechisch', ar: 'يوناني', en: 'Griechisch' },
  'Französisch': { de: 'Französisch', ar: 'فرنسي', en: 'Französisch' },
  'Spanisch': { de: 'Spanisch', ar: 'إسباني', en: 'Spanisch' },
  'Japanisch': { de: 'Japanisch', ar: 'ياباني', en: 'Japanisch' },
  'Chinesisch': { de: 'Chinesisch', ar: 'صيني', en: 'Chinesisch' },
  'Thai': { de: 'Thai', ar: 'تايلندي', en: 'Thai' },
  'Café': { de: 'Café', ar: 'مقهى', en: 'Café' },
  'Eiscreme': { de: 'Eiscreme', ar: 'آيس كريم', en: 'Eiscreme' },
  'Kuchen': { de: 'Kuchen', ar: 'كيك', en: 'Kuchen' },
  'Salat': { de: 'Salat', ar: 'سلطة', en: 'Salat' },
  'Suppe': { de: 'Suppe', ar: 'شوربة', en: 'Suppe' },
  'Gegrillt': { de: 'Gegrillt', ar: 'مشوي', en: 'Gegrillt' },
  'Fisch': { de: 'Fisch', ar: 'سمك', en: 'Fisch' },
  'Meeresfrüchte': { de: 'Meeresfrüchte', ar: 'مأكولات بحرية', en: 'Meeresfrüchte' },
  'Steak': { de: 'Steak', ar: 'ستيك', en: 'Steak' },
  'BBQ': { de: 'BBQ', ar: 'باربكيو', en: 'BBQ' },
  'Frühstück': { de: 'Frühstück', ar: 'فطور', en: 'Frühstück' },
  'Snacks': { de: 'Snacks', ar: 'وجبات خفيفة', en: 'Snacks' },
  'Desserts': { de: 'Desserts', ar: 'حلويات', en: 'Desserts' },
  'Getränke': { de: 'Getränke', ar: 'مشروبات', en: 'Getränke' },
};

function translateCategory(cat: string, locale: 'de' | 'ar' | 'en'): string {
  // Look up in dictionary
  const entry = CUISINE_TRANSLATIONS[cat];
  if (entry) return entry[locale];

  // Try lowercase lookup
  const lower = Object.keys(CUISINE_TRANSLATIONS).find(
    (k) => k.toLowerCase() === cat.toLowerCase()
  );
  if (lower) return CUISINE_TRANSLATIONS[lower][locale];

  // Fallback: if it's German in AR mode, just use the German (restaurant data)
  // If it's AR in DE mode, just use the Arabic (restaurant data)
  return cat;
}

export function CategoryFilter({ categories, active }: Props) {
  const { t, locale } = useI18n();
  const params = useSearchParams();

  function buildHref(cat?: string) {
    const sp = new URLSearchParams(params?.toString() || '');
    if (cat) sp.set('category', cat);
    else sp.delete('category');
    return `?${sp.toString()}`;
  }

  return (
    <>
      <Link
        href={buildHref()}
        className={cn(
          "px-3 py-1.5 rounded-pill text-xs font-semibold whitespace-nowrap transition-all",
          !active
            ? "bg-speed-gradient text-white shadow-speed"
            : "bg-surface-elevated text-text-secondary hover:bg-surface-light hover:text-white"
        )}
      >
        {t.customer.allCategories}
      </Link>
      {categories.map((cat) => (
        <Link
          key={cat}
          href={buildHref(cat)}
          className={cn(
            "px-3 py-1.5 rounded-pill text-xs font-semibold whitespace-nowrap transition-all",
            active === cat
              ? "bg-speed-gradient text-white shadow-speed"
              : "bg-surface-elevated text-text-secondary hover:bg-surface-light hover:text-white"
          )}
        >
          {translateCategory(cat, locale)}
        </Link>
      ))}
    </>
  );
}
