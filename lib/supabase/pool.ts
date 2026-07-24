/**
 * Supabase Connection Helpers
 * ────────────────────────────
 * Lightweight pooling for Supabase clients.
 *
 * Supabase already manages connection pooling internally, but we add:
 *  - Request-scoped client caching
 *  - Server client with cookie-based auth
 *  - Service client for admin operations
 *  - Cleanup on process exit
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/service';

let _serviceClient: SupabaseClient | null = null;

/**
 * Get or create service client (for admin operations).
 * Service client bypasses RLS — use carefully.
 */
export function getServiceClient(): SupabaseClient {
  if (_serviceClient) return _serviceClient;
  // Delegated to the hardened helper so new-format sb_secret_* keys are
  // not sent as `Authorization: Bearer` (PostgREST PGRST301).
  // Pooling (single instance per process) is preserved.
  _serviceClient = createServiceClient();
  return _serviceClient;
}

/**
 * Get a request-scoped server client.
 * Reads cookies from next/headers for authentication.
 */
export function getServerClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
            // No-op (cookies can only be set in Server Actions or Route Handlers)
          }
        },
      },
    },
  );
}
