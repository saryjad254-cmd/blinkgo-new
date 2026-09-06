/**
 * @deprecated — re-export from @/lib/foundation.
 * Use `import { isValidEmail, ... } from '@/lib/foundation/validation'`.
 */
export {
  isValidEmail,
  sanitizeEmail,
  isValidPassword,
  isValidName,
  isValidPhone,
  isValidOtpCode,
  isValidRole,
  sanitizeUrl,
  sanitizeText,
  isValidUuid,
  isValidUuidStrict,
  toSafeInt,
} from '@/lib/foundation/validation';
