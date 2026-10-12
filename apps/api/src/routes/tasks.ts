import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '@dct-crm/db';
import { taskSchema } from '@dct-crm/shared';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authorize } from '../middleware/authorization';
import {
  applyScope,
  canAccessBooking,
  canAccessLeadId,
  canAccessOpportunity,
  canAccessSiteVisit,
  canAccessTask,
  getScopeClause,
} from '../services/recordAccess';
import { promoteNewLeadOnFirstActivity } from '../services/leadWorkflowExtras';

const router = Router();

router.use(authenticate);

type TaskInput = Partial<Prisma.TaskUncheckedCreateInput> & {
  ownerId?: string | null;
  leadId?: string | null;
  siteVisitId?: string | null;
  opportunityId?: string | null;
  bookingId?: string | null;
  projectId?: string | null;
  unitId?: string | null;
};

const whatIdFields = ['siteVisitId', 'opportunityId', 'bookingId', 'projectId', 'unitId'] as const;

function dateFromSalesforceActivityDate(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00.000Z`)
    : new Date(value);
}

async function validateTaskRelationships(
  data: TaskInput,
  user: NonNullable<AuthRequest['user']>,
  tenantId: string,
): Promise<string | null> {
  const ownerId = data.ownerId || user.id;
  const owner = await prisma.user.findFirst({
    where: { id: ownerId, tenantId, isActive: true },
    select: { id: true },
  });
  if (!owner) return 'Assigned user is not active in this company';

  const linkedWhatIds = whatIdFields
    .map((field) => data[field])
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (linkedWhatIds.length > 1) return 'A task can be related to only one record';

  if (data.leadId && !(await canAccessLeadId(user, data.leadId))) {
    return 'Linked Lead was not found in this company or is not accessible';
  }
  if (data.siteVisitId) {
    const siteVisit = await prisma.siteVisit.findFirst({
      where: { id: data.siteVisitId, tenantId },
      select: { id: true, tenantId: true, assigneeId: true, creatorId: true, leadId: true },
    });
    if (!siteVisit || !(await canAccessSiteVisit(user, siteVisit))) {
      return 'Linked Site Visit was not found in this company or is not accessible';
    }
  }
  if (data.opportunityId) {
    const opportunity = await prisma.opportunity.findFirst({
      where: { id: data.opportunityId, tenantId },
      select: { id: true, tenantId: true, ownerId: true, creatorId: true, leadId: true },
    });
    if (!opportunity || !(await canAccessOpportunity(user, opportunity))) {
      return 'Linked Opportunity was not found in this company or is not accessible';
    }
  }
  if (data.bookingId) {
    const booking = await prisma.booking.findFirst({
      where: { id: data.bookingId, tenantId },
      select: { id: true, tenantId: true, ownerId: true, creatorId: true, leadId: true },
    });
    if (!booking || !(await canAccessBooking(user, booking))) {
      return 'Linked Booking was not found in this company or is not accessible';
    }
  }
  if (data.projectId) {
    const project = await prisma.project.findFirst({
      where: { id: data.projectId, tenantId, isActive: true },
      select: { id: true },
    });
    if (!project) return 'Linked Project was not found in this company';
  }
  if (data.unitId) {
    const unit = await prisma.unit.findFirst({
      where: { id: data.unitId, tenantId },
      select: { id: true },
    });
    if (!unit) return 'Linked Unit was not found in this company';
  }
  return null;
}

router.get('/', authorize('Task', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      priority,
      ownerId,
      leadId,
      callType,
      salesforceStatus,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    let where: any = { tenantId: req.tenantId! };
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (ownerId) where.ownerId = ownerId;
    if (leadId) where.leadId = leadId;
    if (callType) where.callType = callType;
    if (salesforceStatus) where.salesforceStatus = salesforceStatus;
    if (search) {
      where.OR = [
        { title: { contains: search as string, mode: 'insensitive' } },
        { subject: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
        { callDisposition: { contains: search as string, mode: 'insensitive' } },
      ];
    }
    where = applyScope(where, await getScopeClause(req.user!, 'task'));

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
          lead: { select: { id: true, firstName: true, lastName: true, phone: true } },
          siteVisit: { select: { id: true, scheduledAt: true, status: true } },
          opportunity: { select: { id: true, name: true, stage: true } },
          booking: { select: { id: true, number: true, status: true } },
          project: { select: { id: true, name: true } },
          unit: { select: { id: true, number: true, status: true } },
        },
        skip,
        take: Number(limit),
        orderBy: { [sortBy as string]: sortOrder },
      }),
      prisma.task.count({ where }),
    ]);

    res.json({
      success: true,
      data: tasks,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch tasks' });
  }
});

router.get('/my', authorize('Task', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, status, priority, sortBy = 'dueDate', sortOrder = 'asc' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = { tenantId: req.tenantId!, ownerId: req.user!.id };
    if (status) where.status = status;
    if (priority) where.priority = priority;

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          lead: { select: { id: true, firstName: true, lastName: true, phone: true } },
          opportunity: { select: { id: true, name: true, stage: true } },
          siteVisit: { select: { id: true, siteVisitNumber: true } },
          booking: { select: { id: true, number: true } },
          project: { select: { id: true, name: true } },
          unit: { select: { id: true, number: true } },
        },
        skip,
        take: Number(limit),
        orderBy: { [sortBy as string]: sortOrder },
      }),
      prisma.task.count({ where }),
    ]);

    res.json({
      success: true,
      data: tasks,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get my tasks error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch tasks' });
  }
});

router.get('/:id', authorize('Task', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const task = await prisma.task.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true, email: true } },
        lead: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
        siteVisit: { select: { id: true, scheduledAt: true, status: true, notes: true } },
        opportunity: { select: { id: true, name: true, stage: true, amount: true } },
        booking: { select: { id: true, number: true, status: true } },
        project: { select: { id: true, name: true } },
        unit: { select: { id: true, number: true, status: true, project: { select: { name: true } } } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        lastModifiedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    if (!(await canAccessTask(req.user!, task))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this task' });
    }

    res.json({ success: true, data: task });
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch task' });
  }
});

router.post('/', authorize('Task', 'create'), async (req: AuthRequest, res: Response) => {
  try {
    const data = taskSchema.parse(req.body);
    const title = data.subject || data.title;
    if (!title) {
      return res.status(400).json({ success: false, error: 'Subject is required' });
    }
    if (!data.description && !data.subject) {
      return res.status(400).json({ success: false, error: 'Description is required' });
    }
    if (data.subject) {
      if (!data.salesforceStatus) {
        return res.status(400).json({ success: false, error: 'Salesforce Status is required' });
      }
      if (!data.leadId) {
        return res.status(400).json({ success: false, error: 'A Lead is required for the Name relationship' });
      }
      if (!whatIdFields.some((field) => Boolean(data[field]))) {
        return res.status(400).json({ success: false, error: 'A supported Related To record is required' });
      }
    }
    const relationError = await validateTaskRelationships(data, req.user!, req.tenantId!);
    if (relationError) {
      return res.status(400).json({ success: false, error: relationError });
    }

    const task = await prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          tenantId: req.tenantId!,
          ownerId: data.ownerId || req.user!.id,
          createdById: req.user!.id,
          lastModifiedById: req.user!.id,
          title,
          subject: data.subject || title,
          description: data.description || null,
          status: data.status || 'PENDING',
          priority: data.priority || 'MEDIUM',
          salesforceStatus: data.salesforceStatus || null,
          salesforcePriority: data.salesforcePriority || null,
          dueDate: dateFromSalesforceActivityDate(data.dueDate!),
          completedAt: data.completedAt
            ? new Date(data.completedAt)
            : data.status === 'COMPLETED' ? new Date() : null,
          callDurationInSeconds: data.callDurationInSeconds ?? null,
          callObject: data.callObject || null,
          callDisposition: data.callDisposition || null,
          callType: data.callType || null,
          isRecurrence: data.isRecurrence ?? false,
          recurrenceInterval: data.recurrenceInterval ?? null,
          email: data.email || null,
          phone: data.phone || null,
          isVisibleInSelfService: data.isVisibleInSelfService ?? false,
          isReminderSet: data.isReminderSet ?? false,
          recurrenceRegeneratedType: data.recurrenceRegeneratedType || null,
          taskSubtype: data.taskSubtype || null,
          taskType: data.taskType || null,
          leadId: data.leadId || null,
          siteVisitId: data.siteVisitId || null,
          opportunityId: data.opportunityId || null,
          bookingId: data.bookingId || null,
          projectId: data.projectId || null,
          unitId: data.unitId || null,
        },
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
          lead: { select: { id: true, firstName: true, lastName: true } },
          siteVisit: { select: { id: true, siteVisitNumber: true } },
          opportunity: { select: { id: true, name: true } },
          booking: { select: { id: true, number: true } },
          project: { select: { id: true, name: true } },
          unit: { select: { id: true, number: true } },
        },
      });

      if (data.leadId) {
        await promoteNewLeadOnFirstActivity(tx, {
          tenantId: req.tenantId!,
          leadId: data.leadId,
          userId: req.user!.id,
          profileName: req.user!.profileName,
          activityLabel: 'Task',
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId: req.tenantId!,
          userId: req.user!.id,
          leadId: data.leadId || undefined,
          action: 'TASK_CREATED',
          objectType: 'Task',
          objectId: created.id,
          newValues: req.body,
        },
      });

      return created;
    });

    res.status(201).json({ success: true, data: task });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Create task error:', error);
    res.status(500).json({ success: false, error: 'Failed to create task' });
  }
});

router.put('/:id', authorize('Task', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const existingTask = await prisma.task.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!existingTask) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    if (!(await canAccessTask(req.user!, existingTask))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this task' });
    }

    const data = taskSchema.partial().parse(req.body);
    const relationFieldsChanged = ['leadId', ...whatIdFields].some((field) =>
      Object.prototype.hasOwnProperty.call(data, field),
    );
    const resolvedRelations: TaskInput = {};
    if (relationFieldsChanged) {
      for (const field of ['leadId', ...whatIdFields] as const) {
        const value = data[field];
        resolvedRelations[field] = value === undefined
          ? existingTask[field]
          : value || null;
      }
    }
    const relationError = await validateTaskRelationships({
      ...resolvedRelations,
      ownerId: data.ownerId || existingTask.ownerId,
    }, req.user!, req.tenantId!);
    if (relationError) {
      return res.status(400).json({ success: false, error: relationError });
    }

    const updateData: Prisma.TaskUncheckedUpdateInput = {
      lastModifiedById: req.user!.id,
    };
    if (data.title !== undefined || data.subject !== undefined) {
      const subject = data.subject || data.title || existingTask.subject || existingTask.title;
      updateData.title = subject;
      updateData.subject = subject;
    }
    if (data.description !== undefined) updateData.description = data.description || null;
    if (data.status !== undefined) {
      updateData.status = data.status;
      if (data.status === 'COMPLETED' && data.completedAt === undefined) {
        updateData.completedAt = new Date();
      } else if (data.status !== 'COMPLETED') {
        updateData.completedAt = null;
      }
    }
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.salesforceStatus !== undefined) updateData.salesforceStatus = data.salesforceStatus || null;
    if (data.salesforcePriority !== undefined) updateData.salesforcePriority = data.salesforcePriority || null;
    if (data.dueDate !== undefined) updateData.dueDate = dateFromSalesforceActivityDate(data.dueDate);
    if (data.completedAt !== undefined) updateData.completedAt = new Date(data.completedAt);
    if (data.ownerId !== undefined) updateData.ownerId = data.ownerId || existingTask.ownerId;
    if (relationFieldsChanged) {
      updateData.leadId = resolvedRelations.leadId || null;
      updateData.siteVisitId = resolvedRelations.siteVisitId || null;
      updateData.opportunityId = resolvedRelations.opportunityId || null;
      updateData.bookingId = resolvedRelations.bookingId || null;
      updateData.projectId = resolvedRelations.projectId || null;
      updateData.unitId = resolvedRelations.unitId || null;
    }
    if (data.callDurationInSeconds !== undefined) updateData.callDurationInSeconds = data.callDurationInSeconds;
    if (data.callObject !== undefined) updateData.callObject = data.callObject || null;
    if (data.callDisposition !== undefined) updateData.callDisposition = data.callDisposition || null;
    if (data.callType !== undefined) updateData.callType = data.callType || null;
    if (data.isRecurrence !== undefined) updateData.isRecurrence = data.isRecurrence;
    if (data.recurrenceInterval !== undefined) updateData.recurrenceInterval = data.recurrenceInterval;
    if (data.email !== undefined) updateData.email = data.email || null;
    if (data.phone !== undefined) updateData.phone = data.phone || null;
    if (data.isVisibleInSelfService !== undefined) updateData.isVisibleInSelfService = data.isVisibleInSelfService;
    if (data.isReminderSet !== undefined) updateData.isReminderSet = data.isReminderSet;
    if (data.recurrenceRegeneratedType !== undefined) {
      updateData.recurrenceRegeneratedType = data.recurrenceRegeneratedType || null;
    }
    if (data.taskSubtype !== undefined) updateData.taskSubtype = data.taskSubtype || null;
    if (data.taskType !== undefined) updateData.taskType = data.taskType || null;

    const task = await prisma.task.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        owner: { select: { id: true, firstName: true, lastName: true } },
        lead: { select: { id: true, firstName: true, lastName: true } },
        siteVisit: { select: { id: true, siteVisitNumber: true } },
        opportunity: { select: { id: true, name: true } },
        booking: { select: { id: true, number: true } },
        project: { select: { id: true, name: true } },
        unit: { select: { id: true, number: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        leadId: existingTask.leadId || undefined,
        action: 'TASK_UPDATED',
        objectType: 'Task',
        objectId: task.id,
        oldValues: existingTask,
        newValues: req.body,
      },
    });

    res.json({ success: true, data: task });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Update task error:', error);
    res.status(500).json({ success: false, error: 'Failed to update task' });
  }
});

router.delete('/:id', authorize('Task', 'delete'), async (req: AuthRequest, res: Response) => {
  try {
    const task = await prisma.task.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    if (!(await canAccessTask(req.user!, task))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this task' });
    }

    await prisma.task.delete({ where: { id: req.params.id } });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'DELETE',
        objectType: 'Task',
        objectId: req.params.id,
        oldValues: task,
      },
    });

    res.json({ success: true, message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete task' });
  }
});

router.put('/:id/status', authorize('Task', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const parsedStatus = z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).safeParse(req.body?.status);
    if (!parsedStatus.success) {
      return res.status(400).json({ success: false, error: 'Invalid task status' });
    }
    const { data: status } = parsedStatus;
    const task = await prisma.task.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    if (!(await canAccessTask(req.user!, task))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this task' });
    }

    const updateData: Prisma.TaskUncheckedUpdateInput = {
      status,
      lastModifiedById: req.user!.id,
    };
    if (status === 'COMPLETED') updateData.completedAt = new Date();
    else updateData.completedAt = null;

    const updatedTask = await prisma.task.update({
      where: { id: req.params.id },
      data: updateData,
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        leadId: task.leadId || undefined,
        action: status === 'COMPLETED' ? 'TASK_COMPLETED' : 'STATUS_CHANGE',
        objectType: 'Task',
        objectId: task.id,
        oldValues: { status: task.status },
        newValues: { status },
      },
    });

    res.json({ success: true, data: updatedTask });
  } catch (error) {
    console.error('Update task status error:', error);
    res.status(500).json({ success: false, error: 'Failed to update task status' });
  }
});

router.put('/:id/assign', authorize('Task', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const ownerId = typeof req.body?.ownerId === 'string' ? req.body.ownerId : '';
    if (!ownerId) {
      return res.status(400).json({ success: false, error: 'Assigned user is required' });
    }
    const task = await prisma.task.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    if (!(await canAccessTask(req.user!, task))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this task' });
    }

    const assignedUser = await prisma.user.findFirst({
      where: { id: ownerId, tenantId: req.tenantId!, isActive: true },
      select: { id: true },
    });
    if (!assignedUser) {
      return res.status(400).json({ success: false, error: 'Assigned user is not active in this company' });
    }

    const updatedTask = await prisma.task.update({
      where: { id: req.params.id },
      data: { ownerId, lastModifiedById: req.user!.id },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        leadId: task.leadId || undefined,
        action: 'ASSIGN',
        objectType: 'Task',
        objectId: task.id,
        oldValues: { ownerId: task.ownerId },
        newValues: { ownerId },
      },
    });

    res.json({ success: true, data: updatedTask });
  } catch (error) {
    console.error('Assign task error:', error);
    res.status(500).json({ success: false, error: 'Failed to assign task' });
  }
});

export { router as taskRoutes };