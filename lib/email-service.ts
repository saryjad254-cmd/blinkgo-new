// Email service — uses Resend if RESEND_API_KEY is set
// Falls back to no-op (on-screen code display) otherwise
// In dev mode, logs the OTP to console for testing

import { Resend } from 'resend';

export interface SendOTPEmailOptions {
  to: string;
  code: string;
  name?: string;
  locale?: 'de' | 'ar' | 'en';
  expiresInMinutes?: number;
}

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.EMAIL_FROM || 'BlinkGo <noreply@blinkgo.de>';

// Lazy-init Resend client
let resend: Resend | null = null;
function getResend() {
  if (!RESEND_API_KEY) return null;
  if (!resend) {
    resend = new Resend(RESEND_API_KEY);
  }
  return resend;
}

export function isEmailEnabled(): boolean {
  return !!RESEND_API_KEY;
}

// ─────────────────────────────────────────────────────────────
// HTML email template
// ─────────────────────────────────────────────────────────────

const COPY = {
  de: {
    subject: 'Dein BlinkGo Bestätigungscode',
    preheader: 'Dein 6-stelliger Code',
    greeting: (name?: string) => `Hallo${name ? ' ' + name : ''}!`,
    body: 'Willkommen bei BlinkGo! Verwende den folgenden Code, um deine E-Mail-Adresse zu bestätigen:',
    expires: (min: number) => `Der Code läuft in ${min} Minuten ab.`,
    ignore: 'Falls du diese E-Mail nicht angefordert hast, ignoriere sie einfach.',
    help: 'Brauchst du Hilfe? Antworte auf diese E-Mail.',
    brand: 'BlinkGo Lieferplattform',
  },
  ar: {
    subject: 'رمز التحقق الخاص بك من BlinkGo',
    preheader: 'رمزك المكون من 6 أرقام',
    greeting: (name?: string) => `أهلاً${name ? ' ' + name : ''}!`,
    body: 'مرحباً بك في BlinkGo! استخدم الرمز التالي لتأكيد بريدك الإلكتروني:',
    expires: (min: number) => `ينتهي الرمز خلال ${min} دقيقة.`,
    ignore: 'إذا لم تطلب هذا البريد، يمكنك تجاهله بأمان.',
    help: 'تحتاج مساعدة؟ رد على هذا البريد.',
    brand: 'منصة BlinkGo للتوصيل',
  },
  en: {
    subject: 'Your BlinkGo verification code',
    preheader: 'Your 6-digit code',
    greeting: (name?: string) => `Hello${name ? ' ' + name : ''}!`,
    body: 'Welcome to BlinkGo! Use the following code to verify your email address:',
    expires: (min: number) => `This code expires in ${min} minutes.`,
    ignore: "If you didn't request this email, you can safely ignore it.",
    help: 'Need help? Reply to this email.',
    brand: 'BlinkGo Delivery Platform',
  },
} as const;

function buildOtpEmailHtml({
  code,
  name,
  locale = 'de',
  expiresInMinutes = 15,
}: {
  code: string;
  name?: string;
  locale?: 'de' | 'ar' | 'en';
  expiresInMinutes?: number;
}): string {
  const t = COPY[locale] ?? COPY.de;
  const isRtl = locale === 'ar';

  return `<!DOCTYPE html>
<html lang="${locale}" dir="${isRtl ? 'rtl' : 'ltr'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t.subject}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', 'Helvetica Neue', Arial, sans-serif;
      background: #0a0a0a;
      color: #ffffff;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      max-width: 560px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    .header {
      text-align: center;
      margin-bottom: 32px;
    }
    .logo {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 24px;
    }
    .logo-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: linear-gradient(135deg, #E11D48, #DC2626);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      font-weight: 900;
      color: white;
    }
    .logo-text {
      font-size: 24px;
      font-weight: 900;
      letter-spacing: -0.02em;
    }
    .card {
      background: linear-gradient(135deg, rgba(225, 29, 72, 0.05), rgba(245, 158, 11, 0.05));
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 24px;
      padding: 40px 32px;
      backdrop-filter: blur(12px);
    }
    .greeting {
      font-size: 24px;
      font-weight: 800;
      margin: 0 0 12px;
      color: #ffffff;
    }
    .body {
      font-size: 15px;
      line-height: 1.6;
      color: rgba(255, 255, 255, 0.75);
      margin: 0 0 32px;
    }
    .code-label {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      color: rgba(245, 158, 11, 0.9);
      text-align: center;
      margin-bottom: 16px;
    }
    .code {
      background: linear-gradient(135deg, #1a1a1a, #0f0f0f);
      border: 2px solid rgba(225, 29, 72, 0.4);
      border-radius: 16px;
      padding: 24px;
      font-size: 42px;
      font-weight: 900;
      text-align: center;
      letter-spacing: 0.5em;
      color: #ffffff;
      font-family: 'SF Mono', Monaco, Consolas, 'Courier New', monospace;
      margin-bottom: 24px;
    }
    .expiry {
      text-align: center;
      font-size: 13px;
      color: rgba(255, 255, 255, 0.5);
      margin: 0 0 24px;
    }
    .divider {
      border: 0;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      margin: 24px 0;
    }
    .footer-note {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.4);
      line-height: 1.6;
      text-align: center;
      margin: 8px 0;
    }
    .brand-tag {
      text-align: center;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: rgba(245, 158, 11, 0.7);
      margin-top: 32px;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="logo">
        <div class="logo-icon">B</div>
        <div class="logo-text">BlinkGo</div>
      </div>
    </div>

    <div class="card">
      <h1 class="greeting">${t.greeting(name)}</h1>
      <p class="body">${t.body}</p>

      <div class="code-label">
        ${locale === 'ar' ? 'رمز التحقق' : locale === 'en' ? 'Verification code' : 'Bestätigungscode'}
      </div>
      <div class="code" dir="ltr">${code}</div>

      <p class="expiry">⏱ ${t.expires(expiresInMinutes)}</p>

      <hr class="divider">

      <p class="footer-note">${t.ignore}</p>
      <p class="footer-note">${t.help}</p>

      <div class="brand-tag">${t.brand}</div>
    </div>
  </div>
</body>
</html>`;
}

function buildOtpEmailText({
  code,
  name,
  locale = 'de',
  expiresInMinutes = 15,
}: {
  code: string;
  name?: string;
  locale?: 'de' | 'ar' | 'en';
  expiresInMinutes?: number;
}): string {
  const t = COPY[locale] ?? COPY.de;
  return [
    t.greeting(name),
    '',
    t.body,
    '',
    `Code: ${code}`,
    '',
    t.expires(expiresInMinutes),
    '',
    t.ignore,
    '',
    `— ${t.brand}`,
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────
// Main send function
// ─────────────────────────────────────────────────────────────

export async function sendOTPEmail(opts: SendOTPEmailOptions): Promise<{
  ok: boolean;
  channel: 'resend' | 'console' | 'noop';
  messageId?: string;
  error?: string;
}> {
  const r = getResend();
  const html = buildOtpEmailHtml({
    code: opts.code,
    name: opts.name,
    locale: opts.locale,
    expiresInMinutes: opts.expiresInMinutes,
  });
  const text = buildOtpEmailText({
    code: opts.code,
    name: opts.name,
    locale: opts.locale,
    expiresInMinutes: opts.expiresInMinutes,
  });
  const subject = (COPY[opts.locale ?? 'de'] ?? COPY.de).subject;

  if (!r) {
    // No email service configured — log to console (dev mode)
    return { ok: true, channel: 'console' };
  }

  try {
    const result = await r.emails.send({
      from: FROM_EMAIL,
      to: opts.to,
      subject,
      html,
      text,
    });
    if (result.error) {
      console.error('Resend error:', result.error);
      return { ok: false, channel: 'resend', error: result.error.message ?? 'Send failed' };
    }
    return { ok: true, channel: 'resend', messageId: result.data?.id };
  } catch (e: any) {
    console.error('Email send exception:', e);
    return { ok: false, channel: 'resend', error: e?.message ?? 'Send exception' };
  }
}
