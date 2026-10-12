import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { EffectivePermissionService } from '../services/effectivePermissions';
import { getOpportunityVisibilityFilter, getScopeClause } from '../services/recordAccess';

const router = Router();

router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { q, types, status, owner, limit = 20 } = req.query;

    if (!q || (q as string).trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Search query must be at least 2 characters' });
    }

    const searchTerm = q as string;
    const allowedTypes = types ? (types as string).split(',') : [
      'leads', 'opportunities', 'quotations', 'bookings', 'payments', 'siteVisits', 'projects', 'units', 'tasks',
    ];

    // Every search type requires the same read permission as its own module
    // (identical naming to authorize(object, 'read')), and scoped objects apply
    // the same record-access clause as their list routes.
    const TYPE_PERMS: Record<string, string> = {
      leads: 'LEAD_READ',
      opportunities: 'OPPORTUNITY_READ',
      quotations: 'QUOTATION_READ',
      bookings: 'BOOKING_READ',
      payments: 'PAYMENT_READ',
      siteVisits: 'SITE_VISIT_READ',
      projects: 'PROJECT_READ',
      units: 'UNIT_READ',
      tasks: 'TASK_READ',
    };
    const TYPE_SCOPES: Record<string, 'lead' | 'quotation' | 'booking' | 'siteVisit' | 'task'> = {
      leads: 'lead',
      quotations: 'quotation',
      bookings: 'booking',
      siteVisits: 'siteVisit',
      tasks: 'task',
    };
    const effectivePerms = req.user!.isSuperAdmin
      ? null
      : await EffectivePermissionService.getEffectivePermissionsCached(req.user!, req.user!.id);

    const searchConfig: Record<string, { model: any; titleField: string; subtitleField: string; urlPrefix: string; whereExtra?: any }> = {
      leads: {
        model: prisma.lead,
        titleField: 'firstName',
        subtitleField: 'phone',
        urlPrefix: '/leads',
        whereExtra: {
          OR: [
            { leadNumber: { contains: searchTerm, mode: 'insensitive' } },
            { firstName: { contains: searchTerm, mode: 'insensitive' } },
            { lastName: { contains: searchTerm, mode: 'insensitive' } },
            { phone: { contains: searchTerm } },
            { email: { contains: searchTerm, mode: 'insensitive' } },
          ],
        },
      },
      quotations: {
        model: prisma.quotation,
        titleField: 'number',
        subtitleField: 'status',
        urlPrefix: '/quotations',
        whereExtra: {
          number: { contains: searchTerm, mode: 'insensitive' },
        },
      },
      siteVisits: {
        model: prisma.siteVisit,
        titleField: 'siteVisitNumber',
        subtitleField: 'status',
        urlPrefix: '/site-visits',
        whereExtra: {
          siteVisitNumber: { contains: searchTerm, mode: 'insensitive' },
        },
      },
      opportunities: {
        model: prisma.opportunity,
        titleField: 'name',
        subtitleField: 'stage',
        urlPrefix: '/opportunities',
        whereExtra: {
          name: { contains: searchTerm, mode: 'insensitive' },
        },
      },
      bookings: {
        model: prisma.booking,
        titleField: 'number',
        subtitleField: 'status',
        urlPrefix: '/bookings',
        whereExtra: {
          number: { contains: searchTerm, mode: 'insensitive' },
        },
      },
      payments: {
        model: prisma.payment,
        titleField: 'reference',
        subtitleField: 'status',
        urlPrefix: '/payments',
        whereExtra: {
          OR: [
            { reference: { contains: searchTerm, mode: 'insensitive' } },
            { notes: { contains: searchTerm, mode: 'insensitive' } },
          ],
        },
      },
      projects: {
        model: prisma.project,
        titleField: 'name',
        subtitleField: 'city',
        urlPrefix: '/projects',
        whereExtra: {
          OR: [
            { name: { contains: searchTerm, mode: 'insensitive' } },
            { city: { contains: searchTerm, mode: 'insensitive' } },
            { address: { contains: searchTerm, mode: 'insensitive' } },
          ],
        },
      },
      units: {
        model: prisma.unit,
        titleField: 'number',
        subtitleField: 'type',
        urlPrefix: '/units',
        whereExtra: {
          number: { contains: searchTerm, mode: 'insensitive' },
        },
      },
      tasks: {
        model: prisma.task,
        titleField: 'title',
        subtitleField: 'status',
        urlPrefix: '/tasks',
        whereExtra: {
          OR: [
            { title: { contains: searchTerm, mode: 'insensitive' } },
            { description: { contains: searchTerm, mode: 'insensitive' } },
          ],
        },
      },
    };

    const searchPromises = allowedTypes
      .filter((type) => searchConfig[type])
      .map(async (type) => {
        const config = searchConfig[type];
        const requiredPerm = TYPE_PERMS[type];
        if (effectivePerms && requiredPerm && !EffectivePermissionService.hasPermissionIn(effectivePerms, requiredPerm)) {
          return [];
        }
        const where: any = { tenantId: req.tenantId!, ...config.whereExtra };
        if (type === 'opportunities') Object.assign(where, await getOpportunityVisibilityFilter(req.tenantId!, req.user!.id, 'read'));
        const scopeKind = TYPE_SCOPES[type];
        if (scopeKind) {
          const clause = await getScopeClause(req.user!, scopeKind);
          if (clause) where.AND = [...(where.AND || []), clause];
        }
        if (status && type !== 'payments') where.status = status;
        if (owner && ['leads', 'opportunities', 'tasks'].includes(type)) where.ownerId = owner;

        const items = await config.model.findMany({
          where,
          take: Number(limit),
          orderBy: { createdAt: 'desc' },
        });

        return items.map((item: any) => ({
          id: item.id,
          type,
          title: item[config.titleField] || 'Untitled',
          subtitle: item[config.subtitleField] || '',
          url: `${config.urlPrefix}/${item.id}`,
          tenantId: req.tenantId,
          data: item,
        }));
      });

    const searchResults = await Promise.all(searchPromises);
    const flatResults = searchResults.flat().slice(0, Number(limit));

    res.json({ success: true, data: flatResults, total: flatResults.length });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

router.get('/quick', async (req: AuthRequest, res: Response) => {
  try {
    const { q, limit = 5 } = req.query;

    if (!q || (q as string).trim().length < 2) {
      return res.json({ success: true, data: [] });
    }

    const searchTerm = q as string;
    const numLimit = Number(limit);

    const perms = await EffectivePermissionService.getEffectivePermissionsCached(req.user!, req.user!.id);
    const isSuper = !!req.user!.isSuperAdmin;
    const canReadOpportunities = isSuper || EffectivePermissionService.hasPermissionIn(perms, 'OPPORTUNITY_READ');
    const canReadLeads = isSuper || EffectivePermissionService.hasPermissionIn(perms, 'LEAD_READ');
    const canReadTasks = isSuper || EffectivePermissionService.hasPermissionIn(perms, 'TASK_READ');
    const opportunityWhere = canReadOpportunities
      ? await getOpportunityVisibilityFilter(req.tenantId!, req.user!.id, 'read')
      : { id: { in: [] as string[] } };

    const leadScope = await getScopeClause(req.user!, 'lead');
    const taskScope = await getScopeClause(req.user!, 'task');

    const leadWhere: any = canReadLeads
      ? {
          tenantId: req.tenantId!,
          OR: [
            { leadNumber: { contains: searchTerm, mode: 'insensitive' } },
            { firstName: { contains: searchTerm, mode: 'insensitive' } },
            { lastName: { contains: searchTerm, mode: 'insensitive' } },
            { phone: { contains: searchTerm } },
          ],
        }
      : { id: { in: [] as string[] } };
    if (leadScope && canReadLeads) leadWhere.AND = [leadScope];

    const taskWhere: any = canReadTasks
      ? {
          tenantId: req.tenantId!,
          title: { contains: searchTerm, mode: 'insensitive' },
        }
      : { id: { in: [] as string[] } };
    if (taskScope && canReadTasks) taskWhere.AND = [taskScope];

    const [leads, opportunities, tasks] = await Promise.all([
      prisma.lead.findMany({
        where: leadWhere,
        select: { id: true, leadNumber: true, firstName: true, lastName: true, phone: true, status: true },
        take: numLimit,
      }),
      prisma.opportunity.findMany({
        where: {
          ...opportunityWhere,
          name: { contains: searchTerm, mode: 'insensitive' },
        },
        select: { id: true, name: true, stage: true, amount: true },
        take: numLimit,
      }),
      prisma.task.findMany({
        where: taskWhere,
        select: { id: true, title: true, status: true, priority: true },
        take: numLimit,
      }),
    ]);

    res.json({
      success: true,
      data: {
        leads: leads.map((l) => ({ ...l, type: 'lead', url: `/leads/${l.id}` })),
        opportunities: opportunities.map((o) => ({ ...o, type: 'opportunity', url: `/opportunities/${o.id}` })),
        tasks: tasks.map((t) => ({ ...t, type: 'task', url: `/tasks/${t.id}` })),
      },
    });
  } catch (error) {
    console.error('Quick search error:', error);
    res.status(500).json({ success: false, error: 'Quick search failed' });
  }
});

export { router as searchRoutes };