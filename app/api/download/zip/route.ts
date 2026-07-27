/**
 * Download Final ZIP
 * ──────────────────
 * GET /api/download/zip - Download the final project ZIP
 * 
 * Streams the ZIP file with proper headers for mobile download.
 */
import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Try multiple locations for the ZIP
  const candidates = [
    path.join(process.cwd(), '..', 'blinkgo-final.zip'),
    path.join(process.cwd(), 'blinkgo-final.zip'),
    '/workspace/blinkgo-final.zip',
    path.join(process.cwd(), '..', 'blinkgo-v53.zip'),
  ];

  let zipPath: string | null = null;
  for (const p of candidates) {
    if (existsSync(p)) {
      zipPath = p;
      break;
    }
  }

  if (!zipPath) {
    return NextResponse.json(
      { ok: false, error: { code: 'NOT_FOUND', message: 'ZIP file not found on server' } },
      { status: 404 }
    );
  }

  try {
    const fileStat = await stat(zipPath);
    const fileBuffer = await readFile(zipPath);

    // Convert Node Buffer to ArrayBuffer for the Response
    const arrayBuffer = fileBuffer.buffer.slice(
      fileBuffer.byteOffset,
      fileBuffer.byteOffset + fileBuffer.byteLength
    ) as ArrayBuffer;

    // Convert ArrayBuffer to BodyInit
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': fileStat.size.toString(),
        'Content-Disposition': `attachment; filename="blinkgo-v53.zip"`,
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Content-Disposition',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: { code: 'READ_ERROR', message: 'Could not read ZIP' } },
      { status: 500 }
    );
  }
}
