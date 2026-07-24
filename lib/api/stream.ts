/**
 * JSON Streaming Utilities
 * ───────────────────────
 * Stream large JSON arrays to avoid memory spikes.
 *
 * Use case: returning 1000+ items (e.g. order history, search results)
 */

import { NextResponse } from 'next/server';

/**
 * Stream a large array as NDJSON (newline-delimited JSON).
 * Each line is a complete JSON object — clients can parse line-by-line.
 */
export function streamNDJSON<T>(items: AsyncIterable<T> | Iterable<T>): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const item of items) {
          controller.enqueue(encoder.encode(JSON.stringify(item) + '\n'));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Compress a large array — for paginated APIs.
 */
export function paginate<T>(items: T[], page: number, pageSize: number) {
  const start = page * pageSize;
  const end = start + pageSize;
  return {
    items: items.slice(start, end),
    pagination: {
      page,
      page_size: pageSize,
      total: items.length,
      total_pages: Math.ceil(items.length / pageSize),
      has_next: end < items.length,
      has_prev: page > 0,
    },
  };
}
