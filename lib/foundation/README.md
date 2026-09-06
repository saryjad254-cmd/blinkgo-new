# Foundation Layer (`lib/foundation/`)

The Foundation layer is the bedrock of BlinkGo's production architecture.
Every other module builds on it. It is the only layer with **zero dependencies
on the rest of the app** — it's a self-contained, battle-tested utility belt.

## Why a foundation?

BlinkGo v65-onwards has accumulated **40+ error classes**, **20+ ad-hoc logger
implementations**, **4 different cookie helpers**, **3 different response
builders**, and a chaotic mix of validation strategies. Foundation replaces all
of that with **one canonical implementation** of each concern, all
strongly-typed, all well-tested, all with a stable API.

## Modules

| Module | Purpose | Replaces |
|--------|---------|----------|
| [`types.ts`](./types.ts) | Branded ID types, `Result`, `Role`, `Locale`, `Cents`, `ISODate`, `LatLng`, `AppErrorShape` | ad-hoc type aliases scattered across `lib/` |
| [`errors.ts`](./errors.ts) | `AppError` hierarchy (11 subclasses + 3 domain-specific) | `lib/errors.ts` (40+ error classes), all `Error` throws |
| [`result.ts`](./result.ts) | `Result<T, E>` for expected failures | try/catch noise for business logic |
| [`logger.ts`](./logger.ts) | Structured `Logger` with child loggers, levels, JSON output | ad-hoc `console.log/warn/error`, `lib/logger.ts` |
| [`env.ts`](./env.ts) | Typed, validated `process.env` access via `env` proxy | bare `process.env.X` everywhere |
| [`cache.ts`](./cache.ts) | Typed `Cache` with TTL + SWR, `cacheKeys` namespace | ad-hoc Map caches, no TTL |
| [`response.ts`](./response.ts) | `ok()`, `fail()`, `withErrorHandling()`, `newRequestId()` | scattered `NextResponse.json` calls |
| [`format.ts`](./format.ts) | `isRTL()`, `formatDate/Time/DateTime`, `relativeTime` | `new Date().toLocaleString()` |
| [`http.ts`](./http.ts) | `buildCookie`, `parseCookies`, `getClientIp`, `isTrustedOrigin` | 4 different cookie helpers, naive CSRF |
| [`zod-mini.ts`](./zod-mini.ts) | Tiny (300 LOC) validation library | full Zod (heavy dep), ad-hoc validation |
| [`api-handler.ts`](./api-handler.ts) | `apiHandler()` — single wrapper for auth, rate limit, CSRF, role check, error handling | `withSecurity + secureRoute + withErrorHandling + requireApiRole + manual` |

## Quick Start

```ts
// Old way (scattered, untyped)
import { NextResponse } from 'next/server';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { requireApiRole } from '@/lib/auth-helper';
import { ValidationError } from '@/lib/errors';

export async function POST(req: NextRequest) {
  return withSecurity(secureRoute('lenient', ['admin']), async () => {
    try {
      const user = await requireApiRole(['admin']);
      const body = await req.json();
      if (!body.name) throw new ValidationError('name required');
      // ... do work
      return NextResponse.json({ ok: true, data: result });
    } catch (e) {
      return NextResponse.json({ ok: false, error: ... }, { status: 500 });
    }
  })(req);
}
```

```ts
// Foundation way (typed, concise, uniform)
import { apiHandler, ok, fail, ValidationError, z } from '@/lib/foundation';

export const POST = apiHandler({
  method: 'POST',
  auth: true,
  roles: ['admin'],
  rateLimit: { name: 'admin-write', limit: 30, windowSec: 60 },
  bodySchema: z.object({
    name: z.string().min(1),
  }).parse.bind(z.object({ name: z.string().min(1) })),
  handler: async ({ user, requestId }, body) => {
    if (!body.name) return fail(new ValidationError('name required'));
    const result = await doWork(body);
    return ok(result);
  },
});
```

## Principles

1. **Strong types, zero `any`**: every public surface is typed. Branded types for
   IDs (`UserId`, `OrderId`) prevent cross-assignment errors.

2. **Zero dependencies on app code**: Foundation depends only on Next.js,
   node:crypto, and Intl. It can be lifted out and reused in any other
   project.

3. **Fail closed**: all error paths default to the safe side. A missing env
   var crashes the app in production. A bad cookie signature returns 401.

4. **No `console.*` for production**: use the `Logger` interface. In dev
   it's pretty; in prod it's structured JSON.

5. **Errors as values, not exceptions**: `Result<T, E>` for expected failures,
   `AppError` for programmer errors and unexpected failures.

6. **No magic**: explicit imports, no global side effects, no
   `initFoundation()` boilerplate.

## Migration

Migration is incremental. Each module can be adopted independently:

- Replace `import { ValidationError } from '@/lib/errors'` → `from '@/lib/foundation'`
- Replace `process.env.X` → `env.X`
- Replace `console.log('msg', data)` → `log.info('msg', data)`
- Replace `NextResponse.json({ ok: true, data })` → `ok(data)`

Once a route uses `apiHandler()` + `ok()` + `fail()` + `z.object()` schema,
it no longer touches the legacy `withSecurity` / `secureRoute` / `requireApiRole`
stack. New routes should use the foundation API exclusively.
