const CUSTOMER_ROUTES = ['/home', '/search', '/cart', '/orders'] as const;
const DRIVER_ROUTES = ['/driver/dashboard', '/driver/orders', '/driver/earnings'] as const;
const RESTAURANT_ROUTES = ['/restaurant/dashboard', '/restaurant/kitchen', '/restaurant/orders', '/restaurant/menu'] as const;
const ADMIN_ROUTES = ['/admin', '/admin/live-ops', '/admin/orders', '/admin/support'] as const;

const AUTH_OR_PUBLIC_PREFIXES = [
  '/login', '/register', '/forgot-password', '/reset-password', '/welcome',
  '/auth/', '/legal/', '/brand', '/coming-soon', '/share/',
] as const;

export function getIdlePrefetchRoutes(pathname: string): readonly string[] {
  if (AUTH_OR_PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix))) return [];
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return ADMIN_ROUTES;
  if (pathname === '/driver' || pathname.startsWith('/driver/')) return DRIVER_ROUTES;
  if (pathname === '/restaurant' || pathname.startsWith('/restaurant/')) return RESTAURANT_ROUTES;
  return CUSTOMER_ROUTES;
}

export function isSafePrefetchHref(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//') && !href.includes('\\');
}
