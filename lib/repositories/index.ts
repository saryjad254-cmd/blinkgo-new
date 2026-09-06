/**
 * Repositories: Barrel Export
 * ───────────────────────────
 * Single import for all repositories.
 *
 *   import { users, orders, restaurants } from '@/lib/repositories';
 *   const order = await orders.findById(id);
 */

export * as users from './users';
export * as orders from './orders';
export * as restaurants from './restaurants';
export * as products from './products';
export * as notifications from './notifications';
export * as drivers from './drivers';
export * as payments from './payments';
export * as addresses from './addresses';
export * as favorites from './favorites';
export * as coupons from './coupons';
export * as support from './support';
