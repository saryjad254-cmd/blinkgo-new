# BlinkGo production environment policy

`config/environment-policy.json` is the authoritative public allow-list.
Every listed `NEXT_PUBLIC_*` value is **PUBLIC SAFE** and may be compiled into
the browser application. The Google Maps browser key must still be restricted
to BlinkGo HTTPS referrers and required APIs in Google Cloud; Supabase publishable
and Stripe publishable keys rely on RLS/server verification as designed.

Every variable without `NEXT_PUBLIC_` is **SERVER SECRET / SERVER ONLY**. This
conservative classification includes ordinary server configuration and flags,
so none can be moved to a public prefix for convenience. In particular:

- Supabase service role, database credentials
- Stripe secret and webhook secret
- Resend/SendGrid credentials and webhook secrets
- Google Maps server key
- VAPID private key and APNS/FCM credentials
- reset, draft, delivery PIN, cron, metrics and automation secrets
- company/legal configuration, provider flags and operator accounts

must exist only in the deployment provider's encrypted server environment.
Local `.env*` files are excluded from source control and must never be copied
into public/static paths.

Production must use two different Google Maps credentials: the public key is
restricted by BlinkGo HTTPS referrers and browser APIs; `GOOGLE_MAPS_API_KEY`
is restricted by the deployment's server egress/API set. The server geocoder
will not fall back to the public key when `NODE_ENV=production`.

Run `npm run build`, `npm run test:production-env`, and
`npm run test:production-readiness`. The bundle contract fails if a new
public variable is not explicitly reviewed, if a public name looks secret, if
a production env file contains localhost, or if any configured local server-only
value appears in the generated browser bundle. The readiness command additionally
fails unless production uses the BlinkGo HTTPS hosts, restricted origins,
complete live Stripe credentials, separate Maps browser/server keys, Resend,
VAPID, security secrets, and documented legal approvals. Failure output names
items, never their values.
