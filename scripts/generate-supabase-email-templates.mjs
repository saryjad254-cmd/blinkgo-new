import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outputDir = path.join(root, 'supabase', 'templates');
const logoUrl = 'https://www.blinkgo.de/brand/blinkgo-email-logo.png';
const homeUrl = 'https://www.blinkgo.de';
const supportUrl = 'https://www.blinkgo.de/help';
const privacyUrl = 'https://www.blinkgo.de/legal/datenschutz';
const termsUrl = 'https://www.blinkgo.de/legal/agb';

function template({ title, preheader, headline, bodyHtml, ctaLabel, href, fallbackLabel, securityNote, codeHtml = '' }) {
  return `<!doctype html>
<html lang="de" dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#08090B;color:#ffffff;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#08090B" style="width:100%;background:#08090B;">
    <tr><td align="center" style="padding:32px 12px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#111316" style="width:100%;max-width:600px;background:#111316;border:1px solid #2a2d31;border-radius:18px;overflow:hidden;">
        <tr><td style="height:4px;background:#E10600;font-size:0;line-height:0;">&nbsp;</td><td width="34%" style="height:4px;background:#FFC107;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td colspan="2" style="padding:32px 28px 26px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr><td align="center" style="padding:0 0 28px;">
              <a href="${homeUrl}" style="display:inline-block;text-decoration:none;">
                <img src="${logoUrl}" width="220" alt="BlinkGo" style="display:block;width:220px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;">
              </a>
            </td></tr>
          </table>
          <h1 style="margin:0 0 18px;color:#ffffff;font-size:28px;line-height:1.25;font-weight:700;letter-spacing:-.02em;">${headline}</h1>
          ${bodyHtml}
          ${codeHtml}
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 18px;">
            <tr><td align="center" bgcolor="#E10600" style="border-radius:12px;background:#E10600;">
              <a href="${href}" style="display:block;padding:15px 24px;color:#ffffff;font-size:16px;line-height:20px;font-weight:700;text-align:center;text-decoration:none;border-radius:12px;">${ctaLabel}</a>
            </td></tr>
          </table>
          <p style="margin:0 0 8px;color:#8e9399;font-size:12px;line-height:1.5;">Falls der Button nicht funktioniert:</p>
          <p style="margin:0 0 24px;font-size:12px;line-height:1.55;word-break:break-word;"><a href="${href}" style="color:#FFC107;text-decoration:underline;">${fallbackLabel}</a></p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:8px;border-top:1px solid #2a2d31;">
            <tr><td style="padding-top:20px;color:#9ca1a7;font-size:12px;line-height:1.6;">${securityNote}</td></tr>
          </table>
        </td></tr>
        <tr><td colspan="2" bgcolor="#0C0E10" style="padding:22px 20px;background:#0C0E10;border-top:1px solid #24272b;text-align:center;">
          <p style="margin:0 0 6px;color:#ffffff;font-size:14px;line-height:20px;font-weight:700;">BlinkGo</p>
          <p style="margin:0 0 12px;font-size:12px;line-height:18px;"><a href="${homeUrl}" style="color:#FFC107;text-decoration:none;">blinkgo.de</a></p>
          <p style="margin:0;color:#858a91;font-size:12px;line-height:20px;">
            <a href="${supportUrl}" style="color:#b8bcc1;text-decoration:underline;">Support</a>
            <span aria-hidden="true" style="color:#555a60;">&nbsp;&nbsp;•&nbsp;&nbsp;</span>
            <a href="${privacyUrl}" style="color:#b8bcc1;text-decoration:underline;">Datenschutz</a>
            <span aria-hidden="true" style="color:#555a60;">&nbsp;&nbsp;•&nbsp;&nbsp;</span>
            <a href="${termsUrl}" style="color:#b8bcc1;text-decoration:underline;">AGB</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
`;
}

const paragraph = (text) => `<p style="margin:0 0 16px;color:#d8dadd;font-size:16px;line-height:1.65;">${text}</p>`;
const actionFallback = 'blinkgo.de – sicheren Link öffnen';

const templates = {
  'confirmation.html': template({
    title: 'Willkommen bei BlinkGo',
    preheader: 'Bestätige deine E-Mail-Adresse und aktiviere dein BlinkGo-Konto.',
    headline: 'Willkommen bei BlinkGo',
    bodyHtml: paragraph('Bestätige deine E-Mail-Adresse, um dein BlinkGo-Konto zu aktivieren.') + paragraph('Der Bestätigungslink ist nur für dich bestimmt und kann aus Sicherheitsgründen ablaufen.'),
    ctaLabel: 'E-Mail bestätigen',
    href: '{{ .ConfirmationURL }}',
    fallbackLabel: actionFallback,
    securityNote: 'Wenn du kein BlinkGo-Konto erstellt hast, kannst du diese E-Mail sicher ignorieren.',
  }),
  'recovery.html': template({
    title: 'Passwort zurücksetzen',
    preheader: 'Setze dein BlinkGo-Passwort sicher zurück.',
    headline: 'Passwort zurücksetzen',
    bodyHtml: paragraph('Du hast angefordert, dein BlinkGo-Passwort zurückzusetzen.') + paragraph('Öffne den sicheren Link und lege ein neues Passwort fest. Der Link ist nur einmal verwendbar und kann ablaufen.'),
    ctaLabel: 'Passwort zurücksetzen',
    href: '{{ .ConfirmationURL }}',
    fallbackLabel: actionFallback,
    securityNote: 'Wenn du das Zurücksetzen nicht angefordert hast, kannst du diese E-Mail sicher ignorieren. Dein Passwort bleibt unverändert.',
  }),
  'invite.html': template({
    title: 'Deine Einladung zu BlinkGo',
    preheader: 'Richte dein sicheres BlinkGo-Konto ein.',
    headline: '{{ if eq .Data.invitation_kind "driver" }}Willkommen im BlinkGo Fahrer-Team{{ else if eq .Data.invitation_kind "restaurant" }}Willkommen bei BlinkGo Partner{{ else }}Willkommen bei BlinkGo{{ end }}',
    bodyHtml: '{{ if eq .Data.invitation_kind "driver" }}' + paragraph('Du wurdest eingeladen, dein Fahrer-Konto einzurichten.') + paragraph('Nimm die Einladung an und lege dein persönliches Passwort fest.') + '{{ else if eq .Data.invitation_kind "restaurant" }}' + paragraph('Du wurdest eingeladen, dein Restaurant-Konto einzurichten.') + paragraph('Nimm die Einladung an und lege dein persönliches Passwort für BlinkGo Partner fest.') + '{{ else }}' + paragraph('Du wurdest eingeladen, dein BlinkGo-Konto einzurichten.') + paragraph('Nimm die Einladung an und lege dein persönliches Passwort fest.') + '{{ end }}',
    ctaLabel: '{{ if eq .Data.invitation_kind "driver" }}Einladung annehmen{{ else if eq .Data.invitation_kind "restaurant" }}Restaurant-Konto einrichten{{ else }}Einladung annehmen{{ end }}',
    href: '{{ .ConfirmationURL }}',
    fallbackLabel: 'blinkgo.de – sicheren Einladungslink öffnen',
    securityNote: 'Wenn du diese Einladung nicht erwartest, kannst du diese E-Mail sicher ignorieren.',
  }),
  'magic_link.html': template({
    title: 'Dein sicherer BlinkGo Anmeldelink',
    preheader: 'Melde dich sicher und ohne Passwort bei BlinkGo an.',
    headline: 'Sicher bei BlinkGo anmelden',
    bodyHtml: paragraph('Du hast einen sicheren Anmeldelink für BlinkGo angefordert.') + paragraph('Der Link ist nur einmal verwendbar und kann aus Sicherheitsgründen ablaufen.'),
    ctaLabel: 'Bei BlinkGo anmelden',
    href: '{{ .ConfirmationURL }}',
    fallbackLabel: actionFallback,
    securityNote: 'Wenn du diese Anmeldung nicht angefordert hast, kannst du diese E-Mail sicher ignorieren.',
  }),
  'email_change.html': template({
    title: 'Neue E-Mail-Adresse bestätigen',
    preheader: 'Bestätige die neue E-Mail-Adresse für dein BlinkGo-Konto.',
    headline: 'E-Mail-Adresse bestätigen',
    bodyHtml: paragraph('Du möchtest die E-Mail-Adresse deines BlinkGo-Kontos ändern.') + paragraph('Bestätige <strong style="color:#ffffff;">{{ .NewEmail }}</strong> als deine neue E-Mail-Adresse.'),
    ctaLabel: 'Neue E-Mail bestätigen',
    href: '{{ .ConfirmationURL }}',
    fallbackLabel: actionFallback,
    securityNote: 'Wenn du diese Änderung nicht angefordert hast, bestätige sie nicht und wende dich über blinkgo.de/help an den Support.',
  }),
  'reauthentication.html': template({
    title: 'BlinkGo Sicherheitsbestätigung',
    preheader: 'Verwende deinen einmaligen Sicherheitscode.',
    headline: 'Identität bestätigen',
    bodyHtml: paragraph('Für eine sicherheitsrelevante Aktion musst du deine Identität erneut bestätigen.') + paragraph('Gib den folgenden einmaligen Code in BlinkGo ein. Teile ihn mit niemandem.'),
    codeHtml: '<p style="margin:24px 0 8px;color:#FFC107;font-size:12px;line-height:16px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Sicherheitscode</p><div dir="ltr" style="margin:0 0 24px;padding:18px 12px;background:#08090B;border:1px solid #34383d;border-radius:12px;color:#ffffff;font-family:Consolas,\'Courier New\',monospace;font-size:32px;line-height:40px;font-weight:700;letter-spacing:8px;text-align:center;">{{ .Token }}</div>',
    ctaLabel: 'Zurück zu BlinkGo',
    href: '{{ .SiteURL }}',
    fallbackLabel: 'blinkgo.de öffnen',
    securityNote: 'Wenn du diese Bestätigung nicht angefordert hast, ändere dein Passwort und wende dich über blinkgo.de/help an den Support.',
  }),
  'password_changed_notification.html': template({
    title: 'Dein BlinkGo Passwort wurde geändert',
    preheader: 'Sicherheitsinformation zu deinem BlinkGo-Konto.',
    headline: 'Passwort erfolgreich geändert',
    bodyHtml: paragraph('Das Passwort für dein BlinkGo-Konto wurde soeben geändert.') + paragraph('Wenn du die Änderung vorgenommen hast, musst du nichts weiter tun.'),
    ctaLabel: 'Bei BlinkGo anmelden',
    href: '{{ .SiteURL }}/login',
    fallbackLabel: 'blinkgo.de/login öffnen',
    securityNote: 'Wenn du diese Änderung nicht vorgenommen hast, setze dein Passwort sofort zurück und wende dich über blinkgo.de/help an den Support.',
  }),
  'email_changed_notification.html': template({
    title: 'Deine BlinkGo E-Mail-Adresse wurde geändert',
    preheader: 'Sicherheitsinformation zu deinem BlinkGo-Konto.',
    headline: 'E-Mail-Adresse geändert',
    bodyHtml: paragraph('Die E-Mail-Adresse deines BlinkGo-Kontos wurde von <strong style="color:#ffffff;">{{ .OldEmail }}</strong> zu <strong style="color:#ffffff;">{{ .Email }}</strong> geändert.') + paragraph('Wenn du die Änderung vorgenommen hast, musst du nichts weiter tun.'),
    ctaLabel: 'BlinkGo öffnen',
    href: '{{ .SiteURL }}',
    fallbackLabel: 'blinkgo.de öffnen',
    securityNote: 'Wenn du diese Änderung nicht vorgenommen hast, wende dich sofort über blinkgo.de/help an den Support.',
  }),
};

fs.mkdirSync(outputDir, { recursive: true });
for (const [filename, content] of Object.entries(templates)) {
  fs.writeFileSync(path.join(outputDir, filename), content, 'utf8');
}

const hostedAuthPatch = {
  mailer_subjects_confirmation: 'Willkommen bei BlinkGo – E-Mail bestätigen',
  mailer_templates_confirmation_content: templates['confirmation.html'],
  mailer_subjects_recovery: 'BlinkGo Passwort zurücksetzen',
  mailer_templates_recovery_content: templates['recovery.html'],
  mailer_subjects_invite: '{{ if eq .Data.invitation_kind "driver" }}Willkommen im BlinkGo Fahrer-Team{{ else if eq .Data.invitation_kind "restaurant" }}Willkommen bei BlinkGo Partner{{ else }}Deine Einladung zu BlinkGo{{ end }}',
  mailer_templates_invite_content: templates['invite.html'],
  mailer_subjects_magic_link: 'Dein sicherer BlinkGo Anmeldelink',
  mailer_templates_magic_link_content: templates['magic_link.html'],
  mailer_subjects_email_change: 'BlinkGo E-Mail-Adresse bestätigen',
  mailer_templates_email_change_content: templates['email_change.html'],
  mailer_subjects_reauthentication: '{{ .Token }} ist dein BlinkGo Sicherheitscode',
  mailer_templates_reauthentication_content: templates['reauthentication.html'],
  mailer_subjects_password_changed_notification: 'Dein BlinkGo Passwort wurde geändert',
  mailer_templates_password_changed_notification_content: templates['password_changed_notification.html'],
  mailer_subjects_email_changed_notification: 'Deine BlinkGo E-Mail-Adresse wurde geändert',
  mailer_templates_email_changed_notification_content: templates['email_changed_notification.html'],
};
fs.writeFileSync(
  path.join(outputDir, 'hosted-auth-template-patch.json'),
  `${JSON.stringify(hostedAuthPatch, null, 2)}\n`,
  'utf8',
);

console.log(`Generated ${Object.keys(templates).length} BlinkGo email templates and the hosted Auth patch in ${path.relative(root, outputDir)}.`);
