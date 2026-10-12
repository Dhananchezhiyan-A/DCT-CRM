import { Router, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@dct-crm/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authorize } from '../middleware/authorization';
import { canAccessLeadId } from '../services/recordAccess';

const router = Router();
router.use(authenticate);

const callDetailSchema = z.object({
  leadId: z.string().min(1),
  caseId: z.string().min(1).optional(),
  opportunityId: z.string().min(1).optional(),
  ownerId: z.string().min(1).optional(),
  callType: z.enum(['INBOUND', 'OUTBOUND']),
  callFrom: z.string().trim().max(255).optional(),
  callTo: z.string().trim().max(50).optional(),
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
  executiveContactNo: z.string().trim().max(50).optional(),
  landingNumber: z.string().trim().max(255).optional(),
  parentId: z.string().trim().max(100).optional(),
  parentUrl: z.string().trim().max(255).optional(),
  recordingFile: z.string().trim().max(255).url().optional(),
  status: z.enum(['COMPLETED', 'NO_ANSWER', 'BUSY', 'VOICEMAIL', 'CANCELLED']).default('COMPLETED'),
  notes: z.string().trim().max(5000).optional(),
});

router.get('/', authorize('Activity', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const leadId = z.string().min(1).parse(req.query.leadId);
    if (!(await canAccessLeadId(req.user!, leadId))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this lead' });
    }

    const data = await prisma.callDetail.findMany({
      where: { tenantId: req.user!.tenantId, leadId },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        lastModifiedBy: { select: { id: true, firstName: true, lastName: true } },
        owner: { select: { id: true, firstName: true, lastName: true } },
        case: { select: { id: true, firstName: true, lastName: true, leadNumber: true } },
        lead: { select: { id: true, firstName: true, lastName: true, leadNumber: true } },
        opportunity: { select: { id: true, name: true, opportunityNumber: true } },
      },
      orderBy: [{ startAt: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
    res.json({ success: true, data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'A valid leadId is required' });
    }
    console.error('Get call details error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch call details' });
  }
});

router.post('/', authorize('Activity', 'create'), async (req: AuthRequest, res: Response) => {
  try {
    const data = callDetailSchema.parse(req.body);
    const startAt = new Date(data.startAt);
    const endAt = new Date(data.endAt);
    if (endAt <= startAt) {
      return res.status(400).json({ success: false, error: 'End time must be after start time' });
    }
    if (!(await canAccessLeadId(req.user!, data.leadId))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this lead' });
    }

    const [owner, caseLead, opportunity] = await Promise.all([
      data.ownerId
        ? prisma.user.findFirst({ where: { id: data.ownerId, tenantId: req.user!.tenantId, isActive: true }, select: { id: true } })
        : Promise.resolve({ id: req.user!.id }),
      data.caseId
        ? prisma.lead.findFirst({ where: { id: data.caseId, tenantId: req.user!.tenantId }, select: { id: true } })
        : Promise.resolve(null),
      data.opportunityId
        ? prisma.opportunity.findFirst({
          where: { id: data.opportunityId, tenantId: req.user!.tenantId, leadId: data.leadId },
          select: { id: true },
        })
        : Promise.resolve(null),
    ]);
    if (!owner) return res.status(400).json({ success: false, error: 'Owner must be an active user in this company' });
    if (data.caseId && (!caseLead || !(await canAccessLeadId(req.user!, data.caseId)))) {
      return res.status(400).json({ success: false, error: 'Case must reference a lead you can access' });
    }
    if (data.opportunityId && !opportunity) {
      return res.status(400).json({ success: false, error: 'Opportunity must belong to this lead and company' });
    }
    const call = await prisma.$transaction(async (tx) => {
      const callId = randomUUID();
      const created = await tx.callDetail.create({
        data: {
          name: `CALL-${callId.slice(0, 12).toUpperCase()}`,
          callId,
          tenantId: req.user!.tenantId,
          leadId: data.leadId,
          caseId: data.caseId,
          opportunityId: data.opportunityId,
          ownerId: owner.id,
          createdById: req.user!.id,
          lastModifiedById: req.user!.id,
          callType: data.callType,
          callFrom: data.callFrom || null,
          callTo: data.callTo || null,
          startAt,
          endAt,
          duration: Math.round((endAt.getTime() - startAt.getTime()) / 1000),
          executiveContactNo: data.executiveContactNo || null,
          landingNumber: data.landingNumber || null,
          parentId: data.parentId || data.leadId,
          parentUrl: data.parentUrl || null,
          recordingFile: data.recordingFile || null,
          status: data.status,
          notes: data.notes || null,
        },
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          lastModifiedBy: { select: { id: true, firstName: true, lastName: true } },
          owner: { select: { id: true, firstName: true, lastName: true } },
          case: { select: { id: true, firstName: true, lastName: true, leadNumber: true } },
          lead: { select: { id: true, firstName: true, lastName: true, leadNumber: true } },
          opportunity: { select: { id: true, name: true, opportunityNumber: true } },
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: req.user!.tenantId,
          userId: req.user!.id,
          leadId: data.leadId,
          action: 'CREATE',
          objectType: 'CallDetail',
          objectId: created.id,
          newValues: {
            name: created.name,
            callId: created.callId,
            callFrom: created.callFrom,
            callTo: created.callTo,
            callType: created.callType,
            duration: created.duration,
            startAt: created.startAt.toISOString(),
            endAt: created.endAt.toISOString(),
            status: created.status,
            opportunityId: created.opportunityId,
            parentUrl: created.parentUrl,
            recordingFile: created.recordingFile,
            notes: created.notes,
          },
        },
      });
      return created;
    });

    res.status(201).json({ success: true, data: call });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.issues[0]?.message || 'Invalid call details' });
    }
    console.error('Create call details error:', error);
    res.status(500).json({ success: false, error: 'Failed to create call details' });
  }
});

export default router;
