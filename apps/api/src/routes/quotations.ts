import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { z } from 'zod';
import PDFDocument from 'pdfkit';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authorize } from '../middleware/authorization';
import { auditLog } from '../middleware/audit';
import {
  applyScope,
  canAccessLeadId,
  canAccessOpportunity,
  canAccessQuotation,
  getScopeClause,
} from '../services/recordAccess';

const router = Router();

router.use(authenticate);

const quotationItemSchema = z.object({
  unitId: z.string().optional(),
  description: z.string().min(1).max(500),
  quantity: z.number().int().min(1).default(1),
  unitPrice: z.number().min(0),
});

const quotationSchema = z.object({
  leadId: z.string().optional(),
  opportunityId: z.string().optional(),
  projectId: z.string().optional(),
  items: z.array(quotationItemSchema).min(1),
  validUntil: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
  taxAmount: z.number().min(0).optional(),
  discount: z.number().min(0).optional(),
});

const updateQuotationSchema = quotationSchema.partial();

router.get('/', authorize('Quotation', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId } = req.user!;
    const {
      page = 1,
      limit = 20,
      opportunityId,
      leadId,
      projectId,
      status,
      minAmount,
      maxAmount,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    let where: any = { tenantId };
    if (opportunityId) where.opportunityId = opportunityId;
    if (leadId) where.leadId = leadId;
    if (projectId) where.projectId = projectId;
    if (status) where.status = status;
    if (minAmount) where.totalAmount = { ...where.totalAmount, gte: Number(minAmount) };
    if (maxAmount) where.totalAmount = { ...where.totalAmount, lte: Number(maxAmount) };
    where = applyScope(where, await getScopeClause(req.user!, 'quotation'));

    const [quotations, total] = await Promise.all([
      prisma.quotation.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { [sortBy as string]: sortOrder },
        include: {
          opportunity: { select: { id: true, name: true, stage: true } },
          lead: { select: { id: true, firstName: true, lastName: true } },
          project: { select: { id: true, name: true } },
          items: true,
          _count: { select: { bookings: true, approvals: true } },
        },
      }),
      prisma.quotation.count({ where }),
    ]);

    res.json({
      success: true,
      data: quotations,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get quotations error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch quotations' });
  }
});

router.get('/:id', authorize('Quotation', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId } = req.user!;

    const quotation = await prisma.quotation.findFirst({
      where: { id: req.params.id, tenantId },
      include: {
        opportunity: { select: { id: true, name: true, stage: true, amount: true } },
        lead: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        project: { select: { id: true, name: true } },
        items: { include: { unit: { select: { id: true, number: true } } } },
        bookings: { select: { id: true, number: true, status: true, bookingDate: true } },
        approvals: true,
      },
    });

    if (!quotation) {
      return res.status(404).json({ success: false, error: 'Quotation not found' });
    }

    if (!(await canAccessQuotation(req.user!, quotation))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this quotation' });
    }

    res.json({ success: true, data: quotation });
  } catch (error) {
    console.error('Get quotation error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch quotation' });
  }
});

router.get('/:id/pdf', authorize('Quotation', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const quotation = await prisma.quotation.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: {
        lead: {
          select: {
            firstName: true, lastName: true, phone: true, mobile: true, email: true,
            street: true, city: true, stateProvince: true, postalCode: true, country: true,
          },
        },
        project: { select: { name: true, city: true, address: true } },
        items: { include: { unit: { select: { number: true, type: true, area: true } } } },
      },
    });

    if (!quotation) return res.status(404).json({ success: false, error: 'Quotation not found' });
    if (!(await canAccessQuotation(req.user!, quotation))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this quotation' });
    }

    const quotationMetadataPrefix = 'QUOTE_PDF_DATA:';
    let quotationMetadata: {
      customerName?: string;
      mobile?: string;
      email?: string;
      address?: string;
      paymentPlan?: '10-90' | '10-40-50';
    } = {};
    if (quotation.notes?.startsWith(quotationMetadataPrefix)) {
      try {
        quotationMetadata = JSON.parse(quotation.notes.slice(quotationMetadataPrefix.length));
      } catch {
        quotationMetadata = {};
      }
    }

    const document = new PDFDocument({ size: 'A4', margin: 32 });
    const filename = `${quotation.number.replace(/[^a-z0-9-]/gi, '-')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    document.pipe(res);

    const issueDate = quotation.createdAt;
    const addDays = (date: Date, days: number) => {
      const result = new Date(date);
      result.setUTCDate(result.getUTCDate() + days);
      return result;
    };
    const dateText = (date: Date) => new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
    }).format(date);
    const money = (amount: number) => `INR ${new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(amount)}`;
    const info = (label: string, value?: string | null) => {
      document.x = 44;
      document.font('Helvetica-Bold').fontSize(9).fillColor('#334155').text(`${label}: `, { continued: true });
      document.font('Helvetica').fillColor('#111827').text(value || '—');
      document.moveDown(0.05);
    };
    const section = (title: string) => {
      document.x = 44;
      document.moveDown(0.45).font('Helvetica-Bold').fontSize(11).fillColor('#26384a').text(title);
      document.moveTo(44, document.y + 3).lineTo(551, document.y + 3).strokeColor('#cbd5e1').stroke();
      document.moveDown(0.3);
    };

    const leadName = quotationMetadata.customerName || [quotation.lead?.firstName, quotation.lead?.lastName].filter(Boolean).join(' ') || '—';
    const address = quotationMetadata.address || [quotation.lead?.street, quotation.lead?.city, quotation.lead?.stateProvince, quotation.lead?.postalCode, quotation.lead?.country]
      .filter(Boolean).join(', ') || '—';
    const firstUnit = quotation.items.find((item) => item.unit)?.unit;
    const total = quotation.totalAmount;
    const planIsTenFortyFifty = quotationMetadata.paymentPlan === '10-40-50';
    const installments = planIsTenFortyFifty
      ? [
          { label: 'Booking Payment', percentage: 10, dueDays: 0, milestone: 'At booking' },
          { label: 'Installment 1', percentage: 40, dueDays: 10, milestone: 'Within 10 days of booking' },
          { label: 'Installment 2', percentage: 50, dueDays: 30, milestone: 'Within 30 days of booking' },
        ]
      : [
          { label: 'Installment 1', percentage: 10, dueDays: 10, milestone: 'Within 10 days of booking' },
          { label: 'Installment 2', percentage: 90, dueDays: 30, milestone: 'Within 30 days of booking' },
        ];

    document.font('Helvetica-Bold').fontSize(19).fillColor('#26384a').text('PROPERTY INVESTMENT QUOTATION', { align: 'center' });
    document.moveDown(0.45);
    info('Quotation No.', quotation.number);
    info('Date', dateText(issueDate));

    section('Customer Details');
    info('Customer Name', leadName);
    info('Mobile', quotationMetadata.mobile || quotation.lead?.mobile || quotation.lead?.phone);
    info('Email', quotationMetadata.email || quotation.lead?.email);
    info('Address', address);

    section('Property Details');
    info('Project', quotation.project?.name);
    info('Location', quotation.project?.city || quotation.project?.address);
    info('Unit No.', firstUnit?.number);
    info('Type', firstUnit?.type);
    info('Saleable Area', firstUnit?.area ? `${new Intl.NumberFormat('en-IN').format(firstUnit.area)} sq.ft` : undefined);
    info('Property Description', quotation.items.map((item) => item.description).join(', '));

    section(planIsTenFortyFifty ? 'Standard 1-Month Plan' : 'Standard 1-Month 10-90 Plan');
    const columns = [44, 145, 225, 335, 435];
    const headers = ['Installment', 'Percentage', 'Amount', 'Date', 'Milestone'];
    const widths = [96, 75, 105, 92, 116];
    const drawTableRow = (values: string[], bold = false) => {
      const rowY = document.y;
      document.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor('#1f2937');
      values.forEach((value, index) => document.text(value, columns[index], rowY, { width: widths[index] }));
      document.y = rowY + 19;
      document.moveTo(44, document.y).lineTo(551, document.y).strokeColor('#e2e8f0').stroke();
      document.moveDown(0.25);
    };
    drawTableRow(headers, true);
    installments.forEach((installment) => drawTableRow([
      installment.label,
      `${installment.percentage}%`,
      money(total * installment.percentage / 100),
      dateText(addDays(issueDate, installment.dueDays)),
      installment.milestone,
    ]));
    drawTableRow(['TOTAL', '100%', money(total), '', ''], true);

    section('Terms & Conditions');
    [
      'Quotation valid for 30 days from issue date.',
      'All payments must follow the schedule.',
      'Handover on completion of all milestones.',
      'Government fees and charges are applicable.',
      'Contact your sales representative for clarifications.',
    ].forEach((term) => document.font('Helvetica').fontSize(8.5).fillColor('#1f2937').text(`• ${term}`, { indent: 8, paragraphGap: 2 }));
    document.moveDown(0.55);
    document.font('Helvetica-Bold').fontSize(10).text('Thank you for your interest.', { align: 'center' });
    document.moveDown(0.2);
    document.font('Helvetica-Oblique').fontSize(8).fillColor('#64748b').text('This is a computer-generated quotation and does not require a signature.', { align: 'center' });
    document.end();
  } catch (error) {
    console.error('Download quotation PDF error:', error);
    if (!res.headersSent) res.status(500).json({ success: false, error: 'Failed to generate quotation PDF' });
  }
});

router.post('/', authorize('Quotation', 'create'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;
    const data = quotationSchema.parse(req.body);

    const [lead, opportunity, project] = await Promise.all([
      data.leadId
        ? prisma.lead.findFirst({ where: { id: data.leadId, tenantId }, select: { id: true } })
        : null,
      data.opportunityId
        ? prisma.opportunity.findFirst({
            where: { id: data.opportunityId, tenantId },
            select: { id: true, tenantId: true, ownerId: true, creatorId: true, leadId: true, projectId: true, stage: true },
          })
        : null,
      data.projectId
        ? prisma.project.findFirst({ where: { id: data.projectId, tenantId, isActive: true }, select: { id: true } })
        : null,
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
    const resolvedProjectId = data.projectId || opportunity?.projectId || undefined;
    const resolvedProject = data.projectId
      ? project
      : resolvedProjectId
        ? await prisma.project.findFirst({
            where: { id: resolvedProjectId, tenantId, isActive: true },
            select: { id: true },
          })
        : null;
    if (resolvedProjectId && !resolvedProject) {
      return res.status(404).json({ success: false, error: 'Active project not found' });
    }
    if (opportunity?.projectId && data.projectId && opportunity.projectId !== data.projectId) {
      return res.status(400).json({ success: false, error: 'Project does not match the linked opportunity' });
    }

    const unitIds = [...new Set(data.items.flatMap((item) => item.unitId ? [item.unitId] : []))];
    if (unitIds.length) {
      const units = await prisma.unit.findMany({
        where: {
          id: { in: unitIds },
          tenantId,
          ...(resolvedProjectId ? { projectId: resolvedProjectId } : {}),
        },
        select: { id: true },
      });
      if (units.length !== unitIds.length) {
        return res.status(400).json({ success: false, error: 'One or more quotation units are invalid for this tenant or project' });
      }
    }

    const quotationNumber = `QT-${Date.now().toString(36).toUpperCase()}`;

    const items = data.items.map((item) => ({
      unitId: item.unitId,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.quantity * item.unitPrice,
    }));

    const totalAmount = items.reduce((sum, item) => sum + item.totalPrice, 0) + (data.taxAmount || 0) - (data.discount || 0);

    const quotation = await prisma.$transaction(async (tx) => {
      const created = await tx.quotation.create({
        data: {
          tenantId,
          number: quotationNumber,
          leadId: data.leadId,
          opportunityId: data.opportunityId,
          projectId: resolvedProjectId,
          status: 'DRAFT',
          totalAmount,
          taxAmount: data.taxAmount,
          discount: data.discount,
          validUntil: data.validUntil ? new Date(data.validUntil) : undefined,
          notes: data.notes,
          items: { create: items },
        },
        include: {
          items: true,
          opportunity: { select: { id: true, name: true } },
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          action: 'CREATE',
          objectType: 'Quotation',
          objectId: created.id,
          newValues: { number: quotationNumber, totalAmount, itemCount: items.length },
        },
      });
      if (opportunity && ['PROSPECTING', 'QUALIFICATION', 'NEEDS_ANALYSIS'].includes(opportunity.stage)) {
        await tx.opportunity.update({ where: { id: opportunity.id }, data: { stage: 'PROPOSAL' } });
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            opportunityId: opportunity.id,
            action: 'UPDATE',
            objectType: 'Opportunity',
            objectId: opportunity.id,
            oldValues: { stage: opportunity.stage },
            newValues: { stage: 'PROPOSAL', quotationId: created.id },
          },
        });
      }
      return created;
    });

    res.status(201).json({ success: true, data: quotation });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Create quotation error:', error);
    res.status(500).json({ success: false, error: 'Failed to create quotation' });
  }
});

router.put('/:id', authorize('Quotation', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;

    const existing = await prisma.quotation.findFirst({
      where: { id: req.params.id, tenantId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Quotation not found' });
    }

    if (!(await canAccessQuotation(req.user!, existing))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this quotation' });
    }

    if (existing.status !== 'DRAFT') {
      return res.status(400).json({ success: false, error: 'Only draft quotations can be edited' });
    }

    const data = updateQuotationSchema.parse(req.body);

    const updateData: any = { ...data };
    if (data.validUntil) updateData.validUntil = new Date(data.validUntil);

    if (data.items) {
      await prisma.quotationItem.deleteMany({ where: { quotationId: req.params.id } });

      const items = data.items.map((item) => ({
        quotationId: req.params.id,
        unitId: item.unitId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.quantity * item.unitPrice,
      }));

      updateData.totalAmount = items.reduce((sum: number, item: any) => sum + item.totalPrice, 0) + (data.taxAmount || 0) - (data.discount || 0);
      updateData.items = { create: items };
    }

    const quotation = await prisma.quotation.update({
      where: { id: req.params.id },
      data: updateData,
      include: { items: true },
    });

    await auditLog(tenantId, userId, 'UPDATE', 'Quotation', quotation.id, existing, quotation);

    res.json({ success: true, data: quotation });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Update quotation error:', error);
    res.status(500).json({ success: false, error: 'Failed to update quotation' });
  }
});

router.patch('/:id/submit', authorize('Quotation', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;

    const existing = await prisma.quotation.findFirst({
      where: { id: req.params.id, tenantId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Quotation not found' });
    }

    if (!(await canAccessQuotation(req.user!, existing))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this quotation' });
    }

    if (existing.status !== 'DRAFT') {
      return res.status(400).json({ success: false, error: 'Only draft quotations can be submitted' });
    }

    const quotation = await prisma.quotation.update({
      where: { id: req.params.id },
      data: { status: 'SUBMITTED' },
    });

    await auditLog(tenantId, userId, 'UPDATE', 'Quotation', quotation.id, existing, { status: 'SUBMITTED' });

    res.json({ success: true, data: quotation });
  } catch (error) {
    console.error('Submit quotation error:', error);
    res.status(500).json({ success: false, error: 'Failed to submit quotation' });
  }
});

router.patch('/:id/approve', authorize('Quotation', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;
    const { comments } = req.body;

    const existing = await prisma.quotation.findFirst({
      where: { id: req.params.id, tenantId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Quotation not found' });
    }

    if (!(await canAccessQuotation(req.user!, existing))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this quotation' });
    }

    if (existing.status !== 'SUBMITTED') {
      return res.status(400).json({ success: false, error: 'Only submitted quotations can be approved' });
    }

    const [quotation] = await prisma.$transaction([
      prisma.quotation.update({
        where: { id: req.params.id },
        data: { status: 'APPROVED' },
      }),
      prisma.approval.create({
        data: {
          tenantId,
          quotationId: req.params.id,
          approverId: userId,
          status: 'APPROVED',
          comments,
        },
      }),
    ]);

    await auditLog(tenantId, userId, 'UPDATE', 'Quotation', quotation.id, existing, { status: 'APPROVED', comments });

    res.json({ success: true, data: quotation });
  } catch (error) {
    console.error('Approve quotation error:', error);
    res.status(500).json({ success: false, error: 'Failed to approve quotation' });
  }
});

router.patch('/:id/reject', authorize('Quotation', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;
    const { comments } = req.body;

    const existing = await prisma.quotation.findFirst({
      where: { id: req.params.id, tenantId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Quotation not found' });
    }

    if (!(await canAccessQuotation(req.user!, existing))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this quotation' });
    }

    if (existing.status !== 'SUBMITTED') {
      return res.status(400).json({ success: false, error: 'Only submitted quotations can be rejected' });
    }

    const [quotation] = await prisma.$transaction([
      prisma.quotation.update({
        where: { id: req.params.id },
        data: { status: 'REJECTED' },
      }),
      prisma.approval.create({
        data: {
          tenantId,
          quotationId: req.params.id,
          approverId: userId,
          status: 'REJECTED',
          comments,
        },
      }),
    ]);

    await auditLog(tenantId, userId, 'UPDATE', 'Quotation', quotation.id, existing, { status: 'REJECTED', comments });

    res.json({ success: true, data: quotation });
  } catch (error) {
    console.error('Reject quotation error:', error);
    res.status(500).json({ success: false, error: 'Failed to reject quotation' });
  }
});

router.delete('/:id', authorize('Quotation', 'delete'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;

    const existing = await prisma.quotation.findFirst({
      where: { id: req.params.id, tenantId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Quotation not found' });
    }

    if (!(await canAccessQuotation(req.user!, existing))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this quotation' });
    }

    if (existing.status !== 'DRAFT') {
      return res.status(400).json({ success: false, error: 'Only draft quotations can be deleted' });
    }

    await prisma.quotationItem.deleteMany({ where: { quotationId: req.params.id } });
    await prisma.quotation.delete({ where: { id: req.params.id } });

    await auditLog(tenantId, userId, 'DELETE', 'Quotation', existing.id, existing, null);

    res.json({ success: true, data: null });
  } catch (error) {
    console.error('Delete quotation error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete quotation' });
  }
});

export default router;