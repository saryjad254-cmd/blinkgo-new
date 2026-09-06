/** Canonical post-authentication destinations for every supported role. */
const ROLE_HOME_PATHS = {
  customer: '/home',
  driver: '/driver/dashboard',
  restaurant: '/restaurant/dashboard',
  manager: '/admin',
  admin: '/admin',
  super_admin: '/admin',
} as const;

export type RoutableUserRole = keyof typeof ROLE_HOME_PATHS;

/**
 * Return a safe, same-origin application path derived only from a role.
 * `restaurant_owner` remains supported while older profiles are migrated.
 */
export function getRoleHomePath(role?: string | null): string {
  const normalizedRole = role === 'restaurant_owner' ? 'restaurant' : role;

  if (normalizedRole && normalizedRole in ROLE_HOME_PATHS) {
    return ROLE_HOME_PATHS[normalizedRole as RoutableUserRole];
  }

  return ROLE_HOME_PATHS.customer;
}
