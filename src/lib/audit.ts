import { prisma } from '@/lib/db';
import { clientIp, hashIp, userAgent } from '@/lib/security/request';

export type AuditAction =
  | 'user.signup'
  | 'user.login'
  | 'user.login_failed'
  | 'user.logout'
  | 'user.password_reset_requested'
  | 'user.password_reset_completed'
  | 'user.password_changed'
  | 'user.email_verified'
  | 'user.profile_updated'
  | 'user.account_deleted'
  | 'business.created'
  | 'business.updated'
  | 'business.onboarding_completed'
  | 'receipt.created'
  | 'receipt.updated'
  | 'receipt.deleted'
  | 'receipt.restored'
  | 'receipt.purged'
  | 'receipt.viewed'
  | 'receipt.downloaded'
  | 'receipt.duplicated'
  | 'receipt.moved'
  | 'folder.created'
  | 'folder.updated'
  | 'folder.deleted'
  | 'folder.archived'
  | 'category.created'
  | 'category.updated'
  | 'category.deleted'
  | 'export.requested'
  | 'export.completed'
  | 'export.failed'
  | 'export.downloaded'
  | 'access.denied';

export interface AuditInput {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  businessId?: string | null;
  userId?: string | null;
  /** Structural facts only — never document contents or extracted amounts. */
  metadata?: Record<string, string | number | boolean | null>;
  request?: Request;
}

/**
 * Append-only record of who did what to which document. Writes never block or
 * fail the caller's operation.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        businessId: input.businessId ?? null,
        userId: input.userId ?? null,
        metadata: input.metadata ?? undefined,
        ipHash: input.request ? hashIp(clientIp(input.request)) : null,
        userAgent: input.request ? userAgent(input.request) : null,
      },
    });
  } catch (error) {
    // Auditing must never break the user's action; surface it in server logs only.
    // eslint-disable-next-line no-console
    console.error('[audit] failed to write entry', { action: input.action, error: (error as Error).message });
  }
}
