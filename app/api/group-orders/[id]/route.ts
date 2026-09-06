import { NextRequest, NextResponse } from 'next/server';
import { secureRoute } from '@/lib/api/security-helpers';
import { withSecurity } from '@/lib/api/security';
import { ok } from '@/lib/api/response';
import { NotFoundError } from '@/lib/errors';
import { isValidUuid } from '@/lib/validation';
import { loadGroupForUser } from '@/lib/group-orders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return (await withSecurity(
    secureRoute('lenient', ['customer']),
    async (ctx) => {
      const { id } = await params;
      if (!isValidUuid(id)) throw new NotFoundError('Group order');
      const data = await loadGroupForUser(id, ctx.auth.user.id);
      if (!data) throw new NotFoundError('Group order');
      return ok(data);
    },
  )(req)) as unknown as NextResponse;
}
