/**
 * Restaurants Repository
 * ─────────────────────
 * Canonical data access for the `restaurants` table.
 */

import { createServiceClient } from '@/lib/data/clients';
import { dbCall } from '@/lib/data/retry';
import { QueryBuilder, normalizePagination, buildPaginatedResult, type PaginatedResult, type Pagination } from '@/lib/data/query';
import { NotFoundError } from '@/lib/foundation';

export interface RestaurantRow {
  id: string;
  name: string;
  description: string | null;
  owner_id: string | null;
  category: string | null;
  cuisine: string[] | string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  delivery_fee: number;
  min_order: number;
  is_active: boolean;
  is_hidden: boolean;
  rating: number;
  total_reviews: number;
  logo_url: string | null;
  cover_url: string | null;
  opening_hours: Record<string, unknown> | null;
  created_at: string;
  updated_at: string | null;
}

export interface RestaurantInsert {
  name: string;
  description?: string;
  owner_id?: string;
  category?: string;
  cuisine?: string[] | string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  delivery_fee?: number;
  min_order?: number;
  is_active?: boolean;
  is_hidden?: boolean;
  logo_url?: string;
  cover_url?: string;
  opening_hours?: Record<string, unknown>;
}

const TABLE = 'restaurants';
const COLUMNS = 'id, name, description, owner_id, category, cuisine, phone, email, address, city, latitude, longitude, delivery_fee, min_order, is_active, is_hidden, rating, total_reviews, logo_url, cover_url, opening_hours, created_at, updated_at';

// ── Read ─────────────────────────────────────────────────────
export async function findById(id: string): Promise<RestaurantRow | null> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () => svc.from(TABLE).select(COLUMNS).eq('id', id).maybeSingle(),
    { label: 'restaurants.findById' },
  );
  if (error) throw error;
  return data as RestaurantRow | null;
}

export async function findByOwner(ownerId: string): Promise<RestaurantRow | null> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () => svc.from(TABLE).select(COLUMNS).eq('owner_id', ownerId).maybeSingle(),
    { label: 'restaurants.findByOwner' },
  );
  if (error) throw error;
  return data as RestaurantRow | null;
}

export async function findBySlug(slug: string): Promise<RestaurantRow | null> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () => svc.from(TABLE).select(COLUMNS).limit(500),
    { label: 'restaurants.findBySlug' },
  );
  if (error) throw error;
  const normalized = slug.trim().toLowerCase();
  return ((data ?? []) as RestaurantRow[]).find((restaurant) =>
    restaurant.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') === normalized,
  ) ?? null;
}

export interface ListRestaurantsOptions {
  city?: string;
  cuisineType?: string;
  isActive?: boolean;
  isVisible?: boolean;
  minRating?: number;
  ownerId?: string;
  search?: string;
  pagination?: Pagination;
  includeDeleted?: boolean;
}

export async function list(opts: ListRestaurantsOptions = {}): Promise<PaginatedResult<RestaurantRow>> {
  const svc = createServiceClient();
  const q = new QueryBuilder<RestaurantRow>(svc.from(TABLE), { label: 'restaurants.list' });
  q.select(COLUMNS, { count: 'exact' });

  if (opts.city) q.eq('city', opts.city);
  if (opts.cuisineType) q.contains('cuisine', [opts.cuisineType]);
  if (opts.isActive !== undefined) q.eq('is_active', opts.isActive);
  if (opts.isVisible !== undefined) q.eq('is_hidden', !opts.isVisible);
  if (opts.minRating !== undefined) q.gte('rating', opts.minRating);
  if (opts.ownerId) q.eq('owner_id', opts.ownerId);
  if (opts.search) q.or(`name.ilike.%${opts.search}%,description.ilike.%${opts.search}%`);

  q.orderBy('rating', 'desc').orderBy('created_at', 'desc');

  if (opts.pagination) q.paginate(opts.pagination);
  else q.limit(50);

  const { data, count, error } = await q.executeMany();
  if (error) throw error;
  return buildPaginatedResult(data, count ?? 0, opts.pagination ?? normalizePagination(undefined));
}

export async function listVisible(opts: Omit<ListRestaurantsOptions, 'isVisible' | 'isActive'> = {}): Promise<PaginatedResult<RestaurantRow>> {
  return list({ ...opts, isActive: true, isVisible: true });
}

// ── Write ────────────────────────────────────────────────────
export async function create(input: RestaurantInsert): Promise<RestaurantRow> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () =>
      svc
        .from(TABLE)
        .insert({
          ...input,
          is_active: input.is_active ?? true,
          is_hidden: input.is_hidden ?? false,
          delivery_fee: input.delivery_fee ?? 0,
          min_order: input.min_order ?? 0,
          rating: 0,
          total_reviews: 0,
          created_at: new Date().toISOString(),
        })
        .select(COLUMNS)
        .single(),
    { label: 'restaurants.create' },
  );
  if (error) throw error;
  if (!data) throw new NotFoundError('Restaurant (after insert)');
  return data as RestaurantRow;
}

export async function update(id: string, patch: Partial<RestaurantRow>): Promise<RestaurantRow> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () =>
      svc
        .from(TABLE)
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select(COLUMNS)
        .single(),
    { label: 'restaurants.update' },
  );
  if (error) throw error;
  if (!data) throw new NotFoundError('Restaurant');
  return data as RestaurantRow;
}
