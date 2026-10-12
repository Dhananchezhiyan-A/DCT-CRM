"use client";

import * as React from "react";
import Link from "next/link";
import { TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import {
  companySettingsApi,
  opportunityApi,
  paymentApi,
  projectApi,
  quotationApi,
  unitApi,
} from "@/lib/api";
type Project = { id: string; name: string };
type Unit = {
  id: string;
  number: string;
  type?: string | null;
  area?: number | null;
  price?: number | null;
  status?: string | null;
};
type PaymentRecord = { id: string; amount?: number; status?: string };
type ReceiptBooking = {
  id: string;
  number: string;
  status: string;
  totalAmount: number;
  quotationId: string;
};
type LeadQuotation = {
  id: string;
  number: string;
  totalAmount: number;
  projectId?: string;
  project?: { id: string; name: string } | null;
  unit?: { id: string; number: string; area?: number | null } | null;
  bookings?: ReceiptBooking[];
};
type CommercialOpportunity = {
  id: string;
  title: string;
  lead?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    mobile?: string | null;
    street?: string | null;
    city?: string | null;
    stateProvince?: string | null;
    postalCode?: string | null;
    country?: string | null;
  } | null;
  project?: { id: string; name: string } | null;
  unit?: { id: string; number: string; area?: number | null; status?: string | null } | null;
  quotations: LeadQuotation[];
  bookings: Array<{ id: string; number: string; status: string; totalAmount: number; quotationId?: string | null }>;
};

const dateInputValue = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

const formatCurrency = (value: number) => new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
}).format(value);

function downloadPdf(blob: Blob, filename: string) {
  const url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ReceiptLine({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-dotted border-slate-300 pb-2">
      <span className="text-slate-600">{label}:</span>
      <span className="break-words text-right font-semibold text-slate-900">{value || "__________"}</span>
    </div>
  );
}

export function OpportunityCommercialWorkflows({
  opportunity,
  showQuotationWorkflow = true,
  receiptTabValue = "receipt",
  bookingCreateHref,
}: {
  opportunity: CommercialOpportunity;
  showQuotationWorkflow?: boolean;
  receiptTabValue?: string;
  bookingCreateHref?: string;
}) {
  const { toast } = useToast();
  const { hasEffectivePermission, tenant } = useAuth();
  const leadName = opportunity.lead
    ? [opportunity.lead.firstName, opportunity.lead.lastName].filter(Boolean).join(" ")
    : "";

  const [projects, setProjects] = React.useState<Project[]>([]);
  const [units, setUnits] = React.useState<Unit[]>([]);
  const [quoteProjectId, setQuoteProjectId] = React.useState(opportunity.project?.id || "");
  const [quoteUnitId, setQuoteUnitId] = React.useState(opportunity.unit?.id || "");
  const [quoteCustomerName, setQuoteCustomerName] = React.useState(leadName);
  const [quoteMobile, setQuoteMobile] = React.useState(opportunity.lead?.mobile || opportunity.lead?.phone || "");
  const [quoteEmail, setQuoteEmail] = React.useState(opportunity.lead?.email || "");
  const [quoteAddress, setQuoteAddress] = React.useState([
    opportunity.lead?.street,
    opportunity.lead?.city,
    opportunity.lead?.stateProvince,
    opportunity.lead?.postalCode,
    opportunity.lead?.country,
  ].filter(Boolean).join(", "));
  const [quoteDescription, setQuoteDescription] = React.useState(opportunity.project?.name || opportunity.title);
  const [pricePerSqFt, setPricePerSqFt] = React.useState("");
  const [plc, setPlc] = React.useState("0");
  const [discount, setDiscount] = React.useState("0");
  const [paymentPlan, setPaymentPlan] = React.useState<"10-90" | "10-40-50">("10-90");
  const [latestQuotationId, setLatestQuotationId] = React.useState(opportunity.quotations[0]?.id || "");
  const [isLoadingProjects, setIsLoadingProjects] = React.useState(true);
  const [isLoadingUnits, setIsLoadingUnits] = React.useState(false);
  const [isGeneratingQuotation, setIsGeneratingQuotation] = React.useState(false);
  const [quotationConfirmationOpen, setQuotationConfirmationOpen] = React.useState(false);
  const [leadQuotations, setLeadQuotations] = React.useState<LeadQuotation[]>(opportunity.quotations);
  const [selectedReceiptQuotationId, setSelectedReceiptQuotationId] = React.useState(opportunity.quotations[0]?.id || "");

  const activeBookings = React.useMemo(
    () => opportunity.bookings.filter((booking) => booking.status !== "CANCELLED"),
    [opportunity.bookings],
  );
  const receiptQuotations = React.useMemo(
    () => leadQuotations.length ? leadQuotations : opportunity.quotations,
    [leadQuotations, opportunity.quotations],
  );
  const quotationBookings = React.useMemo<ReceiptBooking[]>(
    () => receiptQuotations.flatMap((quotation) => {
      const quotationBookings = quotation.bookings?.length
        ? quotation.bookings
        : activeBookings.filter((booking) => booking.quotationId === quotation.id);
      return quotationBookings
        .filter((booking) => booking.status !== "CANCELLED")
        .map((booking) => ({ ...booking, quotationId: quotation.id }));
    }),
    [activeBookings, receiptQuotations],
  );
  const selectedReceiptQuotation = React.useMemo(
    () => receiptQuotations.find((quotation) => quotation.id === selectedReceiptQuotationId),
    [receiptQuotations, selectedReceiptQuotationId],
  );
  const selectedQuotationBookings = React.useMemo(
    () => quotationBookings.filter((booking) => booking.quotationId === selectedReceiptQuotationId),
    [quotationBookings, selectedReceiptQuotationId],
  );
  const [receiptBookingId, setReceiptBookingId] = React.useState(quotationBookings[0]?.id || "");
  const [receiptAmount, setReceiptAmount] = React.useState("");
  const [receiptPayer, setReceiptPayer] = React.useState(leadName);
  const [receiptMode, setReceiptMode] = React.useState("");
  const [receiptReference, setReceiptReference] = React.useState("");
  const [receiptDate, setReceiptDate] = React.useState(dateInputValue);
  const [receiptDocumentDate, setReceiptDocumentDate] = React.useState(dateInputValue);
  const [receiptGenerated, setReceiptGenerated] = React.useState(false);
  const [savedPayment, setSavedPayment] = React.useState<PaymentRecord | null>(null);
  const [isSavingReceipt, setIsSavingReceipt] = React.useState(false);
  const [receiptCompany, setReceiptCompany] = React.useState<Record<string, string> | null>(null);
  const [financialSummary, setFinancialSummary] = React.useState<{ payments?: Array<{ id: string; bookingId: string; amount: number; status: string; receipt?: { status: string } | null }> } | null>(null);
  const [financialSummaryRefresh, setFinancialSummaryRefresh] = React.useState(0);
  const selectedBooking = React.useMemo(
    () => selectedQuotationBookings.find((booking) => booking.id === receiptBookingId),
    [receiptBookingId, selectedQuotationBookings],
  );
  const selectedQuotation = selectedReceiptQuotation;
  const selectedBookingPayments = financialSummary?.payments?.filter((payment) => payment.bookingId === selectedBooking?.id) || [];
  const previouslyReceived = selectedBookingPayments
    .filter((payment) => ["VERIFIED", "COMPLETED"].includes(payment.status) && payment.receipt?.status !== "CANCELLED")
    .reduce((sum, payment) => sum + Number(payment.amount), 0);
  const summaryPendingPayments = selectedBookingPayments.filter((payment) => ["PENDING", "PARTIAL"].includes(payment.status));
  const pendingAmount = summaryPendingPayments.reduce((sum, payment) => sum + Number(payment.amount), 0)
    + (savedPayment && !summaryPendingPayments.some((payment) => payment.id === savedPayment.id) ? Number(savedPayment.amount || 0) : 0);
  const quotationAmount = Number(selectedQuotation?.totalAmount || selectedBooking?.totalAmount || 0);
  const currentBalance = Math.max(0, quotationAmount - previouslyReceived);
  const availableBalance = Math.max(0, currentBalance - pendingAmount);
  const amountAfterCurrentReceipt = previouslyReceived + pendingAmount + (savedPayment ? 0 : Number(receiptAmount || 0));
  const balanceAfterCurrentReceipt = Math.max(0, quotationAmount - amountAfterCurrentReceipt);
  const selectedQuotationBookingHref = React.useMemo(() => {
    if (!selectedReceiptQuotation) return "";
    const params = new URLSearchParams({
      opportunityId: opportunity.id,
      quotationId: selectedReceiptQuotation.id,
      projectId: selectedReceiptQuotation.projectId || selectedReceiptQuotation.project?.id || "",
      unitId: selectedReceiptQuotation.unit?.id || "",
      totalAmount: String(selectedReceiptQuotation.totalAmount),
      ...(opportunity.lead?.id ? { leadId: opportunity.lead.id } : {}),
    });
    return `/bookings/new?${params.toString()}`;
  }, [opportunity.id, opportunity.lead?.id, selectedReceiptQuotation]);

  React.useEffect(() => {
    if (!opportunity.lead?.id || showQuotationWorkflow) return;
    let cancelled = false;
    quotationApi.list({ leadId: opportunity.lead.id, limit: 100 }).then((response) => {
      if (!response.data?.success || !Array.isArray(response.data.data)) {
        throw new Error(response.data?.error || "Could not load this lead's quotations.");
      }
      if (cancelled) return;
      const quotations = response.data.data as LeadQuotation[];
      setLeadQuotations(quotations);
      const firstQuotation = quotations[0];
      setSelectedReceiptQuotationId(firstQuotation?.id || "");
      const firstBooking = firstQuotation?.bookings?.find((booking) => booking.status !== "CANCELLED");
      setReceiptBookingId(firstBooking?.id || "");
    }).catch((error: any) => {
      if (!cancelled) {
        toast({ title: "Unable to load lead quotations", description: error?.response?.data?.error || error?.message || "Retry the Opportunity page.", variant: "destructive" as any });
      }
    });
    return () => { cancelled = true; };
  }, [opportunity.lead?.id, showQuotationWorkflow, toast]);

  React.useEffect(() => {
    if (!selectedBooking) {
      setFinancialSummary(null);
      return;
    }
    let cancelled = false;
    opportunityApi.financialSummary(opportunity.id).then((response) => {
      if (!response.data?.success || !response.data.data) {
        throw new Error(response.data?.error || "Failed to load payment summary");
      }
      if (!cancelled) setFinancialSummary(response.data.data);
    }).catch((error: any) => {
      if (!cancelled) {
        setFinancialSummary(null);
        toast({ title: "Unable to load payment summary", description: error?.response?.data?.error || error?.message || "Retry the quotation page.", variant: "destructive" as any });
      }
    });
    return () => { cancelled = true; };
  }, [opportunity.id, selectedBooking, financialSummaryRefresh, toast]);

  React.useEffect(() => {
    if (!showQuotationWorkflow) {
      setIsLoadingProjects(false);
      return;
    }
    let cancelled = false;
    projectApi.list({ page: 1, limit: 100, isActive: true }).then((response) => {
      if (!response.data?.success || !Array.isArray(response.data.data)) {
        throw new Error(response.data?.error || "Failed to load projects");
      }
      if (!cancelled) setProjects(response.data.data);
    }).catch((error: any) => {
      if (!cancelled) {
        toast({ title: "Error", description: error?.response?.data?.error || error?.message || "Failed to load projects", variant: "destructive" as any });
      }
    }).finally(() => {
      if (!cancelled) setIsLoadingProjects(false);
    });
    return () => { cancelled = true; };
  }, [showQuotationWorkflow, toast]);

  React.useEffect(() => {
    if (!showQuotationWorkflow) return;
    if (!quoteProjectId) {
      setUnits([]);
      setQuoteUnitId("");
      return;
    }
    let cancelled = false;
    setIsLoadingUnits(true);
    unitApi.list({ page: 1, limit: 200, projectId: quoteProjectId }).then((response) => {
      if (!response.data?.success || !Array.isArray(response.data.data)) {
        throw new Error(response.data?.error || "Failed to load project units");
      }
      if (!cancelled) {
        setUnits(response.data.data);
      }
    }).catch((error: any) => {
      if (!cancelled) {
        setUnits([]);
        toast({ title: "Error", description: error?.response?.data?.error || error?.message || "Failed to load project units", variant: "destructive" as any });
      }
    }).finally(() => {
      if (!cancelled) setIsLoadingUnits(false);
    });
    return () => { cancelled = true; };
  }, [quoteProjectId, showQuotationWorkflow, toast]);

  React.useEffect(() => {
    companySettingsApi.get().then((response) => {
      if (!response.data?.success) {
        throw new Error(response.data?.error || "Failed to load company receipt details");
      }
      setReceiptCompany(response.data.data || null);
    }).catch((error: any) => {
      setReceiptCompany(null);
      toast({ title: "Error", description: error?.response?.data?.error || error?.message || "Failed to load company receipt details", variant: "destructive" as any });
    });
  }, [toast]);

  const selectedUnit = units.find((unit) => unit.id === quoteUnitId);
  const area = Number(selectedUnit?.area || 0);
  const baseAmount = area > 0
    ? area * Number(pricePerSqFt || 0)
    : Number(selectedUnit?.price || 0);
  const totalAmount = Math.max(0, baseAmount + Number(plc || 0) - Number(discount || 0));

  React.useEffect(() => {
    if (!selectedUnit) return;
    const unitArea = Number(selectedUnit.area || 0);
    const unitPrice = Number(selectedUnit.price || 0);
    setPricePerSqFt(unitArea > 0 && unitPrice > 0 ? String(unitPrice / unitArea) : "");
    setPlc("0");
    setDiscount("0");
    const projectName = projects.find((project) => project.id === quoteProjectId)?.name || opportunity.project?.name || "Property";
    setQuoteDescription(`${projectName} - Unit ${selectedUnit.number}`);
  }, [quoteUnitId, selectedUnit, projects, quoteProjectId, opportunity.project?.name]);

  const handleCreateQuotation = async () => {
    if (!opportunity.lead?.id || !quoteCustomerName.trim() || !quoteProjectId || !selectedUnit || !quoteDescription.trim()
      || !Number.isFinite(totalAmount) || totalAmount <= 0
      || !Number.isFinite(Number(plc)) || Number(plc) < 0
      || !Number.isFinite(Number(discount)) || Number(discount) < 0
      || (area > 0 && (!Number.isFinite(Number(pricePerSqFt)) || Number(pricePerSqFt) <= 0))) {
      toast({ title: "Quotation details required", description: "Complete customer details, select a project and unit, and enter valid pricing.", variant: "destructive" as any });
      return;
    }

    setIsGeneratingQuotation(true);
    try {
      const response = await quotationApi.create({
        leadId: opportunity.lead.id,
        opportunityId: opportunity.id,
        projectId: quoteProjectId,
        paymentPlan,
        notes: `QUOTE_PDF_DATA:${JSON.stringify({
          customerName: quoteCustomerName.trim(),
          mobile: quoteMobile.trim(),
          email: quoteEmail.trim(),
          address: quoteAddress.trim(),
          paymentPlan,
          pricePerSqFt: Number(pricePerSqFt || 0),
          plc: Number(plc),
          discount: Number(discount),
        })}`,
        items: [{
          unitId: selectedUnit.id,
          description: quoteDescription.trim(),
          quantity: 1,
          unitPrice: totalAmount,
        }],
      });
      const quotation = response.data?.data;
      if (!response.data?.success || !quotation?.id) {
        throw new Error(response.data?.error || "Quotation was not created");
      }
      setLatestQuotationId(quotation.id);
      setQuotationConfirmationOpen(false);
      try {
        const pdfResponse = await quotationApi.downloadPdf(quotation.id);
        downloadPdf(pdfResponse.data, `${quotation.number || "quotation"}.pdf`);
        toast({ title: "Quotation downloaded", description: `${quotation.number || "Quotation"} was saved to your downloads.` });
      } catch (error: any) {
        toast({ title: "Quotation created", description: error?.response?.data?.error || "PDF download failed. Retry from the Quotations page.", variant: "destructive" as any });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error?.response?.data?.error || error?.message || "Failed to create quotation", variant: "destructive" as any });
    } finally {
      setIsGeneratingQuotation(false);
    }
  };

  const bookingParams = new URLSearchParams({
    opportunityId: opportunity.id,
    quotationId: latestQuotationId || opportunity.quotations[0]?.id || "",
    projectId: quoteProjectId || opportunity.project?.id || "",
    unitId: quoteUnitId || opportunity.unit?.id || "",
    totalAmount: String(totalAmount || opportunity.quotations[0]?.totalAmount || 0),
    ...(opportunity.lead?.id ? { leadId: opportunity.lead.id } : {}),
  });

  const updateReceiptDraft = () => {
    setSavedPayment(null);
    setReceiptGenerated(false);
  };

  const handleRecordReceipt = async () => {
    const amount = Number(receiptAmount);
    if (!selectedBooking || !receiptPayer.trim() || !Number.isFinite(amount) || amount <= 0 || amount > availableBalance) {
      toast({ title: "Receipt details required", description: `Enter the payer name and a valid amount no greater than the available balance of ${formatCurrency(availableBalance)}.`, variant: "destructive" as any });
      return;
    }
    setIsSavingReceipt(true);
    try {
      const response = await paymentApi.create({
        bookingId: selectedBooking.id,
        amount,
        paymentDate: receiptDate ? new Date(`${receiptDate}T00:00:00`).toISOString() : undefined,
        reference: receiptReference.trim() || undefined,
        notes: [
          `Payer: ${receiptPayer.trim()}`,
          receiptMode ? `Payment mode: ${receiptMode}` : "",
        ].filter(Boolean).join("\n"),
      });
      const payment = response.data?.data;
      if (!response.data?.success || !payment?.id) {
        throw new Error(response.data?.error || "Payment was not recorded");
      }
      setSavedPayment({ id: payment.id, amount, status: payment.status });
      setReceiptGenerated(true);
      setFinancialSummaryRefresh((value) => value + 1);
      toast({
        title: "Payment recorded",
        description: payment.status === "COMPLETED"
          ? "Payment was recorded and the receipt is ready."
          : "Payment was recorded pending verification. The printable receipt will show its status.",
      });
    } catch (error: any) {
      toast({ title: "Error", description: error?.response?.data?.error || error?.message || "Failed to record payment", variant: "destructive" as any });
    } finally {
      setIsSavingReceipt(false);
    }
  };

  const companyName = receiptCompany?.name || tenant?.name || "Company";
  const companyAddress = [receiptCompany?.address, receiptCompany?.city, receiptCompany?.state, receiptCompany?.country].filter(Boolean).join(", ");
  const displayDate = (value: string) => value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-IN") : "__________";

  return (
    <>
      {showQuotationWorkflow && !activeBookings.length && <TabsContent value="quotation" className="space-y-4">
        <Card>
          <CardHeader><CardTitle>Customer Information</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="quote-customer-name">Customer Name *</Label><Input id="quote-customer-name" value={quoteCustomerName} onChange={(event) => setQuoteCustomerName(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="quote-mobile">Mobile Number</Label><Input id="quote-mobile" value={quoteMobile} onChange={(event) => setQuoteMobile(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="quote-email">Email Address</Label><Input id="quote-email" type="email" value={quoteEmail} onChange={(event) => setQuoteEmail(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="quote-address">Address</Label><Input id="quote-address" value={quoteAddress} onChange={(event) => setQuoteAddress(event.target.value)} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Project and Unit</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="quote-project">Project *</Label>
              <select id="quote-project" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={quoteProjectId} disabled={isLoadingProjects || Boolean(opportunity.project?.id)} onChange={(event) => { setQuoteProjectId(event.target.value); setQuoteUnitId(""); }}>
                <option value="">{isLoadingProjects ? "Loading projects..." : "Select a project"}</option>
                {projects.filter((project) => !opportunity.project?.id || project.id === opportunity.project.id).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
              {opportunity.project?.id && <p className="text-xs text-muted-foreground">This opportunity is already associated with {opportunity.project.name}.</p>}
            </div>
            {quoteProjectId && <div className="space-y-2">
              <Label htmlFor="quote-unit">Unit *</Label>
              <select id="quote-unit" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={quoteUnitId} disabled={isLoadingUnits} onChange={(event) => setQuoteUnitId(event.target.value)}>
                <option value="">{isLoadingUnits ? "Loading units..." : "Select a unit"}</option>
                {units.map((unit) => <option key={unit.id} value={unit.id} disabled={unit.status !== "AVAILABLE" && unit.id !== opportunity.unit?.id}>
                  {unit.number}{unit.type ? ` · ${unit.type}` : ""}{unit.area ? ` · ${unit.area} sq.ft` : ""}{unit.status && unit.status !== "AVAILABLE" ? ` · ${unit.status}` : ""}
                </option>)}
              </select>
            </div>}
            {selectedUnit && <div className="grid gap-4 rounded-md border bg-muted/20 p-4 sm:grid-cols-2 lg:grid-cols-3">
              <div><p className="text-xs text-muted-foreground">Unit</p><p className="text-sm font-medium">{selectedUnit.number} · {selectedUnit.type || "Unit"}</p></div>
              <div><p className="text-xs text-muted-foreground">Saleable Area</p><p className="text-sm font-medium">{selectedUnit.area || "—"} sq.ft</p></div>
              {area > 0 && <div className="space-y-2"><Label htmlFor="quote-price-per-sqft">Price per Sq.ft *</Label><Input id="quote-price-per-sqft" type="number" min="0" step="0.01" value={pricePerSqFt} onChange={(event) => setPricePerSqFt(event.target.value)} /></div>}
              <div className="space-y-2"><Label htmlFor="quote-plc">PLC</Label><Input id="quote-plc" type="number" min="0" step="0.01" value={plc} onChange={(event) => setPlc(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="quote-discount">Discount</Label><Input id="quote-discount" type="number" min="0" step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="quote-description">Quotation Description *</Label><Input id="quote-description" value={quoteDescription} onChange={(event) => setQuoteDescription(event.target.value)} /></div>
              <div className="sm:col-span-2 lg:col-span-3"><p className="text-xs text-muted-foreground">Total = Area × Price per Sq.ft (or unit price) + PLC − Discount</p><p className="text-lg font-semibold">{formatCurrency(totalAmount)}</p></div>
            </div>}

            <div className="space-y-3">
              <h3 className="text-sm font-medium">Payment Plan</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" aria-pressed={paymentPlan === "10-90"} onClick={() => setPaymentPlan("10-90")} className={`rounded-md border p-3 text-left ${paymentPlan === "10-90" ? "border-primary bg-primary/5 ring-1 ring-primary" : ""}`}>
                  <span className="block font-medium">Standard 1-Month 10-90 Plan</span><span className="text-sm text-muted-foreground">10% within 10 days · 90% within 30 days</span>
                </button>
                <button type="button" aria-pressed={paymentPlan === "10-40-50"} onClick={() => setPaymentPlan("10-40-50")} className={`rounded-md border p-3 text-left ${paymentPlan === "10-40-50" ? "border-primary bg-primary/5 ring-1 ring-primary" : ""}`}>
                  <span className="block font-medium">Standard 1-Month 10-40-50 Plan</span><span className="text-sm text-muted-foreground">10% booking · 40% within 10 days · 50% within 30 days</span>
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => {
                if (!hasEffectivePermission("QUOTATION_CREATE")) return;
                if (!opportunity.lead?.id || !selectedUnit || totalAmount <= 0) {
                  toast({ title: "Quotation details required", description: "A linked lead, project, available unit, and valid price are required.", variant: "destructive" as any });
                  return;
                }
                setQuotationConfirmationOpen(true);
              }} disabled={!hasEffectivePermission("QUOTATION_CREATE") || isGeneratingQuotation || !selectedUnit}>
                Generate Quotation
              </Button>
              {latestQuotationId && <Button variant="outline" asChild><Link href={`/bookings/new?${bookingParams.toString()}`}>Continue to Booking</Link></Button>}
            </div>
          </CardContent>
        </Card>
        {quotationConfirmationOpen && <div role="dialog" aria-modal="true" aria-labelledby="quote-confirm-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="max-h-[90vh] w-full max-w-xl overflow-auto">
            <CardHeader><CardTitle id="quote-confirm-title">Confirm Quotation</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p><strong>Customer:</strong> {quoteCustomerName}</p>
              <p><strong>Project:</strong> {projects.find((project) => project.id === quoteProjectId)?.name || "—"}</p>
              <p><strong>Unit:</strong> {selectedUnit?.number || "—"}</p>
              <p><strong>Total:</strong> {formatCurrency(totalAmount)}</p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setQuotationConfirmationOpen(false)} disabled={isGeneratingQuotation}>Cancel</Button>
                <Button onClick={handleCreateQuotation} disabled={isGeneratingQuotation}>{isGeneratingQuotation ? "Generating..." : "Confirm and Download"}</Button>
              </div>
            </CardContent>
          </Card>
        </div>}
      </TabsContent>}

      <TabsContent value={receiptTabValue} className="space-y-4">
        <Card>
          <CardContent className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:items-center">
            <Label htmlFor="receipt-quotation-select">Lead quotation</Label>
            <select
              id="receipt-quotation-select"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={selectedReceiptQuotationId}
              onChange={(event) => {
                const quotationId = event.target.value;
                const nextBooking = quotationBookings.find((booking) => booking.quotationId === quotationId);
                setSelectedReceiptQuotationId(quotationId);
                setReceiptBookingId(nextBooking?.id || "");
                setReceiptAmount("");
                setSavedPayment(null);
                setReceiptGenerated(false);
              }}
              disabled={!receiptQuotations.length}
            >
              {!receiptQuotations.length && <option value="">No quotations found for this lead</option>}
              {receiptQuotations.map((quotation) => (
                <option key={quotation.id} value={quotation.id}>
                  {quotation.number} · {formatCurrency(Number(quotation.totalAmount))}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>
        {!selectedBooking ? (
          <Card><CardContent className="py-8 text-sm text-muted-foreground">
            {selectedReceiptQuotation
              ? `Create a booking for quotation ${selectedReceiptQuotation.number} to reserve its unit, then return here to record a partial payment. The remaining balance will update automatically. Finance issues the official receipt after verifying the payment.`
              : "This lead has no quotations yet. Create a quotation first, then return here to record a partial payment."}
            {selectedReceiptQuotation && hasEffectivePermission("BOOKING_CREATE") && (
              <div className="mt-4">
                <Button asChild><Link href={selectedQuotationBookingHref || bookingCreateHref || "/bookings/new"}>Create Booking &amp; Reserve Unit</Link></Button>
              </div>
            )}
          </CardContent></Card>
        ) : (
          <>
        <div className="mx-auto w-full max-w-6xl rounded-md border bg-white px-4 py-5 shadow-sm sm:px-8">
          <h1 className="pb-8 text-center text-4xl font-bold tracking-tight text-slate-800">Receipt Generator</h1>
          <Card className="border-0 shadow-none">
            <CardHeader className="px-0 pb-1"><CardTitle className="text-2xl">Receipt Details</CardTitle></CardHeader>
            <CardContent className="space-y-4 px-0">
              <div className="grid gap-x-5 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2"><Label htmlFor="receipt-document-date">Date</Label><Input id="receipt-document-date" type="date" value={receiptDocumentDate} onChange={(event) => { setReceiptDocumentDate(event.target.value); updateReceiptDraft(); }} /></div>
                <div className="space-y-2"><Label htmlFor="receipt-payer">Received with Thanks From</Label><Input id="receipt-payer" placeholder="Enter payer name" value={receiptPayer} onChange={(event) => { setReceiptPayer(event.target.value); updateReceiptDraft(); }} /></div>
                <div className="space-y-2"><Label htmlFor="receipt-amount">Amount (₹)</Label><Input id="receipt-amount" type="number" min="0.01" max={availableBalance} step="0.01" placeholder="Enter amount" value={receiptAmount} onChange={(event) => { setReceiptAmount(event.target.value); updateReceiptDraft(); }} /><p className="text-xs text-muted-foreground">Available to record: {formatCurrency(availableBalance)}</p></div>
                <div className="space-y-2"><Label htmlFor="receipt-mode">Mode of Payment</Label><select id="receipt-mode" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={receiptMode} onChange={(event) => { setReceiptMode(event.target.value); updateReceiptDraft(); }}><option value="">Select payment mode</option>{["Cash", "Cheque", "Bank Transfer", "UPI", "Card", "Online"].map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select></div>
                <div className="space-y-2"><Label htmlFor="receipt-reference">Transaction Id</Label><Input id="receipt-reference" placeholder="Enter transaction id" value={receiptReference} onChange={(event) => { setReceiptReference(event.target.value); updateReceiptDraft(); }} /></div>
                <div className="space-y-2"><Label htmlFor="receipt-date">Received Date</Label><Input id="receipt-date" type="date" value={receiptDate} onChange={(event) => { setReceiptDate(event.target.value); updateReceiptDraft(); }} /></div>
              </div>
              <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-600">
                Against quotation <span className="font-semibold text-slate-900">{selectedQuotation?.number || "—"}</span>
                {" · "}Booking <span className="font-semibold text-slate-900">{selectedBooking?.number || "—"}</span>
                {selectedQuotationBookings.length > 1 && (
                  <select
                    aria-label="Select booking for quotation"
                    className="ml-3 h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={receiptBookingId}
                    onChange={(event) => { setReceiptBookingId(event.target.value); updateReceiptDraft(); }}
                  >
                    {selectedQuotationBookings.map((booking) => <option key={booking.id} value={booking.id}>{booking.number}</option>)}
                  </select>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  ["Quotation Amount", quotationAmount],
                  ["Previously Received", previouslyReceived],
                  ["Current Balance", currentBalance],
                  ["Paid + Pending After This Payment", amountAfterCurrentReceipt],
                  ["Balance After This Receipt", balanceAfterCurrentReceipt],
                ].map(([label, amount]) => (
                  <div key={String(label)} className="rounded-md border bg-white p-3">
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="mt-1 font-semibold text-slate-900">{formatCurrency(Number(amount))}</p>
                  </div>
                ))}
              </div>
              {pendingAmount > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <span>{formatCurrency(pendingAmount)} is already pending verification and counts toward the balance. Available to record now: {formatCurrency(availableBalance)}.</span>
                  <Button size="sm" variant="outline" asChild><Link href={`/opportunities/${opportunity.id}?tab=payments`}>Review pending payments</Link></Button>
                </div>
              )}
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => {
                if (!receiptPayer.trim() || !selectedBooking || !Number.isFinite(Number(receiptAmount)) || Number(receiptAmount) <= 0 || Number(receiptAmount) > availableBalance) {
                  toast({ title: "Receipt details required", description: `Enter the payer name and an amount no greater than ${formatCurrency(availableBalance)}.`, variant: "destructive" as any });
                  return;
                }
                setSavedPayment(null);
                setReceiptGenerated(true);
              }}>Preview Receipt</Button>
              <Button onClick={handleRecordReceipt} disabled={isSavingReceipt || !hasEffectivePermission("PAYMENT_CREATE") || !selectedBooking}>
                {isSavingReceipt ? "Recording..." : "Record Payment"}
              </Button>
              <Button variant="outline" onClick={() => window.print()} disabled={!receiptGenerated}>Print Receipt</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Recording a payment creates it as pending verification. It will appear in the Receipt Register only after Finance verifies the payment and issues the official receipt. A preview alone does not record payment.
            </p>
            {savedPayment && (
              <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <span>Payment recorded ({savedPayment.status}). Verify it and issue the official receipt before it appears in the Receipt Register.</span>
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/opportunities/${opportunity.id}?tab=payments`}>Go to Payments & Installments</Link>
                </Button>
              </div>
            )}
            </CardContent>
          </Card>
        </div>
        {receiptGenerated && <div className="receipt-print-shell mx-auto w-full max-w-4xl rounded-xl border bg-white p-5 shadow-sm sm:p-8">
          <div className="mx-auto min-h-[620px] max-w-3xl border border-slate-700 px-6 py-8 text-slate-800 sm:px-10">
            <header className="border-b border-slate-300 pb-4 text-center">
              <p className="text-2xl font-bold">{companyName}</p>
              {companyAddress && <p className="mt-2 text-xs text-slate-600">{companyAddress}</p>}
              {(receiptCompany?.phone || receiptCompany?.email) && <p className="mt-1 text-xs text-slate-600">{receiptCompany.phone}{receiptCompany.phone && receiptCompany.email ? " | " : ""}{receiptCompany.email}</p>}
              <h2 className="mt-4 text-3xl font-bold">PAYMENT RECEIPT</h2>
              {savedPayment && <p className="mt-2 text-xs font-semibold uppercase text-amber-700">Pending verification</p>}
              {!savedPayment && <p className="mt-2 text-xs font-semibold uppercase text-slate-500">Preview only — payment not recorded</p>}
            </header>
            <div className="grid gap-x-10 gap-y-5 py-6 text-sm sm:grid-cols-2">
              <ReceiptLine label="Receipt Date" value={displayDate(receiptDocumentDate)} />
              <ReceiptLine label="Project Name" value={selectedQuotation?.project?.name || opportunity.project?.name} />
              <ReceiptLine label="Quotation" value={selectedQuotation?.number} />
              <div className="sm:col-span-2"><ReceiptLine label="Received with thanks from" value={receiptPayer.trim()} /></div>
              <div className="sm:col-span-2"><ReceiptLine label="For the sum of Rupees" value={formatCurrency(Number(receiptAmount) || 0)} /></div>
              <ReceiptLine label="Balance remaining after this payment" value={formatCurrency(balanceAfterCurrentReceipt)} />
              <ReceiptLine label="Booking" value={selectedBooking?.number} />
              <ReceiptLine label="Plot / Unit No." value={selectedQuotation?.unit?.number || opportunity.unit?.number} />
              <ReceiptLine label="Area" value={selectedQuotation?.unit?.area ? `${selectedQuotation.unit.area} sq.ft` : opportunity.unit?.area ? `${opportunity.unit.area} sq.ft` : ""} />
              <ReceiptLine label="Mode" value={receiptMode} />
              <ReceiptLine label="Received Date" value={displayDate(receiptDate)} />
              <ReceiptLine label="Transaction ID" value={receiptReference.trim()} />
              {savedPayment && <div className="sm:col-span-2"><ReceiptLine label="Payment Reference" value={`RCP-${savedPayment.id.slice(-8).toUpperCase()}`} /></div>}
            </div>
            <footer className="mt-10 border-t border-slate-200 pt-5 text-xs text-slate-600">
              <p className="font-semibold text-slate-800">Terms and Conditions</p>
              <p>This receipt reflects the payment record shown above. Payment is subject to verification.</p>
              <p>Please retain this receipt for your records.</p>
            </footer>
          </div>
        </div>}
          </>
        )}
        <style jsx global>{`
          @media print {
            body * { visibility: hidden !important; }
            .receipt-print-shell, .receipt-print-shell * { visibility: visible !important; }
            .receipt-print-shell { position: absolute !important; inset: 0 !important; width: 100% !important; max-width: none !important; border: 0 !important; box-shadow: none !important; }
          }
        `}</style>
      </TabsContent>
    </>
  );
}
