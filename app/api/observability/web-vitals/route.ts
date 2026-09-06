import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/foundation/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const metricSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.enum(['CLS', 'FCP', 'INP', 'LCP', 'TTFB']),
  value: z.number().finite().nonnegative().max(3_600_000),
  delta: z.number().finite().min(-3_600_000).max(3_600_000),
  rating: z.enum(['good', 'needs-improvement', 'poor']).optional(),
  navigationType: z.string().max(64).optional(),
  route: z.string().startsWith('/').max(256).regex(/^[^?#]*$/),
}).strict();

export async function POST(request: Request): Promise<NextResponse> {
  const limited = rateLimit({ limit: 120, windowSec: 60, name: 'web-vitals' }, request);
  if (limited) return limited;

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return NextResponse.json({ ok: false, error: 'unsupported_media_type' }, { status: 415 });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const parsed = metricSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_metric' }, { status: 400 });
  }

  logger.info('web_vital', {
    event: 'web_vital',
    metric_id: parsed.data.id,
    metric_name: parsed.data.name,
    value: parsed.data.value,
    delta: parsed.data.delta,
    rating: parsed.data.rating ?? 'unknown',
    navigation_type: parsed.data.navigationType ?? 'unknown',
    route: parsed.data.route,
  });

  return new NextResponse(null, {
    status: 204,
    headers: { 'Cache-Control': 'no-store' },
  });
}
