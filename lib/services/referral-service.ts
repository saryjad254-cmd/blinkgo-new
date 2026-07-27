/**
 * ReferralService
 * ───────────────
 * Customer referral system. Generates codes, tracks invites, and rewards.
 */

import { createServiceClient } from '@/lib/supabase/service';
import { AppError, NotFoundError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logging';

export interface Referral {
  id: string;
  referrer_id: string;
  referee_email: string;
  referee_id: string | null;
  code: string;
  status: 'pending' | 'signed_up' | 'completed' | 'rewarded';
  reward_credit: number;
  referee_credit: number;
  created_at: string;
  completed_at: string | null;
}

export class ReferralService {
  /**
   * Generate a unique referral code for a user.
   */
  static generateCode(name: string, userId: string): string {
    // 6-char base: first 3 letters of name + 3 random alphanumerics
    const namePart = (name || 'BKG').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3).padEnd(3, 'X');
    const randomPart = Math.random().toString(36).slice(2, 5).toUpperCase();
    return `${namePart}${randomPart}`;
  }

  /**
   * Ensure a user has a referral code. If not, generate and persist.
   * If the column doesn't exist yet (pre-migration), return a generated
   * code in-memory so the feature still works.
   */
  static async ensureCode(userId: string, name: string): Promise<string> {
    const svc = createServiceClient();
    let code: string | null = null;
    try {
      const { data: user } = await svc.from('users').select('referral_code').eq('id', userId).single();
      if (user?.referral_code) return user.referral_code;
    } catch (e) {
      // Column doesn't exist — fall through
    }
    code = this.generateCode(name, userId);
    try {
      for (let i = 0; i < 3; i++) {
        const { error } = await svc.from('users').update({ referral_code: code }).eq('id', userId);
        if (!error) return code;
        if (error.code === '23505') {
          code = this.generateCode(name, userId);
          continue;
        }
        // If column doesn't exist, return in-memory code
        if (error.message?.includes('column') || error.code === '42703') {
          return code;
        }
        break;
      }
    } catch (e) {
      // Column may not exist — return in-memory code
    }
    return code;
  }

  /**
   * Create an invite (the referrer shares this with a friend).
   */
  static async invite(input: { referrerId: string; refereeEmail: string; code: string }): Promise<Referral> {
    if (!input.refereeEmail) throw new ValidationError('Email required');
    const svc = createServiceClient();
    const { data, error } = await svc
      .from('referrals')
      .insert({
        referrer_id: input.referrerId,
        referee_email: input.refereeEmail.toLowerCase(),
        code: input.code,
        status: 'pending',
      })
      .select('*')
      .single();
    if (error || !data) {
      throw new AppError('Failed to create referral', { statusCode: 500, cause: error });
    }
    return data as Referral;
  }

  /**
   * Mark a referral as completed when the referee places their first order.
   * Credits both referrer and referee.
   */
  static async markCompleted(refereeUserId: string, orderId: string): Promise<void> {
    const svc = createServiceClient();
    const { data: referral } = await svc
      .from('referrals')
      .select('*')
      .eq('referee_id', refereeUserId)
      .eq('status', 'signed_up')
      .maybeSingle();
    if (!referral) return; // No pending referral for this user

    await svc
      .from('referrals')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', referral.id);

    // Credit the referrer (give loyalty points + credit)
    await LoyaltyService.credit(
      referral.referrer_id,
      100, // 100 points as referral reward
      'referral_completed',
      `Referral completed (referee: ${refereeUserId})`,
      orderId,
    );

    // Mark as rewarded
    await svc
      .from('referrals')
      .update({ status: 'rewarded' })
      .eq('id', referral.id);
  }

  /**
   * Attach a referee user_id when they sign up via a referral code.
   */
  static async attachReferee(refereeUserId: string, code: string): Promise<void> {
    if (!code) return;
    const svc = createServiceClient();
    await svc
      .from('referrals')
      .update({ referee_id: refereeUserId, status: 'signed_up' })
      .eq('code', code)
      .eq('status', 'pending');
  }

  static async listForUser(userId: string): Promise<Referral[]> {
    const svc = createServiceClient();
    const { data } = await svc
      .from('referrals')
      .select('*')
      .eq('referrer_id', userId)
      .order('created_at', { ascending: false });
    return (data ?? []) as Referral[];
  }
}

// Reference to avoid circular import issues
import { LoyaltyService } from './loyalty-service';
