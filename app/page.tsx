import { redirect } from 'next/navigation';
import { AuthService } from '@/lib/services/auth-service';
import { cookies } from 'next/headers';
import { authTrace, AUTH_SOURCES } from '@/lib/diagnostic';

export const dynamic = 'force-dynamic';

/**
 * Root page (/).
 *  - Logged-in users with a known role are redirected to their dashboard.
 *  - First-time visitors (no welcome-seen cookie) are shown the welcome screen.
 *  - Returning visitors are sent straight to /login.
 */
export default async function HomePage() {
  // Fast path: if no session cookie, redirect immediately without DB lookup
  const cookieStore = cookies();
  const cookieNames = cookieStore.getAll().map(c => c.name);
  const hasSession =
    cookieStore.has('blinkgo-session') ||
    cookieStore.has('sb-rhdaffhlrglyknxtucux-auth-token');

  if (hasSession) {
    authTrace('logged_in_user', {
      source: AUTH_SOURCES.HOME_PAGE_LOGGED_IN,
      hasAuthCookie: true,
      cookieNames,
    });
    const user = await AuthService.currentUser();
    if (user) {
      authTrace('redirect_to_dashboard', {
        source: AUTH_SOURCES.HOME_PAGE_LOGGED_IN,
        userId: user.id,
        role: user.role,
        redirectTarget: user.redirectPath,
      });
      redirect(user.redirectPath);
    }
    authTrace('currentUser_null', {
      source: AUTH_SOURCES.HOME_PAGE_LOGGED_IN,
      reason: 'AuthService.currentUser returned null',
    });
  } else {
    authTrace('no_session', {
      source: AUTH_SOURCES.HOME_PAGE_NO_SESSION,
      cookieNames,
    });
  }

  // First-time visitors see the welcome screen
  const hasSeenWelcome = cookieStore.has('blinkgo-welcome-seen');
  if (!hasSeenWelcome) {
    authTrace('redirect_to_welcome', {
      source: AUTH_SOURCES.ROOT_PAGE,
      redirectTarget: '/welcome',
    });
    redirect('/welcome');
  }

  authTrace('redirect_to_login', {
    source: AUTH_SOURCES.ROOT_PAGE,
    reason: 'no_session_welcome_seen',
    redirectTarget: '/login',
  });
  redirect('/login');
}
