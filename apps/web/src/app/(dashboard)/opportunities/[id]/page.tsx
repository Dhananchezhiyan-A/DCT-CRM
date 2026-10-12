"use client";

import { formatDate, formatDateTime } from "@/lib/date-format";

import * as React from "react";

import { useParams, useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";

import { Card, CardContent } from "@/components/ui/card";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

import { Skeleton } from "@/components/ui/skeleton";

import Link from "next/link";

import { useToast } from "@/hooks/use-toast";

import { leadApi, opportunityApi, projectApi, quotationApi, taskApi, unitApi } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import StickyNotesCard from "@/components/crm/sticky-notes-card";
import OpportunityFinancialWorkspace from "@/components/crm/opportunity-financial-workspace";
import { OpportunityCommercialWorkflows } from "@/components/crm/opportunity-commercial-workflows";

import {
  ArrowLeft,
  Trash2,
  FileText,
  Receipt,
  UserRound,
  CalendarPlus,
} from "lucide-react";

interface OpportunityData {
  id: string;
  opportunityNumber?: string | null;
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
  lead?: {
    id: string;
    leadNumber?: string | null;
    firstName: string;
    lastName: string;
    email?: string | null;
    phone?: string | null;
    mobile?: string | null;
    company?: string | null;
    status?: string | null;
    street?: string | null;
    city?: string | null;
    stateProvince?: string | null;
    postalCode?: string | null;
    country?: string | null;
  } | null;
  project?: { id: string; name: string; city?: string | null; address?: string | null } | null;
  unit?: { id: string; number: string; type?: string | null; area?: number | null; price?: number | null } | null;
  siteVisit?: { id: string; siteVisitNumber?: string | null; status: string; completedAt?: string | null } | null;
  greRegistration?: {
    referenceNumber?: string | null;
    submittedAt?: string | null;
    lead?: { firstName?: string | null; lastName?: string | null; email?: string | null; phone?: string | null; company?: string | null } | null;
    siteVisit?: { date?: string | null; time?: string | null; project?: string | null; visitType?: string | null } | null;
  } | null;
  quotations: any[];
  bookings: Array<{ id: string; number: string; status: string; totalAmount: number; quotationId?: string | null }>;
  activities: any[];
  tasks: any[];
}

const stageColors: Record<string, string> = {
  prospecting: "bg-blue-100 text-blue-800",
  qualification: "bg-indigo-100 text-indigo-800",
  proposal: "bg-purple-100 text-purple-800",
  negotiation: "bg-orange-100 text-orange-800",
  "closed-won": "bg-green-100 text-green-800",
  "closed-lost": "bg-red-100 text-red-800",
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
};

const stages = ["prospecting", "qualification", "needs-analysis", "proposal", "negotiation", "closed-won", "closed-lost"];

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid min-h-10 grid-cols-[minmax(110px,0.8fr)_minmax(0,1.2fr)] items-center gap-3 border-b py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words font-medium">{value ?? "—"}</span>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-md border">
      <h2 className="bg-muted/70 px-3 py-2 text-sm font-medium">{title}</h2>
      <div className="grid gap-x-6 px-3 md:grid-cols-2">{children}</div>
    </section>
  );
}

function mapOpportunity(item: any): OpportunityData {
  return {
    id: item.id,
    opportunityNumber: item.opportunityNumber,
    title: item.name || "Untitled Opportunity",
    value: item.amount || 0,
    stage: (item.stage || "prospecting").toLowerCase().replace(/_/g, "-"),
    probability: item.probability ?? 0,
    closeDate: item.expectedCloseDate || item.closeDate || item.createdAt,
    assignedTo: item.owner
      ? `${item.owner.firstName} ${item.owner.lastName}`.trim()
      : "—",
    description: item.description,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    currency: "INR",
    lead: item.lead,
    project: item.project,
    unit: item.unit,
    siteVisit: item.siteVisit,
    greRegistration: item.greRegistration,
    quotations: item.quotations || [],
    bookings: item.bookings || [],
    activities: item.activities || [],
    tasks: item.tasks || [],
  };
}

export default function OpportunityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { hasEffectivePermission } = useAuth();
  const [opportunity, setOpportunity] = React.useState<OpportunityData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [quoteCustomerName, setQuoteCustomerName] = React.useState("");
  const [quoteMobile, setQuoteMobile] = React.useState("");
  const [quoteEmail, setQuoteEmail] = React.useState("");
  const [quoteAddress, setQuoteAddress] = React.useState("");
  const [quoteProjects, setQuoteProjects] = React.useState<any[]>([]);
  const [quoteProjectId, setQuoteProjectId] = React.useState("");
  const [quoteUnits, setQuoteUnits] = React.useState<any[]>([]);
  const [quoteUnitsLoading, setQuoteUnitsLoading] = React.useState(false);
  const [quoteUnitId, setQuoteUnitId] = React.useState("");
  const [quotePricePerSqFt, setQuotePricePerSqFt] = React.useState("");
  const [quotePlc, setQuotePlc] = React.useState("0");
  const [quoteDiscount, setQuoteDiscount] = React.useState("0");
  const [quotePaymentPlan, setQuotePaymentPlan] = React.useState<"10-90" | "10-40-50">("10-90");
  const [quoteDescription, setQuoteDescription] = React.useState("");
  const [quoteConfirmationOpen, setQuoteConfirmationOpen] = React.useState(false);
  const [isGeneratingQuotation, setIsGeneratingQuotation] = React.useState(false);
  const [latestQuotationId, setLatestQuotationId] = React.useState("");
  const [financialWorkspaceEnabled, setFinancialWorkspaceEnabled] = React.useState(false);
  const [contactDialogOpen, setContactDialogOpen] = React.useState(false);
  const [contactSaving, setContactSaving] = React.useState(false);
  const [contactDraft, setContactDraft] = React.useState({ firstName: "", lastName: "", phone: "", mobile: "", email: "" });
  const [followUpDialogOpen, setFollowUpDialogOpen] = React.useState(false);
  const [followUpSaving, setFollowUpSaving] = React.useState(false);
  const [followUpDraft, setFollowUpDraft] = React.useState({ title: "", dueDate: "" });
  const [stageSaving, setStageSaving] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState("details");
  React.useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    if (requestedTab === "create-receipt") setActiveTab("receipt");
    else if (requestedTab === "receipt" || requestedTab === "payments") setActiveTab(requestedTab);
    setFinancialWorkspaceEnabled(true);
  }, []);

  React.useEffect(() => {
    const fetchOpportunity = async () => {
      try {
        setIsLoading(true);
        const res = await opportunityApi.get(params.id as string);
        if (res.data.success && res.data.data) {
          const mapped = mapOpportunity(res.data.data);
          setOpportunity(mapped);
          setQuoteDescription(`${mapped.project?.name || mapped.title}${mapped.unit ? ` - Unit ${mapped.unit.number}` : ""}`);
          setQuoteCustomerName(mapped.lead ? `${mapped.lead.firstName} ${mapped.lead.lastName}`.trim() : "");
          setQuoteMobile(mapped.lead?.mobile || mapped.lead?.phone || "");
          setQuoteEmail(mapped.lead?.email || "");
          setQuoteAddress([mapped.lead?.street, mapped.lead?.city, mapped.lead?.stateProvince, mapped.lead?.postalCode, mapped.lead?.country].filter(Boolean).join(", "));
          setContactDraft({
            firstName: mapped.lead?.firstName || "",
            lastName: mapped.lead?.lastName || "",
            phone: mapped.lead?.phone || "",
            mobile: mapped.lead?.mobile || "",
            email: mapped.lead?.email || "",
          });
          setQuoteProjectId(mapped.project?.id || "");
          setQuoteUnitId(mapped.unit?.id || "");
          setLatestQuotationId(mapped.quotations[0]?.id || "");
        } else {
          toast({ title: "Error", description: "Opportunity not found", variant: "destructive" as any });
          router.push("/opportunities");
        }
      } catch {
        toast({ title: "Error", description: "Failed to load opportunity", variant: "destructive" as any });
      } finally {
        setIsLoading(false);
      }
    };
    fetchOpportunity();
  }, [params.id, router, toast]);

  React.useEffect(() => {
    let cancelled = false;
    projectApi.list({ limit: 100, isActive: true }).then((response) => {
      if (!cancelled && response.data?.success && Array.isArray(response.data.data)) setQuoteProjects(response.data.data);
    }).catch((error: any) => {
      if (!cancelled) toast({ title: "Error", description: error?.response?.data?.error || "Failed to load projects", variant: "destructive" as any });
    });
    return () => { cancelled = true; };
  }, [toast]);

  React.useEffect(() => {
    if (!quoteProjectId) {
      setQuoteUnits([]);
      return;
    }
    let cancelled = false;
    setQuoteUnitsLoading(true);
    unitApi.list({ projectId: quoteProjectId, limit: 200 }).then((response) => {
      if (!cancelled) setQuoteUnits(response.data?.success && Array.isArray(response.data.data) ? response.data.data : []);
    }).catch((error: any) => {
      if (!cancelled) {
        setQuoteUnits([]);
        toast({ title: "Error", description: error?.response?.data?.error || "Failed to load project units", variant: "destructive" as any });
      }
    }).finally(() => {
      if (!cancelled) setQuoteUnitsLoading(false);
    });
    return () => { cancelled = true; };
  }, [quoteProjectId, toast]);

  React.useEffect(() => {
    const selectedUnit = quoteUnits.find((unit) => unit.id === quoteUnitId);
    if (!selectedUnit) return;
    const unitArea = Number(selectedUnit.area || 0);
    const unitPrice = Number(selectedUnit.price || 0);
    setQuotePricePerSqFt(unitArea > 0 ? String(unitPrice / unitArea) : "0");
    setQuotePlc("0");
    setQuoteDiscount("0");
  }, [quoteUnitId, quoteUnits]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!opportunity) return null;

  const storedStageIndex = stages.indexOf(opportunity.stage);
  const hasActiveBooking = opportunity.bookings.some((booking) => booking.status !== "CANCELLED");
  const hasQuotation = opportunity.quotations.length > 0;
  const displayStage = opportunity.stage === "closed-lost"
    ? opportunity.stage
    : hasActiveBooking
      ? "closed-won"
      : hasQuotation && storedStageIndex < stages.indexOf("proposal")
        ? "proposal"
        : opportunity.stage;
  const currentStageIndex = stages.indexOf(displayStage);
  const isClosedLost = displayStage === "closed-lost";
  const leadName = opportunity.lead
    ? `${opportunity.lead.firstName} ${opportunity.lead.lastName}`.trim()
    : "—";
  const leadAddress = [opportunity.lead?.street, opportunity.lead?.city, opportunity.lead?.stateProvince, opportunity.lead?.postalCode, opportunity.lead?.country]
    .filter(Boolean).join(", ") || "—";
  const gre = opportunity.greRegistration;
  const greLeadName = [gre?.lead?.firstName, gre?.lead?.lastName].filter(Boolean).join(" ");
  const selectedQuoteUnit = quoteUnits.find((unit) => unit.id === quoteUnitId);
  const selectedQuoteUnitAvailable = !selectedQuoteUnit?.status || selectedQuoteUnit.status === "AVAILABLE";
  const quoteArea = Number(selectedQuoteUnit?.area || 0);
  const quoteBaseAmount = quoteArea > 0 ? quoteArea * Number(quotePricePerSqFt || 0) : Number(selectedQuoteUnit?.price || 0);
  const quoteTotalAmount = Math.max(0, quoteBaseAmount + Number(quotePlc || 0) - Number(quoteDiscount || 0));
  const quotationPlan = quotePaymentPlan === "10-40-50"
    ? [{ label: "Booking Payment", percentage: 10, dueDays: 0, milestone: "At booking" }, { label: "Installment 1", percentage: 40, dueDays: 10, milestone: "Within 10 days of booking" }, { label: "Installment 2", percentage: 50, dueDays: 30, milestone: "Within 30 days of booking" }]
    : [{ label: "Installment 1", percentage: 10, dueDays: 10, milestone: "Within 10 days of booking" }, { label: "Installment 2", percentage: 90, dueDays: 30, milestone: "Within 30 days of booking" }];
  const bookingQuotationId = latestQuotationId || opportunity.quotations[0]?.id || "";
  const bookingParams = new URLSearchParams({
    opportunityId: opportunity.id,
    quotationId: bookingQuotationId,
    projectId: quoteProjectId || opportunity.project?.id || "",
    unitId: quoteUnitId || opportunity.unit?.id || "",
    totalAmount: String(quoteTotalAmount || opportunity.quotations[0]?.totalAmount || 0),
    ...(opportunity.lead?.id ? { leadId: opportunity.lead.id } : {}),
  });
  const visibleActiveTab = activeTab;

  const handleOpenQuotationConfirmation = () => {
    if (!quoteCustomerName.trim() || !quoteProjectId || !quoteUnitId || !selectedQuoteUnitAvailable || !quoteDescription.trim() || !Number.isFinite(quoteTotalAmount) || quoteTotalAmount <= 0) {
      toast({ title: "Quotation details required", description: "Complete customer details, select a project and available unit, and enter a valid price.", variant: "destructive" as any });
      return;
    }
    setQuoteConfirmationOpen(true);
  };

  const handleGenerateQuotation = async () => {
    setIsGeneratingQuotation(true);
    try {
      const response = await quotationApi.create({
        leadId: opportunity.lead?.id,
        opportunityId: opportunity.id,
        projectId: quoteProjectId,
        notes: `QUOTE_PDF_DATA:${JSON.stringify({
          customerName: quoteCustomerName.trim(),
          mobile: quoteMobile.trim(),
          email: quoteEmail.trim(),
          address: quoteAddress.trim(),
          paymentPlan: quotePaymentPlan,
        })}`,
        paymentPlan: quotePaymentPlan,
        items: [{
          unitId: quoteUnitId,
          description: quoteDescription.trim(),
          quantity: 1,
          unitPrice: quoteTotalAmount,
        }],
      });
      const quotation = response.data.data;
      if (!quotation?.id) throw new Error("Quotation was created but no ID was returned");
      setLatestQuotationId(quotation.id);
      setOpportunity((current) => current ? {
        ...current,
        quotations: [
          {
            id: quotation.id,
            number: quotation.number || "Quotation",
            totalAmount: Number(quotation.totalAmount ?? quoteTotalAmount),
            status: quotation.status || "DRAFT",
          },
          ...current.quotations.filter((item: any) => item.id !== quotation.id),
        ],
      } : current);
      setActiveTab("quotation");
      setQuoteConfirmationOpen(false);
      try {
        const pdfResponse = await quotationApi.downloadPdf(quotation.id);
        const url = URL.createObjectURL(new Blob([pdfResponse.data], { type: "application/pdf" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `${quotation.number || "quotation"}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast({ title: "Quotation downloaded", description: `${quotation.number || "Quotation"} was saved to your downloads.` });
      } catch (error: any) {
        toast({ title: "Quotation created", description: error?.response?.data?.error || "The PDF could not be downloaded. Retry from the Quotations page.", variant: "destructive" as any });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error?.response?.data?.error || error?.message || "Failed to create quotation", variant: "destructive" as any });
    } finally {
      setIsGeneratingQuotation(false);
    }
  };

  const handleContactUpdate = async () => {
    if (!opportunity.lead?.id) return;
    setContactSaving(true);
    try {
      const response = await leadApi.update(opportunity.lead.id, {
        firstName: contactDraft.firstName.trim(),
        lastName: contactDraft.lastName.trim(),
        phone: contactDraft.phone.trim(),
        mobile: contactDraft.mobile.trim(),
        email: contactDraft.email.trim(),
      });
      if (!response.data?.success) throw new Error(response.data?.error || "Contact update failed");
      setOpportunity((current) => current ? {
        ...current,
        lead: current.lead ? { ...current.lead, ...contactDraft } : current.lead,
      } : current);
      setQuoteCustomerName(`${contactDraft.firstName} ${contactDraft.lastName}`.trim());
      setQuoteMobile(contactDraft.mobile || contactDraft.phone);
      setQuoteEmail(contactDraft.email);
      setContactDialogOpen(false);
      toast({ title: "Contact updated", description: "The linked lead contact details were saved." });
    } catch (error: any) {
      toast({ title: "Contact update failed", description: error?.response?.data?.error || error?.message || "Unable to update contact.", variant: "destructive" as any });
    } finally {
      setContactSaving(false);
    }
  };

  const handleCreateFollowUp = async () => {
    if (!followUpDraft.title.trim() || !followUpDraft.dueDate) return;
    setFollowUpSaving(true);
    try {
      const response = await taskApi.create({
        title: followUpDraft.title.trim(),
        subject: followUpDraft.title.trim(),
        dueDate: followUpDraft.dueDate,
        opportunityId: opportunity.id,
        ...(opportunity.lead?.id ? { leadId: opportunity.lead.id } : {}),
        priority: "MEDIUM",
        status: "PENDING",
      });
      if (!response.data?.success) throw new Error(response.data?.error || "Follow-up task was not created");
      setFollowUpDialogOpen(false);
      setFollowUpDraft({ title: "", dueDate: "" });
      toast({ title: "Follow-up created", description: "The task is linked to this opportunity." });
    } catch (error: any) {
      toast({ title: "Follow-up failed", description: error?.response?.data?.error || error?.message || "Unable to create follow-up.", variant: "destructive" as any });
    } finally {
      setFollowUpSaving(false);
    }
  };

  const handleStageChange = async (stage: string) => {
    const apiStage = stage.toUpperCase().replace(/-/g, "_");
    setStageSaving(true);
    try {
      const response = await opportunityApi.updateStage(opportunity.id, apiStage);
      if (!response.data?.success) throw new Error(response.data?.error || "Stage update failed");
      setOpportunity((current) => current ? { ...current, stage } : current);
      toast({ title: "Stage updated", description: `Opportunity moved to ${stage.replace(/-/g, " ")}.` });
    } catch (error: any) {
      toast({ title: "Stage update failed", description: error?.response?.data?.error || error?.message || "Unable to update opportunity stage.", variant: "destructive" as any });
    } finally {
      setStageSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/opportunities">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-bold">{opportunity.title}</h1>
            <p className="text-sm text-muted-foreground">
              {opportunity.opportunityNumber || opportunity.id} · {leadName} · {opportunity.lead?.mobile || opportunity.lead?.phone || "No mobile"} · {opportunity.project?.name || "No project"} · Owner: {opportunity.assignedTo}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasEffectivePermission("TASK_CREATE") && (
            <Button variant="outline" onClick={() => setFollowUpDialogOpen(true)} disabled={!opportunity.lead?.id && !opportunity.id}>
              <CalendarPlus className="mr-2 h-4 w-4" />Follow-up
            </Button>
          )}
          {opportunity.lead?.id && hasEffectivePermission("LEAD_EDIT") && (
            <Button variant="outline" onClick={() => setContactDialogOpen(true)}>
              <UserRound className="mr-2 h-4 w-4" />Update contact
            </Button>
          )}
          {hasEffectivePermission("OPPORTUNITY_EDIT") && (
            <select
              aria-label="Update opportunity stage"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={opportunity.stage}
              disabled={stageSaving}
              onChange={(event) => void handleStageChange(event.target.value)}
            >
              {stages.map((stage) => <option key={stage} value={stage}>{stage.replace(/-/g, " ")}</option>)}
            </select>
          )}
          {hasEffectivePermission("OPPORTUNITY_DELETE") && (
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  await opportunityApi.delete(opportunity.id);
                  toast({ title: "Deleted", description: "Opportunity deleted" });
                  router.push("/opportunities");
                } catch {
                  toast({ title: "Error", description: "Failed to delete opportunity", variant: "destructive" as any });
                }
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          )}
        </div>
      </div>

      <section className="overflow-x-auto rounded-md border px-3 py-3">
        <div className="flex min-w-[760px] items-center">
          {stages.map((stage, index) => {
            const reached = isClosedLost
              ? index < 5 || stage === "closed-lost"
              : index < 6 && currentStageIndex >= index;
            const current = currentStageIndex === index;
            return (
              <React.Fragment key={stage}>
                <div className="flex min-w-[92px] flex-col items-center gap-1">
                  <div className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold",
                    current ? "bg-primary text-primary-foreground ring-4 ring-primary/15" : reached ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                  )}>
                    {index + 1}
                  </div>
                  <span className={cn("text-center text-[11px] capitalize", current && "font-semibold text-primary")}>
                    {stage.replace(/-/g, " ")}
                  </span>
                </div>
                {index < stages.length - 1 && <div className={cn("mb-5 h-0.5 min-w-5 flex-1", !isClosedLost && currentStageIndex > index && index < 5 ? "bg-primary/60" : "bg-muted")} />}
              </React.Fragment>
            );
          })}
        </div>
      </section>

      <Tabs value={visibleActiveTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="details" className="gap-2">
            <FileText className="h-4 w-4" />
            Details
          </TabsTrigger>
          <TabsTrigger value="quotation" className="gap-2">
            <FileText className="h-4 w-4" />
            Quotation
          </TabsTrigger>
          <TabsTrigger value="receipt" className="gap-2">
            <Receipt className="h-4 w-4" />
            Receipt
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-2">
            <Receipt className="h-4 w-4" />
            Payments & Installments
          </TabsTrigger>
        </TabsList>

        <TabsContent value="payments" className="space-y-4">
          {financialWorkspaceEnabled && <OpportunityFinancialWorkspace
            opportunityId={opportunity.id}
            customerName={leadName}
            bookings={opportunity.bookings.map((booking) => ({
              id: booking.id,
              number: booking.number,
              totalAmount: Number(booking.totalAmount || 0),
              status: booking.status,
            }))}
          />}
        </TabsContent>

        <TabsContent value="details" className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-4">
              <DetailSection title="Opportunity Details">
                <DetailField label="Opportunity Name" value={opportunity.title} />
                <DetailField label="Opportunity Number" value={opportunity.opportunityNumber} />
                <DetailField label="Stage" value={<Badge className={cn("capitalize", stageColors[displayStage])}>{displayStage.replace(/-/g, " ")}</Badge>} />
                <DetailField label="Amount" value={formatCurrency(opportunity.value)} />
                <DetailField label="Probability" value={`${opportunity.probability}%`} />
                <DetailField label="Expected Close" value={formatDate(opportunity.closeDate)} />
                <DetailField label="Opportunity Owner" value={opportunity.assignedTo} />
                <DetailField label="Project" value={opportunity.project?.name} />
                <DetailField label="Unit" value={opportunity.unit ? `${opportunity.unit.number}${opportunity.unit.type ? ` · ${opportunity.unit.type}` : ""}` : undefined} />
                <DetailField label="Description" value={opportunity.description} />
              </DetailSection>

              <DetailSection title="Lead Details">
                <DetailField label="Lead" value={opportunity.lead ? <Link className="text-primary hover:underline" href={`/leads/${opportunity.lead.id}`}>{leadName}</Link> : undefined} />
                <DetailField label="Lead ID" value={opportunity.lead?.leadNumber} />
                <DetailField label="Company" value={opportunity.lead?.company} />
                <DetailField label="Phone" value={opportunity.lead?.phone} />
                <DetailField label="Email" value={opportunity.lead?.email} />
                <DetailField label="Lead Status" value={opportunity.lead?.status?.replace(/_/g, " ")} />
              </DetailSection>

              <DetailSection title="Related Records">
                <DetailField label="Site Visit" value={opportunity.siteVisit?.siteVisitNumber} />
                <DetailField label="Quotations" value={opportunity.quotations.length} />
                <DetailField label="Bookings" value={opportunity.bookings.length} />
                <DetailField label="Created" value={formatDateTime(opportunity.createdAt)} />
              </DetailSection>
              {(opportunity.quotations.length > 0 || opportunity.bookings.length > 0 || opportunity.unit) && (
                <Card>
                  <CardContent className="space-y-3 p-4">
                    <h2 className="text-sm font-semibold">Related records</h2>
                    <div className="flex flex-wrap gap-2">
                      {opportunity.quotations.map((quotation) => (
                        <Button key={quotation.id} size="sm" variant="outline" asChild>
                          <Link href={`/quotations/${quotation.id}`}>Quotation {quotation.number || ""} · {quotation.status || "Draft"}</Link>
                        </Button>
                      ))}
                      {opportunity.bookings.map((booking) => (
                        <Button key={booking.id} size="sm" variant="outline" asChild>
                          <Link href={`/bookings/${booking.id}`}>Booking {booking.number || ""} · {booking.status}</Link>
                        </Button>
                      ))}
                      {opportunity.unit && (
                        <span className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm">Unit {opportunity.unit.number}{opportunity.unit.type ? ` · ${opportunity.unit.type}` : ""}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
              {gre && (
                <DetailSection title="Latest GRE Registration">
                  <DetailField label="Reference" value={gre.referenceNumber} />
                  <DetailField label="Submitted" value={gre.submittedAt ? formatDateTime(gre.submittedAt) : undefined} />
                  <DetailField label="Customer" value={greLeadName} />
                  <DetailField label="Email" value={gre.lead?.email} />
                  <DetailField label="Phone" value={gre.lead?.phone} />
                  <DetailField label="Company" value={gre.lead?.company} />
                  <DetailField label="Project" value={gre.siteVisit?.project} />
                  <DetailField label="Visit" value={[gre.siteVisit?.date, gre.siteVisit?.time, gre.siteVisit?.visitType].filter(Boolean).join(" · ")} />
                </DetailSection>
              )}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <StickyNotesCard
                recordId={opportunity.id}
                canAdd={hasEffectivePermission("OPPORTUNITY_EDIT")}
              />
              <Card>
                <CardContent className="p-4">
                  <h2 className="mb-3 text-sm font-semibold">Recent activity and tasks</h2>
                  {[...opportunity.activities.map((activity) => ({ ...activity, recordType: "Activity" })), ...opportunity.tasks.map((task) => ({ ...task, recordType: "Task" }))]
                    .sort((left, right) => new Date(right.createdAt || right.dueDate || 0).getTime() - new Date(left.createdAt || left.dueDate || 0).getTime())
                    .slice(0, 10)
                    .map((item, index) => (
                      <div key={`${item.recordType}-${item.id || index}`} className="border-b py-2 last:border-0">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-sm font-medium">{item.subject || item.title || item.description || item.recordType}</p>
                          <span className="text-xs text-muted-foreground">{formatDateTime(item.createdAt || item.dueDate)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{item.recordType}{item.status ? ` · ${String(item.status).replace(/_/g, " ")}` : ""}</p>
                      </div>
                    ))}
                  {!opportunity.activities.length && !opportunity.tasks.length && (
                    <p className="text-sm text-muted-foreground">No activities or tasks recorded yet.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="quotation" className="space-y-4">
          <DetailSection title="Customer Information">
            <div className="space-y-2 py-3">
              <Label htmlFor="quote-customer-name">Customer Name *</Label>
              <Input id="quote-customer-name" value={quoteCustomerName} onChange={(event) => setQuoteCustomerName(event.target.value)} />
            </div>
            <div className="space-y-2 py-3">
              <Label htmlFor="quote-mobile">Mobile Number</Label>
              <Input id="quote-mobile" value={quoteMobile} onChange={(event) => setQuoteMobile(event.target.value)} />
            </div>
            <div className="space-y-2 py-3">
              <Label htmlFor="quote-email">Email Address</Label>
              <Input id="quote-email" type="email" value={quoteEmail} onChange={(event) => setQuoteEmail(event.target.value)} />
            </div>
            <div className="space-y-2 py-3">
              <Label htmlFor="quote-address">Address</Label>
              <Input id="quote-address" value={quoteAddress} onChange={(event) => setQuoteAddress(event.target.value)} />
            </div>
          </DetailSection>

          <section className="space-y-4 rounded-md border p-4">
            <h2 className="text-sm font-medium">Project & Unit Selection</h2>
            <div className="space-y-2">
              <Label htmlFor="quote-project">Select Project *</Label>
              <select
                id="quote-project"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={quoteProjectId}
                disabled={!quoteProjects.length}
                onChange={(event) => {
                  setQuoteProjectId(event.target.value);
                  setQuoteUnitId("");
                  setQuoteUnits([]);
                }}
              >
                <option value="">{quoteProjects.length ? "Choose a project..." : "No active projects available"}</option>
                {quoteProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </div>

            {quoteProjectId && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>Select Available Unit *</Label>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-green-100" />Available</span>
                    <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-red-100" />Registered</span>
                    <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-amber-100" />Booked</span>
                    <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-gray-200" />Blocked</span>
                  </div>
                </div>
                {quoteUnitsLoading ? (
                  <p className="text-sm text-muted-foreground">Loading units...</p>
                ) : quoteUnits.length ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                    {quoteUnits.map((unit) => {
                      const unitStatus = String(unit.status || "AVAILABLE").toUpperCase();
                      const isAvailable = unitStatus === "AVAILABLE";
                      const statusClass = unitStatus === "AVAILABLE"
                        ? "border-green-200 bg-green-50 text-green-800"
                        : ["BOOKED", "SOLD", "RESERVED", "REGISTERED"].includes(unitStatus)
                          ? "border-red-200 bg-red-50 text-red-700"
                          : unitStatus === "HOLD"
                            ? "border-amber-200 bg-amber-50 text-amber-800"
                            : "border-gray-200 bg-gray-100 text-gray-500";
                      return (
                        <button
                          key={unit.id}
                          type="button"
                          disabled={!isAvailable}
                          aria-pressed={unit.id === quoteUnitId}
                          onClick={() => {
                            setQuoteUnitId(unit.id);
                            setQuoteDescription(`${quoteProjects.find((project) => project.id === quoteProjectId)?.name || "Property"} - Unit ${unit.number}`);
                          }}
                          className={`min-h-[76px] rounded-md border p-2 text-center text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-80 ${statusClass} ${unit.id === quoteUnitId ? "ring-2 ring-primary ring-offset-1" : "hover:border-primary"}`}
                        >
                          <span className="block font-semibold">{unit.number}</span>
                          <span className="block">{unit.type || "Unit"}</span>
                          {unit.area ? <span className="block">{unit.area} sq.ft</span> : null}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No units found for this project.</p>
                )}
              </div>
            )}

            {selectedQuoteUnit && (
              <div className="grid gap-3 rounded-md border border-blue-200 bg-blue-50/70 p-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1"><Label>Unit Number</Label><p className="text-sm font-medium">{selectedQuoteUnit.number}</p></div>
                <div className="space-y-1"><Label>Unit Type</Label><p className="text-sm font-medium">{selectedQuoteUnit.type || "—"}</p></div>
                <div className="space-y-1"><Label>Saleable Area (sq.ft)</Label><p className="text-sm font-medium">{selectedQuoteUnit.area || "—"}</p></div>
                <div className="space-y-2">
                  <Label htmlFor="quote-price-per-sqft">Price per Sq.ft *</Label>
                  <Input id="quote-price-per-sqft" type="number" min="0" step="0.01" value={quotePricePerSqFt} onChange={(event) => setQuotePricePerSqFt(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quote-plc">PLC</Label>
                  <Input id="quote-plc" type="number" min="0" step="0.01" value={quotePlc} onChange={(event) => setQuotePlc(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quote-discount">Discount</Label>
                  <Input id="quote-discount" type="number" min="0" step="0.01" value={quoteDiscount} onChange={(event) => setQuoteDiscount(event.target.value)} />
                </div>
                <div className="space-y-1 sm:col-span-2 lg:col-span-3">
                  <Label>Total Unit Price</Label>
                  <p className="text-lg font-semibold">{formatCurrency(quoteTotalAmount)}</p>
                </div>
              </div>
            )}
          </section>

          <section className="space-y-4 rounded-md border p-4">
            <h2 className="text-sm font-medium">Quotation Details</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="opportunity-quotation-description">Description</Label>
                <Input id="opportunity-quotation-description" value={quoteDescription} onChange={(event) => setQuoteDescription(event.target.value)} />
              </div>
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Select Payment Plan</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {([
                  { id: "10-90", title: "Standard 1-Month 10-90 Plan", rows: [["Installment 1", "10%"], ["Installment 2", "90%"]] },
                  { id: "10-40-50", title: "Standard 1-Month Plan", rows: [["Booking Payment", "10%"], ["Installment 1", "40%"], ["Installment 2", "50%"]] },
                ] as const).map((plan) => (
                  <button key={plan.id} type="button" aria-pressed={quotePaymentPlan === plan.id} onClick={() => setQuotePaymentPlan(plan.id)} className={`rounded-md border p-4 text-left transition-colors ${quotePaymentPlan === plan.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/50"}`}>
                    <span className="block text-center text-sm font-semibold">{plan.title}</span>
                    <span className="mt-3 block space-y-2">
                      {plan.rows.map(([label, percentage]) => (
                        <span key={label} className="flex justify-between gap-4 text-sm text-muted-foreground">
                          <span>{label}</span><span>{percentage}</span>
                        </span>
                      ))}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={handleOpenQuotationConfirmation} disabled={!hasEffectivePermission("QUOTATION_CREATE") || !selectedQuoteUnit || !selectedQuoteUnitAvailable}>
              Generate Quotation
            </Button>
            {bookingQuotationId && <Button variant="outline" asChild>
              <Link href={`/bookings/new?${bookingParams.toString()}`}>Continue to Booking</Link>
            </Button>}
          </section>
        </TabsContent>

        <OpportunityCommercialWorkflows
          opportunity={opportunity}
          showQuotationWorkflow={false}
          receiptTabValue="receipt"
          bookingCreateHref={`/bookings/new?${bookingParams.toString()}`}
        />

      </Tabs>

      <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update contact</DialogTitle>
            <DialogDescription>Changes are saved to the lead linked to this opportunity.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="contact-first-name">First name</Label><Input id="contact-first-name" value={contactDraft.firstName} onChange={(event) => setContactDraft((current) => ({ ...current, firstName: event.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="contact-last-name">Last name *</Label><Input id="contact-last-name" value={contactDraft.lastName} onChange={(event) => setContactDraft((current) => ({ ...current, lastName: event.target.value }))} required /></div>
            <div className="space-y-2"><Label htmlFor="contact-phone">Phone *</Label><Input id="contact-phone" value={contactDraft.phone} onChange={(event) => setContactDraft((current) => ({ ...current, phone: event.target.value }))} required /></div>
            <div className="space-y-2"><Label htmlFor="contact-mobile">Mobile</Label><Input id="contact-mobile" value={contactDraft.mobile} onChange={(event) => setContactDraft((current) => ({ ...current, mobile: event.target.value }))} /></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="contact-email">Email</Label><Input id="contact-email" type="email" value={contactDraft.email} onChange={(event) => setContactDraft((current) => ({ ...current, email: event.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContactDialogOpen(false)} disabled={contactSaving}>Cancel</Button>
            <Button onClick={() => void handleContactUpdate()} disabled={contactSaving || !contactDraft.lastName.trim() || !contactDraft.phone.trim()}>{contactSaving ? "Saving..." : "Save contact"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={followUpDialogOpen} onOpenChange={setFollowUpDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create follow-up</DialogTitle>
            <DialogDescription>Creates a task associated with this opportunity and linked lead.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2"><Label htmlFor="follow-up-title">Subject *</Label><Input id="follow-up-title" value={followUpDraft.title} onChange={(event) => setFollowUpDraft((current) => ({ ...current, title: event.target.value }))} maxLength={255} /></div>
            <div className="space-y-2"><Label htmlFor="follow-up-date">Due date *</Label><Input id="follow-up-date" type="date" value={followUpDraft.dueDate} onChange={(event) => setFollowUpDraft((current) => ({ ...current, dueDate: event.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFollowUpDialogOpen(false)} disabled={followUpSaving}>Cancel</Button>
            <Button onClick={() => void handleCreateFollowUp()} disabled={followUpSaving || !followUpDraft.title.trim() || !followUpDraft.dueDate}>{followUpSaving ? "Creating..." : "Create follow-up"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={quoteConfirmationOpen} onOpenChange={setQuoteConfirmationOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-center text-lg">Property Investment Quotation</DialogTitle>
            <DialogDescription className="text-center">Review the quotation details before confirming and downloading.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="grid gap-4 rounded-md border p-3 sm:grid-cols-2">
              <section className="space-y-1">
                <h3 className="mb-2 font-semibold">Customer Details</h3>
                <p><span className="text-muted-foreground">Customer Name:</span> {quoteCustomerName || "—"}</p>
                <p><span className="text-muted-foreground">Mobile:</span> {quoteMobile || "—"}</p>
                <p><span className="text-muted-foreground">Email:</span> {quoteEmail || "—"}</p>
                <p><span className="text-muted-foreground">Address:</span> {quoteAddress || "—"}</p>
              </section>
              <section className="space-y-1">
                <h3 className="mb-2 font-semibold">Property Details</h3>
                <p><span className="text-muted-foreground">Project:</span> {quoteProjects.find((project) => project.id === quoteProjectId)?.name || "—"}</p>
                <p><span className="text-muted-foreground">Location:</span> {quoteProjects.find((project) => project.id === quoteProjectId)?.city || quoteProjects.find((project) => project.id === quoteProjectId)?.address || "—"}</p>
                <p><span className="text-muted-foreground">Unit:</span> {selectedQuoteUnit?.number || "—"}</p>
                <p><span className="text-muted-foreground">Type / Area:</span> {[selectedQuoteUnit?.type, selectedQuoteUnit?.area ? `${selectedQuoteUnit.area} sq.ft` : ""].filter(Boolean).join(" · ") || "—"}</p>
                <p><span className="text-muted-foreground">Total:</span> <strong>{formatCurrency(quoteTotalAmount)}</strong></p>
              </section>
            </div>
            <section className="overflow-hidden rounded-md border">
              <h3 className="border-b bg-muted/50 px-3 py-2 font-semibold">{quotePaymentPlan === "10-40-50" ? "Standard 1-Month Plan" : "Standard 1-Month 10-90 Plan"}</h3>
              {quotationPlan.map((installment) => (
                <div key={installment.label} className="grid grid-cols-[1fr_auto_auto] gap-3 border-b px-3 py-2 last:border-0">
                  <span>{installment.label} · {installment.milestone}</span>
                  <span>{installment.percentage}%</span>
                  <span className="text-right font-medium">{formatCurrency(quoteTotalAmount * installment.percentage / 100)}</span>
                </div>
              ))}
              <div className="flex justify-between bg-muted/40 px-3 py-2 font-semibold"><span>Total</span><span>{formatCurrency(quoteTotalAmount)}</span></div>
            </section>
            <p className="text-xs text-muted-foreground">Valid for 30 days. All payments follow the schedule. Handover follows completion of all milestones; applicable government fees and charges are extra.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuoteConfirmationOpen(false)} disabled={isGeneratingQuotation}>Cancel</Button>
            <Button onClick={handleGenerateQuotation} disabled={isGeneratingQuotation}>
              {isGeneratingQuotation ? "Generating..." : "Confirm Quotation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
