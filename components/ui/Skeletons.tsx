/**
 * Lightweight skeleton loaders. Pure CSS — no JS animation, GPU-friendly.
 */

interface SkeletonProps {
  className?: string;
  /** Aspect ratio e.g. "16/9", "1" */
  aspect?: number;
  width?: number | string;
  height?: number | string;
  rounded?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'full';
}

const roundedClass = {
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
  '3xl': 'rounded-3xl',
  full: 'rounded-full',
};

export function Skeleton({ className = '', aspect, width, height, rounded = 'md' }: SkeletonProps) {
  const style: React.CSSProperties = {
    aspectRatio: aspect ? `${aspect}` : undefined,
    width: width as any,
    height: height as any,
  };
  return (
    <div
      className={`relative overflow-hidden bg-zinc-200/60 dark:bg-zinc-800/60 ${roundedClass[rounded]} ${className}`}
      style={style}
    >
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
    </div>
  );
}

export function SkeletonText({ lines = 1, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={12}
          className="w-full"
          rounded="sm"
        />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="space-y-3 rounded-2xl border border-zinc-200/60 bg-white p-4">
      <Skeleton aspect={16 / 9} rounded="xl" />
      <SkeletonText lines={2} />
      <Skeleton className="h-8 w-1/2" />
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton width={48} height={48} rounded="full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
