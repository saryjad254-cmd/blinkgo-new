/**
 * GET /api/loyalty/config
 *
 * Returns the canonical loyalty program configuration.
 * Single source of truth for the earn rate shown on the home page.
 *
 * Auth: optional (public config)
 */
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface LoyaltyConfig {
  enabled: boolean;
  earnRateEurPerPoint: number; // how many euros = 1 point
  redeemRatePointsPerEur: number; // how many points = 1 euro
  minRedeemPoints: number;
  programName: string;
  termsUrl: string;
}

const DEFAULT_CONFIG: LoyaltyConfig = {
  enabled: true,
  earnRateEurPerPoint: 1, // 1 € = 1 point
  redeemRatePointsPerEur: 100, // 100 points = 1 €
  minRedeemPoints: 100,
  programName: 'BlinkGo Rewards',
  termsUrl: '/legal/loyalty',
};

export async function GET() {
  try {
    // In a real system this would come from a config table. For now we
    // try to read from the database, falling back to a sane default.
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('loyalty_config')
      .select('*')
      .eq('id', 'singleton')
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json(DEFAULT_CONFIG);
    }

    const config: LoyaltyConfig = {
      enabled: data.enabled !== false,
      earnRateEurPerPoint: Number(data.earn_rate_eur_per_point) || 1,
      redeemRatePointsPerEur: Number(data.redeem_rate_points_per_eur) || 100,
      minRedeemPoints: Number(data.min_redeem_points) || 100,
      programName: data.program_name || DEFAULT_CONFIG.programName,
      termsUrl: data.terms_url || DEFAULT_CONFIG.termsUrl,
    };
    return NextResponse.json(config);
  } catch {
    return NextResponse.json(DEFAULT_CONFIG);
  }
}
