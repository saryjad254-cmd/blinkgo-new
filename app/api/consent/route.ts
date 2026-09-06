/**
 * Cookie consent audit API.
 * Records an append-only, data-minimised proof of the visitor's choice.
 * IP addresses and user-agent strings are intentionally not retained.
 */
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logging';
import { ok, withErrorHandling } from '@/lib/api/response';
import { rateLimit } from '@/lib/rate-limit';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { ValidationError } from '@/lib/errors';
import { CONSENT_COOKIE_NAME, CONSENT_MAX_AGE_SECONDS, CONSENT_VERSION } from '@/lib/privacy/consent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_CATEGORIES = ['strictly_necessary', 'preferences', 'analytics', 'marketing'];

export async function POST(req: NextRequest) {
  return (await withSecurity(
    secureRoute('moderate'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (_ctx, request) => recordConsent(request as NextRequest) as any,
  )(req)) as unknown as NextResponse;
}

async function recordConsent(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const limited = rateLimit({ limit: 30, windowSec: 60 * 60, name: 'consent' }, req);
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    const { categories, action, consentId, version, source } = body;

    if (!['accept_all', 'reject_non_essential', 'custom'].includes(action)) {
      throw new ValidationError('Invalid action');
    }
    if (typeof consentId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(consentId)) {
      throw new ValidationError('Invalid consentId');
    }
    if (version !== CONSENT_VERSION) throw new ValidationError('Unsupported consent version');

    if (action === 'custom') {
      if (!categories || typeof categories !== 'object') throw new ValidationError('categories required for custom');
      for (const [key, value] of Object.entries(categories)) {
        if (!VALID_CATEGORIES.includes(key)) throw new ValidationError(`Invalid category: ${key}`);
        if (typeof value !== 'boolean') throw new ValidationError(`category ${key} must be boolean`);
      }
    }

    const normalizedCategories = action === 'accept_all'
      ? { strictly_necessary: true, preferences: true, analytics: true, marketing: true }
      : action === 'reject_non_essential'
        ? { strictly_necessary: true, preferences: false, analytics: false, marketing: false }
        : {
            strictly_necessary: true,
            preferences: categories.preferences === true,
            analytics: categories.analytics === true,
            marketing: categories.marketing === true,
          };

    const record = {
      id: consentId,
      consent_version: version,
      action,
      categories: normalizedCategories,
      source: typeof source === 'string' && source.length <= 40 ? source : 'global_banner',
      created_at: new Date().toISOString(),
    };

    logger.info('consent_recorded', record);
    const { createServiceClient } = await import('@/lib/supabase/service');
    const service = createServiceClient();
    const { error } = await service.from('consent_records').insert(record);
    if (error) throw error;

    const response = ok({ recorded: true, categories: normalizedCategories, version: CONSENT_VERSION });
    response.cookies.set(CONSENT_COOKIE_NAME, JSON.stringify({
      id: consentId,
      version,
      categories: normalizedCategories,
      updatedAt: record.created_at,
    }), {
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: false,
      maxAge: CONSENT_MAX_AGE_SECONDS,
    });
    return response;
  });
}

export async function GET() {
  return NextResponse.json({
    current_state: 'opt_in_required_for_non_essential_categories',
    consent_version: CONSENT_VERSION,
    default_categories: { strictly_necessary: true, preferences: false, analytics: false, marketing: false },
  });
}
