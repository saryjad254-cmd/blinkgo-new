'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Activity, BarChart3, Bell, Box, CheckCircle2, CreditCard, Home, Map, PackagePlus, Settings, ShoppingBag, Store, Truck, UserPlus, Users, Upload } from 'lucide-react';
import { PortalShell, type NavItem } from '@/components/portal/PortalShell';
import { PageHeader, PortalCard } from '@/components/portal/PortalPrimitives';
import { useI18n, type Locale } from '@/lib/i18n/I18nProvider';
import { extractErrorMessage } from '@/lib/foundation/error-helper';

type OnboardingType = 'driver' | 'restaurant' | 'product';
export type RestaurantOption = { id: string; name: string; is_active?: boolean };
type FormData = Record<string, string | boolean>;

const COPY = {
  de: { overview: 'Übersicht', dashboard: 'Dashboard', controlCenter: 'Control Center', orders: 'Bestellungen', management: 'Management', customers: 'Kunden', drivers: 'Fahrer', restaurants: 'Restaurants', products: 'Produkte', zones: 'Lieferzonen', business: 'Business', finance: 'Finanzen', analytics: 'Analytics', system: 'System', notifications: 'Benachrichtigungen', configuration: 'Konfiguration', title: 'Erstellen & einrichten', subtitle: 'Fahrerkonten, Restaurantpartner und Produkte vollständig aus einer sicheren Admin-Konsole anlegen.', driver: 'Fahrer erstellen', restaurant: 'Restaurant erstellen', product: 'Produkt erstellen', driverHint: 'Erstellt Anmeldung, Benutzerprofil und Fahrerprofil.', restaurantHint: 'Erstellt Betreiber-Anmeldung, Benutzerkonto und verknüpftes Restaurant.', productHint: 'Fügt ein sofort freigegebenes Produkt zum gewählten Restaurant hinzu.', name: 'Name', email: 'E-Mail', phone: 'Telefon', password: 'Temporäres Passwort', passwordHint: 'Mindestens 10 Zeichen; sicher an den Betreiber übermitteln.', vehicle: 'Fahrzeug', plate: 'Kennzeichen', city: 'Stadt', bicycle: 'Fahrrad', ebike: 'E-Bike', scooter: 'Roller', motorcycle: 'Motorrad', car: 'Auto', walking: 'Zu Fuß', ownerName: 'Betreibername', ownerEmail: 'Betreiber-E-Mail', ownerPhone: 'Betreiber-Telefon', category: 'Kategorie', description: 'Beschreibung', address: 'Adresse', deliveryRadius: 'Lieferradius (km)', deliveryFee: 'Liefergebühr (€)', minOrder: 'Mindestbestellwert (€)', commission: 'Provision (%)', restaurantSelect: 'Restaurant auswählen', price: 'Preis (€)', imageUrl: 'Bild-URL (optional)', active: 'Sofort aktivieren', submit: 'Jetzt erstellen', saving: 'Wird eingerichtet…', success: 'Erfolgreich erstellt und verknüpft.', failed: 'Erstellung fehlgeschlagen.', required: 'Bitte alle Pflichtfelder korrekt ausfüllen.', viewDrivers: 'Fahrer anzeigen', viewRestaurants: 'Restaurants anzeigen', viewProducts: 'Produkte anzeigen' },
  ar: { overview: 'نظرة عامة', dashboard: 'لوحة التحكم', controlCenter: 'مركز التحكم', orders: 'الطلبات', management: 'الإدارة', customers: 'الزبائن', drivers: 'السائقون', restaurants: 'المطاعم', products: 'المنتجات', zones: 'مناطق التوصيل', business: 'الأعمال', finance: 'المالية', analytics: 'التحليلات', system: 'النظام', notifications: 'الإشعارات', configuration: 'الإعدادات', title: 'الإنشاء والتجهيز', subtitle: 'أنشئ حسابات السائقين وشركاء المطاعم والمنتجات بالكامل من لوحة إدارة آمنة.', driver: 'إنشاء سائق', restaurant: 'إنشاء مطعم', product: 'إنشاء منتج', driverHint: 'ينشئ تسجيل الدخول وحساب المستخدم وملف السائق.', restaurantHint: 'ينشئ حساب مالك المطعم ويربطه بالمطعم الجديد.', productHint: 'يضيف منتجًا معتمدًا مباشرة إلى المطعم المختار.', name: 'الاسم', email: 'البريد الإلكتروني', phone: 'الهاتف', password: 'كلمة مرور مؤقتة', passwordHint: '10 محارف على الأقل، وأرسلها للمالك بطريقة آمنة.', vehicle: 'المركبة', plate: 'رقم اللوحة', city: 'المدينة', bicycle: 'دراجة هوائية', ebike: 'دراجة كهربائية', scooter: 'سكوتر', motorcycle: 'دراجة نارية', car: 'سيارة', walking: 'سيرًا', ownerName: 'اسم المالك', ownerEmail: 'بريد المالك', ownerPhone: 'هاتف المالك', category: 'التصنيف', description: 'الوصف', address: 'العنوان', deliveryRadius: 'نطاق التوصيل (كم)', deliveryFee: 'رسوم التوصيل (€)', minOrder: 'الحد الأدنى للطلب (€)', commission: 'العمولة (%)', restaurantSelect: 'اختر المطعم', price: 'السعر (€)', imageUrl: 'رابط الصورة (اختياري)', active: 'تفعيل مباشرة', submit: 'إنشاء الآن', saving: 'جارٍ الإنشاء…', success: 'تم الإنشاء والربط بنجاح.', failed: 'تعذر إكمال الإنشاء.', required: 'أكمل الحقول المطلوبة بشكل صحيح.', viewDrivers: 'عرض السائقين', viewRestaurants: 'عرض المطاعم', viewProducts: 'عرض المنتجات' },
  en: { overview: 'Overview', dashboard: 'Dashboard', controlCenter: 'Control Center', orders: 'Orders', management: 'Management', customers: 'Customers', drivers: 'Drivers', restaurants: 'Restaurants', products: 'Products', zones: 'Delivery zones', business: 'Business', finance: 'Finance', analytics: 'Analytics', system: 'System', notifications: 'Notifications', configuration: 'Configuration', title: 'Create & onboard', subtitle: 'Create complete driver accounts, restaurant partners, and products from one secure admin console.', driver: 'Create driver', restaurant: 'Create restaurant', product: 'Create product', driverHint: 'Creates sign-in, user record, and driver profile.', restaurantHint: 'Creates the owner sign-in, user account, and linked restaurant.', productHint: 'Adds an immediately approved product to the selected restaurant.', name: 'Name', email: 'Email', phone: 'Phone', password: 'Temporary password', passwordHint: 'At least 10 characters; share it securely with the operator.', vehicle: 'Vehicle', plate: 'Plate number', city: 'City', bicycle: 'Bicycle', ebike: 'E-bike', scooter: 'Scooter', motorcycle: 'Motorcycle', car: 'Car', walking: 'Walking', ownerName: 'Owner name', ownerEmail: 'Owner email', ownerPhone: 'Owner phone', category: 'Category', description: 'Description', address: 'Address', deliveryRadius: 'Delivery radius (km)', deliveryFee: 'Delivery fee (€)', minOrder: 'Minimum order (€)', commission: 'Commission (%)', restaurantSelect: 'Select restaurant', price: 'Price (€)', imageUrl: 'Image URL (optional)', active: 'Activate immediately', submit: 'Create now', saving: 'Creating…', success: 'Created and linked successfully.', failed: 'Creation failed.', required: 'Complete all required fields correctly.', viewDrivers: 'View drivers', viewRestaurants: 'View restaurants', viewProducts: 'View products' },
} satisfies Record<Locale, Record<string, string>>;

const MERCHANT_COPY = {
  de: {
    section: 'Unternehmens- und Händlerprüfung', intro: 'Das Restaurant bleibt bis zur Prüfung unveröffentlicht. Erforderliche Angaben nach dem Händler-Prüfprozess vollständig erfassen.',
    legalName: 'Vollständiger Firmenname', legalForm: 'Rechtsform', representative: 'Vertretungsberechtigte Person', contactEmail: 'Geschäftliche E-Mail', contactPhone: 'Geschäftliche Telefonnummer',
    street: 'Straße und Hausnummer', postalCode: 'Postleitzahl', city: 'Sitz / Stadt', registerName: 'Handelsregister / Registergericht', registerNumber: 'Registernummer', vatId: 'USt-IdNr. (optional)', taxNumber: 'Steuernummer (optional)',
    identityRef: 'Referenz Identitätsnachweis', businessRef: 'Referenz Gewerbe-/Registerdokument', payoutLast4: 'Letzte 4 Stellen des Auszahlungskontos', selfCertification: 'Der Händler bestätigt, nur unionsrechtskonforme Waren und Dienstleistungen anzubieten.',
    pending: 'Nach dem Erstellen: Status „Prüfung ausstehend“, nicht im Kundenbereich sichtbar.', success: 'Restaurant und Betreiberkonto wurden als unveröffentlichter Prüfungsfall angelegt.',
  },
  en: {
    section: 'Business and trader verification', intro: 'The restaurant stays unpublished until review. Capture all required trader identity and traceability evidence.',
    legalName: 'Full legal business name', legalForm: 'Legal form', representative: 'Authorised representative', contactEmail: 'Business email', contactPhone: 'Business phone',
    street: 'Street and number', postalCode: 'Postal code', city: 'Registered city', registerName: 'Trade register / court', registerNumber: 'Register number', vatId: 'VAT ID (optional)', taxNumber: 'Tax number (optional)',
    identityRef: 'Identity-document reference', businessRef: 'Business/register-document reference', payoutLast4: 'Last 4 digits of payout account', selfCertification: 'The trader certifies that only goods and services compliant with EU law will be offered.',
    pending: 'After creation: pending review and hidden from customers.', success: 'Restaurant and owner account created as an unpublished verification case.',
  },
  ar: {
    section: 'توثيق الشركة والتاجر', intro: 'يبقى المطعم غير منشور حتى تكتمل المراجعة. أدخل بيانات هوية التاجر والتتبع القانونية بالكامل.',
    legalName: 'الاسم القانوني الكامل للشركة', legalForm: 'الشكل القانوني', representative: 'الممثل المفوض', contactEmail: 'البريد التجاري', contactPhone: 'هاتف الشركة',
    street: 'الشارع ورقم البناء', postalCode: 'الرمز البريدي', city: 'مدينة التسجيل', registerName: 'السجل التجاري / محكمة التسجيل', registerNumber: 'رقم السجل', vatId: 'رقم ضريبة القيمة المضافة (اختياري)', taxNumber: 'الرقم الضريبي (اختياري)',
    identityRef: 'مرجع وثيقة إثبات الهوية', businessRef: 'مرجع وثيقة الشركة/السجل', payoutLast4: 'آخر 4 أرقام من حساب التحويل', selfCertification: 'يقرّ التاجر بأنه لن يعرض إلا سلعًا وخدمات متوافقة مع قانون الاتحاد الأوروبي.',
    pending: 'بعد الإنشاء: بانتظار المراجعة وغير ظاهر للزبائن.', success: 'تم إنشاء المطعم وحساب المالك كحالة توثيق غير منشورة.',
  },
} as const;

const INVITE_HINT = {
  de: 'Eine sichere Aktivierungseinladung wird per E-Mail versendet; der Admin sieht kein Passwort.',
  ar: 'ستُرسل دعوة تفعيل آمنة عبر البريد؛ لن يرى الأدمن كلمة مرور المستخدم.',
  en: 'A secure activation invitation is sent by email; the admin never sees the user password.',
} as const;

const INITIAL: Record<OnboardingType, FormData> = {
  driver: { name: '', email: '', phone: '', vehicle_type: 'bicycle', vehicle_plate: '', city: 'Wesseling' },
  restaurant: { name: '', type: 'restaurant', category: '', description: '', address: '', phone: '', owner_name: '', owner_email: '', owner_phone: '', latitude: '', longitude: '', opening_hours_json: '{}', delivery_radius_km: '5', delivery_fee: '2.99', min_order_amount: '10', commission_pct: '15', is_active: false, legal_name: '', legal_form: '', representative_name: '', contact_email: '', contact_phone: '', street_address: '', postal_code: '', legal_city: '', trade_register_name: '', trade_register_number: '', vat_id: '', tax_number: '', identity_document_ref: '', business_document_ref: '', payout_account_last4: '', self_certified: false },
  product: { restaurant_id: '', name: '', category: '', description: '', price: '', image_url: '', is_active: true, is_available: true },
};

export function AdminOnboardingClient({ userName, restaurants, initialType }: { userName: string; restaurants: RestaurantOption[]; initialType: OnboardingType }) {
  const router = useRouter();
  const { locale, setLocale } = useI18n();
  const copy = { ...COPY[locale], passwordHint: INVITE_HINT[locale] };
  const [type, setType] = useState<OnboardingType>(initialType);
  const [forms, setForms] = useState(INITIAL);
  const [busy, setBusy] = useState(false);
  const [productImage, setProductImage] = useState<File | null>(null);
  const [restaurantLogo, setRestaurantLogo] = useState<File | null>(null);
  const [restaurantCover, setRestaurantCover] = useState<File | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const navSections: { title: string; items: NavItem[] }[] = [
    { title: copy.overview, items: [{ href: '/admin/dashboard', label: copy.dashboard, icon: Home, exact: true }, { href: '/admin/control-center', label: copy.controlCenter, icon: Activity }, { href: '/admin/orders', label: copy.orders, icon: ShoppingBag }] },
    { title: copy.management, items: [{ href: '/admin/users', label: copy.customers, icon: Users }, { href: '/admin/drivers', label: copy.drivers, icon: Truck }, { href: '/admin/restaurants', label: copy.restaurants, icon: Store }, { href: '/admin/products', label: copy.products, icon: Box }, { href: '/admin/zones', label: copy.zones, icon: Map }] },
    { title: copy.business, items: [{ href: '/admin/finance', label: copy.finance, icon: CreditCard }, { href: '/admin/analytics', label: copy.analytics, icon: BarChart3 }] },
    { title: copy.system, items: [{ href: '/admin/notifications', label: copy.notifications, icon: Bell }, { href: '/admin/configuration', label: copy.configuration, icon: Settings }] },
  ];
  const form = forms[type];
  const update = (key: string, value: string | boolean) => setForms((current) => ({ ...current, [type]: { ...current[type], [key]: value } }));
  const switchType = (next: OnboardingType) => { setType(next); setNotice(null); window.history.replaceState(null, '', `/admin/onboarding?type=${next}`); };
  const submit = async () => {
    const endpoint = type === 'driver' ? '/api/admin/drivers' : type === 'restaurant' ? '/api/admin/restaurants' : '/api/products/manage';
    const method = 'POST';
    const required = type === 'driver' ? ['name', 'email'] : type === 'restaurant' ? ['name', 'owner_name', 'owner_email', 'legal_name', 'representative_name', 'contact_email', 'contact_phone', 'street_address', 'postal_code', 'legal_city', 'trade_register_name', 'trade_register_number', 'identity_document_ref', 'business_document_ref', 'payout_account_last4'] : ['restaurant_id', 'name', 'price'];
    const invalidMerchant = type === 'restaurant' && (
      form.self_certified !== true
      || !/^\S+@\S+\.\S+$/.test(String(form.owner_email || ''))
      || !/^\S+@\S+\.\S+$/.test(String(form.contact_email || ''))
      || !/^\d{5}$/.test(String(form.postal_code || ''))
      || !/^\d{4}$/.test(String(form.payout_account_last4 || ''))
      || String(form.identity_document_ref || '').trim().length < 6
      || String(form.business_document_ref || '').trim().length < 6
    );
    if (required.some((key) => String(form[key] || '').trim().length < 2) || invalidMerchant) { setNotice({ tone: 'error', text: copy.required }); return; }
    setBusy(true); setNotice(null);
    try {
      let requestBody: Record<string, unknown> = { ...form };
      if (type === 'restaurant') {
        let openingHours: Record<string, unknown>;
        try { const parsed = JSON.parse(String(form.opening_hours_json || '{}')); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(); openingHours = parsed; }
        catch { throw new Error(locale === 'ar' ? 'ساعات العمل ليست JSON صحيحة.' : locale === 'de' ? 'Öffnungszeiten sind kein gültiges JSON.' : 'Opening hours are not valid JSON.'); }
        requestBody = { ...form, opening_hours: openingHours, latitude: form.latitude === '' ? null : Number(form.latitude), longitude: form.longitude === '' ? null : Number(form.longitude) };
        delete requestBody.opening_hours_json;
      }
      const response = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json', 'Accept-Language': locale }, body: JSON.stringify(requestBody) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(extractErrorMessage(result, copy.failed));
      const targetId = type === 'restaurant' ? result.restaurant?.id : type === 'product' ? result.product?.id : null;
      if (targetId) {
        const uploads = type === 'restaurant' ? [[restaurantLogo, 'restaurant_logo'], [restaurantCover, 'restaurant_cover']] as const : [[productImage, 'product_image']] as const;
        for (const [file, kind] of uploads) {
          if (!file) continue;
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error(locale === 'ar' ? 'الصورة يجب أن تكون JPG أو PNG أو WebP وأصغر من 5 ميغابايت.' : locale === 'de' ? 'Das Bild muss JPG, PNG oder WebP und kleiner als 5 MB sein.' : 'The image must be JPG, PNG, or WebP and smaller than 5 MB.');
          const media = new FormData(); media.set('id', targetId); media.set('kind', kind); media.set('file', file);
          const mediaResponse = await fetch('/api/admin/catalog-media', { method: 'POST', body: media });
          const mediaResult = await mediaResponse.json().catch(() => ({}));
          if (!mediaResponse.ok) throw new Error(extractErrorMessage(mediaResult, copy.failed));
        }
      }
      setNotice({ tone: 'success', text: type === 'restaurant' ? MERCHANT_COPY[locale].success : copy.success }); setForms((current) => ({ ...current, [type]: INITIAL[type] })); router.refresh();
      if (type === 'restaurant') { setRestaurantLogo(null); setRestaurantCover(null); } else if (type === 'product') setProductImage(null);
    } catch (error) { setNotice({ tone: 'error', text: error instanceof Error ? error.message : copy.failed }); } finally { setBusy(false); }
  };
  const cards: { key: OnboardingType; icon: typeof Truck; title: string; hint: string }[] = [
    { key: 'driver', icon: Truck, title: copy.driver, hint: copy.driverHint }, { key: 'restaurant', icon: Store, title: copy.restaurant, hint: copy.restaurantHint }, { key: 'product', icon: PackagePlus, title: copy.product, hint: copy.productHint },
  ];
  const viewLink = type === 'driver' ? '/admin/drivers' : type === 'restaurant' ? '/admin/restaurants' : '/admin/products';
  const viewLabel = type === 'driver' ? copy.viewDrivers : type === 'restaurant' ? copy.viewRestaurants : copy.viewProducts;
  const logout = async () => { await fetch('/api/auth/logout', { method: 'POST' }); router.replace('/login'); };

  return <PortalShell brand={{ name: 'BlinkGo Admin', tagline: copy.title, emoji: '👑' }} navSections={navSections} user={{ name: userName, email: userName, role: 'admin' }} locale={locale} onLocaleChange={setLocale} onLogout={logout}>
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6 lg:p-8">
      <PageHeader title={copy.title} description={copy.subtitle} />
      <div className="grid gap-3 md:grid-cols-3">{cards.map(({ key, icon: Icon, title, hint }) => <button type="button" key={key} onClick={() => switchType(key)} className={`min-h-32 rounded-2xl border p-4 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-yellow ${type === key ? 'border-brand-red bg-brand-red/10 shadow-[0_0_30px_rgba(225,6,0,.12)]' : 'border-border bg-surface hover:border-brand-red/50'}`}><span className={`grid size-10 place-items-center rounded-xl ${type === key ? 'bg-brand-red text-white' : 'bg-bg text-text-muted'}`}><Icon className="size-5" /></span><strong className="mt-3 block">{title}</strong><span className="mt-1 block text-xs leading-5 text-text-muted">{hint}</span></button>)}</div>
      {notice && <div role={notice.tone === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm font-bold ${notice.tone === 'success' ? 'border-status-success/30 bg-status-success/10 text-status-success' : 'border-status-error/30 bg-status-error/10 text-status-error'}`}>{notice.text}</div>}
      <PortalCard><div className="mb-5 flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-brand-red to-brand-yellow text-white">{type === 'driver' ? <UserPlus className="size-5" /> : type === 'restaurant' ? <Store className="size-5" /> : <PackagePlus className="size-5" />}</span><div><h2 className="text-lg font-black">{type === 'driver' ? copy.driver : type === 'restaurant' ? copy.restaurant : copy.product}</h2><p className="text-xs text-text-muted">{type === 'driver' ? copy.driverHint : type === 'restaurant' ? copy.restaurantHint : copy.productHint}</p></div></div>{type === 'driver' ? <DriverFields copy={copy} form={form} update={update} /> : type === 'restaurant' ? <RestaurantFields copy={copy} merchantCopy={MERCHANT_COPY[locale]} form={form} update={update} logoFile={restaurantLogo} coverFile={restaurantCover} onLogo={setRestaurantLogo} onCover={setRestaurantCover} /> : <ProductFields copy={copy} form={form} update={update} restaurants={restaurants} imageFile={productImage} onImage={setProductImage} />}<div className="mt-6 flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between"><Link href={viewLink} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-5 text-sm font-bold hover:text-brand-red">{viewLabel}</Link><button type="button" disabled={busy} onClick={submit} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-red px-6 text-sm font-black text-white hover:bg-brand-red-dark disabled:opacity-50">{busy ? copy.saving : copy.submit}<CheckCircle2 className="size-4" /></button></div></PortalCard>
    </div>
  </PortalShell>;
}

function Field({ label, value, onChange, type = 'text', hint, required = false, autoComplete }: { label: string; value: string; onChange: (value: string) => void; type?: string; hint?: string; required?: boolean; autoComplete?: string }) { return <label><span className="mb-1.5 block text-xs font-bold text-text-muted">{label}{required ? ' *' : ''}</span><input type={type} required={required} autoComplete={autoComplete ?? 'off'} value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm outline-none focus:border-brand-red" />{hint && <span className="mt-1 block text-[11px] text-text-muted">{hint}</span>}</label>; }
function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) { return <label><span className="mb-1.5 block text-xs font-bold text-text-muted">{label} *</span><select value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm outline-none focus:border-brand-red">{children}</select></label>; }
function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-5 accent-brand-red" /><span className="text-sm font-bold">{label}</span></label>; }
function DriverFields({ copy, form, update }: FieldsProps) { return <div><div className="mb-4 rounded-xl border border-brand-yellow/30 bg-brand-yellow/10 px-4 py-3 text-sm font-bold text-brand-yellow">{copy.driverHint} {copy.passwordHint}</div><div className="grid gap-4 sm:grid-cols-2"><Field label={copy.name} value={String(form.name)} onChange={(v) => update('name', v)} required /><Field label={copy.email} type="email" autoComplete="off" value={String(form.email)} onChange={(v) => update('email', v)} required /><Field label={copy.phone} type="tel" value={String(form.phone)} onChange={(v) => update('phone', v)} /><SelectField label={copy.vehicle} value={String(form.vehicle_type)} onChange={(v) => update('vehicle_type', v)}>{(['bicycle','ebike','scooter','motorcycle','car','walking'] as const).map((key) => <option key={key} value={key}>{copy[key]}</option>)}</SelectField><Field label={copy.plate} value={String(form.vehicle_plate)} onChange={(v) => update('vehicle_plate', v)} /><Field label={copy.city} value={String(form.city)} onChange={(v) => update('city', v)} /></div></div>; }
function RestaurantFields({ copy, merchantCopy, form, update, logoFile, coverFile, onLogo, onCover }: FieldsProps & { merchantCopy: typeof MERCHANT_COPY[Locale]; logoFile: File | null; coverFile: File | null; onLogo: (file: File | null) => void; onCover: (file: File | null) => void }) {
  return <div className="grid gap-4 sm:grid-cols-2">
    <div className="sm:col-span-2 rounded-xl border border-brand-yellow/30 bg-brand-yellow/10 px-4 py-3 text-sm font-bold text-brand-yellow">{copy.restaurantHint} {copy.passwordHint}</div>
    <Field label={copy.name} value={String(form.name)} onChange={(v) => update('name', v)} required />
    <SelectField label={copy.category} value={String(form.type)} onChange={(v) => update('type', v)}><option value="restaurant">Restaurant</option><option value="market">Market</option><option value="pharmacy">Pharmacy</option><option value="shop">Shop</option></SelectField>
    <Field label={copy.category} value={String(form.category)} onChange={(v) => update('category', v)} />
    <Field label={copy.ownerName} value={String(form.owner_name)} onChange={(v) => update('owner_name', v)} required />
    <Field label={copy.ownerEmail} type="email" autoComplete="off" value={String(form.owner_email)} onChange={(v) => update('owner_email', v)} required />
    <Field label={copy.ownerPhone} type="tel" value={String(form.owner_phone)} onChange={(v) => update('owner_phone', v)} />
    <Field label={copy.phone} type="tel" value={String(form.phone)} onChange={(v) => update('phone', v)} />
    <Field label={copy.address} value={String(form.address)} onChange={(v) => update('address', v)} />
    <Field label="Latitude" type="number" value={String(form.latitude)} onChange={(v) => update('latitude', v)} />
    <Field label="Longitude" type="number" value={String(form.longitude)} onChange={(v) => update('longitude', v)} />
    <Field label={copy.deliveryRadius} type="number" value={String(form.delivery_radius_km)} onChange={(v) => update('delivery_radius_km', v)} />
    <Field label={copy.deliveryFee} type="number" value={String(form.delivery_fee)} onChange={(v) => update('delivery_fee', v)} />
    <Field label={copy.minOrder} type="number" value={String(form.min_order_amount)} onChange={(v) => update('min_order_amount', v)} />
    <Field label={copy.commission} type="number" value={String(form.commission_pct)} onChange={(v) => update('commission_pct', v)} />
    <MediaField label="Logo (JPG/PNG/WebP, max 5 MB)" file={logoFile} onFile={onLogo} />
    <MediaField label="Cover (JPG/PNG/WebP, max 5 MB)" file={coverFile} onFile={onCover} />
    <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-bold text-text-muted">Opening hours JSON</span><textarea rows={5} value={String(form.opening_hours_json)} onChange={(e) => update('opening_hours_json', e.target.value)} className="w-full rounded-xl border border-border bg-bg p-3 font-mono text-xs outline-none focus:border-brand-red" /></label>
    <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-bold text-text-muted">{copy.description}</span><textarea rows={3} value={String(form.description)} onChange={(e) => update('description', e.target.value)} className="w-full rounded-xl border border-border bg-bg p-3 text-sm outline-none focus:border-brand-red" /></label>
    <div id="merchant-verification" className="sm:col-span-2 mt-2 scroll-mt-6 rounded-2xl border border-brand-yellow/30 bg-brand-yellow/5 p-4"><h3 className="font-black text-brand-yellow">{merchantCopy.section}</h3><p className="mt-1 text-xs leading-5 text-text-muted">{merchantCopy.intro}</p><p className="mt-2 text-xs font-bold text-brand-red">{merchantCopy.pending}</p></div>
    <Field label={merchantCopy.legalName} value={String(form.legal_name)} onChange={(v) => update('legal_name', v)} required /><Field label={merchantCopy.legalForm} value={String(form.legal_form)} onChange={(v) => update('legal_form', v)} /><Field label={merchantCopy.representative} value={String(form.representative_name)} onChange={(v) => update('representative_name', v)} required /><Field label={merchantCopy.contactEmail} type="email" value={String(form.contact_email)} onChange={(v) => update('contact_email', v)} required /><Field label={merchantCopy.contactPhone} type="tel" value={String(form.contact_phone)} onChange={(v) => update('contact_phone', v)} required /><Field label={merchantCopy.street} value={String(form.street_address)} onChange={(v) => update('street_address', v)} required /><Field label={merchantCopy.postalCode} value={String(form.postal_code)} onChange={(v) => update('postal_code', v)} required /><Field label={merchantCopy.city} value={String(form.legal_city)} onChange={(v) => update('legal_city', v)} required /><Field label={merchantCopy.registerName} value={String(form.trade_register_name)} onChange={(v) => update('trade_register_name', v)} required /><Field label={merchantCopy.registerNumber} value={String(form.trade_register_number)} onChange={(v) => update('trade_register_number', v)} required /><Field label={merchantCopy.vatId} value={String(form.vat_id)} onChange={(v) => update('vat_id', v)} /><Field label={merchantCopy.taxNumber} value={String(form.tax_number)} onChange={(v) => update('tax_number', v)} /><Field label={merchantCopy.identityRef} value={String(form.identity_document_ref)} onChange={(v) => update('identity_document_ref', v)} required /><Field label={merchantCopy.businessRef} value={String(form.business_document_ref)} onChange={(v) => update('business_document_ref', v)} required /><Field label={merchantCopy.payoutLast4} value={String(form.payout_account_last4)} onChange={(v) => update('payout_account_last4', v)} required /><div className="sm:col-span-2"><CheckField label={merchantCopy.selfCertification} checked={Boolean(form.self_certified)} onChange={(v) => update('self_certified', v)} /></div>
  </div>;
}
function ProductFields({ copy, form, update, restaurants, imageFile, onImage }: FieldsProps & { restaurants: RestaurantOption[]; imageFile: File | null; onImage: (file: File | null) => void }) { return <div className="grid gap-4 sm:grid-cols-2"><SelectField label={copy.restaurantSelect} value={String(form.restaurant_id)} onChange={(v) => update('restaurant_id', v)}><option value="">—</option>{restaurants.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>)}</SelectField><Field label={copy.name} value={String(form.name)} onChange={(v) => update('name', v)} required /><Field label={copy.category} value={String(form.category)} onChange={(v) => update('category', v)} /><Field label={copy.price} type="number" value={String(form.price)} onChange={(v) => update('price', v)} required /><MediaField label="Product image (JPG/PNG/WebP, max 5 MB)" file={imageFile} onFile={onImage} /><label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-bold text-text-muted">{copy.description}</span><textarea rows={3} value={String(form.description)} onChange={(e) => update('description', e.target.value)} className="w-full rounded-xl border border-border bg-bg p-3 text-sm outline-none focus:border-brand-red" /></label><CheckField label={copy.active} checked={Boolean(form.is_active)} onChange={(v) => { update('is_active', v); update('is_available', v); }} /></div>; }
function MediaField({ label, file, onFile }: { label: string; file: File | null; onFile: (file: File | null) => void }) { return <label><span className="mb-1.5 block text-xs font-bold text-text-muted">{label}</span><span className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border bg-bg px-3 text-sm text-text-secondary"><Upload className="size-4" />{file?.name ?? label}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => onFile(event.target.files?.[0] ?? null)} /></span></label>; }
type FieldsProps = { copy: typeof COPY.de; form: FormData; update: (key: string, value: string | boolean) => void };
