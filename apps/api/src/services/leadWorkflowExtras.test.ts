import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  followUpFindMany: vi.fn(),
  followUpUpdateMany: vi.fn(),
  siteVisitFindMany: vi.fn(),
  siteVisitUpdateMany: vi.fn(),
  auditLogCreate: vi.fn(),
  transaction: vi.fn(),
}));

const tagging = vi.hoisted(() => ({
  tagLeadFollowUpEvents: vi.fn(),
  tagLeadSiteVisitEvents: vi.fn(),
}));

vi.mock('@dct-crm/db', () => ({
  prisma: {
    followUp: { findMany: database.followUpFindMany },
    siteVisit: { findMany: database.siteVisitFindMany },
    $transaction: database.transaction,
  },
}));

vi.mock('./leadEventTagging', () => tagging);
vi.mock('./workflow', () => ({ canTransitionStatus: vi.fn(() => true) }));

import { normalizeOverdueFollowUps, normalizeOverdueSiteVisits } from './leadWorkflowExtras';

describe('overdue follow-up and Site Visit normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.transaction.mockImplementation((callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        followUp: { updateMany: database.followUpUpdateMany },
        siteVisit: { updateMany: database.siteVisitUpdateMany },
        auditLog: { create: database.auditLogCreate },
      }),
    );
    database.followUpFindMany.mockResolvedValue([]);
    database.siteVisitFindMany.mockResolvedValue([]);
    database.followUpUpdateMany.mockResolvedValue({ count: 1 });
    database.siteVisitUpdateMany.mockResolvedValue({ count: 1 });
  });

  it('marks due incomplete follow-ups missed and records the system audit', async () => {
    database.followUpFindMany.mockResolvedValue([
      { id: 'follow-up-1', leadId: 'lead-1', dueDate: new Date('2026-08-14T12:30:00.000Z') },
    ]);

    await normalizeOverdueFollowUps('tenant-1');

    expect(database.followUpFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 'tenant-1',
        isCompleted: false,
        isMissed: false,
        dueDate: { lte: expect.any(Date) },
      }),
    }));
    expect(database.followUpUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'follow-up-1', isCompleted: false, isMissed: false },
      data: { isMissed: true, missedAt: expect.any(Date) },
    }));
    expect(database.auditLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'FOLLOW_UP_MISSED',
        objectType: 'FollowUp',
        objectId: 'follow-up-1',
      }),
    }));
    expect(tagging.tagLeadFollowUpEvents).toHaveBeenCalledWith(expect.anything(), 'tenant-1', 'lead-1');
  });

  it('marks due incomplete Site Visits MISSED rather than cancelled', async () => {
    database.siteVisitFindMany.mockResolvedValue([
      { id: 'visit-1', leadId: 'lead-1', scheduledAt: new Date('2026-08-14T12:30:00.000Z') },
    ]);

    await normalizeOverdueSiteVisits('tenant-1');

    expect(database.siteVisitFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 'tenant-1',
        status: 'SCHEDULED',
        scheduledAt: { lte: expect.any(Date) },
      }),
    }));
    expect(database.siteVisitUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'visit-1', status: 'SCHEDULED' },
      data: { status: 'MISSED', missedAt: expect.any(Date) },
    }));
    expect(database.auditLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'SITE_VISIT_MISSED',
        objectType: 'SiteVisit',
        objectId: 'visit-1',
      }),
    }));
    expect(tagging.tagLeadSiteVisitEvents).toHaveBeenCalledWith(expect.anything(), {
      tenantId: 'tenant-1',
      leadId: 'lead-1',
    });
  });
});
