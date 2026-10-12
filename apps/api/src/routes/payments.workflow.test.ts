import express from 'express';
import type { Server } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  bookingFindFirst: vi.fn(),
  paymentFindFirst: vi.fn(),
  paymentAggregate: vi.fn(),
  paymentCreate: vi.fn(),
  paymentAllocationCount: vi.fn(),
  receiptFindUnique: vi.fn(),
  auditLogCreate: vi.fn(),
  transaction: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock('@dct-crm/db', () => ({
  prisma: {
    booking: { findFirst: database.bookingFindFirst },
    payment: {
      findFirst: database.paymentFindFirst,
      aggregate: database.paymentAggregate,
      create: database.paymentCreate,
    },
    paymentAllocation: { count: database.paymentAllocationCount },
    receipt: { findUnique: database.receiptFindUnique },
    auditLog: { create: database.auditLogCreate },
    $transaction: database.transaction,
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'finance-a', tenantId: 'tenant-a', isSuperAdmin: false };
    next();
  },
}));

vi.mock('../middleware/authorization', () => ({
  authorize: () => (_req: any, _res: any, next: any) => next(),
  authorizeEffectivePermission: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../middleware/audit', () => ({ auditLog: vi.fn() }));
vi.mock('../services/recordAccess', () => ({
  applyScope: (where: unknown) => where,
  canAccessBooking: vi.fn().mockResolvedValue(true),
  getScopeClause: vi.fn().mockResolvedValue(null),
}));

import paymentsRouter from './payments';

const servers: Server[] = [];
const transactionClient = {
  $queryRaw: database.queryRaw,
  booking: { findFirst: database.bookingFindFirst },
  payment: {
    aggregate: database.paymentAggregate,
    create: database.paymentCreate,
  },
  auditLog: { create: database.auditLogCreate },
};

async function requestPayment(method: 'POST' | 'DELETE', path: string, body?: unknown) {
  const app = express();
  app.use(express.json());
  app.use('/api/payments', paymentsRouter);
  const server = app.listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return fetch(`http://127.0.0.1:${address.port}/api/payments${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  database.bookingFindFirst.mockResolvedValue({
    id: 'booking-a',
    tenantId: 'tenant-a',
    ownerId: 'finance-a',
    creatorId: 'finance-a',
    leadId: 'lead-a',
    status: 'CONFIRMED',
    totalAmount: 100,
  });
  database.paymentAggregate.mockResolvedValue({ _sum: { amount: 0 } });
  database.paymentCreate.mockResolvedValue({
    id: 'payment-a',
    amount: 25,
    status: 'PENDING',
    booking: { id: 'booking-a', number: 'BK-001' },
  });
  database.auditLogCreate.mockResolvedValue({});
  database.queryRaw.mockResolvedValue([]);
  database.transaction.mockImplementation((callback: (tx: typeof transactionClient) => unknown) => callback(transactionClient));
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe('payment financial safeguards', () => {
  it('records a new payment as pending', async () => {
    const response = await requestPayment('POST', '/', { bookingId: 'booking-a', amount: 25 });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({ success: true, data: { status: 'PENDING' } });
    expect(database.paymentCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: 'tenant-a', amount: 25, status: 'PENDING' }),
    }));
  });

  it('rejects a payment that would exceed the remaining booking amount', async () => {
    database.paymentAggregate.mockResolvedValue({ _sum: { amount: 90 } });

    const response = await requestPayment('POST', '/', { bookingId: 'booking-a', amount: 15 });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ success: false, error: 'Payment exceeds the remaining booking amount' });
    expect(database.paymentCreate).not.toHaveBeenCalled();
  });

  it('does not allow a verified payment to be deleted', async () => {
    database.paymentFindFirst.mockResolvedValue({ id: 'payment-a', status: 'VERIFIED' });

    const response = await requestPayment('DELETE', '/payment-a');
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ success: false, error: 'Cannot delete a verified payment' });
    expect(database.paymentAllocationCount).not.toHaveBeenCalled();
  });
});
