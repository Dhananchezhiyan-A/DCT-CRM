import { Router, Response } from 'express';
import { Prisma, ReceiptStatus } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { prisma } from '@dct-crm/db';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authorize, authorizeEffectivePermission } from '../middleware/authorization';
import { canAccessBooking, getScopeClause, applyScope } from '../services/recordAccess';
import { isVerifiedPaymentStatus, money } from '../services/commercialFinance';

const router = Router();
router.use(authenticate);

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  projectId: z.string().optional(),
  quotationId: z.string().optional(),
  status: z.nativeEnum(ReceiptStatus).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

const cancellationSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

function asRecord(value: Prisma.JsonValue): Record<string, Prisma.JsonValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : {};
}

function recordString(record: Record<string, Prisma.JsonValue>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

function receiptData<T extends { amount: Prisma.Decimal }>(receipt: T) {
  return { ...receipt, amount: receipt.amount.toNumber() };
}

router.get('/', authorize('Receipt', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const where: Prisma.ReceiptWhereInput = { tenantId: req.user!.tenantId };
    if (query.status) where.status = query.status;
    if (query.projectId) where.booking = { is: { projectId: query.projectId } };
    if (query.quotationId) where.quotationId = query.quotationId;
    if (query.startDate || query.endDate) {
      where.receiptDate = {
        ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
        ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
      };
    }
    if (query.search) {
      where.OR = [
        { receiptNumber: { contains: query.search, mode: 'insensitive' } },
        { customerNameSnapshot: { contains: query.search, mode: 'insensitive' } },
        { paymentReferenceSnapshot: { contains: query.search, mode: 'insensitive' } },
        { booking: { is: { number: { contains: query.search, mode: 'insensitive' } } } },
        { payment: { is: { reference: { contains: query.search, mode: 'insensitive' } } } },
      ];
    }
    const scope = await getScopeClause(req.user!, 'payment');
    const scopedWhere = applyScope(
      where as Record<string, unknown>,
      scope ? { payment: scope } : null,
    ) as Prisma.ReceiptWhereInput;

    const [receipts, total] = await Promise.all([
      prisma.receipt.findMany({
        where: scopedWhere,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ receiptDate: 'desc' }, { createdAt: 'desc' }],
        include: {
          booking: {
            select: {
              id: true,
              number: true,
              project: { select: { id: true, name: true } },
              unit: { select: { id: true, number: true } },
            },
          },
          quotation: { select: { id: true, number: true } },
          payment: { select: { id: true, reference: true, status: true } },
          issuedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.receipt.count({ where: scopedWhere }),
    ]);

    res.json({
      success: true,
      data: receipts.map(receiptData),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.issues[0]?.message || 'Invalid receipt filters' });
    }
    console.error('Get receipts error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch receipts' });
  }
});

router.get('/:id/pdf', authorize('Receipt', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const receipt = await prisma.receipt.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: { booking: true },
    });
    if (!receipt) return res.status(404).json({ success: false, error: 'Receipt not found' });
    if (!(await canAccessBooking(req.user!, receipt.booking))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this receipt' });
    }

    const details = asRecord(receipt.detailsSnapshot);
    const company = details.company && typeof details.company === 'object' && !Array.isArray(details.company)
      ? details.company as Record<string, Prisma.JsonValue>
      : {};
    const document = new PDFDocument({ size: 'A4', margin: 48 });
    const filename = `${receipt.receiptNumber.replace(/[^a-z0-9-]/gi, '-')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    document.pipe(res);

    const dateText = (date: Date) => new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
    }).format(date);
    const currency = (amount: Prisma.Decimal) => `INR ${new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount.toNumber())}`;
    const companyName = recordString(company, 'name') || 'Company';
    const companyAddress = ['address', 'city', 'state', 'country']
      .map((key) => recordString(company, key))
      .filter(Boolean)
      .join(', ');

    document.font('Helvetica-Bold').fontSize(18).text(companyName, { align: 'center' });
    if (companyAddress) document.font('Helvetica').fontSize(9).text(companyAddress, { align: 'center' });
    document.moveDown(1);
    document.font('Helvetica-Bold').fontSize(16).text('PAYMENT RECEIPT', { align: 'center' });
    document.moveDown(1);
    if (receipt.status === 'CANCELLED') {
      document.font('Helvetica-Bold').fontSize(12).fillColor('#b91c1c').text('CANCELLED', { align: 'center' });
      document.fillColor('#111827').moveDown(0.5);
    }
    const field = (label: string, value: string) => {
      document.font('Helvetica-Bold').fontSize(10).text(`${label}: `, { continued: true });
      document.font('Helvetica').text(value || '—');
      document.moveDown(0.35);
    };
    field('Receipt Number', receipt.receiptNumber);
    field('Receipt Date', dateText(receipt.receiptDate));
    field('Customer', receipt.customerNameSnapshot);
    field('Project', receipt.projectNameSnapshot);
    field('Unit', receipt.unitNumberSnapshot);
    field('Booking', receipt.booking.number);
    field('Payment Reference', receipt.paymentReferenceSnapshot || '');
    field('Payment Date', dateText(new Date(recordString(details, 'paymentDate') || receipt.receiptDate.toISOString())));
    field('Payment Mode', recordString(details, 'paymentMode'));
    field('Received From', recordString(details, 'payerName') || receipt.customerNameSnapshot);
    field('Amount', currency(receipt.amount));
    const balanceAfterReceipt = details.balanceAfterReceipt;
    if (typeof balanceAfterReceipt === 'number' && Number.isFinite(balanceAfterReceipt)) {
      field('Balance Remaining', currency(new Prisma.Decimal(balanceAfterReceipt)));
    }
    if (receipt.status === 'CANCELLED') {
      field('Cancellation Reason', receipt.cancellationReason || '');
    } else {
      document.moveDown(1);
      document.font('Helvetica').fontSize(9).text('This receipt was issued for a verified payment.', { align: 'center' });
    }
    document.end();
  } catch (error) {
    console.error('Download receipt PDF error:', error);
    if (!res.headersSent) res.status(500).json({ success: false, error: 'Failed to generate receipt PDF' });
  }
});

router.get('/:id', authorize('Receipt', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const receipt = await prisma.receipt.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: {
        booking: {
          include: {
            project: { select: { id: true, name: true } },
            unit: { select: { id: true, number: true } },
          },
        },
        payment: {
          include: {
            allocations: {
              include: {
                installment: { select: { id: true, sequenceNumber: true, name: true, dueDate: true } },
              },
            },
          },
        },
        issuedBy: { select: { id: true, firstName: true, lastName: true } },
        cancelledBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!receipt) return res.status(404).json({ success: false, error: 'Receipt not found' });
    if (!(await canAccessBooking(req.user!, receipt.booking))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this receipt' });
    }
    res.json({ success: true, data: receiptData(receipt) });
  } catch (error) {
    console.error('Get receipt error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch receipt' });
  }
});

router.post(
  '/payments/:paymentId/issue',
  authorizeEffectivePermission('RECEIPT_CREATE'),
  async (req: AuthRequest, res: Response) => {
    try {
      const paymentRecord = await prisma.payment.findFirst({
        where: { id: req.params.paymentId, tenantId: req.user!.tenantId },
        include: {
          booking: {
            include: {
              lead: { select: { firstName: true, lastName: true } },
              project: { select: { name: true, address: true, city: true, state: true } },
              unit: { select: { id: true, number: true, area: true, price: true, status: true } },
              quotation: { select: { id: true } },
            },
          },
          tenant: { select: { name: true, address: true, city: true, state: true, country: true, phone: true, email: true } },
        },
      });
      if (!paymentRecord) return res.status(404).json({ success: false, error: 'Payment not found' });
      if (!(await canAccessBooking(req.user!, paymentRecord.booking))) {
        return res.status(403).json({ success: false, error: 'You do not have access to this payment' });
      }
      if (!isVerifiedPaymentStatus(paymentRecord.status)) {
        return res.status(400).json({ success: false, error: 'A receipt can only be issued for a verified payment' });
      }
      if (paymentRecord.booking.status === 'CANCELLED') {
        return res.status(400).json({ success: false, error: 'Cannot issue a receipt for a cancelled booking' });
      }

      const result = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT "id" FROM "Payment"
          WHERE "id" = ${paymentRecord.id} AND "tenantId" = ${req.user!.tenantId}
          FOR UPDATE
        `;
        const current = await tx.payment.findFirst({
          where: { id: paymentRecord.id, tenantId: req.user!.tenantId },
          include: { receipt: true },
        });
        if (!current || !isVerifiedPaymentStatus(current.status)) {
          throw new Error('A receipt can only be issued for a verified payment');
        }

        const booking = paymentRecord.booking;
        await tx.$queryRaw`
          SELECT "id" FROM "Unit"
          WHERE "id" = ${booking.unit.id} AND "tenantId" = ${req.user!.tenantId}
          FOR UPDATE
        `;
        const otherActiveBookings = await tx.booking.count({
          where: {
            id: { not: booking.id },
            tenantId: req.user!.tenantId,
            unitId: booking.unit.id,
            status: { in: ['PENDING', 'CONFIRMED', 'COMPLETED'] },
          },
        });
        if (otherActiveBookings > 0) {
          throw new Error('Another active booking already holds this unit');
        }
        const unitReservation = await tx.unit.updateMany({
          where: {
            id: booking.unit.id,
            tenantId: req.user!.tenantId,
            projectId: booking.projectId,
            status: { in: ['AVAILABLE', 'RESERVED'] },
          },
          data: { status: 'BOOKED' },
        });
        if (unitReservation.count === 1) {
          await tx.auditLog.create({
            data: {
              tenantId: req.user!.tenantId,
              userId: req.user!.id,
              bookingId: booking.id,
              action: 'UPDATE',
              objectType: 'Unit',
              objectId: booking.unit.id,
              oldValues: { status: booking.unit.status },
              newValues: { status: 'BOOKED', bookingId: booking.id, reason: 'Official receipt issued' },
            },
          });
        } else if (booking.unit.status === 'AVAILABLE' || booking.unit.status === 'RESERVED') {
          throw new Error('Unit status changed; retry receipt issuance');
        }
        if (current.receipt) return { receipt: current.receipt, created: false };

        const verifiedPayments = await tx.payment.findMany({
          where: {
            tenantId: req.user!.tenantId,
            bookingId: booking.id,
            status: { in: ['VERIFIED', 'COMPLETED'] },
          },
          select: {
            amount: true,
            receipt: { select: { status: true } },
          },
        });
        const totalReceived = verifiedPayments
          .filter((payment) => payment.receipt?.status !== 'CANCELLED')
          .reduce((sum, payment) => sum.plus(money(payment.amount)), money(0));
        const balanceAfterReceipt = money(booking.totalAmount).minus(totalReceived).gt(0)
          ? money(booking.totalAmount).minus(totalReceived)
          : money(0);

        const leadName = [booking.lead?.firstName, booking.lead?.lastName].filter(Boolean).join(' ');
        const notes = paymentRecord.notes || '';
        const payerName = notes.match(/^Payer:\s*(.+)$/im)?.[1]?.trim() || leadName || 'Customer';
        const paymentMode = notes.match(/^Payment mode:\s*(.+)$/im)?.[1]?.trim() || '';
        const receipt = await tx.receipt.create({
          data: {
            tenantId: req.user!.tenantId,
            paymentId: paymentRecord.id,
            bookingId: booking.id,
            quotationId: booking.quotation?.id,
            receiptNumber: `RCP-${paymentRecord.id.toUpperCase()}`,
            amount: money(paymentRecord.amount),
            receiptDate: new Date(),
            customerNameSnapshot: payerName,
            projectNameSnapshot: booking.project.name,
            unitNumberSnapshot: booking.unit.number,
            paymentReferenceSnapshot: paymentRecord.reference,
            detailsSnapshot: {
              payerName,
              paymentMode,
              paymentDate: paymentRecord.paymentDate.toISOString(),
              company: paymentRecord.tenant,
              projectAddress: [booking.project.address, booking.project.city, booking.project.state]
                .filter(Boolean)
                .join(', '),
              unitArea: booking.unit.area,
              unitPrice: booking.unit.price,
              balanceAfterReceipt: balanceAfterReceipt.toNumber(),
            },
            issuedById: req.user!.id,
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: req.user!.tenantId,
            userId: req.user!.id,
            bookingId: booking.id,
            action: 'CREATE',
            objectType: 'Receipt',
            objectId: receipt.id,
            newValues: { receiptNumber: receipt.receiptNumber, paymentId: paymentRecord.id, amount: receipt.amount.toNumber() },
          },
        });
        return { receipt, created: true };
      }, { isolationLevel: 'Serializable' });

      res.status(result.created ? 201 : 200).json({
        success: true,
        data: receiptData(result.receipt),
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        const existing = await prisma.receipt.findFirst({
          where: { paymentId: req.params.paymentId, tenantId: req.user!.tenantId },
        });
        if (existing) return res.json({ success: true, data: receiptData(existing) });
      }
      if (error?.code === 'P2034') {
        return res.status(409).json({ success: false, error: 'The payment changed concurrently; retry receipt issuance' });
      }
      if (error instanceof Error && [
        'A receipt can only be issued for a verified payment',
        'Another active booking already holds this unit',
        'Unit status changed; retry receipt issuance',
      ].includes(error.message)) {
        if (error.message !== 'A receipt can only be issued for a verified payment') {
          return res.status(409).json({ success: false, error: error.message });
        }
        return res.status(400).json({ success: false, error: error.message });
      }
      console.error('Issue receipt error:', error);
      res.status(500).json({ success: false, error: 'Failed to issue receipt' });
    }
  },
);

router.patch(
  '/:id/cancel',
  authorizeEffectivePermission('RECEIPT_CANCEL'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { reason } = cancellationSchema.parse(req.body);
      const existing = await prisma.receipt.findFirst({
        where: { id: req.params.id, tenantId: req.user!.tenantId },
        include: { booking: true },
      });
      if (!existing) return res.status(404).json({ success: false, error: 'Receipt not found' });
      if (!(await canAccessBooking(req.user!, existing.booking))) {
        return res.status(403).json({ success: false, error: 'You do not have access to this receipt' });
      }
      if (existing.status === 'CANCELLED') {
        return res.status(400).json({ success: false, error: 'Receipt is already cancelled' });
      }

      const receipt = await prisma.$transaction(async (tx) => {
        const updated = await tx.receipt.update({
          where: { id: existing.id },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancelledById: req.user!.id,
            cancellationReason: reason,
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: req.user!.tenantId,
            userId: req.user!.id,
            bookingId: existing.bookingId,
            action: 'CANCEL',
            objectType: 'Receipt',
            objectId: existing.id,
            oldValues: { status: existing.status },
            newValues: { status: updated.status, cancellationReason: reason },
          },
        });
        return updated;
      });
      res.json({ success: true, data: receiptData(receipt) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: error.issues[0]?.message || 'Cancellation reason is required' });
      }
      console.error('Cancel receipt error:', error);
      res.status(500).json({ success: false, error: 'Failed to cancel receipt' });
    }
  },
);

export default router;
