import { requireRole } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { AdminDriversClient, type AdminDriverRecord, type DriverDocumentRecord } from '@/components/admin/AdminDriversClient';
import { latestDocumentStatuses, requiredDriverDocuments } from '@/lib/driver/verification';
import { listLocalDriverDocuments } from '@/lib/driver/local-document-store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface DriverUserRow {
  id: string; name: string | null; email: string | null; phone: string | null;
  is_active: boolean | null; is_verified: boolean | null; created_at: string | null;
}
interface DriverProfileRow {
  id: string; user_id: string | null; vehicle_type: string | null; vehicle_plate: string | null;
  city: string | null; rating: number | string | null; total_deliveries: number | string | null;
  is_online: boolean | null; is_available: boolean | null; last_active_at: string | null;
}
interface DriverStatusRow {
  driver_id: string; is_online: boolean | null; is_on_delivery: boolean | null; current_order_id: string | null;
}

async function loadDrivers() {
  const supabase = createServiceClient();
  const [usersResult, profilesResult, statusesResult, documentsResult] = await Promise.all([
    supabase.from('users').select('id, name, email, phone, is_active, is_verified, created_at').eq('role', 'driver').order('created_at', { ascending: false }).limit(500),
    supabase.from('drivers').select('id, user_id, vehicle_type, vehicle_plate, city, rating, total_deliveries, is_online, is_available, last_active_at').limit(500),
    supabase.from('driver_status').select('driver_id, is_online, is_on_delivery, current_order_id').limit(500),
    supabase.from('driver_documents').select('id,driver_id,document_type,document_number,expires_at,status,rejection_reason,uploaded_at,reviewed_at,submission_kind').order('uploaded_at', { ascending: false }).limit(2000),
  ]);

  const profiles = (profilesResult.data || []) as DriverProfileRow[];
  const statuses = (statusesResult.data || []) as DriverStatusRow[];
  const databaseDocuments = (documentsResult.data || []) as DriverDocumentRecord[];
  const usesLocalSupabaseMock = /localhost|127\.0\.0\.1/.test(process.env.NEXT_PUBLIC_SUPABASE_URL || '');
  const localDocuments = usesLocalSupabaseMock
    ? listLocalDriverDocuments().map((document) => ({ ...document })) as DriverDocumentRecord[]
    : [];
  const documentRows = [...databaseDocuments, ...localDocuments]
    .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
  const users = (usersResult.data || []) as DriverUserRow[];
  const profileByUser = new Map(profiles.map((profile) => [profile.user_id || profile.id, profile]));
  const statusByUser = new Map(statuses.map((status) => [status.driver_id, status]));
  const documentsByUser = new Map<string, DriverDocumentRecord[]>();
  for (const document of documentRows) {
    const bucket = documentsByUser.get(document.driver_id) || [];
    bucket.push(document);
    documentsByUser.set(document.driver_id, bucket);
  }
  const drivers: AdminDriverRecord[] = users.map((user) => {
    const profile = profileByUser.get(user.id);
    const live = statusByUser.get(user.id);
    const documents = documentsByUser.get(user.id) || [];
    const requiredDocuments = requiredDriverDocuments(profile?.vehicle_type);
    const latestStatuses = latestDocumentStatuses(documents);
    const approvedDocuments = requiredDocuments.filter((type) => latestStatuses.get(type) === 'approved').length;
    const operationallyVerified = requiredDocuments.length > 0 && approvedDocuments === requiredDocuments.length;
    const reportedOnline = typeof live?.is_online === 'boolean' ? live.is_online : Boolean(profile?.is_online);
    const isOnline = operationallyVerified && reportedOnline;
    const isAvailable = isOnline && !(live?.is_on_delivery ?? false) && !(live?.current_order_id ?? null);
    return {
      id: user.id,
      profile_id: profile?.id || null,
      name: user.name,
      email: user.email,
      phone: user.phone,
      is_active: user.is_active !== false,
      is_verified: operationallyVerified,
      created_at: user.created_at,
      vehicle_type: profile?.vehicle_type || null,
      vehicle_plate: profile?.vehicle_plate || null,
      city: profile?.city || null,
      rating: Number(profile?.rating || 0),
      total_deliveries: Number(profile?.total_deliveries || 0),
      last_active_at: profile?.last_active_at || null,
      is_online: isOnline,
      is_available: isAvailable,
      is_on_delivery: operationallyVerified && Boolean(live?.is_on_delivery),
      required_documents: requiredDocuments,
      approved_documents: approvedDocuments,
      documents,
    };
  });

  const ratings = drivers.map((driver) => driver.rating).filter((rating) => rating > 0);
  return {
    drivers,
    stats: {
      total: drivers.length,
      active: drivers.filter((driver) => driver.is_active).length,
      online: drivers.filter((driver) => driver.is_online).length,
      available: drivers.filter((driver) => driver.is_available).length,
      avgRating: ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : 0,
    },
  };
}

export default async function AdminDriversPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireRole('admin');
  const data = await loadDrivers();
  const { q = '' } = await searchParams;
  return <AdminDriversClient initialDrivers={data.drivers} initialSearch={q.slice(0, 100)} stats={data.stats} userName={user.name || user.email || 'Admin'} />;
}
