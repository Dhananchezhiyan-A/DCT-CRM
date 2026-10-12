import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '@dct-crm/db';
import { crmDateToUtcStart } from '@dct-crm/shared';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authorize } from '../middleware/authorization';
import { auditLog } from '../middleware/audit';
import {
  applyScope,
  canAccessLead,
  canAccessLeadId,
  canAccessSiteVisit,
  getScopeClause,
} from '../services/recordAccess';
import { getNextSiteVisitNumber, normalizeOverdueSiteVisits } from '../services/leadWorkflowExtras';
import { canTransitionStatus } from '../services/workflow';
import { checkSiteVisitLocation } from '../services/siteVisitLocation';
import {
  assignCompletedSiteVisitToSalesInTransaction,
  assignSiteVisitToSVCInTransaction,
} from '../services/rrQueue';
import { validateObjectCustomFields } from '../services/customFieldValidation';
import { tagLeadSiteVisitEvents } from '../services/leadEventTagging';

const router = Router();

router.use(authenticate);

const siteVisitSchema = z.object({
  leadId: z.string().min(1, 'Lead ID is required'),
  projectId: z.string().min(1, 'Project is required'),
  assigneeId: z.string().optional(),
  queueId: z.string().optional(),
  scheduledAt: z.string().datetime(),
  status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED']).optional(),
  notes: z.string().min(1, 'Note/reason is required').max(2000),
  feedback: z.string().max(1000).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  customFields: z.record(z.unknown()).optional(),
});

const updateSiteVisitSchema = siteVisitSchema.partial();
const siteVisitLocationSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().positive(),
  timestamp: z.number().finite().positive(),
});

const completeSiteVisitSchema = z.object({
  completedAt: z.string().datetime('Completion time is required'),
  customerFeedback: z.string().min(1, 'Customer feedback is required').refine((v) => v.trim().length > 0, 'Customer feedback is required'),
  completionNotes: z.string().min(1, 'Completion notes are required').refine((v) => v.trim().length > 0, 'Completion notes are required'),
}).merge(siteVisitLocationSchema);

class SiteVisitCompletionConflict extends Error {}

const cancelSiteVisitSchema = z.object({
  reason: z.string().min(1, 'Reason is required').refine((v) => v.trim().length > 0, {
    message: 'Reason is required',
  }),
});

const revisitSiteVisitSchema = z.object({
  reason: z.string().min(1, 'Reason is required').refine((v) => v.trim().length > 0, {
    message: 'Reason is required',
  }),
  scheduledAt: z.string().datetime({ message: 'Visit date/time is required' }),
  projectId: z.string().min(1, 'Project is required'),
  assigneeId: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

router.get('/', authorize('SiteVisit', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId } = req.user!;
    await normalizeOverdueSiteVisits(tenantId);
    const {
      page = 1,
      limit = 20,
      leadId,
      projectId,
      assigneeId,
      status,
      search,
      startDate,
      endDate,
      sortBy = 'scheduledAt',
      sortOrder = 'desc',
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    let where: any = { tenantId };
    if (leadId) where.leadId = leadId;
    if (projectId) where.projectId = projectId;
    if (assigneeId) where.assigneeId = assigneeId;
    if (status) where.status = status;
    if (search && String(search).trim()) {
      const term = String(search).trim();
      where.OR = [
        { siteVisitNumber: { contains: term, mode: 'insensitive' } },
        { lead: { leadNumber: { contains: term, mode: 'insensitive' } } },
        { lead: { firstName: { contains: term, mode: 'insensitive' } } },
        { lead: { lastName: { contains: term, mode: 'insensitive' } } },
        { lead: { phone: { contains: term } } },
        { lead: { company: { contains: term, mode: 'insensitive' } } },
        { lead: { email: { contains: term, mode: 'insensitive' } } },
      ];
    }
    if (startDate && endDate) {
      const end = crmDateToUtcStart(String(endDate));
      end.setUTCDate(end.getUTCDate() + 1);
      where.scheduledAt = {
        gte: crmDateToUtcStart(String(startDate)),
        lt: end,
      };
    }
    where = applyScope(where, await getScopeClause(req.user!, 'siteVisit'));

    const [siteVisits, total] = await Promise.all([
      prisma.siteVisit.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { [sortBy as string]: sortOrder },
        include: {
          lead: { select: { id: true, leadNumber: true, firstName: true, lastName: true, phone: true, company: true, email: true } },
          project: { select: { id: true, name: true, allowedRadiusMeters: true } },
          assignee: { select: { id: true, firstName: true, lastName: true } },
          creator: { select: { id: true, firstName: true, lastName: true, email: true, profile: { select: { name: true } } } },
          completedBy: { select: { id: true, firstName: true, lastName: true, email: true, profile: { select: { name: true } } } },
          cancelledBy: { select: { id: true, firstName: true, lastName: true, email: true, profile: { select: { name: true } } } },
        },
      }),
      prisma.siteVisit.count({ where }),
    ]);

    res.json({
      success: true,
      data: siteVisits,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get site visits error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch site visits' });
  }
});

router.get('/:id', authorize('SiteVisit', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId } = req.user!;
    await normalizeOverdueSiteVisits(tenantId);

    const siteVisit = await prisma.siteVisit.findFirst({
      where: { id: req.params.id, tenantId },
      include: {
        lead: { select: { id: true, leadNumber: true, firstName: true, lastName: true, phone: true, company: true, email: true, status: true, owner: { select: { id: true, firstName: true, lastName: true, email: true, profile: { select: { name: true } } } } } },
        project: { select: { id: true, name: true, allowedRadiusMeters: true } },
        assignee: { select: { id: true, firstName: true, lastName: true, email: true } },
        creator: { select: { id: true, firstName: true, lastName: true, email: true, profile: { select: { name: true } } } },
        completedBy: { select: { id: true, firstName: true, lastName: true, email: true, profile: { select: { name: true } } } },
        cancelledBy: { select: { id: true, firstName: true, lastName: true, email: true, profile: { select: { name: true } } } },
        previousSiteVisit: { select: { id: true, siteVisitNumber: true, status: true, scheduledAt: true } },
        activities: { take: 10, orderBy: { createdAt: 'desc' } },
        tasks: { take: 10, orderBy: { createdAt: 'desc' } },
      },
    });

    if (!siteVisit) {
      return res.status(404).json({ success: false, error: 'Site visit not found' });
    }

    if (!(await canAccessSiteVisit(req.user!, siteVisit))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this site visit' });
    }

    res.json({ success: true, data: siteVisit });
  } catch (error) {
    console.error('Get site visit error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch site visit' });
  }
});

router.get('/:id/history', authorize('SiteVisit', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 100);
    if (!Number.isInteger(page) || page < 1 || page > 100 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({ success: false, error: 'Invalid site visit history page or limit' });
    }

    const siteVisit = await prisma.siteVisit.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      select: { id: true, leadId: true, tenantId: true, assigneeId: true, creatorId: true },
    });

    if (!siteVisit) {
      return res.status(404).json({ success: false, error: 'Site visit not found' });
    }
    if (!(await canAccessSiteVisit(req.user!, siteVisit))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this site visit' });
    }

    const where = {
      tenantId: siteVisit.tenantId,
      objectType: 'SiteVisit',
      objectId: siteVisit.id,
    };
    const [entries, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      success: true,
      data: entries,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Get site visit history error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch site visit history' });
  }
});

router.post('/', authorize('SiteVisit', 'create'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;
    const data = siteVisitSchema.parse(req.body);
    const customFieldError = data.customFields
      ? await validateObjectCustomFields(tenantId, 'SiteVisit', data.customFields, false)
      : null;
    if (customFieldError) {
      return res.status(400).json({ success: false, error: customFieldError });
    }

    const lead = await prisma.lead.findFirst({
      where: { id: data.leadId, tenantId },
      select: {
        id: true,
        tenantId: true,
        ownerId: true,
        creatorId: true,
        status: true,
        source: true,
        leadSubSource: true,
        rating: true,
      },
    });
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }
    if (!(await canAccessLead(req.user!, lead))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this lead' });
    }

    const siteVisitStatus = data.status || 'SCHEDULED';
    if (siteVisitStatus === 'COMPLETED') {
      return res.status(400).json({ success: false, error: 'Use the completion action to complete a site visit.' });
    }
    const result = await prisma.$transaction(async (tx) => {
      const project = await tx.project.findFirst({
        where: { id: data.projectId, tenantId, isActive: true },
        select: { id: true, name: true },
      });
      if (!project) throw new Error('PROJECT_NOT_AVAILABLE');

      const siteVisitNumber = await getNextSiteVisitNumber(tx, tenantId);
      const siteVisit = await tx.siteVisit.create({
        data: {
          tenantId,
          leadId: data.leadId,
          projectId: data.projectId,
          creatorId: userId,
          siteVisitNumber,
          scheduledAt: new Date(data.scheduledAt),
          status: siteVisitStatus,
          notes: data.notes,
          feedback: data.feedback,
          rating: data.rating,
          customFields: (data.customFields || {}) as Prisma.InputJsonObject,
        },
        select: { id: true },
      });
      if (siteVisitStatus === 'SCHEDULED') {
        await assignSiteVisitToSVCInTransaction(tx, {
          siteVisitId: siteVisit.id,
          tenantId,
          actorId: userId,
          requestedAssigneeId: data.assigneeId,
        });
      }

      const profileName = req.user!.profileName || 'Admin';
      if (
        siteVisitStatus === 'SCHEDULED' &&
        lead.status === 'PROSPECT' &&
        canTransitionStatus(profileName, 'PROSPECT', 'SITE_VISIT_SCHEDULED')
      ) {
        await tx.lead.update({
          where: { id: lead.id },
          data: { status: 'SITE_VISIT_SCHEDULED' },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            leadId: lead.id,
            action: 'SITE_VISIT_SCHEDULED',
            objectType: 'Lead',
            objectId: lead.id,
            oldValues: { status: 'PROSPECT' },
            newValues: { status: 'SITE_VISIT_SCHEDULED', siteVisitId: siteVisit.id, siteVisitNumber, reason: data.notes },
          },
        });
      }
      if (siteVisitStatus === 'SCHEDULED') {
        await tagLeadSiteVisitEvents(tx, {
          tenantId,
          leadId: lead.id,
          scheduledAt: new Date(data.scheduledAt),
          projectName: project.name,
          leadStatus:
            lead.status === 'PROSPECT' &&
            canTransitionStatus(profileName, 'PROSPECT', 'SITE_VISIT_SCHEDULED')
              ? 'Site Visit Scheduled'
              : undefined,
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          action: 'SITE_VISIT_CREATED',
          objectType: 'SiteVisit',
          objectId: siteVisit.id,
          newValues: { leadId: data.leadId, scheduledAt: data.scheduledAt, siteVisitNumber },
        },
      });
      return tx.siteVisit.findUniqueOrThrow({
        where: { id: siteVisit.id },
        include: {
          lead: { select: { id: true, firstName: true, lastName: true } },
          project: { select: { id: true, name: true } },
          assignee: { select: { id: true, firstName: true, lastName: true } },
        },
      });
    });

    res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    if (error instanceof Error && error.message === 'PROJECT_NOT_AVAILABLE') {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    if (error instanceof Error && ['SVC_QUEUE_NOT_CONFIGURED', 'NO_ELIGIBLE_SVC_MEMBER', 'SVC_ASSIGNEE_NOT_ELIGIBLE'].includes(error.message)) {
      return res.status(409).json({ success: false, error: 'No eligible SVC owner is configured for this project.' });
    }
    console.error('Create site visit error:', error);
    res.status(500).json({ success: false, error: 'Failed to create site visit' });
  }
});

router.put('/:id', authorize('SiteVisit', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;

    const existing = await prisma.siteVisit.findFirst({
      where: { id: req.params.id, tenantId },
      include: {
        lead: { select: { id: true, status: true, source: true, leadSubSource: true, rating: true } },
      },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Site visit not found' });
    }
    if (!(await canAccessSiteVisit(req.user!, existing))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this site visit' });
    }
    if (existing.status !== 'SCHEDULED') {
      return res.status(400).json({ success: false, error: 'Historical site visits cannot be edited' });
    }

    const data = updateSiteVisitSchema.parse(req.body);
    if (data.customFields) {
      const customFieldError = await validateObjectCustomFields(
        tenantId,
        'SiteVisit',
        data.customFields,
        false,
      );
      if (customFieldError) {
        return res.status(400).json({ success: false, error: customFieldError });
      }
      const storedCustomFields = existing.customFields;
      data.customFields = {
        ...(storedCustomFields && typeof storedCustomFields === 'object' && !Array.isArray(storedCustomFields)
          ? storedCustomFields as Record<string, unknown>
          : {}),
        ...data.customFields,
      };
    }
    if (data.status === 'COMPLETED') {
      return res.status(400).json({ success: false, error: 'Use the completion action to complete a site visit.' });
    }
    if (data.status === 'CANCELLED') {
      return res.status(400).json({ success: false, error: 'Use the cancel action to cancel a site visit.' });
    }
    if (data.leadId && data.leadId !== existing.leadId && !(await canAccessLeadId(req.user!, data.leadId))) {
      return res.status(403).json({ success: false, error: 'You do not have access to the linked lead' });
    }

    const updateData: Record<string, unknown> = { ...data };
    if (data.scheduledAt) updateData.scheduledAt = new Date(data.scheduledAt);
    if (data.customFields) updateData.customFields = data.customFields as Prisma.InputJsonObject;

    const projectChanged = !!data.projectId && data.projectId !== existing.projectId;
    if (projectChanged) {
      delete updateData.assigneeId;
      delete updateData.queueId;
      updateData.queueId = null;
    }

    const siteVisit = await prisma.$transaction(async (tx) => {
      const updated = await tx.siteVisit.update({
        where: { id: req.params.id },
        data: updateData,
      });

      let projectName: string | undefined;
      if (projectChanged && data.projectId) {
        const project = await tx.project.findFirst({
          where: { id: data.projectId, tenantId, isActive: true },
          select: { id: true, name: true },
        });
        if (!project) throw new Error('PROJECT_NOT_AVAILABLE');
        projectName = project.name;
      }
      if (existing.status === 'SCHEDULED' && (projectChanged || data.assigneeId)) {
        await assignSiteVisitToSVCInTransaction(tx, {
          siteVisitId: updated.id,
          tenantId,
          actorId: userId,
          requestedAssigneeId: data.assigneeId,
        });
      }
      const affectedLeadIds = new Set([existing.leadId, updated.leadId]);
      if (data.scheduledAt || projectChanged || updated.leadId !== existing.leadId) {
        if (!projectName && updated.leadId !== existing.leadId) {
          projectName = updated.projectId
            ? (await tx.project.findFirst({
                where: { id: updated.projectId, tenantId },
                select: { name: true },
              }))?.name
            : undefined;
        }
        for (const leadId of affectedLeadIds) {
          await tagLeadSiteVisitEvents(tx, {
            tenantId,
            leadId,
            scheduledAt: updated.leadId === leadId ? updated.scheduledAt : undefined,
            projectName: updated.leadId === leadId ? projectName : undefined,
          });
        }
      }

      return tx.siteVisit.findUniqueOrThrow({
        where: { id: req.params.id },
        include: {
          project: { select: { id: true, name: true } },
          assignee: { select: { id: true, firstName: true, lastName: true } },
        },
      });
    });

    await auditLog(tenantId, userId, 'UPDATE', 'SiteVisit', siteVisit.id, existing, siteVisit);

    res.json({ success: true, data: siteVisit });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    if (error instanceof Error && error.message === 'PROJECT_NOT_AVAILABLE') {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    if (error instanceof Error && ['SVC_QUEUE_NOT_CONFIGURED', 'NO_ELIGIBLE_SVC_MEMBER', 'SVC_ASSIGNEE_NOT_ELIGIBLE'].includes(error.message)) {
      return res.status(409).json({ success: false, error: 'No eligible SVC owner is configured for this project.' });
    }
    console.error('Update site visit error:', error);
    res.status(500).json({ success: false, error: 'Failed to update site visit' });
  }
});

router.post('/:id/verify-location', authorize('SiteVisit', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId } = req.user!;
    const parsed = siteVisitLocationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.errors[0]?.message || 'Valid GPS coordinates are required' });
    }
    const { latitude, longitude, accuracy, timestamp } = parsed.data;
    if (timestamp > Date.now() + 5_000 || Date.now() - timestamp > 60_000) {
      return res.status(400).json({ success: false, code: 'STALE_LOCATION', error: 'Your location reading is no longer fresh. Try again.' });
    }

    const existing = await prisma.siteVisit.findFirst({
      where: { id: req.params.id, tenantId },
      include: {
        project: { select: { name: true, latitude: true, longitude: true, allowedRadiusMeters: true } },
      },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Site visit not found' });
    }
    if (!(await canAccessSiteVisit(req.user!, existing))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this site visit' });
    }
    if (existing.status !== 'SCHEDULED') {
      return res.status(400).json({ success: false, error: 'Only scheduled site visits can be verified' });
    }

    const locationCheck = checkSiteVisitLocation(
      existing.project?.name,
      existing.project?.latitude == null ? null : Number(existing.project.latitude),
      existing.project?.longitude == null ? null : Number(existing.project.longitude),
      existing.project?.allowedRadiusMeters,
      latitude,
      longitude,
      accuracy,
    );
    if (!locationCheck.allowed) {
      return res.status(400).json({
        success: false,
        code: locationCheck.code,
        error: locationCheck.error,
        data: {
          projectName: existing.project?.name || 'Project',
          distanceMeters: locationCheck.distanceMeters,
          radiusMeters: locationCheck.radiusMeters,
          accuracyMeters: accuracy,
        },
      });
    }

    res.json({
      success: true,
      data: {
        projectName: existing.project?.name || 'Project',
        distanceMeters: locationCheck.distanceMeters,
        radiusMeters: locationCheck.radiusMeters,
        accuracyMeters: accuracy,
      },
    });
  } catch (error) {
    console.error('Verify site visit location error:', error);
    res.status(500).json({ success: false, error: 'Failed to verify site visit location' });
  }
});

router.patch('/:id/complete', authorize('SiteVisit', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;
    const parsed = completeSiteVisitSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.errors[0]?.message || 'Completion details are required' });
    }
    const { completedAt, customerFeedback, completionNotes, latitude, longitude, accuracy, timestamp } = parsed.data;
    if (timestamp > Date.now() + 5_000 || Date.now() - timestamp > 60_000) {
      return res.status(400).json({ success: false, code: 'STALE_LOCATION', error: 'Your location reading is no longer fresh. Try again.' });
    }

    const existing = await prisma.siteVisit.findFirst({
      where: { id: req.params.id, tenantId },
      include: {
        lead: {
          select: {
            id: true,
            status: true,
            source: true,
            leadSubSource: true,
            rating: true,
            owner: { select: { profile: { select: { name: true } } } },
          },
        },
        project: { select: { name: true, latitude: true, longitude: true, allowedRadiusMeters: true } },
      },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Site visit not found' });
    }

    if (!(await canAccessSiteVisit(req.user!, existing))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this site visit' });
    }

    if (existing.status !== 'SCHEDULED') {
      return res.status(400).json({ success: false, error: 'Only scheduled site visits can be completed' });
    }
    if (req.user!.profileName !== 'GRE') {
      return res.status(403).json({ success: false, error: 'Only GRE users can confirm that a site visit happened' });
    }

    const locationCheck = checkSiteVisitLocation(
      existing.project?.name,
      existing.project?.latitude == null ? null : Number(existing.project.latitude),
      existing.project?.longitude == null ? null : Number(existing.project.longitude),
      existing.project?.allowedRadiusMeters,
      latitude,
      longitude,
      accuracy,
    );
    if (!locationCheck.allowed) {
      return res.status(400).json({
        success: false,
        code: locationCheck.code,
        error: locationCheck.error,
        data: {
          projectName: existing.project?.name || 'Project',
          distanceMeters: locationCheck.distanceMeters,
          radiusMeters: locationCheck.radiusMeters,
          accuracyMeters: accuracy,
        },
      });
    }

    const profileName = req.user!.profileName || 'Admin';
    if (
      existing.lead &&
      existing.lead.status === 'SITE_VISIT_SCHEDULED' &&
      !canTransitionStatus(profileName, 'SITE_VISIT_SCHEDULED', 'SITE_VISIT_HAPPENED')
    ) {
      return res.status(403).json({ success: false, error: 'Not authorized to complete this site visit' });
    }

    const completedBy = await prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { firstName: true, lastName: true },
    });
    if (!completedBy) {
      return res.status(401).json({ success: false, error: 'Authenticated user is no longer available' });
    }
    const completedByName = `${completedBy.firstName} ${completedBy.lastName}`.trim();

    const result = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.siteVisit.updateMany({
        where: { id: req.params.id, tenantId, status: 'SCHEDULED' },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(completedAt),
          completedById: userId,
          customerFeedback: customerFeedback.trim(),
          completionNotes: completionNotes.trim(),
          feedback: customerFeedback.trim(),
          salespersonLatitude: latitude,
          salespersonLongitude: longitude,
          gpsAccuracyMeters: accuracy,
          gpsTimestamp: new Date(timestamp),
          projectLatitudeAtCompletion: existing.project?.latitude == null ? null : Number(existing.project.latitude),
          projectLongitudeAtCompletion: existing.project?.longitude == null ? null : Number(existing.project.longitude),
          distanceFromProjectMeters: locationCheck.distanceMeters,
          locationVerified: true,
          locationVerifiedAt: new Date(),
        },
      });
      if (updateResult.count !== 1) {
        throw new SiteVisitCompletionConflict('This Site Visit has already been completed or changed. Refresh and try again.');
      }

      const siteVisit = await tx.siteVisit.findFirst({
        where: { id: req.params.id, tenantId },
        include: {
          completedBy: { select: { id: true, firstName: true, lastName: true } },
          project: { select: { id: true, name: true, latitude: true, longitude: true, allowedRadiusMeters: true } },
        },
      });
      if (!siteVisit) throw new Error('Completed Site Visit could not be loaded.');

      let leadStatus = existing.lead?.status || null;
      let leadStatusTag: string | undefined;
      if (existing.lead && existing.lead.status === 'SITE_VISIT_SCHEDULED') {
        const lead = await tx.lead.update({
          where: { id: existing.leadId },
          data: { status: 'SITE_VISIT_HAPPENED' },
          select: { status: true },
        });
        leadStatus = lead.status;
        leadStatusTag = 'Site Visit Completed';

        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            leadId: existing.leadId,
            action: 'SITE_VISIT_COMPLETED',
            objectType: 'Lead',
            objectId: existing.leadId,
            oldValues: { status: 'SITE_VISIT_SCHEDULED' },
            newValues: {
              status: 'SITE_VISIT_HAPPENED',
              siteVisitId: existing.id,
              completedAt,
              completedById: userId,
              completedByName,
              customerFeedback,
              completionNotes,
              salespersonLatitude: latitude,
              salespersonLongitude: longitude,
              gpsAccuracyMeters: accuracy,
              gpsTimestamp: new Date(timestamp).toISOString(),
              projectLatitude: existing.project?.latitude,
              projectLongitude: existing.project?.longitude,
              distanceFromProjectMeters: locationCheck.distanceMeters,
              locationVerified: true,
            },
          },
        });
      }
      await tagLeadSiteVisitEvents(tx, {
        tenantId,
        leadId: existing.leadId,
        leadStatus: leadStatusTag,
        feedback: customerFeedback,
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          leadId: existing.leadId,
          action: 'SITE_VISIT_COMPLETED',
          objectType: 'SiteVisit',
          objectId: siteVisit.id,
          oldValues: { status: 'SCHEDULED' },
          newValues: {
            status: 'COMPLETED',
            completedAt,
            completedById: userId,
            completedByName,
            customerFeedback,
            completionNotes,
            salespersonLatitude: latitude,
            salespersonLongitude: longitude,
            gpsAccuracyMeters: accuracy,
            gpsTimestamp: new Date(timestamp).toISOString(),
            projectLatitude: existing.project?.latitude,
            projectLongitude: existing.project?.longitude,
            distanceFromProjectMeters: locationCheck.distanceMeters,
            locationVerified: true,
          },
        },
      });

      const salesHandoff = await assignCompletedSiteVisitToSalesInTransaction(tx, siteVisit.id, tenantId);
      const updatedSiteVisit = await tx.siteVisit.findUniqueOrThrow({
        where: { id: siteVisit.id },
        include: {
          assignee: { select: { id: true, firstName: true, lastName: true } },
          project: { select: { id: true, name: true } },
          completedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      });
      const updatedLead = await tx.lead.findUniqueOrThrow({
        where: { id: existing.leadId },
        include: { owner: { select: { id: true, firstName: true, lastName: true } } },
      });
      return { siteVisit: updatedSiteVisit, lead: updatedLead, leadStatus, salesHandoff };
    });

    res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof SiteVisitCompletionConflict) {
      return res.status(409).json({ success: false, error: error.message });
    }
    console.error('Complete site visit error:', error);
    res.status(500).json({ success: false, error: 'Failed to complete site visit' });
  }
});

router.post('/:id/retry-sales-assignment', authorize('SiteVisit', 'edit'), async (req: AuthRequest, res: Response) => {
  if (!req.user!.isAdmin && !req.user!.isSuperAdmin && req.user!.profileName !== 'CRM Admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  try {
    const result = await prisma.$transaction((tx) =>
      assignCompletedSiteVisitToSalesInTransaction(tx, req.params.id, req.tenantId!),
    );
    if (result.pendingReason) {
      return res.status(409).json({ success: false, error: result.pendingReason, data: result });
    }
    res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Error && error.message === 'SITE_VISIT_NOT_FOUND') {
      return res.status(404).json({ success: false, error: 'Site visit not found' });
    }
    if (error instanceof Error && error.message === 'SITE_VISIT_NOT_GRE_COMPLETED') {
      return res.status(409).json({ success: false, error: 'Only a completed GRE visit can be assigned to Sales' });
    }
    console.error('Retry Sales assignment error:', error);
    res.status(500).json({ success: false, error: 'Failed to retry Sales assignment' });
  }
});

router.patch('/:id/cancel', authorize('SiteVisit', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;
    const parsed = cancelSiteVisitSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.errors[0]?.message || 'Reason is required' });
    }
    const reason = parsed.data.reason.trim();
    if (!reason) {
      return res.status(400).json({ success: false, error: 'Reason is required' });
    }

    const existing = await prisma.siteVisit.findFirst({
      where: { id: req.params.id, tenantId },
      include: { lead: { select: { id: true, status: true, ownerId: true } } },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Site visit not found' });
    }

    if (!(await canAccessSiteVisit(req.user!, existing))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this site visit' });
    }

    if (existing.status !== 'SCHEDULED') {
      return res.status(400).json({ success: false, error: 'Only scheduled site visits can be cancelled' });
    }

    const profileName = req.user!.profileName || 'Admin';
    if (
      existing.lead &&
      existing.lead.status === 'SITE_VISIT_SCHEDULED' &&
      !canTransitionStatus(profileName, 'SITE_VISIT_SCHEDULED', 'PROSPECT')
    ) {
      return res.status(403).json({ success: false, error: 'Not authorized to cancel this site visit' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const siteVisit = await tx.siteVisit.update({
        where: { id: req.params.id },
        data: { status: 'CANCELLED', cancellationReason: reason, cancelledAt: new Date(), cancelledById: userId },
      });
      await tagLeadSiteVisitEvents(tx, {
        tenantId,
        leadId: existing.leadId,
      });

      if (existing.lead && existing.lead.status === 'SITE_VISIT_SCHEDULED') {
        const otherScheduled = await tx.siteVisit.count({
          where: {
            tenantId,
            leadId: existing.leadId,
            status: 'SCHEDULED',
            id: { not: existing.id },
          },
        });
        if (otherScheduled === 0) {
          await tx.lead.update({
            where: { id: existing.leadId },
            data: { status: 'PROSPECT' },
          });
          await tx.auditLog.create({
            data: {
              tenantId,
              userId,
              leadId: existing.leadId,
              action: 'SITE_VISIT_CANCELLED',
              objectType: 'Lead',
              objectId: existing.leadId,
              oldValues: { status: 'SITE_VISIT_SCHEDULED' },
              newValues: { status: 'PROSPECT', siteVisitId: existing.id, reason },
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          leadId: existing.leadId,
          action: 'SITE_VISIT_CANCELLED',
          objectType: 'SiteVisit',
          objectId: siteVisit.id,
          oldValues: { status: 'SCHEDULED' },
          newValues: { status: 'CANCELLED', cancellationReason: reason, cancelledById: userId, cancelledAt: new Date().toISOString() },
        },
      });

      return siteVisit;
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Cancel site visit error:', error);
    res.status(500).json({ success: false, error: 'Failed to cancel site visit' });
  }
});

router.post('/:id/revisit', authorize('SiteVisit', 'create'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;
    const parsed = revisitSiteVisitSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.errors[0]?.message || 'Revisit requires reason, scheduled date, and project' });
    }
    const reason = parsed.data.reason.trim();
    if (!reason) {
      return res.status(400).json({ success: false, error: 'Reason is required' });
    }

    const existing = await prisma.siteVisit.findFirst({
      where: { id: req.params.id, tenantId },
      include: {
        lead: {
          select: {
            id: true,
            status: true,
            ownerId: true,
            source: true,
            leadSubSource: true,
            rating: true,
          },
        },
        project: { select: { id: true } },
      },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Site visit not found' });
    }
    if (!['SCHEDULED', 'COMPLETED', 'CANCELLED'].includes(existing.status)) {
      return res.status(400).json({ success: false, error: 'Invalid site visit status' });
    }

    if (!(await canAccessSiteVisit(req.user!, existing))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this site visit' });
    }

    const revisitNotes = parsed.data.notes?.trim()
      ? `${parsed.data.notes.trim()} (Revisit reason: ${reason})`
      : `Revisit reason: ${reason}`;

    const result = await prisma.$transaction(async (tx) => {
      const project = await tx.project.findFirst({
        where: { id: parsed.data.projectId, tenantId, isActive: true },
        select: { id: true, name: true },
      });
      if (!project) throw new Error('PROJECT_NOT_AVAILABLE');

      const sameProject = existing.projectId === parsed.data.projectId;

      const siteVisitNumber = await getNextSiteVisitNumber(tx, tenantId);
      const siteVisit = await tx.siteVisit.create({
        data: {
          tenantId,
          leadId: existing.leadId,
          projectId: parsed.data.projectId,
          assigneeId: sameProject ? existing.assigneeId : null,
          creatorId: userId,
          queueId: sameProject ? existing.queueId : null,
          siteVisitNumber,
          previousSiteVisitId: existing.id,
          scheduledAt: new Date(parsed.data.scheduledAt),
          status: 'SCHEDULED',
          notes: revisitNotes,
          visitType: sameProject ? 'REVISIT' : undefined,
        },
        include: {
          lead: { select: { id: true, firstName: true, lastName: true } },
          project: { select: { id: true, name: true } },
          previousSiteVisit: { select: { id: true, status: true, scheduledAt: true, siteVisitNumber: true } },
        },
      });

      if (!sameProject) {
        await assignSiteVisitToSVCInTransaction(tx, {
          siteVisitId: siteVisit.id,
          tenantId,
          actorId: userId,
        });
      }
      await tagLeadSiteVisitEvents(tx, {
        tenantId,
        leadId: existing.leadId,
        scheduledAt: new Date(parsed.data.scheduledAt),
        projectName: project.name,
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          leadId: existing.leadId,
          action: 'SITE_VISIT_REVISIT_CREATED',
          objectType: 'SiteVisit',
          objectId: siteVisit.id,
          oldValues: { previousSiteVisitId: existing.id, previousSiteVisitNumber: (existing as any).siteVisitNumber },
          newValues: {
            siteVisitNumber,
            reason,
            scheduledAt: parsed.data.scheduledAt,
            leadId: existing.leadId,
            projectId: parsed.data.projectId,
            assignedToSVCQueue: !sameProject,
          },
        },
      });

      return tx.siteVisit.findUniqueOrThrow({
        where: { id: siteVisit.id },
        include: {
          lead: { select: { id: true, firstName: true, lastName: true } },
          project: { select: { id: true, name: true } },
          assignee: { select: { id: true, firstName: true, lastName: true } },
          previousSiteVisit: { select: { id: true, status: true, scheduledAt: true, siteVisitNumber: true } },
        },
      });
    });

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Error && error.message === 'PROJECT_NOT_AVAILABLE') {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    if (error instanceof Error && error.message === 'SVC_QUEUE_NOT_CONFIGURED') {
      return res.status(409).json({ success: false, error: 'No matching SVC Round Robin queue is configured for the selected project and lead criteria.' });
    }
    if (error instanceof Error && error.message === 'NO_ELIGIBLE_SVC_MEMBER') {
      return res.status(409).json({ success: false, error: 'The selected project SVC Round Robin queue has no eligible members.' });
    }
    console.error('Revisit site visit error:', error);
    res.status(500).json({ success: false, error: 'Failed to create revisit site visit' });
  }
});

router.delete('/:id', authorize('SiteVisit', 'delete'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;

    const existing = await prisma.siteVisit.findFirst({
      where: { id: req.params.id, tenantId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Site visit not found' });
    }

    if (!(await canAccessSiteVisit(req.user!, existing))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this site visit' });
    }

    await prisma.siteVisit.delete({ where: { id: req.params.id } });

    await auditLog(tenantId, userId, 'DELETE', 'SiteVisit', existing.id, existing, null);

    res.json({ success: true, data: null });
  } catch (error) {
    console.error('Delete site visit error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete site visit' });
  }
});

export default router;