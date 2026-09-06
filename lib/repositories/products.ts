/**
 * Products Repository
 * ──────────────────
 * Canonical data access for the `products` table.
 */

import { createServiceClient } from '@/lib/data/clients';
import { dbCall } from '@/lib/data/retry';
import { QueryBuilder, normalizePagination, buildPaginatedResult, excludeDeleted, type PaginatedResult, type Pagination } from '@/lib/data/query';
import { NotFoundError } from '@/lib/foundation';

export interface ProductRow {
  id: string;
  restaurant_id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  category: string | null;
  is_active: boolean;
  is_available: boolean;
  approval_status: 'approved' | 'archived';
  archived_at: string | null;
  preparation_time_min: number;
  sort_order: number;
  total_orders: number;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}

const TABLE = 'products';
const COLUMNS = 'id, restaurant_id, name, description, price, image_url, category, is_active, is_available, approval_status, archived_at, preparation_time_min, sort_order, total_orders, created_at, updated_at, deleted_at';

export async function findById(id: string): Promise<ProductRow | null> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () => svc.from(TABLE).select(COLUMNS).eq('id', id).maybeSingle(),
    { label: 'products.findById' },
  );
  if (error) throw error;
  return data as ProductRow | null;
}

export async function findByIds(ids: string[]): Promise<ProductRow[]> {
  if (ids.length === 0) return [];
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () => svc.from(TABLE).select(COLUMNS).in('id', ids),
    { label: 'products.findByIds' },
  );
  if (error) throw error;
  return (data ?? []) as ProductRow[];
}

export interface ListProductsOptions {
  restaurantId?: string;
  category?: string;
  isActive?: boolean;
  isAvailable?: boolean;
  search?: string;
  pagination?: Pagination;
  includeDeleted?: boolean;
}

export async function list(opts: ListProductsOptions = {}): Promise<PaginatedResult<ProductRow>> {
  const svc = createServiceClient();
  const q = new QueryBuilder<ProductRow>(svc.from(TABLE), { label: 'products.list' });
  q.select(COLUMNS, { count: 'exact' });

  if (opts.restaurantId) q.eq('restaurant_id', opts.restaurantId);
  if (opts.category) q.eq('category', opts.category);
  if (opts.isActive !== undefined) q.eq('is_active', opts.isActive);
  if (opts.isAvailable !== undefined) q.eq('is_available', opts.isAvailable);
  if (opts.search) q.or(`name.ilike.%${opts.search}%,description.ilike.%${opts.search}%`);

  excludeDeleted(q as any, opts.includeDeleted);
  q.orderBy('sort_order', 'asc').orderBy('name', 'asc');

  if (opts.pagination) q.paginate(opts.pagination);
  else q.limit(50);

  const { data, count, error } = await q.executeMany();
  if (error) throw error;
  return buildPaginatedResult(data, count ?? 0, opts.pagination ?? normalizePagination(undefined));
}

export async function listForRestaurant(restaurantId: string, opts: Omit<ListProductsOptions, 'restaurantId'> = {}): Promise<PaginatedResult<ProductRow>> {
  return list({ ...opts, restaurantId });
}

export async function topSellers(limit = 10): Promise<ProductRow[]> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () =>
      svc
        .from(TABLE)
        .select(COLUMNS)
        .eq('approval_status', 'approved')
        .is('archived_at', null)
        .eq('is_active', true)
        .eq('is_available', true)
        .order('total_orders', { ascending: false })
        .limit(limit),
    { label: 'products.topSellers' },
  );
  if (error) throw error;
  return (data ?? []) as ProductRow[];
}

export async function create(input: Partial<ProductRow>): Promise<ProductRow> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () =>
      svc
        .from(TABLE)
        .insert({
          ...input,
          is_active: input.is_active ?? true,
          is_available: input.is_available ?? true,
          total_orders: 0,
          sort_order: input.sort_order ?? 0,
          preparation_time_min: input.preparation_time_min ?? 15,
          created_at: new Date().toISOString(),
        })
        .select(COLUMNS)
        .single(),
    { label: 'products.create' },
  );
  if (error) throw error;
  if (!data) throw new NotFoundError('Product (after insert)');
  return data as ProductRow;
}

export async function update(id: string, patch: Partial<ProductRow>): Promise<ProductRow> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () =>
      svc
        .from(TABLE)
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select(COLUMNS)
        .single(),
    { label: 'products.update' },
  );
  if (error) throw error;
  if (!data) throw new NotFoundError('Product');
  return data as ProductRow;
}
