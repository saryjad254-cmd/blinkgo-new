/**
 * cn — className merger (lightweight clsx alternative)
 */
export function cn(...classes: any[]): string {
  return classes.filter(Boolean).join(' ');
}
