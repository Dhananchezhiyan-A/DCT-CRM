import { Router, Response } from 'express';
import { parse } from 'csv-parse/sync';
import { prisma } from '@dct-crm/db';
import { leadCreateSchema } from '@dct-crm/shared';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { bulkCreateRecords, listRecords } from '../services/dynamicCrud';
import { getFieldDefinitions, getObjectDefinition } from '../services/metadata';
import {
  applyScope,
  getLeadRecordScope,
  getScopeClause,
  leadScopeClause,
} from '../services/recordAccess';
import {
  processLeadEnquiryBatch,
  sourceEnumValue,
  type LeadEnquiryInput,
} from '../services/enquiryProcessing';

const router = Router();
router.use(authenticate);

const STANDARD_EXPORT_MODELS: Record<string, string> = {
  lead: 'lead',
  sitevisit: 'siteVisit',
  opportunity: 'opportunity',
  quotation: 'quotation',
  booking: 'booking',
  payment: 'payment',
  project: 'project',
  unit: 'unit',
  task: 'task',
  followup: 'followUp',
  activity: 'activity',
};

const STANDARD_IMPORT_CONFIG: Record<string, { model: string; hasCreator: boolean }> = Object.fromEntries(
  Object.entries(STANDARD_EXPORT_MODELS).map(([name, model]) => [name, { model, hasCreator: ['lead', 'opportunity', 'quotation', 'booking', 'project', 'unit', 'task', 'followUp', 'activity'].includes(model) }])
);

function convertImportValue(value: string, fieldType: string) {
  if (value === '') return undefined;
  if (['number', 'integer', 'decimal', 'currency', 'percentage'].includes(fieldType)) return Number(value);
  if (fieldType === 'boolean') return ['true', '1', 'yes'].includes(value.trim().toLowerCase());
  if (fieldType === 'date' || fieldType === 'dateTime') return new Date(value);
  return value;
}

router.post('/import', requirePermission('DATA_IMPORT'), async (req: AuthRequest, res: Response) => {
  try {
    const { objectName, fields, csv } = req.body;
    if (typeof objectName !== 'string' || !objectName.trim()) {
      return res.status(400).json({ success: false, error: 'objectName is required' });
    }
    if (!Array.isArray(fields) || fields.length === 0 || fields.some((field) => typeof field !== 'string')) {
      return res.status(400).json({ success: false, error: 'At least one field is required' });
    }
    if (typeof csv !== 'string' || !csv.trim()) {
      return res.status(400).json({ success: false, error: 'CSV content is required' });
    }

    const object = await getObjectDefinition(req.tenantId!, objectName.trim());
    if (!object) return res.status(404).json({ success: false, error: 'Object not found' });
    const availableFields = (await getFieldDefinitions(req.tenantId!, object.id) as Array<{ name: string; required: boolean; isActive: boolean; isSystemField: boolean }>).filter((field) => field.isActive && !field.isSystemField);
    const availableNames = new Set(availableFields.map((field) => field.name));
    const invalidFields = fields.filter((field) => !availableNames.has(field));
    if (invalidFields.length > 0) {
      return res.status(400).json({ success: false, error: `Invalid fields: ${invalidFields.join(', ')}` });
    }
    const requiredFields = availableFields.filter((field) => field.required).map((field) => field.name);
    const missingRequired = requiredFields.filter((field) => !fields.includes(field));
    if (missingRequired.length > 0) {
      return res.status(400).json({ success: false, error: `Please select all required fields: ${missingRequired.join(', ')}` });
    }

    const rows = parse(csv, { columns: true, skip_empty_lines: true, bom: true, trim: true }) as Record<string, string>[];
    if (rows.length === 0) {
      return res.status(400).json({ success: false, error: 'CSV must contain at least one data row' });
    }
    if (rows.length > 1000) {
      return res.status(400).json({ success: false, error: 'Import is limited to 1,000 records per request' });
    }
    const csvFields = Object.keys(rows[0]);
    const missingCsvFields = fields.filter((field) => !csvFields.includes(field));
    if (missingCsvFields.length > 0) {
      return res.status(400).json({ success: false, error: `CSV is missing selected fields: ${missingCsvFields.join(', ')}` });
    }
    const emptyRequiredFields = requiredFields.filter((field) => rows.some((row) => !String(row[field] ?? '').trim()));
    if (emptyRequiredFields.length > 0) {
      return res.status(400).json({ success: false, error: `CSV contains empty required fields: ${emptyRequiredFields.join(', ')}` });
    }

    const records = rows.map((row) => Object.fromEntries(fields.map((field) => [field, row[field] ?? ''])));
    const standardConfig = STANDARD_IMPORT_CONFIG[objectName.trim().toLowerCase()];
    if (standardConfig) {
      const delegate = (prisma as any)[standardConfig.model];
      const fieldTypes = new Map(availableFields.map((field: any) => [field.name, field.fieldType]));
      const imported: any[] = [];

      if (standardConfig.model === 'lead') {
        const leadFields = new Set(Object.keys(leadCreateSchema.shape));
        const enquiryFields = new Set([
          'secondaryPhone', 'tertiaryPhone', 'secondaryEmail', 'tertiaryEmail',
          'originalSubmissionId', 'countryCode',
          'secondaryCountryCode', 'tertiaryCountryCode', 'subSource', 'campaignId',
          'campaign', 'subCampaignId', 'subCampaign', 'medium', 'enquiryDescription',
          'channelPartner', 'enquiryDate',
        ]);
        const inputs: LeadEnquiryInput[] = [];
        for (let index = 0; index < records.length; index += 1) {
          const row = records[index];
          const values: Record<string, unknown> = {};
          const customFields: Record<string, unknown> = {};
          for (const field of fields) {
            const value = convertImportValue(String(row[field] ?? ''), fieldTypes.get(field) || 'text');
            if (value === undefined) continue;
            if (leadFields.has(field)) values[field] = value;
            else if (!enquiryFields.has(field)) customFields[field] = value;
          }
          const source = typeof values.source === 'string' ? values.source : 'OTHER';
          const phone = typeof values.phone === 'string' ? values.phone : '';
          const countryCode = String(row.countryCode || row.phoneCountryCode || '91');
          const leadResult = leadCreateSchema.safeParse({
            ...values,
            source: sourceEnumValue(source),
            phone,
            company: values.company || [values.firstName, values.lastName].filter(Boolean).join(' '),
            customFields: { ...(values.customFields as Record<string, unknown> || {}), ...customFields },
          });
          if (!leadResult.success) {
            return res.status(400).json({
              success: false,
              error: `Import failed on row ${index + 2}: ${leadResult.error.issues[0]?.message || 'Invalid Lead data'}`,
              row: index + 2,
              fieldErrors: leadResult.error.issues.map((issue) => ({
                field: issue.path.join('.'),
                message: issue.message,
              })),
            });
          }
          inputs.push({
            tenantId: req.tenantId!,
            userId: req.user!.id,
            profileName: req.user!.profileName,
            lead: leadResult.data,
            enquiry: {
              source,
              subSource: String(row.subSource || row.leadSubSource || '') || undefined,
              campaignId: String(row.campaignId || '') || undefined,
              campaign: String(row.campaign || '') || undefined,
              subCampaignId: String(row.subCampaignId || '') || undefined,
              subCampaign: String(row.subCampaign || '') || undefined,
              secondaryPhone: String(row.secondaryPhone || '') || undefined,
              tertiaryPhone: String(row.tertiaryPhone || '') || undefined,
              secondaryEmail: String(row.secondaryEmail || '') || undefined,
              tertiaryEmail: String(row.tertiaryEmail || '') || undefined,
              originalSubmissionId: String(
                row.originalSubmissionId
                || row.sourceSubmissionId
                || (req.get('Idempotency-Key') ? `${req.get('Idempotency-Key')}:${index + 1}` : ''),
              ) || undefined,
              countryCode,
              secondaryCountryCode: String(row.secondaryCountryCode || countryCode),
              tertiaryCountryCode: String(row.tertiaryCountryCode || row.secondaryCountryCode || countryCode),
              medium: String(row.medium || '') || undefined,
              description: String(row.enquiryDescription || row.description || '') || undefined,
              channelPartner: String(row.channelPartner || '') || undefined,
              enquiryDate: row.enquiryDate ? new Date(String(row.enquiryDate)) : undefined,
            },
          });
        }
        try {
          const results = await processLeadEnquiryBatch(inputs);
          const imported = results.map((result) => ({
            action: result.action,
            leadId: result.leadId,
            enquiryId: result.enquiry?.id,
            record: result.lead,
          }));
          return res.status(201).json({
            success: true,
            data: {
              count: imported.filter((item) => item.action === 'NEW_LEAD').length,
              linkedEnquiries: imported.filter((item) => item.action !== 'NEW_LEAD').length,
              records: imported,
            },
          });
        } catch (error: any) {
          const row = typeof error?.rowIndex === 'number' ? error.rowIndex + 2 : undefined;
          if (error?.message === 'DUPLICATE_CONFLICT' || error?.message === 'LEAD_MISMATCH') {
            return res.status(409).json({
              success: false,
              action: error.message,
              ...(row ? { row } : {}),
              importedCount: 0,
              error: row
                ? `Import rolled back at row ${row}; multiple or changed duplicate matches require review.`
                : 'Import rolled back because a duplicate match requires review.',
            });
          }
          const detail = error?.validationErrors?.[0]?.message || error?.message || 'Invalid row';
          return res.status(400).json({
            success: false,
            error: row ? `Import rolled back at row ${row}: ${detail}` : detail,
            ...(row ? { row } : {}),
            fieldErrors: error?.validationErrors,
            importedCount: 0,
          });
        }
      }

      for (let index = 0; index < records.length; index += 1) {
        const row = records[index];
        const data: Record<string, unknown> = { tenantId: req.tenantId! };
        for (const field of fields) {
          const value = convertImportValue(String(row[field] ?? ''), fieldTypes.get(field) || 'text');
          if (value !== undefined) data[field] = value;
        }
        if (standardConfig.hasCreator) data.creatorId = req.user!.id;

        try {
          imported.push(await delegate.create({ data }));
        } catch (error: any) {
          const detail = error?.meta?.cause || error?.message || 'Invalid row';
          return res.status(400).json({ success: false, error: `Import failed on row ${index + 2}: ${detail}` });
        }
      }

      return res.status(201).json({ success: true, data: { count: imported.length, records: imported } });
    }

    const result = await bulkCreateRecords(req.tenantId!, objectName.trim(), records, req.user!.id);
    res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    console.error('Data import error:', error);
    res.status(400).json({ success: false, error: error.message || 'Import failed' });
  }
});

router.get('/export/:objectName', requirePermission('DATA_EXPORT'), async (req: AuthRequest, res: Response) => {
  try {
    const { page = '1', limit = '1000', search, sortBy, sortOrder, fields: fieldsQuery, ...filters } = req.query;
    const fields = typeof fieldsQuery === 'string' ? fieldsQuery.split(',').map((field) => field.trim()).filter(Boolean) : [];
    const pageNumber = Math.max(Number(page) || 1, 1);
    const pageLimit = Math.min(Math.max(Number(limit) || 1000, 1), 10000);
    let exportRows: any[];

    const standardModel = STANDARD_EXPORT_MODELS[req.params.objectName.toLowerCase()];
    if (standardModel) {
      const delegate = (prisma as any)[standardModel];
      let where: any = { tenantId: req.tenantId! };
      if (standardModel === 'lead') {
        where = applyScope(where, leadScopeClause(await getLeadRecordScope(req.user!)));
      } else if (standardModel === 'siteVisit') {
        where = applyScope(where, await getScopeClause(req.user!, 'siteVisit'));
      } else if (standardModel === 'opportunity') {
        where = applyScope(where, await getScopeClause(req.user!, 'opportunity'));
      } else if (standardModel === 'booking') {
        where = applyScope(where, await getScopeClause(req.user!, 'booking'));
      } else if (standardModel === 'quotation') {
        where = applyScope(where, await getScopeClause(req.user!, 'quotation'));
      } else if (standardModel === 'task') {
        where = applyScope(where, await getScopeClause(req.user!, 'task'));
      } else if (standardModel === 'followUp') {
        where = applyScope(where, await getScopeClause(req.user!, 'followUp'));
      } else if (standardModel === 'activity') {
        where = applyScope(where, await getScopeClause(req.user!, 'activity'));
      }
      const records = await delegate.findMany({
        where,
        skip: (pageNumber - 1) * pageLimit,
        take: pageLimit,
        orderBy: { createdAt: 'desc' },
      });
      exportRows = records.map((record: Record<string, unknown>) =>
        Object.fromEntries(Object.entries(record).map(([key, value]) => [
          key,
          value instanceof Date ? value.toISOString() : value,
        ]))
      );
    } else {
      const result = await listRecords(req.tenantId!, req.params.objectName, {
        page: pageNumber,
        limit: pageLimit,
        search: search as string,
        filters: Object.keys(filters).length > 0 ? filters : undefined,
        sortBy: sortBy as string,
        sortOrder: (sortOrder as 'asc' | 'desc') || 'desc',
      });
      exportRows = result.data;
    }

    const selectedFields = fields.length > 0 ? fields : Object.keys(exportRows[0]?.data || exportRows[0] || {});
    const escapeCsv = (value: unknown) => {
      const text = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const csv = [
      selectedFields.map(escapeCsv).join(','),
      ...exportRows.map((record: any) => {
        const source = record.data || record;
        return selectedFields.map((field) => escapeCsv(source[field])).join(',');
      }),
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.objectName}.csv"`);
    res.send(csv);
  } catch (error: any) {
    console.error('Data export error:', error);
    res.status(400).json({ success: false, error: error.message || 'Export failed' });
  }
});

export { router as dataAdministrationRoutes };