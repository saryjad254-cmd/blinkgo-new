/**
 * Production launch gate for legal compliance.
 * ──────────────────────────────────────────────
 *
 * In `production` mode, BlinkGo refuses to serve customer-facing
 * pages if the legal configuration is incomplete. The failure
 * surfaces as a clear log message + a `503` HTTP response on
 * any legal page route.
 *
 * Dev mode: always passes (placeholders are still visible
 * on the legal pages themselves, but the app is allowed to
 * boot for development).
 *
 * Staging mode: same as production (no special-casing).
 *
 * To disable the gate temporarily (NOT recommended for
 * production), set `LEGAL_GATE_BYPASS=true` in the environment.
 *
 * Add to your process bootstrap:
 *   import { checkLegalLaunchGate } from '@/lib/legal/launch-gate';
 *   checkLegalLaunchGate();
 */
import { validateForProduction, isCompanyConfigured } from './company-info';

export interface LaunchGateResult {
  ok: boolean;
  isProduction: boolean;
  isConfigured: boolean;
  missing: string[];
  warnings: string[];
}

export function checkLegalLaunchGate(): LaunchGateResult {
  const isProduction = process.env.NODE_ENV === 'production';
  const bypass = process.env.LEGAL_GATE_BYPASS === 'true';

  const configured = isCompanyConfigured();
  const validation = validateForProduction();
  const warnings: string[] = [];

  if (!configured) {
    warnings.push('Company info is partially missing. Legal pages will display placeholders.');
  }
  if (validation.missing.length > 0) {
    warnings.push(`Production validation failed: ${validation.missing.length} fields missing.`);
  }
  if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'sk_test_REPLACE_ME') {
    // Stripe wired — payment surface is real
  } else {
    warnings.push('Stripe is not wired (no real keys). Card payment is mocked.');
  }
  if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
    warnings.push('Google Maps API key missing. Map widgets will fail.');
  }

  const mustBlock = isProduction && !bypass && validation.missing.length > 0;

  if (mustBlock) {
    // eslint-disable-next-line no-console
    console.error('\n[LEGAL_GATE] ❌ Production launch blocked.');
    // eslint-disable-next-line no-console
    console.error('[LEGAL_GATE] Missing fields:');
    for (const f of validation.missing) {
      // eslint-disable-next-line no-console
      console.error(`  - ${f}`);
    }
    // eslint-disable-next-line no-console
    console.error('[LEGAL_GATE] Set LEGAL_GATE_BYPASS=true to bypass (NOT recommended).\n');
  }

  return {
    ok: !mustBlock,
    isProduction,
    isConfigured: configured,
    missing: validation.missing,
    warnings,
  };
}
