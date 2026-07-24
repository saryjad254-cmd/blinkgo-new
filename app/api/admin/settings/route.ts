/**
 * System Settings API
 * ───────────────────
 * GET  /api/admin/settings     - Get all settings (admin)
 * POST /api/admin/settings     - Update a setting (admin)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createServerClient } from '@/lib/supabase/server';
import { ok, fail, withErrorHandling } from '@/lib/api/response';
import { AuthenticationError, AuthorizationError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabaseAuth = createServerClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) throw new AuthenticationError();

    const svc = createServiceClient();
    const { data, error } = await svc
      .from('system_settings')
      .select('*')
      .order('key');

    if (error) {
      logger.warn('settings fetch failed', {}, error);
      return ok({ settings: {} });
    }

    // Convert to key-value object
    const settings: Record<string, any> = {};
    for (const row of data ?? []) {
      settings[row.key] = row.value;
    }
    return ok({ settings, raw: data ?? [] });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabaseAuth = createServerClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) throw new AuthenticationError();

    // Verify admin
    const { data: profile } = await supabaseAuth
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
      throw new AuthorizationError('Admin access required');
    }

    const body = await req.json().catch(() => ({}));
    const updates = body.settings as Record<string, any>;
    if (!updates || typeof updates !== 'object') {
      throw new ValidationError('settings object is required');
    }

    const svc = createServiceClient();
    const results: any[] = [];
    for (const [key, value] of Object.entries(updates)) {
      const { data, error } = await svc
        .from('system_settings')
        .upsert({
          key,
          value,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'key' })
        .select()
        .single();
      if (error) {
        logger.warn('setting update failed', { key }, error);
        results.push({ key, ok: false, error: error.message });
      } else {
        results.push({ key, ok: true, setting: data });
      }
    }

    return ok({ results });
  });
}
