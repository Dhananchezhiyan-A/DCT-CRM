import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authorizeEffectivePermission } from '../middleware/authorization';
import { canAccessBooking } from '../services/recordAccess';
import { installmentStatus, isVerifiedPaymentStatus, money } from '../services/commercialFinance';

const router = Router();

router.use(authenticate, authorizeEffectivePermission('INSTALLMENT_READ'));

router.get('/bookings/:bookingId', async (req: AuthRequest, res: Response) => {
  try {
    const booking = await prisma.booking.findFirst({
      where: { id: req.params.bookingId, tenantId: req.user!.tenantId },
      select: { id: true, tenantId: true, ownerId: true, creatorId: true, leadId: true, status: true },
    });
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });
    if (!(await canAccessBooking(req.user!, booking))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this booking' });
    }

    const installments = await prisma.quotationInstallment.findMany({
      where: { tenantId: req.user!.tenantId, bookingId: booking.id },
      orderBy: { sequenceNumber: 'asc' },
      include: {
        allocations: {
          include: {
            payment: {
              select: {
                id: true,
                amount: true,
                status: true,
                paymentDate: true,
                reference: true,
                receipt: { select: { id: true, receiptNumber: true, status: true } },
              },
            },
          },
        },
      },
    });

    const now = new Date();
    const data = installments.map((installment) => {
      const verifiedAllocations = installment.allocations.filter((allocation) =>
        isVerifiedPaymentStatus(allocation.payment.status),
      );
      const allocatedAmount = verifiedAllocations.reduce(
        (sum, allocation) => sum.plus(allocation.amount),
        money(0),
      );
      const balance = installmentStatus(
        installment.scheduledAmount,
        allocatedAmount,
        installment.dueDate,
        booking.status === 'CANCELLED',
        now,
      );
      return {
        id: installment.id,
        sequenceNumber: installment.sequenceNumber,
        name: installment.name,
        description: installment.description,
        percentage: installment.percentage?.toNumber() ?? null,
        dueDate: installment.dueDate,
        scheduledAmount: money(installment.scheduledAmount).toNumber(),
        receivedAmount: allocatedAmount.toNumber(),
        outstandingAmount: balance.outstandingAmount.toNumber(),
        status: balance.status,
        paymentDate: verifiedAllocations
          .map((allocation) => allocation.payment.paymentDate)
          .sort((left, right) => right.getTime() - left.getTime())[0] ?? null,
        allocations: installment.allocations.map((allocation) => ({
          id: allocation.id,
          amount: allocation.amount.toNumber(),
          payment: allocation.payment,
        })),
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error('Get booking installments error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch booking installments' });
  }
});

export default router;
