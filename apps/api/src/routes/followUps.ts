import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { followUpSchema } from '@dct-crm/shared';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authorize } from '../middleware/authorization';
import {
  applyScope,
  canAccessFollowUp,
  canAccessLeadId,
  getScopeClause,
} from '../services/recordAccess';
import { normalizeOverdueFollowUps, promoteNewLeadOnFirstActivity } from '../services/leadWorkflowExtras';
import { tagLeadFollowUpEvents } from '../services/leadEventTagging';
import { getNextFollowUpNumber } from '../services/followUpService';

const router = Router();

router.use(authenticate);

router.get('/', authorize('FollowUp', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    await normalizeOverdueFollowUps(req.tenantId!);
    const { page = 1, limit = 20, isCompleted, status, leadId, ownerId, search, sortBy = 'dueDate', sortOrder = 'asc' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    let where: any = { tenantId: req.tenantId! };
    if (isCompleted !== undefined) where.isCompleted = isCompleted === 'true';
    if (status === 'MISSED') where.isMissed = true;
    if (status === 'COMPLETED') where.isCompleted = true;
    if (status === 'SCHEDULED' || status === 'OPEN') {
      where.isCompleted = false;
      where.isMissed = false;
    }
    if (leadId) where.leadId = leadId;
    if (ownerId) where.ownerId = ownerId;
    if (search) {
      where.OR = [
        { title: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
      ];
    }
    where = applyScope(where, await getScopeClause(req.user!, 'followUp'));

    const [followUps, total] = await Promise.all([
      prisma.followUp.findMany({
        where,
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
          lead: { select: { id: true, firstName: true, lastName: true, phone: true } },
        },
        skip,
        take: Number(limit),
        orderBy: { [sortBy as string]: sortOrder },
      }),
      prisma.followUp.count({ where }),
    ]);

    res.json({
      success: true,
      data: followUps,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get follow-ups error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch follow-ups' });
  }
});

router.get('/my', authorize('FollowUp', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    await normalizeOverdueFollowUps(req.tenantId!);
    const { page = 1, limit = 20, isCompleted, status, sortBy = 'dueDate', sortOrder = 'asc' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = { tenantId: req.tenantId!, ownerId: req.user!.id };
    if (isCompleted !== undefined) where.isCompleted = isCompleted === 'true';
    if (status === 'MISSED') where.isMissed = true;
    if (status === 'COMPLETED') where.isCompleted = true;
    if (status === 'SCHEDULED' || status === 'OPEN') {
      where.isCompleted = false;
      where.isMissed = false;
    }

    const [followUps, total] = await Promise.all([
      prisma.followUp.findMany({
        where,
        include: {
          lead: { select: { id: true, firstName: true, lastName: true, phone: true } },
        },
        skip,
        take: Number(limit),
        orderBy: { [sortBy as string]: sortOrder },
      }),
      prisma.followUp.count({ where }),
    ]);

    res.json({
      success: true,
      data: followUps,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get my follow-ups error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch follow-ups' });
  }
});

router.get('/:id', authorize('FollowUp', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    await normalizeOverdueFollowUps(req.tenantId!);
    const followUp = await prisma.followUp.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true, email: true, profile: { select: { name: true } } } },
        lead: {
          select: {
            id: true,
            leadNumber: true,
            firstName: true,
            lastName: true,
            phone: true,
            mobile: true,
            email: true,
            status: true,
            source: true,
            createdAt: true,
          },
        },
      },
    });

    if (!followUp) {
      return res.status(404).json({ success: false, error: 'Follow-up not found' });
    }

    if (!(await canAccessFollowUp(req.user!, followUp))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this follow-up' });
    }

    const history = await prisma.auditLog.findMany({
      where: { tenantId: req.tenantId!, objectType: 'FollowUp', objectId: followUp.id },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    res.json({ success: true, data: { ...followUp, history } });
  } catch (error) {
    console.error('Get follow-up error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch follow-up' });
  }
});

router.post('/', authorize('FollowUp', 'create'), async (req: AuthRequest, res: Response) => {
  try {
    const data = followUpSchema.parse(req.body);

    if (data.leadId && !(await canAccessLeadId(req.user!, data.leadId))) {
      return res.status(403).json({ success: false, error: 'You do not have access to the linked lead' });
    }
    const ownerId = data.ownerId || req.user!.id;
    const activeOwner = await prisma.user.findFirst({
      where: { id: ownerId, tenantId: req.tenantId!, isActive: true },
      select: { id: true },
    });
    if (!activeOwner) {
      return res.status(400).json({ success: false, error: 'Assigned user is not active in this company' });
    }

    const followUp = await prisma.$transaction(async (tx) => {
      const followUpNumber = await getNextFollowUpNumber(tx, req.tenantId!);
      const created = await tx.followUp.create({
        data: {
          tenantId: req.tenantId!,
          followUpNumber,
          ownerId,
          title: data.title,
          description: data.description,
          dueDate: new Date(data.dueDate),
          isMissed: new Date(data.dueDate) <= new Date(),
          missedAt: new Date(data.dueDate) <= new Date() ? new Date() : null,
          leadId: data.leadId || undefined,
        },
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
          lead: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      if (data.leadId) {
        await promoteNewLeadOnFirstActivity(tx, {
          tenantId: req.tenantId!,
          leadId: data.leadId,
          userId: req.user!.id,
          profileName: req.user!.profileName,
          activityLabel: 'Follow-up',
        });
        await tagLeadFollowUpEvents(tx, req.tenantId!, data.leadId);
      }

      await tx.auditLog.create({
        data: {
          tenantId: req.tenantId!,
          userId: req.user!.id,
          leadId: data.leadId || undefined,
          action: 'FOLLOW_UP_CREATED',
          objectType: 'FollowUp',
          objectId: created.id,
          newValues: { ...data, followUpNumber },
        },
      });

      return created;
    });

    res.status(201).json({ success: true, data: followUp });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Create follow-up error:', error);
    res.status(500).json({ success: false, error: 'Failed to create follow-up' });
  }
});

router.put('/:id', authorize('FollowUp', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const existingFollowUp = await prisma.followUp.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!existingFollowUp) {
      return res.status(404).json({ success: false, error: 'Follow-up not found' });
    }

    if (!(await canAccessFollowUp(req.user!, existingFollowUp))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this follow-up' });
    }

    const data = followUpSchema.partial().parse(req.body);
    if (data.leadId && data.leadId !== existingFollowUp.leadId && !(await canAccessLeadId(req.user!, data.leadId))) {
      return res.status(403).json({ success: false, error: 'You do not have access to the linked lead' });
    }
    if (data.ownerId) {
      const activeOwner = await prisma.user.findFirst({
        where: { id: data.ownerId, tenantId: req.tenantId!, isActive: true },
        select: { id: true },
      });
      if (!activeOwner) {
        return res.status(400).json({ success: false, error: 'Assigned user is not active in this company' });
      }
    }

    const updateData: any = { ...data };
    if (data.dueDate) updateData.dueDate = new Date(data.dueDate);
    if (data.dueDate) {
      const dueDate = new Date(data.dueDate);
      updateData.isMissed = !existingFollowUp.isCompleted && dueDate <= new Date();
      updateData.missedAt = updateData.isMissed ? new Date() : null;
    }

    const followUp = await prisma.$transaction(async (tx) => {
      const updated = await tx.followUp.update({
        where: { id: req.params.id },
        data: updateData,
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
          lead: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: req.tenantId!,
          userId: req.user!.id,
          leadId: existingFollowUp.leadId || undefined,
          action: 'UPDATE',
          objectType: 'FollowUp',
          objectId: updated.id,
          oldValues: existingFollowUp,
          newValues: data,
        },
      });
      for (const leadId of new Set([existingFollowUp.leadId, updated.leadId].filter((id): id is string => !!id))) {
        await tagLeadFollowUpEvents(tx, req.tenantId!, leadId);
      }
      return updated;
    });

    res.json({ success: true, data: followUp });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Update follow-up error:', error);
    res.status(500).json({ success: false, error: 'Failed to update follow-up' });
  }
});

router.delete('/:id', authorize('FollowUp', 'delete'), async (req: AuthRequest, res: Response) => {
  try {
    const followUp = await prisma.followUp.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!followUp) {
      return res.status(404).json({ success: false, error: 'Follow-up not found' });
    }

    if (!(await canAccessFollowUp(req.user!, followUp))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this follow-up' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.followUp.delete({ where: { id: req.params.id } });
      await tx.auditLog.create({
        data: {
          tenantId: req.tenantId!,
          userId: req.user!.id,
          leadId: followUp.leadId || undefined,
          action: 'DELETE',
          objectType: 'FollowUp',
          objectId: req.params.id,
          oldValues: followUp,
        },
      });
      if (followUp.leadId) await tagLeadFollowUpEvents(tx, req.tenantId!, followUp.leadId);
    });

    res.json({ success: true, message: 'Follow-up deleted successfully' });
  } catch (error) {
    console.error('Delete follow-up error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete follow-up' });
  }
});

router.put('/:id/complete', authorize('FollowUp', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const followUp = await prisma.followUp.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!followUp) {
      return res.status(404).json({ success: false, error: 'Follow-up not found' });
    }

    if (!(await canAccessFollowUp(req.user!, followUp))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this follow-up' });
    }

    if (followUp.isCompleted) {
      return res.status(400).json({ success: false, error: 'Follow-up is already completed' });
    }

    const updatedFollowUp = await prisma.$transaction(async (tx) => {
      const updated = await tx.followUp.update({
        where: { id: req.params.id },
        data: { isCompleted: true, completedAt: new Date(), isMissed: false, missedAt: null },
      });
      await tx.auditLog.create({
        data: {
          tenantId: req.tenantId!,
          userId: req.user!.id,
          leadId: followUp.leadId || undefined,
          action: 'STATUS_CHANGE',
          objectType: 'FollowUp',
          objectId: followUp.id,
          oldValues: { isCompleted: false, isMissed: followUp.isMissed },
          newValues: { isCompleted: true, isMissed: false },
        },
      });
      if (followUp.leadId) await tagLeadFollowUpEvents(tx, req.tenantId!, followUp.leadId);
      return updated;
    });

    res.json({ success: true, data: updatedFollowUp });
  } catch (error) {
    console.error('Complete follow-up error:', error);
    res.status(500).json({ success: false, error: 'Failed to complete follow-up' });
  }
});

router.put('/:id/reopen', authorize('FollowUp', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const followUp = await prisma.followUp.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!followUp) {
      return res.status(404).json({ success: false, error: 'Follow-up not found' });
    }

    if (!(await canAccessFollowUp(req.user!, followUp))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this follow-up' });
    }

    if (!followUp.isCompleted) {
      return res.status(400).json({ success: false, error: 'Follow-up is not completed' });
    }

    const updatedFollowUp = await prisma.$transaction(async (tx) => {
      const updated = await tx.followUp.update({
        where: { id: req.params.id },
        data: {
          isCompleted: false,
          completedAt: null,
          isMissed: followUp.dueDate <= new Date(),
          missedAt: followUp.dueDate <= new Date() ? new Date() : null,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: req.tenantId!,
          userId: req.user!.id,
          leadId: followUp.leadId || undefined,
          action: 'STATUS_CHANGE',
          objectType: 'FollowUp',
          objectId: followUp.id,
          oldValues: { isCompleted: true, isMissed: false },
          newValues: { isCompleted: false, isMissed: followUp.dueDate <= new Date() },
        },
      });
      if (followUp.leadId) await tagLeadFollowUpEvents(tx, req.tenantId!, followUp.leadId);
      return updated;
    });

    res.json({ success: true, data: updatedFollowUp });
  } catch (error) {
    console.error('Reopen follow-up error:', error);
    res.status(500).json({ success: false, error: 'Failed to reopen follow-up' });
  }
});

export { router as followUpRoutes };
