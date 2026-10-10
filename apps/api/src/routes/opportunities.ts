import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authorize } from '../middleware/authorization';
import { auditLog } from '../middleware/audit';
import { getOpportunityVisibilityFilter } from '../services/recordAccess';

const router = Router();

router.use(authenticate);

const opportunitySchema = z.object({
  name: z.string().min(1).max(200),
  leadId: z.string().optional(),
  ownerId: z.string().optional(),
  queueId: z.string().optional(),
  projectId: z.string().optional(),
  stage: z.enum(['PROSPECTING', 'QUALIFICATION', 'NEEDS_ANALYSIS', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST']).optional(),
  amount: z.number().min(0).optional(),
  expectedCloseDate: z.string().datetime().optional(),
  probability: z.number().min(0).max(100).optional(),
  description: z.string().max(2000).optional(),
  lostReason: z.string().max(500).optional(),
});

const updateOpportunitySchema = opportunitySchema.partial();

const greRegistrationRelations = {
  greSessions: {
    where: { status: 'COMPLETED' as const },
    take: 1,
    orderBy: [{ completedAt: 'desc' as const }, { createdAt: 'desc' as const }, { id: 'desc' as const }],
    include: { SiteVisit: { include: { project: { select: { name: true } } } } },
  },
  greRegistrationSessions: {
    where: { status: 'COMPLETED' as const },
    take: 1,
    orderBy: [{ completedAt: 'desc' as const }, { createdAt: 'desc' as const }, { id: 'desc' as const }],
    include: { siteVisit: { include: { project: { select: { name: true } } } } },
  },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string' && value.length > 0) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

function greRegistrationSnapshot(opportunity: { lead?: unknown }) {
  const leadRecord = asRecord(opportunity.lead);
  const sessions = [
    ...(Array.isArray(leadRecord.greRegistrationSessions) ? leadRecord.greRegistrationSessions : []),
    ...(Array.isArray(leadRecord.greSessions) ? leadRecord.greSessions : []),
  ].map(asRecord).sort((left, right) => {
    const leftDate = asDate(left.completedAt) ?? asDate(left.createdAt);
    const rightDate = asDate(right.completedAt) ?? asDate(right.createdAt);
    return (rightDate?.getTime() ?? 0) - (leftDate?.getTime() ?? 0);
  });
  const session = sessions[0];
  if (!session) return null;

  const snapshot = asRecord(session.draft ?? session.payload);
  const lead = asRecord(snapshot.lead);
  const visit = asRecord(snapshot.siteVisit);
  const company = asRecord(snapshot.company);
  const siteVisit = asRecord(session.siteVisit ?? session.SiteVisit);
  const scheduledDate = asDate(siteVisit.scheduledAt);
  const scheduledAt = scheduledDate?.toISOString() ?? null;
  const project = nullableString(asRecord(siteVisit.project).name)
    ?? nullableString(visit.project)
    ?? nullableString(visit.projectName);

  return {
    referenceNumber: nullableString(session.referenceNumber),
    submittedAt: asDate(session.completedAt)?.toISOString() ?? null,
    lead: {
      firstName: nullableString(lead.firstName),
      lastName: nullableString(lead.lastName),
      email: nullableString(lead.email),
      phone: nullableString(lead.phone) ?? nullableString(session.phone),
      company: nullableString(company.name) ?? nullableString(lead.company),
      budget: nullableNumber(lead.budget),
      preferredLocation: nullableString(lead.preferredLocation),
    },
    siteVisit: {
      date: nullableString(visit.date) ?? (scheduledAt ? scheduledAt.slice(0, 10) : null),
      time: nullableString(visit.time) ?? (scheduledAt ? scheduledAt.slice(11, 16) : null),
      project,
      scheduledAt,
      visitType: nullableString(visit.visitType),
      visitorCount: nullableNumber(visit.visitorCount),
    },
    company: {
      name: nullableString(company.name),
      type: nullableString(company.type),
      industry: nullableString(company.industry),
    },
  };
}

function withGreRegistration<T extends { lead?: unknown }>(opportunity: T) {
  return {
    ...opportunity,
    greRegistration: greRegistrationSnapshot(opportunity),
  };
}

router.get('/', authorize('Opportunity', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId } = req.user!;
    const {
      page = 1,
      limit = 20,
      search,
      stage,
      leadId,
      ownerId,
      projectId,
      minAmount,
      maxAmount,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const where: any = await getOpportunityVisibilityFilter(tenantId, req.user!.id, 'read');
    if (stage) where.stage = stage;
    if (leadId) where.leadId = leadId;
    if (ownerId) where.ownerId = ownerId;
    if (projectId) where.projectId = projectId;
    if (minAmount) where.amount = { ...where.amount, gte: Number(minAmount) };
    if (maxAmount) where.amount = { ...where.amount, lte: Number(maxAmount) };
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const [opportunities, total] = await Promise.all([
      prisma.opportunity.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { [sortBy as string]: sortOrder },
        include: {
          lead: {
            select: {
              id: true, firstName: true, lastName: true, phone: true, email: true,
              ...greRegistrationRelations,
            },
          },
          owner: { select: { id: true, firstName: true, lastName: true } },
          creator: { select: { id: true, firstName: true, lastName: true } },
          project: { select: { id: true, name: true } },
          unit: { select: { id: true, number: true, price: true } },
          quotations: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { totalAmount: true },
          },
          bookings: {
            where: { status: { not: 'CANCELLED' } },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { status: true, totalAmount: true, unit: { select: { number: true } } },
          },
          _count: { select: { quotations: true, bookings: true, activities: true } },
        },
      }),
      prisma.opportunity.count({ where }),
    ]);

    res.json({
      success: true,
      data: opportunities.map(withGreRegistration),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get opportunities error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch opportunities' });
  }
});

router.get('/:id', authorize('Opportunity', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId } = req.user!;

    const opportunity = await prisma.opportunity.findFirst({
      where: { ...(await getOpportunityVisibilityFilter(tenantId, req.user!.id, 'read')), id: req.params.id },
      include: {
        lead: {
          select: {
            id: true, leadNumber: true, firstName: true, lastName: true, email: true,
            phone: true, mobile: true, company: true, status: true, street: true,
            city: true, stateProvince: true, postalCode: true, country: true,
            ...greRegistrationRelations,
          },
        },
        owner: { select: { id: true, firstName: true, lastName: true, email: true } },
        creator: { select: { id: true, firstName: true, lastName: true } },
        project: { select: { id: true, name: true, city: true, address: true } },
        unit: { select: { id: true, number: true, type: true, area: true, price: true } },
        siteVisit: { select: { id: true, siteVisitNumber: true, status: true, completedAt: true } },
        quotations: { orderBy: { createdAt: 'desc' }, select: { id: true, number: true, totalAmount: true, status: true } },
        bookings: { select: { id: true, number: true, status: true, totalAmount: true } },
        activities: { take: 10, orderBy: { createdAt: 'desc' }, include: { user: { select: { firstName: true, lastName: true } } } },
        tasks: { take: 10, orderBy: { createdAt: 'desc' }, include: { owner: { select: { firstName: true, lastName: true } } } },
      },
    });

    if (!opportunity) {
      return res.status(404).json({ success: false, error: 'Opportunity not found' });
    }

    res.json({ success: true, data: withGreRegistration(opportunity) });
  } catch (error) {
    console.error('Get opportunity error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch opportunity' });
  }
});

router.post('/', authorize('Opportunity', 'create'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;
    const data = opportunitySchema.parse(req.body);

    const relationChecks = await Promise.all([
      data.ownerId ? prisma.user.count({ where: { id: data.ownerId, tenantId, isActive: true } }) : 1,
      data.leadId ? prisma.lead.count({ where: { id: data.leadId, tenantId } }) : 1,
      data.queueId ? prisma.queue.count({ where: { id: data.queueId, tenantId, isActive: true } }) : 1,
      data.projectId ? prisma.project.count({ where: { id: data.projectId, tenantId, isActive: true } }) : 1,
    ]);
    if (relationChecks.some((count) => count !== 1)) {
      return res.status(400).json({ success: false, error: 'One or more related records are invalid for this tenant' });
    }

    const opportunity = await prisma.opportunity.create({
      data: {
        tenantId,
        name: data.name,
        leadId: data.leadId,
        ownerId: data.ownerId,
        creatorId: userId,
        queueId: data.queueId,
        projectId: data.projectId,
        stage: data.stage || 'PROSPECTING',
        amount: data.amount,
        expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate) : undefined,
        probability: data.probability,
        description: data.description,
        lostReason: data.lostReason,
      },
      include: {
        lead: {
          select: {
            id: true, firstName: true, lastName: true,
            ...greRegistrationRelations,
          },
        },
        owner: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await auditLog(tenantId, userId, 'CREATE', 'Opportunity', opportunity.id, null, { name: data.name, stage: data.stage, amount: data.amount });

    res.status(201).json({ success: true, data: withGreRegistration(opportunity) });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Create opportunity error:', error);
    res.status(500).json({ success: false, error: 'Failed to create opportunity' });
  }
});

router.put('/:id', authorize('Opportunity', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;

    const existing = await prisma.opportunity.findFirst({
      where: { id: req.params.id, tenantId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Opportunity not found' });
    }

    const data = updateOpportunitySchema.parse(req.body);

    const visible = await prisma.opportunity.findFirst({
      where: { ...(await getOpportunityVisibilityFilter(tenantId, userId, 'edit')), id: req.params.id },
      select: { id: true },
    });
    if (!visible) return res.status(403).json({ success: false, error: 'You do not have edit access to this opportunity' });

    const relationChecks = await Promise.all([
      data.ownerId ? prisma.user.count({ where: { id: data.ownerId, tenantId, isActive: true } }) : 1,
      data.leadId ? prisma.lead.count({ where: { id: data.leadId, tenantId } }) : 1,
      data.queueId ? prisma.queue.count({ where: { id: data.queueId, tenantId, isActive: true } }) : 1,
      data.projectId ? prisma.project.count({ where: { id: data.projectId, tenantId, isActive: true } }) : 1,
    ]);
    if (relationChecks.some((count) => count !== 1)) {
      return res.status(400).json({ success: false, error: 'One or more related records are invalid for this tenant' });
    }

    const opportunity = await prisma.opportunity.update({
      where: { id: req.params.id },
      data: {
        ...data,
        expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate) : undefined,
      },
      include: {
        lead: {
          select: {
            id: true, firstName: true, lastName: true,
            ...greRegistrationRelations,
          },
        },
      },
    });

    await auditLog(tenantId, userId, 'UPDATE', 'Opportunity', opportunity.id, existing, opportunity);

    res.json({ success: true, data: withGreRegistration(opportunity) });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Update opportunity error:', error);
    res.status(500).json({ success: false, error: 'Failed to update opportunity' });
  }
});

router.patch('/:id/stage', authorize('Opportunity', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;

    const existing = await prisma.opportunity.findFirst({
      where: { ...(await getOpportunityVisibilityFilter(tenantId, userId, 'edit')), id: req.params.id },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Opportunity not found' });
    }

    const parsedStage = z.object({
      stage: opportunitySchema.shape.stage.unwrap(),
      lostReason: z.string().max(500).optional(),
    }).parse(req.body);
    const updateData: any = { stage: parsedStage.stage };
    if (parsedStage.stage === 'CLOSED_LOST' && parsedStage.lostReason) {
      updateData.lostReason = parsedStage.lostReason;
    }

    const opportunity = await prisma.opportunity.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        lead: {
          select: {
            id: true, firstName: true, lastName: true,
            ...greRegistrationRelations,
          },
        },
      },
    });

    await auditLog(tenantId, userId, 'UPDATE', 'Opportunity', opportunity.id, existing, parsedStage);

    res.json({ success: true, data: withGreRegistration(opportunity) });
  } catch (error) {
    console.error('Update opportunity stage error:', error);
    res.status(500).json({ success: false, error: 'Failed to update opportunity stage' });
  }
});

router.delete('/:id', authorize('Opportunity', 'delete'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;

    const existing = await prisma.opportunity.findFirst({
      where: { ...(await getOpportunityVisibilityFilter(tenantId, userId, 'delete')), id: req.params.id },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Opportunity not found' });
    }

    await prisma.opportunity.delete({ where: { id: req.params.id } });

    await auditLog(tenantId, userId, 'DELETE', 'Opportunity', existing.id, existing, null);

    res.json({ success: true, data: null });
  } catch (error) {
    console.error('Delete opportunity error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete opportunity' });
  }
});

export default router;