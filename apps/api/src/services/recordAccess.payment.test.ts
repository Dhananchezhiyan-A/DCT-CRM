import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  userRoleFindMany: vi.fn(),
}));

vi.mock('@dct-crm/db', () => ({
  prisma: {
    userRole: { findMany: database.userRoleFindMany },
  },
}));

vi.mock('./effectivePermissions', () => ({
  EffectivePermissionService: {
    getEffectivePermissionsCached: vi.fn().mockResolvedValue([]),
    hasPermissionIn: vi.fn().mockReturnValue(false),
  },
}));

import { getScopeClause } from './recordAccess';

beforeEach(() => {
  vi.clearAllMocks();
  database.userRoleFindMany.mockResolvedValue([]);
});

describe('Payment record access', () => {
  it('limits Sales payment access to payments linked to bookings they can access', async () => {
    const scope = await getScopeClause(
      { id: 'sales-user', tenantId: 'tenant-a', profileName: 'Sales' },
      'payment',
    );

    expect(scope).toEqual({
      booking: {
        OR: [
          { ownerId: 'sales-user' },
          { creatorId: 'sales-user' },
          {
            lead: {
              OR: [
                { ownerId: 'sales-user' },
                {
                  siteVisits: {
                    some: {
                      status: 'SCHEDULED',
                      OR: [{ assigneeId: 'sales-user' }, { creatorId: 'sales-user' }],
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    });
  });

  it('retains unscoped payment access for admin users', async () => {
    await expect(
      getScopeClause(
        { id: 'admin-user', tenantId: 'tenant-a', isAdmin: true },
        'payment',
      ),
    ).resolves.toBeNull();
  });

  it('preserves existing tenant-wide Payment read behavior for Finance', async () => {
    await expect(
      getScopeClause(
        { id: 'finance-user', tenantId: 'tenant-a', profileName: 'Finance' },
        'payment',
      ),
    ).resolves.toBeNull();
  });
});