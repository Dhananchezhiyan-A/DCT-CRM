import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authorize } from '../middleware/authorization';
import {
  applyScope,
  getLeadRecordScope,
  getScopeClause,
  leadScopeClause,
} from '../services/recordAccess';

const router = Router();

router.use(authenticate);

function parseDateFilter(startDate?: string, endDate?: string) {
  const dateFilter: any = {};
  if (startDate) dateFilter.gte = new Date(startDate as string);
  if (endDate) {
    const end = new Date(endDate as string);
    end.setHours(23, 59, 59, 999);
    dateFilter.lte = end;
  }
  return dateFilter;
}

router.get('/leads', authorize('Lead', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    const dateFilter = parseDateFilter(startDate as string, endDate as string);

    let where: any = { tenantId: req.tenantId! };
    if (startDate || endDate) where.createdAt = dateFilter;
    where = applyScope(where, leadScopeClause(await getLeadRecordScope(req.user!)));

    const [total, byStatus, bySource, byOwner, recentTrend] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      }),
      prisma.lead.groupBy({
        by: ['source'],
        where,
        _count: { id: true },
      }),
      prisma.lead.groupBy({
        by: ['ownerId'],
        where: { ...where, ownerId: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      prisma.lead.findMany({
        where,
        select: { createdAt: true, status: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const ownerIds = byOwner.map((o) => o.ownerId!).filter(Boolean);
    const owners = ownerIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: ownerIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];

    res.json({
      success: true,
      data: {
        total,
        byStatus: byStatus.map((s) => ({ status: s.status, count: s._count.id })),
        bySource: bySource.map((s) => ({ source: s.source, count: s._count.id })),
        byOwner: byOwner.map((o) => ({
          owner: owners.find((u) => u.id === o.ownerId),
          count: o._count.id,
        })),
        trend: recentTrend,
      },
    });
  } catch (error) {
    console.error('Lead analytics error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch lead analytics' });
  }
});

router.get('/opportunities', authorize('Opportunity', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    const dateFilter = parseDateFilter(startDate as string, endDate as string);

    let where: any = { tenantId: req.tenantId! };
    if (startDate || endDate) where.createdAt = dateFilter;
    where = applyScope(where, await getScopeClause(req.user!, 'opportunity'));

    const [total, byStage, totalAmount, avgAmount, wonAmount, lostCount, byOwner] = await Promise.all([
      prisma.opportunity.count({ where }),
      prisma.opportunity.groupBy({
        by: ['stage'],
        where,
        _count: { id: true },
        _sum: { amount: true },
      }),
      prisma.opportunity.aggregate({
        where,
        _sum: { amount: true },
      }),
      prisma.opportunity.aggregate({
        where: { ...where, amount: { not: null } },
        _avg: { amount: true },
      }),
      prisma.opportunity.aggregate({
        where: { ...where, stage: 'CLOSED_WON' },
        _sum: { amount: true },
      }),
      prisma.opportunity.count({
        where: { ...where, stage: 'CLOSED_LOST' },
      }),
      prisma.opportunity.groupBy({
        by: ['ownerId'],
        where: { ...where, ownerId: { not: null } },
        _count: { id: true },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 10,
      }),
    ]);

    const ownerIds = byOwner.map((o) => o.ownerId!).filter(Boolean);
    const owners = ownerIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: ownerIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];

    const winRate = total > 0 ? ((total - lostCount) / total) * 100 : 0;

    res.json({
      success: true,
      data: {
        total,
        totalAmount: totalAmount._sum.amount || 0,
        avgAmount: avgAmount._avg.amount || 0,
        wonAmount: wonAmount._sum.amount || 0,
        lostCount,
        winRate: Math.round(winRate * 100) / 100,
        byStage: byStage.map((s) => ({
          stage: s.stage,
          count: s._count.id,
          amount: s._sum.amount || 0,
        })),
        byOwner: byOwner.map((o) => ({
          owner: owners.find((u) => u.id === o.ownerId),
          count: o._count.id,
          amount: o._sum.amount || 0,
        })),
      },
    });
  } catch (error) {
    console.error('Opportunity analytics error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch opportunity analytics' });
  }
});

router.get('/bookings', authorize('Booking', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    const dateFilter = parseDateFilter(startDate as string, endDate as string);

    let where: any = { tenantId: req.tenantId! };
    if (startDate || endDate) where.createdAt = dateFilter;
    where = applyScope(where, await getScopeClause(req.user!, 'booking'));

    const [total, byStatus, totalAmount, byProject, recentBookings] = await Promise.all([
      prisma.booking.count({ where }),
      prisma.booking.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
        _sum: { totalAmount: true },
      }),
      prisma.booking.aggregate({
        where,
        _sum: { totalAmount: true },
        _avg: { totalAmount: true },
      }),
      prisma.booking.groupBy({
        by: ['projectId'],
        where,
        _count: { id: true },
        _sum: { totalAmount: true },
        orderBy: { _sum: { totalAmount: 'desc' } },
        take: 10,
      }),
      prisma.booking.findMany({
        where,
        include: {
          lead: { select: { firstName: true, lastName: true } },
          unit: { select: { number: true, type: true } },
          project: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const projectIds = byProject.map((p) => p.projectId).filter(Boolean);
    const projects = projectIds.length > 0
      ? await prisma.project.findMany({
          where: { id: { in: projectIds } },
          select: { id: true, name: true },
        })
      : [];

    res.json({
      success: true,
      data: {
        total,
        totalAmount: totalAmount._sum.totalAmount || 0,
        avgAmount: totalAmount._avg.totalAmount || 0,
        byStatus: byStatus.map((s) => ({
          status: s.status,
          count: s._count.id,
          amount: s._sum.totalAmount || 0,
        })),
        byProject: byProject.map((p) => ({
          project: projects.find((proj) => proj.id === p.projectId),
          count: p._count.id,
          amount: p._sum.totalAmount || 0,
        })),
        recentBookings,
      },
    });
  } catch (error) {
    console.error('Booking analytics error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch booking analytics' });
  }
});

router.get('/payments', authorize('Payment', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    const dateFilter = parseDateFilter(startDate as string, endDate as string);

    const where: any = { tenantId: req.tenantId! };
    if (startDate || endDate) where.createdAt = dateFilter;

    const [total, byStatus, totalAmount, verifiedAmount, pendingAmount, recentPayments] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where,
        _sum: { amount: true },
        _avg: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { ...where, status: 'COMPLETED' },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { ...where, status: 'PENDING' },
        _sum: { amount: true },
      }),
      prisma.payment.findMany({
        where,
        include: {
          booking: { select: { number: true, lead: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    res.json({
      success: true,
      data: {
        total,
        totalAmount: totalAmount._sum.amount || 0,
        avgAmount: totalAmount._avg.amount || 0,
        verifiedAmount: verifiedAmount._sum.amount || 0,
        pendingAmount: pendingAmount._sum.amount || 0,
        byStatus: byStatus.map((s) => ({
          status: s.status,
          count: s._count.id,
          amount: s._sum.amount || 0,
        })),
        recentPayments,
      },
    });
  } catch (error) {
    console.error('Payment analytics error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch payment analytics' });
  }
});

router.get('/projects', authorize('Project', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId!;

    const [bookingScope, leadScope] = await Promise.all([
      getScopeClause(req.user!, 'booking'),
      getLeadRecordScope(req.user!),
    ]);

    const [projects, unitStats, bookingStats, leadStats] = await Promise.all([
      prisma.project.findMany({
        where: { tenantId },
        include: {
          _count: {
            select: { units: true, leads: true, bookings: true, opportunities: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.unit.groupBy({
        by: ['projectId', 'status'],
        where: { tenantId },
        _count: { id: true },
      }),
      prisma.booking.groupBy({
        by: ['projectId'],
        where: applyScope(
          { tenantId, status: { in: ['CONFIRMED', 'COMPLETED'] } },
          bookingScope,
        ),
        _sum: { totalAmount: true },
      }),
      prisma.lead.groupBy({
        by: ['projectId'],
        where: applyScope({ tenantId }, leadScopeClause(leadScope)),
        _count: { id: true },
      }),
    ]);

    const unitsByProject = new Map<string, Array<{ status: string; count: number }>>();
    for (const row of unitStats) {
      if (!row.projectId) continue;
      const list = unitsByProject.get(row.projectId) || [];
      list.push({ status: row.status, count: row._count.id });
      unitsByProject.set(row.projectId, list);
    }

    const revenueByProject = new Map<string, number>();
    for (const row of bookingStats) {
      if (!row.projectId) continue;
      revenueByProject.set(row.projectId, row._sum.totalAmount || 0);
    }

    const leadsByProject = new Map<string, number>();
    for (const row of leadStats) {
      if (!row.projectId) continue;
      leadsByProject.set(row.projectId, row._count.id);
    }

    const projectStats = projects.map((project) => ({
      ...project,
      unitStats: unitsByProject.get(project.id) || [],
      revenue: revenueByProject.get(project.id) || 0,
      leadCount: leadsByProject.get(project.id) || 0,
    }));

    res.json({ success: true, data: projectStats });
  } catch (error) {
    console.error('Project analytics error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch project analytics' });
  }
});

router.get('/pipeline', authorize('Opportunity', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const stages = ['PROSPECTING', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST'];
    const scopeClause = await getScopeClause(req.user!, 'opportunity');
    const baseWhere = applyScope({ tenantId: req.tenantId! }, scopeClause);

    const grouped = await prisma.opportunity.groupBy({
      by: ['stage'],
      where: baseWhere,
      _count: { id: true },
      _sum: { amount: true },
    });
    const byStage = new Map(grouped.map((row) => [row.stage, row]));

    const pipelineData = stages.map((stage) => {
      const row = byStage.get(stage as any);
      return {
        stage,
        count: row?._count.id ?? 0,
        amount: row?._sum.amount || 0,
      };
    });

    const totalPipeline = pipelineData
      .filter((p) => !['CLOSED_WON', 'CLOSED_LOST'].includes(p.stage))
      .reduce((acc, p) => acc + p.amount, 0);

    const opportunitiesWithProb = await prisma.opportunity.findMany({
      where: {
        ...baseWhere,
        stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] },
        probability: { not: null },
        amount: { not: null },
      },
      select: { amount: true, probability: true },
    });

    const weighted = opportunitiesWithProb.reduce(
      (acc, o) => acc + (o.amount || 0) * ((o.probability || 0) / 100),
      0
    );

    res.json({
      success: true,
      data: {
        stages: pipelineData,
        totalPipeline,
        weightedPipeline: weighted,
      },
    });
  } catch (error) {
    console.error('Pipeline analytics error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch pipeline analytics' });
  }
});

export { router as analyticsRoutes };