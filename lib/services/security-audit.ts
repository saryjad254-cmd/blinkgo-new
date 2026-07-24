/**
 * Security Audit Service
 * ──────────────────────
 * Records security-relevant events to the security_audit_log table.
 * Used for:
 *  - Compliance (GDPR, SOC2)
 *  - Incident investigation
 *  - Anomaly detection
 *  - Forensic analysis
 *
 * Events:
 *  - AUTH_SUCCESS / AUTH_FAILURE / AUTH_LOCKED
 *  - PERMISSION_DENIED
 *  - RATE_LIMITED
 *  - CSRF_BLOCKED
 *  - IDOR_ATTEMPT
 *  - SUSPICIOUS_ACTIVITY
 *  - DATA_EXPORT
 *  - ADMIN_ACTION
 *
 * All events are non-blocking (fire-and-forget).
 */

import { createServiceClient } from '@/lib/supabase/service';
import { logger } from '@/lib/logging';

export type SecurityEventType =
  | 'AUTH_SUCCESS'
  | 'AUTH_FAILURE'
  | 'AUTH_LOCKED'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'CSRF_BLOCKED'
  | 'IDOR_ATTEMPT'
  | 'SUSPICIOUS_ACTIVITY'
  | 'DATA_EXPORT'
  | 'ADMIN_ACTION'
  | 'PRIVILEGE_ESCALATION_ATTEMPT'
  | 'SQL_INJECTION_ATTEMPT'
  | 'XSS_ATTEMPT'
  | 'PATH_TRAVERSAL_ATTEMPT'
  | 'SSRF_ATTEMPT';

export interface SecurityEvent {
  eventType: SecurityEventType;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
}

/**
 * Record a security event. Non-blocking.
 * Failures are logged but do not throw.
 */
export async function logSecurityEvent(event: SecurityEvent): Promise<void> {
  try {
    const svc = createServiceClient();
    await svc.from('security_audit_log').insert({
      event_type: event.eventType,
      user_id: event.userId,
      ip_address: event.ipAddress,
      user_agent: event.userAgent,
      resource_type: event.resourceType,
      resource_id: event.resourceId,
      details: event.details || {},
    });
  } catch (e) {
    // Non-fatal — log locally
    logger.warn('Security event log failed', {
      eventType: event.eventType,
      error: (e as Error).message,
    });
  }
}

/**
 * Record a failed login attempt.
 * Includes brute force detection metadata.
 */
export async function logLoginAttempt(
  email: string,
  success: boolean,
  ipAddress?: string,
  userAgent?: string,
  failureReason?: string
): Promise<void> {
  try {
    const svc = createServiceClient();
    await svc.from('login_attempts').insert({
      email,
      ip_address: ipAddress,
      user_agent: userAgent,
      success,
      failure_reason: failureReason,
    });

    if (!success) {
      await logSecurityEvent({
        eventType: 'AUTH_FAILURE',
        ipAddress,
        userAgent,
        details: { email, reason: failureReason },
      });
    } else {
      await logSecurityEvent({
        eventType: 'AUTH_SUCCESS',
        ipAddress,
        userAgent,
        details: { email },
      });
    }
  } catch (e) {
    logger.warn('Login attempt log failed', { error: (e as Error).message });
  }
}

/**
 * Check if an email/IP has been rate-limited due to failed logins.
 * Returns the number of failed attempts in the last window.
 */
export async function getRecentFailures(
  identifier: { email?: string; ipAddress?: string },
  windowMinutes: number = 15
): Promise<number> {
  try {
    const svc = createServiceClient();
    const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

    let query = svc
      .from('login_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('success', false)
      .gte('attempted_at', since);

    if (identifier.email) {
      query = query.eq('email', identifier.email);
    } else if (identifier.ipAddress) {
      query = query.eq('ip_address', identifier.ipAddress);
    }

    const { count } = await query;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Check if an account should be locked (too many failed attempts).
 * Default: 10 failures in 15 min → locked for 30 min.
 */
export async function isAccountLocked(
  identifier: { email?: string; ipAddress?: string }
): Promise<{ locked: boolean; retryAfter?: number }> {
  const failures = await getRecentFailures(identifier, 15);
  if (failures >= 10) {
    return { locked: true, retryAfter: 30 * 60 };
  }
  return { locked: false };
}
