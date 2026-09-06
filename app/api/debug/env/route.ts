import { NextRequest, NextResponse } from 'next/server';
import { isLocalDebugRequest } from '@/lib/dev/local-endpoints';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  if (!isLocalDebugRequest(request)) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const env = {
    supabase: {
      url_configured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      anon_key_configured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      service_role_key_configured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      db_password_configured: Boolean(process.env.SUPABASE_DB_PASSWORD),
    },
    stripe: {
      secret_key_configured: Boolean(process.env.STRIPE_SECRET_KEY),
      publishable_key_configured: Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
      webhook_secret_configured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    },
    resend: {
      api_key_configured: Boolean(process.env.RESEND_API_KEY),
      sender_configured: Boolean(process.env.EMAIL_FROM),
    },
    google: {
      api_key_configured: Boolean(process.env.GOOGLE_MAPS_API_KEY),
    },
    flags: {
      allow_mock_payments: process.env.ALLOW_MOCK_PAYMENTS === 'true',
      node_env: process.env.NODE_ENV,
    },
  };
  return NextResponse.json(env);
}
