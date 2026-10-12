import express from 'express';
import type { Server } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  processLeadEnquiryBatch: vi.fn(),
  getObjectDefinition: vi.fn(),
  getFieldDefinitions: vi.fn(),
}));

vi.mock('@dct-crm/db', () => ({ prisma: {} }));
vi.mock('../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'import-user', tenantId: 'tenant-a', profileName: 'Admin' };
    req.tenantId = 'tenant-a';
    next();
  },
}));
vi.mock('../middleware/permissions', () => ({
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../services/dynamicCrud', () => ({
  bulkCreateRecords: vi.fn(),
  listRecords: vi.fn(),
}));
vi.mock('../services/metadata', () => ({
  getObjectDefinition: mocks.getObjectDefinition,
  getFieldDefinitions: mocks.getFieldDefinitions,
}));
vi.mock('../services/enquiryProcessing', () => ({
  processLeadEnquiry: vi.fn(),
  processLeadEnquiryBatch: mocks.processLeadEnquiryBatch,
  sourceEnumValue: (source: string) => source,
}));

import { dataAdministrationRoutes } from './dataAdministration';

const servers: Server[] = [];

async function importLeads(csv: string) {
  const app = express();
  app.use(express.json());
  app.use('/api/data', dataAdministrationRoutes);
  const server = app.listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return fetch(`http://127.0.0.1:${address.port}/api/data/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      objectName: 'Lead',
      fields: ['firstName', 'lastName', 'phone', 'source'],
      csv,
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getObjectDefinition.mockResolvedValue({ id: 'lead-object' });
  mocks.getFieldDefinitions.mockResolvedValue(
    ['firstName', 'lastName', 'phone', 'source'].map((name) => ({
      name,
      required: false,
      isActive: true,
      isSystemField: false,
      fieldType: 'text',
    })),
  );
  mocks.processLeadEnquiryBatch.mockResolvedValue([
    { action: 'NEW_LEAD', leadId: 'lead-a', lead: { id: 'lead-a' }, enquiry: { id: 'enquiry-a' } },
    { action: 'EXISTING_ACTIVE', leadId: 'lead-b', lead: { id: 'lead-b' }, enquiry: { id: 'enquiry-b' } },
  ]);
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe('POST /api/data/import Lead batching', () => {
  it('submits all rows to one transactional batch operation and reports linked enquiries', async () => {
    const response = await importLeads(
      'firstName,lastName,phone,source\nNew,Unique,9876543210,WEBSITE\nExisting,Duplicate,9876543211,REFERRAL',
    );

    expect(response.status).toBe(201);
    expect(mocks.processLeadEnquiryBatch).toHaveBeenCalledOnce();
    expect(mocks.processLeadEnquiryBatch.mock.calls[0][0]).toHaveLength(2);
    expect(await response.json()).toMatchObject({
      success: true,
      data: { count: 1, linkedEnquiries: 1 },
    });
  });

  it('reports a conflicting row as rolled back rather than claiming earlier rows persisted', async () => {
    mocks.processLeadEnquiryBatch.mockRejectedValue(
      Object.assign(new Error('DUPLICATE_CONFLICT'), { rowIndex: 1, leadIds: ['lead-a', 'lead-b'] }),
    );
    const response = await importLeads(
      'firstName,lastName,phone,source\nFirst,Unique,9876543210,WEBSITE\nOther,Ambiguous,9876543211,REFERRAL',
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      success: false,
      action: 'DUPLICATE_CONFLICT',
      row: 3,
      importedCount: 0,
    });
  });
});
