# BlinkGo email branding acceptance

## Implementation status

- Eight hosted Supabase Auth templates are complete in this directory.
- `hosted-auth-template-patch.json` contains the same complete subjects and HTML bodies for the Supabase Management API.
- `public/brand/blinkgo-email-logo.png` is an exact byte-for-byte copy of the canonical official BlinkGo logo.
- The working Supabase confirmation, recovery, invitation, callback, and session flows are unchanged.

## Verified on 2026-08-31

- Email branding contract: 15/15 passed.
- Email security contract: 17/17 passed.
- Desktop/mobile rendering: 18 screenshots for 9 scenarios, no page errors.
- Hosted Auth acceptance against the real staging Supabase project
  `egjehqoilbjvzgbnksds`: 16/16 passed.
- Driver invitation: passed.
- Restaurant invitation: passed.
- Customer signup confirmation: passed.
- Password recovery: passed.
- Callback error routing: passed.
- Supabase HTTP 429 responses: 0.
- Typecheck, lint, and production build: passed.
- Production dependency audit: 0 vulnerabilities.

## Hosted installation

All eight templates were installed in the hosted staging Supabase project
`egjehqoilbjvzgbnksds` on 2026-08-31. The editor contents were fully replaced
(not appended to the Supabase defaults), saved, and reopened for verification.
A post-install hosted Auth acceptance run passed 16/16 with no HTTP 429
responses.

The live application currently uses the separate Supabase project
`rhdaffhlrglyknxtucux`. That project's Email Templates page still reports
`Set up custom SMTP`, so Supabase does not allow the branded bodies to be
installed there yet. Configure the same verified Resend SMTP sender in that
project, then paste the exact subjects and complete bodies listed in
`README.md`.

## External publication gate

The repository and staging Supabase work are complete, but production remains
behind these operator actions:

1. Configure custom SMTP in production project `rhdaffhlrglyknxtucux` using
   the existing verified Resend credential. Do not expose the SMTP password in
   source control.
2. Deploy the current BlinkGo build and verify
   `https://www.blinkgo.de/brand/blinkgo-email-logo.png` returns HTTP 200 with
   `Content-Type: image/png`. It currently resolves to the application's HTML
   not-found route.
3. Install the eight exact hosted templates in the production project and run
   `BASE_URL=https://www.blinkgo.de node scripts/production-auth-acceptance.mjs`
   with production operator credentials and cleanup enabled.

Avoid sending non-essential production Auth mail until the logo URL serves the
PNG. The email actions themselves remain functional if images are blocked.

## Production Dashboard re-check — 2026-08-31

The signed-in Supabase Dashboard was re-checked directly after operator access
was restored:

- `egjehqoilbjvzgbnksds` (`blinkgo-staging`) exposes the installed editable
  templates and remains the verified Auth acceptance environment.
- `rhdaffhlrglyknxtucux` (`blink go`) still shows **Set up custom SMTP to edit
  templates** and **Enable custom SMTP** is off.
- No Resend API key or SMTP password exists in the local runtime environment,
  so production SMTP was not partially enabled or saved with invented values.

Exact unblock: create/provide a valid Resend SMTP credential for the verified
`blinkgo.de` domain, then configure production with host `smtp.resend.com`,
port `465`, username `resend`, sender `BlinkGo <auth@blinkgo.de>`. After that,
install the eight complete templates from this directory and rerun hosted Auth
acceptance. Never commit or paste the credential into a tracked file.
