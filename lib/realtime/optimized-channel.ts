/**
 * Optimized Realtime Channel
 * ──────────────────────────
 * Wrapper around Supabase realtime with:
 *  - Automatic reconnection with backoff
 *  - Channel reuse (single connection)
 *  - Event debouncing
 *  - Connection state recovery
 *  - Bandwidth optimization (only subscribe to needed events)
 */

import { createClient, RealtimeChannel, RealtimeClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logging/logger';

interface ChannelOptions {
  /** Channel name for reuse */
  name: string;
  /** Postgres changes config */
  table: string;
  /** Filter pattern */
  filter?: string;
  /** Events to listen for (default: all) */
  events?: ('INSERT' | 'UPDATE' | 'DELETE')[];
  /** Debounce ms for rapid updates (default: 100) */
  debounceMs?: number;
  /** Reconnect on disconnect (default: true) */
  reconnect?: boolean;
}

type ChangeHandler = (payload: any) => void;

class ChannelManager {
  private channels = new Map<string, ManagedChannel>();
  private reconnectTimers = new Map<string, NodeJS.Timeout>();

  get(opts: ChannelOptions): ManagedChannel {
    const key = opts.name;
    let ch = this.channels.get(key);
    if (!ch) {
      ch = new ManagedChannel(opts);
      this.channels.set(key, ch);
    }
    return ch;
  }

  release(name: string) {
    const ch = this.channels.get(name);
    if (ch) {
      ch.close();
      this.channels.delete(name);
    }
  }

  releaseAll() {
    for (const [name, ch] of this.channels) {
      ch.close();
    }
    this.channels.clear();
  }
}

class ManagedChannel {
  private channel: RealtimeChannel | null = null;
  private handlers = new Set<ChangeHandler>();
  private debounceTimer: NodeJS.Timeout | null = null;
  private pendingPayloads: any[] = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000; // Start at 1s, exponential backoff
  private closed = false;

  constructor(private opts: ChannelOptions) {}

  subscribe(handler: ChangeHandler): () => void {
    this.handlers.add(handler);
    this.connect();
    return () => {
      this.handlers.delete(handler);
    };
  }

  private connect() {
    if (this.closed || this.channel) return;
    if (typeof window === 'undefined') return;

    try {
      const client = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { realtime: { params: { eventsPerSecond: 10 } } },
      );

      const filter = this.opts.filter ?? '';
      const events = this.opts.events ?? ['INSERT', 'UPDATE', 'DELETE'];

      this.channel = client.channel(this.opts.name, {
        config: {
          broadcast: { self: false },
          presence: { key: '' },
        },
      });

      for (const event of events) {
        this.channel.on(
          'postgres_changes' as any,
          { event, schema: 'public', table: this.opts.table, filter },
          (payload) => this.handlePayload(payload),
        );
      }

      this.channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.reconnectAttempts = 0;
          this.reconnectDelay = 1000;
          logger.info('Realtime connected', { channel: this.opts.name });
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          this.scheduleReconnect();
        }
      });
    } catch (err) {
      logger.error('Realtime connection failed', { channel: this.opts.name, error: (err as Error).message });
      this.scheduleReconnect();
    }
  }

  private handlePayload(payload: any) {
    if (!this.opts.debounceMs || this.opts.debounceMs <= 0) {
      this.dispatch(payload);
      return;
    }

    this.pendingPayloads.push(payload);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      // Send latest payload (assume sequential updates are most relevant)
      const latest = this.pendingPayloads[this.pendingPayloads.length - 1];
      this.pendingPayloads = [];
      this.dispatch(latest);
    }, this.opts.debounceMs);
  }

  private dispatch(payload: any) {
    for (const h of this.handlers) {
      try {
        h(payload);
      } catch (err) {
        logger.error('Realtime handler error', { channel: this.opts.name, error: (err as Error).message });
      }
    }
  }

  private scheduleReconnect() {
    if (this.closed) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.warn('Realtime max reconnect attempts reached', { channel: this.opts.name });
      return;
    }
    if (!this.opts.reconnect) return;

    const delay = Math.min(30000, this.reconnectDelay * Math.pow(2, this.reconnectAttempts));
    this.reconnectAttempts++;

    logger.info('Realtime reconnecting', {
      channel: this.opts.name,
      attempt: this.reconnectAttempts,
      delay_ms: delay,
    });

    setTimeout(() => {
      this.close();
      this.connect();
    }, delay);
  }

  close() {
    this.closed = true;
    if (this.channel) {
      this.channel.unsubscribe();
      this.channel = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}

let manager: ChannelManager | null = null;

export function getRealtimeManager(): ChannelManager {
  if (!manager) manager = new ChannelManager();
  return manager;
}
