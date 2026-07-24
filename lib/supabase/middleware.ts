/**
 * Supabase Middleware Session Refresh — official SSR pattern.
 *
 * Uses the modern getAll/setAll cookie adapter (the get/set/remove trio is
 * deprecated in @supabase/ssr and only reads up to 5 cookie chunks via
 * name "hints"; getAll has no such limit and is the documented pattern).
 *
 * getUser() validates the JWT with the Supabase Auth server and, when the
 * access token is expired, refreshes the session — the refreshed cookies
 * are forwarded to BOTH the request (for downstream server components)
 * and the response (for the browser).
 */
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, {
              secure: process.env.NODE_ENV === 'production',
              ...options,
            });
          });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  return { response, user, supabase };
}
