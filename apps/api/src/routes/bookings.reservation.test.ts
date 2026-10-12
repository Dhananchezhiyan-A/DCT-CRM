import express from 'express';
import type { Server } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  projectFindFirst: vi.fn(),
  unitFindFirst: vi.fn(),
  unitUpdateMany: vi.fn(),
  bookingCreate: vi.fn(),
  auditLogCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@dct-crm/db', () => ({
  prisma: {
    project: { findFirst: database.projectFindFirst },
    unit: { findFirst: database.unitFindFirst },
    booking: { create: database.bookingCreate },
    auditLog: { create: database.auditLogCreate },
    $transaction: database.transaction,
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'sales-a', tenantId: 'tenant-a', isSuperAdmin: false };
    next();
  },
}));

vi.mock('../middleware/authorization', () => ({
  authorize: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../middleware/audit', () => ({ auditLog: vi.fn() }));
vi.mock('../services/recordAccess', () => ({
  applyScope: (where: unknown) => where,
  canAccessBooking: vi.fn().mockResolvedValue(true),
  canAccessLeadId: vi.fn().mockResolvedValue(true),
  canAccessOpportunity: vi.fn().mockResolvedValue(true),
  canAccessQuotation: vi.fn().mockResolvedValue(true),
  getScopeClause: vi.fn().mockResolvedValue(null),
}));

import bookingsRouter from './bookings';

const servers: Server[] = [];
const transactionClient = {
  unit: { updateMany: database.unitUpdateMany },
  booking: { create: database.bookingCreate },
  auditLog: { create: database.auditLogCreate },
};

async function createBooking(body: unknown) {
  const app = express();
  app.use(express.json());
  app.use('/api/bookings', bookingsRouter);
  const server = app.listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return fetch(`http://127.0.0.1:${address.port}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  database.projectFindFirst.mockResolvedValue({ id: 'project-a' });
  database.unitFindFirst.mockResolvedValue({ id: 'unit-a' });
  database.unitUpdateMany.mockResolvedValue({ count: 1 });
  database.bookingCreate.mockResolvedValue({
    id: 'booking-a',
    number: 'BK-001',
    status: 'PENDING',
    totalAmount: 100,
    unit: { id: 'unit-a', number: '101' },
    project: { id: 'project-a', name: 'Project A' },
  });
  database.auditLogCreate.mockResolvedValue({});
  database.transaction.mockImplementation((callback: (tx: typeof transactionClient) => unknown) => callback(transactionClient));
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe('booking unit reservation', () => {
  it('reserves the unit as soon as a pending booking is created', async () => {
    const response = await createBooking({
      projectId: 'project-a',
      unitId: 'unit-a',
      totalAmount: 100,
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({ success: true, data: { status: 'PENDING' } });
    expect(database.unitUpdateMany).toHaveBeenCalledWith({
      where: { id: 'unit-a', tenantId: 'tenant-a', projectId: 'project-a', status: 'AVAILABLE' },
      data: { status: 'RESERVED' },
    });
  });

  it('does not create a booking if another request already reserved the unit', async () => {
    database.unitUpdateMany.mockResolvedValue({ count: 0 });

    const response = await createBooking({
      projectId: 'project-a',
      unitId: 'unit-a',
      totalAmount: 100,
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({ success: false, error: 'Unit is no longer available; refresh inventory and retry' });
    expect(database.bookingCreate).not.toHaveBeenCalled();
  });
});
