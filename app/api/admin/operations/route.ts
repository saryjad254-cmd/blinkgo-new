import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRole } from '@/lib/rbac';
import { getLiveKPIs } from '@/lib/services/kpi-service';
import { getBusinessIntelligence } from '@/lib/services/business-intelligence';
import { getFinanceSummary } from '@/lib/services/finance-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/operations
 * Returns combined live KPIs + BI + finance summary for the operations center.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminRole(request, 'manager');
  if (auth instanceof NextResponse) return auth;

  try {
    const [kpis, bi, finance] = await Promise.all([
      getLiveKPIs(),
      getBusinessIntelligence(),
      getFinanceSummary(),
    ]);

    return NextResponse.json({
      ok: true,
      kpis,
      bi,
      finance,
      generatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Failed to load operations' },
      { status: 500 }
    );
  }
}
