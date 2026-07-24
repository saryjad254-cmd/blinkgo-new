// Password Reset Email Service
// ─────────────────────────────
// Branded BlinkGo password reset email via Resend
// Falls back to a no-op (returns ok so the route can complete) if Resend is not configured

import { Resend } from 'resend';

export interface SendPasswordResetEmailOptions {
  to: string;
  name?: string;
  resetLink: string;
  locale?: 'de' | 'ar' | 'en';
  expiresInMinutes?: number;
}

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.EMAIL_FROM || 'BlinkGo <noreply@blinkgo.de>';

let resend: Resend | null = null;
function getResend() {
  if (!RESEND_API_KEY) return null;
  if (!resend) resend = new Resend(RESEND_API_KEY);
  return resend;
}

const COPY: Record<'de' | 'ar' | 'en', {
  subject: string;
  preheader: string;
  title: string;
  greeting: (name?: string) => string;
  body: (link: string, expMin: number) => string;
  cta: string;
  fallback: string;
  ignore: string;
  footer: string;
  rights: string;
}> = {
  de: {
    subject: 'Setze dein BlinkGo Passwort zurück',
    preheader: 'Klicke den Button, um dein Passwort zu ändern',
    title: 'Passwort zurücksetzen',
    greeting: (n) => `Hallo${n ? ' ' + n : ''},`,
    body: (link, expMin) =>
      `Wir haben eine Anfrage zum Zurücksetzen deines BlinkGo-Passworts erhalten. ` +
      `Klicke den Button, um ein neues Passwort zu setzen. Der Link ist ${expMin} Minuten gültig.`,
    cta: 'Passwort jetzt zurücksetzen',
    fallback: 'Falls der Button nicht funktioniert, kopiere diesen Link:',
    ignore: 'Falls du diese Anfrage nicht gestellt hast, ignoriere diese E-Mail — dein Passwort bleibt unverändert.',
    footer: 'Du erhältst diese E-Mail, weil ein Passwort-Reset für dein BlinkGo-Konto angefordert wurde.',
    rights: '© BlinkGo. Alle Rechte vorbehalten.',
  },
  ar: {
    subject: 'إعادة تعيين كلمة مرور BlinkGo',
    preheader: 'اضغط الزر لتغيير كلمة مرورك',
    title: 'إعادة تعيين كلمة المرور',
    greeting: (n) => `مرحباً${n ? ' ' + n : ''}،`,
    body: (link, expMin) =>
      `تلقّينا طلباً لإعادة تعيين كلمة مرور حسابك في BlinkGo. اضغط الزر أدناه لتعيين كلمة مرور جديدة. ` +
      `الرابط صالح لمدة ${expMin} دقيقة.`,
    cta: 'إعادة تعيين كلمة المرور الآن',
    fallback: 'إذا لم يعمل الزر، انسخ هذا الرابط:',
    ignore: 'إذا لم تطلب ذلك، تجاهل هذه الرسالة — كلمة مرورك ستبقى كما هي.',
    footer: 'تم إرسال هذه الرسالة لأنك (أو شخص يتصرف باسمك) طلبت إعادة تعيين كلمة المرور.',
    rights: '© BlinkGo. جميع الحقوق محفوظة.',
  },
  en: {
    subject: 'Reset your BlinkGo password',
    preheader: 'Click the button to set a new password',
    title: 'Reset your password',
    greeting: (n) => `Hi${n ? ' ' + n : ''},`,
    body: (link, expMin) =>
      `We received a request to reset the password for your BlinkGo account. ` +
      `Click the button below to set a new password. This link is valid for ${expMin} minutes.`,
    cta: 'Reset password now',
    fallback: "If the button doesn't work, copy this link:",
    ignore: "If you didn't request this, just ignore this email — your password will stay the same.",
    footer: 'You are receiving this because a password reset was requested for your BlinkGo account.',
    rights: '© BlinkGo. All rights reserved.',
  },
};

function buildHtml(opts: SendPasswordResetEmailOptions): { subject: string; html: string; text: string } {
  const locale = opts.locale || 'de';
  const copy = COPY[locale] || COPY.de;
  const expMin = opts.expiresInMinutes ?? 30;
  const name = opts.name;
  const resetLink = opts.resetLink;

  const html = `<!doctype html>
<html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${copy.subject}</title>
</head>
<body style="margin:0;padding:0;background:#0A0A0A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#FFFFFF;">
<span style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${copy.preheader}</span>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#0A0A0A;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:560px;background:#141414;border:1px solid #2A2A2A;border-radius:24px;overflow:hidden;">
        <tr>
          <td style="height:6px;background:linear-gradient(90deg,#F5B819 0%,#DC2626 50%,#F5B819 100%);"></td>
        </tr>
        <tr>
          <td style="padding:40px 32px 16px 32px;text-align:center;">
            <div style="display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;background:linear-gradient(135deg,#F5B819 0%,#DC2626 100%);border-radius:20px;box-shadow:0 8px 32px rgba(245,184,25,0.25);">
              <span style="font-weight:900;font-size:32px;color:#0A0A0A;font-style:italic;">B</span>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px;text-align:center;">
            <h1 style="margin:0 0 8px 0;font-size:28px;font-weight:800;letter-spacing:-0.5px;color:#FFFFFF;">${copy.title}</h1>
            <p style="margin:0;font-size:15px;color:#9CA3AF;line-height:1.6;">${copy.greeting(name)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 8px 32px;">
            <p style="margin:0;font-size:15px;line-height:1.6;color:#D1D5DB;">${copy.body(resetLink, expMin)}</p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:24px 32px;">
            <a href="${resetLink}" target="_blank" rel="noopener" style="display:inline-block;padding:16px 36px;background:linear-gradient(135deg,#DC2626 0%,#B91C1C 100%);color:#FFFFFF;text-decoration:none;border-radius:14px;font-weight:800;font-size:15px;letter-spacing:0.2px;box-shadow:0 10px 30px -10px rgba(220,38,38,0.6);">${copy.cta}</a>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 24px 32px;">
            <p style="margin:0 0 8px 0;font-size:12px;color:#6B7280;line-height:1.6;">${copy.fallback}</p>
            <p style="margin:0;padding:12px;background:#0A0A0A;border:1px dashed #2A2A2A;border-radius:8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:#9CA3AF;word-break:break-all;">${resetLink}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 32px 32px;border-top:1px solid #2A2A2A;">
            <p style="margin:0;font-size:12px;color:#6B7280;line-height:1.6;">${copy.ignore}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 32px 32px;text-align:center;">
            <p style="margin:0 0 4px 0;font-size:11px;color:#4B5563;">${copy.footer}</p>
            <p style="margin:0;font-size:11px;color:#4B5563;">${copy.rights}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const text = [
    copy.greeting(name),
    '',
    copy.body(resetLink, expMin),
    '',
    copy.cta + ': ' + resetLink,
    '',
    copy.ignore,
  ].join('\n');

  return { subject: copy.subject, html, text };
}

export async function sendPasswordResetEmail(
  opts: SendPasswordResetEmailOptions,
): Promise<{ ok: boolean; messageId?: string; error?: string; devLink?: string }> {
  const built = buildHtml(opts);
  const r = getResend();
  if (!r) {
    // No Resend configured. In dev, log the link so the developer can click it.
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[email] RESEND_API_KEY not set. Dev reset link:', opts.resetLink);
      return { ok: true, devLink: opts.resetLink };
    }
    return { ok: false, error: 'Email service not configured' };
  }
  try {
    const result = await r.emails.send({
      from: FROM_EMAIL,
      to: opts.to,
      subject: built.subject,
      html: built.html,
      text: built.text,
      tags: [{ name: 'type', value: 'password_reset' }],
    });
    if (result.error) {
      return { ok: false, error: result.error.message };
    }
    return { ok: true, messageId: result.data?.id };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'send failed' };
  }
}
