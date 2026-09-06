import { getEmailRouter } from '@/lib/integrations/email/router';
import {
  assertEmailAddress,
  assertTrustedEmailUrl,
  emailIdempotencyKey,
  normalizeEmailLocale,
  type EmailLocale,
} from '@/lib/integrations/email/safety';
import { buildBlinkGoBrandedEmail } from '@/lib/integrations/email/branding';

export interface SendPasswordResetEmailOptions {
  to: string;
  name?: string;
  resetLink: string;
  locale?: EmailLocale;
  expiresInMinutes?: number;
}

const COPY = {
  de: { subject: 'BlinkGo Passwort zurücksetzen', hello: 'Hallo', title: 'Passwort zurücksetzen', body: 'Für dein BlinkGo-Konto wurde ein neues Passwort angefordert.', cta: 'Passwort jetzt zurücksetzen', expires: (m: number) => `Dieser Link ist ${m} Minuten gültig.`, ignore: 'Wenn du das nicht warst, ignoriere diese E-Mail. Dein Passwort bleibt unverändert.' },
  ar: { subject: 'إعادة تعيين كلمة مرور BlinkGo', hello: 'مرحباً', title: 'إعادة تعيين كلمة المرور', body: 'تم طلب كلمة مرور جديدة لحسابك في BlinkGo.', cta: 'إعادة تعيين كلمة المرور الآن', expires: (m: number) => `هذا الرابط صالح لمدة ${m} دقيقة.`, ignore: 'إذا لم تطلب ذلك، تجاهل هذه الرسالة. ستبقى كلمة مرورك دون تغيير.' },
  en: { subject: 'Reset your BlinkGo password', hello: 'Hello', title: 'Reset your password', body: 'A new password was requested for your BlinkGo account.', cta: 'Reset password now', expires: (m: number) => `This link is valid for ${m} minutes.`, ignore: "If you didn't request this, ignore this email. Your password will stay unchanged." },
} as const;

function buildPasswordResetEmail(opts: SendPasswordResetEmailOptions) {
  const locale = normalizeEmailLocale(opts.locale);
  const copy = COPY[locale];
  const minutes = Math.min(120, Math.max(1, Math.floor(opts.expiresInMinutes ?? 30)));
  const link = assertTrustedEmailUrl(opts.resetLink);
  const name = opts.name?.trim() || '';
  const greeting = `${copy.hello}${name ? ` ${name}` : ''}`;
  const html = buildBlinkGoBrandedEmail({
    locale,
    preheader: copy.body,
    headline: copy.title,
    paragraphs: [greeting, `${copy.body} ${copy.expires(minutes)}`],
    cta: { label: copy.cta, url: link },
    securityNote: copy.ignore,
  });
  const text = `${copy.hello}${opts.name?.trim() ? ` ${opts.name.trim()}` : ''}\n\n${copy.body} ${copy.expires(minutes)}\n\n${copy.cta}: ${link}\n\n${copy.ignore}`;
  return { locale, copy, link, html, text };
}

export async function sendPasswordResetEmail(opts: SendPasswordResetEmailOptions): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const to = assertEmailAddress(opts.to);
  const built = buildPasswordResetEmail(opts);
  try {
    const result = await getEmailRouter().send({
      from: process.env.EMAIL_FROM || 'BlinkGo <auth@blinkgo.de>',
      reply_to: process.env.COMPANY_SUPPORT_EMAIL || undefined,
      to,
      subject: built.copy.subject,
      html: built.html,
      text: built.text,
      tags: { type: 'password_reset', locale: built.locale },
      idempotency_key: emailIdempotencyKey('password-reset', built.link),
    });
    return { ok: result.success, messageId: result.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Email send failed' };
  }
}

export const __emailTesting = { buildPasswordResetEmail };
