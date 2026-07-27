/**
 * Background Job Scheduler
 * ────────────────────────
 * Production scheduler for recurring jobs.
 * - Cleanup
 * - Daily reports
 * - Analytics aggregation
 * - Backup verification
 * - Notification retry
 * - Cache cleanup
 */

import { createServiceClient } from '@/lib/supabase/service';

export interface Job {
  id: string;
  name: string;
  description?: string;
  schedule: string;
  enabled: boolean;
  last_run_at?: string;
  next_run_at?: string;
  last_status?: 'success' | 'failed';
  last_error?: string;
  run_count: number;
  failure_count: number;
  avg_duration_ms?: number;
  payload?: Record<string, any>;
}

export interface JobRunResult {
  job_id: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  status: 'success' | 'failed';
  error?: string;
  result?: any;
}

export type JobHandler = (job: Job) => Promise<any>;

export class JobScheduler {
  private handlers: Map<string, JobHandler> = new Map();
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  register(name: string, handler: JobHandler): void {
    this.handlers.set(name, handler);
  }

  async schedule(input: Omit<Job, 'id' | 'last_run_at' | 'next_run_at' | 'last_status' | 'last_error' | 'run_count' | 'failure_count' | 'avg_duration_ms'>): Promise<Job | null> {
    try {
      const db = createServiceClient();
      const { data: existing } = await db.from('jobs').select('*').eq('name', input.name).single();
      if (existing) {
        const { data } = await db.from('jobs').update({
          ...input,
          next_run_at: this.computeNextRun(input.schedule),
        }).eq('id', existing.id).select().single();
        return data as Job;
      }
      const { data, error } = await db.from('jobs').insert({
        ...input,
        run_count: 0,
        failure_count: 0,
        next_run_at: this.computeNextRun(input.schedule),
      }).select().single();
      if (error) return null;
      return data as Job;
    } catch {
      return null;
    }
  }

  async runNow(jobId: string): Promise<JobRunResult | null> {
    const db = createServiceClient();
    const { data: job } = await db.from('jobs').select('*').eq('id', jobId).single();
    if (!job) return null;
    return this.execute(job as Job);
  }

  async runDue(): Promise<JobRunResult[]> {
    const db = createServiceClient();
    const now = new Date().toISOString();
    const { data: dueJobs } = await db.from('jobs').select('*').eq('enabled', true).lte('next_run_at', now);
    if (!dueJobs) return [];
    const results: JobRunResult[] = [];
    for (const job of dueJobs) {
      const result = await this.execute(job as Job);
      results.push(result);
    }
    return results;
  }

  private async execute(job: Job): Promise<JobRunResult> {
    const handler = this.handlers.get(job.name);
    const startedAt = new Date();
    if (!handler) {
      const failed: JobRunResult = {
        job_id: job.id,
        started_at: startedAt.toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: 0,
        status: 'failed',
        error: 'No handler registered',
      };
      await this.recordRun(job, failed);
      return failed;
    }
    try {
      const result = await handler(job);
      const completedAt = new Date();
      const success: JobRunResult = {
        job_id: job.id,
        started_at: startedAt.toISOString(),
        completed_at: completedAt.toISOString(),
        duration_ms: completedAt.getTime() - startedAt.getTime(),
        status: 'success',
        result,
      };
      await this.recordRun(job, success);
      return success;
    } catch (e: any) {
      const completedAt = new Date();
      const failed: JobRunResult = {
        job_id: job.id,
        started_at: startedAt.toISOString(),
        completed_at: completedAt.toISOString(),
        duration_ms: completedAt.getTime() - startedAt.getTime(),
        status: 'failed',
        error: e.message,
      };
      await this.recordRun(job, failed);
      return failed;
    }
  }

  private async recordRun(job: Job, result: JobRunResult): Promise<void> {
    const db = createServiceClient();
    const updates: any = {
      last_run_at: result.completed_at,
      last_status: result.status,
      last_error: result.error,
      run_count: job.run_count + 1,
      next_run_at: this.computeNextRun(job.schedule),
    };
    if (result.status === 'failed') updates.failure_count = job.failure_count + 1;
    if (job.avg_duration_ms) {
      updates.avg_duration_ms = Math.round((job.avg_duration_ms + result.duration_ms) / 2);
    } else {
      updates.avg_duration_ms = result.duration_ms;
    }
    await db.from('jobs').update(updates).eq('id', job.id);
    try {
      await db.from('job_runs').insert(result);
    } catch {
      // job_runs table may not exist
    }
  }

  start(intervalMs: number = 60_000): void {
    if (this.intervalHandle) return;
    this.intervalHandle = setInterval(async () => {
      try {
        await this.runDue();
      } catch (e) {
        console.error('[scheduler] tick error', e);
      }
    }, intervalMs);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  computeNextRun(cron: string): string {
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) {
      return new Date(Date.now() + 60 * 60 * 1000).toISOString();
    }
    const minute = parts[0];
    if (minute.startsWith('*/')) {
      const n = parseInt(minute.substring(2), 10);
      return new Date(Date.now() + n * 60 * 1000).toISOString();
    }
    const targetMin = parseInt(parts[0], 10);
    const targetHour = parseInt(parts[1], 10);
    const now = new Date();
    const next = new Date(now);
    next.setHours(targetHour, targetMin, 0, 0);
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
    return next.toISOString();
  }
}

let _scheduler: JobScheduler | null = null;
export function getJobScheduler(): JobScheduler {
  if (!_scheduler) _scheduler = new JobScheduler();
  return _scheduler;
}
