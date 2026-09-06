import { NextRequest, NextResponse } from 'next/server';
import { getStripe, isStripeConfigured } from '@/lib/stripe/client';
import { isLocalDebugRequest } from '@/lib/dev/local-endpoints';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  if (!isLocalDebugRequest(request)) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const results: Record<string, Record<string, unknown>> = {
    supabase: { ok: null, error: null },
    stripe: { ok: null, error: null, configured: isStripeConfigured() },
    resend: { ok: null, error: null },
    google: { ok: null, error: null },
  };

  // Test Supabase REST
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const resp = await fetch(`${url}/rest/v1/restaurants?limit=1`, {
      headers: { apikey: key!, Authorization: `Bearer ${key}` },
    });
    results.supabase.ok = resp.ok;
    results.supabase.status = resp.status;
    if (!resp.ok) results.supabase.error = 'request_failed';
  } catch {
    results.supabase.error = 'unreachable';
  }

  // Test Stripe (only if configured)
  if (isStripeConfigured()) {
    try {
      const stripe = getStripe();
      if (stripe) {
        const balance = await stripe.balance.retrieve();
        results.stripe.ok = true;
        results.stripe.balance_available = balance.available?.[0]?.amount;
        results.stripe.balance_currency = balance.available?.[0]?.currency;
      } else {
        results.stripe.error = 'Stripe client is null';
      }
    } catch {
      results.stripe.ok = false;
      results.stripe.error = 'request_failed';
    }
  } else {
    results.stripe.error = 'Stripe not configured (placeholder key?)';
  }

  // Test Resend
  try {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      results.resend.ok = false;
      results.resend.error = 'not_configured';
    } else {
      const resp = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${key}` },
      });
      results.resend.ok = resp.ok;
      results.resend.status = resp.status;
      if (!resp.ok) results.resend.error = 'request_failed';
      else {
        const domains = await resp.json() as { data?: unknown[] };
        results.resend.domain_count = domains.data?.length ?? 0;
      }
    }
  } catch {
    results.resend.error = 'unreachable';
  }

  // Test Google Maps
  try {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) {
      results.google.ok = false;
      results.google.error = 'not_configured';
    } else {
      const resp = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=Berlin&key=${encodeURIComponent(key)}`,
      );
      results.google.ok = resp.ok;
      const data = await resp.json() as { status?: string; results?: Array<{ formatted_address: string }> };
      results.google.status = data.status ?? 'unknown';
      if (data.results?.[0]) results.google.test_result = data.results[0].formatted_address;
    }
  } catch {
    results.google.error = 'unreachable';
  }

  return NextResponse.json(results);
}
