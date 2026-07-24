import { createServerClient as createSupabaseServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/service';

const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_KEY = 'placeholder-key-for-build-time-only';

export function createServerClient() {
  // في وقت البناء، الـ env vars قد لا تكون متاحة.
  // نستخدم placeholders آمنة (التطبيق لن يعمل بدون الـ URL الحقيقي في runtime).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || PLACEHOLDER_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || PLACEHOLDER_KEY;

  const cookieStore = cookies();

  return createSupabaseServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, {
              secure: process.env.NODE_ENV === 'production',
              ...options,
            });
          });
        } catch {
          // Server Components لا تستطيع تعديل الـ cookies —
          // middleware's updateSession() handles the refresh instead.
        }
      },
    },
  });
}

/**
 * إنشاء client بصلاحيات Service Role (admin).
 * ⚠️ لا تستخدمه إلا في server-side contexts بعد التحقق من الصلاحيات.
 */
export function createAdminClient() {
  // Use the hardened helper whenever the real configuration is present, so a
  // new-format `sb_secret_*` key is never sent as `Authorization: Bearer`
  // (PostgREST rejects that with PGRST301).
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return createServiceClient();
  }
  // Config missing (e.g. build-time analysis): preserve the previous
  // NON-THROWING contract by returning a placeholder client. No secret is
  // read or logged here.
  const { createClient } = require('@supabase/supabase-js');
  return createClient(
    PLACEHOLDER_URL,
    PLACEHOLDER_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}