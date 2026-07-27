/**
 * Auto-Translation Map
 * ────────────────────
 * Maps common hardcoded strings to translations.
 * Used by <T> component to auto-render in correct language.
 * 
 * Add new entries here as you encounter hardcoded text.
 * Format: [key: string]: { de: string, ar: string }
 */

export const TRANSLATIONS_MAP: Record<string, { de: string; ar: string; en: string }> = {
  // Navigation (common)
  'الرئيسية': { de: 'Startseite', ar: 'الرئيسية', en: 'Startseite' },
  'المطاعم': { de: 'Restaurants', ar: 'المطاعم', en: 'Restaurants' },
  'السلة': { de: 'Warenkorb', ar: 'السلة', en: 'Warenkorb' },
  'طلباتي': { de: 'Meine Bestellungen', ar: 'طلباتي', en: 'Meine Bestellungen' },
  'حسابي': { de: 'Mein Konto', ar: 'حسابي', en: 'Mein Konto' },
  'تسجيل الدخول': { de: 'Anmelden', ar: 'تسجيل الدخول', en: 'Anmelden' },
  'تسجيل الخروج': { de: 'Abmelden', ar: 'تسجيل الخروج', en: 'Abmelden' },
  'الطلبات': { de: 'Bestellungen', ar: 'الطلبات', en: 'Bestellungen' },
  'الإعدادات': { de: 'Einstellungen', ar: 'الإعدادات', en: 'Einstellungen' },
  'لوحة التحكم': { de: 'Dashboard', ar: 'لوحة التحكم', en: 'Dashboard' },
  
  // Common actions
  'حفظ': { de: 'Speichern', ar: 'حفظ', en: 'Speichern' },
  'إلغاء': { de: 'Abbrechen', ar: 'إلغاء', en: 'Abbrechen' },
  'حذف': { de: 'Löschen', ar: 'حذف', en: 'Löschen' },
  'تعديل': { de: 'Bearbeiten', ar: 'تعديل', en: 'Bearbeiten' },
  'إضافة': { de: 'Hinzufügen', ar: 'إضافة', en: 'Hinzufügen' },
  'رجوع': { de: 'Zurück', ar: 'رجوع', en: 'Zurück' },
  'تأكيد': { de: 'Bestätigen', ar: 'تأكيد', en: 'Bestätigen' },
  'بحث': { de: 'Suchen', ar: 'بحث', en: 'Suchen' },
  'تطبيق': { de: 'Anwenden', ar: 'تطبيق', en: 'Anwenden' },
  
  // Cart
  'السلة فارغة': { de: 'Warenkorb ist leer', ar: 'السلة فارغة', en: 'Warenkorb ist leer' },
  'المجموع الفرعي': { de: 'Zwischensumme', ar: 'المجموع الفرعي', en: 'Zwischensumme' },
  'رسوم التوصيل': { de: 'Liefergebühr', ar: 'رسوم التوصيل', en: 'Liefergebühr' },
  'الخصم': { de: 'Rabatt', ar: 'الخصم', en: 'Rabatt' },
  'البقشيش': { de: 'Trinkgeld', ar: 'البقشيش', en: 'Trinkgeld' },
  'الإجمالي': { de: 'Gesamt', ar: 'الإجمالي', en: 'Gesamt' },
  'تأكيد الطلب': { de: 'Bestellung aufgeben', ar: 'تأكيد الطلب', en: 'Bestellung aufgeben' },
  
  // Common errors
  'غير مصرح': { de: 'Nicht autorisiert', ar: 'غير مصرح', en: 'Nicht autorisiert' },
  'حدث خطأ': { de: 'Ein Fehler ist aufgetreten', ar: 'حدث خطأ', en: 'Ein Fehler ist aufgetreten' },
  'جاري التحميل': { de: 'Wird geladen', ar: 'جاري التحميل', en: 'Wird geladen' },
  'لا توجد بيانات': { de: 'Keine Daten', ar: 'لا توجد بيانات', en: 'Keine Daten' },
  
  // Profile
  'الاسم': { de: 'Name', ar: 'الاسم', en: 'Name' },
  'البريد الإلكتروني': { de: 'E-Mail', ar: 'البريد الإلكتروني', en: 'E-Mail' },
  'الهاتف': { de: 'Telefon', ar: 'الهاتف', en: 'Telefon' },
  'العنوان': { de: 'Adresse', ar: 'العنوان', en: 'Adresse' },
  
  // Restaurant
  'لوحة المطعم': { de: 'Restaurant-Dashboard', ar: 'لوحة المطعم', en: 'Restaurant-Dashboard' },
  'إدارة القائمة': { de: 'Speisekartenverwaltung', ar: 'إدارة القائمة', en: 'Speisekartenverwaltung' },
  'إضافة منتج': { de: 'Produkt hinzufügen', ar: 'إضافة منتج', en: 'Produkt hinzufügen' },
  'تعديل المنتج': { de: 'Produkt bearbeiten', ar: 'تعديل المنتج', en: 'Produkt bearbeiten' },
  'اسم المنتج': { de: 'Produktname', ar: 'اسم المنتج', en: 'Produktname' },
  'الوصف': { de: 'Beschreibung', ar: 'الوصف', en: 'Beschreibung' },
  'السعر': { de: 'Preis', ar: 'السعر', en: 'Preis' },
  'الفئة': { de: 'Kategorie', ar: 'الفئة', en: 'Kategorie' },
  'متاح': { de: 'Verfügbar', ar: 'متاح', en: 'Verfügbar' },
  'غير متاح': { de: 'Nicht verfügbar', ar: 'غير متاح', en: 'Nicht verfügbar' },
  
  // Driver
  'لوحة السائق': { de: 'Fahrer-Dashboard', ar: 'لوحة السائق', en: 'Fahrer-Dashboard' },
  'متصل': { de: 'Online', ar: 'متصل', en: 'Online' },
  'غير متصل': { de: 'Offline', ar: 'غير متصل', en: 'Offline' },
  'طلبات متاحة': { de: 'Verfügbare Bestellungen', ar: 'طلبات متاحة', en: 'Verfügbare Bestellungen' },
  'أرباحي': { de: 'Mein Verdienst', ar: 'أرباحي', en: 'Mein Verdienst' },
  
  // Admin
  'لوحة الإدارة': { de: 'Admin-Dashboard', ar: 'لوحة الإدارة', en: 'Admin-Dashboard' },
  'إعادة التعيين': { de: 'Zurücksetzen', ar: 'إعادة التعيين', en: 'Zurücksetzen' },
  'إحصائيات': { de: 'Statistiken', ar: 'إحصائيات', en: 'Statistiken' },
  'المستخدمون': { de: 'Benutzer', ar: 'المستخدمون', en: 'Benutzer' },
  'السائقون': { de: 'Fahrer', ar: 'السائقون', en: 'Fahrer' },
  
  // Status
  'بالانتظار': { de: 'Wartend', ar: 'بالانتظار', en: 'Wartend' },
  'تم التأكيد': { de: 'Bestätigt', ar: 'تم التأكيد', en: 'Bestätigt' },
  'قيد التحضير': { de: 'In Vorbereitung', ar: 'قيد التحضير', en: 'In Vorbereitung' },
  'تم التوصيل': { de: 'Geliefert', ar: 'تم التوصيل', en: 'Geliefert' },
  'ملغي': { de: 'Storniert', ar: 'ملغي', en: 'Storniert' },
  
  // Wallet / payment
  'كاش': { de: 'Bargeld', ar: 'كاش', en: 'Bargeld' },
  'بطاقة': { de: 'Karte', ar: 'بطاقة', en: 'Karte' },
  'كوبون': { de: 'Gutschein', ar: 'كوبون', en: 'Gutschein' },
  'كود الكوبون': { de: 'Gutscheincode', ar: 'كود الكوبون', en: 'Gutscheincode' },
  
  // Misc
  'لا يوجد': { de: 'Nicht vorhanden', ar: 'لا يوجد', en: 'Nicht vorhanden' },
  'نشط': { de: 'Aktiv', ar: 'نشط', en: 'Aktiv' },
  'مغلق': { de: 'Geschlossen', ar: 'مغلق', en: 'Geschlossen' },
  'الوقت': { de: 'Zeit', ar: 'الوقت', en: 'Zeit' },
  'المسافة': { de: 'Entfernung', ar: 'المسافة', en: 'Entfernung' },
};

/**
 * Try to auto-translate a hardcoded string based on current locale.
 */
export function autoTranslate(text: string, locale: 'de' | 'ar' | 'en'): string {
  const trimmed = text.trim();
  const entry = TRANSLATIONS_MAP[trimmed];
  if (!entry) return text;
  return entry[locale] || text;
}
