export interface SupabaseServerRuntimeConfig {
  baseUrl: string;
  serviceKey: string;
}

export function getSupabaseServerRuntimeConfig(): SupabaseServerRuntimeConfig | null {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!baseUrl || !serviceKey) return null;
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  } catch {
    return null;
  }
  return { baseUrl: baseUrl.replace(/\/$/, ''), serviceKey };
}

export function supabaseServiceHeaders(config: SupabaseServerRuntimeConfig): HeadersInit {
  return { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}` };
}
