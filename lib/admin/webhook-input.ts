import { ValidationError } from '@/lib/errors';

const EVENT_PATTERN = /^(\*|[a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+)*)$/;

export interface WebhookInput {
  name?: string;
  url?: string;
  secret?: string;
  events?: string[];
  enabled?: boolean;
  description?: string | null;
}

function text(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== 'string') throw new ValidationError(`${field} must be text`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new ValidationError(`${field} must be between ${min} and ${max} characters`);
  }
  return normalized;
}

function parseEvents(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 30) {
    throw new ValidationError('events must contain between 1 and 30 items');
  }
  const events = [...new Set(value.map((event) => text(event, 'event', 1, 80).toLowerCase()))];
  if (events.some((event) => !EVENT_PATTERN.test(event))) {
    throw new ValidationError('events contain an invalid event name');
  }
  return events;
}

export function parseWebhookInput(value: unknown, mode: 'create' | 'update'): WebhookInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('A JSON object is required');
  }
  const input = value as Record<string, unknown>;
  const output: WebhookInput = {};

  if (mode === 'create' || 'name' in input) output.name = text(input.name, 'name', 2, 120);
  if (mode === 'create' || 'url' in input) output.url = text(input.url, 'url', 8, 2048);
  if (mode === 'create' || 'secret' in input) {
    if (mode === 'update' && (input.secret === undefined || input.secret === '')) {
      // Empty secret on edit means keep the stored value.
    } else {
      output.secret = text(input.secret, 'secret', 16, 256);
    }
  }
  if (mode === 'create' || 'events' in input) output.events = parseEvents(input.events ?? ['*']);
  if ('enabled' in input) {
    if (typeof input.enabled !== 'boolean') throw new ValidationError('enabled must be boolean');
    output.enabled = input.enabled;
  } else if (mode === 'create') {
    output.enabled = true;
  }
  if ('description' in input) {
    output.description = input.description === null || input.description === ''
      ? null
      : text(input.description, 'description', 1, 500);
  }
  if (mode === 'update' && Object.keys(output).length === 0) {
    throw new ValidationError('At least one field is required');
  }
  return output;
}
