/**
 * demo-guard — يفحص إذا كان المستخدم يستخدم حساب تجريبي.
 * مفيد لإظهار تحذيرات في الـ UI ومنع تعديلات حساسة في الإنتاج.
 */

const DEMO_EMAILS = new Set([
  'admin@blinkgo.de',
  'demo@blinkgo.de',
  'driver@blinkgo.de',
  'restaurant@blinkgo.de',
]);

export function isDemoEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return DEMO_EMAILS.has(email.toLowerCase());
}

/**
 * للاستخدام في Server Components.
 * نظرًا لأنه يُستخدم حيث الـ user متاح بالفعل، يفضل تمرير الـ email.
 */
export async function isUserDemo(email: string | null | undefined): Promise<boolean> {
  return isDemoEmail(email);
}