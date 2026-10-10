import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@dct-crm/db';
import { getCRMDayBounds } from '@dct-crm/shared';
import { canTransitionStatus } from './workflow';

type Db = Prisma.TransactionClient | PrismaClient;

/**
 * First meaningful activity on a NEW lead promotes it to INCOMING.
 * Only runs when the creating profile is allowed NEW→INCOMING by workflow rules.
 * Additional activities on an already-INCOMING lead do nothing.
 * Must be called inside the caller's transaction when one is open.
 */
export async function promoteNewLeadOnFirstActivity(
  db: Db,
  params: {
    tenantId: string;
    leadId: string;
    userId: string;
    profileName?: string | null;
    activityLabel: string;
  },
): Promise<boolean> {
  const profileName = params.profileName || 'Admin';
  if (!canTransitionStatus(profileName, 'NEW', 'INCOMING')) return false;

  const lead = await db.lead.findFirst({
    where: { id: params.leadId, tenantId: params.tenantId },
    select: { id: true, status: true },
  });
  if (!lead || lead.status !== 'NEW') return false;

  await db.lead.update({
    where: { id: lead.id },
    data: { status: 'INCOMING' },
  });

  await db.auditLog.create({
    data: {
      tenantId: params.tenantId,
      userId: params.userId,
      leadId: lead.id,
      action: 'STATUS_CHANGE',
      objectType: 'Lead',
      objectId: lead.id,
      oldValues: { status: 'NEW' },
      newValues: {
        status: 'INCOMING',
        reason: `First activity: ${params.activityLabel}`,
        note: `First activity: ${params.activityLabel}`,
      },
    },
  });

  return true;
}

/** Tenant-safe sequential Site Visit number using existing Sequence infrastructure. */
export async function getNextSiteVisitNumber(
  db: Db,
  tenantId: string,
): Promise<string> {
  const seq = await db.sequence.upsert({
    where: { tenantId_type: { tenantId, type: 'SITE_VISIT' } },
    update: { nextValue: { increment: 1 } },
    create: { tenantId, type: 'SITE_VISIT', nextValue: 1 },
  });
  return `SV${String(seq.nextValue).padStart(6, '0')}`;
}

export async function getNextSiteVisitNumberDefault(tenantId: string): Promise<string> {
  return getNextSiteVisitNumber(prisma, tenantId);
}

export const AUTO_CANCEL_REASON =
  'Automatically cancelled: scheduled visit date passed without completion.';

/**
 * Overdue Site Visit normalization (read-time, backend, deterministic).
 *
 * A visit with status SCHEDULED whose scheduled date is strictly before
 * today in the CRM business timezone (Asia/Kolkata) and that was neither
 * completed nor manually cancelled is auto-cancelled with a system reason.
 * COMPLETED and already-CANCELLED visits are never touched. Mirrors the
 * existing manual-cancel workflow for the linked lead (SITE_VISIT_SCHEDULED
 * → PROSPECT when no other scheduled visit remains), with SYSTEM audit
 * entries (userId null → displayed as "System").
 */
export async function normalizeOverdueSiteVisits(tenantId: string): Promise<void> {
  const { start } = getCRMDayBounds();
  const overdue = await prisma.siteVisit.findMany({
    where: { tenantId, status: 'SCHEDULED', scheduledAt: { lt: start } },
    select: {
      id: true,
      leadId: true,
      scheduledAt: true,
      projectId: true,
      lead: { select: { id: true, status: true } },
    },
  });
  if (overdue.length === 0) return;

  await prisma.$transaction(async (tx) => {
    for (const sv of overdue) {
      const cancelledAt = new Date();
      const updated = await tx.siteVisit.updateMany({
        where: { id: sv.id, status: 'SCHEDULED' },
        data: {
          status: 'CANCELLED',
          cancellationReason: AUTO_CANCEL_REASON,
          cancelledAt,
          cancelledById: null,
        },
      });
      if (updated.count === 0) continue; // another request already normalized it

      if (sv.lead?.status === 'SITE_VISIT_SCHEDULED') {
        const otherScheduled = await tx.siteVisit.count({
          where: { tenantId, leadId: sv.leadId, status: 'SCHEDULED', id: { not: sv.id } },
        });
        if (otherScheduled === 0) {
          await tx.lead.update({
            where: { id: sv.leadId },
            data: { status: 'PROSPECT' },
          });
          await tx.auditLog.create({
            data: {
              tenantId,
              userId: null,
              leadId: sv.leadId,
              action: 'SITE_VISIT_CANCELLED',
              objectType: 'Lead',
              objectId: sv.leadId,
              oldValues: { status: 'SITE_VISIT_SCHEDULED' },
              newValues: {
                status: 'PROSPECT',
                siteVisitId: sv.id,
                reason: AUTO_CANCEL_REASON,
                source: 'SYSTEM',
              },
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          userId: null,
          leadId: sv.leadId,
          action: 'SITE_VISIT_CANCELLED',
          objectType: 'SiteVisit',
          objectId: sv.id,
          oldValues: { status: 'SCHEDULED', scheduledAt: sv.scheduledAt.toISOString() },
          newValues: {
            status: 'CANCELLED',
            cancellationReason: AUTO_CANCEL_REASON,
            cancelledAt: cancelledAt.toISOString(),
            reason: AUTO_CANCEL_REASON,
            source: 'SYSTEM',
          },
        },
      });
    }
  });
}