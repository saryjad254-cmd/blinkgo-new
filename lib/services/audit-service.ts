/**
 * Operations Audit Service
 * ─────────────────────────
 * Records admin/restaurant manual actions to the audit trail.
 * Used for compliance, debugging, and security review.
 *
 * Writes to the `notifications` table with type='audit' (reuses existing
 * notification infrastructure). For higher-volume auditing, the
 * security audit log in lib/services/audit-log.ts is preferred.
 */

import { createServiceClient } from '@/lib/supabase/service';
import { logger } from '@/lib/logging';

export interface AuditEvent {
  actorId: string;
  actorName?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log an administrative action to the audit trail.
 * Non-fatal: if the table is missing or write fails, the operation continues.
 */
export async function logAuditEvent(input: AuditEvent): Promise<void> {
  try {
    const svc = createServiceClient();
    await svc.from('notifications').insert({
      user_id: input.actorId,
      type: 'audit',
      title: input.action,
      body: input.resourceType
        ? `${input.resourceType}${input.resourceId ? `: ${input.resourceId}` : ''}`
        : undefined,
      data: {
        actor_name: input.actorName,
        action: input.action,
        resource_type: input.resourceType,
        resource_id: input.resourceId,
        ...(input.metadata || {}),
      },
      is_read: true,
    });
  } catch (e) {
    logger.warn('Failed to write audit event', {
      action: input.action,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
