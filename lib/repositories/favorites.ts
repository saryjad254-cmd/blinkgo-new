/**
 * Favorites Repository
 * ────────────────────
 * Canonical data access for the `favorites` table.
 */

import { createServiceClient } from '@/lib/data/clients';
import { dbCall } from '@/lib/data/retry';

export interface FavoriteRow {
  id: string;
  customer_id: string;
  restaurant_id: string;
  created_at: string;
}

const COLUMNS = 'id, customer_id, restaurant_id, created_at';

export async function listForCustomer(customerId: string): Promise<FavoriteRow[]> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () => svc.from('favorites').select(COLUMNS).eq('customer_id', customerId).order('created_at', { ascending: false }),
    { label: 'favorites.listForCustomer' },
  );
  if (error) throw error;
  return (data ?? []) as FavoriteRow[];
}

export async function isFavorite(customerId: string, restaurantId: string): Promise<boolean> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () =>
      svc
        .from('favorites')
        .select('id')
        .eq('customer_id', customerId)
        .eq('restaurant_id', restaurantId)
        .maybeSingle(),
    { label: 'favorites.isFavorite' },
  );
  if (error) throw error;
  return !!data;
}

export async function add(customerId: string, restaurantId: string): Promise<FavoriteRow | null> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () =>
      svc
        .from('favorites')
        .upsert(
          { customer_id: customerId, restaurant_id: restaurantId, created_at: new Date().toISOString() },
          { onConflict: 'customer_id,restaurant_id' },
        )
        .select(COLUMNS)
        .maybeSingle(),
    { label: 'favorites.add' },
  );
  if (error) throw error;
  return data as FavoriteRow | null;
}

export async function remove(customerId: string, restaurantId: string): Promise<boolean> {
  const svc = createServiceClient();
  const { error } = await dbCall(
    () => svc.from('favorites').delete().eq('customer_id', customerId).eq('restaurant_id', restaurantId),
    { label: 'favorites.remove' },
  );
  return !error;
}
