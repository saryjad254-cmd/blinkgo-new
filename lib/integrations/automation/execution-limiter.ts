export class AutomationExecutionLimiter {
  private readonly executions = new Map<string, number[]>();

  canExecute(ruleId: string, maxPerHour?: number | null, cooldownMinutes?: number | null, now = Date.now()): boolean {
    const recent = this.recent(ruleId, now);
    if (maxPerHour && recent.length >= maxPerHour) return false;
    const lastExecution = recent.at(-1);
    if (cooldownMinutes && lastExecution && now - lastExecution < cooldownMinutes * 60 * 1000) return false;
    return true;
  }

  record(ruleId: string, now = Date.now()): void {
    const recent = this.recent(ruleId, now);
    recent.push(now);
    this.executions.set(ruleId, recent);
  }

  private recent(ruleId: string, now: number): number[] {
    const cutoff = now - 60 * 60 * 1000;
    const recent = (this.executions.get(ruleId) || []).filter((timestamp) => timestamp > cutoff && timestamp <= now);
    this.executions.set(ruleId, recent);
    return recent;
  }
}
