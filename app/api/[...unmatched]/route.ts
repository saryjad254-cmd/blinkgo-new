import { NextResponse } from 'next/server';

/**
 * API catch-all — returns a real 404 for unknown /api/* paths.
 *
 * ROOT CAUSE THIS FIXES
 * ---------------------
 * `app/[...not-found]/page.tsx` matched /api/* too, so a request to a
 * non-existent API route returned **HTTP 200 with an HTML body**. Client
 * helpers then threw while parsing JSON, every caller's `catch` swallowed it,
 * and no 4xx ever reached the logs — which is exactly why six missing
 * restaurant endpoints went unnoticed in production.
 *
 * A route handler is more specific than the page catch-all for /api/*, so this
 * file intercepts those requests and answers with a structured JSON 404.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function notFound() {
  return NextResponse.json({ error: 'not_found' }, { status: 404 });
}

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
export const HEAD = notFound;
export const OPTIONS = notFound;
