/**
 * Audit Trail Library
 * ───────────────────
 * Records all admin actions to the audit_log table.
 * Falls back to in-memory ring buffer if table missing.
 */

interface AuditEntry {
  id: string;
  actor_id: string;
  actor_email?: string;
  action: string;
  target_type: string;
  target_id: string;
  metadata?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

const inMemoryLog: AuditEntry[] = [];
const MAX_INMEM = 1000;

export interface AuditInput {
  actor_id: string;
  action: string;
  target_type: string;
  target_id: string;
  metadata?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
}

export async function recordAudit(input: AuditInput): Promise<void> {
  const entry: AuditEntry = {
    id: crypto.randomUUID(),
    actor_id: input.actor_id,
    action: input.action,
    target_type: input.target_type,
    target_id: input.target_id,
    metadata: input.metadata,
    ip_address: input.ip_address,
    user_agent: input.user_agent,
    created_at: new Date().toISOString(),
  };

  // Always keep in-memory
  inMemoryLog.push(entry);
  if (inMemoryLog.length > MAX_INMEM) inMemoryLog.shift();

  // Try to persist
  try {
    const { createServiceClient } = await import('@/lib/supabase/service');
    const db = createServiceClient();
    await db.from('audit_log').insert({
      actor_id: entry.actor_id,
      action: entry.action,
      target_type: entry.target_type,
      target_id: entry.target_id,
      metadata: entry.metadata,
      ip_address: entry.ip_address,
      user_agent: entry.user_agent,
      created_at: entry.created_at,
    });
  } catch {
    // Table missing or write failed - keep in-memory
  }
}

export async function getAuditLog(filters: {
  limit?: number;
  offset?: number;
  actor_id?: string;
  action?: string;
  target_type?: string;
}): Promise<{ entries: AuditEntry[]; total: number; source: 'db' | 'memory' }> {
  const limit = filters.limit ?? 100;
  const offset = filters.offset ?? 0;

  try {
    const { createServiceClient } = await import('@/lib/supabase/service');
    const db = createServiceClient();
    let q = db.from('audit_log').select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (filters.actor_id) q = q.eq('actor_id', filters.actor_id);
    if (filters.action) q = q.eq('action', filters.action);
    if (filters.target_type) q = q.eq('target_type', filters.target_type);
    const { data, count } = await q;
    if (data) return { entries: data, total: count ?? data.length, source: 'db' };
  } catch {}

  // Fallback to in-memory
  let filtered = [...inMemoryLog].reverse();
  if (filters.actor_id) filtered = filtered.filter((e) => e.actor_id === filters.actor_id);
  if (filters.action) filtered = filtered.filter((e) => e.action === filters.action);
  if (filters.target_type) filtered = filtered.filter((e) => e.target_type === filters.target_type);
  return {
    entries: filtered.slice(offset, offset + limit),
    total: filtered.length,
    source: 'memory',
  };
}
