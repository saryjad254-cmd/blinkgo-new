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

// Tier thresholds (kept for documentation; the canonical tier is
// computed by the SQL trigger update_loyalty_tier() in 24-helper-functions-v33.sql).
const TIER_THRESHOLDS = {
  bronze: 0,
  silver: 500,
  gold: 2000,
  platinum: 5000,
};

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
   *
   * v82 BLOCKER fix: the previous version did a SELECT (getBalance) then
   * an UPSERT, which is a classic TOCTOU race. Two concurrent awardForOrder
   * calls (e.g. the DB trigger + a manual call) could both read the same
   * balance and both write balance+N, but the user would only see +N
   * (the second write wins, silently dropping the first). We now delegate
   * to the existing award_loyalty_points SQL function which uses an
   * upsert and is atomic at the row level.
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
    // Atomic path: server-side function does the upsert with no read-then-write.
    const { error: rpcErr } = await svc.rpc('award_loyalty_points', {
      p_user_id: userId,
      p_points: amount,
      p_reason: reason,
      p_order_id: orderId ?? null,
    });
    if (rpcErr) {
      logger.error('Loyalty credit RPC failed', { userId, amount }, rpcErr);
      throw new AppError('Failed to credit loyalty points', { statusCode: 500, cause: rpcErr });
    }
    // Best-effort: store a friendly description on the transaction row.
    // Failure here does NOT roll back the credit (the transaction is
    // already committed by the RPC).
    try {
      await svc.from('loyalty_transactions').insert({
        user_id: userId,
        order_id: orderId ?? null,
        amount,
        reason,
        description: description ?? null,
      });
    } catch (e) {
      logger.warn('Loyalty transaction log insert failed (non-fatal)', { userId }, e);
    }
    // Re-read the row to return an accurate balance to the caller.
    return this.getBalance(userId);
  }

  /**
   * Redeem points for a discount. 100 points = €1.
   *
   * v82 BLOCKER fix: the previous version did SELECT (getBalance) +
   * balance check + UPDATE. Two concurrent redeem() calls could each
   * see balance=N and both subtract, dropping the balance below zero.
   * We now delegate to the existing redeem_loyalty_points SQL function
   * which uses SELECT FOR UPDATE + a balance check inside the row
   * lock, so concurrent redeemers are serialized.
   */
  static async redeem(userId: string, points: number, orderId?: string): Promise<{ discount: number; balance: LoyaltyBalance }> {
    if (points < 100) throw new ValidationError('Minimum 100 points to redeem');
    const svc = createServiceClient();
    const { error: rpcErr } = await svc.rpc('redeem_loyalty_points', {
      p_user_id: userId,
      p_points: points,
      p_order_id: orderId ?? null,
    });
    if (rpcErr) {
      const msg = rpcErr.message ?? '';
      if (msg.toLowerCase().includes('insufficient')) {
        throw new ConflictError('Insufficient points');
      }
      logger.error('Loyalty redeem RPC failed', { userId, points }, rpcErr);
      throw new AppError('Failed to redeem loyalty points', { statusCode: 500, cause: rpcErr });
    }
    const discount = Number((points / 100).toFixed(2));
    const balance = await this.getBalance(userId);
    // Log the redemption (the SQL function also inserts a row, but
    // with a generic description; this one keeps the user-friendly
    // message. Idempotent on (user_id, order_id, type) via the
    // transactions table's natural key in the SQL function).
    try {
      await svc.from('loyalty_transactions').insert({
        user_id: userId,
        order_id: orderId ?? null,
        amount: -points,
        reason: 'redemption',
        description: `Redeemed for €${discount.toFixed(2)} discount`,
      });
    } catch (e) {
      logger.warn('Loyalty redemption log insert failed (non-fatal)', { userId, points }, e);
    }
    return { discount, balance };
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
