/**
 * Inline spinner — pure CSS, no JS animation. Avoids lucide-react Loader2 (saves bytes).
 */
export function LoadingSpinner({
  size = 'md',
  text,
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  className?: string;
}) {
  const sizeMap = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-[3px]',
    lg: 'h-12 w-12 border-4',
    xl: 'h-16 w-16 border-[5px]',
  } as const;
  return (
    <div className={`flex flex-col items-center gap-3 ${className}`} role="status" aria-label={text}>
      <div className={`${sizeMap[size]} animate-spin rounded-full border-transparent border-t-brand-500 border-r-accent-500`} />
      {text ? <p className="text-sm text-zinc-500">{text}</p> : null}
    </div>
  );
}
