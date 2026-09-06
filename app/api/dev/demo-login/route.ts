import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/services/auth-service';
import { isLocalTestHarnessRequest } from '@/lib/dev/local-endpoints';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DemoRole = 'admin' | 'driver' | 'restaurant' | 'customer';

const DEMO_ACCOUNTS: Record<DemoRole, { emailEnv: string; passwordEnv: string; path: string }> = {
  admin: { emailEnv: 'DEMO_ADMIN_EMAIL', passwordEnv: 'DEMO_ADMIN_PASSWORD', path: '/admin' },
  driver: { emailEnv: 'DEMO_DRIVER_EMAIL', passwordEnv: 'DEMO_DRIVER_PASSWORD', path: '/driver/dashboard' },
  restaurant: { emailEnv: 'DEMO_RESTAURANT_EMAIL', passwordEnv: 'DEMO_RESTAURANT_PASSWORD', path: '/restaurant/dashboard' },
  customer: { emailEnv: 'DEMO_CUSTOMER_EMAIL', passwordEnv: 'DEMO_CUSTOMER_PASSWORD', path: '/home' },
};

export async function POST(request: NextRequest) {
  if (!isLocalTestHarnessRequest(request)) {
    return NextResponse.json({ ok: false, error: { message: 'Not found' } }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const role = body?.role as DemoRole | undefined;
  const config = role ? DEMO_ACCOUNTS[role] : undefined;
  if (!config) {
    return NextResponse.json({ ok: false, error: { message: 'Invalid demo role' } }, { status: 400 });
  }
  const email = process.env[config.emailEnv]?.trim();
  const password = process.env[config.passwordEnv];
  if (!email || !password) {
    return NextResponse.json(
      { ok: false, error: { message: 'Demo login is not configured' } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    // Demo shortcuts are frequently used to switch roles in the same browser.
    // Clear the previous role's base and chunked session cookies first so the
    // role guard cannot read a stale customer/admin identity after login.
    await AuthService.logout();
    const { user, tokens } = await AuthService.loginFull(email, password);
    await AuthService.setSessionCookies(tokens);
    return NextResponse.json(
      { ok: true, data: { role: user.role, path: config.path } },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[demo-login] failed', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { ok: false, error: { message: 'Demo login is unavailable' } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
