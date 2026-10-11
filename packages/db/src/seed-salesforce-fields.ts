import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ExportedField {
  label: string;
  apiName: string;
  sourceType: string;
}

const leadFields = JSON.parse(
  readFileSync(join(__dirname, 'salesforce-lead-fields.json'), 'utf8'),
) as ExportedField[];
const siteVisitFields = JSON.parse(
  readFileSync(join(__dirname, 'salesforce-site-visit-fields.json'), 'utf8'),
) as ExportedField[];
const taskFields = JSON.parse(
  readFileSync(join(__dirname, 'salesforce-task-fields.json'), 'utf8'),
) as ExportedField[];

const standardObjects = [
  { name: 'Lead', label: 'Lead', pluralLabel: 'Leads', icon: 'user', description: 'Manage sales leads' },
  { name: 'Enquiry', label: 'Enquiry', pluralLabel: 'Enquiries', icon: 'inbox', description: 'Manage lead enquiries' },
  { name: 'SiteVisit', label: 'Site Visit', pluralLabel: 'Site Visits', icon: 'map-pin', description: 'Site visit scheduling' },
  { name: 'Opportunity', label: 'Opportunity', pluralLabel: 'Opportunities', icon: 'trending-up', description: 'Sales pipeline' },
  { name: 'Quotation', label: 'Quotation', pluralLabel: 'Quotations', icon: 'file-text', description: 'Quotation management' },
  { name: 'Booking', label: 'Booking', pluralLabel: 'Bookings', icon: 'calendar-check', description: 'Booking management' },
  { name: 'Payment', label: 'Payment', pluralLabel: 'Payments', icon: 'credit-card', description: 'Payment tracking' },
  { name: 'Project', label: 'Project', pluralLabel: 'Projects', icon: 'folder-kanban', description: 'Project management' },
  { name: 'Unit', label: 'Unit', pluralLabel: 'Units', icon: 'building', description: 'Manage project units' },
  { name: 'Company', label: 'Company', pluralLabel: 'Companies', icon: 'building', description: 'Manage companies' },
  { name: 'Task', label: 'Task', pluralLabel: 'Tasks', icon: 'check-square', description: 'Manage tasks' },
  { name: 'FollowUp', label: 'Follow-up', pluralLabel: 'Follow-ups', icon: 'phone', description: 'Manage lead follow-ups' },
  { name: 'Activity', label: 'Activity', pluralLabel: 'Activities', icon: 'activity', description: 'Track CRM activities' },
];

const mappedLeadFields = new Set([
  'Salutation', 'FirstName', 'LastName', 'Title', 'Company', 'Street', 'City',
  'State', 'PostalCode', 'Country', 'Address', 'Phone', 'MobilePhone', 'Fax',
  'Email', 'Website', 'Description', 'LeadSource', 'Status', 'Industry',
  'Rating', 'AnnualRevenue', 'NumberOfEmployees', 'OwnerId', 'CreatedById',
  'CreatedDate', 'LastModifiedById', 'LastModifiedDate', 'SystemModstamp',
  'LastActivityDate', 'LastViewedDate', 'LastReferencedDate', 'IsConverted',
  'ConvertedDate', 'ConvertedAccountId', 'ConvertedContactId',
  'ConvertedOpportunityId', 'IsUnreadByOwner', 'HasOptedOutOfEmail',
  'HasOptedOutOfFax', 'DoNotCall', 'Jigsaw',
]);

const mappedSiteVisitFields = new Set([
  'Name', 'Lead__c', 'Projects__c', 'Date__c', 'Status__c', 'Feedback__c',
  'Visit_Notes__c', 'Site_Visit_Rating__c', 'CreatedById', 'LastModifiedById',
  'OwnerId',
]);

function fieldTypeFor(sourceType: string): {
  fieldType: string;
  readOnly: boolean;
  maxLength?: number;
  helpText?: string;
} {
  const formula = /^Formula \((.+)\)$/.exec(sourceType);
  const type = formula?.[1] || sourceType;
  const length = /\((\d+)(?:,\s*\d+)?\)/.exec(type);
  const maxLength = length ? Number(length[1]) : undefined;

  if (formula || type === 'Auto Number') {
    return {
      fieldType: type.includes('Checkbox') ? 'boolean'
        : type.includes('Date/Time') ? 'dateTime'
          : type.includes('Date') ? 'date'
            : type.includes('Number') || type.includes('Currency') ? 'number'
              : 'text',
      readOnly: true,
    };
  }
  if (type === 'Checkbox') return { fieldType: 'boolean', readOnly: false };
  if (type === 'Date') return { fieldType: 'date', readOnly: false };
  if (type === 'Date/Time') return { fieldType: 'dateTime', readOnly: false };
  if (type === 'Time') return { fieldType: 'time', readOnly: false };
  if (type === 'Email') return { fieldType: 'email', readOnly: false };
  if (type.startsWith('URL')) return { fieldType: 'url', readOnly: false, maxLength };
  if (type.startsWith('Phone')) return { fieldType: 'phone', readOnly: false, maxLength };
  if (type.startsWith('Currency')) return { fieldType: 'currency', readOnly: false };
  if (type.startsWith('Number')) return { fieldType: 'number', readOnly: false };
  if (type.startsWith('Long Text Area') || type.startsWith('Text Area')) {
    return { fieldType: 'longText', readOnly: false, maxLength };
  }
  if (type.startsWith('Rich Text Area')) {
    return { fieldType: 'richText', readOnly: false, maxLength };
  }
  if (type === 'Picklist') {
    return {
      fieldType: 'text',
      readOnly: false,
      helpText: 'Salesforce picklist choices were not included in the export; enter a value as text.',
    };
  }
  if (type.startsWith('Lookup(')) {
    return {
      fieldType: 'text',
      readOnly: false,
      helpText: `Salesforce lookup target ${type.slice(7, -1)} is stored as text because the CRM does not have that relationship configured.`,
    };
  }
  if (type === 'Address') {
    return { fieldType: 'longText', readOnly: false };
  }
  return { fieldType: 'text', readOnly: false, maxLength };
}

function toFieldDefinitions(
  rows: ExportedField[],
  objectName: 'Lead' | 'SiteVisit',
  createdBy: string,
) {
  const mappedFields = objectName === 'Lead' ? mappedLeadFields : mappedSiteVisitFields;
  const uniqueRows = new Map(rows.map((field) => [field.apiName, field]));

  return [...uniqueRows.values()]
    .filter((field) => !mappedFields.has(field.apiName))
    .map((field, index) => {
      const inferred = fieldTypeFor(field.sourceType);
      const name = `sf_${field.apiName}`;
      return {
        name,
        label: field.label,
        fieldType: inferred.fieldType,
        helpText: inferred.helpText,
        maxLength: inferred.maxLength,
        visible: !inferred.readOnly,
        editable: !inferred.readOnly,
        isSystemField: inferred.readOnly,
        isCustomField: !inferred.readOnly,
        isStandardField: inferred.readOnly,
        searchable: false,
        sortable: false,
        filterable: false,
        displayOrder: 1000 + index,
        createdBy,
      };
    });
}

async function seedObjectFields(
  tenantId: string,
  createdBy: string,
  objectName: 'Lead' | 'SiteVisit',
  rows: ExportedField[],
) {
  const existingObject = await prisma.objectDefinition.findFirst({
    where: { tenantId, name: objectName },
    select: { id: true, isActive: true },
  });
  if (existingObject && !existingObject.isActive) {
    console.warn(`  ${objectName} object metadata is inactive; skipping it.`);
    return 0;
  }
  const object = existingObject ?? await prisma.objectDefinition.create({
    data: {
      tenantId,
      name: objectName,
      label: objectName === 'Lead' ? 'Lead' : 'Site Visit',
      pluralLabel: objectName === 'Lead' ? 'Leads' : 'Site Visits',
      icon: objectName === 'Lead' ? 'user' : 'map-pin',
      description: objectName === 'Lead' ? 'Manage sales leads' : 'Site visit scheduling',
      objectType: 'standard',
      isActive: true,
      createdBy,
    },
    select: { id: true, isActive: true },
  });

  const definitions = toFieldDefinitions(rows, objectName, createdBy);
  const importedNames = definitions
    .filter((field) => field.isCustomField)
    .map((field) => field.name);

  const created = await prisma.fieldDefinition.createMany({
    data: definitions.map((field) => ({ ...field, tenantId, objectId: object.id })),
    skipDuplicates: true,
  });

  const existingLayout = await prisma.pageLayout.findFirst({
    where: { objectId: object.id, name: 'Default Layout' },
  });
  const rawSections = existingLayout
    ? (typeof existingLayout.sections === 'string'
      ? JSON.parse(existingLayout.sections)
      : existingLayout.sections) as { name: string; fields: string[] }[]
    : [];
  const sections = Array.isArray(rawSections) ? rawSections : [];
  const sectionName = objectName === 'Lead' ? 'Imported Salesforce Lead Fields' : 'Imported Salesforce Site Visit Fields';
  const updatedSections = [
    ...sections.filter((section) => section.name !== sectionName),
    { name: sectionName, fields: importedNames },
  ];

  if (existingLayout) {
    await prisma.pageLayout.update({
      where: { id: existingLayout.id },
      data: { sections: JSON.stringify(updatedSections), updatedBy: createdBy },
    });
  } else {
    await prisma.pageLayout.create({
      data: {
        tenantId,
        objectId: object.id,
        name: 'Default Layout',
        isDefault: true,
        sections: JSON.stringify(updatedSections),
        createdBy,
      },
    });
  }

  return created.count;
}

async function seedTaskFields(tenantId: string, createdBy: string) {
  const object = await prisma.objectDefinition.findFirst({
    where: { tenantId, name: 'Task', isActive: true },
    select: { id: true },
  });
  if (!object) return 0;

  const prismaFields: Record<string, string> = {
    OwnerId: 'ownerId (DCT User only)',
    CallDurationInSeconds: 'callDurationInSeconds',
    CallObject: 'callObject',
    CallDisposition: 'callDisposition',
    CallType: 'callType',
    Description: 'description',
    CompletedDateTime: 'completedAt',
    IsRecurrence: 'isRecurrence (configuration only; no recurrence scheduler)',
    CreatedById: 'createdById (local creator; Salesforce User ID resolution is not implemented)',
    ActivityDate: 'dueDate',
    Email: 'email',
    LastModifiedById: 'lastModifiedById (local modifier; Salesforce User ID resolution is not implemented)',
    WhoId: 'leadId for Lead; Contact relationship is not available',
    Phone: 'phone',
    Priority: 'salesforcePriority (DCT priority is stored separately)',
    IsVisibleInSelfService: 'isVisibleInSelfService',
    RecurrenceInterval: 'recurrenceInterval',
    WhatId: 'siteVisitId, opportunityId, bookingId, projectId, or unitId; other Salesforce targets are not implemented',
    IsReminderSet: 'isReminderSet (no reminder delivery scheduler)',
    RecurrenceRegeneratedType: 'recurrenceRegeneratedType',
    Status: 'salesforceStatus (DCT workflow status is stored separately)',
    Subject: 'subject (kept in sync with DCT title)',
    TaskSubtype: 'taskSubtype',
    Type: 'taskType',
  };
  const readOnlyFields = new Set(['CreatedById', 'LastModifiedById']);
  const requiredFields = new Set(['OwnerId', 'ActivityDate', 'WhoId', 'WhatId', 'Status', 'Subject']);
  const definitions = taskFields.map((field, index) => {
    const inferred = fieldTypeFor(field.sourceType);
    const lookup = /^Lookup\((.+)\)$/.exec(field.sourceType);
    const numeric = /^(?:Number|Currency)\((\d+)(?:,\s*(\d+))?\)$/.exec(field.sourceType);
    const picklistHelp = field.sourceType === 'Picklist'
      ? ' Salesforce picklist values were not included; the value is stored as text.'
      : '';
    return {
      tenantId,
      objectId: object.id,
      name: `sf_${field.apiName}`,
      label: field.label,
      fieldType: inferred.fieldType,
      helpText: `Salesforce API: ${field.apiName}; source type: ${field.sourceType}; DCT mapping: Task.${prismaFields[field.apiName]}.${picklistHelp}`,
      maxLength: numeric ? undefined : inferred.maxLength,
      precision: numeric ? Number(numeric[1]) : undefined,
      scale: numeric?.[2] ? Number(numeric[2]) : undefined,
      required: requiredFields.has(field.apiName),
      lookupObject: lookup?.[1],
      visible: true,
      editable: !readOnlyFields.has(field.apiName),
      isSystemField: readOnlyFields.has(field.apiName),
      isCustomField: false,
      isStandardField: true,
      searchable: false,
      sortable: false,
      filterable: false,
      displayOrder: 1000 + index,
      createdBy,
    };
  });
  const created = await prisma.fieldDefinition.createMany({ data: definitions, skipDuplicates: true });
  const existingLayout = await prisma.pageLayout.findFirst({
    where: { objectId: object.id, name: 'Default Layout' },
  });
  const rawSections = existingLayout
    ? (typeof existingLayout.sections === 'string'
      ? JSON.parse(existingLayout.sections)
      : existingLayout.sections) as { name: string; fields: string[] }[]
    : [];
  const sectionName = 'Salesforce Task Fields';
  const sections = [
    ...rawSections.filter((section) => section.name !== sectionName),
    { name: sectionName, fields: definitions.map((field) => field.name) },
  ];
  if (existingLayout) {
    await prisma.pageLayout.update({
      where: { id: existingLayout.id },
      data: { sections: JSON.stringify(sections), updatedBy: createdBy },
    });
  } else {
    await prisma.pageLayout.create({
      data: {
        tenantId,
        objectId: object.id,
        name: 'Default Layout',
        isDefault: true,
        sections: JSON.stringify(sections),
        createdBy,
      },
    });
  }
  return created.count;
}

async function ensureStandardObjects(tenantId: string, createdBy: string) {
  for (const object of standardObjects) {
    const existing = await prisma.objectDefinition.findFirst({
      where: { tenantId, name: object.name },
      select: { id: true, isActive: true },
    });
    if (existing) continue;

    const created = await prisma.objectDefinition.create({
      data: {
        tenantId,
        ...object,
        objectType: 'standard',
        createdBy,
        updatedBy: createdBy,
      },
    });
    await prisma.pageLayout.create({
      data: {
        tenantId,
        objectId: created.id,
        name: 'Default Layout',
        isDefault: true,
        sections: JSON.stringify([{ name: `${object.label} Information`, fields: [] }]),
        createdBy,
      },
    });
  }
}

async function main() {
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  for (const tenant of tenants) {
    const user = await prisma.user.findFirst({
      where: { tenantId: tenant.id, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!user) {
      console.warn(`Skipping ${tenant.name}: no active user is available for metadata ownership.`);
      continue;
    }

    await ensureStandardObjects(tenant.id, user.id);
    const [leadCount, siteVisitCount, taskCount] = await Promise.all([
      seedObjectFields(tenant.id, user.id, 'Lead', leadFields),
      seedObjectFields(tenant.id, user.id, 'SiteVisit', siteVisitFields),
      seedTaskFields(tenant.id, user.id),
    ]);
    console.log(`${tenant.name}: created ${leadCount} Lead, ${siteVisitCount} Site Visit, and ${taskCount} Task fields.`);
  }
}

main()
  .catch((error) => {
    console.error('Salesforce field seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
