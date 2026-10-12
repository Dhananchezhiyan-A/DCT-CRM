import { prisma } from '@dct-crm/db';
import { EffectivePermissionService } from './effectivePermissions';

export type AuthUserLike = {
  id: string;
  tenantId: string;
  isSuperAdmin?: boolean;
  isAdmin?: boolean;
  profileName?: string | null;
};

export type RecordScope =
  | { type: 'ALL' }
  | { type: 'OWNER'; userId: string };

async function hasLegacyViewAll(userId: string, objectName: string): Promise<boolean> {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: {
      role: {
        include: {
          permissionSets: {
            include: { permissionSet: true },
          },
        },
      },
    },
  });

  for (const userRole of userRoles) {
    for (const rolePerm of userRole.role.permissionSets) {
      if (rolePerm.permissionSet.objectName === objectName) {
        const permissions = rolePerm.permissionSet.permissions as {
          viewAll?: boolean;
          modifyAll?: boolean;
        };
        if (permissions?.viewAll || permissions?.modifyAll) return true;
      }
    }
  }
  return false;
}

export async function getRecordScope(
  user: AuthUserLike,
  objectName: string,
  moduleName: string,
): Promise<RecordScope> {
  if (user.isSuperAdmin || user.isAdmin) return { type: 'ALL' };

  const permsPromise = EffectivePermissionService.getEffectivePermissionsCached(user, user.id);
  const [perms, legacy] = await Promise.all([
    permsPromise,
    hasLegacyViewAll(user.id, objectName),
  ]);

  const viewAll = EffectivePermissionService.hasPermissionIn(perms, `${moduleName}_VIEW_ALL`);
  const modifyAll = EffectivePermissionService.hasPermissionIn(perms, `${moduleName}_MODIFY_ALL`);

  if (viewAll || modifyAll || legacy) return { type: 'ALL' };
  return { type: 'OWNER', userId: user.id };
}

export async function getLeadRecordScope(user: AuthUserLike): Promise<RecordScope> {
  return getRecordScope(user, 'Lead', 'LEAD');
}

/** Shared site-visit access clause: assignee or creator of an active SCHEDULED visit. */
function activeSiteVisitShare(userId: string) {
  return {
    siteVisits: {
      some: {
        status: 'SCHEDULED' as const,
        OR: [{ assigneeId: userId }, { creatorId: userId }],
      },
    },
  };
}

/**
 * Owner-based Lead list/detail scope.
 * ALL → no owner filter. OWNER → own leads + active SV workflow share.
 */
export function leadScopeClause(scope: RecordScope): Record<string, unknown> | null {
  if (scope.type === 'ALL') return null;
  return {
    OR: [
      // Record access = current lead OWNER. A creator does NOT retain access
      // after Round Robin / handoff / admin owner change reassigns the lead
      // (owner change must remove it from the previous owner's list server-side).
      { ownerId: scope.userId },
      activeSiteVisitShare(scope.userId),
    ],
  };
}

export async function canAccessLead(
  user: AuthUserLike,
  lead: { id: string; tenantId: string; ownerId: string | null; creatorId?: string | null },
): Promise<boolean> {
  if (!user.isSuperAdmin && lead.tenantId !== user.tenantId) return false;
  const scope = await getLeadRecordScope(user);
  if (scope.type === 'ALL') return true;
  if (lead.ownerId && lead.ownerId === scope.userId) return true;

  // Creator no longer retains access once ownership has moved to another user.
  const shared = await prisma.siteVisit.findFirst({
    where: {
      leadId: lead.id,
      status: 'SCHEDULED',
      OR: [{ assigneeId: scope.userId }, { creatorId: scope.userId }],
    },
    select: { id: true },
  });
  return Boolean(shared);
}

export async function canAccessLeadId(user: AuthUserLike, leadId: string): Promise<boolean> {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, ...(user.isSuperAdmin ? {} : { tenantId: user.tenantId }) },
    select: { id: true, tenantId: true, ownerId: true, creatorId: true },
  });
  if (!lead) return false;
  return canAccessLead(user, lead);
}

export function ownerOwnedClause(userId: string): Record<string, unknown> {
  return { ownerId: userId };
}

/** Opportunity/Booking: owner or creator, plus linked-lead access for ALL-scope users. */
export function ownedByUserClause(userId: string) {
  return {
    OR: [{ ownerId: userId }, { creatorId: userId }],
  };
}

export async function canAccessOpportunity(
  user: AuthUserLike,
  opp: { id: string; tenantId: string; ownerId: string | null; creatorId: string | null; leadId: string | null },
): Promise<boolean> {
  if (opp.tenantId !== user.tenantId) return false;
  const scope = await getRecordScope(user, 'Opportunity', 'OPPORTUNITY');
  if (scope.type === 'ALL') return true;
  if (opp.ownerId === scope.userId || opp.creatorId === scope.userId) return true;
  if (opp.leadId) return canAccessLeadId(user, opp.leadId);
  return false;
}

export async function canAccessBooking(
  user: AuthUserLike,
  booking: { id: string; tenantId: string; ownerId: string | null; creatorId: string | null; leadId: string | null },
): Promise<boolean> {
  if (booking.tenantId !== user.tenantId) return false;
  const scope = await getRecordScope(user, 'Booking', 'BOOKING');
  if (scope.type === 'ALL') return true;
  if (booking.ownerId === scope.userId || booking.creatorId === scope.userId) return true;
  if (booking.leadId) return canAccessLeadId(user, booking.leadId);
  return false;
}

export async function canAccessSiteVisit(
  user: AuthUserLike,
  sv: { id: string; tenantId: string; assigneeId: string | null; creatorId: string | null; leadId: string },
): Promise<boolean> {
  if (sv.tenantId !== user.tenantId) return false;
  const scope = await getRecordScope(user, 'SiteVisit', 'SITE_VISIT');
  if (scope.type === 'ALL') return true;
  if (sv.assigneeId === scope.userId || sv.creatorId === scope.userId) return true;
  return canAccessLeadId(user, sv.leadId);
}

export async function canAccessQuotation(
  user: AuthUserLike,
  q: { id: string; tenantId: string; leadId: string | null; opportunityId: string | null },
): Promise<boolean> {
  if (q.tenantId !== user.tenantId) return false;
  const scope = await getRecordScope(user, 'Quotation', 'QUOTATION');
  if (scope.type === 'ALL') return true;
  if (q.leadId && (await canAccessLeadId(user, q.leadId))) return true;
  if (q.opportunityId) {
    const opp = await prisma.opportunity.findFirst({
      where: { id: q.opportunityId, tenantId: user.tenantId },
      select: { id: true, tenantId: true, ownerId: true, creatorId: true, leadId: true },
    });
    if (opp && (await canAccessOpportunity(user, opp))) return true;
  }
  return false;
}

export async function canAccessTask(
  user: AuthUserLike,
  task: { id: string; tenantId: string; ownerId: string | null; leadId: string | null },
): Promise<boolean> {
  if (task.tenantId !== user.tenantId) return false;
  const scope = await getRecordScope(user, 'Task', 'TASK');
  if (scope.type === 'ALL') return true;
  if (task.ownerId === scope.userId) return true;
  if (task.leadId) return canAccessLeadId(user, task.leadId);
  return false;
}

export async function canAccessFollowUp(
  user: AuthUserLike,
  fu: { id: string; tenantId: string; ownerId: string | null; leadId: string | null },
): Promise<boolean> {
  if (fu.tenantId !== user.tenantId) return false;
  const scope = await getRecordScope(user, 'FollowUp', 'FOLLOW_UP');
  if (scope.type === 'ALL') return true;
  if (fu.ownerId === scope.userId) return true;
  if (fu.leadId) return canAccessLeadId(user, fu.leadId);
  return false;
}

export async function canAccessActivity(
  user: AuthUserLike,
  activity: { id: string; tenantId: string; userId: string | null; leadId: string | null },
): Promise<boolean> {
  if (activity.tenantId !== user.tenantId) return false;
  const scope = await getRecordScope(user, 'Activity', 'ACTIVITY');
  if (scope.type === 'ALL') return true;
  if (activity.userId === scope.userId) return true;
  if (activity.leadId) return canAccessLeadId(user, activity.leadId);
  return false;
}

/** Merge a base where object with an optional scope clause using AND. */
export function withScope(
  where: Record<string, unknown>,
  scopeClause: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!scopeClause) return where;
  return { AND: [where, scopeClause] };
}

export type RecordKind =
  | 'lead'
  | 'siteVisit'
  | 'opportunity'
  | 'booking'
  | 'quotation'
  | 'payment'
  | 'task'
  | 'followUp'
  | 'activity';

const builders: Record<
  RecordKind,
  (scope: RecordScope) => Record<string, unknown> | null
> = {
  lead: leadScopeClause,
  siteVisit: (scope) => {
    if (scope.type === 'ALL') return null;
    return {
      OR: [
        { assigneeId: scope.userId },
        { creatorId: scope.userId },
        { lead: leadScopeClause(scope) },
      ],
    };
  },
  opportunity: (scope) => {
    if (scope.type === 'ALL') return null;
    return {
      OR: [
        { ownerId: scope.userId },
        { creatorId: scope.userId },
        { lead: leadScopeClause(scope) },
      ],
    };
  },
  booking: (scope) => {
    if (scope.type === 'ALL') return null;
    return {
      OR: [
        { ownerId: scope.userId },
        { creatorId: scope.userId },
        { lead: leadScopeClause(scope) },
      ],
    };
  },
  quotation: (scope) => {
    if (scope.type === 'ALL') return null;
    return {
      OR: [
        { lead: leadScopeClause(scope) },
        {
          opportunity: {
            OR: [
              { ownerId: scope.userId },
              { creatorId: scope.userId },
              { lead: leadScopeClause(scope) },
            ],
          },
        },
      ],
    };
  },
  payment: (scope) => {
    if (scope.type === 'ALL') return null;
    return {
      booking: {
        OR: [
          { ownerId: scope.userId },
          { creatorId: scope.userId },
          { lead: leadScopeClause(scope) },
        ],
      },
    };
  },
  task: (scope) => {
    if (scope.type === 'ALL') return null;
    return {
      OR: [{ ownerId: scope.userId }, { lead: leadScopeClause(scope) }],
    };
  },
  followUp: (scope) => {
    if (scope.type === 'ALL') return null;
    return {
      OR: [{ ownerId: scope.userId }, { lead: leadScopeClause(scope) }],
    };
  },
  activity: (scope) => {
    if (scope.type === 'ALL') return null;
    return {
      OR: [{ userId: scope.userId }, { lead: leadScopeClause(scope) }],
    };
  },
};

export async function getScopeClause(
  user: AuthUserLike,
  kind: RecordKind,
): Promise<Record<string, unknown> | null> {
  // Payment visibility was tenant-wide for Finance/CRM; Sales is owner-scoped
  // to the booking relationship, matching the rest of the Sales workflow.
  if (kind === 'payment' && user.profileName !== 'Sales') return null;

  const meta: Record<RecordKind, { objectName: string; moduleName: string }> = {
    lead: { objectName: 'Lead', moduleName: 'LEAD' },
    siteVisit: { objectName: 'SiteVisit', moduleName: 'SITE_VISIT' },
    opportunity: { objectName: 'Opportunity', moduleName: 'OPPORTUNITY' },
    booking: { objectName: 'Booking', moduleName: 'BOOKING' },
    quotation: { objectName: 'Quotation', moduleName: 'QUOTATION' },
    payment: { objectName: 'Payment', moduleName: 'PAYMENT' },
    task: { objectName: 'Task', moduleName: 'TASK' },
    followUp: { objectName: 'FollowUp', moduleName: 'FOLLOW_UP' },
    activity: { objectName: 'Activity', moduleName: 'ACTIVITY' },
  };
  const scope = await getRecordScope(user, meta[kind].objectName, meta[kind].moduleName);
  return builders[kind](scope);
}

/** Apply scope into a where clause with AND (preserves existing AND arrays). */
export function applyScope(
  where: Record<string, unknown>,
  scopeClause: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!scopeClause) return where;
  const existing = where.AND;
  if (Array.isArray(existing)) {
    return { ...where, AND: [...existing, scopeClause] };
  }
  return { ...where, AND: [scopeClause] };
}

/** Force report showMe for OWNER-scoped users. Frontend cannot override. */
export async function resolveReportShowMe(
  user: AuthUserLike,
  requested: unknown,
): Promise<'all' | 'mine'> {
  const scope = await getLeadRecordScope(user);
  if (scope.type === 'OWNER') return 'mine';
  return requested === 'mine' ? 'mine' : 'all';
}

export type RecordAction = 'read' | 'edit' | 'delete';

function requiredShareLevel(action: RecordAction) {
  return action === 'read' ? undefined : 'EDIT';
}

export async function getOpportunityVisibilityFilter(
  tenantId: string,
  userId: string,
  action: RecordAction,
): Promise<Record<string, any>> {
  const [user, sharingSetting, roles, users, shares, teamMembers] = await Promise.all([
    prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { isSuperAdmin: true, profile: { select: { isAdmin: true } }, roleId: true },
    }),
    prisma.objectSharingSetting.findFirst({
      where: {
        tenantId,
        object: { name: { equals: 'Opportunity', mode: 'insensitive' } },
      },
      select: { sharingModel: true },
    }),
    prisma.role.findMany({
      where: { tenantId },
      select: { id: true, parentRoleId: true },
    }),
    prisma.user.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, roleId: true, roles: { select: { roleId: true } } },
    }),
    prisma.recordShare.findMany({
      where: {
        tenantId,
        userId,
        objectName: { equals: 'Opportunity', mode: 'insensitive' },
        ...(requiredShareLevel(action) ? { accessLevel: 'EDIT' } : {}),
      },
      select: { recordId: true },
    }),
    prisma.recordTeamMember.findMany({
      where: {
        tenantId,
        userId,
        objectName: { equals: 'Opportunity', mode: 'insensitive' },
        ...(requiredShareLevel(action) ? { accessLevel: 'EDIT' } : {}),
      },
      select: { recordId: true },
    }),
  ]);

  if (!user || user.isSuperAdmin || user.profile?.isAdmin) return { tenantId };

  const sharingModel = sharingSetting?.sharingModel || 'PRIVATE';
  if (action === 'read' && sharingModel !== 'PRIVATE') return { tenantId };
  if (action !== 'read' && sharingModel === 'PUBLIC_READ_WRITE') return { tenantId };

  const userRoleIds = new Set<string>([
    ...(user.roleId ? [user.roleId] : []),
    ...users.find((candidate) => candidate.id === userId)?.roles.map((role) => role.roleId) || [],
  ]);

  const descendantRoleIds = new Set(userRoleIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const role of roles) {
      if (role.parentRoleId && descendantRoleIds.has(role.parentRoleId) && !descendantRoleIds.has(role.id)) {
        descendantRoleIds.add(role.id);
        changed = true;
      }
    }
  }

  const visibleOwnerIds = users
    .filter((candidate) => {
      const candidateRoles = new Set<string>([
        ...(candidate.roleId ? [candidate.roleId] : []),
        ...candidate.roles.map((role) => role.roleId),
      ]);
      return [...candidateRoles].some((roleId) => descendantRoleIds.has(roleId));
    })
    .map((candidate) => candidate.id);

  const sharedRecordIds = [...new Set([...shares, ...teamMembers].map((item) => item.recordId))];
  const accessConditions: Record<string, any>[] = [
    { ownerId: { in: visibleOwnerIds.length ? visibleOwnerIds : [userId] } },
  ];
  if (sharedRecordIds.length) accessConditions.push({ id: { in: sharedRecordIds } });

  return { tenantId, OR: accessConditions };
}