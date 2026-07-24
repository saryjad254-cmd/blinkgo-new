import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRole } from '@/lib/rbac';
import { ok, fail, withErrorHandling } from '@/lib/api/response';
import { AnalyticsService } from '@/lib/services/analytics-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const auth = await requireAdminRole(request, 'manager');
    if (auth instanceof NextResponse) return auth;
    const stats = await AnalyticsService.getDashboardStats();
    return ok({ stats });
  });
}
