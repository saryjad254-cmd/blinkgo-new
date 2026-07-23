/**
 * LoyaltyService
 * ──────────────
 * Loyalty points system. Tracks balance, awards points, handles redemption.
 */

import { createServiceClient } from '@/lib/supabase/service';
import { AppError, NotFoundError, ValidationError, ConflictError } from '@/lib/errors';
import { logger } from '@/lib/logging';

export interface LoyaltyBalance {
  user_id: string;
  balance: number;
  total_earned: number;
  total_redeemed: number;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
}

export interface LoyaltyTransaction {
  id: string;
  user_id: string;
  order_id: string | null;
  amount: number;
  reason: string;
  description: string | null;
  created_at: string;
}

// Tier thresholds (total earned)
const TIER_THRESHOLDS = {
  bronze: 0,
  silver: 500,
  gold: 2000,
  platinum: 5000,
};

function tierFor(totalEarned: number): LoyaltyBalance['tier'] {
  if (totalEarned >= TIER_THRESHOLDS.platinum) return 'platinum';
  if (totalEarned >= TIER_THRESHOLDS.gold) return 'gold';
  if (totalEarned >= TIER_THRESHOLDS.silver) return 'silver';
  return 'bronze';
}

export class LoyaltyService {
  /**
   * Get a user's loyalty balance. Returns zeros if the user has no row yet.
   */
  static async getBalance(userId: string): Promise<LoyaltyBalance> {
    const svc = createServiceClient();
    const { data } = await svc
      .from('loyalty_points')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (!data) {
      return { user_id: userId, balance: 0, total_earned: 0, total_redeemed: 0, tier: 'bronze' };
    }
    return data as LoyaltyBalance;
  }

  /**
   * Award points to a user.
   */
  static async credit(
    userId: string,
    amount: number,
    reason: string,
    description?: string,
    orderId?: string,
  ): Promise<LoyaltyBalance> {
    if (amount <= 0) throw new ValidationError('Amount must be positive');
    const svc = createServiceClient();
    const current = await this.getBalance(userId);
    const newBalance = current.balance + amount;
    const newTotalEarned = current.total_earned + amount;
    const newTier = tierFor(newTotalEarned);
    const upsert = {
      user_id: userId,
      balance: newBalance,
      total_earned: newTotalEarned,
      total_redeemed: current.total_redeemed,
      tier: newTier,
      updated_at: new Date().toISOString(),
    };
    await svc.from('loyalty_points').upsert(upsert, { onConflict: 'user_id' });
    await svc.from('loyalty_transactions').insert({
      user_id: userId,
      order_id: orderId ?? null,
      amount,
      reason,
      description: description ?? null,
    });
    return { ...upsert };
  }

  /**
   * Redeem points for a discount. 100 points = €1.
   */
  static async redeem(userId: string, points: number, orderId?: string): Promise<{ discount: number; balance: LoyaltyBalance }> {
    if (points < 100) throw new ValidationError('Minimum 100 points to redeem');
    const svc = createServiceClient();
    const current = await this.getBalance(userId);
    if (current.balance < points) throw new ConflictError('Insufficient points');
    const discount = points / 100; // 100 points = €1
    const newBalance = current.balance - points;
    const newRedeemed = current.total_redeemed + points;
    await svc.from('loyalty_points').update({
      balance: newBalance,
      total_redeemed: newRedeemed,
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId);
    await svc.from('loyalty_transactions').insert({
      user_id: userId,
      order_id: orderId ?? null,
      amount: -points,
      reason: 'redemption',
      description: `Redeemed for €${discount.toFixed(2)} discount`,
    });
    return {
      discount: Number(discount.toFixed(2)),
      balance: { ...current, balance: newBalance, total_redeemed: newRedeemed },
    };
  }

  /**
   * Award points for a completed order. Default: 1 point per euro spent.
   */
  static async awardForOrder(userId: string, orderId: string, orderTotal: number): Promise<void> {
    if (orderTotal <= 0) return;
    const points = Math.floor(orderTotal);
    if (points < 1) return;
    try {
      await this.credit(userId, points, 'order_completed', `Order #${orderId.slice(0, 8)}`, orderId);
    } catch (e) {
      logger.warn('Loyalty credit failed (non-fatal)', { userId, orderId }, e);
    }
  }

  /**
   * Give a signup bonus to a new user.
   */
  static async signupBonus(userId: string, bonus: number = 50): Promise<void> {
    if (bonus <= 0) return;
    try {
      await this.credit(userId, bonus, 'signup_bonus', 'Welcome bonus!');
    } catch (e) {
      logger.warn('Signup bonus failed (non-fatal)', { userId }, e);
    }
  }

  /**
   * List recent transactions for a user.
   */
  static async listTransactions(userId: string, limit = 20): Promise<LoyaltyTransaction[]> {
    const svc = createServiceClient();
    const { data } = await svc
      .from('loyalty_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data ?? []) as LoyaltyTransaction[];
  }
}
