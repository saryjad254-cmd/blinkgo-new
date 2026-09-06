/**
 * Error response helper.
 * Returns a NextResponse with a structured failure body.
 * Use when you want a stable, non-throwing error path.
 */
import { NextResponse } from 'next/server';

export interface ErrResponse {
  ok: false;
  error: string;
  message?: string;
  details?: Record<string, unknown>;
  requestId?: string;
}

export function err(
  code: string,
  message: string,
  status: number = 400,
  headers?: Record<string, string>,
): NextResponse<ErrResponse> {
  const body: ErrResponse = {
    ok: false,
    error: code,
    message,
  };
  const res = NextResponse.json(body, { status });
  if (headers) {
    for (const [k, v] of Object.entries(headers)) {
      res.headers.set(k, v);
    }
  }
  return res;
}
