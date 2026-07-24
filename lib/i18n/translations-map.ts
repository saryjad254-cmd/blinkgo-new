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
  'الرئيسية': { de: 'Startseite', ar: 'الرئيسية', en: 'Home' },
  'المطاعم': { de: 'Restaurants', ar: 'المطاعم', en: 'Restaurants' },
  'السلة': { de: 'Warenkorb', ar: 'السلة', en: 'Cart' },
  'طلباتي': { de: 'Meine Bestellungen', ar: 'طلباتي', en: 'My orders' },
  'حسابي': { de: 'Mein Konto', ar: 'حسابي', en: 'My account' },
  'تسجيل الدخول': { de: 'Anmelden', ar: 'تسجيل الدخول', en: 'Log in' },
  'تسجيل الخروج': { de: 'Abmelden', ar: 'تسجيل الخروج', en: 'Log out' },
  'الطلبات': { de: 'Bestellungen', ar: 'الطلبات', en: 'Orders' },
  'الإعدادات': { de: 'Einstellungen', ar: 'الإعدادات', en: 'Settings' },
  'لوحة التحكم': { de: 'Dashboard', ar: 'لوحة التحكم', en: 'Dashboard' },
  
  // Common actions
  'حفظ': { de: 'Speichern', ar: 'حفظ', en: 'Save' },
  'إلغاء': { de: 'Abbrechen', ar: 'إلغاء', en: 'Cancel' },
  'حذف': { de: 'Löschen', ar: 'حذف', en: 'Delete' },
  'تعديل': { de: 'Bearbeiten', ar: 'تعديل', en: 'Edit' },
  'إضافة': { de: 'Hinzufügen', ar: 'إضافة', en: 'Add' },
  'رجوع': { de: 'Zurück', ar: 'رجوع', en: 'Back' },
  'تأكيد': { de: 'Bestätigen', ar: 'تأكيد', en: 'Confirm' },
  'بحث': { de: 'Suchen', ar: 'بحث', en: 'Search' },
  'تطبيق': { de: 'Anwenden', ar: 'تطبيق', en: 'Apply' },
  
  // Cart
  'السلة فارغة': { de: 'Warenkorb ist leer', ar: 'السلة فارغة', en: 'Cart is empty' },
  'المجموع الفرعي': { de: 'Zwischensumme', ar: 'المجموع الفرعي', en: 'Subtotal' },
  'رسوم التوصيل': { de: 'Liefergebühr', ar: 'رسوم التوصيل', en: 'Delivery fee' },
  'الخصم': { de: 'Rabatt', ar: 'الخصم', en: 'Discount' },
  'البقشيش': { de: 'Trinkgeld', ar: 'البقشيش', en: 'Tip' },
  'الإجمالي': { de: 'Gesamt', ar: 'الإجمالي', en: 'Total' },
  'تأكيد الطلب': { de: 'Bestellung aufgeben', ar: 'تأكيد الطلب', en: 'Place order' },
  
  // Common errors
  'غير مصرح': { de: 'Nicht autorisiert', ar: 'غير مصرح', en: 'Not authorized' },
  'حدث خطأ': { de: 'Ein Fehler ist aufgetreten', ar: 'حدث خطأ', en: 'An error occurred' },
  'جاري التحميل': { de: 'Wird geladen', ar: 'جاري التحميل', en: 'Loading' },
  'لا توجد بيانات': { de: 'Keine Daten', ar: 'لا توجد بيانات', en: 'No data' },
  
  // Profile
  'الاسم': { de: 'Name', ar: 'الاسم', en: 'Name' },
  'البريد الإلكتروني': { de: 'E-Mail', ar: 'البريد الإلكتروني', en: 'Email' },
  'الهاتف': { de: 'Telefon', ar: 'الهاتف', en: 'Phone' },
  'العنوان': { de: 'Adresse', ar: 'العنوان', en: 'Address' },
  
  // Restaurant
  'لوحة المطعم': { de: 'Restaurant-Dashboard', ar: 'لوحة المطعم', en: 'Restaurant dashboard' },
  'إدارة القائمة': { de: 'Speisekartenverwaltung', ar: 'إدارة القائمة', en: 'Menu management' },
  'إضافة منتج': { de: 'Produkt hinzufügen', ar: 'إضافة منتج', en: 'Add product' },
  'تعديل المنتج': { de: 'Produkt bearbeiten', ar: 'تعديل المنتج', en: 'Edit product' },
  'اسم المنتج': { de: 'Produktname', ar: 'اسم المنتج', en: 'Product name' },
  'الوصف': { de: 'Beschreibung', ar: 'الوصف', en: 'Description' },
  'السعر': { de: 'Preis', ar: 'السعر', en: 'Price' },
  'الفئة': { de: 'Kategorie', ar: 'الفئة', en: 'Category' },
  'متاح': { de: 'Verfügbar', ar: 'متاح', en: 'Available' },
  'غير متاح': { de: 'Nicht verfügbar', ar: 'غير متاح', en: 'Not available' },
  
  // Driver
  'لوحة السائق': { de: 'Fahrer-Dashboard', ar: 'لوحة السائق', en: 'Driver dashboard' },
  'متصل': { de: 'Online', ar: 'متصل', en: 'Online' },
  'غير متصل': { de: 'Offline', ar: 'غير متصل', en: 'Offline' },
  'طلبات متاحة': { de: 'Verfügbare Bestellungen', ar: 'طلبات متاحة', en: 'Available orders' },
  'أرباحي': { de: 'Mein Verdienst', ar: 'أرباحي', en: 'My earnings' },
  
  // Admin
  'لوحة الإدارة': { de: 'Admin-Dashboard', ar: 'لوحة الإدارة', en: 'Admin dashboard' },
  'إعادة التعيين': { de: 'Zurücksetzen', ar: 'إعادة التعيين', en: 'Reset' },
  'إحصائيات': { de: 'Statistiken', ar: 'إحصائيات', en: 'Statistics' },
  'المستخدمون': { de: 'Benutzer', ar: 'المستخدمون', en: 'Users' },
  'السائقون': { de: 'Fahrer', ar: 'السائقون', en: 'Drivers' },
  
  // Status
  'بالانتظار': { de: 'Wartend', ar: 'بالانتظار', en: 'Pending' },
  'تم التأكيد': { de: 'Bestätigt', ar: 'تم التأكيد', en: 'Confirmed' },
  'قيد التحضير': { de: 'In Vorbereitung', ar: 'قيد التحضير', en: 'Preparing' },
  'تم التوصيل': { de: 'Geliefert', ar: 'تم التوصيل', en: 'Delivered' },
  'ملغي': { de: 'Storniert', ar: 'ملغي', en: 'Cancelled' },
  
  // Wallet / payment
  'كاش': { de: 'Bargeld', ar: 'كاش', en: 'Cash' },
  'بطاقة': { de: 'Karte', ar: 'بطاقة', en: 'Card' },
  'كوبون': { de: 'Gutschein', ar: 'كوبون', en: 'Coupon' },
  'كود الكوبون': { de: 'Gutscheincode', ar: 'كود الكوبون', en: 'Coupon code' },
  
  // Misc
  'لا يوجد': { de: 'Nicht vorhanden', ar: 'لا يوجد', en: 'Not found' },
  'نشط': { de: 'Aktiv', ar: 'نشط', en: 'Active' },
  'مغلق': { de: 'Geschlossen', ar: 'مغلق', en: 'Closed' },
  'الوقت': { de: 'Zeit', ar: 'الوقت', en: 'Time' },
  'المسافة': { de: 'Entfernung', ar: 'المسافة', en: 'Distance' },
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
