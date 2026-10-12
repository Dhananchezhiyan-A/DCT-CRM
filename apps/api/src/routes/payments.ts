import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authorize, authorizeEffectivePermission } from '../middleware/authorization';
import { auditLog } from '../middleware/audit';
import { applyScope, canAccessBooking, getScopeClause } from '../services/recordAccess';
import { isVerifiedPaymentStatus, money } from '../services/commercialFinance';

const router = Router();

router.use(authenticate);

const paymentSchema = z.object({
  bookingId: z.string(),
  amount: z.number().min(0.01),
  paymentDate: z.string().datetime().optional(),
  reference: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});

const updatePaymentSchema = paymentSchema.partial();

const allocationSchema = z.object({
  installmentId: z.string().min(1),
  amount: z.number().finite().positive(),
});

router.get('/', authorize('Payment', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId } = req.user!;
    const {
      page = 1,
      limit = 20,
      bookingId,
      status,
      search,
      leadId,
      projectId,
      unitId,
      quotationId,
      paymentMode,
      minAmount,
      maxAmount,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    let where: any = { tenantId };
    if (bookingId) where.bookingId = bookingId;
    if (status) where.status = status;
    if (projectId || unitId || quotationId || leadId) {
      where.booking = {
        is: {
          ...(leadId ? { leadId: String(leadId) } : {}),
          ...(projectId ? { projectId: String(projectId) } : {}),
          ...(unitId ? { unitId: String(unitId) } : {}),
          ...(quotationId ? { quotationId: String(quotationId) } : {}),
        },
      };
    }
    if (paymentMode) where.notes = { contains: `Payment mode: ${String(paymentMode)}`, mode: 'insensitive' };
    if (search) {
      const searchTerm = String(search).trim();
      where.OR = [
        { reference: { contains: searchTerm, mode: 'insensitive' } },
        { notes: { contains: searchTerm, mode: 'insensitive' } },
        { booking: { is: { number: { contains: searchTerm, mode: 'insensitive' } } } },
        {
          booking: {
            is: {
              quotation: { is: { number: { contains: searchTerm, mode: 'insensitive' } } },
            },
          },
        },
        {
          booking: {
            is: {
              unit: { is: { number: { contains: searchTerm, mode: 'insensitive' } } },
            },
          },
        },
        {
          booking: {
            is: {
              project: { is: { name: { contains: searchTerm, mode: 'insensitive' } } },
            },
          },
        },
        {
          booking: {
            is: {
              lead: { is: { OR: [
                { firstName: { contains: searchTerm, mode: 'insensitive' } },
                { lastName: { contains: searchTerm, mode: 'insensitive' } },
              ] } },
            },
          },
        },
        { receipt: { is: { receiptNumber: { contains: searchTerm, mode: 'insensitive' } } } },
      ];
    }
    if (minAmount) where.amount = { ...where.amount, gte: Number(minAmount) };
    if (maxAmount) where.amount = { ...where.amount, lte: Number(maxAmount) };
    if (startDate || endDate) {
      where.paymentDate = {
        ...(startDate ? { gte: new Date(startDate as string) } : {}),
        ...(endDate ? { lte: new Date(endDate as string) } : {}),
      };
    }
    where = applyScope(where, await getScopeClause(req.user!, 'payment'));

    const successfulWhere = { ...where, status: { in: ['VERIFIED', 'COMPLETED'] } };
    const [payments, total, statusTotals, cancelledTotal] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { [sortBy as string]: sortOrder },
        include: {
          booking: {
            select: {
              id: true,
              number: true,
              quotation: { select: { id: true, number: true } },
              project: { select: { id: true, name: true } },
              unit: { select: { id: true, number: true } },
              lead: { select: { firstName: true, lastName: true } },
            },
          },
          receipt: { select: { id: true, receiptNumber: true, status: true } },
        },
      }),
      prisma.payment.count({ where }),
      prisma.payment.groupBy({
        by: ['status'],
        where,
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.payment.aggregate({
        where: { ...successfulWhere, receipt: { is: { status: 'CANCELLED' } } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);

    res.json({
      success: true,
      data: payments,
      summary: {
        successfulAmount: Math.max(
          0,
          statusTotals
            .filter((group) => ['VERIFIED', 'COMPLETED'].includes(group.status))
            .reduce((sum, group) => sum + Number(group._sum.amount || 0), 0)
            - Number(cancelledTotal._sum.amount || 0),
        ),
        pendingAmount: statusTotals
          .filter((group) => group.status === 'PENDING')
          .reduce((sum, group) => sum + Number(group._sum.amount || 0), 0),
        rejectedAmount: statusTotals
          .filter((group) => group.status === 'REJECTED')
          .reduce((sum, group) => sum + Number(group._sum.amount || 0), 0),
        reversedAmount: Number(cancelledTotal._sum.amount || 0),
        reversedCount: cancelledTotal._count._all,
      },
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch payments' });
  }
});

router.get('/:id', authorize('Payment', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId } = req.user!;

    const payment = await prisma.payment.findFirst({
      where: applyScope(
        { id: req.params.id, tenantId },
        await getScopeClause(req.user!, 'payment'),
      ),
      include: {
        booking: {
          select: {
            id: true,
            number: true,
            unit: { select: { number: true } },
            project: { select: { name: true } },
          },
        },
      },
    });

    if (!payment) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }

    res.json({ success: true, data: payment });
  } catch (error) {
    console.error('Get payment error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch payment' });
  }
});

router.get(
  '/:id/allocations',
  authorize('Payment', 'read'),
  async (req: AuthRequest, res: Response) => {
    try {
      const payment = await prisma.payment.findFirst({
        where: { id: req.params.id, tenantId: req.user!.tenantId },
        include: { booking: true },
      });
      if (!payment) return res.status(404).json({ success: false, error: 'Payment not found' });
      if (!(await canAccessBooking(req.user!, payment.booking))) {
        return res.status(403).json({ success: false, error: 'You do not have access to this payment' });
      }

      const allocations = await prisma.paymentAllocation.findMany({
        where: { paymentId: payment.id, tenantId: req.user!.tenantId },
        orderBy: { createdAt: 'asc' },
        include: {
          installment: {
            select: { id: true, sequenceNumber: true, name: true, dueDate: true, scheduledAmount: true },
          },
        },
      });
      res.json({
        success: true,
        data: allocations.map((allocation) => ({
          ...allocation,
          amount: allocation.amount.toNumber(),
          installment: {
            ...allocation.installment,
            scheduledAmount: allocation.installment.scheduledAmount.toNumber(),
          },
        })),
      });
    } catch (error) {
      console.error('Get payment allocations error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch payment allocations' });
    }
  },
);

router.post(
  '/:id/allocations',
  authorize('Payment', 'read'),
  authorizeEffectivePermission('PAYMENT_ALLOCATE'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { installmentId, amount: requestedAmount } = allocationSchema.parse(req.body);
      const paymentRecord = await prisma.payment.findFirst({
        where: { id: req.params.id, tenantId: req.user!.tenantId },
        include: { booking: true },
      });
      if (!paymentRecord) return res.status(404).json({ success: false, error: 'Payment not found' });
      if (!(await canAccessBooking(req.user!, paymentRecord.booking))) {
        return res.status(403).json({ success: false, error: 'You do not have access to this payment' });
      }

      const allocation = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT "id" FROM "Payment"
          WHERE "id" = ${paymentRecord.id} AND "tenantId" = ${req.user!.tenantId}
          FOR UPDATE
        `;
        await tx.$queryRaw`
          SELECT "id" FROM "QuotationInstallment"
          WHERE "id" = ${installmentId} AND "tenantId" = ${req.user!.tenantId}
          FOR UPDATE
        `;

        const [payment, installment] = await Promise.all([
          tx.payment.findFirst({
            where: { id: paymentRecord.id, tenantId: req.user!.tenantId },
            select: { id: true, amount: true, status: true, bookingId: true },
          }),
          tx.quotationInstallment.findFirst({
            where: { id: installmentId, tenantId: req.user!.tenantId },
            select: { id: true, tenantId: true, bookingId: true, scheduledAmount: true },
          }),
        ]);
        if (!payment || !installment) throw new Error('Payment or installment not found');
        if (!isVerifiedPaymentStatus(payment.status)) {
          throw new Error('Only verified payments can be allocated');
        }
        if (payment.bookingId !== installment.bookingId) {
          throw new Error('Payment and installment must belong to the same booking');
        }
        const booking = await tx.booking.findFirst({
          where: { id: installment.bookingId, tenantId: req.user!.tenantId },
          select: { status: true },
        });
        if (!booking || booking.status === 'CANCELLED') {
          throw new Error('Cannot allocate payments to a cancelled booking');
        }

        const [paymentAllocations, installmentAllocations, duplicate] = await Promise.all([
          tx.paymentAllocation.aggregate({
            where: { tenantId: req.user!.tenantId, paymentId: payment.id },
            _sum: { amount: true },
          }),
          tx.paymentAllocation.aggregate({
            where: {
              tenantId: req.user!.tenantId,
              installmentId: installment.id,
              payment: { is: { status: { in: ['VERIFIED', 'COMPLETED'] } } },
            },
            _sum: { amount: true },
          }),
          tx.paymentAllocation.findFirst({
            where: {
              tenantId: req.user!.tenantId,
              paymentId: payment.id,
              installmentId: installment.id,
            },
            select: { id: true },
          }),
        ]);
        if (duplicate) throw new Error('This payment already has an allocation to the installment');

        const allocatedFromPayment = money(paymentAllocations._sum.amount ?? 0);
        const receivedByInstallment = money(installmentAllocations._sum.amount ?? 0);
        const amount = money(requestedAmount);
        const paymentBalance = money(payment.amount).minus(allocatedFromPayment);
        const installmentBalance = money(installment.scheduledAmount).minus(receivedByInstallment);
        if (amount.gt(paymentBalance)) throw new Error('Allocation exceeds the unallocated payment balance');
        if (amount.gt(installmentBalance)) throw new Error('Allocation exceeds the installment outstanding balance');

        const created = await tx.paymentAllocation.create({
          data: {
            tenantId: req.user!.tenantId,
            paymentId: payment.id,
            installmentId: installment.id,
            amount,
            createdById: req.user!.id,
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: req.user!.tenantId,
            userId: req.user!.id,
            bookingId: installment.bookingId,
            action: 'CREATE',
            objectType: 'PaymentAllocation',
            objectId: created.id,
            newValues: { paymentId: payment.id, installmentId: installment.id, amount: amount.toNumber() },
          },
        });
        return created;
      }, { isolationLevel: 'Serializable' });

      res.status(201).json({
        success: true,
        data: { ...allocation, amount: allocation.amount.toNumber() },
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: error.issues[0]?.message || 'Invalid allocation' });
      }
      if (error?.code === 'P2002') {
        return res.status(409).json({ success: false, error: 'This payment is already allocated to the installment' });
      }
      if (error?.code === 'P2034') {
        return res.status(409).json({ success: false, error: 'The financial records changed concurrently; retry the allocation' });
      }
      const clientErrors = [
        'Payment or installment not found',
        'Only verified payments can be allocated',
        'Payment and installment must belong to the same booking',
        'Cannot allocate payments to a cancelled booking',
        'This payment already has an allocation to the installment',
        'Allocation exceeds the unallocated payment balance',
        'Allocation exceeds the installment outstanding balance',
      ];
      if (clientErrors.includes(error?.message)) {
        return res.status(400).json({ success: false, error: error.message });
      }
      console.error('Create payment allocation error:', error);
      res.status(500).json({ success: false, error: 'Failed to allocate payment' });
    }
  },
);

router.post('/', authorize('Payment', 'create'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;
    const data = paymentSchema.parse(req.body);
    const amount = money(data.amount);
    if (amount.lte(0)) {
      return res.status(400).json({ success: false, error: 'Payment amount must be at least one cent' });
    }

    const booking = await prisma.booking.findFirst({
      where: { id: data.bookingId, tenantId },
    });

    if (!booking) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }
    if (!(await canAccessBooking(req.user!, booking))) {
      return res.status(403).json({ success: false, error: 'You do not have access to the linked booking' });
    }

    const payment = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id" FROM "Booking"
        WHERE "id" = ${booking.id} AND "tenantId" = ${tenantId}
        FOR UPDATE
      `;
      const currentBooking = await tx.booking.findFirst({
        where: { id: booking.id, tenantId },
        select: { totalAmount: true, status: true },
      });
      if (!currentBooking || currentBooking.status === 'CANCELLED') {
        throw new Error('Cannot record a payment for a cancelled booking');
      }
      const recordedPayments = await tx.payment.aggregate({
        where: {
          tenantId,
          bookingId: booking.id,
          status: { in: ['PENDING', 'VERIFIED', 'COMPLETED', 'PARTIAL'] },
        },
        _sum: { amount: true },
      });
      const remaining = money(currentBooking.totalAmount).minus(money(recordedPayments._sum.amount ?? 0));
      if (amount.gt(remaining)) {
        throw new Error('Payment exceeds the remaining booking amount');
      }
      const created = await tx.payment.create({
        data: {
          tenantId,
          bookingId: data.bookingId,
          amount: amount.toNumber(),
          status: 'PENDING',
          paymentDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
          reference: data.reference,
          notes: data.notes,
        },
        include: {
          booking: { select: { id: true, number: true } },
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          bookingId: data.bookingId,
          action: 'CREATE',
          objectType: 'Payment',
          objectId: created.id,
          newValues: { amount: data.amount, bookingId: data.bookingId },
        },
      });
      return created;
    });

    res.status(201).json({ success: true, data: payment });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.issues[0]?.message || 'Invalid payment' });
    }
    if (error instanceof Error && [
      'Cannot record a payment for a cancelled booking',
      'Payment exceeds the remaining booking amount',
    ].includes(error.message)) {
      return res.status(400).json({ success: false, error: error.message });
    }
    console.error('Create payment error:', error);
    res.status(500).json({ success: false, error: 'Failed to create payment' });
  }
});

router.put('/:id', authorize('Payment', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;

    const existing = await prisma.payment.findFirst({
      where: applyScope(
        { id: req.params.id, tenantId },
        await getScopeClause(req.user!, 'payment'),
      ),
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }

    if (isVerifiedPaymentStatus(existing.status)) {
      return res.status(400).json({ success: false, error: 'Cannot update a verified payment' });
    }
    const [allocationCount, receipt] = await Promise.all([
      prisma.paymentAllocation.count({ where: { paymentId: existing.id, tenantId } }),
      prisma.receipt.findUnique({ where: { paymentId: existing.id }, select: { id: true } }),
    ]);
    if (allocationCount || receipt) {
      return res.status(400).json({ success: false, error: 'Cannot update a payment with financial ledger records' });
    }

    const data = updatePaymentSchema.parse(req.body);
    if (data.bookingId && data.bookingId !== existing.bookingId) {
      const booking = await prisma.booking.findFirst({
        where: { id: data.bookingId, tenantId },
      });
      if (!booking) {
        return res.status(404).json({ success: false, error: 'Booking not found' });
      }
      if (req.user!.profileName === 'Sales' && !(await canAccessBooking(req.user!, booking))) {
        return res.status(403).json({ success: false, error: 'You do not have access to the linked booking' });
      }
    }

    const updateData: any = { ...data };
    if (data.paymentDate) updateData.paymentDate = new Date(data.paymentDate);

    const payment = await prisma.payment.update({
      where: { id: req.params.id },
      data: updateData,
    });

    await auditLog(tenantId, userId, 'UPDATE', 'Payment', payment.id, existing, payment);

    res.json({ success: true, data: payment });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Update payment error:', error);
    res.status(500).json({ success: false, error: 'Failed to update payment' });
  }
});

router.patch('/:id/verify', authorizeEffectivePermission('PAYMENT_VERIFY'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;

    const existing = await prisma.payment.findFirst({
      where: { id: req.params.id, tenantId },
      include: { booking: true },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }

    if (!(await canAccessBooking(req.user!, existing.booking))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this payment' });
    }
    if (existing.status !== 'PENDING') {
      return res.status(400).json({ success: false, error: 'Only pending payments can be verified' });
    }

    const payment = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id" FROM "Payment"
        WHERE "id" = ${existing.id} AND "tenantId" = ${tenantId}
        FOR UPDATE
      `;
      const current = await tx.payment.findFirst({
        where: { id: existing.id, tenantId },
        select: { id: true, status: true, bookingId: true },
      });
      if (!current || current.status !== 'PENDING') {
        throw new Error('Only pending payments can be verified');
      }
      const verified = await tx.payment.update({
        where: { id: current.id },
        data: { status: 'COMPLETED', verifiedAt: new Date(), verifiedById: userId },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          bookingId: current.bookingId,
          action: 'VERIFY',
          objectType: 'Payment',
          objectId: current.id,
          oldValues: { status: current.status },
          newValues: { status: verified.status, verifiedAt: verified.verifiedAt },
        },
      });
      return verified;
    });

    res.json({ success: true, data: payment });
  } catch (error) {
    if (error instanceof Error && error.message === 'Only pending payments can be verified') {
      return res.status(400).json({ success: false, error: error.message });
    }
    console.error('Verify payment error:', error);
    res.status(500).json({ success: false, error: 'Failed to verify payment' });
  }
});

const rejectPayment = async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;
    const { reason } = z.object({ reason: z.string().trim().min(1).max(500) }).parse(req.body);
    const existing = await prisma.payment.findFirst({
      where: { id: req.params.id, tenantId },
      include: { booking: true },
    });
    if (!existing) return res.status(404).json({ success: false, error: 'Payment not found' });
    if (!(await canAccessBooking(req.user!, existing.booking))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this payment' });
    }
    if (existing.status !== 'PENDING') {
      return res.status(400).json({ success: false, error: 'Only pending payments can be rejected; verified payments require a refund workflow' });
    }

    const rejected = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id" FROM "Payment"
        WHERE "id" = ${existing.id} AND "tenantId" = ${tenantId}
        FOR UPDATE
      `;
      const current = await tx.payment.findFirst({
        where: { id: existing.id, tenantId },
        select: { id: true, status: true, bookingId: true },
      });
      if (!current || current.status !== 'PENDING') {
        throw new Error('Only pending payments can be rejected');
      }
      const payment = await tx.payment.update({
        where: { id: current.id },
        data: { status: 'REJECTED', rejectedAt: new Date(), rejectedById: userId, rejectionReason: reason },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          bookingId: current.bookingId,
          action: 'REJECT',
          objectType: 'Payment',
          objectId: current.id,
          oldValues: { status: current.status },
          newValues: { status: payment.status, rejectionReason: reason },
        },
      });
      return payment;
    });
    return res.json({ success: true, data: rejected });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.issues[0]?.message || 'A rejection reason is required' });
    }
    if (error instanceof Error && error.message === 'Only pending payments can be rejected') {
      return res.status(400).json({ success: false, error: error.message });
    }
    console.error('Reject payment error:', error);
    return res.status(500).json({ success: false, error: 'Failed to reject payment' });
  }
};

router.patch('/:id/reject', authorizeEffectivePermission('PAYMENT_VERIFY'), rejectPayment);

router.delete('/:id', authorize('Payment', 'delete'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;

    const existing = await prisma.payment.findFirst({
      where: { id: req.params.id, tenantId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }

    if (isVerifiedPaymentStatus(existing.status)) {
      return res.status(400).json({ success: false, error: 'Cannot delete a verified payment' });
    }
    const [allocationCount, receipt] = await Promise.all([
      prisma.paymentAllocation.count({ where: { paymentId: existing.id, tenantId } }),
      prisma.receipt.findUnique({ where: { paymentId: existing.id }, select: { id: true } }),
    ]);
    if (allocationCount || receipt) {
      return res.status(400).json({ success: false, error: 'Cannot delete a payment with financial ledger records' });
    }

    await prisma.payment.delete({ where: { id: req.params.id } });

    await auditLog(tenantId, userId, 'DELETE', 'Payment', existing.id, existing, null);

    res.json({ success: true, data: null });
  } catch (error) {
    console.error('Delete payment error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete payment' });
  }
});

export default router;