/**
 * @deprecated — re-export from @/lib/foundation.
 * Use `import { ok, fail, withErrorHandling, ... } from '@/lib/foundation'`.
 * This file remains as a compatibility shim for legacy imports.
 */
export {
  ok,
  created,
  noContent,
  fail,
  withErrorHandling,
  newRequestId,
  getRequestId,
  setRequestId,
} from '@/lib/foundation/response';
export type { ApiSuccess, ApiFailure, ApiResponse } from '@/lib/foundation/types';
