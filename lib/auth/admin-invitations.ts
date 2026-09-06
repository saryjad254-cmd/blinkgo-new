import 'server-only';

import type { createServiceClient } from '@/lib/supabase/service';
import { getCanonicalBaseUrl } from '@/lib/auth/redirect-url';
import { logger } from '@/lib/logging';

type ServiceClient = ReturnType<typeof createServiceClient>;

export type InvitedRole = 'driver' | 'restaurant' | 'manager' | 'admin' | 'super_admin';

type InviteInput = {
  client: ServiceClient;
  email: string;
  name: string;
  phone?: string | null;
  role: InvitedRole;
  requestOrigin: string;
};

export class InvitationRateLimitError extends Error {
  readonly status = 429;
  readonly retryAfterSeconds = 3600;

  constructor() {
    super('Invitation email rate limit reached. Configure custom SMTP or retry later.');
    this.name = 'InvitationRateLimitError';
  }
}

function isProviderRateLimit(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { status?: unknown; code?: unknown; message?: unknown };
  return candidate.status === 429
    || (typeof candidate.code === 'string' && /rate|email.*limit/i.test(candidate.code))
    || (typeof candidate.message === 'string' && /rate limit|too many requests|email.*limit/i.test(candidate.message));
}

/**
 * Send a one-time Supabase activation invitation without creating or exposing
 * an administrator-chosen password. Authorization is written only to trusted
 * app_metadata after the invitation user has been created.
 */
export async function inviteAuthUser({ client, email, name, phone, role, requestOrigin }: InviteInput) {
  const redirectTo = `${getCanonicalBaseUrl(requestOrigin)}/auth/accept-invite`;
  // Non-authoritative metadata used only while Supabase renders the invite
  // email. Authorization remains exclusively in trusted app_metadata below.
  const invitationKind = role === 'driver' || role === 'restaurant' ? role : 'team';
  const { data, error } = await client.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { name, phone: phone || null, invitation_kind: invitationKind },
  });
  if (error) {
    const providerError = error as { status?: unknown; code?: unknown; name?: unknown; message?: unknown };
    logger.warn('auth.admin_invitation.provider_failed', {
      status: providerError.status,
      code: providerError.code,
      name: providerError.name,
      message: typeof providerError.message === 'string' ? providerError.message.slice(0, 200) : undefined,
    });
    if (isProviderRateLimit(error)) throw new InvitationRateLimitError();
    throw error;
  }
  if (!data.user) throw new Error('Invitation could not be created');

  const userId = data.user.id;
  const { data: updated, error: metadataError } = await client.auth.admin.updateUserById(userId, {
    app_metadata: { app_role: role },
    user_metadata: { name, phone: phone || null },
  });
  if (metadataError || !updated.user) {
    await client.auth.admin.deleteUser(userId).catch(() => undefined);
    throw metadataError || new Error('Invitation role could not be assigned');
  }

  return updated.user;
}
