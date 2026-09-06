# BlinkGo Supabase Auth email templates

These files are the complete production HTML bodies for hosted Supabase Auth.
They intentionally keep `{{ .ConfirmationURL }}` for link-based messages so
the currently verified signup, recovery, invitation, callback, and session
flows remain unchanged.

## Production asset and links

- Logo: `https://www.blinkgo.de/brand/blinkgo-email-logo.png`
- Home: `https://www.blinkgo.de`
- Support: `https://www.blinkgo.de/help`
- Privacy: `https://www.blinkgo.de/legal/datenschutz`
- Terms: `https://www.blinkgo.de/legal/agb`

The email logo file is an exact byte-for-byte copy of the canonical existing
asset `public/brand/blinkgo-official-compact-transparent.png`; it is not a
redesign.

## Hosted Supabase Dashboard installation

### Production asset prerequisite

Deploy the current BlinkGo application build before installing these hosted
templates. The deployment must include
`public/brand/blinkgo-email-logo.png`. Verify that
`https://www.blinkgo.de/brand/blinkgo-email-logo.png` returns HTTP `200` with
`Content-Type: image/png` (not the application's HTML not-found page). Do not
install the templates until this check passes, otherwise mail clients will show
a broken logo.

Open **Supabase → Authentication → Email Templates**. For each item below,
paste the listed subject into **Subject** and the entire referenced `.html`
file into **Body**. Save each template before moving to the next one.

| Supabase template name | Exact subject | Complete HTML body |
| --- | --- | --- |
| Confirm signup | `Willkommen bei BlinkGo – E-Mail bestätigen` | `confirmation.html` |
| Reset password | `BlinkGo Passwort zurücksetzen` | `recovery.html` |
| Invite user | `{{ if eq .Data.invitation_kind "driver" }}Willkommen im BlinkGo Fahrer-Team{{ else if eq .Data.invitation_kind "restaurant" }}Willkommen bei BlinkGo Partner{{ else }}Deine Einladung zu BlinkGo{{ end }}` | `invite.html` |
| Magic Link | `Dein sicherer BlinkGo Anmeldelink` | `magic_link.html` |
| Change Email Address | `BlinkGo E-Mail-Adresse bestätigen` | `email_change.html` |
| Reauthentication | `{{ .Token }} ist dein BlinkGo Sicherheitscode` | `reauthentication.html` |
| Password changed notification | `Dein BlinkGo Passwort wurde geändert` | `password_changed_notification.html` |
| Email address changed notification | `Deine BlinkGo E-Mail-Adresse wurde geändert` | `email_changed_notification.html` |

The hosted project exposes only one **Invite user** template. BlinkGo passes
the non-authoritative `invitation_kind` user-metadata field during delivery,
so the one supported Supabase template renders the correct driver or
restaurant headline, CTA, and subject. Authorization still comes only from
trusted `app_metadata` and is unchanged.

Security notification templates can be saved without enabling them. Enable a
notification only if it is already part of the intended production policy;
this branding pass does not change notification policy.

The file `hosted-auth-template-patch.json` contains the same complete subjects
and bodies in Supabase Management API field format. It deliberately contains
no project reference, access token, SMTP credential, or notification-enable
flag.

## Sender and replies

- Keep the existing Auth SMTP sender: `BlinkGo <auth@blinkgo.de>`.
- Do not add a Reply-To in Supabase unless a verified support inbox is already
  configured. BlinkGo's direct transactional email code uses
  `COMPANY_SUPPORT_EMAIL` only when that variable exists.
- Keep link tracking disabled in Resend for Auth mail so confirmation URLs are
  not rewritten.

## Local development

`supabase/config.toml` points to the six authentication template files. Restart
the local Supabase stack after changes. Hosted Supabase does not deploy these
files automatically; install them through the Dashboard or Management API.
