/**
 * Drivers Repository
 * ─────────────────
 * Canonical data access for driver-related tables:
 *  - drivers
 *  - driver_status
 *  - driver_locations
 *  - driver_working_hours
 *  - driver_payouts
 *  - driver_documents
 */

import { createServiceClient } from '@/lib/data/clients';
import { dbCall } from '@/lib/data/retry';
import { QueryBuilder, normalizePagination, buildPaginatedResult, type PaginatedResult, type Pagination } from '@/lib/data/query';
import { NotFoundError } from '@/lib/foundation';

// ── Driver profile ───────────────────────────────────────────
export interface DriverRow {
  id: string;
  user_id: string;
  vehicle_type: string;
  vehicle_plate: string | null;
  is_online: boolean;
  is_available: boolean;
  is_approved: boolean;
  rating: number;
  total_deliveries: number;
  current_lat: number | null;
  current_lng: number | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string | null;
}

const COLUMNS = 'id, user_id, vehicle_type, vehicle_plate, is_online, is_available, is_approved, rating, total_deliveries, current_lat, current_lng, last_seen_at, created_at, updated_at';

export async function findByUserId(userId: string): Promise<DriverRow | null> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () => svc.from('drivers').select(COLUMNS).eq('user_id', userId).maybeSingle(),
    { label: 'drivers.findByUserId' },
  );
  if (error) throw error;
  return data as DriverRow | null;
}

export async function findById(id: string): Promise<DriverRow | null> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () => svc.from('drivers').select(COLUMNS).eq('id', id).maybeSingle(),
    { label: 'drivers.findById' },
  );
  if (error) throw error;
  return data as DriverRow | null;
}

export async function listOnline(): Promise<DriverRow[]> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () =>
      svc
        .from('drivers')
        .select(COLUMNS)
        .eq('is_online', true)
        .eq('is_approved', true),
    { label: 'drivers.listOnline' },
  );
  if (error) throw error;
  return (data ?? []) as DriverRow[];
}

export async function listAvailableForOrder(): Promise<DriverRow[]> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () =>
      svc
        .from('drivers')
        .select(COLUMNS)
        .eq('is_online', true)
        .eq('is_available', true)
        .eq('is_approved', true),
    { label: 'drivers.listAvailableForOrder' },
  );
  if (error) throw error;
  return (data ?? []) as DriverRow[];
}

export async function updateLocation(userId: string, lat: number, lng: number): Promise<DriverRow> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () =>
      svc
        .from('drivers')
        .update({
          current_lat: lat,
          current_lng: lng,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .select(COLUMNS)
        .single(),
    { label: 'drivers.updateLocation' },
  );
  if (error) throw error;
  if (!data) throw new NotFoundError('Driver');
  return data as DriverRow;
}

export async function setOnline(userId: string, isOnline: boolean): Promise<DriverRow> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () =>
      svc
        .from('drivers')
        .update({ is_online: isOnline, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .select(COLUMNS)
        .single(),
    { label: 'drivers.setOnline' },
  );
  if (error) throw error;
  if (!data) throw new NotFoundError('Driver');
  return data as DriverRow;
}

export async function setAvailable(userId: string, isAvailable: boolean): Promise<DriverRow> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () =>
      svc
        .from('drivers')
        .update({ is_available: isAvailable, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .select(COLUMNS)
        .single(),
    { label: 'drivers.setAvailable' },
  );
  if (error) throw error;
  if (!data) throw new NotFoundError('Driver');
  return data as DriverRow;
}

// ── Driver location history ──────────────────────────────────
export interface DriverLocationRow {
  id: string;
  driver_id: string;
  lat: number;
  lng: number;
  recorded_at: string;
}

export async function recordLocation(driverId: string, lat: number, lng: number): Promise<void> {
  const svc = createServiceClient();
  const { error } = await dbCall(
    () =>
      svc.from('driver_locations').insert({
        driver_id: driverId,
        lat,
        lng,
        recorded_at: new Date().toISOString(),
      }),
    { label: 'drivers.recordLocation' },
  );
  if (error) throw error;
}

export async function getLatestLocation(driverId: string): Promise<DriverLocationRow | null> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () =>
      svc
        .from('driver_locations')
        .select('id, driver_id, lat, lng, recorded_at')
        .eq('driver_id', driverId)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    { label: 'drivers.getLatestLocation' },
  );
  if (error) throw error;
  return data as DriverLocationRow | null;
}

// ── Driver payouts ───────────────────────────────────────────
export interface DriverPayoutRow {
  id: string;
  driver_id: string;
  total_orders: number;
  total_base: number;
  total_tips: number;
  total_payout: number;
  status: 'pending' | 'processing' | 'paid' | 'failed';
  period_start: string;
  period_end: string;
  paid_at: string | null;
  created_at: string;
}

export async function listPayouts(driverId: string, pagination?: Pagination): Promise<PaginatedResult<DriverPayoutRow>> {
  const svc = createServiceClient();
  const q = new QueryBuilder<DriverPayoutRow>(svc.from('driver_payouts'), { label: 'drivers.listPayouts' });
  q.select('id, driver_id, total_orders, total_base, total_tips, total_payout, status, period_start, period_end, paid_at, created_at', { count: 'exact' });
  q.eq('driver_id', driverId);
  q.orderBy('created_at', 'desc');
  if (pagination) q.paginate(pagination);
  else q.limit(20);
  const { data, count, error } = await q.executeMany();
  if (error) throw error;
  return buildPaginatedResult(data, count ?? 0, pagination ?? normalizePagination(undefined));
}
