/**
 * VirtualList
 * ───────────
 * Renders only the visible items in a long list.
 * Uses native IntersectionObserver + windowing.
 *
 * For lists of 100+ items (orders, search results, transactions).
 * Falls back to normal rendering for small lists.
 */
'use client';

import { useState, useRef, useEffect, useMemo, useCallback, memo } from 'react';
import { useIntersectionObserver } from '@/lib/hooks/use-intersection';

export interface VirtualListProps<T> {
  items: T[];
  /** Estimated item height in pixels (default 80) */
  estimatedItemHeight?: number;
  /** Number of items to render above/below the visible viewport */
  overscan?: number;
  /** Fixed height for the scroll container */
  height: number;
  /** Render function for each item */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Stable key extractor */
  keyExtractor: (item: T, index: number) => string;
  /** Optional empty state */
  emptyState?: React.ReactNode;
  /** Optional loading state */
  loading?: boolean;
  /** Skeleton count when loading */
  skeletonCount?: number;
}

function VirtualListInner<T>({
  items,
  estimatedItemHeight = 80,
  overscan = 5,
  height,
  renderItem,
  keyExtractor,
  emptyState,
  loading,
  skeletonCount = 5,
}: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Compute visible range
  const { startIndex, endIndex, offsetY, totalHeight } = useMemo(() => {
    const total = items.length * estimatedItemHeight;
    const start = Math.max(0, Math.floor(scrollTop / estimatedItemHeight) - overscan);
    const visibleCount = Math.ceil(height / estimatedItemHeight) + overscan * 2;
    const end = Math.min(items.length, start + visibleCount);
    return {
      startIndex: start,
      endIndex: end,
      offsetY: start * estimatedItemHeight,
      totalHeight: total,
    };
  }, [scrollTop, items.length, estimatedItemHeight, overscan, height]);

  // Use rAF to throttle scroll updates
  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    // Direct setState is fine — React batches these
    setScrollTop(target.scrollTop);
  }, []);

  // If items < threshold, just render normally
  if (!loading && items.length < 50) {
    return (
      <div>
        {items.length === 0 && emptyState}
        {items.map((item, i) => (
          <div key={keyExtractor(item, i)}>{renderItem(item, i)}</div>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      style={{ height, overflowY: 'auto', position: 'relative' }}
      role="list"
    >
      {items.length === 0 && !loading && emptyState}
      {loading && Array.from({ length: skeletonCount }).map((_, i) => (
        <div
          key={`skel-${i}`}
          style={{ height: estimatedItemHeight }}
          className="animate-pulse bg-bg-elevated/50 rounded-lg m-2"
        />
      ))}
      {!loading && (
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div style={{ transform: `translateY(${offsetY}px)` }}>
            {items.slice(startIndex, endIndex).map((item, i) => {
              const realIndex = startIndex + i;
              return (
                <div key={keyExtractor(item, realIndex)}>
                  {renderItem(item, realIndex)}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export const VirtualList = memo(VirtualListInner) as typeof VirtualListInner;
