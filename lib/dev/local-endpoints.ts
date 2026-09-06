import type { NextRequest } from 'next/server';

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

export function isLocalTestHarnessRequest(request: NextRequest): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (process.env.ENABLE_LOCAL_TEST_HARNESS !== 'true') return false;
  if (!isLoopbackHost(request.nextUrl.hostname)) return false;
  const source = request.headers.get('origin') || request.headers.get('referer');
  if (source) {
    try {
      if (!isLoopbackHost(new URL(source).hostname)) return false;
    } catch {
      return false;
    }
  }

  try {
    const backend = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
    if (isLoopbackHost(backend.hostname)) return true;

    const stagingProjectRef = process.env.BLINKGO_STAGING_PROJECT_REF?.trim();
    return Boolean(
      stagingProjectRef
      && /^[a-z0-9]{20}$/.test(stagingProjectRef)
      && backend.hostname === `${stagingProjectRef}.supabase.co`,
    );
  } catch {
    return false;
  }
}

export function isLocalDebugRequest(request: NextRequest): boolean {
  return process.env.ENABLE_DEBUG_ENDPOINTS === 'true' && isLocalTestHarnessRequest(request);
}
