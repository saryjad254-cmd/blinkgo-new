/**
 * Simple admin authentication for admin API routes.
 * Either: logged-in admin user OR a valid X-Admin-Key header.
 *
 * Built on @/lib/foundation: uses fail() for response shape consistency.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { fail, AuthenticationError } from '@/lib/foundation';

export async function requireAdmin(req: NextRequest): Promise<NextResponse | null> {
  // Option 1: Admin secret (for server-to-server, scripts, cron jobs)
  const adminKey = req.headers.get('x-admin-key');
  const expectedKey = process.env.ADMIN_SECRET_KEY || process.env.CRON_SECRET;
  if (expectedKey && adminKey === expectedKey) {
    return null; // authorized
  }

  // Option 2: Logged-in admin user
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    if (profile?.role === 'admin') {
      return null; // authorized
    }
  }

  return fail(new AuthenticationError('Admin access required'));
}
