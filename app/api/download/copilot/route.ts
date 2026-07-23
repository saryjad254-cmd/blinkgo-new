/**
 * Download Copilot Review Bundle
 * ───────────────────────────────
 * GET /api/download/copilot - Download the focused code review bundle
 * 
 * Smaller bundle (43KB) for AI code review tools (Microsoft Copilot, etc.)
 * Contains:
 *  - COPILOT_CONTEXT.md (project overview)
 *  - COPILOT_QUESTIONS.md (specific questions)
 *  - 15 carefully selected files (config, schema, business logic, APIs)
 */
import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const candidates = [
    path.join(process.cwd(), 'public', 'copilot-bundle', 'for-copilot.zip'),
    path.join(process.cwd(), '..', 'for-copilot.zip'),
    path.join(process.cwd(), '..', 'copilot-bundle.zip'),
    '/workspace/copilot-bundle.zip',
    '/workspace/for-copilot.zip',
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
      { ok: false, error: { code: 'NOT_FOUND', message: 'Copilot bundle not found' } },
      { status: 404 }
    );
  }

  try {
    const fileStat = await stat(zipPath);
    const fileBuffer = await readFile(zipPath);
    const arrayBuffer = fileBuffer.buffer.slice(
      fileBuffer.byteOffset,
      fileBuffer.byteOffset + fileBuffer.byteLength
    ) as ArrayBuffer;

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': fileStat.size.toString(),
        'Content-Disposition': `attachment; filename="blinkgo-copilot-review.zip"`,
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Content-Disposition',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: { code: 'READ_ERROR', message: 'Could not read bundle' } },
      { status: 500 }
    );
  }
}
