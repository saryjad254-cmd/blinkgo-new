import { getEmailRouter } from '@/lib/integrations/email/router';
import {
  assertEmailAddress,
  emailIdempotencyKey,
  normalizeEmailLocale,
  type EmailLocale,
} from '@/lib/integrations/email/safety';
import { buildBlinkGoBrandedEmail } from '@/lib/integrations/email/branding';

export interface SendOTPEmailOptions {
  to: string;
  code: string;
  name?: string;
  locale?: EmailLocale;
  expiresInMinutes?: number;
}

const COPY = {
  de: {
    subject: 'Dein BlinkGo Bestätigungscode', greeting: 'Hallo',
    body: 'Verwende diesen Code, um deine E-Mail-Adresse zu bestätigen.',
    expires: (minutes: number) => `Der Code läuft in ${minutes} Minuten ab.`,
    ignore: 'Falls du diesen Code nicht angefordert hast, kannst du diese E-Mail ignorieren.',
    label: 'Bestätigungscode',
  },
  ar: {
    subject: 'رمز التحقق الخاص بك من BlinkGo', greeting: 'مرحباً',
    body: 'استخدم هذا الرمز لتأكيد عنوان بريدك الإلكتروني.',
    expires: (minutes: number) => `تنتهي صلاحية الرمز خلال ${minutes} دقيقة.`,
    ignore: 'إذا لم تطلب هذا الرمز، يمكنك تجاهل هذه الرسالة بأمان.',
    label: 'رمز التحقق',
  },
  en: {
    subject: 'Your BlinkGo verification code', greeting: 'Hello',
    body: 'Use this code to verify your email address.',
    expires: (minutes: number) => `This code expires in ${minutes} minutes.`,
    ignore: "If you didn't request this code, you can safely ignore this email.",
    label: 'Verification code',
  },
} as const;

function buildOtpEmail(opts: SendOTPEmailOptions) {
  const locale = normalizeEmailLocale(opts.locale);
  const copy = COPY[locale];
  const minutes = Math.min(60, Math.max(1, Math.floor(opts.expiresInMinutes ?? 15)));
  if (!/^\d{6}$/.test(opts.code)) throw new Error('Invalid verification code');
  const name = opts.name?.trim();
  const greeting = `${copy.greeting}${name ? ` ${name}` : ''}`;
  const html = buildBlinkGoBrandedEmail({
    locale,
    preheader: `${copy.label}: ${opts.code}`,
    headline: greeting,
    paragraphs: [copy.body, copy.expires(minutes)],
    code: { label: copy.label, value: opts.code },
    securityNote: copy.ignore,
  });
  const plainName = name ? ` ${name}` : '';
  const text = `${copy.greeting}${plainName}\n\n${copy.body}\n\n${copy.label}: ${opts.code}\n\n${copy.expires(minutes)}\n\n${copy.ignore}`;
  return { locale, copy, html, text };
}

export function isEmailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY || (process.env.RESEND_ENABLED === 'true' && process.env.RESEND_SECRET_KEY));
}

export async function sendOTPEmail(opts: SendOTPEmailOptions): Promise<{
  ok: boolean;
  channel: 'resend' | 'sendgrid' | 'unconfigured';
  messageId?: string;
  error?: string;
}> {
  const to = assertEmailAddress(opts.to);
  const built = buildOtpEmail(opts);
  if (!isEmailEnabled() && !process.env.SENDGRID_SECRET_KEY) {
    return { ok: false, channel: 'unconfigured', error: 'Email service not configured' };
  }
  try {
    const result = await getEmailRouter().send({
      from: process.env.EMAIL_FROM || 'BlinkGo <auth@blinkgo.de>',
      reply_to: process.env.COMPANY_SUPPORT_EMAIL || undefined,
      to,
      subject: built.copy.subject,
      html: built.html,
      text: built.text,
      tags: { type: 'email_verification', locale: built.locale },
      idempotency_key: emailIdempotencyKey('email-verification', `${to}:${opts.code}`),
    });
    return { ok: result.success, channel: result.provider, messageId: result.id };
  } catch (error) {
    return { ok: false, channel: 'resend', error: error instanceof Error ? error.message : 'Email send failed' };
  }
}

export const __emailTesting = { buildOtpEmail };
