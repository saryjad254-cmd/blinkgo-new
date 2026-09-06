import { escapeEmailHtml, type EmailLocale } from '@/lib/integrations/email/safety';

export const BLINKGO_EMAIL_LOGO_URL = 'https://www.blinkgo.de/brand/blinkgo-email-logo.png' as const;
export const BLINKGO_EMAIL_HOME_URL = 'https://www.blinkgo.de' as const;
export const BLINKGO_EMAIL_SUPPORT_URL = 'https://www.blinkgo.de/help' as const;
export const BLINKGO_EMAIL_PRIVACY_URL = 'https://www.blinkgo.de/legal/datenschutz' as const;
export const BLINKGO_EMAIL_TERMS_URL = 'https://www.blinkgo.de/legal/agb' as const;

type BrandedEmailOptions = {
  locale: EmailLocale;
  preheader: string;
  headline: string;
  paragraphs: string[];
  securityNote: string;
  cta?: { label: string; url: string };
  fallbackLabel?: string;
  code?: { label: string; value: string };
};

function footerLabel(locale: EmailLocale) {
  if (locale === 'ar') return { support: 'الدعم', privacy: 'الخصوصية', terms: 'الشروط' };
  if (locale === 'en') return { support: 'Support', privacy: 'Privacy Policy', terms: 'Terms' };
  return { support: 'Support', privacy: 'Datenschutz', terms: 'AGB' };
}

/**
 * Email-client-safe transactional layout shared by BlinkGo's direct Resend
 * emails. Supabase-hosted templates mirror this markup in supabase/templates.
 */
export function buildBlinkGoBrandedEmail(options: BrandedEmailOptions): string {
  const dir = options.locale === 'ar' ? 'rtl' : 'ltr';
  const labels = footerLabel(options.locale);
  const safePreheader = escapeEmailHtml(options.preheader);
  const safeHeadline = escapeEmailHtml(options.headline);
  const paragraphHtml = options.paragraphs
    .map((paragraph) => `<p style="margin:0 0 16px;color:#d8dadd;font-size:16px;line-height:1.65;">${escapeEmailHtml(paragraph)}</p>`)
    .join('');
  const safeSecurityNote = escapeEmailHtml(options.securityNote);
  const safeCtaUrl = options.cta ? escapeEmailHtml(options.cta.url) : '';
  const ctaHtml = options.cta ? `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 18px;">
      <tr><td align="center" bgcolor="#E10600" style="border-radius:12px;background:#E10600;">
        <a href="${safeCtaUrl}" style="display:block;padding:15px 24px;color:#ffffff;font-size:16px;line-height:20px;font-weight:700;text-align:center;text-decoration:none;border-radius:12px;">${escapeEmailHtml(options.cta.label)}</a>
      </td></tr>
    </table>
    <p style="margin:0 0 8px;color:#8e9399;font-size:12px;line-height:1.5;">${escapeEmailHtml(options.fallbackLabel ?? 'Falls der Button nicht funktioniert, öffne diesen Link:')}</p>
    <p style="margin:0 0 24px;font-size:12px;line-height:1.55;word-break:break-all;"><a href="${safeCtaUrl}" style="color:#FFC107;text-decoration:underline;">${safeCtaUrl}</a></p>` : '';
  const codeHtml = options.code ? `
    <p style="margin:24px 0 8px;color:#FFC107;font-size:12px;line-height:16px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">${escapeEmailHtml(options.code.label)}</p>
    <div dir="ltr" style="margin:0 0 24px;padding:18px 12px;background:#08090B;border:1px solid #34383d;border-radius:12px;color:#ffffff;font-family:Consolas,'Courier New',monospace;font-size:32px;line-height:40px;font-weight:700;letter-spacing:8px;text-align:center;">${escapeEmailHtml(options.code.value)}</div>` : '';

  return `<!doctype html>
<html lang="${options.locale}" dir="${dir}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>${safeHeadline}</title>
</head>
<body style="margin:0;padding:0;background:#08090B;color:#ffffff;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${safePreheader}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#08090B" style="width:100%;background:#08090B;">
    <tr><td align="center" style="padding:32px 12px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#111316" style="width:100%;max-width:600px;background:#111316;border:1px solid #2a2d31;border-radius:18px;overflow:hidden;">
        <tr><td style="height:4px;background:#E10600;font-size:0;line-height:0;">&nbsp;</td><td width="34%" style="height:4px;background:#FFC107;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td colspan="2" style="padding:32px 28px 26px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr><td align="center" style="padding:0 0 28px;">
              <a href="${BLINKGO_EMAIL_HOME_URL}" style="display:inline-block;text-decoration:none;">
                <img src="${BLINKGO_EMAIL_LOGO_URL}" width="220" alt="BlinkGo" style="display:block;width:220px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;">
              </a>
            </td></tr>
          </table>
          <h1 style="margin:0 0 18px;color:#ffffff;font-size:28px;line-height:1.25;font-weight:700;letter-spacing:-.02em;">${safeHeadline}</h1>
          ${paragraphHtml}${codeHtml}${ctaHtml}
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:8px;border-top:1px solid #2a2d31;">
            <tr><td style="padding-top:20px;color:#9ca1a7;font-size:12px;line-height:1.6;">${safeSecurityNote}</td></tr>
          </table>
        </td></tr>
        <tr><td colspan="2" bgcolor="#0C0E10" style="padding:22px 20px;background:#0C0E10;border-top:1px solid #24272b;text-align:center;">
          <p style="margin:0 0 6px;color:#ffffff;font-size:14px;line-height:20px;font-weight:700;">BlinkGo</p>
          <p style="margin:0 0 12px;font-size:12px;line-height:18px;"><a href="${BLINKGO_EMAIL_HOME_URL}" style="color:#FFC107;text-decoration:none;">blinkgo.de</a></p>
          <p style="margin:0;color:#858a91;font-size:12px;line-height:20px;">
            <a href="${BLINKGO_EMAIL_SUPPORT_URL}" style="color:#b8bcc1;text-decoration:underline;">${labels.support}</a>
            <span aria-hidden="true" style="color:#555a60;">&nbsp;&nbsp;•&nbsp;&nbsp;</span>
            <a href="${BLINKGO_EMAIL_PRIVACY_URL}" style="color:#b8bcc1;text-decoration:underline;">${labels.privacy}</a>
            <span aria-hidden="true" style="color:#555a60;">&nbsp;&nbsp;•&nbsp;&nbsp;</span>
            <a href="${BLINKGO_EMAIL_TERMS_URL}" style="color:#b8bcc1;text-decoration:underline;">${labels.terms}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

