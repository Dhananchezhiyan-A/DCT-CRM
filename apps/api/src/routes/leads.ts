import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { leadCreateSchema, leadUpdateSchema, normalizePhone, PHONE_DUPLICATE_ERROR, type JsonValue } from '@dct-crm/shared';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authorize } from '../middleware/authorization';
import { EffectivePermissionService } from '../services/effectivePermissions';
import { canTransitionStatus, isValidStatus } from '../services/workflow';
import { createOwnerHistory, getOwnerHistory } from '../services/ownerHistory';
import {
  canAccessLead,
  getLeadRecordScope,
  leadScopeClause,
} from '../services/recordAccess';
import { getNextSiteVisitNumber, normalizeOverdueFollowUps, normalizeOverdueSiteVisits } from '../services/leadWorkflowExtras';
import { validateObjectCustomFields } from '../services/customFieldValidation';
import {
  assignLeadToProjectRoundRobinInTransaction,
  assignSiteVisitToSVCInTransaction,
  assignCompletedSiteVisitToSalesInTransaction,
  selectNextProjectRRMemberInTransaction,
  findApplicableRRQueue,
  rrQueueCriteriaForLead,
  hasLeadAssignmentRelevantChanges,
  isLeadEligibleForAutoAssignment,
  RoundRobinAssignmentService,
} from '../services/rrQueue';
import { changeLeadOwner, getEligibleLeadOwners } from '../services/leadOwnerChange';
import { processLeadEnquiry, sourceEnumValue } from '../services/enquiryProcessing';
import { getLeadEnquiries } from '../services/enquiryService';
import { mergeOperationalLeadCustomFields } from '../services/leadEventTagging';
import {
  findLeadDuplicates,
  validateLeadContactInput,
} from '../services/leadDuplicateDetection';
import { z } from 'zod';

const router = Router();
const pushToSvcRequestSchema = z.object({
  reason: z.string().trim().min(1, 'Reason/note is required for status change')
    .max(2000, 'Reason/note must be 2000 characters or fewer'),
});

router.use(authenticate);

/**
 * Lead lookup tenant scope. Matches the existing GET / list rule: superadmin
 * sees and acts on every tenant's leads (recordAccess/authorization already
 * grant superadmin ALL-scope), while every other user stays tenant-scoped.
 */
function leadIdScope(req: AuthRequest): { tenantId?: string } {
  return req.user!.isSuperAdmin ? {} : { tenantId: req.tenantId! };
}

async function getAccessibleDuplicateLeadIds(req: AuthRequest, leadIds: string[]): Promise<string[]> {
  const candidates = await prisma.lead.findMany({
    where: { id: { in: leadIds }, ...leadIdScope(req) },
    select: { id: true, tenantId: true, ownerId: true, creatorId: true },
  });
  const accessible = await Promise.all(candidates.map(async (lead) =>
    (await canAccessLead(req.user!, lead)) ? lead.id : null,
  ));
  return accessible.filter((id): id is string => Boolean(id));
}

const duplicatePreviewSchema = z.object({
  phone: z.string().trim().max(64).optional(),
  mobile: z.string().trim().max(64).optional(),
  secondaryPhone: z.string().trim().max(64).optional(),
  tertiaryPhone: z.string().trim().max(64).optional(),
  countryCode: z.string().trim().max(8).optional(),
  secondaryCountryCode: z.string().trim().max(8).optional(),
  tertiaryCountryCode: z.string().trim().max(8).optional(),
  email: z.string().trim().max(254).optional(),
  secondaryEmail: z.string().trim().max(254).optional(),
  tertiaryEmail: z.string().trim().max(254).optional(),
});

function duplicateContactInput(
  input: z.infer<typeof duplicatePreviewSchema>,
) {
  const countryCode = input.countryCode || '91';
  return {
    phones: [
      { field: 'phone', value: input.phone, countryCode },
      { field: 'mobile', value: input.mobile, countryCode },
      { field: 'secondaryPhone', value: input.secondaryPhone, countryCode: input.secondaryCountryCode || countryCode },
      { field: 'tertiaryPhone', value: input.tertiaryPhone, countryCode: input.tertiaryCountryCode || input.secondaryCountryCode || countryCode },
    ],
    emails: [
      { field: 'email', value: input.email },
      { field: 'secondaryEmail', value: input.secondaryEmail },
      { field: 'tertiaryEmail', value: input.tertiaryEmail },
    ],
  };
}

async function validateLeadCustomFields(
  tenantId: string,
  values: Record<string, unknown>,
  requireRequiredFields: boolean,
): Promise<string | null> {
  return validateObjectCustomFields(tenantId, 'Lead', values, requireRequiredFields);
}

/**
 * Human-facing audit display: keys whose values are user IDs. The audit
 * history endpoints resolve them to display names so the UI never shows raw
 * internal user IDs. IDs are resolved in a single batched query (no N+1).
 */
const AUDIT_USER_KEYS = new Set([
  'ownerId',
  'previousOwnerId',
  'newOwnerId',
  'changedById',
  'createdById',
  'updatedById',
  'completedById',
  'cancelledById',
  'assignedById',
  'performedById',
  'userId',
  'changedBy',
  'createdBy',
  'updatedBy',
  'assignedBy',
  'performedBy',
]);

function auditDisplayValues(
  values: Record<string, unknown> | null | undefined,
  nameById: Map<string, string>,
): Record<string, unknown> | null | undefined {
  if (!values || typeof values !== 'object') return values;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (AUDIT_USER_KEYS.has(key)) {
      const siblingNameKey = key.endsWith('Id') ? `${key.slice(0, -2)}Name` : null;
      const hasSiblingName =
        !!siblingNameKey &&
        typeof (values as Record<string, unknown>)[siblingNameKey] === 'string' &&
        String((values as Record<string, unknown>)[siblingNameKey]).length > 0;
      if (hasSiblingName) {
        // Explicit *Name sibling present: keep the pair (the UI renders the
        // name row and skips the raw id — see getAuditChanges).
        out[key] = value;
        continue;
      }
      if (typeof value === 'string' && nameById.has(value)) {
        // No name sibling: resolve the id to a display name so nothing raw
        // is ever surfaced by consumers.
        out[key] = nameById.get(value);
        continue;
      }
      if (value === null && key.endsWith('ById')) {
        out[key] = 'System';
        continue;
      }
    }
    out[key] = value;
  }
  return out;
}

async function enrichAuditLogs<T extends { oldValues?: unknown; newValues?: unknown }>(logs: T[]) {
  const ids = new Set<string>();
  for (const log of logs) {
    for (const values of [log.oldValues, log.newValues]) {
      if (!values || typeof values !== 'object') continue;
      for (const [key, value] of Object.entries(values as Record<string, unknown>)) {
        if (AUDIT_USER_KEYS.has(key) && typeof value === 'string' && value.startsWith('c')) {
          ids.add(value);
        }
      }
    }
  }
  const users = ids.size
    ? await prisma.user.findMany({
        where: { id: { in: [...ids] } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const nameById = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));

  return logs.map((log) => ({
    ...log,
    oldValues: auditDisplayValues(log.oldValues as Record<string, unknown> | null | undefined, nameById),
    newValues: auditDisplayValues(log.newValues as Record<string, unknown> | null | undefined, nameById),
  }));
}

const convertLeadSchema = z.object({
  projectId: z.string().optional(),
  unitId: z.string().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  amount: z.number().min(0).optional(),
  expectedCloseDate: z.string().datetime().optional(),
  probability: z.number().int().min(0).max(100).optional(),
  description: z.string().max(2000).optional(),
});

async function getNextOpportunityNumber(tx: any, tenantId: string): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`OPPORTUNITY_NUMBER:${tenantId}`}, 0))`;
  // Max-based (not count-based): counts drift below the highest number after any
  // opportunity deletion, which would re-issue an existing number and violate
  // the [tenantId, opportunityNumber] unique index.
  const rows = await tx.$queryRaw<{ maxn: bigint | null }[]>`
    SELECT max(CASE WHEN "opportunityNumber" ~ '^OPP[0-9]+$'
      THEN substring("opportunityNumber" from 4)::bigint END) AS maxn
    FROM "Opportunity"
    WHERE "tenantId" = ${tenantId}
  `;
  const maxn = rows?.[0]?.maxn != null ? Number(rows[0].maxn) : 0;
  return `OPP${String(maxn + 1).padStart(6, '0')}`;
}

async function findPhoneConflict(
  tenantId: string,
  phone: string,
  excludeLeadId?: string,
): Promise<boolean> {
  const normalized = normalizePhone(phone);
  const candidates = await prisma.lead.findMany({
    where: {
      tenantId,
      phone: { not: null },
      ...(excludeLeadId ? { id: { not: excludeLeadId } } : {}),
    },
    select: { id: true, phone: true },
  });
  return candidates.some(
    (lead) => lead.phone != null && normalizePhone(lead.phone) === normalized,
  );
}

function isPhoneUniqueViolation(error: any): boolean {
  if (error?.code !== 'P2002') return false;
  const target = error?.meta?.target;
  if (Array.isArray(target)) return target.includes('phone');
  if (typeof target === 'string') return target.includes('phone');
  return false;
}

type LeadDeletionStep =
  | { name: 'lead'; where: { id: string } }
  | {
      name: 'activity' | 'task' | 'followUp' | 'leadOwnerHistory' | 'payment' | 'siteVisit' | 'approval' | 'quotationItem' | 'booking' | 'quotation' | 'opportunity';
      where: Record<string, any>;
    };

export function buildLeadDeletionPlan(leadId: string): LeadDeletionStep[] {
  return [
    { name: 'activity', where: { OR: [{ leadId }, { siteVisit: { leadId } }, { opportunity: { leadId } }, { booking: { leadId } }] } },
    { name: 'task', where: { OR: [{ leadId }, { siteVisit: { leadId } }, { opportunity: { leadId } }] } },
    { name: 'followUp', where: { leadId } },
    { name: 'leadOwnerHistory', where: { leadId } },
    { name: 'payment', where: { booking: { leadId } } },
    { name: 'siteVisit', where: { leadId } },
    { name: 'approval', where: { quotation: { leadId } } },
    { name: 'quotationItem', where: { quotation: { leadId } } },
    { name: 'booking', where: { leadId } },
    { name: 'quotation', where: { leadId } },
    { name: 'opportunity', where: { leadId } },
    { name: 'lead', where: { id: leadId } },
  ];
}

const LEAD_DIFFABLE_FIELDS = [
  'firstName', 'lastName', 'salutation', 'title', 'email', 'phone', 'mobile',
  'website', 'company', 'industry', 'annualRevenue', 'numberOfEmployees',
  'source', 'status', 'rating', 'description', 'street', 'city',
  'stateProvince', 'country', 'postalCode', 'score', 'budget',
  'requirements', 'notes', 'ownerId', 'projectId',
  'customFields',
] as const;

function normalizeDiffValue(value: any): any {
  if (value === undefined) return null;
  if (value === '') return null;
  return value;
}

function areJsonValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => areJsonValuesEqual(value, right[index]));
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key) =>
      Object.prototype.hasOwnProperty.call(rightRecord, key) &&
      areJsonValuesEqual(leftRecord[key], rightRecord[key]),
    );
}

function computeLeadDiff(
  existing: Record<string, any>,
  incoming: Record<string, any>,
): { oldValues: Record<string, any>; newValues: Record<string, any>; updateData: Record<string, any> } {
  const oldValues: Record<string, any> = {};
  const newValues: Record<string, any> = {};
  const updateData: Record<string, any> = {};

  for (const field of LEAD_DIFFABLE_FIELDS) {
    if (!(field in incoming)) continue;
    const incomingValue = normalizeDiffValue((incoming as Record<string, any>)[field]);
    const existingValue = normalizeDiffValue(existing[field]);
    if (
      field === 'customFields'
        ? areJsonValuesEqual(incomingValue, existingValue)
        : incomingValue === existingValue
    ) continue;
    oldValues[field] = existingValue;
    newValues[field] = incomingValue;
    updateData[field] = (incoming as Record<string, any>)[field] === '' ? null : (incoming as Record<string, any>)[field];
  }

  return { oldValues, newValues, updateData };
}

router.get('/', authorize('Lead', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, status, source, ownerId, search, sortBy = 'createdAt', sortOrder = 'desc', from, to } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = {};
    if (!req.user!.isSuperAdmin) {
      where.tenantId = req.tenantId!;
    }
    const scope = await getLeadRecordScope(req.user!);
    const scopeClause = leadScopeClause(scope);
    if (scopeClause) {
      where.AND = Array.isArray(where.AND) ? [...where.AND, scopeClause] : [scopeClause];
    }
    if (status && status !== 'All Statuses') {
      if (!isValidStatus(String(status))) {
        return res.status(400).json({ success: false, error: 'Invalid status filter' });
      }
      where.status = String(status);
    }
    if (source) where.source = source;
    if (ownerId) where.ownerId = ownerId;
    if (from || to) {
      const createdAtFilter: any = {};
      if (from) {
        const start = new Date(`${from}T00:00:00.000Z`);
        if (!Number.isNaN(start.getTime())) createdAtFilter.gte = start;
      }
      if (to) {
        const end = new Date(`${to}T23:59:59.999Z`);
        if (!Number.isNaN(end.getTime())) createdAtFilter.lte = end;
      }
      if (Object.keys(createdAtFilter).length > 0) {
        where.createdAt = createdAtFilter;
      }
    }
    if (search) {
      const searchTerm = search as string;
      const words = searchTerm.trim().split(/\s+/).filter(Boolean);
      const matchWord = (word: string) => [
        { leadNumber: { contains: word, mode: 'insensitive' as const } },
        { firstName: { contains: word, mode: 'insensitive' as const } },
        { lastName: { contains: word, mode: 'insensitive' as const } },
        { email: { contains: word, mode: 'insensitive' as const } },
        { phone: { contains: word } },
        { company: { contains: word, mode: 'insensitive' as const } },
        { title: { contains: word, mode: 'insensitive' as const } },
      ];
      const searchClause =
        words.length > 1
          ? { AND: words.map((word) => ({ OR: matchWord(word) })) }
          : { OR: matchWord(searchTerm) };
      where.AND = Array.isArray(where.AND) ? [...where.AND, searchClause] : [searchClause];
    }

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
          project: { select: { id: true, name: true } },
          _count: { select: { siteVisits: true, opportunities: true, activities: true } },
        },
        skip,
        take: Number(limit),
        orderBy: { [sortBy as string]: sortOrder },
      }),
      prisma.lead.count({ where }),
    ]);

    res.json({
      success: true,
      data: leads,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get leads error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch leads' });
  }
});

router.get('/:id/enquiries', authorize('Enquiry', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, ...leadIdScope(req) },
      select: { id: true, tenantId: true, ownerId: true, creatorId: true },
    });
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
    if (!(await canAccessLead(req.user!, lead))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this lead' });
    }

    const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || '10'), 10) || 10));
    const result = await getLeadEnquiries(lead.tenantId, lead.id, page, limit);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Get Lead enquiries error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch Lead enquiries' });
  }
});

router.post('/:id/enquiries', authorize('Enquiry', 'create'), async (req: AuthRequest, res: Response) => {
  try {
    const payloadSchema = z.object({
      source: z.string().trim().min(1).max(120),
      subSource: z.string().trim().max(120).optional(),
      campaignId: z.string().trim().optional(),
      campaign: z.string().trim().max(160).optional(),
      subCampaignId: z.string().trim().optional(),
      subCampaign: z.string().trim().max(160).optional(),
      projectId: z.string().trim().optional(),
      phone: z.string().trim().max(64).optional(),
      secondaryPhone: z.string().trim().max(64).optional(),
      tertiaryPhone: z.string().trim().max(64).optional(),
      countryCode: z.string().trim().max(8).optional(),
      secondaryCountryCode: z.string().trim().max(8).optional(),
      tertiaryCountryCode: z.string().trim().max(8).optional(),
      email: z.string().trim().email().optional().or(z.literal('')),
      secondaryEmail: z.string().trim().email().optional().or(z.literal('')),
      tertiaryEmail: z.string().trim().email().optional().or(z.literal('')),
      originalSubmissionId: z.string().trim().min(1).max(200).optional(),
      medium: z.string().trim().max(120).optional(),
      description: z.string().trim().max(5000).optional(),
      channelPartner: z.string().trim().max(160).optional(),
      enquiryDate: z.coerce.date().optional(),
      details: z.record(z.string(), z.unknown()).optional(),
      siteVisit: z.object({
        projectId: z.string().trim().optional(),
        scheduledAt: z.coerce.date(),
        notes: z.string().trim().max(5000).optional(),
      }).optional(),
    });
    const payload = payloadSchema.parse(req.body);
    const existing = await prisma.lead.findFirst({
      where: { id: req.params.id, ...leadIdScope(req) },
    });
    if (!existing) return res.status(404).json({ success: false, error: 'Lead not found' });
    if (!(await canAccessLead(req.user!, existing))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this lead' });
    }
    if (
      payload.siteVisit &&
      !req.user!.isSuperAdmin &&
      !(await EffectivePermissionService.hasPermission(req.user!.id, 'SITE_VISIT_CREATE'))
    ) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions for SiteVisit:create' });
    }

    const leadData = leadCreateSchema.parse({
      firstName: existing.firstName || undefined,
      lastName: existing.lastName,
      company: existing.company,
      source: sourceEnumValue(payload.source),
      phone: payload.phone || existing.phone,
      email: payload.email || existing.email || undefined,
      projectId: payload.projectId || undefined,
      customFields: existing.customFields,
    });
    const result = await processLeadEnquiry({
      tenantId: existing.tenantId,
      userId: req.user!.id,
      profileName: req.user!.profileName,
      expectedLeadId: existing.id,
      lead: leadData,
      enquiry: {
        source: payload.source,
        subSource: payload.subSource,
        campaignId: payload.campaignId,
        campaign: payload.campaign,
        subCampaignId: payload.subCampaignId,
        subCampaign: payload.subCampaign,
        secondaryPhone: payload.secondaryPhone,
        tertiaryPhone: payload.tertiaryPhone,
        secondaryCountryCode: payload.secondaryCountryCode,
        tertiaryCountryCode: payload.tertiaryCountryCode,
        countryCode: payload.countryCode,
        secondaryEmail: payload.secondaryEmail,
        tertiaryEmail: payload.tertiaryEmail,
        originalSubmissionId: payload.originalSubmissionId || req.get('Idempotency-Key') || undefined,
        medium: payload.medium,
        description: payload.description,
        channelPartner: payload.channelPartner,
        enquiryDate: payload.enquiryDate,
        details: payload.details,
      },
      siteVisit: payload.siteVisit
        ? {
            projectId: payload.siteVisit.projectId || payload.projectId,
            scheduledAt: payload.siteVisit.scheduledAt,
            notes: payload.siteVisit.notes,
          }
        : undefined,
    });
    if (result.action === 'DUPLICATE_CONFLICT') {
      const leadIds = await getAccessibleDuplicateLeadIds(req, result.leadIds);
      return res.status(409).json({
        success: false,
        action: result.action,
        leadIds,
        error: 'This phone number matches multiple existing Leads. Ask an administrator to resolve the duplicate records.',
      });
    }
    if (result.action === 'LEAD_MISMATCH') {
      const leadIds = await getAccessibleDuplicateLeadIds(req, result.leadIds);
      return res.status(409).json({
        success: false,
        leadIds,
        error: 'The enquiry phone number matches a different Lead. Create this enquiry from that Lead instead.',
      });
    }
    return res.status(201).json({ success: true, ...result });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.issues[0]?.message || 'Invalid enquiry data' });
    }
    if (error?.message === 'INVALID_PROJECT') {
      return res.status(400).json({ success: false, error: 'Invalid project' });
    }
    if (error?.message === 'RR_PROJECT_REQUIRED') {
      return res.status(409).json({ success: false, error: 'A project is required to assign this lead to Pre Sales.' });
    }
    if (error?.message === 'RR_QUEUE_NOT_CONFIGURED:Pre Sales' || error?.message === 'NO_ELIGIBLE_RR_MEMBER:Pre Sales') {
      return res.status(409).json({ success: false, error: 'No eligible Pre Sales round-robin member is configured for this project.' });
    }
    if (error?.message === 'SVC_QUEUE_NOT_CONFIGURED' || error?.message === 'NO_ELIGIBLE_SVC_MEMBER') {
      return res.status(409).json({ success: false, error: 'No eligible SVC member is available in a round-robin queue matching this project and lead source.' });
    }
    if (error?.message === 'PHONE_REQUIRED') {
      return res.status(400).json({ success: false, error: 'A phone number is required' });
    }
    console.error('Create Lead enquiry error:', error);
    return res.status(500).json({ success: false, error: 'Failed to create enquiry' });
  }
});

router.get('/:id', authorize('Lead', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    await normalizeOverdueFollowUps(req.user!.tenantId);
    await normalizeOverdueSiteVisits(req.user!.tenantId);
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, ...leadIdScope(req) },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true, email: true } },
        creator: { select: { id: true, firstName: true, lastName: true } },
        project: { select: { id: true, name: true } },
        siteVisits: {
          include: {
            assignee: { select: { id: true, firstName: true, lastName: true } },
            project: { select: { id: true, name: true } },
          },
          orderBy: { scheduledAt: 'desc' },
        },
        opportunities: {
          include: { owner: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' },
        },
        activities: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        tasks: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        followUps: {
          orderBy: { dueDate: 'asc' },
          take: 10,
        },
        auditLogs: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
      },
    });

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    if (!(await canAccessLead(req.user!, lead))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this lead' });
    }

    const ownerHistory = await getOwnerHistory(lead.tenantId, req.params.id);

    const lastAudit = await prisma.auditLog.findFirst({
      where: {
        tenantId: lead.tenantId,
        OR: [{ leadId: lead.id }, { objectType: 'Lead', objectId: lead.id }],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    const lastModified = lastAudit
      ? {
          by: lastAudit.user,
          at: lastAudit.createdAt,
          action: lastAudit.action,
        }
      : {
          by: lead.creator
            ? { id: lead.creator.id, firstName: lead.creator.firstName, lastName: lead.creator.lastName, email: null }
            : null,
          at: lead.updatedAt,
          action: 'CREATE',
        };

    res.json({
      success: true,
      data: {
        ...lead,
        auditLogs: await enrichAuditLogs(lead.auditLogs),
        ownerHistory,
        lastModified,
      },
    });
  } catch (error) {
    console.error('Get lead error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch lead' });
  }
});

router.post('/:id/convert', authorize('Opportunity', 'create'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId: callerTenantId, id: userId } = req.user!;
    const data = convertLeadSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`LEAD_CONVERSION:${callerTenantId}:${req.params.id}`}, 0))`;

      const lead = await tx.lead.findFirst({
        where: { id: req.params.id, ...leadIdScope(req) },
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
          siteVisits: {
            where: { status: 'COMPLETED' },
            orderBy: [{ completedAt: 'desc' }, { updatedAt: 'desc' }],
            take: 1,
          },
          opportunities: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      });
      if (!lead) throw new Error('LEAD_NOT_FOUND');
      const tenantId = lead.tenantId;
      if (!(await canAccessLead(req.user!, lead))) throw new Error('LEAD_ACCESS_DENIED');
      if (lead.status !== 'SITE_VISIT_HAPPENED') throw new Error('LEAD_NOT_READY');
      // Conversion performs an automatic SITE_VISIT_HAPPENED -> BOOKED transition:
      // enforce the same workflow rules as PUT /:id/status (with the same admin bypass)
      const profileName = req.user!.profileName || 'Admin';
      if (profileName !== 'Admin' && profileName !== 'Manager' && profileName !== 'CRM Admin') {
        if (!canTransitionStatus(profileName, 'SITE_VISIT_HAPPENED', 'BOOKED')) {
          throw new Error(
            `CONVERSION_STATUS_FORBIDDEN|Profile ${profileName} cannot change status from SITE_VISIT_HAPPENED to BOOKED`,
          );
        }
      }
      if (lead.opportunities.length > 0) {
        return { opportunity: lead.opportunities[0], lead, duplicate: true };
      }
      const completedSiteVisit = lead.siteVisits[0];
      if (!completedSiteVisit) throw new Error('COMPLETED_SITE_VISIT_REQUIRED');

      if (data.projectId && completedSiteVisit.projectId && data.projectId !== completedSiteVisit.projectId) {
        throw new Error('PROJECT_MISMATCH');
      }
      const projectId = completedSiteVisit.projectId || data.projectId || lead.projectId || undefined;
      if (!projectId) throw new Error('PROJECT_REQUIRED');
      const project = await tx.project.findFirst({ where: { id: projectId, tenantId, isActive: true }, select: { id: true } });
      if (!project) throw new Error('INVALID_PROJECT');

      if (data.unitId) {
        const unit = await tx.unit.findFirst({
          where: { id: data.unitId, tenantId, projectId, status: 'AVAILABLE' },
          select: { id: true },
        });
        if (!unit) throw new Error('INVALID_UNIT');
      }

      const crmAssignment = await selectNextProjectRRMemberInTransaction(tx, {
        tenantId,
        projectId,
        userType: 'CRM',
        criteria: rrQueueCriteriaForLead(lead),
      });
      const opportunityOwnerId = crmAssignment.member.userId;

      // Step 13: Generate Opportunity Number
      const opportunityNumber = await getNextOpportunityNumber(tx, tenantId);
      const opportunity = await tx.opportunity.create({
        data: {
          tenantId,
          opportunityNumber,
          name: data.name || `${lead.company} Opportunity`,
          leadId: lead.id,
          ownerId: opportunityOwnerId,
          creatorId: userId,
          projectId,
          unitId: data.unitId,
          siteVisitId: completedSiteVisit.id,
          stage: 'PROSPECTING',
          amount: data.amount,
          expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate) : undefined,
          probability: data.probability,
          description: data.description || lead.requirements || lead.notes,
        },
        include: {
          lead: { select: { id: true, leadNumber: true, firstName: true, lastName: true } },
          owner: { select: { id: true, firstName: true, lastName: true, profile: { select: { name: true } } } },
          project: { select: { id: true, name: true } },
          unit: { select: { id: true, number: true, type: true, area: true, price: true, status: true } },
          siteVisit: { select: { id: true, siteVisitNumber: true, completedAt: true } },
        },
      });
      await tx.rRQueueHistory.create({
        data: {
          tenantId,
          rrQueueId: crmAssignment.queue.id,
          leadId: lead.id,
          field: 'CRM Opportunity Owner',
          userId: opportunityOwnerId,
          userName: `${crmAssignment.member.user.firstName} ${crmAssignment.member.user.lastName}`.trim() || crmAssignment.member.user.email,
          originalValue: null,
          newValue: opportunityOwnerId,
        },
      });

      // Step 16: Update Lead status to BOOKED — only after Opportunity creation succeeded
      const convertedLead = await tx.lead.update({
        where: { id: lead.id },
        data: { status: 'BOOKED', lostAt: null },
      });

      // Step 17: Conversion audit log
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          leadId: lead.id,
          opportunityId: opportunity.id,
          action: 'LEAD_CONVERTED_TO_OPPORTUNITY',
          objectType: 'Lead',
          objectId: lead.id,
          oldValues: { status: 'SITE_VISIT_HAPPENED' },
          newValues: {
            status: 'BOOKED',
            leadNumber: lead.leadNumber,
            opportunityId: opportunity.id,
            opportunityNumber,
            ownerId: opportunityOwnerId,
            siteVisitId: completedSiteVisit.id,
            projectId,
            unitId: data.unitId || null,
          },
        },
      });

      return { opportunity, lead: convertedLead, duplicate: false };
    });
    return res.status(result.duplicate ? 200 : 201).json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ZodError') return res.status(400).json({ success: false, error: error.errors[0].message });
    if (typeof error.message === 'string' && error.message.startsWith('CONVERSION_STATUS_FORBIDDEN|')) {
      return res.status(403).json({ success: false, error: error.message.slice(error.message.indexOf('|') + 1) });
    }
    if (error.message === 'RR_PROJECT_REQUIRED') {
      return res.status(409).json({ success: false, error: 'A project is required to assign this Opportunity to a CRM round robin.' });
    }
    if (error.message === 'RR_QUEUE_NOT_CONFIGURED:CRM' || error.message === 'NO_ELIGIBLE_RR_MEMBER:CRM') {
      return res.status(409).json({ success: false, error: 'No eligible CRM member is available in a round-robin queue matching this project and lead source.' });
    }
    const errors: Record<string, [number, string]> = {
      LEAD_NOT_FOUND: [404, 'Lead not found'],
      LEAD_ACCESS_DENIED: [403, 'You do not have access to this lead'],
      LEAD_NOT_READY: [400, 'Lead must be Site Visit Happened before conversion'],
      COMPLETED_SITE_VISIT_REQUIRED: [400, 'A completed Site Visit is required'],
      PROJECT_REQUIRED: [400, 'Project is required'],
      INVALID_PROJECT: [400, 'Invalid project'],
      PROJECT_MISMATCH: [400, 'Opportunity project must match the completed Site Visit project'],
      INVALID_UNIT: [400, 'Unit is unavailable or does not belong to the project'],
    };
    const mapped = errors[error.message];
    if (mapped) return res.status(mapped[0]).json({ success: false, error: mapped[1] });
    console.error('Convert lead error:', error);
    return res.status(500).json({ success: false, error: 'Failed to convert lead' });
  }
});

router.post('/duplicates', authorize('Lead', 'create'), async (req: AuthRequest, res: Response) => {
  try {
    const parsed = duplicatePreviewSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid lead contact details',
        fieldErrors: parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    const contacts = duplicateContactInput(parsed.data);
    const validationErrors = validateLeadContactInput(contacts);
    if (validationErrors.length) {
      return res.status(400).json({
        success: false,
        error: 'Please correct the highlighted contact details.',
        fieldErrors: validationErrors,
      });
    }
    for (const email of contacts.emails) {
      if (email.value?.trim() && !z.string().trim().email().safeParse(email.value).success) {
        return res.status(400).json({
          success: false,
          error: 'Please correct the highlighted contact details.',
          fieldErrors: [{ field: email.field, message: 'Enter a valid email address.' }],
        });
      }
    }
    const matches = await prisma.$transaction((tx) =>
      findLeadDuplicates(tx, req.tenantId!, contacts),
    );
    const candidates: Array<{
      id: string;
      leadNumber: string | null;
      name: string;
      projectName: string | null;
      matchedFields: string[];
    }> = [];
    for (const match of matches) {
      const accessRecord = await prisma.lead.findFirst({
        where: { id: match.lead.id, ...leadIdScope(req) },
        select: { id: true, tenantId: true, ownerId: true, creatorId: true },
      });
      if (!accessRecord || !(await canAccessLead(req.user!, accessRecord))) continue;
      const related = await prisma.lead.findUnique({
        where: { id: match.lead.id },
        select: {
          owner: { select: { firstName: true, lastName: true } },
          project: { select: { name: true } },
        },
      });
      candidates.push({
        id: match.lead.id,
        leadNumber: match.lead.leadNumber,
        name: [match.lead.firstName, match.lead.lastName].filter(Boolean).join(' '),
        projectName: related?.project?.name || null,
        matchedFields: match.matchedFields,
      });
    }
    return res.json({
      success: true,
      hasDuplicates: matches.length > 0,
      ambiguous: matches.length > 1 || matches.some((match) => match.ambiguous),
      inaccessibleMatches: matches.length > candidates.length,
      candidates,
    });
  } catch (error) {
    console.error('Lead duplicate preview failed:', error);
    return res.status(500).json({ success: false, error: 'Unable to check for duplicate Leads' });
  }
});

router.post('/', authorize('Lead', 'create'), async (req: AuthRequest, res: Response) => {
  try {
    const {
      subSource,
      campaignId,
      campaign,
      subCampaignId,
      subCampaign,
      salesUserId,
      secondaryPhone,
      tertiaryPhone,
      secondaryEmail,
      tertiaryEmail,
      originalSubmissionId,
      countryCode,
      secondaryCountryCode,
      tertiaryCountryCode,
      linkToLeadId,
      medium,
      enquiryDescription,
      channelPartner,
      enquiryDate,
      enquiryDetails,
      siteVisit,
      ...leadInput
    } = req.body || {};
    const metadata = z.object({
      subSource: z.string().trim().max(120).optional(),
      campaignId: z.string().trim().optional(),
      campaign: z.string().trim().max(160).optional(),
      subCampaignId: z.string().trim().optional(),
      subCampaign: z.string().trim().max(160).optional(),
      salesUserId: z.string().trim().optional(),
      secondaryPhone: z.string().trim().max(64).optional(),
      tertiaryPhone: z.string().trim().max(64).optional(),
      secondaryEmail: z.string().trim().email().optional().or(z.literal('')),
      tertiaryEmail: z.string().trim().email().optional().or(z.literal('')),
      originalSubmissionId: z.string().trim().min(1).max(200).optional(),
      countryCode: z.string().trim().regex(/^\+?\d{1,3}$/, 'Enter a valid primary country calling code').optional(),
      secondaryCountryCode: z.string().trim().regex(/^\+?\d{1,3}$/, 'Enter a valid secondary country calling code').optional(),
      tertiaryCountryCode: z.string().trim().regex(/^\+?\d{1,3}$/, 'Enter a valid tertiary country calling code').optional(),
      linkToLeadId: z.string().trim().min(1).optional(),
      medium: z.string().trim().max(120).optional(),
      enquiryDescription: z.string().trim().max(5000).optional(),
      channelPartner: z.string().trim().max(160).optional(),
      enquiryDate: z.coerce.date().optional(),
      enquiryDetails: z.record(z.string(), z.unknown()).optional(),
      siteVisit: z.object({
        projectId: z.string().optional(),
        scheduledAt: z.coerce.date(),
        notes: z.string().trim().max(5000).optional(),
      }).optional(),
    }).parse({
      subSource, campaignId, campaign, subCampaignId, subCampaign, salesUserId,
      secondaryPhone, tertiaryPhone, secondaryEmail, tertiaryEmail, originalSubmissionId, countryCode,
      secondaryCountryCode, tertiaryCountryCode, linkToLeadId, medium, enquiryDescription, channelPartner,
      enquiryDate, enquiryDetails, siteVisit,
    });
    const creationCustomFields = leadInput.customFields && typeof leadInput.customFields === 'object' && !Array.isArray(leadInput.customFields)
      ? leadInput.customFields as Record<string, unknown>
      : {};
    if (Object.prototype.hasOwnProperty.call(creationCustomFields, 'score')) {
      return res.status(400).json({ success: false, error: 'Score is read-only' });
    }
    for (const fieldName of ['source', 'status', 'rating', 'description'] as const) {
      if (leadInput[fieldName] === undefined && creationCustomFields[fieldName] !== undefined) {
        leadInput[fieldName] = creationCustomFields[fieldName];
      }
    }
    const incomingSource = typeof leadInput.source === 'string' ? leadInput.source : 'OTHER';
    const data = leadCreateSchema.parse({
      ...leadInput,
      source: sourceEnumValue(incomingSource),
    });
    const contacts = duplicateContactInput({
      phone: data.phone,
      mobile: data.mobile || undefined,
      secondaryPhone: metadata.secondaryPhone,
      tertiaryPhone: metadata.tertiaryPhone,
      countryCode: metadata.countryCode,
      secondaryCountryCode: metadata.secondaryCountryCode,
      tertiaryCountryCode: metadata.tertiaryCountryCode,
      email: data.email,
      secondaryEmail: metadata.secondaryEmail,
      tertiaryEmail: metadata.tertiaryEmail,
    });
    const validationErrors = validateLeadContactInput(contacts);
    if (validationErrors.length) {
      return res.status(400).json({
        success: false,
        error: 'Please correct the highlighted contact details.',
        fieldErrors: validationErrors,
      });
    }
    const customFieldsToValidate = Object.fromEntries(
      Object.entries(data.customFields || {}).filter(([name]) => name !== 'score'),
    );
    const customFieldError = await validateLeadCustomFields(
      req.tenantId!,
      customFieldsToValidate,
      true,
    );
    if (customFieldError) {
      return res.status(400).json({ success: false, error: customFieldError });
    }
    if (metadata.salesUserId) {
      const salesUser = await prisma.user.findFirst({
        where: { id: metadata.salesUserId, tenantId: req.tenantId!, isActive: true },
        select: { id: true, profile: { select: { name: true } } },
      });
      if (!salesUser || !/^sales(?:\b|$)/i.test(salesUser.profile?.name || '')) {
        return res.status(400).json({ success: false, error: 'Select an active user with a Sales profile' });
      }
    }
    if (
      metadata.siteVisit &&
      !req.user!.isSuperAdmin &&
      !(await EffectivePermissionService.hasPermission(req.user!.id, 'SITE_VISIT_CREATE'))
    ) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions for SiteVisit:create' });
    }

    const result = await processLeadEnquiry({
      tenantId: req.tenantId!,
      userId: req.user!.id,
      salesUserId: metadata.salesUserId,
      profileName: req.user!.profileName,
      expectedLeadId: metadata.linkToLeadId,
      lead: data,
      enquiry: {
        source: incomingSource,
        subSource: metadata.subSource,
        campaignId: metadata.campaignId,
        campaign: metadata.campaign,
        subCampaignId: metadata.subCampaignId,
        subCampaign: metadata.subCampaign,
        secondaryPhone: metadata.secondaryPhone,
        tertiaryPhone: metadata.tertiaryPhone,
        secondaryEmail: metadata.secondaryEmail,
        tertiaryEmail: metadata.tertiaryEmail,
        originalSubmissionId: metadata.originalSubmissionId || req.get('Idempotency-Key') || undefined,
        countryCode: metadata.countryCode,
        secondaryCountryCode: metadata.secondaryCountryCode,
        tertiaryCountryCode: metadata.tertiaryCountryCode,
        medium: metadata.medium,
        description: metadata.enquiryDescription,
        channelPartner: metadata.channelPartner,
        enquiryDate: metadata.enquiryDate,
        details: metadata.enquiryDetails,
      },
      siteVisit: metadata.siteVisit
        ? {
            projectId: metadata.siteVisit.projectId || data.projectId || undefined,
            scheduledAt: metadata.siteVisit.scheduledAt,
            notes: metadata.siteVisit.notes,
          }
        : undefined,
    });
    if (result.action === 'DUPLICATE_CONFLICT') {
      const leadIds = await getAccessibleDuplicateLeadIds(req, result.leadIds);
      return res.status(409).json({
        success: false,
        action: result.action,
        leadIds,
        candidates: leadIds.map((id) => ({ id })),
        error: 'This phone number matches multiple existing Leads. Ask an administrator to resolve the duplicate records.',
      });
    }
    if (result.action === 'LEAD_MISMATCH') {
      return res.status(409).json({
        success: false,
        action: result.action,
        error: 'The duplicate match changed while this enquiry was being submitted. Check for duplicates again.',
      });
    }
    let canReadMatchedLead = true;
    if (result.action !== 'NEW_LEAD') {
      const matchedLead = await prisma.lead.findFirst({
        where: { id: result.leadId, ...leadIdScope(req) },
        select: { id: true, tenantId: true, ownerId: true, creatorId: true },
      });
      canReadMatchedLead = Boolean(matchedLead && await canAccessLead(req.user!, matchedLead));
    }
    res.status(result.action === 'NEW_LEAD' ? 201 : 200).json({
      success: true,
      action: result.action,
      leadId: canReadMatchedLead ? result.leadId : null,
      duplicate: result.action === 'NEW_LEAD'
        ? undefined
        : {
            linked: true,
            leadId: canReadMatchedLead ? result.leadId : null,
            visibilityRestricted: !canReadMatchedLead,
            enquiryId: result.enquiry?.id,
          },
      data: result.lead && canReadMatchedLead
        ? { ...result.lead, ...(result.assignmentWarning ? { assignmentWarning: result.assignmentWarning } : {}) }
        : null,
      validationDays: result.validationDays,
      daysDifference: result.daysDifference,
      assignment: result.assignment,
      enquiry: result.enquiry,
      siteVisit: result.siteVisit,
      ...(result.assignmentWarning ? { warning: result.assignmentWarning } : {}),
      message: result.action === 'NEW_LEAD'
        ? 'New lead created and assigned'
        : result.action === 'RE_OPENED'
          ? 'Existing lost lead reopened and linked successfully'
        : result.action === 'RE_ENGAGED'
          ? 'Existing lost lead re-engaged successfully'
          : result.action === 'OUTSIDE_REENGAGEMENT_WINDOW'
            ? 'Existing lost lead is outside the re-engagement validation period'
            : 'Lead already exists',
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: error.errors[0].message,
        fieldErrors: error.errors.map((issue: z.ZodIssue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    if (error?.message === 'LEAD_CONTACT_VALIDATION') {
      return res.status(400).json({
        success: false,
        error: 'Please correct the highlighted contact details.',
        fieldErrors: error.validationErrors,
      });
    }
    if (isPhoneUniqueViolation(error)) {
      return res.status(409).json({ success: false, action: 'DUPLICATE_CONFLICT', error: PHONE_DUPLICATE_ERROR });
    }
    if (error?.message === 'INVALID_PROJECT') {
      return res.status(400).json({ success: false, error: 'Invalid project' });
    }
    if (error?.message === 'SALES_USER_INVALID') {
      return res.status(400).json({ success: false, error: 'Select an active user with a Sales profile' });
    }
    if (error?.message === 'RR_PROJECT_REQUIRED') {
      return res.status(409).json({ success: false, error: 'A project is required to assign this lead to Pre Sales.' });
    }
    if (error?.message === 'RR_QUEUE_NOT_CONFIGURED:Pre Sales' || error?.message === 'NO_ELIGIBLE_RR_MEMBER:Pre Sales') {
      return res.status(409).json({ success: false, error: 'No eligible Pre Sales round-robin member is configured for this project.' });
    }
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.issues[0]?.message || 'Invalid enquiry data' });
    }
    console.error('Create lead error:', error);
    res.status(500).json({ success: false, error: 'Failed to create lead' });
  }
});

router.put('/:id', authorize('Lead', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const existingLead = await prisma.lead.findFirst({
      where: { id: req.params.id, ...leadIdScope(req) },
    });

    if (!existingLead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    if (!(await canAccessLead(req.user!, existingLead))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this lead' });
    }

    const bodyData = { ...req.body };
    const requestedCustomFields = bodyData.customFields && typeof bodyData.customFields === 'object' && !Array.isArray(bodyData.customFields)
      ? bodyData.customFields as Record<string, unknown>
      : {};
    const operationalFieldNames = ['source', 'status', 'rating', 'description', 'score'] as const;
    if (Object.prototype.hasOwnProperty.call(requestedCustomFields, 'score')) {
      return res.status(400).json({ success: false, error: 'Score is read-only' });
    }
    for (const fieldName of operationalFieldNames) {
      if (bodyData[fieldName] === undefined && requestedCustomFields[fieldName] !== undefined) {
        bodyData[fieldName] = requestedCustomFields[fieldName];
      }
    }
    delete bodyData.leadNumber;
    const reason =
      typeof bodyData.reason === 'string' && bodyData.reason.trim()
        ? bodyData.reason.trim()
        : undefined;
    delete bodyData.reason;
    const data = leadUpdateSchema.parse(bodyData);

    if (data.customFields) {
      const fieldsToValidate = Object.fromEntries(
        Object.entries(data.customFields).filter(([name]) => name !== 'score'),
      );
      const customFieldError = await validateLeadCustomFields(
        existingLead.tenantId,
        fieldsToValidate,
        false,
      );
      if (customFieldError) {
        return res.status(400).json({ success: false, error: customFieldError });
      }
      const storedCustomFields = existingLead.customFields;
      data.customFields = {
        ...(storedCustomFields && typeof storedCustomFields === 'object' && !Array.isArray(storedCustomFields)
          ? storedCustomFields as Record<string, JsonValue>
          : {}),
        ...data.customFields,
      };
    }
    const operationalFieldUpdates = {
      ...(data.source !== undefined ? { source: data.source } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.rating !== undefined ? { rating: data.rating } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.score !== undefined ? { score: data.score } : {}),
    };
    if (Object.keys(operationalFieldUpdates).length) {
      data.customFields = mergeOperationalLeadCustomFields(
        data.customFields || existingLead.customFields,
        operationalFieldUpdates,
      );
    }

    if (data.status && !isValidStatus(data.status)) {
      return res.status(400).json({ success: false, error: `Invalid status: ${data.status}` });
    }

    if (data.phone !== undefined && data.phone !== '') {
      const phoneToCheck = normalizePhone(data.phone);
      if (await findPhoneConflict(existingLead.tenantId, phoneToCheck, req.params.id)) {
        return res.status(409).json({ success: false, error: PHONE_DUPLICATE_ERROR });
      }
      data.phone = phoneToCheck;
    }

    if (data.status) {
      const profileName = req.user!.profileName || 'Admin';

      if (profileName !== 'Admin' && profileName !== 'Manager' && profileName !== 'CRM Admin') {
        if (!canTransitionStatus(profileName, existingLead.status, data.status)) {
          return res.status(403).json({
            success: false,
            error: `Profile ${profileName} cannot change status from ${existingLead.status} to ${data.status}`,
          });
        }
      }
    }

    const { oldValues, newValues, updateData } = computeLeadDiff(existingLead, data);
    if (updateData.status) {
      updateData.lostAt = updateData.status === 'LOST' ? new Date() : null;
    }

    if (Object.keys(updateData).length === 0) {
      const unchanged = await prisma.lead.findFirst({
        where: { id: req.params.id, ...leadIdScope(req) },
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
          project: { select: { id: true, name: true } },
        },
      });
      return res.json({ success: true, data: unchanged, unchanged: true });
    }

    const ownerChanged =
      'ownerId' in updateData &&
      normalizeDiffValue(updateData.ownerId) !== normalizeDiffValue(existingLead.ownerId);
    const shouldReassign = hasLeadAssignmentRelevantChanges(updateData);
    const result = await prisma.$transaction(async (tx) => {
      let assignment: Awaited<ReturnType<typeof assignLeadToProjectRoundRobinInTransaction>> | null = null;
      let salesHandoff: Awaited<ReturnType<typeof assignCompletedSiteVisitToSalesInTransaction>> | null = null;
      if (updateData.status === 'LOST' && existingLead.status !== 'LOST') {
        assignment = await assignLeadToProjectRoundRobinInTransaction(tx, {
          tenantId: existingLead.tenantId,
          leadId: existingLead.id,
          projectId: 'projectId' in updateData ? updateData.projectId : existingLead.projectId,
          userType: 'Recovery',
          actorId: req.user!.id,
          reason: reason || 'Lead marked Lost',
        });
      }
      if (updateData.status === 'SITE_VISIT_HAPPENED' && existingLead.status !== 'SITE_VISIT_HAPPENED') {
        const completedVisit = await tx.siteVisit.findFirst({
          where: { tenantId: existingLead.tenantId, leadId: existingLead.id, status: 'COMPLETED', completedAt: { not: null }, completedById: { not: null } },
          orderBy: [{ completedAt: 'desc' }, { updatedAt: 'desc' }],
          select: { id: true },
        });
        if (!completedVisit) throw new Error('COMPLETED_SITE_VISIT_REQUIRED');
        salesHandoff = await assignCompletedSiteVisitToSalesInTransaction(tx, completedVisit.id, existingLead.tenantId);
      }

      const persistedUpdateData = {
        ...updateData,
        ...(assignment ? { ownerId: assignment.assignedUserId, rrQueueId: assignment.queueId } : {}),
        ...(salesHandoff?.assignedUserId
          ? { ownerId: salesHandoff.assignedUserId, rrQueueId: salesHandoff.queueId }
          : {}),
      };
      const lead = await tx.lead.update({
        where: { id: req.params.id },
        data: persistedUpdateData,
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
          project: { select: { id: true, name: true } },
        },
      });

      const workflowAssigned = !!assignment || !!salesHandoff?.assignedUserId;
      const auditNewValues = reason ? { ...newValues, reason } : newValues;
      const auditData = {
        tenantId: existingLead.tenantId,
        userId: req.user!.id,
        leadId: lead.id,
        action: ownerChanged && Object.keys(newValues).length === 1 ? 'OWNER_CHANGED' : 'UPDATE',
        objectType: 'Lead',
        objectId: lead.id,
        oldValues,
        newValues: {
          ...auditNewValues,
          ...(assignment ? { ownerId: assignment.assignedUserId, rrQueueId: assignment.queueId } : {}),
          ...(salesHandoff?.assignedUserId
            ? { ownerId: salesHandoff.assignedUserId, rrQueueId: salesHandoff.queueId }
            : {}),
        },
      };
      await tx.auditLog.create({ data: auditData });

      if (ownerChanged && !workflowAssigned) {
        const newOwnerId = normalizeDiffValue(updateData.ownerId);
        const newOwner = newOwnerId
          ? await tx.user.findUnique({
              where: { id: newOwnerId },
              select: { id: true, firstName: true, lastName: true, profile: { select: { name: true } } },
            })
          : null;

        await createOwnerHistory(
          {
            tenantId: existingLead.tenantId,
            leadId: lead.id,
            previousOwnerId: existingLead.ownerId,
            newOwnerId: newOwnerId as string | null,
            previousProfile: null,
            newProfile: newOwner?.profile?.name || null,
            previousStatus: existingLead.status,
            newStatus: lead.status,
            handoffReason: reason || 'Owner changed via lead update',
            changedById: req.user!.id,
          },
          tx,
        );
      }

      const leadForAssignment = {
        ...lead,
        projectId: Object.prototype.hasOwnProperty.call(updateData, 'projectId')
          ? updateData.projectId
          : lead.projectId || existingLead.projectId || null,
        projectName: lead.project?.name || (Object.prototype.hasOwnProperty.call(updateData, 'projectId') ? null : existingLead.projectId) || null,
        status: updateData.status ?? lead.status,
        source: updateData.source ?? lead.source,
        leadQueueing: shouldReassign,
        leadAssigned: !shouldReassign,
        leadReassign: shouldReassign,
      };

      let rrAssignment: any = null;
      if (!workflowAssigned && shouldReassign && isLeadEligibleForAutoAssignment(leadForAssignment, { isNewLead: false })) {
        const queue = await findApplicableRRQueue(existingLead.tenantId, {
          projectId: leadForAssignment.projectId,
          projectName: leadForAssignment.projectName,
          status: String(leadForAssignment.status),
          source: String(leadForAssignment.source),
          priority: String(leadForAssignment.rating || ''),
        }, tx);
        if (queue) {
          rrAssignment = await RoundRobinAssignmentService.assignLeadInTransaction(
            tx,
            queue.id,
            lead.id,
            existingLead.tenantId,
            req.user!.id,
          );
        }
      }

      return { ...lead, assignment: rrAssignment };
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    if (error?.message === 'RR_PROJECT_REQUIRED') {
      return res.status(409).json({ success: false, error: 'A project is required for this round-robin assignment.' });
    }
    if (error?.message === 'RR_QUEUE_NOT_CONFIGURED:Recovery' || error?.message === 'NO_ELIGIBLE_RR_MEMBER:Recovery') {
      return res.status(409).json({ success: false, error: 'No eligible Recovery member is available in a round-robin queue matching this project and lead source.' });
    }
    if (error?.message === 'COMPLETED_SITE_VISIT_REQUIRED') {
      return res.status(409).json({ success: false, error: 'A completed site visit is required before assigning Sales.' });
    }
    if (isPhoneUniqueViolation(error)) {
      return res.status(409).json({ success: false, error: PHONE_DUPLICATE_ERROR });
    }
    if (error?.message === 'NO_ELIGIBLE_USER') {
      return res.status(409).json({
        success: false,
        error: 'No eligible RR queue member or fallback owner is available for this lead.',
      });
    }
    console.error('Update lead error:', error);
    res.status(500).json({ success: false, error: 'Failed to update lead' });
  }
});

router.delete('/:id', authorize('Lead', 'delete'), async (req: AuthRequest, res: Response) => {
  try {
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, ...leadIdScope(req) },
    });

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    if (!(await canAccessLead(req.user!, lead))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this lead' });
    }

    await prisma.auditLog.create({
      data: {
        tenantId: lead.tenantId,
        userId: req.user!.id,
        action: 'DELETE',
        objectType: 'Lead',
        objectId: lead.id,
        oldValues: lead,
      },
    });

    await prisma.$transaction(async (tx) => {
      const cleanupPlan = buildLeadDeletionPlan(lead.id);

      for (const step of cleanupPlan) {
        if (step.name === 'lead') {
          await tx.lead.delete({ where: step.where });
          continue;
        }

        if (step.name === 'activity') {
          await tx.activity.deleteMany({ where: step.where as any });
          continue;
        }

        if (step.name === 'task') {
          await tx.task.deleteMany({ where: step.where as any });
          continue;
        }

        if (step.name === 'followUp') {
          await tx.followUp.deleteMany({ where: step.where as any });
          continue;
        }

        if (step.name === 'leadOwnerHistory') {
          await tx.leadOwnerHistory.deleteMany({ where: step.where as any });
          continue;
        }

        if (step.name === 'payment') {
          await tx.payment.deleteMany({ where: step.where as any });
          continue;
        }

        if (step.name === 'siteVisit') {
          await tx.siteVisit.deleteMany({ where: step.where as any });
          continue;
        }

        if (step.name === 'approval') {
          await tx.approval.deleteMany({ where: step.where as any });
          continue;
        }

        if (step.name === 'quotationItem') {
          await tx.quotationItem.deleteMany({ where: step.where as any });
          continue;
        }

        if (step.name === 'booking') {
          await tx.booking.deleteMany({ where: step.where as any });
          continue;
        }

        if (step.name === 'quotation') {
          await tx.quotation.deleteMany({ where: step.where as any });
          continue;
        }

        if (step.name === 'opportunity') {
          await tx.opportunity.deleteMany({ where: step.where as any });
        }
      }
    });

    res.json({ success: true, message: 'Lead deleted successfully' });
  } catch (error) {
    console.error('Delete lead error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete lead' });
  }
});

router.post('/:id/push-to-svc', authorize('Lead', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const parsedBody = pushToSvcRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({ success: false, error: parsedBody.error.issues[0]?.message || 'Invalid request body' });
    }
    const { reason } = parsedBody.data;

    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, ...leadIdScope(req) },
      include: { owner: { select: { id: true, firstName: true, lastName: true } } },
    });

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    if (!(await canAccessLead(req.user!, lead))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this lead' });
    }

    if (lead.status !== 'INCOMING') {
      return res.status(400).json({ success: false, error: 'Lead must be in Incoming status to push to SVC' });
    }

    const profileName = req.user!.profileName || 'Admin';

    if (profileName !== 'Admin' && profileName !== 'Manager' && profileName !== 'CRM Admin') {
      if (!canTransitionStatus(profileName, 'INCOMING', 'PROSPECT')) {
        return res.status(403).json({ success: false, error: 'Not authorized to push leads to SVC' });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const assignment = await assignLeadToProjectRoundRobinInTransaction(tx, {
        tenantId: lead.tenantId,
        leadId: lead.id,
        projectId: lead.projectId,
        userType: 'SVC',
        actorId: req.user!.id,
        reason: 'Lead pushed to SVC',
      });
      await tx.lead.update({
        where: { id: req.params.id },
        data: { status: 'PROSPECT', lostAt: null },
      });

      await tx.auditLog.create({
        data: {
          tenantId: lead.tenantId,
          userId: req.user!.id,
          leadId: lead.id,
          action: 'PUSH_TO_SVC',
          objectType: 'Lead',
          objectId: lead.id,
          oldValues: { status: 'INCOMING', ownerId: lead.ownerId },
          newValues: {
            status: 'PROSPECT',
            ownerId: assignment.assignedUserId,
            note: reason,
            reason,
          },
        },
      });

      return tx.lead.findUniqueOrThrow({
        where: { id: lead.id },
        include: { owner: { select: { id: true, firstName: true, lastName: true } } },
      });
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    if (error?.message === 'RR_PROJECT_REQUIRED') {
      return res.status(409).json({ success: false, error: 'A project is required to push this lead to SVC.' });
    }
    if (error?.message === 'RR_QUEUE_NOT_CONFIGURED:SVC') {
      return res.status(409).json({ success: false, error: 'No active SVC round-robin queue matches this project and lead source.' });
    }
    if (error?.message === 'NO_ELIGIBLE_RR_MEMBER:SVC') {
      return res.status(409).json({ success: false, error: 'The matching SVC round-robin queue has no active, available SVC member.' });
    }
    console.error('Push to SVC error:', error);
    res.status(500).json({ success: false, error: 'Failed to push lead to SVC' });
  }
});

router.post('/:id/move-to-recovery', async (req: AuthRequest, res: Response) => {
  try {
    const { recoveryReason, note } = req.body;
    if (!recoveryReason || !recoveryReason.trim()) {
      return res.status(400).json({ success: false, error: 'Recovery reason is required' });
    }

    const permissions = req.user!.isSuperAdmin
      ? []
      : await EffectivePermissionService.getEffectivePermissionsCached(req.user!, req.user!.id);
    const canMoveToRecovery = req.user!.isSuperAdmin ||
      EffectivePermissionService.hasPermissionIn(permissions, 'LEAD_UPDATE') ||
      EffectivePermissionService.hasPermissionIn(permissions, 'SITE_VISIT_UPDATE') ||
      EffectivePermissionService.hasPermissionIn(permissions, 'SITE_VISIT_CREATE');
    if (!canMoveToRecovery) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions to move this lead to Recovery.' });
    }

    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, ...leadIdScope(req) },
      include: { owner: { select: { id: true, firstName: true, lastName: true } } },
    });

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    if (!(await canAccessLead(req.user!, lead))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this lead' });
    }

    if (lead.status === 'LOST') {
      return res.status(400).json({ success: false, error: 'Lead is already marked Lost.' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const assignment = await assignLeadToProjectRoundRobinInTransaction(tx, {
        tenantId: lead.tenantId,
        leadId: lead.id,
        projectId: lead.projectId,
        userType: 'Recovery',
        actorId: req.user!.id,
        reason: recoveryReason,
      });
      await tx.lead.update({
        where: { id: req.params.id },
        data: { status: 'LOST', lostAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          tenantId: lead.tenantId,
          userId: req.user!.id,
          leadId: lead.id,
          action: 'MOVE_TO_RECOVERY',
          objectType: 'Lead',
          objectId: lead.id,
          oldValues: { status: lead.status, ownerId: lead.ownerId },
          newValues: { status: 'LOST', ownerId: assignment.assignedUserId, recoveryReason, recoveryNote: note, reason: recoveryReason },
        },
      });

      return tx.lead.findUniqueOrThrow({
        where: { id: lead.id },
        include: { owner: { select: { id: true, firstName: true, lastName: true } } },
      });
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    if (error?.message === 'RR_PROJECT_REQUIRED') {
      return res.status(409).json({ success: false, error: 'A project is required to assign this lead to Recovery.' });
    }
    if (error?.message === 'RR_QUEUE_NOT_CONFIGURED:Recovery' || error?.message === 'NO_ELIGIBLE_RR_MEMBER:Recovery') {
      return res.status(409).json({ success: false, error: 'No eligible Recovery member is available in a round-robin queue matching this project and lead source.' });
    }
    console.error('Move to recovery error:', error);
    res.status(500).json({ success: false, error: 'Failed to move lead to recovery' });
  }
});

router.post('/:id/schedule-site-visit', authorize('Lead', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const request = z.object({
      projectId: z.string().trim().min(1, 'Project is required for site visit'),
      notes: z.string().trim().min(1, 'Note/reason is required for site visit').max(2000),
      scheduledAt: z.string().datetime('Visit date/time is required'),
    }).safeParse(req.body);
    if (!request.success) {
      return res.status(400).json({ success: false, error: request.error.issues[0].message });
    }
    const { scheduledAt, notes, projectId } = request.data;

    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, ...leadIdScope(req) },
      include: { owner: { select: { id: true, firstName: true, lastName: true } } },
    });

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    if (!(await canAccessLead(req.user!, lead))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this lead' });
    }

    if (lead.status !== 'PROSPECT') {
      return res.status(400).json({ success: false, error: 'Lead must be in Prospect status to schedule site visit' });
    }

    const profileName = req.user!.profileName || 'Admin';

    if (profileName !== 'Admin' && profileName !== 'Manager' && profileName !== 'CRM Admin') {
      if (!canTransitionStatus(profileName, 'PROSPECT', 'SITE_VISIT_SCHEDULED')) {
        return res.status(403).json({ success: false, error: 'Not authorized to schedule site visits' });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const project = await tx.project.findFirst({
        where: { id: projectId, tenantId: lead.tenantId, isActive: true },
        select: { id: true },
      });
      if (!project) {
        throw new Error('PROJECT_NOT_AVAILABLE');
      }

      const siteVisitNumber = await getNextSiteVisitNumber(tx, lead.tenantId);
      const siteVisit = await tx.siteVisit.create({
        data: {
          tenantId: lead.tenantId,
          leadId: lead.id,
          projectId,
          creatorId: req.user!.id,
          siteVisitNumber,
          scheduledAt: new Date(scheduledAt),
          status: 'SCHEDULED',
          notes,
        },
        select: { id: true },
      });

      await assignSiteVisitToSVCInTransaction(tx, {
        siteVisitId: siteVisit.id,
        tenantId: lead.tenantId,
        actorId: req.user!.id,
      });
      const updatedLead = await tx.lead.update({
        where: { id: req.params.id },
        data: { status: 'SITE_VISIT_SCHEDULED', lostAt: null },
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: lead.tenantId,
          userId: req.user!.id,
          leadId: lead.id,
          action: 'SITE_VISIT_SCHEDULED',
          objectType: 'Lead',
          objectId: lead.id,
          oldValues: { status: 'PROSPECT', ownerId: lead.ownerId },
          newValues: {
            status: 'SITE_VISIT_SCHEDULED',
            siteVisitId: siteVisit.id,
            note: notes,
            reason: notes,
          },
        },
      });

      const assignedSiteVisit = await tx.siteVisit.findUniqueOrThrow({
        where: { id: siteVisit.id },
        include: {
          assignee: { select: { id: true, firstName: true, lastName: true } },
          project: { select: { id: true, name: true } },
        },
      });
      return { lead: updatedLead, siteVisit: assignedSiteVisit };
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    if (error?.message === 'PROJECT_NOT_AVAILABLE') {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    if (error?.message === 'SVC_QUEUE_NOT_CONFIGURED' || error?.message === 'NO_ELIGIBLE_SVC_MEMBER') {
      return res.status(409).json({ success: false, error: 'No eligible SVC member is available in a round-robin queue matching this project and lead source.' });
    }
    console.error('Schedule site visit error:', error);
    res.status(500).json({ success: false, error: 'Failed to schedule site visit' });
  }
});

router.put('/:id/status', authorize('Lead', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { status, note } = req.body;

    if (!isValidStatus(status)) {
      return res.status(400).json({ success: false, error: `Invalid status: ${status}` });
    }

    if (!note || !note.trim()) {
      return res.status(400).json({ success: false, error: 'A note/reason is required for status change' });
    }

    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, ...leadIdScope(req) },
    });

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    if (!(await canAccessLead(req.user!, lead))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this lead' });
    }

    if (lead.status === status) {
      return res.status(400).json({ success: false, error: `Lead is already in ${status} status` });
    }

    const profileName = req.user!.profileName || 'Admin';

    if (profileName !== 'Admin' && profileName !== 'Manager' && profileName !== 'CRM Admin') {
      if (!canTransitionStatus(profileName, lead.status, status)) {
        return res.status(403).json({
          success: false,
          error: `Profile ${profileName} cannot change status from ${lead.status} to ${status}`,
        });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      let assignment: Awaited<ReturnType<typeof assignLeadToProjectRoundRobinInTransaction>> | null = null;
      let salesHandoff: Awaited<ReturnType<typeof assignCompletedSiteVisitToSalesInTransaction>> | null = null;
      if (status === 'LOST' && lead.status !== 'LOST') {
        assignment = await assignLeadToProjectRoundRobinInTransaction(tx, {
          tenantId: lead.tenantId,
          leadId: lead.id,
          projectId: lead.projectId,
          userType: 'Recovery',
          actorId: req.user!.id,
          reason: note,
        });
      } else if (status === 'SITE_VISIT_HAPPENED' && lead.status !== 'SITE_VISIT_HAPPENED') {
        const completedVisit = await tx.siteVisit.findFirst({
          where: { tenantId: lead.tenantId, leadId: lead.id, status: 'COMPLETED', completedAt: { not: null }, completedById: { not: null } },
          orderBy: [{ completedAt: 'desc' }, { updatedAt: 'desc' }],
          select: { id: true },
        });
        if (!completedVisit) throw new Error('COMPLETED_SITE_VISIT_REQUIRED');
        salesHandoff = await assignCompletedSiteVisitToSalesInTransaction(tx, completedVisit.id, lead.tenantId);
      }

      await tx.lead.update({
        where: { id: req.params.id },
        data: {
          status,
          lostAt: status === 'LOST' ? new Date() : null,
          ...(assignment ? { ownerId: assignment.assignedUserId, rrQueueId: assignment.queueId } : {}),
          ...(salesHandoff?.assignedUserId
            ? { ownerId: salesHandoff.assignedUserId, rrQueueId: salesHandoff.queueId }
            : {}),
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: lead.tenantId,
          userId: req.user!.id,
          leadId: lead.id,
          action: 'STATUS_CHANGE',
          objectType: 'Lead',
          objectId: lead.id,
          oldValues: { status: lead.status },
          newValues: {
            status,
            ...(assignment ? { ownerId: assignment.assignedUserId, rrQueueId: assignment.queueId } : {}),
            ...(salesHandoff?.assignedUserId ? { ownerId: salesHandoff.assignedUserId, rrQueueId: salesHandoff.queueId } : {}),
            note,
            reason: note,
          },
        },
      });

      const updated = await tx.lead.findUniqueOrThrow({
        where: { id: lead.id },
        include: { owner: { select: { id: true, firstName: true, lastName: true } } },
      });
      return { lead: updated, salesHandoff };
    });

    if (result.salesHandoff?.pendingReason) {
      return res.status(409).json({ success: false, error: result.salesHandoff.pendingReason, data: result });
    }
    res.json({ success: true, data: result.lead });
  } catch (error: any) {
    if (error?.message === 'RR_PROJECT_REQUIRED') {
      return res.status(409).json({ success: false, error: 'A project is required for this round-robin assignment.' });
    }
    if (error?.message === 'RR_QUEUE_NOT_CONFIGURED:Recovery' || error?.message === 'NO_ELIGIBLE_RR_MEMBER:Recovery') {
      return res.status(409).json({ success: false, error: 'No eligible Recovery member is available in a round-robin queue matching this project and lead source.' });
    }
    if (error?.message === 'COMPLETED_SITE_VISIT_REQUIRED') {
      return res.status(409).json({ success: false, error: 'A completed site visit is required before assigning Sales.' });
    }
    console.error('Update lead status error:', error);
    res.status(500).json({ success: false, error: 'Failed to update lead status' });
  }
});

router.patch('/:id/owner', authorize('Lead', 'assign'), async (req: AuthRequest, res: Response) => {
  try {
    const { ownerId, reason } = req.body || {};
    const data = await changeLeadOwner({
      leadId: req.params.id,
      newOwnerId: typeof ownerId === 'string' ? ownerId : '',
      reason: typeof reason === 'string' ? reason : '',
      changedBy: req.user!,
    });
    res.json({ success: true, data });
  } catch (error: any) {
    const message = error?.message || 'Failed to change lead owner';
    const status = message === 'Lead not found' ? 404
      : message.includes('access') || message.includes('permission') ? 403
      : message.includes('required') || message.includes('different') || message.includes('eligible') ? 400
      : 500;
    if (status === 500) console.error('Change lead owner error:', error);
    res.status(status).json({ success: false, error: message });
  }
});

router.put('/:id/assign', authorize('Lead', 'assign'), async (req: AuthRequest, res: Response) => {
  try {
    const data = await changeLeadOwner({
      leadId: req.params.id,
      newOwnerId: typeof req.body?.ownerId === 'string' ? req.body.ownerId : '',
      reason: typeof req.body?.reason === 'string' ? req.body.reason : '',
      changedBy: req.user!,
    });
    res.json({ success: true, data });
  } catch (error: any) {
    const message = error?.message || 'Failed to change lead owner';
    const status = message === 'Lead not found' ? 404
      : message.includes('access') ? 403
      : message.includes('required') || message.includes('different') || message.includes('eligible') ? 400
      : 500;
    if (status === 500) console.error('Assign lead error:', error);
    res.status(status).json({ success: false, error: message });
  }
});

router.get('/:id/owner-candidates', authorize('Lead', 'assign'), async (req: AuthRequest, res: Response) => {
  try {
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, ...leadIdScope(req) },
      select: { id: true, tenantId: true, ownerId: true, creatorId: true },
    });
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
    if (!(await canAccessLead(req.user!, lead))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this lead' });
    }
    const candidates = await getEligibleLeadOwners(lead.tenantId, lead.ownerId);
    res.json({ success: true, data: candidates });
  } catch (error) {
    console.error('Get lead owner candidates error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch eligible owners' });
  }
});

router.get('/:id/owner-history', authorize('Lead', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, ...leadIdScope(req) },
    });

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    if (!(await canAccessLead(req.user!, lead))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this lead' });
    }

    const history = await getOwnerHistory(lead.tenantId, req.params.id);
    res.json({ success: true, data: history });
  } catch (error) {
    console.error('Get owner history error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch owner history' });
  }
});

router.get('/:id/activity-history', authorize('Lead', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 100);
    if (!Number.isInteger(page) || page < 1 || page > 100 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({ success: false, error: 'Invalid activity history page or limit' });
    }

    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, ...leadIdScope(req) },
      select: { id: true, tenantId: true, ownerId: true, creatorId: true },
    });

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    if (!(await canAccessLead(req.user!, lead))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this lead' });
    }

    const where = { tenantId: lead.tenantId, leadId: lead.id };
    const take = page * limit;
    const [activityRecords, taskRecords, followUpRecords, activityCount, taskCount, followUpCount] = await Promise.all([
      prisma.activity.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
        },
        take,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      prisma.task.findMany({
        where: { tenantId: lead.tenantId, leadId: lead.id },
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
        },
        take,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      prisma.followUp.findMany({
        where: { tenantId: lead.tenantId, leadId: lead.id },
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
        },
        take,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      prisma.activity.count({ where }),
      prisma.task.count({ where: { tenantId: lead.tenantId, leadId: lead.id } }),
      prisma.followUp.count({ where: { tenantId: lead.tenantId, leadId: lead.id } }),
    ]);
    const combined = [
      ...activityRecords.map((activity) => ({ ...activity, feedType: activity.type })),
      ...taskRecords.map((task) => ({
        ...task,
        type: 'TASK',
        subject: task.title,
        notes: task.description,
        createdAt: task.createdAt,
        user: task.owner,
        feedType: 'TASK',
      })),
      ...followUpRecords.map((followUp) => ({
        ...followUp,
        type: 'FOLLOW_UP',
        subject: followUp.title,
        notes: followUp.description,
        status: followUp.isCompleted ? 'COMPLETED' : 'PLANNED',
        createdAt: followUp.createdAt,
        user: followUp.owner,
        feedType: 'FOLLOW_UP',
      })),
    ].sort((first, second) =>
      second.createdAt.getTime() - first.createdAt.getTime() || second.id.localeCompare(first.id),
    );
    const activities = combined.slice((page - 1) * limit, page * limit);
    const totalEntries = activityCount + taskCount + followUpCount;

    res.json({
      success: true,
      data: activities,
      pagination: {
        page,
        limit,
        total: totalEntries,
        totalPages: Math.ceil(totalEntries / limit),
      },
    });
  } catch (error) {
    console.error('Get lead activity history error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch lead activity history' });
  }
});

router.get('/:id/audit-history', authorize('Lead', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, action } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, ...leadIdScope(req) },
      select: { id: true, tenantId: true, ownerId: true, creatorId: true },
    });

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    if (!(await canAccessLead(req.user!, lead))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this lead' });
    }

    const where: any = {
      tenantId: lead.tenantId,
      OR: [{ leadId: lead.id }, { objectType: 'Lead', objectId: lead.id }],
    };
    if (action) where.action = action;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      success: true,
      data: await enrichAuditLogs(logs),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get lead audit history error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch lead audit history' });
  }
});

export { router as leadRoutes };