import express from 'express';
import type { Server } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  taskCreate: vi.fn(),
  taskCount: vi.fn(),
  taskFindFirst: vi.fn(),
  taskFindMany: vi.fn(),
  taskUpdate: vi.fn(),
  userFindFirst: vi.fn(),
  leadFindFirst: vi.fn(),
  siteVisitFindFirst: vi.fn(),
  opportunityFindFirst: vi.fn(),
  bookingFindFirst: vi.fn(),
  projectFindFirst: vi.fn(),
  unitFindFirst: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@dct-crm/db', () => ({
  prisma: {
    task: {
      create: database.taskCreate,
      count: database.taskCount,
      findFirst: database.taskFindFirst,
      findMany: database.taskFindMany,
      update: database.taskUpdate,
    },
    user: { findFirst: database.userFindFirst },
    lead: { findFirst: database.leadFindFirst },
    siteVisit: { findFirst: database.siteVisitFindFirst },
    opportunity: { findFirst: database.opportunityFindFirst },
    booking: { findFirst: database.bookingFindFirst },
    project: { findFirst: database.projectFindFirst },
    unit: { findFirst: database.unitFindFirst },
    auditLog: { create: database.auditCreate },
    $transaction: database.transaction,
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = {
      id: 'user-a',
      tenantId: 'tenant-a',
      isSuperAdmin: false,
      profileName: 'Sales',
    };
    req.tenantId = 'tenant-a';
    next();
  },
}));

vi.mock('../middleware/authorization', () => ({
  authorize: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../services/recordAccess', () => ({
  applyScope: (where: Record<string, unknown>) => where,
  canAccessBooking: vi.fn().mockResolvedValue(true),
  canAccessLeadId: vi.fn().mockResolvedValue(true),
  canAccessOpportunity: vi.fn().mockResolvedValue(true),
  canAccessSiteVisit: vi.fn().mockResolvedValue(true),
  canAccessTask: vi.fn().mockResolvedValue(true),
  getScopeClause: vi.fn().mockResolvedValue(null),
}));

vi.mock('../services/leadWorkflowExtras', () => ({
  promoteNewLeadOnFirstActivity: vi.fn().mockResolvedValue(undefined),
}));

import { taskRoutes } from './tasks';

const servers: Server[] = [];

async function postTask(body: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use('/api/tasks', taskRoutes);
  const server = app.listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return fetch(`http://127.0.0.1:${address.port}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function updateTaskStatus(status: unknown) {
  const app = express();
  app.use(express.json());
  app.use('/api/tasks', taskRoutes);
  const server = app.listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return fetch(`http://127.0.0.1:${address.port}/api/tasks/task-a/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  database.userFindFirst.mockResolvedValue({ id: 'user-a' });
  database.leadFindFirst.mockResolvedValue({ id: 'lead-a' });
  database.siteVisitFindFirst.mockResolvedValue(null);
  database.opportunityFindFirst.mockResolvedValue(null);
  database.bookingFindFirst.mockResolvedValue(null);
  database.projectFindFirst.mockResolvedValue({ id: 'project-a' });
  database.unitFindFirst.mockResolvedValue(null);
  database.taskCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
    id: 'task-a',
    ...data,
  }));
  database.transaction.mockImplementation((callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      task: { create: database.taskCreate },
      auditLog: { create: database.auditCreate },
    }),
  );
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe('Salesforce Task fields', () => {
  type TaskResponseBody = { data?: Record<string, unknown>; error?: string };

  it('persists supplied Task fields and resolves supported local relationships', async () => {
    const response = await postTask({
      title: 'Call customer',
      subject: 'Call customer',
      description: 'Discuss the site visit',
      dueDate: '2026-10-12',
      salesforceStatus: 'In progress',
      salesforcePriority: 'High',
      leadId: 'lead-a',
      projectId: 'project-a',
      callDurationInSeconds: 360,
      callObject: 'provider-call-1',
      callDisposition: 'Connected',
      callType: 'Outbound',
      isRecurrence: true,
      recurrenceInterval: 7,
      email: 'customer@example.com',
      phone: '+911234567890',
      isVisibleInSelfService: true,
      isReminderSet: true,
      recurrenceRegeneratedType: 'AfterDueDate',
      taskSubtype: 'Call',
      taskType: 'Sales',
    });
    const body = await response.json() as TaskResponseBody;

    expect(response.status).toBe(201);
    expect(body.data).toMatchObject({
      ownerId: 'user-a',
      createdById: 'user-a',
      lastModifiedById: 'user-a',
      title: 'Call customer',
      subject: 'Call customer',
      salesforceStatus: 'In progress',
      salesforcePriority: 'High',
      leadId: 'lead-a',
      projectId: 'project-a',
      callDurationInSeconds: 360,
      callDisposition: 'Connected',
      isRecurrence: true,
      recurrenceInterval: 7,
      isVisibleInSelfService: true,
      isReminderSet: true,
    });
    expect(database.projectFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'project-a', tenantId: 'tenant-a', isActive: true },
    }));
  });

  it('rejects a related record from another tenant before writing the task', async () => {
    database.projectFindFirst.mockResolvedValue(null);
    const response = await postTask({
      title: 'Call customer',
      description: 'Discuss the site visit',
      dueDate: '2026-10-12',
      projectId: 'project-from-other-tenant',
    });
    const body = await response.json() as TaskResponseBody;

    expect(response.status).toBe(400);
    expect(body.error).toContain('Linked Project');
    expect(database.taskCreate).not.toHaveBeenCalled();
  });

  it('requires Status, Name, and Related To for Salesforce-shaped task creation', async () => {
    const response = await postTask({
      title: 'Call customer',
      subject: 'Call customer',
      dueDate: '2026-10-12',
      description: '',
    });
    const body = await response.json() as TaskResponseBody;

    expect(response.status).toBe(400);
    expect(body.error).toBe('Salesforce Status is required');
    expect(database.taskCreate).not.toHaveBeenCalled();
  });

  it('rejects invalid status values without changing the task', async () => {
    const response = await updateTaskStatus('NOT_A_STATUS');
    const body = await response.json() as TaskResponseBody;

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid task status');
    expect(database.taskFindFirst).not.toHaveBeenCalled();
    expect(database.taskUpdate).not.toHaveBeenCalled();
  });

  it('clears completedAt when a completed task is reopened', async () => {
    database.taskFindFirst.mockResolvedValue({
      id: 'task-a',
      tenantId: 'tenant-a',
      ownerId: 'user-a',
      leadId: null,
      status: 'COMPLETED',
      completedAt: new Date('2026-10-10T00:00:00.000Z'),
    });
    database.taskUpdate.mockResolvedValue({ id: 'task-a', status: 'PENDING', completedAt: null });

    const response = await updateTaskStatus('PENDING');

    expect(response.status).toBe(200);
    expect(database.taskUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PENDING', completedAt: null }),
    }));
  });
});
