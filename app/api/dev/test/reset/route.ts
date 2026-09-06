import { NextRequest, NextResponse } from 'next/server';
import { clearRateLimits } from '@/lib/rate-limit';
import { resetInMemoryRateLimits } from '@/lib/services/payment-rate-limit';
import { isLocalTestHarnessRequest } from '@/lib/dev/local-endpoints';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STAGING_DEMO_DRIVER_ID = 'b1000000-0000-4000-8000-000000000102';
const ACTIVE_ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'assigned', 'picked_up', 'delivering'];

function testAccountEmails(): string[] {
  return [
    process.env.DEMO_CUSTOMER_EMAIL,
    process.env.DEMO_DRIVER_EMAIL,
    process.env.DEMO_RESTAURANT_EMAIL,
    process.env.DEMO_ADMIN_EMAIL,
  ].filter((email): email is string => typeof email === 'string' && email.trim().length > 0);
}

async function ensureStagingDriverSchedule() {
  if (!process.env.BLINKGO_STAGING_PROJECT_REF) return;
  const supabase = createServiceClient();
  const rows = Array.from({ length: 7 }, (_, dayOfWeek) => ({
    driver_id: STAGING_DEMO_DRIVER_ID,
    day_of_week: dayOfWeek,
    start_time: '00:00:00',
    end_time: '23:59:00',
    is_enabled: true,
  }));
  const { error } = await supabase
    .from('driver_working_hours')
    .upsert(rows, { onConflict: 'driver_id,day_of_week' });
  if (error) throw error;
}

async function resetTestAccountOperations() {
  const supabase = createServiceClient();
  const { data: accounts, error: accountsError } = await supabase
    .from('users')
    .select('id, email, role');
  if (accountsError) throw accountsError;
  const allowedEmails = new Set(testAccountEmails().map((email) => email.toLowerCase()));
  const testAccounts = (accounts ?? []).filter((account) => (
    typeof account.email === 'string' && allowedEmails.has(account.email.toLowerCase())
  ));

  const customerIds = testAccounts
    .filter((account) => account.role === 'customer')
    .map((account) => account.id);
  const driverUserIds = testAccounts
    .filter((account) => account.role === 'driver')
    .map((account) => account.id);
  const { data: driverRows, error: driversError } = driverUserIds.length > 0
    ? await supabase.from('drivers').select('id').in('user_id', driverUserIds)
    : { data: [], error: null };
  if (driversError) throw driversError;
  const driverIds = (driverRows ?? []).map((driver) => driver.id);
  const now = new Date().toISOString();
  const cancellation = {
    status: 'cancelled',
    cancelled_at: now,
    cancellation_reason: 'local_test_harness_reset',
    updated_at: now,
  };

  if (customerIds.length > 0) {
    const { error } = await supabase
      .from('orders')
      .update(cancellation)
      .in('customer_id', customerIds)
      .in('status', ACTIVE_ORDER_STATUSES);
    if (error) throw error;
  }
  if (driverIds.length > 0) {
    const { error: orderError } = await supabase
      .from('orders')
      .update(cancellation)
      .in('driver_id', driverIds)
      .in('status', ACTIVE_ORDER_STATUSES);
    if (orderError) throw orderError;

    const { error: statusError } = await supabase
      .from('driver_status')
      .update({
        is_online: false,
        is_on_delivery: false,
        current_order_id: null,
        active_order_id: null,
        updated_at: now,
      })
      .in('driver_id', driverIds);
    if (statusError) throw statusError;
  }
}

export async function POST(request: NextRequest) {
  // Production builds are used for local acceptance/performance testing too.
  // Keep this endpoint closed by default and only allow it when the operator
  // explicitly enables the local harness while using a loopback request and
  // either a loopback backend or the exact configured staging project. A
  // deployed production environment therefore cannot expose the reset even if
  // a caller spoofs the Host header.
  if (!isLocalTestHarnessRequest(request)) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  clearRateLimits();
  resetInMemoryRateLimits();
  await resetTestAccountOperations();
  await ensureStagingDriverSchedule();
  return NextResponse.json({ ok: true });
}
