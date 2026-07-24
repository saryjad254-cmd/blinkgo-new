import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { WelcomeScreen } from '@/components/welcome/WelcomeScreen';
import { authTrace, AUTH_SOURCES } from '@/lib/diagnostic';

export const dynamic = 'force-dynamic';

export default async function WelcomePage() {
  const cookieStore = await cookies();
  const cookieNames = cookieStore.getAll().map(c => c.name);
  const hasSession =
    cookieStore.has('blinkgo-session') ||
    cookieStore.has('sb-rhdaffhlrglyknxtucux-auth-token');

  if (hasSession) {
    authTrace('redirect_to_login', {
      source: AUTH_SOURCES.WELCOME_PAGE,
      reason: 'has_session_while_visiting_welcome',
      hasAuthCookie: true,
      cookieNames,
      redirectTarget: '/login',
    });
    redirect('/login');
  }

  return <WelcomeScreen />;
}
