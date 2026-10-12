import type { Prisma, PrismaClient } from '@prisma/client';

type Db = Prisma.TransactionClient | PrismaClient;

export async function getNextFollowUpNumber(db: Db, tenantId: string): Promise<string> {
  const sequence = await db.sequence.upsert({
    where: { tenantId_type: { tenantId, type: 'FOLLOW_UP' } },
    update: { nextValue: { increment: 1 } },
    create: { tenantId, type: 'FOLLOW_UP', nextValue: 1 },
  });

  return `F-${String(sequence.nextValue).padStart(6, '0')}`;
}
