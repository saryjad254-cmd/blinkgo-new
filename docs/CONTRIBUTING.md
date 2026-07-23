# Contributing to BlinkGo

Thank you for your interest in contributing! This document covers the development workflow, code style, and PR process.

## Code of Conduct

- Be respectful and inclusive
- Welcome newcomers
- Focus on constructive feedback
- Assume good intent

## Development Workflow

### 1. Set Up

```bash
git clone <repo>
cd blinkgo
npm install
cp .env.example .env
# Fill in .env values
```

### 2. Create a Branch

```bash
git checkout -b feature/your-feature
# or
git checkout -b fix/bug-description
```

### Branch Naming
- `feature/...` — New features
- `fix/...` — Bug fixes
- `refactor/...` — Code refactoring
- `docs/...` — Documentation only
- `test/...` — Test improvements
- `chore/...` — Tooling, deps

### 3. Develop

- Write code following [Code Style](#code-style)
- Add tests for new features
- Update documentation
- Run checks before commit:
  ```bash
  npm run typecheck
  npm run lint
  node scripts/run-all-tests.js
  ```

### 4. Commit

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add loyalty tier system
fix: resolve driver GPS race condition
refactor: extract coupon validation to service
docs: update API documentation
test: add driver stress test cases
chore: upgrade Next.js to 14.2.16
```

### 5. Push & PR

```bash
git push origin your-branch
```

Open a PR on GitHub with:
- Clear title
- Description of what & why
- Link to related issue (if any)
- Screenshots for UI changes

---

## Code Style

### TypeScript

- **Strict mode** — No `any` in business logic
- Prefer `type` over `interface` for object types (unless extending)
- Use `readonly` for immutable data
- No magic numbers — extract to constants
- Use Zod for runtime validation

### React

- **Server Components by default**
- Use `'use client'` only when:
  - Using hooks (useState, useEffect, etc.)
  - Using browser APIs
  - Using event handlers
- Co-locate component-specific types
- Use the `cn()` helper for classNames

### File Naming

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `LoginForm.tsx` |
| Hooks | camelCase with `use` prefix | `useDriverApp.ts` |
| Services | kebab-case | `order-service.ts` |
| Utilities | camelCase | `format.ts` |
| Types | PascalCase | `Order` |

### Imports

Use the `@/` alias:

```typescript
// ✅ Good
import { Button } from '@/components/ui/Button';
import { OrderService } from '@/lib/services/order-service';

// ❌ Avoid
import { Button } from '../../../components/ui/Button';
```

Order imports:
1. External packages
2. Internal `@/` imports (alphabetical)
3. Relative imports
4. Types (separated)

```typescript
import { useState } from 'react';
import { z } from 'zod';

import { Button } from '@/components/ui/Button';
import { OrderService } from '@/lib/services/order-service';
import type { Order } from '@/lib/types';

import { LocalComponent } from './LocalComponent';
```

### Error Handling

Use the `AppError` hierarchy:

```typescript
import { NotFoundError, ValidationError, withErrorHandling } from '@/lib/errors';

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const body = OrderSchema.parse(await req.json());  // throws ValidationError
    
    const order = await OrderService.create(body);
    if (!order) throw new NotFoundError('Restaurant');
    
    return ok({ order });
  });
}
```

### Comments

- Use JSDoc for public APIs
- Inline comments for "why", not "what"
- TODO comments with author + date
- No commented-out code (delete it)

```typescript
/**
 * Compute driver earnings for an order.
 * Includes base pay, tip, and bonuses.
 */
export function computeEarnings(order: Order): Earnings {
  // Tip is 100% to driver; base pay is set by restaurant
  const base = order.commission * 0.7;
  const tip = order.tip;
  return { base, tip, total: base + tip };
}
```

---

## Testing

### Test Types

| Type | Tool | When |
|------|------|------|
| Integration | Custom Node.js scripts | Every feature |
| Unit (services) | Via integration | Service functions |
| E2E | Lifecycle script | Critical paths |

### Writing Tests

Use the `f()` helper for HTTP calls:

```javascript
async function f(path, init = {}, opts = {}) {
  const headers = { 
    'Content-Type': 'application/json', 
    'Origin': 'http://localhost:3000',
    ...(init.headers || {}) 
  };
  if (Object.keys(COOKIES).length > 0) {
    headers['Cookie'] = cookieHeader();
  }
  const res = await fetch(BASE + path, { ...init, headers });
  if (opts.captureCookies !== false) setCookies(res.headers);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { _raw: text?.slice(0, 200) }; }
  return { status: res.status, ok: res.ok, json };
}
```

Test pattern:

```javascript
async function testFeature() {
  await login('customer');
  
  const result = await f('/api/orders', {
    method: 'POST',
    body: JSON.stringify({ /* ... */ }),
  });
  
  record('Order created', result.ok && result.json?.data?.order?.id);
  record('Total is correct', result.json?.data?.order?.total > 0, `total=${result.json?.data?.order?.total}`);
}
```

### Add to Runner

Add your test to `scripts/run-all-tests.js`:

```javascript
const SUITES = [
  // ...
  { name: 'My Feature', file: 'my-feature-test.js', count: 10 },
];
```

---

## Code Review

### For Authors

- Self-review before requesting
- Keep PRs small (< 400 lines)
- One concern per PR
- Address review comments promptly
- Update tests and docs

### For Reviewers

- Review within 24 hours
- Be specific and constructive
- Approve when ready, don't nitpick style
- Test locally if behavior change

### Review Checklist

- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No new TypeScript errors
- [ ] No security implications
- [ ] No performance regression
- [ ] Backwards compatible (or migration documented)
- [ ] Error handling is appropriate
- [ ] No `console.log` of sensitive data
- [ ] No hardcoded secrets

---

## Release Process

### Versioning

[Semantic Versioning](https://semver.org/):
- MAJOR — Breaking changes
- MINOR — New features (backwards compatible)
- PATCH — Bug fixes

### Release Steps

1. Update version in `package.json`
2. Update `docs/CHANGELOG.md`
3. Create release branch: `release/vX.Y.Z`
4. Run full test suite
5. Deploy to staging
6. Smoke test
7. Merge to `main`
8. Tag: `git tag vX.Y.Z`
9. Deploy to production
10. Create GitHub release with notes

### Changelog Format

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- New feature description

### Changed
- Modified behavior

### Fixed
- Bug fix description

### Security
- Security fix description
```

---

## Bug Reports

Use the [GitHub issue tracker](https://github.com/.../issues).

Include:
- **Title:** Concise summary
- **Description:** What happened vs. expected
- **Steps to Reproduce:** Numbered list
- **Environment:** Browser, OS, URL
- **Screenshots:** If UI-related
- **Logs:** If available (remove PII)

---

## Feature Requests

Open an issue with the `enhancement` label. Include:
- **Use case:** Why is this needed?
- **Proposed solution:** How should it work?
- **Alternatives:** What else was considered?
- **Mockups:** For UI changes

---

## Community

- **GitHub Discussions:** For questions and ideas
- **Discord:** (link)
- **Email:** dev@blinkgo.de

---

## License

By contributing, you agree that your contributions will be licensed under the project's proprietary license.
