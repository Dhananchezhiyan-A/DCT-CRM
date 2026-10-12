import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { getNextFollowUpNumber } from './followUpService';

describe('getNextFollowUpNumber', () => {
  it('creates tenant-scoped, six-digit follow-up numbers', async () => {
    const upsert = vi.fn().mockResolvedValue({ nextValue: 1 });
    const db = { sequence: { upsert } } as unknown as Prisma.TransactionClient;

    await expect(getNextFollowUpNumber(db, 'tenant-1')).resolves.toBe('F-000001');
    expect(upsert).toHaveBeenCalledWith({
      where: { tenantId_type: { tenantId: 'tenant-1', type: 'FOLLOW_UP' } },
      update: { nextValue: { increment: 1 } },
      create: { tenantId: 'tenant-1', type: 'FOLLOW_UP', nextValue: 1 },
    });
  });

  it('keeps numbers longer than six digits intact', async () => {
    const db = { sequence: { upsert: vi.fn().mockResolvedValue({ nextValue: 266162 }) } } as unknown as Prisma.TransactionClient;

    await expect(getNextFollowUpNumber(db, 'tenant-1')).resolves.toBe('F-266162');
  });
});
