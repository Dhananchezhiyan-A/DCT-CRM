import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { EffectivePermissionService } from '../services/effectivePermissions';
import { canAccessBooking, canAccessLead, canAccessOpportunity } from '../services/recordAccess';

const router = Router();

router.use(authenticate);

const noteSchema = z.object({
  note: z.string().trim().min(1, 'Note cannot be empty.').max(5000, 'Note must be 5000 characters or fewer.'),
});

type NoteRecord =
  | {
      type: 'Lead';
      id: string;
      tenantId: string;
      notes: string | null;
      ownerId: string | null;
      creatorId: string;
    }
  | {
      type: 'Booking';
      id: string;
      tenantId: string;
      notes: string | null;
      ownerId: string | null;
      creatorId: string | null;
      leadId: string | null;
    }
  | {
      type: 'Opportunity';
      id: string;
      tenantId: string;
      notes: string | null;
      ownerId: string | null;
      creatorId: string;
      leadId: string | null;
    };

async function findNoteRecord(recordId: string, user: NonNullable<AuthRequest['user']>): Promise<NoteRecord | null> {
  const tenantScope = user.isSuperAdmin ? {} : { tenantId: user.tenantId };
  const [lead, booking, opportunity] = await Promise.all([
    prisma.lead.findFirst({
      where: { id: recordId, ...tenantScope },
      select: { id: true, tenantId: true, notes: true, ownerId: true, creatorId: true },
    }),
    prisma.booking.findFirst({
      where: { id: recordId, ...tenantScope },
      select: { id: true, tenantId: true, notes: true, ownerId: true, creatorId: true, leadId: true },
    }),
    prisma.opportunity.findFirst({
      where: { id: recordId, ...tenantScope },
      select: { id: true, tenantId: true, notes: true, ownerId: true, creatorId: true, leadId: true },
    }),
  ]);

  if ([lead, booking, opportunity].filter(Boolean).length > 1) return null;
  if (lead) return { type: 'Lead', ...lead };
  if (booking) return { type: 'Booking', ...booking };
  if (opportunity) return { type: 'Opportunity', ...opportunity };
  return null;
}

async function hasNotePermission(
  user: NonNullable<AuthRequest['user']>,
  record: NoteRecord,
  action: 'READ' | 'UPDATE',
): Promise<boolean> {
  if (user.isSuperAdmin) return true;
  const permissions = await EffectivePermissionService.getEffectivePermissionsCached(user, user.id);
  const moduleName = record.type === 'Lead' ? 'LEAD' : record.type === 'Booking' ? 'BOOKING' : 'OPPORTUNITY';
  return EffectivePermissionService.hasPermissionIn(permissions, `${moduleName}_${action}`);
}

async function canAccessNoteRecord(user: NonNullable<AuthRequest['user']>, record: NoteRecord): Promise<boolean> {
  if (user.isSuperAdmin) return true;
  if (record.type === 'Lead') return canAccessLead(user, record);
  if (record.type === 'Booking') return canAccessBooking(user, record);
  return canAccessOpportunity(user, record);
}

function formatIndiaTimestamp(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    month: 'long',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${value('month')} ${value('day')}, ${value('year')} ${value('hour')}:${value('minute')}:${value('second')} ${value('dayPeriod')}`;
}

function appendNote(existingNotes: string | null, author: string, note: string): { notes: string; number: number } {
  const history = existingNotes || '';
  const numbers = Array.from(history.matchAll(/\bNote\s+(\d+):/gi), (match) => Number(match[1]));
  const number = Math.max(0, ...numbers) + 1;
  const entry = `Note ${number}: (${author}) - (${formatIndiaTimestamp(new Date())}):\n${note}`;
  return { notes: history ? `${history}\n\n${entry}` : entry, number };
}

router.get('/:recordId', async (req: AuthRequest, res: Response) => {
  try {
    const record = await findNoteRecord(req.params.recordId, req.user!);
    if (!record) return res.status(404).json({ success: false, error: 'Record not found' });
    if (!(await hasNotePermission(req.user!, record, 'READ'))) {
      return res.status(403).json({ success: false, error: `Insufficient permissions for ${record.type}:read` });
    }
    if (!(await canAccessNoteRecord(req.user!, record))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this record' });
    }

    res.json({ success: true, data: { notes: record.notes || '' } });
  } catch (error) {
    console.error('Get record notes error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch notes' });
  }
});

router.post('/:recordId', async (req: AuthRequest, res: Response) => {
  try {
    const { note } = noteSchema.parse(req.body);
    const record = await findNoteRecord(req.params.recordId, req.user!);
    if (!record) return res.status(404).json({ success: false, error: 'Record not found' });
    if (!(await hasNotePermission(req.user!, record, 'UPDATE'))) {
      return res.status(403).json({ success: false, error: `Insufficient permissions for ${record.type}:edit` });
    }
    if (!(await canAccessNoteRecord(req.user!, record))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this record' });
    }

    const author = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { firstName: true, lastName: true },
    });
    if (!author) return res.status(401).json({ success: false, error: 'Authenticated user not found' });
    const authorName = [author.firstName, author.lastName].filter(Boolean).join(' ') || 'CRM User';

    const result = await prisma.$transaction(async (tx) => {
      if (record.type === 'Lead') {
        await tx.$queryRaw`SELECT "id" FROM "Lead" WHERE "id" = ${record.id} AND "tenantId" = ${record.tenantId} FOR UPDATE`;
        const current = await tx.lead.findFirst({
          where: { id: record.id, tenantId: record.tenantId },
          select: { notes: true },
        });
        if (!current) throw new Error('Note record no longer exists');
        const updated = appendNote(current.notes, authorName, note);
        await tx.lead.update({ where: { id: record.id }, data: { notes: updated.notes } });
        return updated;
      }

      if (record.type === 'Booking') {
        await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${record.id} AND "tenantId" = ${record.tenantId} FOR UPDATE`;
        const current = await tx.booking.findFirst({
          where: { id: record.id, tenantId: record.tenantId },
          select: { notes: true },
        });
        if (!current) throw new Error('Note record no longer exists');
        const updated = appendNote(current.notes, authorName, note);
        await tx.booking.update({ where: { id: record.id }, data: { notes: updated.notes } });
        return updated;
      }

      await tx.$queryRaw`SELECT "id" FROM "Opportunity" WHERE "id" = ${record.id} AND "tenantId" = ${record.tenantId} FOR UPDATE`;
      const current = await tx.opportunity.findFirst({
        where: { id: record.id, tenantId: record.tenantId },
        select: { notes: true },
      });
      if (!current) throw new Error('Note record no longer exists');
      const updated = appendNote(current.notes, authorName, note);
      await tx.opportunity.update({ where: { id: record.id }, data: { notes: updated.notes } });
      return updated;
    });

    res.json({ success: true, data: { notes: result.notes, number: result.number } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.issues[0]?.message || 'Invalid note' });
    }
    console.error('Save record note error:', error);
    res.status(500).json({ success: false, error: 'Unable to save note. Please try again.' });
  }
});

export default router;
