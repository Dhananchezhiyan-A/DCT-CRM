import { prisma } from '@dct-crm/db';

export type ReportFieldType = 'string' | 'number' | 'date' | 'enum';

export interface ReportField {
  label: string;
  path: string;
  type: ReportFieldType;
}

export interface ReportObject {
  label: string;
  category?: string;
  model: string;
  fields: Record<string, ReportField>;
}

export interface ReportMetadataField {
  key: string;
  label: string;
  type: ReportFieldType;
}

export interface ReportMetadataObject {
  name: string;
  label: string;
  category: string;
  fields: ReportMetadataField[];
}

export interface ReportMetadataRegistry {
  objects: ReportMetadataObject[];
  name?: string;
  label?: string;
  category?: string;
  fields?: ReportMetadataField[];
  object?: ReportMetadataObject;
}

function toMetadataObject(name: string, object: ReportObject): ReportMetadataObject {
  return {
    name,
    label: object.label,
    category: object.category || object.label,
    fields: Object.entries(object.fields).map(([key, field]) => ({
      key,
      label: field.label,
      type: field.type,
    })),
  };
}

export async function getReportMetadataRegistry(
  tenantId: string,
  objectName?: string,
): Promise<ReportMetadataRegistry> {
  const staticObjects = Object.entries(REPORT_OBJECTS).map(([name, object]) =>
    toMetadataObject(name, object),
  );

  const definedObjects = await prisma.objectDefinition.findMany({
    where: { tenantId, isActive: true },
    include: {
      fields: {
        where: { isActive: true, visible: true },
        orderBy: { displayOrder: 'asc' },
      },
    },
    orderBy: { label: 'asc' },
  });

  const staticNames = new Set(staticObjects.map((object) => object.name.toLowerCase()));
  const dynamicObjects = definedObjects
    .filter((object) => !staticNames.has(object.name.toLowerCase()))
    .map((object) => ({
      name: object.name,
      label: object.pluralLabel || object.label,
      category: object.pluralLabel || object.label,
      fields: object.fields.map((field) => ({
        key: field.name,
        label: field.label,
        type: (['number', 'currency', 'decimal'].includes(field.fieldType)
          ? 'number'
          : ['date', 'dateTime'].includes(field.fieldType)
            ? 'date'
            : field.fieldType === 'picklist'
              ? 'enum'
              : 'string') as ReportFieldType,
      })),
    }));

  const objects = [...staticObjects, ...dynamicObjects];

  if (!objectName) {
    return { objects };
  }

  const matched =
    objects.find((object) => object.name === objectName) ||
    objects.find((object) => object.name.toLowerCase() === objectName.toLowerCase());

  if (!matched) {
    throw new Error(`Unknown report object: ${objectName}`);
  }

  return {
    objects,
    name: matched.name,
    label: matched.label,
    category: matched.category,
    fields: matched.fields,
    object: matched,
  };
}

export const REPORT_OBJECTS: Record<string, ReportObject> = {
  Lead: {
    label: 'Leads',
    category: 'Leads',
    model: 'lead',
    fields: {
      id: { label: 'Lead ID', path: 'id', type: 'string' },
      leadNumber: { label: 'Lead Number', path: 'leadNumber', type: 'string' },
      firstName: { label: 'First Name', path: 'firstName', type: 'string' },
      lastName: { label: 'Last Name', path: 'lastName', type: 'string' },
      email: { label: 'Email', path: 'email', type: 'string' },
      phone: { label: 'Phone', path: 'phone', type: 'string' },
      status: { label: 'Status', path: 'status', type: 'enum' },
      source: { label: 'Lead Source', path: 'source', type: 'enum' },
      score: { label: 'Score', path: 'score', type: 'number' },
      budget: { label: 'Budget', path: 'budget', type: 'number' },
      requirements: { label: 'Requirements', path: 'requirements', type: 'string' },
      notes: { label: 'Notes', path: 'notes', type: 'string' },
      createdAt: { label: 'Created Date', path: 'createdAt', type: 'date' },
      updatedAt: { label: 'Updated Date', path: 'updatedAt', type: 'date' },
      ownerId: { label: 'Owner ID', path: 'ownerId', type: 'string' },
      ownerName: { label: 'Owner', path: 'owner.firstName', type: 'string' },
      projectName: { label: 'Project', path: 'project.name', type: 'string' },
    },
  },
  Opportunity: {
    label: 'Opportunities',
    category: 'Opportunities',
    model: 'opportunity',
    fields: {
      id: { label: 'Opportunity ID', path: 'id', type: 'string' },
      name: { label: 'Opportunity Name', path: 'name', type: 'string' },
      stage: { label: 'Stage', path: 'stage', type: 'enum' },
      amount: { label: 'Amount', path: 'amount', type: 'number' },
      expectedCloseDate: { label: 'Expected Close Date', path: 'expectedCloseDate', type: 'date' },
      probability: { label: 'Probability', path: 'probability', type: 'number' },
      description: { label: 'Description', path: 'description', type: 'string' },
      createdAt: { label: 'Created Date', path: 'createdAt', type: 'date' },
      updatedAt: { label: 'Updated Date', path: 'updatedAt', type: 'date' },
    },
  },
  SiteVisit: {
    label: 'Site Visits',
    category: 'Site Visits',
    model: 'siteVisit',
    fields: {
      id: { label: 'Site Visit ID', path: 'id', type: 'string' },
      scheduledAt: { label: 'Scheduled Date', path: 'scheduledAt', type: 'date' },
      completedAt: { label: 'Completed Date', path: 'completedAt', type: 'date' },
      status: { label: 'Status', path: 'status', type: 'enum' },
      feedback: { label: 'Feedback', path: 'feedback', type: 'string' },
      rating: { label: 'Rating', path: 'rating', type: 'number' },
      notes: { label: 'Notes', path: 'notes', type: 'string' },
      createdAt: { label: 'Created Date', path: 'createdAt', type: 'date' },
    },
  },
  Quotation: {
    label: 'Quotations',
    category: 'Quotations',
    model: 'quotation',
    fields: {
      id: { label: 'Quotation ID', path: 'id', type: 'string' },
      number: { label: 'Quotation Number', path: 'number', type: 'string' },
      status: { label: 'Status', path: 'status', type: 'enum' },
      totalAmount: { label: 'Total Amount', path: 'totalAmount', type: 'number' },
      taxAmount: { label: 'Tax Amount', path: 'taxAmount', type: 'number' },
      discount: { label: 'Discount', path: 'discount', type: 'number' },
      validUntil: { label: 'Valid Until', path: 'validUntil', type: 'date' },
      createdAt: { label: 'Created Date', path: 'createdAt', type: 'date' },
    },
  },
  Booking: {
    label: 'Bookings',
    category: 'Bookings',
    model: 'booking',
    fields: {
      id: { label: 'Booking ID', path: 'id', type: 'string' },
      number: { label: 'Booking Number', path: 'number', type: 'string' },
      status: { label: 'Status', path: 'status', type: 'enum' },
      bookingDate: { label: 'Booking Date', path: 'bookingDate', type: 'date' },
      totalAmount: { label: 'Total Amount', path: 'totalAmount', type: 'number' },
      createdAt: { label: 'Created Date', path: 'createdAt', type: 'date' },
    },
  },
  Payment: {
    label: 'Payments',
    category: 'Payments',
    model: 'payment',
    fields: {
      id: { label: 'Payment ID', path: 'id', type: 'string' },
      amount: { label: 'Amount', path: 'amount', type: 'number' },
      status: { label: 'Status', path: 'status', type: 'enum' },
      paymentDate: { label: 'Payment Date', path: 'paymentDate', type: 'date' },
      reference: { label: 'Reference', path: 'reference', type: 'string' },
      createdAt: { label: 'Created Date', path: 'createdAt', type: 'date' },
    },
  },
  Project: {
    label: 'Projects',
    category: 'Projects',
    model: 'project',
    fields: {
      id: { label: 'Project ID', path: 'id', type: 'string' },
      name: { label: 'Project Name', path: 'name', type: 'string' },
      description: { label: 'Description', path: 'description', type: 'string' },
      address: { label: 'Address', path: 'address', type: 'string' },
      city: { label: 'City', path: 'city', type: 'string' },
      state: { label: 'State', path: 'state', type: 'string' },
      totalUnits: { label: 'Total Units', path: 'totalUnits', type: 'number' },
      isActive: { label: 'Active', path: 'isActive', type: 'enum' },
      createdAt: { label: 'Created Date', path: 'createdAt', type: 'date' },
    },
  },
  Task: {
    label: 'Tasks',
    category: 'Tasks',
    model: 'task',
    fields: {
      id: { label: 'Task ID', path: 'id', type: 'string' },
      title: { label: 'Title', path: 'title', type: 'string' },
      description: { label: 'Description', path: 'description', type: 'string' },
      status: { label: 'Status', path: 'status', type: 'enum' },
      priority: { label: 'Priority', path: 'priority', type: 'enum' },
      dueDate: { label: 'Due Date', path: 'dueDate', type: 'date' },
      completedAt: { label: 'Completed Date', path: 'completedAt', type: 'date' },
      createdAt: { label: 'Created Date', path: 'createdAt', type: 'date' },
    },
  },
};