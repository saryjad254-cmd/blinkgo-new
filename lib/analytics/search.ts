/**
 * Search Analytics — Client-side tracking for search events
 *
 * Tracks:
 *  - search_submitted: When user submits a search
 *  - search_zero_result: When search returns 0 results
 *  - search_results_clicked: When user clicks a result
 *  - search_conversion: When search leads to order
 *  - popular_searches: Trending queries
 *  - popular_restaurants: Trending restaurants from search
 *  - popular_products: Trending products from search
 *
 * Privacy-friendly: only collects search query text + counts.
 * No PII is collected. Localstorage fallback if network fails.
 *
 * Server endpoint: /api/search/analytics (fire-and-forget)
 */

export type SearchEventType =
  | 'search_submitted'
  | 'search_zero_result'
  | 'search_results_clicked'
  | 'search_to_restaurant'
  | 'search_to_product';

export interface SearchEvent {
  type: SearchEventType;
  query: string;
  resultId?: string;
  resultType?: 'restaurant' | 'product';
  resultCount?: number;
  filterCuisine?: string | null;
  filterSort?: string | null;
  timestamp: number;
  sessionId: string;
}

// Get or create session ID (persists across page loads)
function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr';
  try {
    let id = sessionStorage.getItem('blinkgo-search-session');
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem('blinkgo-search-session', id);
    }
    return id;
  } catch {
    return 'no-storage';
  }
}

// Local fallback queue (for offline scenarios)
const LOCAL_QUEUE_KEY = 'blinkgo-search-events-queue';
const MAX_QUEUE = 100;

function queueLocally(event: SearchEvent) {
  if (typeof window === 'undefined') return;
  try {
    const existing = JSON.parse(localStorage.getItem(LOCAL_QUEUE_KEY) || '[]');
    existing.push(event);
    if (existing.length > MAX_QUEUE) existing.shift();
    localStorage.setItem(LOCAL_QUEUE_KEY, JSON.stringify(existing));
  } catch {}
}

async function flushQueue() {
  if (typeof window === 'undefined') return;
  try {
    const queue = JSON.parse(localStorage.getItem(LOCAL_QUEUE_KEY) || '[]');
    if (queue.length === 0) return;
    for (const event of queue) {
      await sendEvent(event, true);
    }
    localStorage.removeItem(LOCAL_QUEUE_KEY);
  } catch {}
}

async function sendEvent(event: SearchEvent, isFlush = false): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const res = await fetch('/api/search/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      // Fire-and-forget (no keepalive needed; we use AbortController on page hide)
    });
    if (!res.ok) {
      if (!isFlush) queueLocally(event);
      return false;
    }
    return true;
  } catch {
    if (!isFlush) queueLocally(event);
    return false;
  }
}

/**
 * Public API: track a search event
 *
 * @param type - Event type
 * @param data - Event data (query, resultId, etc.)
 */
export function trackSearchEvent(
  type: SearchEventType,
  data: Omit<SearchEvent, 'type' | 'timestamp' | 'sessionId'>
): void {
  if (typeof window === 'undefined') return;
  const event: SearchEvent = {
    ...data,
    type,
    timestamp: Date.now(),
    sessionId: getSessionId(),
  };
  // Fire-and-forget; queue on failure
  void sendEvent(event);
}

// Try to flush queue when online (called by online hook)
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void flushQueue();
  });
  // Initial flush on load
  if (document.readyState === 'complete') {
    void flushQueue();
  } else {
    window.addEventListener('load', () => {
      void flushQueue();
    });
  }
}
