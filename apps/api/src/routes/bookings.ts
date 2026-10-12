import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authorize } from '../middleware/authorization';
import { auditLog } from '../middleware/audit';
import { buildInstallmentDrafts, money, quotationPaymentPlan } from '../services/commercialFinance';
import {
  applyScope,
  canAccessBooking,
  canAccessLeadId,
  canAccessOpportunity,
  canAccessQuotation,
  getScopeClause,
} from '../services/recordAccess';

const router = Router();

router.use(authenticate);

const bookingSchema = z.object({
  leadId: z.string().optional(),
  opportunityId: z.string().optional(),
  quotationId: z.string().optional(),
  projectId: z.string(),
  unitId: z.string(),
  ownerId: z.string().optional(),
  queueId: z.string().optional(),
  number: z.string().optional(),
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED']).optional(),
  bookingDate: z.string().datetime().optional(),
  totalAmount: z.number().min(0),
  notes: z.string().max(2000).optional(),
});

const updateBookingSchema = bookingSchema.partial();

router.get('/', authorize('Booking', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId } = req.user!;
    const {
      page = 1,
      limit = 20,
      leadId,
      unitId,
      projectId,
      status,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    let where: any = { tenantId };
    if (leadId) where.leadId = leadId;
    if (unitId) where.unitId = unitId;
    if (projectId) where.projectId = projectId;
    if (status) where.status = status;
    if (startDate && endDate) {
      where.bookingDate = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string),
      };
    }
    where = applyScope(where, await getScopeClause(req.user!, 'booking'));

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { [sortBy as string]: sortOrder },
        include: {
          lead: { select: { id: true, firstName: true, lastName: true } },
          opportunity: { select: { id: true, name: true } },
          unit: { select: { id: true, number: true, type: true, area: true, price: true } },
          project: { select: { id: true, name: true } },
          owner: { select: { id: true, firstName: true, lastName: true } },
          payments: { select: { id: true, amount: true, status: true } },
        },
      }),
      prisma.booking.count({ where }),
    ]);

    res.json({
      success: true,
      data: bookings,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch bookings' });
  }
});

router.get('/:id', authorize('Booking', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId } = req.user!;

    const booking = await prisma.booking.findFirst({
      where: { id: req.params.id, tenantId },
      include: {
        lead: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        opportunity: { select: { id: true, name: true, stage: true } },
        unit: { select: { id: true, number: true } },
        project: { select: { id: true, name: true } },
        owner: { select: { id: true, firstName: true, lastName: true, email: true } },
        creator: { select: { id: true, firstName: true, lastName: true } },
        payments: { select: { id: true, amount: true, status: true, paymentDate: true } },
        activities: { take: 10, orderBy: { createdAt: 'desc' } },
      },
    });

    if (!booking) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    if (!(await canAccessBooking(req.user!, booking))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this booking' });
    }

    res.json({ success: true, data: booking });
  } catch (error) {
    console.error('Get booking error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch booking' });
  }
});

router.post('/', authorize('Booking', 'create'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;
    const data = bookingSchema.parse(req.body);
    if (data.status && !['PENDING', 'CONFIRMED'].includes(data.status)) {
      return res.status(400).json({ success: false, error: 'New bookings must be pending or confirmed' });
    }

    const [lead, opportunity, quotation, project, unit] = await Promise.all([
      data.leadId
        ? prisma.lead.findFirst({ where: { id: data.leadId, tenantId }, select: { id: true } })
        : null,
      data.opportunityId
        ? prisma.opportunity.findFirst({
            where: { id: data.opportunityId, tenantId },
            select: { id: true, tenantId: true, ownerId: true, creatorId: true, leadId: true, projectId: true, stage: true },
          })
        : null,
      data.quotationId
        ? prisma.quotation.findFirst({
            where: { id: data.quotationId, tenantId },
            select: {
              id: true,
              tenantId: true,
              leadId: true,
              opportunityId: true,
              projectId: true,
              totalAmount: true,
              status: true,
              paymentPlan: true,
              notes: true,
            },
          })
        : null,
      prisma.project.findFirst({
        where: { id: data.projectId, tenantId, isActive: true },
        select: { id: true },
      }),
      prisma.unit.findFirst({
        where: { id: data.unitId, tenantId, projectId: data.projectId, status: 'AVAILABLE' },
        select: { id: true },
      }),
    ]);
    if (data.leadId && !lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }
    if (data.opportunityId && !opportunity) {
      return res.status(404).json({ success: false, error: 'Opportunity not found' });
    }
    if (opportunity && !(await canAccessOpportunity(req.user!, opportunity))) {
      return res.status(403).json({ success: false, error: 'You do not have access to the linked opportunity' });
    }
    const leadAccessible = lead ? await canAccessLeadId(req.user!, lead.id) : true;
    if (lead && !leadAccessible && opportunity?.leadId !== lead.id) {
      return res.status(403).json({ success: false, error: 'You do not have access to the linked lead' });
    }
    if (lead && opportunity?.leadId && opportunity.leadId !== lead.id) {
      return res.status(400).json({ success: false, error: 'Lead does not match the linked opportunity' });
    }
    if (!project) {
      return res.status(404).json({ success: false, error: 'Active project not found' });
    }
    if (!unit) {
      return res.status(400).json({ success: false, error: 'Unit is unavailable or does not belong to the project' });
    }
    if (opportunity?.projectId && opportunity.projectId !== data.projectId) {
      return res.status(400).json({ success: false, error: 'Project does not match the linked opportunity' });
    }
    if (data.quotationId && !quotation) {
      return res.status(404).json({ success: false, error: 'Quotation not found' });
    }
    if (quotation && ['REJECTED', 'EXPIRED'].includes(quotation.status)) {
      return res.status(400).json({ success: false, error: 'Cannot book against a rejected or expired quotation' });
    }
    if (quotation && !(await canAccessQuotation(req.user!, quotation))) {
      return res.status(403).json({ success: false, error: 'You do not have access to the linked quotation' });
    }
    if (quotation && (
      (quotation.leadId && quotation.leadId !== data.leadId) ||
      (quotation.opportunityId && quotation.opportunityId !== data.opportunityId) ||
      (quotation.projectId && quotation.projectId !== data.projectId)
    )) {
      return res.status(400).json({ success: false, error: 'Booking references do not match the linked quotation' });
    }
    if (quotation && !money(quotation.totalAmount).eq(money(data.totalAmount))) {
      return res.status(400).json({ success: false, error: 'Booking amount must match the linked quotation amount' });
    }
    if (data.ownerId && !(await prisma.user.count({ where: { id: data.ownerId, tenantId, isActive: true } }))) {
      return res.status(400).json({ success: false, error: 'Booking owner is invalid for this tenant' });
    }
    if (data.queueId && !(await prisma.queue.count({ where: { id: data.queueId, tenantId, isActive: true } }))) {
      return res.status(400).json({ success: false, error: 'Booking queue is invalid for this tenant' });
    }

    const bookingNumber = data.number || `BK-${Date.now().toString(36).toUpperCase()}`;

    const booking = await prisma.$transaction(async (tx) => {
      const reservation = await tx.unit.updateMany({
        where: { id: data.unitId, tenantId, projectId: data.projectId, status: 'AVAILABLE' },
        data: { status: data.status === 'CONFIRMED' ? 'BOOKED' : 'RESERVED' },
      });
      if (reservation.count !== 1) {
        throw new Error('Unit is no longer available; refresh inventory and retry');
      }
      const created = await tx.booking.create({
        data: {
          tenantId,
          leadId: data.leadId,
          opportunityId: data.opportunityId,
          quotationId: data.quotationId,
          projectId: data.projectId,
          unitId: data.unitId,
          ownerId: data.ownerId,
          creatorId: userId,
          queueId: data.queueId,
          number: bookingNumber,
          status: data.status || 'PENDING',
          bookingDate: data.bookingDate ? new Date(data.bookingDate) : new Date(),
          totalAmount: data.totalAmount,
          notes: data.notes,
        },
        include: {
          lead: { select: { id: true, firstName: true, lastName: true } },
          unit: { select: { id: true, number: true } },
          project: { select: { id: true, name: true } },
        },
      });
      const paymentPlan = quotationPaymentPlan(quotation?.paymentPlan, quotation?.notes);
      if (quotation && paymentPlan) {
        const installments = buildInstallmentDrafts(paymentPlan, created.totalAmount, created.bookingDate);
        const scheduleTotal = installments.reduce((sum, installment) => sum.plus(installment.scheduledAmount), money(0));
        if (!scheduleTotal.eq(money(created.totalAmount))) {
          throw new Error('Installment schedule does not reconcile with the booking amount');
        }
        await tx.quotationInstallment.createMany({
          data: installments.map((installment) => ({
            tenantId,
            quotationId: quotation.id,
            bookingId: created.id,
            sequenceNumber: installment.sequenceNumber,
            name: installment.name,
            description: installment.description,
            percentage: installment.percentage,
            scheduledAmount: installment.scheduledAmount,
            dueDate: installment.dueDate,
          })),
        });
      }
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          bookingId: created.id,
          action: 'CREATE',
          objectType: 'Booking',
          objectId: created.id,
          newValues: { number: bookingNumber, unitId: data.unitId, totalAmount: data.totalAmount },
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          bookingId: created.id,
          action: 'UPDATE',
          objectType: 'Unit',
          objectId: data.unitId,
          oldValues: { status: 'AVAILABLE' },
          newValues: { status: data.status === 'CONFIRMED' ? 'BOOKED' : 'RESERVED', bookingId: created.id },
        },
      });
      if (opportunity && !['CLOSED_WON', 'CLOSED_LOST'].includes(opportunity.stage)) {
        await tx.opportunity.update({ where: { id: opportunity.id }, data: { stage: 'CLOSED_WON' } });
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            opportunityId: opportunity.id,
            bookingId: created.id,
            action: 'UPDATE',
            objectType: 'Opportunity',
            objectId: opportunity.id,
            oldValues: { stage: opportunity.stage },
            newValues: { stage: 'CLOSED_WON', bookingId: created.id },
          },
        });
      }
      const linkedLeadId = data.leadId || opportunity?.leadId || quotation?.leadId;
      if (linkedLeadId) {
        const linkedLead = await tx.lead.findFirst({
          where: { id: linkedLeadId, tenantId },
          select: { id: true, status: true },
        });
        if (linkedLead && linkedLead.status !== 'BOOKED') {
          await tx.lead.update({ where: { id: linkedLead.id }, data: { status: 'BOOKED' } });
          await tx.auditLog.create({
            data: {
              tenantId,
              userId,
              leadId: linkedLead.id,
              bookingId: created.id,
              action: 'UPDATE',
              objectType: 'Lead',
              objectId: linkedLead.id,
              oldValues: { status: linkedLead.status },
              newValues: { status: 'BOOKED', bookingId: created.id },
            },
          });
        }
      }
      return created;
    });

    res.status(201).json({ success: true, data: booking });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    if (error instanceof Error && error.message === 'Unit is no longer available; refresh inventory and retry') {
      return res.status(409).json({ success: false, error: error.message });
    }
    console.error('Create booking error:', error);
    res.status(500).json({ success: false, error: 'Failed to create booking' });
  }
});

router.put('/:id', authorize('Booking', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;

    const existing = await prisma.booking.findFirst({
      where: { id: req.params.id, tenantId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    if (!(await canAccessBooking(req.user!, existing))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this booking' });
    }

    if (existing.status === 'CANCELLED' || existing.status === 'COMPLETED') {
      return res.status(400).json({ success: false, error: 'Cannot update cancelled or completed booking' });
    }

    const data = updateBookingSchema.parse(req.body);

    const updateData: any = { ...data };
    if (data.bookingDate) updateData.bookingDate = new Date(data.bookingDate);

    const booking = await prisma.booking.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        lead: { select: { id: true, firstName: true, lastName: true } },
        unit: { select: { id: true, number: true } },
      },
    });

    await auditLog(tenantId, userId, 'UPDATE', 'Booking', booking.id, existing, booking);

    res.json({ success: true, data: booking });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Update booking error:', error);
    res.status(500).json({ success: false, error: 'Failed to update booking' });
  }
});

router.patch('/:id/confirm', authorize('Booking', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;

    const existing = await prisma.booking.findFirst({
      where: { id: req.params.id, tenantId },
      include: {
        unit: { select: { id: true, status: true } },
        quotation: { select: { id: true, status: true, totalAmount: true, paymentPlan: true, notes: true } },
      },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    if (!(await canAccessBooking(req.user!, existing))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this booking' });
    }

    if (existing.status !== 'PENDING') {
      return res.status(400).json({ success: false, error: 'Only pending bookings can be confirmed' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const otherActiveBookings = await tx.booking.count({
        where: {
          id: { not: existing.id },
          tenantId,
          unitId: existing.unitId,
          status: { in: ['PENDING', 'CONFIRMED'] },
        },
      });
      if (otherActiveBookings > 0) {
        throw new Error('Another active booking already holds this unit');
      }
      const unitReservation = await tx.unit.updateMany({
        where: {
          id: existing.unitId,
          tenantId,
          projectId: existing.projectId,
          status: { in: ['AVAILABLE', 'RESERVED'] },
        },
        data: { status: 'BOOKED' },
      });
      if (unitReservation.count !== 1) {
        throw new Error('Unit is no longer available; refresh inventory and retry');
      }
      const bookingStatus = await tx.booking.updateMany({
        where: { id: existing.id, tenantId, status: 'PENDING' },
        data: { status: 'CONFIRMED' },
      });
      if (bookingStatus.count !== 1) {
        throw new Error('Booking status changed; refresh and retry');
      }
      const booking = await tx.booking.findFirst({
        where: { id: existing.id, tenantId },
      });
      if (!booking) throw new Error('Booking not found after confirmation');

      const quotation = existing.quotation;
      const plan = quotation ? quotationPaymentPlan(quotation.paymentPlan, quotation.notes) : null;
      if (plan && quotation) {
        if (!money(quotation.totalAmount).eq(money(booking.totalAmount))) {
          throw new Error('Booking amount does not reconcile with the approved quotation');
        }
        const existingScheduleCount = await tx.quotationInstallment.count({
          where: { tenantId, bookingId: booking.id },
        });
        if (existingScheduleCount === 0) {
          const installments = buildInstallmentDrafts(plan, booking.totalAmount, booking.bookingDate);
          const scheduleTotal = installments.reduce((sum, installment) => sum.plus(installment.scheduledAmount), money(0));
          if (!scheduleTotal.eq(money(booking.totalAmount))) {
            throw new Error('Installment schedule does not reconcile with the booking amount');
          }
          await tx.quotationInstallment.createMany({
            data: installments.map((installment) => ({
              tenantId,
              quotationId: quotation.id,
              bookingId: booking.id,
              sequenceNumber: installment.sequenceNumber,
              name: installment.name,
              description: installment.description,
              percentage: installment.percentage,
              scheduledAmount: installment.scheduledAmount,
              dueDate: installment.dueDate,
            })),
          });
        }
      }

      if (existing.leadId) {
        const lead = await tx.lead.findFirst({ where: { id: existing.leadId, tenantId } });
        if (lead && lead.status === 'SITE_VISIT_HAPPENED') {
          await tx.lead.updateMany({
            where: { id: existing.leadId, tenantId },
            data: { status: 'BOOKED' },
          });

          await tx.auditLog.create({
            data: {
              tenantId,
              userId,
              leadId: existing.leadId,
              action: 'BOOKING_CONFIRMED',
              objectType: 'Lead',
              objectId: existing.leadId,
              oldValues: { status: 'SITE_VISIT_HAPPENED' },
              newValues: { status: 'BOOKED', bookingId: booking.id, reason: 'Booking confirmed' },
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          bookingId: booking.id,
          action: 'UPDATE',
          objectType: 'Booking',
          objectId: booking.id,
          oldValues: { status: existing.status, unitStatus: existing.unit.status },
          newValues: { status: 'CONFIRMED', unitStatus: 'BOOKED' },
        },
      });

      return booking;
    }, { isolationLevel: 'Serializable' });

    res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Error && [
      'Unit is no longer available; refresh inventory and retry',
      'Booking status changed; refresh and retry',
      'Booking not found after confirmation',
      'Another active booking already holds this unit',
      'Booking amount does not reconcile with the approved quotation',
      'Installment schedule does not reconcile with the booking amount',
    ].includes(error.message)) {
      return res.status(409).json({ success: false, error: error.message });
    }
    if ((error as { code?: string })?.code === 'P2034') {
      return res.status(409).json({ success: false, error: 'Inventory changed concurrently; refresh and retry' });
    }
    console.error('Confirm booking error:', error);
    res.status(500).json({ success: false, error: 'Failed to confirm booking' });
  }
});

router.patch('/:id/cancel', authorize('Booking', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;
    const { notes } = req.body;

    const existing = await prisma.booking.findFirst({
      where: { id: req.params.id, tenantId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    if (!(await canAccessBooking(req.user!, existing))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this booking' });
    }

    if (existing.status === 'CANCELLED' || existing.status === 'COMPLETED') {
      return res.status(400).json({ success: false, error: 'Booking is already cancelled or completed' });
    }

    const verifiedPaymentCount = await prisma.payment.count({
      where: { tenantId, bookingId: existing.id, status: { in: ['VERIFIED', 'COMPLETED'] } },
    });
    if (verifiedPaymentCount > 0) {
      return res.status(400).json({
        success: false,
        error: 'Booking has verified payments; reconcile or refund them before cancellation',
      });
    }

    const booking = await prisma.$transaction(async (tx) => {
      const updated = await tx.booking.updateMany({
        where: { id: existing.id, tenantId, status: existing.status },
        data: { status: 'CANCELLED', notes: notes || existing.notes },
      });
      if (updated.count !== 1) throw new Error('Booking status changed; refresh and retry');
      const otherActiveBookings = await tx.booking.count({
        where: {
          id: { not: existing.id },
          tenantId,
          unitId: existing.unitId,
          status: { in: ['PENDING', 'CONFIRMED'] },
        },
      });
      if (otherActiveBookings === 0) {
        await tx.unit.updateMany({
          where: {
            id: existing.unitId,
            tenantId,
            projectId: existing.projectId,
            status: existing.status === 'CONFIRMED' ? 'BOOKED' : 'RESERVED',
          },
          data: { status: 'AVAILABLE' },
        });
      }
      const cancelledBooking = await tx.booking.findFirst({ where: { id: existing.id, tenantId } });
      if (!cancelledBooking) throw new Error('Booking not found after cancellation');
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          bookingId: existing.id,
          action: 'UPDATE',
          objectType: 'Booking',
          objectId: existing.id,
          oldValues: { status: existing.status },
          newValues: { status: 'CANCELLED', notes, unitStatus: otherActiveBookings === 0 ? 'AVAILABLE' : undefined },
        },
      });
      return cancelledBooking;
    });

    res.json({ success: true, data: booking });
  } catch (error) {
    if (error instanceof Error && error.message === 'Booking status changed; refresh and retry') {
      return res.status(409).json({ success: false, error: error.message });
    }
    console.error('Cancel booking error:', error);
    res.status(500).json({ success: false, error: 'Failed to cancel booking' });
  }
});

router.delete('/:id', authorize('Booking', 'delete'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;

    const existing = await prisma.booking.findFirst({
      where: { id: req.params.id, tenantId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    if (!(await canAccessBooking(req.user!, existing))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this booking' });
    }

    if (existing.status === 'CONFIRMED' || existing.status === 'COMPLETED') {
      return res.status(400).json({ success: false, error: 'Cannot delete confirmed or completed booking' });
    }

    await prisma.booking.delete({ where: { id: req.params.id } });

    await auditLog(tenantId, userId, 'DELETE', 'Booking', existing.id, existing, null);

    res.json({ success: true, data: null });
  } catch (error) {
    console.error('Delete booking error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete booking' });
  }
});

export default router;