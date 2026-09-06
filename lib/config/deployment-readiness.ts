export type ReadinessStatus = 'ready' | 'warning' | 'missing';

export interface ReadinessItem {
  id: string;
  label: string;
  category: 'core' | 'security' | 'payments' | 'maps' | 'email' | 'push' | 'legal';
  status: ReadinessStatus;
  required: boolean;
  detail: string;
}

export interface DeploymentReadiness {
  ready: boolean;
  score: number;
  mode: 'development' | 'test' | 'production';
  summary: { ready: number; warning: number; missing: number; total: number };
  items: ReadinessItem[];
}

function value(name: string): string {
  return String(process.env[name] ?? '').trim();
}

function isPlaceholder(input: string): boolean {
  const normalized = input.toLowerCase();
  return !input || ['placeholder', 'replace_me', 'xxxxxxxx', 'your-project', 'your-domain'].some((part) => normalized.includes(part));
}

function isUrl(input: string): boolean {
  try {
    const parsed = new URL(input);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function isProductionHttpsUrl(input: string): boolean {
  try {
    const parsed = new URL(input);
    return parsed.protocol === 'https:'
      && !['localhost', '127.0.0.1', '::1'].includes(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function isBlinkGoUrl(input: string): boolean {
  try {
    const parsed = new URL(input);
    return parsed.protocol === 'https:'
      && ['blinkgo.de', 'www.blinkgo.de'].includes(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function productionOriginsReady(input: string): boolean {
  if (!input || input.includes('*')) return false;
  const origins = input.split(',').map((origin) => origin.trim()).filter(Boolean);
  return origins.length > 0 && origins.every((origin) => {
    try {
      const parsed = new URL(origin);
      return parsed.origin === origin.replace(/\/$/, '') && isBlinkGoUrl(parsed.origin);
    } catch {
      return false;
    }
  });
}

function secretReady(name: string, minLength = 32): boolean {
  const current = value(name);
  return !isPlaceholder(current) && current.length >= minLength;
}

export function getDeploymentReadiness(): DeploymentReadiness {
  const mode = (process.env.NODE_ENV ?? 'development') as DeploymentReadiness['mode'];
  const production = mode === 'production';
  const items: ReadinessItem[] = [];

  const add = (item: ReadinessItem) => items.push(item);
  const coreValue = (id: string, label: string, name: string, validator: (input: string) => boolean, detail: string) => {
    const configured = validator(value(name));
    add({ id, label, category: 'core', status: configured ? 'ready' : 'missing', required: true, detail: configured ? 'Konfiguriert' : detail });
  };

  coreValue(
    'supabase_url',
    'Supabase URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    (input) => (production ? isProductionHttpsUrl(input) : isUrl(input)) && !isPlaceholder(input),
    'Gültige HTTPS-Projekt-URL erforderlich',
  );
  const keyReady = (input: string) => input.length >= (production ? 20 : 8) && !isPlaceholder(input);
  coreValue('supabase_anon', 'Supabase Public Key', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', keyReady, 'Publishable/Anon Key erforderlich');
  coreValue('supabase_service', 'Supabase Service Key', 'SUPABASE_SERVICE_ROLE_KEY', keyReady, 'Nur serverseitigen Service Key setzen');

  const appUrl = value('NEXT_PUBLIC_APP_URL') || value('APP_URL');
  const appUrlReady = production ? isBlinkGoUrl(appUrl) : isUrl(appUrl);
  add({
    id: 'app_url', label: 'Öffentliche App-URL', category: 'core',
    status: appUrlReady ? 'ready' : production ? 'missing' : 'warning', required: production,
    detail: appUrlReady ? 'Konfiguriert' : production ? 'Für Produktion ist HTTPS erforderlich' : 'Im lokalen Betrieb wird localhost verwendet',
  });

  for (const [id, label, name] of [
    ['reset_secret', 'Reset-Token Secret', 'RESET_TOKEN_SECRET'],
    ['draft_secret', 'Draft-Signatur Secret', 'DRAFT_SIGNING_SECRET'],
    ['delivery_pin_secret', 'Liefer-PIN Secret', 'DELIVERY_PIN_SECRET'],
    ['cron_secret', 'Cron Secret', 'CRON_SECRET'],
    ['metrics_secret', 'Monitoring Secret', 'METRICS_TOKEN'],
  ] as const) {
    const configured = secretReady(name);
    add({
      id, label, category: 'security', required: production,
      status: configured ? 'ready' : production ? 'missing' : 'warning',
      detail: configured ? 'Sicher konfiguriert' : production ? 'Mindestens 32 zufällige Zeichen erforderlich' : 'Vor dem Deployment ersetzen',
    });
  }

  const origins = value('ALLOWED_ORIGINS');
  const originsReady = production ? productionOriginsReady(origins) : Boolean(origins);
  add({
    id: 'allowed_origins', label: 'Erlaubte Origins', category: 'security', required: production,
    status: originsReady ? 'ready' : production ? 'missing' : 'warning',
    detail: originsReady ? 'Explizit auf BlinkGo HTTPS eingeschränkt' : 'Nur https://blinkgo.de und https://www.blinkgo.de zulassen',
  });

  const stripeSecret = value('STRIPE_SECRET_KEY');
  const stripePublic = value('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY');
  const stripeWebhook = value('STRIPE_WEBHOOK_SECRET');
  const stripeAny = Boolean(stripeSecret || stripePublic || stripeWebhook);
  const stripeComplete = (production ? stripeSecret.startsWith('sk_live_') : stripeSecret.startsWith('sk_'))
    && (production ? stripePublic.startsWith('pk_live_') : stripePublic.startsWith('pk_'))
    && stripeWebhook.startsWith('whsec_')
    && ![stripeSecret, stripePublic, stripeWebhook].some(isPlaceholder);
  add({
    id: 'stripe', label: 'Stripe-Zahlungen', category: 'payments', required: production,
    status: stripeComplete ? 'ready' : production || stripeAny ? 'missing' : 'warning',
    detail: stripeComplete ? 'Live API, Client und Webhook konfiguriert' : production ? 'Live Secret, Publishable Key und Webhook Secret erforderlich' : stripeAny ? 'Stripe-Konfiguration ist unvollständig' : 'Im lokalen Betrieb optional',
  });

  const mapsServer = value('GOOGLE_MAPS_API_KEY');
  const mapsPublic = value('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY');
  const mapsMapId = value('NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID');
  const mapsComplete = Boolean(
    mapsServer && mapsPublic && mapsMapId && mapsServer !== mapsPublic
    && !isPlaceholder(mapsServer) && !isPlaceholder(mapsPublic)
    && !isPlaceholder(mapsMapId) && mapsMapId !== 'DEMO_MAP_ID',
  );
  add({
    id: 'maps', label: 'Google Maps', category: 'maps', required: production,
    status: mapsComplete ? 'ready' : production || mapsServer || mapsPublic || mapsMapId ? 'missing' : 'warning',
    detail: mapsComplete ? 'Getrennte Server-/Browser-Keys und Map-ID konfiguriert' : production ? 'Getrennte eingeschränkte Server-/Browser-Keys und produktive Map-ID erforderlich' : 'OpenStreetMap-Fallback bleibt aktiv',
  });

  const resend = value('RESEND_API_KEY');
  const resendWebhook = value('RESEND_WEBHOOK_SECRET');
  const emailFrom = value('EMAIL_FROM');
  const resendReady = resend.startsWith('re_') && !isPlaceholder(resend)
    && resendWebhook.startsWith('whsec_') && !isPlaceholder(resendWebhook)
    && /@(?:[a-z0-9-]+\.)*blinkgo\.de>?$/i.test(emailFrom);
  add({
    id: 'email', label: 'Transaktions-E-Mails', category: 'email', required: production,
    status: resendReady ? 'ready' : production ? 'missing' : 'warning',
    detail: resendReady ? 'Resend, BlinkGo-Absender und Delivery-Webhook konfiguriert' : production ? 'Resend API-Key, auth@blinkgo.de und Delivery-Webhook erforderlich' : 'Ohne Anbieter werden keine echten E-Mails versendet',
  });

  const vapidPublic = value('NEXT_PUBLIC_VAPID_PUBLIC_KEY');
  const vapidPrivate = value('VAPID_PRIVATE_KEY');
  const vapidSubject = value('VAPID_SUBJECT');
  const pushReady = vapidPublic.length >= 40
    && vapidPrivate.length >= 20
    && (vapidSubject.startsWith('mailto:') || vapidSubject.startsWith('https://'))
    && ![vapidPublic, vapidPrivate, vapidSubject].some(isPlaceholder);
  add({
    id: 'web_push', label: 'Web Push', category: 'push', required: production,
    status: pushReady ? 'ready' : production ? 'missing' : 'warning',
    detail: pushReady ? 'VAPID-Sender vollständig konfiguriert' : production ? 'Public Key, Private Key und VAPID Subject erforderlich' : 'Push bleibt deaktiviert, bis echte VAPID-Werte gesetzt sind',
  });

  const legalApproval = (id: string, label: string, name: string, detail: string) => {
    const approved = value(name) === 'APPROVED';
    add({
      id, label, category: 'legal', required: true,
      status: approved ? 'ready' : 'missing',
      detail: approved ? 'Prüfung dokumentiert und freigegeben' : detail,
    });
  };
  legalApproval('legal_review', 'Rechtliche Gesamtprüfung', 'LEGAL_REVIEW_STATUS', 'Freigabe durch deutschen IT-/E-Commerce-Rechtsbeistand erforderlich');
  legalApproval('bfsg_review', 'Barrierefreiheit (BFSG)', 'ACCESSIBILITY_REVIEW_STATUS', 'BFSG/BFSGV-Prüfung für E-Commerce und Zahlungsfluss dokumentieren');
  legalApproval('cookie_audit', 'Cookie- und Tracking-Audit', 'COOKIE_CONSENT_AUDIT_STATUS', 'TDDDG-§-25-Audit und widerrufbare Einwilligung dokumentieren');
  legalApproval('trader_verification', 'Partnerverifizierung (DSA)', 'TRADER_VERIFICATION_STATUS', 'Identität, Kontakt, Register und Selbsterklärung der Händler prüfen');
  legalApproval('checkout_review', 'Checkout & Preise', 'CHECKOUT_LEGAL_REVIEW_STATUS', 'BGB § 312j, PAngV und Fernabsatzinformationen prüfen');
  legalApproval('privacy_dpia', 'Datenschutz-Folgenabschätzung', 'PRIVACY_DPIA_STATUS', 'DSGVO-Prüfung der laufenden Standort- und Profildatenverarbeitung dokumentieren');

  const summary = {
    ready: items.filter((item) => item.status === 'ready').length,
    warning: items.filter((item) => item.status === 'warning').length,
    missing: items.filter((item) => item.status === 'missing').length,
    total: items.length,
  };
  const requiredItems = items.filter((item) => item.required);
  const readyItems = items.filter((item) => item.status === 'ready').length;

  return {
    ready: requiredItems.every((item) => item.status === 'ready'),
    score: items.length ? Math.round((readyItems / items.length) * 100) : 100,
    mode,
    summary,
    items,
  };
}
