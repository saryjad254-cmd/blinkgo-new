/**
 * Data Layer: Query Helpers
 * ─────────────────────────
 * Type-safe query construction helpers.
 * Eliminates duplicate code for: pagination, sorting, filtering, soft-delete.
 */

// ── Pagination ───────────────────────────────────────────────
export interface Pagination {
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function normalizePagination(input: { page?: number; limit?: number } | undefined): Pagination {
  const page = Math.max(1, input?.page ?? 1);
  const limit = Math.min(100, Math.max(1, input?.limit ?? 20));
  return { page, limit };
}

export function buildPaginatedResult<T>(rows: T[], total: number, pagination: Pagination): PaginatedResult<T> {
  return {
    data: rows,
    total,
    page: pagination.page,
    limit: pagination.limit,
    totalPages: Math.max(1, Math.ceil(total / pagination.limit)),
  };
}

// ── Sort ──────────────────────────────────────────────────────
export type SortDirection = 'asc' | 'desc';

export interface SortSpec {
  column: string;
  direction: SortDirection;
}

export function parseSort(sort: string | undefined, allowed: readonly string[], defaultSort: SortSpec): SortSpec {
  if (!sort) return defaultSort;
  const [col, dir] = sort.split(':');
  if (!allowed.includes(col)) return defaultSort;
  return {
    column: col,
    direction: dir === 'asc' ? 'asc' : 'desc',
  };
}

// ── Filter helpers ──────────────────────────────────────────
export interface FilterMap {
  [key: string]: string | number | boolean | null | string[] | undefined;
}

// ── Soft-delete ─────────────────────────────────────────────

// ── QueryBuilder: lightweight, type-safe ────────────────────
/**
 * Result of any Supabase query.
 */
export interface SupabaseResult<T> {
  data: T | T[] | null;
  count: number | null;
  error: { code?: string; message?: string; details?: string; hint?: string; status?: number } | null;
}

/**
 * Internal type for the query chain. We use `any` here to avoid
 * coupling to PostgrestFilterBuilder's complex generics.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuery = any;

export interface QueryBuilderOptions {
  /** Label for logging */
  label?: string;
  /** Whether the query is idempotent (allows retry, default true) */
  isIdempotent?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class QueryBuilder<T = any> {
  private q: AnyQuery;
  private orderCol?: string;
  private orderDir: SortDirection = 'desc';
  private countMode: 'exact' | 'planned' | 'estimated' = 'exact';
  private asSingleMode: 'none' | 'single' | 'maybeSingle' = 'none';
  private rangeFrom?: number;
  private rangeTo?: number;
  private limitN?: number;
  private options: QueryBuilderOptions;

  constructor(initial: AnyQuery, options: QueryBuilderOptions = {}) {
    this.q = initial;
    this.options = options;
  }

  select(columns: string, count?: { count: 'exact' | 'planned' | 'estimated' }): this {
    if (count) this.countMode = count.count;
    this.q = this.q.select(columns, { count: this.countMode });
    return this;
  }

  eq(column: string, value: string | number | boolean | null): this {
    this.q = this.q.eq(column, value);
    return this;
  }

  neq(column: string, value: string | number | boolean | null): this {
    this.q = this.q.neq(column, value);
    return this;
  }

  in(column: string, values: string[] | number[]): this {
    if (values.length === 0) {
      this.q = this.eq('__noop_never_matches__', '__noop__');
    } else {
      this.q = this.q.in(column, values);
    }
    return this;
  }

  gte(column: string, value: string | number): this {
    this.q = this.q.gte(column, value);
    return this;
  }

  lte(column: string, value: string | number): this {
    this.q = this.q.lte(column, value);
    return this;
  }

  gt(column: string, value: string | number): this {
    this.q = this.q.gt(column, value);
    return this;
  }

  lt(column: string, value: string | number): this {
    this.q = this.q.lt(column, value);
    return this;
  }

  is(column: string, value: null | boolean): this {
    this.q = this.q.is(column, value);
    return this;
  }

  like(column: string, pattern: string): this {
    this.q = this.q.like(column, pattern);
    return this;
  }

  ilike(column: string, pattern: string): this {
    this.q = this.q.ilike(column, pattern);
    return this;
  }

  contains(column: string, value: unknown): this {
    this.q = this.q.contains(column, value);
    return this;
  }

  or(filter: string): this {
    this.q = this.q.or(filter);
    return this;
  }

  orderBy(column: string, direction: SortDirection = 'desc'): this {
    this.orderCol = column;
    this.orderDir = direction;
    this.q = this.q.order(column, { ascending: direction === 'asc' });
    return this;
  }

  paginate(p: Pagination): this {
    const pn = normalizePagination(p);
    this.rangeFrom = (pn.page - 1) * pn.limit;
    this.rangeTo = this.rangeFrom + pn.limit - 1;
    this.q = this.q.range(this.rangeFrom, this.rangeTo);
    return this;
  }

  range(from: number, to: number): this {
    this.rangeFrom = from;
    this.rangeTo = to;
    this.q = this.q.range(from, to);
    return this;
  }

  limit(n: number): this {
    this.limitN = n;
    this.q = this.q.limit(n);
    return this;
  }

  asSingle(): this {
    this.asSingleMode = 'single';
    this.q = this.q.single();
    return this;
  }

  asMaybeSingle(): this {
    this.asSingleMode = 'maybeSingle';
    this.q = this.q.maybeSingle();
    return this;
  }

  /** Apply soft-delete filter (excludes deleted rows by default). */
  excludeDeleted(column = SOFT_DELETE_COLUMN): this {
    this.q = this.q.is(column, null);
    return this;
  }

  /** Execute the query. */
  async execute(): Promise<SupabaseResult<T>> {
    const result = (await this.q) as SupabaseResult<T>;
    return result;
  }

  /** Execute and return data as a T[] (always an array). */
  async executeMany(): Promise<{ data: T[]; count: number | null; error: unknown }> {
    const { data, count, error } = await this.execute();
    return { data: Array.isArray(data) ? data : data ? [data] : [], count, error };
  }
}
export const SOFT_DELETE_COLUMN = 'deleted_at';

/**
 * Apply the soft-delete filter to a query (excludes deleted rows).
 * For QueryBuilder, use `.excludeDeleted()` instead.
 */
export function excludeDeleted<T>(q: T, includeDeleted: boolean = false, column: string = SOFT_DELETE_COLUMN): T {
  if (includeDeleted) return q;
  return (q as any).is(column, null);
}

// Re-export for backwards compatibility
