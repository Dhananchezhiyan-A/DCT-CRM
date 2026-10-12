import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@dct-crm/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { Response } from 'express';
import { authorize } from '../middleware/authorization';
import { auditLog } from '../middleware/audit';
import { PaginatedResponse } from '../types';
import { Prisma } from '@prisma/client';

const router = Router();

const unitSchema = z.object({
  projectId: z.string().min(1),
  number: z.string().min(1).max(50),
  type: z.string().min(1).max(50),
  floor: z.number().int().min(0).optional(),
  area: z.number().min(0).optional(),
  bedrooms: z.number().int().min(0).optional(),
  bathrooms: z.number().int().min(0).optional(),
  price: z.number().min(0),
  status: z.enum(['AVAILABLE', 'HOLD', 'RESERVED', 'BOOKED', 'SOLD', 'BLOCKED']).optional(),
  description: z.string().max(2000).optional(),
  features: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

const updateUnitSchema = unitSchema.partial();

router.get('/', authenticate, authorize('Unit', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId } = req.user!;
    const { 
      page = 1, 
      limit = 50, 
      projectId, 
      type, 
      status,
      minPrice,
      maxPrice,
      minFloor,
      maxFloor,
      search,
      sortBy = 'createdAt', 
      sortOrder = 'desc' 
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const where: Prisma.UnitWhereInput = {
      tenantId,
      ...(projectId && { projectId: projectId as string }),
      ...(type && { type: type as string }),
      ...(status && { status: status as any }),
      ...(status === 'AVAILABLE' && {
        bookings: {
          none: { status: { in: ['PENDING', 'CONFIRMED', 'COMPLETED'] } },
        },
      }),
      ...(minPrice && { price: { gte: Number(minPrice) } }),
      ...(maxPrice && { price: { lte: Number(maxPrice) } }),
      ...(minFloor && { floor: { gte: Number(minFloor) } }),
      ...(maxFloor && { floor: { lte: Number(maxFloor) } }),
      ...(search && {
        OR: [
          { number: { contains: search as string, mode: 'insensitive' } },
          { type: { contains: search as string, mode: 'insensitive' } },
        ],
      }),
    };

    const [units, total] = await Promise.all([
      prisma.unit.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { [sortBy as string]: sortOrder },
        include: {
          project: { select: { id: true, name: true, address: true } },
          _count: { select: { bookings: true } },
          bookings: {
            where: { status: { in: ['PENDING', 'CONFIRMED', 'COMPLETED'] } },
            select: { id: true },
            take: 1,
          },
        },
      }),
      prisma.unit.count({ where }),
    ]);

    const response: PaginatedResponse<typeof units[0]> = {
      success: true,
      data: units.map((unit) => {
        const hasActiveBooking = unit.bookings.length > 0;
        return {
          ...unit,
          bookings: [],
          status: unit.status === 'AVAILABLE' && hasActiveBooking ? 'BOOKED' : unit.status,
        };
      }),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch units' });
  }
});

router.get('/:id', authenticate, authorize('Unit', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId } = req.user!;
    const { id } = req.params;

    const unit = await prisma.unit.findFirst({
      where: { id, tenantId },
      include: {
        project: { select: { id: true, name: true, address: true } },
        bookings: { 
          select: { id: true, number: true, status: true, bookingDate: true, lead: { select: { firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        quotationItems: {
          orderBy: { createdAt: 'desc' },
          select: {
            quotation: {
              include: {
                lead: { select: { id: true, firstName: true, lastName: true } },
                bookings: {
                  select: {
                    id: true,
                    number: true,
                    status: true,
                    payments: {
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
                receipts: {
                  select: {
                    id: true,
                    receiptNumber: true,
                    amount: true,
                    status: true,
                    receiptDate: true,
                  },
                  orderBy: { receiptDate: 'desc' },
                },
              },
            },
          },
        },
      },
    });

    if (!unit) {
      return res.status(404).json({ success: false, error: 'Unit not found' });
    }

    const quotationMap = new Map(unit.quotationItems.map(({ quotation }) => [quotation.id, quotation]));
    const quotations = [...quotationMap.values()].map((quotation) => {
      const receivedAmount = quotation.bookings
        .flatMap((booking) => booking.payments)
        .filter((payment) => ['VERIFIED', 'COMPLETED'].includes(payment.status) && payment.receipt?.status !== 'CANCELLED')
        .reduce((sum, payment) => sum + Number(payment.amount), 0);
      return {
        ...quotation,
        receivedAmount,
        balanceAmount: Math.max(0, Number(quotation.totalAmount) - receivedAmount),
        paymentProgress: Number(quotation.totalAmount) > 0
          ? Math.min(100, (receivedAmount / Number(quotation.totalAmount)) * 100)
          : 0,
        receipts: quotation.receipts.map((receipt) => ({
          ...receipt,
          amount: Number(receipt.amount),
        })),
      };
    });

    res.json({
      success: true,
      data: {
        ...unit,
        quotationItems: undefined,
        financialSummary: { quotations },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch unit' });
  }
});

router.post('/', authenticate, authorize('Unit', 'create'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;
    const data = unitSchema.parse(req.body);

    const project = await prisma.project.findFirst({ where: { id: data.projectId, tenantId } });
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const existingUnit = await prisma.unit.findFirst({
      where: { projectId: data.projectId, number: data.number, tenantId },
    });
    if (existingUnit) {
      return res.status(409).json({ success: false, error: 'Unit number already exists in this project' });
    }

    const [unit] = await prisma.$transaction([
      prisma.unit.create({
        data: {
          ...data,
          tenantId,
        },
        include: {
          project: { select: { id: true, name: true } },
        },
      }),
      prisma.project.update({
        where: { id: data.projectId },
        data: { 
          totalUnits: { increment: 1 },
          updatedAt: new Date(),
        },
      }),
    ]);

    await auditLog(tenantId, userId, 'CREATE', 'Unit', unit.id, null, { number: data.number, projectId: data.projectId, price: data.price });

    res.status(201).json({ success: true, data: unit });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
    }
    res.status(500).json({ success: false, error: 'Failed to create unit' });
  }
});

router.put('/:id', authenticate, authorize('Unit', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;
    const { id } = req.params;
    const data = updateUnitSchema.parse(req.body);

    const existing = await prisma.unit.findFirst({ where: { id, tenantId } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Unit not found' });
    }

    if (data.number && data.number !== existing.number) {
      const duplicate = await prisma.unit.findFirst({
        where: { 
          projectId: existing.projectId, 
          number: data.number, 
          id: { not: id },
          tenantId,
        },
      });
      if (duplicate) {
        return res.status(409).json({ success: false, error: 'Unit number already exists in this project' });
      }
    }

    const oldStatus = existing.status;
    const newStatus = data.status || oldStatus;

    const unit = await prisma.unit.update({
      where: { id },
      data: { ...data, updatedAt: new Date() },
      include: {
        project: { select: { id: true, name: true } },
      },
    });

    if (oldStatus !== newStatus) {
      const projectUpdate: any = { updatedAt: new Date() };
      
      if (oldStatus === 'AVAILABLE' && (newStatus === 'RESERVED' || newStatus === 'SOLD')) {
        projectUpdate.availableUnits = { decrement: 1 };
      } else if ((oldStatus === 'RESERVED' || oldStatus === 'SOLD') && newStatus === 'AVAILABLE') {
        projectUpdate.availableUnits = { increment: 1 };
      }

      await prisma.project.update({
        where: { id: existing.projectId },
        data: projectUpdate,
      });
    }

    await auditLog(tenantId, userId, 'UPDATE', 'Unit', id, null, { ...data, previousStatus: oldStatus });

    res.json({ success: true, data: unit });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
    }
    res.status(500).json({ success: false, error: 'Failed to update unit' });
  }
});

router.patch('/:id/status', authenticate, authorize('Unit', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;
    const { id } = req.params;
    const { status, reason } = req.body;

    const existing = await prisma.unit.findFirst({ where: { id, tenantId } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Unit not found' });
    }

    const [unit] = await prisma.$transaction([
      prisma.unit.update({
        where: { id },
        data: { status, updatedAt: new Date() },
      }),
      prisma.project.update({
        where: { id: existing.projectId },
        data: { 
          updatedAt: new Date(),
        },
      }),
    ]);

    await auditLog(tenantId, userId, 'UPDATE', 'Unit', id, null, { status, previousStatus: existing.status, reason });

    res.json({ success: true, data: unit });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update unit status' });
  }
});

router.delete('/:id', authenticate, authorize('Unit', 'delete'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;
    const { id } = req.params;

    const existing = await prisma.unit.findFirst({ where: { id, tenantId } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Unit not found' });
    }

    const hasBookings = await prisma.booking.count({ 
      where: { unitId: id, status: { in: ['PENDING', 'CONFIRMED'] } } 
    });
    if (hasBookings > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot delete unit with active bookings. Cancel all bookings first.' 
      });
    }

    await prisma.$transaction([
      prisma.unit.delete({ where: { id } }),
      prisma.project.update({
        where: { id: existing.projectId },
        data: { 
          totalUnits: { decrement: 1 },
          updatedAt: new Date(),
        },
      }),
    ]);

    await auditLog(tenantId, userId, 'DELETE', 'Unit', id, { number: existing.number, projectId: existing.projectId, status: existing.status }, null);

    res.json({ success: true, data: null });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete unit' });
  }
});

export default router;
