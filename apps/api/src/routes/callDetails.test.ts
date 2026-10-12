import express from 'express';
import type { NextFunction, Request, Response as ExpressResponse } from 'express';
import type { Server } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  callDetailCreate: vi.fn(),
  auditLogCreate: vi.fn(),
  opportunityFindFirst: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@dct-crm/db', () => ({
  prisma: {
    $transaction: database.transaction,
    callDetail: { findMany: vi.fn() },
    opportunity: { findFirst: database.opportunityFindFirst },
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: Request, _res: ExpressResponse, next: NextFunction) => {
    Object.assign(req, { user: { id: 'user-a', tenantId: 'tenant-a', isSuperAdmin: false } });
    next();
  },
}));

vi.mock('../middleware/authorization', () => ({
  authorize: () => (_req: Request, _res: ExpressResponse, next: NextFunction) => next(),
}));

vi.mock('../services/recordAccess', () => ({
  canAccessLeadId: vi.fn().mockResolvedValue(true),
}));

import callDetailsRouter from './callDetails';

const transactionClient = {
  callDetail: { create: database.callDetailCreate },
  auditLog: { create: database.auditLogCreate },
};
const servers: Server[] = [];

async function createCall(body: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use('/api/call-details', callDetailsRouter);
  const server = app.listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return fetch(`http://127.0.0.1:${address.port}/api/call-details`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  database.callDetailCreate.mockResolvedValue({
    id: 'call-a',
    callType: 'OUTBOUND',
    startAt: new Date('2026-10-12T09:00:00.000Z'),
    endAt: new Date('2026-10-12T09:05:00.000Z'),
    notes: 'Discussed project',
    createdBy: { id: 'user-a', firstName: 'Test', lastName: 'User' },
  });
  database.auditLogCreate.mockResolvedValue({});
  database.opportunityFindFirst.mockResolvedValue({ id: 'opportunity-a' });
  database.transaction.mockImplementation((callback: (tx: typeof transactionClient) => unknown) => callback(transactionClient));
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe('lead call details', () => {
  it('creates an independent call record with type, times, and notes', async () => {
    const response = await createCall({
      leadId: 'lead-a',
      callType: 'OUTBOUND',
      callFrom: '+911234567890',
      callTo: '+919876543210',
      startAt: '2026-10-12T09:00:00.000Z',
      endAt: '2026-10-12T09:05:00.000Z',
      executiveContactNo: '+919876543210',
      landingNumber: 'Main line',
      opportunityId: 'opportunity-a',
      status: 'COMPLETED',
      parentId: 'lead-a',
      parentUrl: 'http://localhost:3000/leads/lead-a',
      recordingFile: 'https://example.com/call.mp3',
      notes: 'Discussed project',
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({ success: true, data: { id: 'call-a', callType: 'OUTBOUND', notes: 'Discussed project' } });
    expect(database.callDetailCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        leadId: 'lead-a',
        opportunityId: 'opportunity-a',
        createdById: 'user-a',
        callType: 'OUTBOUND',
        callFrom: '+911234567890',
        callTo: '+919876543210',
        duration: 300,
        executiveContactNo: '+919876543210',
        landingNumber: 'Main line',
        status: 'COMPLETED',
        parentId: 'lead-a',
        parentUrl: 'http://localhost:3000/leads/lead-a',
        recordingFile: 'https://example.com/call.mp3',
        notes: 'Discussed project',
      }),
    }));
    expect(database.auditLogCreate).toHaveBeenCalled();
  });

  it('rejects a call whose end time is not after its start time', async () => {
    const response = await createCall({
      leadId: 'lead-a',
      callType: 'INBOUND',
      startAt: '2026-10-12T09:05:00.000Z',
      endAt: '2026-10-12T09:00:00.000Z',
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ success: false, error: 'End time must be after start time' });
    expect(database.callDetailCreate).not.toHaveBeenCalled();
  });

  it('rejects an opportunity that is not associated with the lead', async () => {
    database.opportunityFindFirst.mockResolvedValueOnce(null);
    const response = await createCall({
      leadId: 'lead-a',
      opportunityId: 'opportunity-other',
      callType: 'OUTBOUND',
      startAt: '2026-10-12T09:00:00.000Z',
      endAt: '2026-10-12T09:05:00.000Z',
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ success: false, error: 'Opportunity must belong to this lead and company' });
    expect(database.callDetailCreate).not.toHaveBeenCalled();
  });
});
