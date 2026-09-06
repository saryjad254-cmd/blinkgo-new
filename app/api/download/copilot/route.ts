import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Internal review bundles are never exposed through a public API route. */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { ok: false, error: { code: 'DOWNLOAD_DISABLED', message: 'Review bundle downloads are disabled' } },
    { status: 404, headers: { 'Cache-Control': 'no-store' } },
  );
}
