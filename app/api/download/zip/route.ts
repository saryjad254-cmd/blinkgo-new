import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Project archives must be distributed out-of-band, never from the web root. */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { ok: false, error: { code: 'DOWNLOAD_DISABLED', message: 'Project archive downloads are disabled' } },
    { status: 404, headers: { 'Cache-Control': 'no-store' } },
  );
}
