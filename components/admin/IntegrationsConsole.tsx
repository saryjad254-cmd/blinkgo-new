'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Activity from 'lucide-react/dist/esm/icons/activity';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import Bell from 'lucide-react/dist/esm/icons/bell';
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2';
import CircleOff from 'lucide-react/dist/esm/icons/circle-off';
import Cloud from 'lucide-react/dist/esm/icons/cloud';
import CreditCard from 'lucide-react/dist/esm/icons/credit-card';
import Database from 'lucide-react/dist/esm/icons/database';
import Edit3 from 'lucide-react/dist/esm/icons/edit-3';
import ExternalLink from 'lucide-react/dist/esm/icons/external-link';
import Link2 from 'lucide-react/dist/esm/icons/link-2';
import LoaderCircle from 'lucide-react/dist/esm/icons/loader-circle';
import Mail from 'lucide-react/dist/esm/icons/mail';
import MessageSquare from 'lucide-react/dist/esm/icons/message-square';
import Play from 'lucide-react/dist/esm/icons/play';
import Plus from 'lucide-react/dist/esm/icons/plus';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import Save from 'lucide-react/dist/esm/icons/save';
import Server from 'lucide-react/dist/esm/icons/server';
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check';
import Trash2 from 'lucide-react/dist/esm/icons/trash-2';
import WebhookIcon from 'lucide-react/dist/esm/icons/webhook';
import X from 'lucide-react/dist/esm/icons/x';
import Zap from 'lucide-react/dist/esm/icons/zap';
import { AdminLayout, type AdminUser } from '@/components/admin/AdminLayout';
import { AutomationRuleDialog, type AutomationRuleRecord } from '@/components/admin/AutomationRuleDialog';
import { EmptyState, KpiTile, PageHeader, PortalCard } from '@/components/portal/PortalPrimitives';
import { cn } from '@/lib/cn';
import { extractErrorMessage } from '@/lib/foundation/error-helper';

type Locale = 'de' | 'ar' | 'en';
type Tab = 'overview' | 'push' | 'services' | 'webhooks' | 'automation';
type JsonObject = Record<string, unknown>;

interface ProviderInfo {
  name: string;
  enabled: boolean;
  status?: string;
}

interface ProviderCategory {
  providers: ProviderInfo[];
  configured: number;
}

interface ReadinessItem {
  id: string;
  label: string;
  category: string;
  status: 'ready' | 'warning' | 'missing';
  required: boolean;
  detail: string;
}

interface IntegrationStatus {
  timestamp: string;
  deployment: {
    ready: boolean;
    score: number;
    mode: string;
    summary: { ready: number; warning: number; missing: number; total: number };
    items: ReadinessItem[];
  };
  categories: {
    payments: ProviderCategory;
    push: ProviderCategory;
    email: ProviderCategory;
    sms: ProviderCategory;
    storage: ProviderCategory;
  };
  webhooks: {
    recent_deliveries: WebhookDelivery[];
    dead_letter_count: number;
  };
}

interface WebhookDelivery {
  id: string;
  webhook_id?: string | null;
  event: string;
  status: 'pending' | 'success' | 'failed' | 'dead_letter';
  attempts: number;
  response_status?: number | null;
  error?: string | null;
  created_at: string;
}

interface Webhook {
  id: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  enabled: boolean;
  description?: string;
  created_at: string;
  updated_at: string;
}

interface WebhookDraft {
  name: string;
  url: string;
  secret: string;
  events: string;
  description: string;
  enabled: boolean;
}

const COPY = {
  de: {
    title: 'Integrationen & Automation', subtitle: 'Supabase, Benachrichtigungen, externe Dienste und Betriebsregeln zentral steuern.',
    refresh: 'Aktualisieren', overview: 'Übersicht', push: 'Benachrichtigungen', services: 'Dienste', webhooks: 'Webhooks', automation: 'Automation',
    loading: 'Integrationen werden geladen…', loadFailed: 'Die Integrationsdaten konnten nicht vollständig geladen werden.', retry: 'Erneut versuchen',
    readiness: 'Deployment-Bereitschaft', ready: 'Bereit', actionRequired: 'Aktion erforderlich', configured: 'Konfiguriert', pending: 'Offen', activeRules: 'Aktive Regeln', webhookCount: 'Webhooks',
    required: 'Erforderlich', optional: 'Optional', provider: 'Anbieter', active: 'Aktiv', inactive: 'Inaktiv',
    supabaseTitle: 'Supabase-first Benachrichtigungen', supabaseText: 'In-App-Nachrichten werden dauerhaft in Supabase gespeichert und per Realtime aktualisiert. Web Push nutzt VAPID. Firebase ist für die BlinkGo-PWA nicht erforderlich.',
    openSupabase: 'Supabase öffnen', noFirebase: 'Kein Firebase erforderlich', serviceProviders: 'Externe Dienste', serviceHint: 'Nur aktivierte Anbieter zählen zur Betriebsbereitschaft.',
    addWebhook: 'Webhook hinzufügen', noWebhooks: 'Noch keine Webhooks', noWebhooksText: 'Verbinde ein externes System mit signierten BlinkGo-Ereignissen.',
    edit: 'Bearbeiten', test: 'Testen', remove: 'Löschen', enable: 'Aktivieren', disable: 'Deaktivieren', saved: 'Webhook gespeichert.', deleted: 'Webhook gelöscht.', testOk: 'Test erfolgreich', testFailed: 'Test fehlgeschlagen',
    confirmDelete: 'Diesen Webhook dauerhaft löschen?', webhookName: 'Name', endpoint: 'HTTPS-Endpunkt', secret: 'Signatur-Secret', secretKeep: 'Leer lassen, um das vorhandene Secret zu behalten', events: 'Ereignisse', eventsHint: 'Kommagetrennt, z. B. order.created, order.completed', description: 'Beschreibung', cancel: 'Abbrechen', save: 'Speichern', saving: 'Speichert…', close: 'Schließen',
    rules: 'Betriebsregeln', rulesHint: 'Jede Änderung wird serverseitig gespeichert und auditiert.', noRules: 'Keine Automationsregeln vorhanden.', addRule: 'Regel erstellen', ruleSaved: 'Automationsregel gespeichert.', ruleDeleted: 'Automationsregel gelöscht.', perHour: 'pro Stunde', cooldown: 'Cooldown', actions: 'Aktionen',
    recent: 'Letzte Webhook-Zustellungen', noDeliveries: 'Noch keine Zustellungen.', attempts: 'Versuche', deadLetters: 'Dead Letter', security: 'Signierte Zustellung', securityText: 'Ziele werden gegen SSRF geprüft; Nutzdaten werden mit HMAC-SHA256 signiert und Secrets nie unmaskiert an den Browser gesendet.',
  },
  ar: {
    title: 'التكاملات والأتمتة', subtitle: 'إدارة Supabase والإشعارات والخدمات الخارجية وقواعد التشغيل من مكان واحد.',
    refresh: 'تحديث', overview: 'نظرة عامة', push: 'الإشعارات', services: 'الخدمات', webhooks: 'Webhooks', automation: 'الأتمتة',
    loading: 'جارٍ تحميل التكاملات…', loadFailed: 'تعذر تحميل بعض بيانات التكاملات.', retry: 'إعادة المحاولة',
    readiness: 'جاهزية النشر', ready: 'جاهز', actionRequired: 'يحتاج إجراء', configured: 'مُهيأ', pending: 'متبقٍ', activeRules: 'قواعد فعالة', webhookCount: 'Webhooks',
    required: 'مطلوب', optional: 'اختياري', provider: 'المزوّد', active: 'فعال', inactive: 'غير فعال',
    supabaseTitle: 'إشعارات مبنية على Supabase', supabaseText: 'تُحفظ إشعارات التطبيق داخل Supabase وتصل لحظيًا عبر Realtime. إشعارات المتصفح تستخدم VAPID ولا يحتاج تطبيق BlinkGo الويب إلى Firebase.',
    openSupabase: 'فتح Supabase', noFirebase: 'لا حاجة إلى Firebase', serviceProviders: 'الخدمات الخارجية', serviceHint: 'لا تدخل في الجاهزية إلا الخدمات التي اخترت تفعيلها.',
    addWebhook: 'إضافة Webhook', noWebhooks: 'لا يوجد Webhooks بعد', noWebhooksText: 'اربط نظامًا خارجيًا بأحداث BlinkGo الموقعة والآمنة.',
    edit: 'تعديل', test: 'اختبار', remove: 'حذف', enable: 'تفعيل', disable: 'تعطيل', saved: 'تم حفظ Webhook.', deleted: 'تم حذف Webhook.', testOk: 'نجح الاختبار', testFailed: 'فشل الاختبار',
    confirmDelete: 'هل تريد حذف Webhook نهائيًا؟', webhookName: 'الاسم', endpoint: 'رابط HTTPS', secret: 'مفتاح التوقيع', secretKeep: 'اتركه فارغًا للاحتفاظ بالمفتاح الحالي', events: 'الأحداث', eventsHint: 'افصل بفاصلة، مثال: order.created, order.completed', description: 'الوصف', cancel: 'إلغاء', save: 'حفظ', saving: 'جارٍ الحفظ…', close: 'إغلاق',
    rules: 'قواعد التشغيل', rulesHint: 'كل تغيير يُحفظ على الخادم ويُسجل في سجل التدقيق.', noRules: 'لا توجد قواعد أتمتة.', addRule: 'إنشاء قاعدة', ruleSaved: 'تم حفظ قاعدة الأتمتة.', ruleDeleted: 'تم حذف قاعدة الأتمتة.', perHour: 'في الساعة', cooldown: 'فترة تهدئة', actions: 'الإجراءات',
    recent: 'آخر عمليات إرسال Webhook', noDeliveries: 'لا توجد عمليات إرسال بعد.', attempts: 'المحاولات', deadLetters: 'الرسائل المتعذرة', security: 'إرسال موقّع وآمن', securityText: 'يتم فحص الروابط لمنع SSRF وتوقيع البيانات بـ HMAC-SHA256 ولا تُرسل المفاتيح كاملة إلى المتصفح.',
  },
  en: {
    title: 'Integrations & Automation', subtitle: 'Control Supabase, notifications, external services and operational rules in one place.',
    refresh: 'Refresh', overview: 'Overview', push: 'Notifications', services: 'Services', webhooks: 'Webhooks', automation: 'Automation',
    loading: 'Loading integrations…', loadFailed: 'Some integration data could not be loaded.', retry: 'Try again',
    readiness: 'Deployment readiness', ready: 'Ready', actionRequired: 'Action required', configured: 'Configured', pending: 'Pending', activeRules: 'Active rules', webhookCount: 'Webhooks',
    required: 'Required', optional: 'Optional', provider: 'Provider', active: 'Active', inactive: 'Inactive',
    supabaseTitle: 'Supabase-first notifications', supabaseText: 'In-app notifications are stored durably in Supabase and update through Realtime. Browser push uses VAPID; BlinkGo’s PWA does not require Firebase.',
    openSupabase: 'Open Supabase', noFirebase: 'No Firebase required', serviceProviders: 'External services', serviceHint: 'Only providers you explicitly enable count toward operational readiness.',
    addWebhook: 'Add webhook', noWebhooks: 'No webhooks yet', noWebhooksText: 'Connect an external system to signed BlinkGo events.',
    edit: 'Edit', test: 'Test', remove: 'Delete', enable: 'Enable', disable: 'Disable', saved: 'Webhook saved.', deleted: 'Webhook deleted.', testOk: 'Test succeeded', testFailed: 'Test failed',
    confirmDelete: 'Permanently delete this webhook?', webhookName: 'Name', endpoint: 'HTTPS endpoint', secret: 'Signing secret', secretKeep: 'Leave blank to keep the current secret', events: 'Events', eventsHint: 'Comma-separated, e.g. order.created, order.completed', description: 'Description', cancel: 'Cancel', save: 'Save', saving: 'Saving…', close: 'Close',
    rules: 'Operational rules', rulesHint: 'Every change is persisted server-side and audited.', noRules: 'No automation rules found.', addRule: 'Create rule', ruleSaved: 'Automation rule saved.', ruleDeleted: 'Automation rule deleted.', perHour: 'per hour', cooldown: 'Cooldown', actions: 'Actions',
    recent: 'Recent webhook deliveries', noDeliveries: 'No deliveries yet.', attempts: 'Attempts', deadLetters: 'Dead letters', security: 'Signed delivery', securityText: 'Destinations are SSRF-checked, payloads are signed with HMAC-SHA256 and secrets are never returned unmasked to the browser.',
  },
} as const;

const PROVIDER_LABELS: Record<string, string> = {
  supabase_realtime: 'Supabase Realtime', web_push_vapid: 'Browser Web Push (VAPID)',
  fcm: 'Firebase Cloud Messaging', apns: 'Apple Push Notifications', stripe: 'Stripe',
  resend: 'Resend', sendgrid: 'SendGrid', twilio: 'Twilio', supabase: 'Supabase Storage',
};

const RULE_TEXT: Record<string, Record<Locale, { name: string; description: string }>> = {
  '68000000-0000-4000-8000-000000000001': {
    de: { name: 'Restaurant bei schwacher SLA pausieren', description: 'Pausiert ein Restaurant, wenn die SLA-Erfüllung dauerhaft unter 50 Prozent fällt.' },
    ar: { name: 'إيقاف المطعم عند انخفاض الأداء', description: 'يوقف المطعم تلقائيًا عندما تنخفض نسبة الالتزام بوقت التجهيز عن 50٪.' },
    en: { name: 'Auto-pause restaurant with low SLA', description: 'Pauses a restaurant when SLA compliance stays below 50 percent.' },
  },
  '68000000-0000-4000-8000-000000000002': {
    de: { name: 'Fahrermangel melden', description: 'Benachrichtigt Administratoren, wenn weniger als zwei Fahrer aktiv sind.' },
    ar: { name: 'تنبيه عند نقص السائقين', description: 'ينبه الإدارة عندما يصبح عدد السائقين النشطين أقل من اثنين.' },
    en: { name: 'Alert on driver shortage', description: 'Notifies administrators when fewer than two drivers are active.' },
  },
  '68000000-0000-4000-8000-000000000003': {
    de: { name: 'Ungewöhnliche Stornowelle erkennen', description: 'Erstellt eine Warnung, wenn die Zahl der Stornierungen plötzlich steigt.' },
    ar: { name: 'اكتشاف الارتفاع غير الطبيعي للإلغاءات', description: 'ينشئ تنبيهًا عندما ترتفع عمليات إلغاء الطلبات خلال وقت قصير.' },
    en: { name: 'Detect unusual cancellation spike', description: 'Creates an alert when cancellation volume spikes.' },
  },
  '68000000-0000-4000-8000-000000000004': {
    de: { name: 'Kritischen Vorfall eskalieren', description: 'Eskaliert fehlgeschlagene Zahlungen mit hohem Bestellwert an den Betrieb.' },
    ar: { name: 'تصعيد الحوادث الحرجة', description: 'يصعّد فشل المدفوعات ذات القيمة العالية إلى فريق التشغيل.' },
    en: { name: 'Critical incident escalation', description: 'Escalates high-value payment failures to operations.' },
  },
  '68000000-0000-4000-8000-000000000005': {
    de: { name: 'Täglicher Betriebsbericht', description: 'Startet den täglichen Bericht über Betrieb und Leistung.' },
    ar: { name: 'تقرير التشغيل اليومي', description: 'يشغّل تقرير العمليات والأداء اليومي تلقائيًا.' },
    en: { name: 'Daily operational report', description: 'Runs the daily operations report workflow.' },
  },
};

const READINESS_TEXT: Record<string, Record<Locale, { label: string; missing: string; warning?: string }>> = {
  supabase_url: { de: { label: 'Supabase URL', missing: 'Gültige Projekt-URL erforderlich' }, ar: { label: 'رابط Supabase', missing: 'أدخل رابط مشروع Supabase الصحيح' }, en: { label: 'Supabase URL', missing: 'A valid project URL is required' } },
  supabase_anon: { de: { label: 'Supabase Public Key', missing: 'Publishable/Anon Key erforderlich' }, ar: { label: 'مفتاح Supabase العام', missing: 'أدخل مفتاح Publishable أو Anon' }, en: { label: 'Supabase public key', missing: 'A publishable/anon key is required' } },
  supabase_service: { de: { label: 'Supabase Service Key', missing: 'Nur serverseitigen Service Key setzen' }, ar: { label: 'مفتاح خدمة Supabase', missing: 'أدخل مفتاح Service Role على الخادم فقط' }, en: { label: 'Supabase service key', missing: 'Set the server-only service-role key' } },
  app_url: { de: { label: 'Öffentliche App-URL', missing: 'Für Produktion ist HTTPS erforderlich' }, ar: { label: 'الرابط العام للتطبيق', missing: 'يتطلب النشر رابط HTTPS عام' }, en: { label: 'Public app URL', missing: 'Production requires a public HTTPS URL' } },
  reset_secret: { de: { label: 'Reset-Token Secret', missing: 'Mindestens 32 zufällige Zeichen erforderlich' }, ar: { label: 'مفتاح استعادة الحساب', missing: 'يلزم 32 محرفًا عشوائيًا على الأقل' }, en: { label: 'Reset-token secret', missing: 'At least 32 random characters are required' } },
  draft_secret: { de: { label: 'Draft-Signatur Secret', missing: 'Mindestens 32 zufällige Zeichen erforderlich' }, ar: { label: 'مفتاح توقيع المسودات', missing: 'يلزم 32 محرفًا عشوائيًا على الأقل' }, en: { label: 'Draft-signing secret', missing: 'At least 32 random characters are required' } },
  delivery_pin_secret: { de: { label: 'Liefer-PIN Secret', missing: 'Mindestens 32 zufällige Zeichen erforderlich' }, ar: { label: 'مفتاح رمز تسليم الطلب', missing: 'يلزم 32 محرفًا عشوائيًا على الأقل' }, en: { label: 'Delivery-PIN secret', missing: 'At least 32 random characters are required' } },
  cron_secret: { de: { label: 'Cron Secret', missing: 'Mindestens 32 zufällige Zeichen erforderlich' }, ar: { label: 'مفتاح المهام المجدولة', missing: 'يلزم 32 محرفًا عشوائيًا على الأقل' }, en: { label: 'Cron secret', missing: 'At least 32 random characters are required' } },
  metrics_secret: { de: { label: 'Monitoring Secret', missing: 'Mindestens 32 zufällige Zeichen erforderlich' }, ar: { label: 'مفتاح المراقبة التشغيلية', missing: 'يلزم 32 محرفًا عشوائيًا على الأقل' }, en: { label: 'Monitoring secret', missing: 'At least 32 random characters are required' } },
  allowed_origins: { de: { label: 'Erlaubte Origins', missing: 'Produktionsdomain vor dem Deployment setzen' }, ar: { label: 'النطاقات المسموحة', missing: 'حدد نطاق الإنتاج قبل النشر' }, en: { label: 'Allowed origins', missing: 'Set the production domain before deployment' } },
  stripe: { de: { label: 'Stripe-Zahlungen', missing: 'Nicht gesetzt – nur Barzahlung/COD verfügbar' }, ar: { label: 'مدفوعات Stripe', missing: 'غير مهيأ؛ الدفع النقدي متاح حاليًا' }, en: { label: 'Stripe payments', missing: 'Not configured; cash on delivery remains available' } },
  maps: {
    de: { label: 'Google Maps', missing: 'Google Maps ist teilweise konfiguriert; Server-Key, Browser-Key und produktive Map-ID vervollständigen', warning: 'Google Maps ist nicht konfiguriert; OpenStreetMap bleibt als Fallback aktiv' },
    ar: { label: 'خرائط Google', missing: 'خرائط Google مهيأة جزئيًا؛ أكمل مفتاح الخادم ومفتاح المتصفح وMap ID الإنتاجي', warning: 'خرائط Google غير مهيأة؛ سيبقى OpenStreetMap بديلًا فعالًا' },
    en: { label: 'Google Maps', missing: 'Google Maps is partially configured; complete the server key, browser key, and production Map ID', warning: 'Google Maps is not configured; OpenStreetMap remains the active fallback' },
  },
  email: { de: { label: 'Transaktions-E-Mails', missing: 'Produktions-E-Mail-Anbieter erforderlich' }, ar: { label: 'رسائل المعاملات', missing: 'يلزم مزود بريد حقيقي قبل النشر' }, en: { label: 'Transactional email', missing: 'A production email provider is required' } },
  web_push: { de: { label: 'Web Push', missing: 'Public Key, Private Key und VAPID Subject erforderlich' }, ar: { label: 'إشعارات المتصفح', missing: 'أدخل مفاتيح VAPID العامة والخاصة وهوية المرسل' }, en: { label: 'Web Push', missing: 'Public/private VAPID keys and a sender subject are required' } },
  legal_review: { de: { label: 'Rechtliche Gesamtprüfung', missing: 'Freigabe durch deutschen IT-/E-Commerce-Rechtsbeistand erforderlich' }, ar: { label: 'المراجعة القانونية الشاملة', missing: 'تلزم موافقة مستشار قانوني ألماني مختص بالتجارة الإلكترونية' }, en: { label: 'Overall legal review', missing: 'Approval by German IT/e-commerce counsel is required' } },
  bfsg_review: { de: { label: 'Barrierefreiheit (BFSG)', missing: 'BFSG/BFSGV-Prüfung für E-Commerce und Zahlung dokumentieren' }, ar: { label: 'إمكانية الوصول (BFSG)', missing: 'وثّق مراجعة الوصول للتجارة الإلكترونية والدفع' }, en: { label: 'Accessibility (BFSG)', missing: 'Document the BFSG/BFSGV review for commerce and payment' } },
  cookie_audit: { de: { label: 'Cookie- und Tracking-Audit', missing: 'TDDDG-§-25-Audit und widerrufbare Einwilligung dokumentieren' }, ar: { label: 'تدقيق الكوكيز والتتبع', missing: 'وثّق موافقات TDDDG القابلة للسحب' }, en: { label: 'Cookie and tracking audit', missing: 'Document TDDDG § 25 consent and withdrawal controls' } },
  trader_verification: { de: { label: 'Partnerverifizierung (DSA)', missing: 'Identität, Register, Zahlungskonto und Selbsterklärung prüfen' }, ar: { label: 'توثيق الشركاء (DSA)', missing: 'تحقق من الهوية والسجل وحساب الدفع والإقرار' }, en: { label: 'Trader verification (DSA)', missing: 'Verify identity, register, payment account, and self-certification' } },
  checkout_review: { de: { label: 'Checkout & Preise', missing: 'BGB § 312j, PAngV und Fernabsatzinformationen prüfen' }, ar: { label: 'الدفع والأسعار', missing: 'راجع زر الدفع والأسعار ومعلومات البيع عن بعد' }, en: { label: 'Checkout and prices', missing: 'Review BGB § 312j, PAngV, and distance-selling information' } },
  privacy_dpia: { de: { label: 'Datenschutz-Folgenabschätzung', missing: 'Standort- und Profildatenverarbeitung nach DSGVO dokumentieren' }, ar: { label: 'تقييم أثر حماية البيانات', missing: 'وثّق معالجة الموقع والملف الشخصي وفق GDPR' }, en: { label: 'Data protection impact assessment', missing: 'Document location and profile processing under GDPR' } },
};

const FIELD_CLASS = 'min-h-11 w-full rounded-xl border border-border bg-ink-800 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-text-muted focus:border-brand-red focus:ring-2 focus:ring-brand-red/20';

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(extractErrorMessage(payload, `HTTP ${response.status}`));
  return payload;
}

export default function IntegrationsConsole({ user, locale = 'de' }: { user: AdminUser; locale?: Locale }) {
  const t = COPY[locale] ?? COPY.de;
  const isAr = locale === 'ar';
  const [tab, setTab] = useState<Tab>('overview');
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [rules, setRules] = useState<AutomationRuleRecord[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busyId, setBusyId] = useState('');
  const [editing, setEditing] = useState<Webhook | null | 'new'>(null);
  const [editingRule, setEditingRule] = useState<AutomationRuleRecord | 'new' | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    const results = await Promise.allSettled([
      requestJson<{ ok: boolean } & IntegrationStatus>('/api/integrations/status'),
      requestJson<{ ok: boolean; rules: AutomationRuleRecord[] }>('/api/automation/rules'),
      requestJson<{ ok: boolean; webhooks: Webhook[] }>('/api/webhooks'),
    ]);
    if (results[0].status === 'fulfilled') setStatus(results[0].value);
    if (results[1].status === 'fulfilled') setRules(results[1].value.rules ?? []);
    if (results[2].status === 'fulfilled') setWebhooks(results[2].value.webhooks ?? []);
    if (results.some((result) => result.status === 'rejected')) setError(t.loadFailed);
    setLoading(false);
  }, [t.loadFailed]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadAll(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAll]);

  const categories = status?.categories;
  const providerCount = categories ? Object.values(categories).reduce((sum, category) => sum + category.providers.length, 0) : 0;
  const configuredCount = categories ? Object.values(categories).reduce((sum, category) => sum + category.configured, 0) : 0;
  const activeRuleCount = rules.filter((rule) => rule.enabled).length;

  async function mutateWebhook(webhook: Webhook, action: 'toggle' | 'test' | 'delete') {
    setBusyId(webhook.id);
    setNotice(null);
    try {
      if (action === 'toggle') {
        await requestJson(`/api/webhooks/${webhook.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !webhook.enabled }),
        });
      } else if (action === 'test') {
        const result = await requestJson<{ success: boolean; error?: string; status_code?: number }>('/api/webhooks/test', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: webhook.id }),
        });
        setTestResults((current) => ({ ...current, [webhook.id]: { success: result.success, message: result.success ? t.testOk : extractErrorMessage(result, t.testFailed) } }));
      } else {
        if (!window.confirm(t.confirmDelete)) return;
        await requestJson(`/api/webhooks/${webhook.id}`, { method: 'DELETE' });
        setNotice({ tone: 'success', text: t.deleted });
      }
      await loadAll();
    } catch (caught) {
      setNotice({ tone: 'error', text: caught instanceof Error ? caught.message : t.loadFailed });
    } finally {
      setBusyId('');
    }
  }

  async function toggleRule(rule: AutomationRuleRecord) {
    if (!rule.id) return;
    setBusyId(rule.id);
    setNotice(null);
    try {
      await requestJson(`/api/automation/rules/${rule.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !rule.enabled }),
      });
      await loadAll();
    } catch (caught) {
      setNotice({ tone: 'error', text: caught instanceof Error ? caught.message : t.loadFailed });
    } finally {
      setBusyId('');
    }
  }

  const tabs: Array<{ id: Tab; label: string; icon: typeof Activity }> = [
    { id: 'overview', label: t.overview, icon: Activity }, { id: 'push', label: t.push, icon: Bell },
    { id: 'services', label: t.services, icon: Cloud }, { id: 'webhooks', label: t.webhooks, icon: WebhookIcon },
    { id: 'automation', label: t.automation, icon: Zap },
  ];

  return <AdminLayout user={user} locale={locale}>
    <main className="space-y-5" dir={isAr ? 'rtl' : 'ltr'}>
      <PageHeader title={t.title} description={t.subtitle} actions={
        <button type="button" onClick={() => void loadAll()} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-extrabold text-text-primary hover:border-brand-red/50 disabled:opacity-50">
          <RefreshCw className={cn('size-4', loading && 'animate-spin')} />{t.refresh}
        </button>
      } />

      {(error || notice) && <div role="status" className={cn('flex items-start gap-2 rounded-xl border p-3 text-sm font-semibold', notice?.tone === 'success' ? 'border-status-success/30 bg-status-success/10 text-status-success' : 'border-status-error/30 bg-status-error/10 text-status-error')}>
        {notice?.tone === 'success' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
        <span className="flex-1">{notice?.text || error}</span>
        {error && <button type="button" onClick={() => void loadAll()} className="underline">{t.retry}</button>}
      </div>}

      <div role="tablist" aria-label={t.title} className="flex gap-1 overflow-x-auto rounded-2xl border border-border bg-surface p-1.5">
        {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" data-testid={`integration-tab-${id}`} aria-selected={tab === id} onClick={() => setTab(id)} className={cn('inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-bold transition', tab === id ? 'bg-brand-red text-white shadow-lg shadow-brand-red/20' : 'text-text-secondary hover:bg-ink-700 hover:text-white')}>
          <Icon className="size-4" />{label}
        </button>)}
      </div>

      {loading && !status ? <PortalCard><div className="flex min-h-60 items-center justify-center gap-3 text-text-secondary"><LoaderCircle className="size-6 animate-spin text-brand-red" />{t.loading}</div></PortalCard> : null}

      {status && tab === 'overview' && <Overview status={status} providerCount={providerCount} configuredCount={configuredCount} activeRuleCount={activeRuleCount} webhookCount={webhooks.length} locale={locale} />}
      {status && tab === 'push' && <PushPanel providers={status.categories.push.providers} locale={locale} />}
      {status && tab === 'services' && <ServicesPanel status={status} locale={locale} />}
      {tab === 'webhooks' && <WebhooksPanel webhooks={webhooks} deliveries={status?.webhooks.recent_deliveries ?? []} deadLetterCount={status?.webhooks.dead_letter_count ?? 0} busyId={busyId} results={testResults} locale={locale} onCreate={() => setEditing('new')} onEdit={setEditing} onAction={(webhook, action) => void mutateWebhook(webhook, action)} />}
      {tab === 'automation' && <AutomationPanel rules={rules} busyId={busyId} locale={locale} onCreate={() => setEditingRule('new')} onEdit={setEditingRule} onToggle={(rule) => void toggleRule(rule)} />}
    </main>

    {editing && <WebhookDialog locale={locale} webhook={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); setNotice({ tone: 'success', text: t.saved }); await loadAll(); }} />}
    {editingRule && <AutomationRuleDialog locale={locale} rule={editingRule === 'new' ? null : editingRule} onClose={() => setEditingRule(null)} onSaved={async () => { setEditingRule(null); setNotice({ tone: 'success', text: t.ruleSaved }); await loadAll(); }} onDeleted={async () => { setEditingRule(null); setNotice({ tone: 'success', text: t.ruleDeleted }); await loadAll(); }} />}
  </AdminLayout>;
}

function Overview({ status, providerCount, configuredCount, activeRuleCount, webhookCount, locale }: { status: IntegrationStatus; providerCount: number; configuredCount: number; activeRuleCount: number; webhookCount: number; locale: Locale }) {
  const t = COPY[locale];
  return <div className="space-y-5">
    <section className={cn('overflow-hidden rounded-3xl border p-5 sm:p-6', status.deployment.ready ? 'border-status-success/30 bg-status-success/5' : 'border-brand-yellow/30 bg-brand-yellow/5')}>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3"><div className={cn('grid size-12 shrink-0 place-items-center rounded-2xl', status.deployment.ready ? 'bg-status-success/15 text-status-success' : 'bg-brand-yellow/15 text-brand-yellow')}><ShieldCheck className="size-6" /></div><div><h2 className="text-xl font-black text-white">{t.readiness}</h2><p className="mt-1 text-sm text-text-secondary">{status.deployment.ready ? t.ready : t.actionRequired} · {status.deployment.mode}</p></div></div>
        <div className="text-start sm:text-end"><strong className={cn('text-4xl font-black', status.deployment.ready ? 'text-status-success' : 'text-brand-yellow')}>{status.deployment.score}%</strong><p className="text-xs font-bold text-text-muted">{status.deployment.summary.ready}/{status.deployment.summary.total} {t.configured}</p></div>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-ink-900/70"><div className={cn('h-full rounded-full', status.deployment.ready ? 'bg-status-success' : 'bg-gradient-to-r from-brand-red to-brand-yellow')} style={{ width: `${status.deployment.score}%` }} /></div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{status.deployment.items.map((item) => <ReadinessCard key={item.id} item={item} locale={locale} />)}</div>
    </section>
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiTile label={t.configured} value={`${configuredCount}/${providerCount}`} icon={<Server className="size-5" />} tone="success" />
      <KpiTile label={t.pending} value={Math.max(0, providerCount - configuredCount)} icon={<CircleOff className="size-5" />} tone="warning" />
      <KpiTile label={t.activeRules} value={activeRuleCount} icon={<Zap className="size-5" />} tone="info" />
      <KpiTile label={t.webhookCount} value={webhookCount} icon={<WebhookIcon className="size-5" />} />
    </section>
    <PortalCard><div className="flex items-start gap-3"><div className="grid size-11 shrink-0 place-items-center rounded-xl bg-status-success/10 text-status-success"><Database className="size-5" /></div><div><h2 className="font-black text-white">{t.supabaseTitle}</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-text-secondary">{t.supabaseText}</p></div></div></PortalCard>
  </div>;
}

function ReadinessCard({ item, locale }: { item: ReadinessItem; locale: Locale }) {
  const t = COPY[locale];
  const ready = item.status === 'ready';
  const localized = READINESS_TEXT[item.id]?.[locale];
  const configured = locale === 'ar' ? 'مُهيأ بأمان' : locale === 'en' ? 'Configured securely' : 'Sicher konfiguriert';
  return <div className="flex min-w-0 items-start gap-2 rounded-xl border border-border/80 bg-surface/70 p-3">
    {ready ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-status-success" /> : <AlertTriangle className={cn('mt-0.5 size-4 shrink-0', item.status === 'missing' ? 'text-status-error' : 'text-brand-yellow')} />}
    <div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><p className="text-sm font-extrabold text-white">{localized?.label ?? item.label}</p><span className="rounded-full bg-ink-700 px-2 py-0.5 text-[10px] font-bold text-text-muted">{item.required ? t.required : t.optional}</span></div><p className="mt-1 text-xs leading-5 text-text-muted">{ready ? configured : item.status === 'warning' ? localized?.warning ?? localized?.missing ?? item.detail : localized?.missing ?? item.detail}</p></div>
  </div>;
}

function PushPanel({ providers, locale }: { providers: ProviderInfo[]; locale: Locale }) {
  const t = COPY[locale];
  return <div className="space-y-4">
    <PortalCard className="relative overflow-hidden border-brand-red/25 bg-gradient-to-br from-brand-red/10 via-surface to-brand-yellow/5">
      <div className="absolute -top-14 end-0 size-40 rounded-full bg-brand-red/10 blur-3xl" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-red text-white"><Bell className="size-6" /></div><div><h2 className="text-xl font-black text-white">{t.supabaseTitle}</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-text-secondary">{t.supabaseText}</p><span className="mt-3 inline-flex items-center gap-1 rounded-full bg-status-success/10 px-3 py-1 text-xs font-extrabold text-status-success"><CheckCircle2 className="size-3.5" />{t.noFirebase}</span></div></div><a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-ink-800 px-4 text-sm font-extrabold text-white hover:border-brand-red/50">{t.openSupabase}<ExternalLink className="size-4" /></a></div>
    </PortalCard>
    <div className="grid gap-3 md:grid-cols-2">{providers.map((provider) => <ProviderCard key={provider.name} provider={provider} locale={locale} icon={provider.name.includes('supabase') ? Database : Bell} />)}</div>
  </div>;
}

function ServicesPanel({ status, locale }: { status: IntegrationStatus; locale: Locale }) {
  const t = COPY[locale];
  const groups: Array<{ key: keyof IntegrationStatus['categories']; title: string; icon: typeof Activity }> = [
    { key: 'payments', title: locale === 'ar' ? 'الدفع' : locale === 'en' ? 'Payments' : 'Zahlungen', icon: CreditCard },
    { key: 'email', title: locale === 'ar' ? 'البريد' : locale === 'en' ? 'Email' : 'E-Mail', icon: Mail },
    { key: 'sms', title: 'SMS', icon: MessageSquare },
    { key: 'storage', title: locale === 'ar' ? 'التخزين' : locale === 'en' ? 'Storage' : 'Speicher', icon: Database },
  ];
  return <div className="space-y-4"><div><h2 className="text-xl font-black text-white">{t.serviceProviders}</h2><p className="mt-1 text-sm text-text-secondary">{t.serviceHint}</p></div><div className="grid gap-4 lg:grid-cols-2">{groups.map(({ key, title, icon: Icon }) => <PortalCard key={key}><div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2"><Icon className="size-5 text-brand-red" /><h3 className="font-black text-white">{title}</h3></div><span className="text-xs font-extrabold text-text-muted">{status.categories[key].configured}/{status.categories[key].providers.length}</span></div><div className="space-y-2">{status.categories[key].providers.length ? status.categories[key].providers.map((provider) => <ProviderRow key={provider.name} provider={provider} locale={locale} />) : <p className="text-sm text-text-muted">—</p>}</div></PortalCard>)}</div></div>;
}

function ProviderCard({ provider, locale, icon: Icon }: { provider: ProviderInfo; locale: Locale; icon: typeof Activity }) {
  const t = COPY[locale];
  return <PortalCard><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><div className={cn('grid size-11 shrink-0 place-items-center rounded-xl', provider.enabled ? 'bg-status-success/10 text-status-success' : 'bg-ink-700 text-text-muted')}><Icon className="size-5" /></div><div className="min-w-0"><h3 className="font-black text-white">{PROVIDER_LABELS[provider.name] ?? provider.name}</h3>{provider.status && <p className="mt-1 text-xs leading-5 text-text-muted">{provider.status}</p>}</div></div><StatusDot enabled={provider.enabled} label={provider.enabled ? t.active : t.inactive} /></div></PortalCard>;
}

function ProviderRow({ provider, locale }: { provider: ProviderInfo; locale: Locale }) {
  const t = COPY[locale];
  return <div className="flex items-center justify-between gap-3 rounded-xl bg-ink-700/40 px-3 py-2.5"><span className="min-w-0 truncate text-sm font-bold text-text-secondary">{PROVIDER_LABELS[provider.name] ?? provider.name}</span><StatusDot enabled={provider.enabled} label={provider.enabled ? t.active : t.inactive} /></div>;
}

function StatusDot({ enabled, label }: { enabled: boolean; label: string }) {
  return <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold', enabled ? 'bg-status-success/10 text-status-success' : 'bg-ink-700 text-text-muted')}><span className={cn('size-1.5 rounded-full', enabled ? 'bg-status-success' : 'bg-text-muted')} />{label}</span>;
}

function WebhooksPanel({ webhooks, deliveries, deadLetterCount, busyId, results, locale, onCreate, onEdit, onAction }: { webhooks: Webhook[]; deliveries: WebhookDelivery[]; deadLetterCount: number; busyId: string; results: Record<string, { success: boolean; message: string }>; locale: Locale; onCreate: () => void; onEdit: (webhook: Webhook) => void; onAction: (webhook: Webhook, action: 'toggle' | 'test' | 'delete') => void }) {
  const t = COPY[locale];
  return <div className="space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-xl font-black text-white">{t.webhooks}</h2><p className="mt-1 text-sm text-text-secondary">{t.securityText}</p></div><button type="button" data-testid="add-webhook" onClick={onCreate} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-red px-5 text-sm font-black text-white hover:bg-brand-red-dark"><Plus className="size-4" />{t.addWebhook}</button></div>
    {webhooks.length === 0 ? <PortalCard><EmptyState icon={<WebhookIcon className="size-7" />} title={t.noWebhooks} description={t.noWebhooksText} action={<button type="button" data-testid="add-webhook-empty" onClick={onCreate} className="min-h-11 rounded-xl bg-brand-red px-5 text-sm font-black text-white">{t.addWebhook}</button>} /></PortalCard> : <div className="grid gap-3 xl:grid-cols-2">{webhooks.map((webhook) => <div key={webhook.id} data-testid={`webhook-card-${webhook.id}`}><PortalCard><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-white">{webhook.name}</h3><StatusDot enabled={webhook.enabled} label={webhook.enabled ? t.active : t.inactive} /></div><p className="mt-1 truncate text-xs text-text-muted" dir="ltr">{webhook.url}</p>{webhook.description && <p className="mt-2 text-sm text-text-secondary">{webhook.description}</p>}</div><Link2 className="size-5 shrink-0 text-brand-red" /></div><div className="mt-3 flex flex-wrap gap-1.5">{webhook.events.map((event) => <span key={event} className="rounded-lg bg-ink-700 px-2 py-1 text-[11px] font-bold text-text-muted" dir="ltr">{event}</span>)}</div>{results[webhook.id] && <p role="status" className={cn('mt-3 text-xs font-bold', results[webhook.id].success ? 'text-status-success' : 'text-status-error')}>{results[webhook.id].message}</p>}<div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"><ActionButton testId={`edit-webhook-${webhook.id}`} icon={Edit3} label={t.edit} onClick={() => onEdit(webhook)} /><ActionButton testId={`test-webhook-${webhook.id}`} icon={Play} label={t.test} busy={busyId === webhook.id} onClick={() => onAction(webhook, 'test')} /><ActionButton testId={`toggle-webhook-${webhook.id}`} icon={webhook.enabled ? CircleOff : CheckCircle2} label={webhook.enabled ? t.disable : t.enable} busy={busyId === webhook.id} onClick={() => onAction(webhook, 'toggle')} /><ActionButton testId={`delete-webhook-${webhook.id}`} icon={Trash2} label={t.remove} danger onClick={() => onAction(webhook, 'delete')} /></div></PortalCard></div>)}</div>}
    <PortalCard>
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-black text-white">{t.recent}</h3><span className={cn('rounded-full px-2.5 py-1 text-[11px] font-extrabold', deadLetterCount ? 'bg-status-error/10 text-status-error' : 'bg-status-success/10 text-status-success')}>{t.deadLetters}: {deadLetterCount}</span></div>
      {deliveries.length === 0 ? <p className="mt-4 text-sm text-text-muted">{t.noDeliveries}</p> : <div className="mt-4 space-y-2">{deliveries.map((delivery) => <div key={delivery.id} data-testid={`webhook-delivery-${delivery.id}`} className="flex min-w-0 flex-col gap-2 rounded-xl bg-ink-700/45 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-extrabold text-white" dir="ltr">{delivery.event}</span><DeliveryStatus status={delivery.status} locale={locale} /></div><p className="mt-1 truncate text-xs text-text-muted">{delivery.error || new Date(delivery.created_at).toLocaleString(locale)}</p></div><div className="flex shrink-0 items-center gap-3 text-xs font-bold text-text-muted"><span>{t.attempts}: {delivery.attempts}</span>{delivery.response_status && <span dir="ltr">HTTP {delivery.response_status}</span>}</div></div>)}</div>}
    </PortalCard>
    <PortalCard><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-status-success" /><div><h3 className="font-black text-white">{t.security}</h3><p className="mt-1 text-sm leading-6 text-text-secondary">{t.securityText}</p></div></div></PortalCard>
  </div>;
}

function DeliveryStatus({ status, locale }: { status: WebhookDelivery['status']; locale: Locale }) {
  const labels: Record<WebhookDelivery['status'], Record<Locale, string>> = {
    pending: { de: 'Wartend', ar: 'قيد الانتظار', en: 'Pending' },
    success: { de: 'Erfolgreich', ar: 'ناجح', en: 'Success' },
    failed: { de: 'Fehlgeschlagen', ar: 'فشل', en: 'Failed' },
    dead_letter: { de: 'Dead Letter', ar: 'متعذر نهائيًا', en: 'Dead letter' },
  };
  return <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-extrabold', status === 'success' ? 'bg-status-success/10 text-status-success' : status === 'pending' ? 'bg-brand-yellow/10 text-brand-yellow' : 'bg-status-error/10 text-status-error')}>{labels[status][locale]}</span>;
}

function ActionButton({ icon: Icon, label, onClick, busy, danger, testId }: { icon: typeof Activity; label: string; onClick: () => void; busy?: boolean; danger?: boolean; testId?: string }) {
  return <button type="button" data-testid={testId} onClick={onClick} disabled={busy} className={cn('inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-extrabold disabled:opacity-50', danger ? 'border-status-error/20 text-status-error hover:bg-status-error/10' : 'border-border text-text-secondary hover:border-brand-red/40 hover:text-white')}>{busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}{label}</button>;
}

function AutomationPanel({ rules, busyId, locale, onCreate, onEdit, onToggle }: { rules: AutomationRuleRecord[]; busyId: string; locale: Locale; onCreate: () => void; onEdit: (rule: AutomationRuleRecord) => void; onToggle: (rule: AutomationRuleRecord) => void }) {
  const t = COPY[locale];
  return <div className="space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-xl font-black text-white">{t.rules}</h2><p className="mt-1 text-sm text-text-secondary">{t.rulesHint}</p></div><button type="button" data-testid="add-automation-rule" onClick={onCreate} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-red px-5 text-sm font-black text-white hover:bg-brand-red-dark"><Plus className="size-4" />{t.addRule}</button></div>
    {rules.length === 0 ? <PortalCard><EmptyState icon={<Zap className="size-7" />} title={t.noRules} /></PortalCard> : <div className="grid gap-3 lg:grid-cols-2">
      {rules.map((rule) => {
        const localized = rule.id ? RULE_TEXT[rule.id]?.[locale] : undefined;
        const name = localized?.name ?? rule.name;
        const description = localized?.description ?? rule.description;
        return <div key={rule.id || rule.name} data-testid={rule.id ? `automation-rule-card-${rule.id}` : undefined}><PortalCard>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-white">{name}</h3><span className="rounded-lg bg-brand-red/10 px-2 py-1 text-[10px] font-black text-brand-red" dir="ltr">{rule.trigger}</span></div>{description && <p className="mt-2 text-sm leading-6 text-text-secondary">{description}</p>}</div>
          <button type="button" role="switch" data-testid={rule.id ? `automation-toggle-${rule.id}` : undefined} aria-checked={rule.enabled} aria-label={`${rule.enabled ? t.disable : t.enable}: ${name}`} disabled={!rule.id || busyId === rule.id} onClick={() => onToggle(rule)} className="grid min-h-11 w-14 shrink-0 place-items-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red disabled:opacity-50"><span className={cn('relative h-7 w-12 rounded-full transition', rule.enabled ? 'bg-status-success' : 'bg-ink-600')}><span className={cn('absolute top-1 size-5 rounded-full bg-white shadow transition-all', rule.enabled ? 'start-6' : 'start-1')} /></span></button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2"><RuleMeta label={t.actions} value={rule.actions.length} /><RuleMeta label={t.perHour} value={rule.max_executions_per_hour ?? '∞'} /><RuleMeta label={t.cooldown} value={rule.cooldown_minutes ? `${rule.cooldown_minutes}m` : '—'} /></div>
        <button type="button" data-testid={rule.id ? `edit-automation-rule-${rule.id}` : undefined} disabled={!rule.id} onClick={() => onEdit(rule)} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border text-xs font-extrabold text-text-secondary hover:border-brand-red/40 hover:text-white disabled:opacity-50"><Edit3 className="size-4" />{t.edit}</button>
      </PortalCard></div>;})}
    </div>}
  </div>;
}

function RuleMeta({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl bg-ink-700/50 p-2.5 text-center"><p className="text-[10px] font-bold text-text-muted">{label}</p><p className="mt-1 text-sm font-black text-white">{value}</p></div>;
}

function WebhookDialog({ webhook, locale, onClose, onSaved }: { webhook: Webhook | null; locale: Locale; onClose: () => void; onSaved: () => Promise<void> }) {
  const t = COPY[locale];
  const [draft, setDraft] = useState<WebhookDraft>({ name: webhook?.name ?? '', url: webhook?.url ?? '', secret: '', events: webhook?.events.join(', ') ?? '*', description: webhook?.description ?? '', enabled: webhook?.enabled ?? true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const listener = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [busy, onClose]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const events = draft.events.split(',').map((item) => item.trim()).filter(Boolean);
      const payload: JsonObject = { name: draft.name, url: draft.url, events, description: draft.description || null, enabled: draft.enabled };
      if (draft.secret) payload.secret = draft.secret;
      await requestJson(webhook ? `/api/webhooks/${webhook.id}` : '/api/webhooks', {
        method: webhook ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      await onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : COPY[locale].loadFailed);
    } finally {
      setBusy(false);
    }
  }

  return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="webhook-dialog-title" className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-3xl border border-border bg-ink-900 p-5 shadow-2xl sm:p-6" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.18em] text-brand-red">BlinkGo</p><h2 id="webhook-dialog-title" className="mt-1 text-xl font-black text-white">{webhook ? t.edit : t.addWebhook}</h2></div><button type="button" onClick={onClose} disabled={busy} aria-label={t.close} className="grid size-11 place-items-center rounded-xl border border-border text-text-secondary hover:text-white"><X className="size-5" /></button></div>
      <form onSubmit={submit} className="mt-5 space-y-4">
        {error && <div role="alert" className="rounded-xl border border-status-error/30 bg-status-error/10 p-3 text-sm font-bold text-status-error">{error}</div>}
        <Field label={t.webhookName}><input data-testid="webhook-name" required minLength={2} maxLength={120} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={FIELD_CLASS} /></Field>
        <Field label={t.endpoint}><input data-testid="webhook-url" required type="url" inputMode="url" dir="ltr" placeholder="https://example.com/webhooks/blinkgo" value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} className={FIELD_CLASS} /></Field>
        <Field label={t.secret} hint={webhook ? t.secretKeep : undefined}><input data-testid="webhook-secret" required={!webhook} minLength={webhook ? undefined : 16} maxLength={256} type="password" autoComplete="new-password" dir="ltr" value={draft.secret} onChange={(event) => setDraft({ ...draft, secret: event.target.value })} className={FIELD_CLASS} /></Field>
        <Field label={t.events} hint={t.eventsHint}><input data-testid="webhook-events" required dir="ltr" value={draft.events} onChange={(event) => setDraft({ ...draft, events: event.target.value })} className={FIELD_CLASS} /></Field>
        <Field label={t.description}><textarea data-testid="webhook-description" rows={3} maxLength={500} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className={`${FIELD_CLASS} resize-y`} /></Field>
        <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border bg-ink-800 px-3"><span className="text-sm font-bold text-text-secondary">{draft.enabled ? t.active : t.inactive}</span><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} className="size-5 accent-brand-red" /></label>
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded-xl border border-border px-5 text-sm font-extrabold text-text-secondary">{t.cancel}</button><button type="submit" data-testid="webhook-save" disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-red px-5 text-sm font-black text-white disabled:opacity-50">{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}{busy ? t.saving : t.save}</button></div>
      </form>
    </div>
  </div>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-extrabold text-text-secondary">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-text-muted">{hint}</span>}</label>;
}
