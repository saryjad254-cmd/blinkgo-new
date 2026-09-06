/**
 * Addresses Repository
 * ────────────────────
 * Canonical data access for the `customer_addresses` table.
 */

import { createServiceClient } from '@/lib/data/clients';
import { dbCall } from '@/lib/data/retry';
import { QueryBuilder, normalizePagination, buildPaginatedResult, type PaginatedResult, type Pagination } from '@/lib/data/query';
import { NotFoundError } from '@/lib/foundation';

export interface AddressRow {
  id: string;
  customer_id: string;
  label: string | null;
  address: string;
  latitude: number;
  longitude: number;
  details: string | null;
  is_default: boolean;
  created_at: string;
}

const COLUMNS = 'id, customer_id, label, address, latitude, longitude, details, is_default, created_at';

export async function findById(id: string): Promise<AddressRow | null> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () => svc.from('customer_addresses').select(COLUMNS).eq('id', id).maybeSingle(),
    { label: 'addresses.findById' },
  );
  if (error) throw error;
  return data as AddressRow | null;
}

export async function listForCustomer(customerId: string, opts: { pagination?: Pagination } = {}): Promise<PaginatedResult<AddressRow>> {
  const svc = createServiceClient();
  const q = new QueryBuilder<AddressRow>(svc.from('customer_addresses'), { label: 'addresses.listForCustomer' });
  q.select(COLUMNS, { count: 'exact' });
  q.eq('customer_id', customerId);
  q.orderBy('is_default', 'desc').orderBy('created_at', 'desc');
  if (opts.pagination) q.paginate(opts.pagination);
  else q.limit(20);
  const { data, count, error } = await q.executeMany();
  if (error) throw error;
  return buildPaginatedResult(data, count ?? 0, opts.pagination ?? normalizePagination(undefined));
}

export async function getDefault(customerId: string): Promise<AddressRow | null> {
  const svc = createServiceClient();
  const { data, error } = await dbCall(
    () =>
      svc
        .from('customer_addresses')
        .select(COLUMNS)
        .eq('customer_id', customerId)
        .eq('is_default', true)
        .maybeSingle(),
    { label: 'addresses.getDefault' },
  );
  if (error) throw error;
  return data as AddressRow | null;
}

export async function create(input: Partial<AddressRow>): Promise<AddressRow> {
  const svc = createServiceClient();
  if (input.is_default) {
    // Clear other defaults
    await dbCall(
      () => svc.from('customer_addresses').update({ is_default: false }).eq('customer_id', input.customer_id!),
      { label: 'addresses.create.clearDefaults' },
    );
  }
  const { data, error } = await dbCall(
    () =>
      svc
        .from('customer_addresses')
        .insert({ ...input, is_default: input.is_default ?? false, created_at: new Date().toISOString() })
        .select(COLUMNS)
        .single(),
    { label: 'addresses.create' },
  );
  if (error) throw error;
  if (!data) throw new NotFoundError('Address');
  return data as AddressRow;
}

export async function update(id: string, patch: Partial<AddressRow>): Promise<AddressRow> {
  const svc = createServiceClient();
  if (patch.is_default && patch.customer_id) {
    await dbCall(
      () => svc.from('customer_addresses').update({ is_default: false }).eq('customer_id', patch.customer_id!),
      { label: 'addresses.update.clearDefaults' },
    );
  }
  const { data, error } = await dbCall(
    () =>
      svc
        .from('customer_addresses')
        .update(patch)
        .eq('id', id)
        .select(COLUMNS)
        .single(),
    { label: 'addresses.update' },
  );
  if (error) throw error;
  if (!data) throw new NotFoundError('Address');
  return data as AddressRow;
}

export async function softDelete(id: string): Promise<boolean> {
  const svc = createServiceClient();
  const { error } = await dbCall(
    () => svc.from('customer_addresses').delete().eq('id', id),
    { label: 'addresses.softDelete' },
  );
  return !error;
}
