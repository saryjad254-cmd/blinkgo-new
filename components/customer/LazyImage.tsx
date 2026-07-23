/**
 * LazyImage
 * ─────────
 * Image with IntersectionObserver-based lazy loading.
 * Only loads when within 200px of viewport.
 * Falls back to immediate load for above-the-fold images.
 */
'use client';

import { useState, useRef, useEffect, memo } from 'react';
import Image, { type ImageProps } from 'next/image';
import { cn } from '@/lib/cn';

interface LazyImageProps extends Omit<ImageProps, 'placeholder' | 'blurDataURL'> {
  /** Loading placeholder (CSS class for skeleton) */
  skeletonClassName?: string;
  /** Force eager loading (skip lazy) */
  eager?: boolean;
}

function LazyImageInner({
  src,
  alt,
  className,
  skeletonClassName,
  eager = false,
  onLoad,
  ...rest
}: LazyImageProps) {
  const [isVisible, setIsVisible] = useState(eager);
  const [isLoaded, setIsLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isVisible) return;
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [isVisible]);

  return (
    <div ref={ref} className={cn('relative overflow-hidden', className)}>
      {!isLoaded && (
        <div
          className={cn(
            'absolute inset-0 bg-bg-secondary animate-pulse',
            skeletonClassName
          )}
          aria-hidden="true"
        />
      )}
      {isVisible && (
        <Image
          src={src}
          alt={alt}
          className={cn(
            className,
            'transition-opacity duration-300',
            isLoaded ? 'opacity-100' : 'opacity-0'
          )}
          onLoad={(e) => {
            setIsLoaded(true);
            onLoad?.(e);
          }}
          {...rest}
        />
      )}
    </div>
  );
}

export const LazyImage = memo(LazyImageInner);
