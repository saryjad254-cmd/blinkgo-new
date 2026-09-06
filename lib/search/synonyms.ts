/**
 * Search Synonyms — Configurable, multi-locale, scalable synonym engine
 *
 * Architecture:
 *   - In-memory cache (TTL 5 min) of the synonym table
 *   - Source: `data/synonyms.json` (configurable, expandable)
 *   - Supports: DE / EN / AR / FA / TR / more
 *   - Symmetric: any term in a group matches the group
 *   - Categories: cuisine / restaurant / food / drink / generic
 *
 * In production, the data file would be managed via a CMS or admin panel.
 * For now, the JSON file is checked into git and hot-reloaded on change.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export type SynonymCategory = 'cuisine' | 'restaurant' | 'food' | 'drink' | 'generic';

export interface SynonymGroup {
  id: string;
  category: SynonymCategory;
  canonical: string; // The "primary" term in the group
  synonyms: Array<{ term: string; locale: 'de' | 'en' | 'ar' | 'fa' | 'tr' | string }>;
}

// Default synonym groups (used if data file is missing)
const DEFAULT_SYNONYM_GROUPS: SynonymGroup[] = [
  // ============== PIZZA ==============
  { id: 'pizza', category: 'food', canonical: 'pizza', synonyms: [
    { term: 'pizza', locale: 'en' },
    { term: 'pizza', locale: 'de' },
    { term: 'pizzen', locale: 'de' },
    { term: 'pizze', locale: 'it' },
    { term: 'pizzeria', locale: 'it' },
    { term: 'pizzaria', locale: 'en' },
    { term: 'بيتز', locale: 'ar' },
    { term: 'بيتزا', locale: 'ar' },
    { term: 'بيطسا', locale: 'ar' },  // common typo
    { term: '披萨', locale: 'zh' },
    { term: 'pitsa', locale: 'ar' },  // transliteration
  ]},

  // ============== BURGER ==============
  { id: 'burger', category: 'food', canonical: 'burger', synonyms: [
    { term: 'burger', locale: 'en' },
    { term: 'burger', locale: 'de' },
    { term: 'burgers', locale: 'en' },
    { term: 'hamburger', locale: 'en' },
    { term: 'hamburger', locale: 'de' },
    { term: 'برغر', locale: 'ar' },
    { term: 'برجر', locale: 'ar' },  // common variant
    { term: 'بركر', locale: 'ar' },  // common typo
    { term: 'همبرغر', locale: 'ar' },
    { term: '汉堡', locale: 'zh' },
    { term: 'burgar', locale: 'en' },  // common typo
  ]},

  // ============== FRIES ==============
  { id: 'fries', category: 'food', canonical: 'fries', synonyms: [
    { term: 'fries', locale: 'en' },
    { term: 'fry', locale: 'en' },
    { term: 'french fries', locale: 'en' },
    { term: 'chips', locale: 'en' },
    { term: 'pommes', locale: 'de' },
    { term: 'pommes frites', locale: 'de' },
    { term: 'fritten', locale: 'de' },
    { term: 'kartoffeln', locale: 'de' },
    { term: 'بطاطس', locale: 'ar' },
    { term: 'بوم فريت', locale: 'ar' },
    { term: '薯条', locale: 'zh' },
  ]},

  // ============== CHICKEN ==============
  { id: 'chicken', category: 'food', canonical: 'chicken', synonyms: [
    { term: 'chicken', locale: 'en' },
    { term: 'hähnchen', locale: 'de' },
    { term: 'hendl', locale: 'de' },
    { term: 'hühnchen', locale: 'de' },
    { term: 'poultry', locale: 'en' },
    { term: 'دجاج', locale: 'ar' },
    { term: 'دجاجة', locale: 'ar' },
    { term: 'فراخ', locale: 'ar' },
    { term: '鸡肉', locale: 'zh' },
  ]},

  // ============== SUSHI ==============
  { id: 'sushi', category: 'food', canonical: 'sushi', synonyms: [
    { term: 'sushi', locale: 'en' },
    { term: 'sushi', locale: 'de' },
    { term: 'maki', locale: 'de' },
    { term: 'nigiri', locale: 'de' },
    { term: 'sashimi', locale: 'de' },
    { term: 'سوشي', locale: 'ar' },
    { term: 'سوشى', locale: 'ar' },  // common variant
    { term: 'سوشي', locale: 'ar' },  // another common spelling
    { term: '寿司', locale: 'zh' },
  ]},

  // ============== PASTA ==============
  { id: 'pasta', category: 'food', canonical: 'pasta', synonyms: [
    { term: 'pasta', locale: 'en' },
    { term: 'nudeln', locale: 'de' },
    { term: 'spaghetti', locale: 'en' },
    { term: 'spaghetti', locale: 'de' },
    { term: 'penne', locale: 'it' },
    { term: 'penne', locale: 'de' },
    { term: 'fettuccine', locale: 'it' },
    { term: 'معكرونة', locale: 'ar' },
    { term: 'مكرونة', locale: 'ar' },
  ]},

  // ============== SALAD ==============
  { id: 'salad', category: 'food', canonical: 'salad', synonyms: [
    { term: 'salad', locale: 'en' },
    { term: 'salat', locale: 'de' },
    { term: 'salate', locale: 'de' },
    { term: 'salate', locale: 'it' },
    { term: 'سلطة', locale: 'ar' },
    { term: 'سلطات', locale: 'ar' },
  ]},

  // ============== COFFEE ==============
  { id: 'coffee', category: 'drink', canonical: 'coffee', synonyms: [
    { term: 'coffee', locale: 'en' },
    { term: 'kaffee', locale: 'de' },
    { term: 'café', locale: 'de' },
    { term: 'café', locale: 'fr' },
    { term: 'espresso', locale: 'en' },
    { term: 'cappuccino', locale: 'en' },
    { term: 'latte', locale: 'en' },
    { term: 'قهوة', locale: 'ar' },
    { term: 'كافيه', locale: 'ar' },
    { term: '咖啡', locale: 'zh' },
  ]},

  // ============== TEA ==============
  { id: 'tea', category: 'drink', canonical: 'tea', synonyms: [
    { term: 'tea', locale: 'en' },
    { term: 'tee', locale: 'de' },
    { term: 'شاي', locale: 'ar' },
    { term: '茶', locale: 'zh' },
  ]},

  // ============== BREAKFAST ==============
  { id: 'breakfast', category: 'food', canonical: 'breakfast', synonyms: [
    { term: 'breakfast', locale: 'en' },
    { term: 'frühstück', locale: 'de' },
    { term: 'frühstuck', locale: 'de' },  // common typo
    { term: 'brunch', locale: 'en' },
    { term: 'فطور', locale: 'ar' },
    { term: 'إفطار', locale: 'ar' },
  ]},

  // ============== DESSERT ==============
  { id: 'dessert', category: 'food', canonical: 'dessert', synonyms: [
    { term: 'dessert', locale: 'en' },
    { term: 'desserts', locale: 'en' },
    { term: 'nachspeise', locale: 'de' },
    { term: 'nachspeisen', locale: 'de' },
    { term: 'süßspeise', locale: 'de' },
    { term: 'süßspeisen', locale: 'de' },
    { term: 'kuchen', locale: 'de' },
    { term: 'torte', locale: 'de' },
    { term: 'حلويات', locale: 'ar' },
    { term: 'حلى', locale: 'ar' },
  ]},

  // ============== ICE CREAM ==============
  { id: 'ice-cream', category: 'food', canonical: 'ice cream', synonyms: [
    { term: 'ice cream', locale: 'en' },
    { term: 'icecream', locale: 'en' },
    { term: 'eis', locale: 'de' },
    { term: 'eiscreme', locale: 'de' },
    { term: 'gelato', locale: 'it' },
    { term: 'آيس كريم', locale: 'ar' },
    { term: 'مثلجات', locale: 'ar' },
  ]},

  // ============== CAKE ==============
  { id: 'cake', category: 'food', canonical: 'cake', synonyms: [
    { term: 'cake', locale: 'en' },
    { term: 'kuchen', locale: 'de' },
    { term: 'torte', locale: 'de' },
    { term: 'كعكة', locale: 'ar' },
    { term: 'كيك', locale: 'ar' },
  ]},

  // ============== BREAD ==============
  { id: 'bread', category: 'food', canonical: 'bread', synonyms: [
    { term: 'bread', locale: 'en' },
    { term: 'brot', locale: 'de' },
    { term: 'broetchen', locale: 'de' },  // umlaut-free
    { term: 'brötchen', locale: 'de' },
    { term: 'خبز', locale: 'ar' },
  ]},

  // ============== SOUP ==============
  { id: 'soup', category: 'food', canonical: 'soup', synonyms: [
    { term: 'soup', locale: 'en' },
    { term: 'suppe', locale: 'de' },
    { term: 'حساء', locale: 'ar' },
    { term: 'شوربة', locale: 'ar' },
  ]},

  // ============== STEAK ==============
  { id: 'steak', category: 'food', canonical: 'steak', synonyms: [
    { term: 'steak', locale: 'en' },
    { term: 'steaks', locale: 'en' },
    { term: 'beef', locale: 'en' },
    { term: 'rindfleisch', locale: 'de' },
    { term: 'rind', locale: 'de' },
    { term: 'لحم', locale: 'ar' },
    { term: 'لحم بقري', locale: 'ar' },
    { term: 'ستيك', locale: 'ar' },
  ]},

  // ============== SEAFOOD ==============
  { id: 'seafood', category: 'food', canonical: 'seafood', synonyms: [
    { term: 'seafood', locale: 'en' },
    { term: 'meeresfrüchte', locale: 'de' },
    { term: 'fish', locale: 'en' },
    { term: 'fisch', locale: 'de' },
    { term: 'مأكولات بحرية', locale: 'ar' },
    { term: 'سمك', locale: 'ar' },
    { term: 'مأكولات بحريه', locale: 'ar' },  // common typo
  ]},

  // ============== DRINKS ==============
  { id: 'drink', category: 'drink', canonical: 'drink', synonyms: [
    { term: 'drink', locale: 'en' },
    { term: 'getränk', locale: 'de' },
    { term: 'getränke', locale: 'de' },
    { term: 'beverage', locale: 'en' },
    { term: 'مشروب', locale: 'ar' },
    { term: 'مشروبات', locale: 'ar' },
  ]},

  // ============== VEGAN ==============
  { id: 'vegan', category: 'generic', canonical: 'vegan', synonyms: [
    { term: 'vegan', locale: 'en' },
    { term: 'vegan', locale: 'de' },
    { term: 'plant based', locale: 'en' },
    { term: 'نباتي', locale: 'ar' },
  ]},

  // ============== VEGETARIAN ==============
  { id: 'vegetarian', category: 'generic', canonical: 'vegetarian', synonyms: [
    { term: 'vegetarian', locale: 'en' },
    { term: 'vegetarisch', locale: 'de' },
    { term: 'veggie', locale: 'en' },
    { term: 'نباتي', locale: 'ar' },
  ]},

  // ============== CUISINES ==============
  { id: 'italian', category: 'cuisine', canonical: 'Italian', synonyms: [
    { term: 'italian', locale: 'en' },
    { term: 'italienisch', locale: 'de' },
    { term: 'italienishe', locale: 'de' },  // common typo
    { term: 'italia', locale: 'it' },
    { term: 'إيطالي', locale: 'ar' },
    { term: 'italienisces', locale: 'de' },
  ]},

  { id: 'japanese', category: 'cuisine', canonical: 'Japanese', synonyms: [
    { term: 'japanese', locale: 'en' },
    { term: 'japanisch', locale: 'de' },
    { term: 'japanishe', locale: 'de' },
    { term: 'japan', locale: 'en' },
    { term: 'ياباني', locale: 'ar' },
  ]},

  { id: 'american', category: 'cuisine', canonical: 'American', synonyms: [
    { term: 'american', locale: 'en' },
    { term: 'amerikanisch', locale: 'de' },
    { term: 'أمريكي', locale: 'ar' },
    { term: 'usa', locale: 'en' },
  ]},

  { id: 'mexican', category: 'cuisine', canonical: 'Mexican', synonyms: [
    { term: 'mexican', locale: 'en' },
    { term: 'mexikanisch', locale: 'de' },
    { term: 'mexikanishe', locale: 'de' },
    { term: 'مكسيكي', locale: 'ar' },
    { term: 'taco', locale: 'en' },
    { term: 'burrito', locale: 'en' },
  ]},

  { id: 'indian', category: 'cuisine', canonical: 'Indian', synonyms: [
    { term: 'indian', locale: 'en' },
    { term: 'indisch', locale: 'de' },
    { term: 'indische', locale: 'de' },
    { term: 'هندي', locale: 'ar' },
    { term: 'curry', locale: 'en' },
  ]},

  { id: 'arabic', category: 'cuisine', canonical: 'Arabic', synonyms: [
    { term: 'arabic', locale: 'en' },
    { term: 'arabisch', locale: 'de' },
    { term: 'arabishe', locale: 'de' },
    { term: 'عربي', locale: 'ar' },
    { term: 'lebanese', locale: 'en' },
    { term: 'falafel', locale: 'en' },
    { term: 'kebab', locale: 'en' },
  ]},

  { id: 'asian', category: 'cuisine', canonical: 'Asian', synonyms: [
    { term: 'asian', locale: 'en' },
    { term: 'asiatisch', locale: 'de' },
    { term: 'آسيوي', locale: 'ar' },
    { term: 'asia', locale: 'en' },
  ]},
];

// ============== Runtime cache ==============
let cachedGroups: SynonymGroup[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 min

function loadGroups(): SynonymGroup[] {
  // Try to load from JSON file (configurable)
  const filePath = join(process.cwd(), 'data', 'synonyms.json');
  if (existsSync(filePath)) {
    try {
      const content = readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed as SynonymGroup[];
      }
    } catch (e) {
      // fall through to default
    }
  }
  return DEFAULT_SYNONYM_GROUPS;
}

function getGroups(): SynonymGroup[] {
  const now = Date.now();
  if (cachedGroups && now - cacheTimestamp < CACHE_TTL) {
    return cachedGroups;
  }
  cachedGroups = loadGroups();
  cacheTimestamp = now;
  return cachedGroups;
}

// ============== Index for fast lookup ==============
let termToGroup: Map<string, { group: SynonymGroup; entry: { term: string; locale: string } }> | null = null;

function getIndex() {
  if (termToGroup) return termToGroup;
  const groups = getGroups();
  const idx = new Map<string, { group: SynonymGroup; entry: { term: string; locale: string } }>();
  for (const group of groups) {
    for (const entry of group.synonyms) {
      const key = entry.term.toLowerCase().trim();
      idx.set(key, { group, entry });
    }
    // Also index the canonical
    const canonicalKey = group.canonical.toLowerCase().trim();
    if (!idx.has(canonicalKey)) {
      idx.set(canonicalKey, { group, entry: { term: group.canonical, locale: 'en' } });
    }
  }
  termToGroup = idx;
  return idx;
}

/**
 * Normalize a term to its canonical form (the primary term in the group).
 * If no group matches, returns the input unchanged.
 */
export function canonicalize(term: string): string {
  const idx = getIndex();
  const key = term.toLowerCase().trim();
  const found = idx.get(key);
  if (found) return found.group.canonical;
  return term;
}

/**
 * Expand a query with synonyms. Returns additional terms to OR with.
 * The input term is NOT included in the output (it's already in the query).
 */
export function expandQueryWithSynonyms(query: string): string[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const idx = getIndex();
  const found = idx.get(q);
  if (!found) return [];
  // Return all synonyms in the group except the original
  return found.group.synonyms
    .map((s) => s.term)
    .filter((t) => t.toLowerCase() !== q);
}

/**
 * Expand multiple tokens with synonyms
 */
export function expandTokensWithSynonyms(tokens: string[]): string[] {
  const out: string[] = [];
  for (const tok of tokens) {
    out.push(...expandQueryWithSynonyms(tok));
  }
  return Array.from(new Set(out));
}

/**
 * Find a group by partial term (fuzzy search within the dictionary).
 * Used by the typo-correction engine.
 */
export function findClosestGroup(term: string, maxDistance = 2): SynonymGroup | null {
  const t = term.toLowerCase().trim();
  if (!t) return null;
  const groups = getGroups();

  let bestGroup: SynonymGroup | null = null;
  let bestDistance = Infinity;

  for (const group of groups) {
    for (const entry of group.synonyms) {
      const d = levenshtein(t, entry.term.toLowerCase());
      if (d > 0 && d <= maxDistance && d < bestDistance) {
        bestDistance = d;
        bestGroup = group;
      }
    }
  }

  return bestGroup;
}

/**
 * Levenshtein distance (case-insensitive, supports Arabic/Latin)
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m: number[][] = [];
  for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        m[i][j] = m[i - 1][j - 1];
      } else {
        m[i][j] = Math.min(
          m[i - 1][j - 1] + 1,
          m[i][j - 1] + 1,
          m[i - 1][j] + 1
        );
      }
    }
  }
  return m[b.length][a.length];
}

/**
 * Multi-language typo correction.
 * Returns the canonical term if a close match is found, else null.
 *
 * Examples:
 *   "piza" → "pizza"
 *   "burgar" → "burger"
 *   "italienishe" → "italienisch"
 *   "بيتز" → "pizza"
 *   "بركر" → "burger"
 *   "سوشى" → "sushi"
 */
export function correctTypo(term: string, maxDistance = 2): string | null {
  const group = findClosestGroup(term, maxDistance);
  if (!group) return null;
  return group.canonical;
}

/**
 * Get all groups (for admin/debugging)
 */
export function getAllSynonymGroups(): SynonymGroup[] {
  return getGroups();
}

/**
 * Get the count of groups and total synonyms (for stats)
 */
export function getSynonymStats(): { groups: number; synonyms: number; locales: Set<string> } {
  const groups = getGroups();
  const locales = new Set<string>();
  let totalSynonyms = 0;
  for (const g of groups) {
    totalSynonyms += g.synonyms.length;
    for (const s of g.synonyms) {
      locales.add(s.locale);
    }
  }
  return { groups: groups.length, synonyms: totalSynonyms, locales };
}
