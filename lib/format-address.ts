type AddressRecord = {
  address?: unknown;
  formatted_address?: unknown;
  street?: unknown;
  city?: unknown;
  postal_code?: unknown;
  postal?: unknown;
};

function addressFromRecord(value: AddressRecord): string | null {
  const direct = value.address ?? value.formatted_address;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();

  const parts = [value.street, value.postal_code, value.city]
    .filter((part): part is string => typeof part === 'string' && Boolean(part.trim()))
    .map((part) => part.trim());

  return parts.length ? parts.join(', ') : null;
}

/** Converts legacy strings and structured delivery-address values into display-safe text. */
export function formatAddress(value: unknown, fallback = '—'): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return fallback;

    if (trimmed.startsWith('{')) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object') {
          return addressFromRecord(parsed as AddressRecord) ?? fallback;
        }
      } catch {
        // Preserve normal address strings that merely start with an opening brace.
      }
    }

    return trimmed;
  }

  if (value && typeof value === 'object') {
    return addressFromRecord(value as AddressRecord) ?? fallback;
  }

  return fallback;
}

/**
 * Returns only the coarse delivery area (postal code + city). Use this for
 * pre-acceptance courier offers so the customer's street and house number are
 * never serialized to an unassigned driver.
 */
export function formatAddressArea(value: unknown, fallback = '—'): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    if (trimmed.startsWith('{')) {
      try {
        return formatAddressArea(JSON.parse(trimmed) as unknown, fallback);
      } catch {
        // Continue with a conservative postal-code parser.
      }
    }
    const germanArea = trimmed.match(/\b(\d{5})\s+([^,]+)/);
    return germanArea ? `${germanArea[1]} ${germanArea[2].trim()}` : fallback;
  }

  if (value && typeof value === 'object') {
    const address = value as AddressRecord;
    const postal = typeof (address.postal_code ?? address.postal) === 'string'
      ? String(address.postal_code ?? address.postal).trim()
      : '';
    const city = typeof address.city === 'string' ? address.city.trim() : '';
    const area = [postal, city].filter(Boolean).join(' ');
    if (area) return area;
    const direct = address.address ?? address.formatted_address;
    return typeof direct === 'string' ? formatAddressArea(direct, fallback) : fallback;
  }

  return fallback;
}
