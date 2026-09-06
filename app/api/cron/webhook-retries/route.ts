import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getWebhookDispatcher } from '@/lib/integrations/webhooks/dispatcher';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: NextRequest, expected: string): boolean {
  const header = req.headers.get('authorization') || '';
  if (!header.toLowerCase().startsWith('bearer ')) return false;
  const provided = header.slice(7).trim();
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}

async function run(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) return NextResponse.json({ ok: false, error: 'server_misconfigured' }, { status: 503 });
  if (req.nextUrl.searchParams.size > 0) {
    return NextResponse.json({ ok: false, error: 'query_parameters_not_allowed' }, { status: 400 });
  }
  if (!authorized(req, secret)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const startedAt = Date.now();
  try {
    const result = await getWebhookDispatcher().processRetries(100);
    logger.info('cron.webhook_retries.completed', { ...result, duration_ms: Date.now() - startedAt });
    return NextResponse.json({ ok: true, ...result, duration_ms: Date.now() - startedAt });
  } catch (error: unknown) {
    logger.error('cron.webhook_retries.failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      duration_ms: Date.now() - startedAt,
    });
    return NextResponse.json({ ok: false, error: 'retry_processing_failed' }, { status: 500 });
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return run(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return run(req);
}
