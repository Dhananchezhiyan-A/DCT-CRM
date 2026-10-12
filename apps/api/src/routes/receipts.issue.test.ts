import express from 'express';
import type { NextFunction, Request, Response as ExpressResponse } from 'express';
import type { Server } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  paymentFindFirst: vi.fn(),
  receiptFindFirst: vi.fn(),
  receiptCreate: vi.fn(),
  paymentFindMany: vi.fn(),
  bookingCount: vi.fn(),
  unitUpdateMany: vi.fn(),
  auditLogCreate: vi.fn(),
  queryRaw: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@dct-crm/db', () => ({
  prisma: {
    payment: { findFirst: database.paymentFindFirst },
    receipt: { findFirst: database.receiptFindFirst },
    $transaction: database.transaction,
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: Request, _res: ExpressResponse, next: NextFunction) => {
    Object.assign(req, { user: { id: 'finance-a', tenantId: 'tenant-a', isSuperAdmin: false } });
    next();
  },
}));

vi.mock('../middleware/authorization', () => ({
  authorize: () => (_req: Request, _res: ExpressResponse, next: NextFunction) => next(),
  authorizeEffectivePermission: () => (_req: Request, _res: ExpressResponse, next: NextFunction) => next(),
}));

vi.mock('../services/recordAccess', () => ({
  canAccessBooking: vi.fn().mockResolvedValue(true),
  getScopeClause: vi.fn().mockResolvedValue(null),
  applyScope: (where: unknown) => where,
}));

import receiptsRouter from './receipts';

const servers: Server[] = [];
const transactionClient = {
  $queryRaw: database.queryRaw,
  payment: {
    findFirst: database.paymentFindFirst,
    findMany: database.paymentFindMany,
  },
  booking: { count: database.bookingCount },
  unit: { updateMany: database.unitUpdateMany },
  receipt: { create: database.receiptCreate },
  auditLog: { create: database.auditLogCreate },
};

async function issueReceipt() {
  const app = express();
  app.use(express.json());
  app.use('/api/receipts', receiptsRouter);
  const server = app.listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return fetch(`http://127.0.0.1:${address.port}/api/receipts/payments/payment-a/issue`, {
    method: 'POST',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  database.paymentFindFirst.mockResolvedValue({
    id: 'payment-a',
    tenantId: 'tenant-a',
    status: 'COMPLETED',
    amount: 100,
    paymentDate: new Date('2026-10-12T00:00:00.000Z'),
    reference: 'PAY-001',
    notes: 'Payer: Customer A\nPayment mode: Bank Transfer',
    booking: {
      id: 'booking-a',
      projectId: 'project-a',
      status: 'PENDING',
      totalAmount: 100000,
      lead: { firstName: 'Customer', lastName: 'A' },
      project: { name: 'Project A', address: null, city: null, state: null },
      unit: { id: 'unit-a', number: 'U020', area: 1000, price: 100, status: 'AVAILABLE' },
      quotation: { id: 'quotation-a' },
    },
    tenant: { name: 'Company A' },
  });
  database.receiptFindFirst.mockResolvedValue(null);
  database.paymentFindMany.mockResolvedValue([{ amount: 100, receipt: null }]);
  database.receiptCreate.mockResolvedValue({
    id: 'receipt-a',
    receiptNumber: 'RCP-PAYMENT-A',
    amount: { toNumber: () => 100 },
  });
  database.bookingCount.mockResolvedValue(0);
  database.unitUpdateMany.mockResolvedValue({ count: 1 });
  database.auditLogCreate.mockResolvedValue({});
  database.queryRaw.mockResolvedValue([]);
  database.transaction.mockImplementation((callback: (tx: typeof transactionClient) => unknown) => callback(transactionClient));
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe('official receipt unit reservation', () => {
  it('marks the receipt booking unit BOOKED when issuing the official receipt', async () => {
    const response = await issueReceipt();
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({ success: true, data: { id: 'receipt-a' } });
    expect(database.unitUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'unit-a',
        tenantId: 'tenant-a',
        projectId: 'project-a',
        status: { in: ['AVAILABLE', 'RESERVED'] },
      },
      data: { status: 'BOOKED' },
    });
    expect(database.receiptCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        detailsSnapshot: expect.objectContaining({ balanceAfterReceipt: 99900 }),
      }),
    }));
  });

  it('does not issue a receipt if another active booking holds the unit', async () => {
    database.bookingCount.mockResolvedValue(1);

    const response = await issueReceipt();
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({ success: false, error: 'Another active booking already holds this unit' });
    expect(database.receiptCreate).not.toHaveBeenCalled();
  });
});
