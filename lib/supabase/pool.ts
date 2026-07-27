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

let _serviceClient: SupabaseClient | null = null;

/**
 * Get or create service client (for admin operations).
 * Service client bypasses RLS — use carefully.
 */
export function getServiceClient(): SupabaseClient {
  if (_serviceClient) return _serviceClient;
  _serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema: 'public' },
      global: {
        headers: { 'x-application-name': 'blinkgo-web' },
      },
    },
  );
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
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // No-op (cookies can only be set in Server Actions or Route Handlers)
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
            // No-op
          }
        },
      },
    },
  );
}
