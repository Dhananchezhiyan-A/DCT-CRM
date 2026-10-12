export interface OpportunityGreRegistration {
  referenceNumber: string | null;
  submittedAt: string | null;
  lead: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    company: string | null;
    budget: number | null;
    preferredLocation: string | null;
  };
  siteVisit: {
    date: string | null;
    time: string | null;
    project: string | null;
    scheduledAt: string | null;
    visitType: string | null;
    visitorCount: number | null;
  };
  company: {
    name: string | null;
    type: string | null;
    industry: string | null;
  };
}

export interface OpportunityApiRecord {
  id: string;
  opportunityNumber?: string | null;
  name: string | null;
  amount: number | null;
  stage: string | null;
  probability: number | null;
  expectedCloseDate: string | null;
  closeDate?: string | null;
  createdAt: string;
  updatedAt: string;
  description?: string | null;
  owner?: { firstName: string | null; lastName: string | null } | null;
  lead?: {
    id: string;
    leadNumber: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    mobile: string | null;
    company: string | null;
    budget: number | null;
    preferredLocation: string | null;
    status?: string | null;
    street?: string | null;
    city?: string | null;
    stateProvince?: string | null;
    postalCode?: string | null;
    country?: string | null;
    project: { id: string; name: string } | null;
  } | null;
  project?: { id: string; name: string; city?: string | null; address?: string | null } | null;
  unit?: { id: string; number: string; type?: string | null; area?: number | null; price?: number | null } | null;
  siteVisit?: { id: string; siteVisitNumber: string | null; status: string; completedAt?: string | null } | null;
  quotations?: Array<{ id: string; number: string; totalAmount: number; status: string }>;
  bookings?: Array<{ id: string; number: string; status: string; totalAmount: number }>;
  activities?: unknown[];
  tasks?: unknown[];
  greRegistration?: OpportunityGreRegistration | null;
}

export interface OpportunityView {
  id: string;
  title: string;
  value: number;
  stage: string;
  probability: number;
  closeDate: string;
  assignedTo: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  currency?: string;
  opportunityNumber?: string | null;
  lead: OpportunityApiRecord["lead"];
  project: OpportunityApiRecord["project"];
  unit: OpportunityApiRecord["unit"];
  siteVisit: OpportunityApiRecord["siteVisit"];
  quotations: NonNullable<OpportunityApiRecord["quotations"]>;
  bookings: NonNullable<OpportunityApiRecord["bookings"]>;
  activities: NonNullable<OpportunityApiRecord["activities"]>;
  tasks: NonNullable<OpportunityApiRecord["tasks"]>;
  greRegistration: OpportunityGreRegistration | null;
}

export function mapOpportunity(item: OpportunityApiRecord): OpportunityView {
  return {
    id: item.id,
    title: item.name || "Untitled Opportunity",
    value: item.amount || 0,
    stage: (item.stage || "prospecting").toLowerCase().replace(/_/g, "-"),
    probability: item.probability ?? 0,
    closeDate: item.expectedCloseDate || item.closeDate || item.createdAt,
    assignedTo: item.owner
      ? `${item.owner.firstName || ""} ${item.owner.lastName || ""}`.trim()
      : "—",
    description: item.description || undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    currency: "INR",
    opportunityNumber: item.opportunityNumber,
    lead: item.lead || null,
    project: item.project || null,
    unit: item.unit || null,
    siteVisit: item.siteVisit || null,
    quotations: item.quotations || [],
    bookings: item.bookings || [],
    activities: item.activities || [],
    tasks: item.tasks || [],
    greRegistration: item.greRegistration || null,
  };
}
