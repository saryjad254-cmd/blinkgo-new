/**
 * Audit Log Service
 * ─────────────────
 * Tracks security-relevant events for compliance and debugging.
 * 
 * Events tracked:
 *   - AUTH_LOGIN_SUCCESS, AUTH_LOGIN_FAILED, AUTH_LOGOUT
 *   - AUTH_REGISTER, AUTH_PASSWORD_RESET
 *   - ORDER_CREATED, ORDER_CANCELLED, ORDER_REFUNDED
 *   - DRIVER_LOCATION_UPDATE, DRIVER_ONLINE, DRIVER_OFFLINE
 *   - ADMIN_ACTION (anything from admin accounts)
 *   - PAYMENT_INITIATED, PAYMENT_COMPLETED, PAYMENT_FAILED
 *   - SECURITY_RATE_LIMIT, SECURITY_CSRF_BLOCKED
 *   - DATA_EXPORT, DATA_DELETION
 * 
 * Storage: in-memory ring buffer (default) OR database (if table exists).
 * The in-memory buffer is fast and non-blocking, suitable for real-time
 * security monitoring. Database persistence is for compliance audit trails.
 */

import { logger } from '@/lib/logging';
import { isEnabled } from '@/lib/config/env';

export type AuditSeverity = 'info' | 'warn' | 'error' | 'critical';

export type AuditEventType =
  // Auth
  | 'AUTH_LOGIN_SUCCESS'
  | 'AUTH_LOGIN_FAILED'
  | 'AUTH_LOGOUT'
  | 'AUTH_REGISTER'
  | 'AUTH_PASSWORD_RESET'
  | 'AUTH_OAUTH'
  | 'AUTH_SESSION_EXPIRED'
  // Orders
  | 'ORDER_CREATED'
  | 'ORDER_CANCELLED'
  | 'ORDER_REFUNDED'
  | 'ORDER_MODIFIED'
  | 'ORDER_STATUS_CHANGED'
  // Driver
  | 'DRIVER_LOCATION_UPDATE'
  | 'DRIVER_ONLINE'
  | 'DRIVER_OFFLINE'
  | 'DRIVER_ACCEPTED_ORDER'
  | 'DRIVER_PICKED_UP'
  | 'DRIVER_DELIVERED'
  // Payment
  | 'PAYMENT_INITIATED'
  | 'PAYMENT_COMPLETED'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_REFUNDED'
  // Security
  | 'SECURITY_RATE_LIMIT'
  | 'SECURITY_CSRF_BLOCKED'
  | 'SECURITY_SUSPICIOUS_ACTIVITY'
  | 'SECURITY_UNAUTHORIZED_ACCESS'
  // Admin
  | 'ADMIN_USER_CREATED'
  | 'ADMIN_USER_UPDATED'
  | 'ADMIN_USER_DELETED'
  | 'ADMIN_CONFIG_CHANGED'
  // Data
  | 'DATA_EXPORT'
  | 'DATA_DELETION';

export interface AuditEvent {
  id: string;
  type: AuditEventType;
  severity: AuditSeverity;
  timestamp: string;
  userId?: string;
  userEmail?: string;
  userRole?: string;
  ip?: string;
  userAgent?: string;
  resource?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

/**
 * In-memory ring buffer for fast access.
 * Default: 10,000 most recent events.
 */
const MAX_EVENTS = 10_000;
const ringBuffer: AuditEvent[] = [];

let dbClient: any = null;
let dbTableAvailable: boolean | null = null;

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Try to get the database client (lazy loaded)
 */
async function getDbClient(): Promise<any> {
  if (dbClient !== null) return dbClient;
  try {
    const { createServiceClient } = await import('@/lib/supabase/service');
    dbClient = createServiceClient();
    return dbClient;
  } catch {
    return null;
  }
}

/**
 * Log an audit event.
 * Non-blocking - never throws.
 */
export async function audit(
  type: AuditEventType,
  data: {
    severity?: AuditSeverity;
    userId?: string;
    userEmail?: string;
    userRole?: string;
    ip?: string;
    userAgent?: string;
    resource?: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
    error?: string;
  } = {}
): Promise<void> {
  if (!isEnabled('audit')) return;
  
  const event: AuditEvent = {
    id: generateId(),
    type,
    severity: data.severity ?? 'info',
    timestamp: new Date().toISOString(),
    userId: data.userId,
    userEmail: data.userEmail,
    userRole: data.userRole,
    ip: data.ip,
    userAgent: data.userAgent,
    resource: data.resource,
    resourceId: data.resourceId,
    metadata: data.metadata,
    error: data.error,
  };
  
  // Always add to in-memory ring buffer
  ringBuffer.push(event);
  if (ringBuffer.length > MAX_EVENTS) {
    ringBuffer.shift();
  }
  
  // Log to console
  const logFn = event.severity === 'critical' || event.severity === 'error'
    ? logger.error
    : event.severity === 'warn'
    ? logger.warn
    : logger.info;
  logFn(`[AUDIT] ${event.type}`, {
    userId: event.userId,
    resource: event.resource,
    resourceId: event.resourceId,
    ...(event.error && { error: event.error }),
  });
  
  // Best-effort DB write (don't await, don't fail)
  void persistToDb(event);
}

async function persistToDb(event: AuditEvent): Promise<void> {
  if (dbTableAvailable === false) return;
  const client = await getDbClient();
  if (!client) return;
  
  try {
    const { error } = await client
      .from('audit_log')
      .insert({
        event_type: event.type,
        severity: event.severity,
        user_id: event.userId,
        user_email: event.userEmail,
        user_role: event.userRole,
        ip_address: event.ip,
        user_agent: event.userAgent,
        resource: event.resource,
        resource_id: event.resourceId,
        metadata: event.metadata,
        error_message: event.error,
        created_at: event.timestamp,
      });
    
    if (error && (error.code === 'PGRST205' || error.message.includes('does not exist'))) {
      dbTableAvailable = false; // Don't try again
    }
  } catch {
    dbTableAvailable = false;
  }
}

/**
 * Get recent audit events (from in-memory buffer).
 * Use for admin dashboards or security monitoring.
 */
export function getRecentEvents(limit: number = 100, type?: AuditEventType): AuditEvent[] {
  const events = type
    ? ringBuffer.filter((e) => e.type === type)
    : ringBuffer;
  return events.slice(-limit).reverse();
}

/**
 * Get events for a specific user.
 */
export function getEventsForUser(userId: string, limit: number = 50): AuditEvent[] {
  return ringBuffer.filter((e) => e.userId === userId).slice(-limit).reverse();
}

/**
 * Clear the in-memory buffer.
 * Admin use only.
 */
export function clearAuditBuffer(): void {
  ringBuffer.length = 0;
}
