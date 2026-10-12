"use client";

import { formatDate, formatDateTime } from "@/lib/date-format";

import * as React from "react";

import { useParams, useRouter } from "next/navigation";

import Link from "next/link";

import { quotationApi } from "@/lib/api";
import { RecordPageHeader } from "@/components/crm/record-page-header";
import { RecordSummary } from "@/components/crm/record-summary";

import { useToast } from "@/hooks/use-toast";

import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Separator } from "@/components/ui/separator";

import { Skeleton } from "@/components/ui/skeleton";

import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  XCircle,
  Send,
  FileText,
  History,
  StickyNote,
  Receipt,
} from "lucide-react";

interface QuotationData {
  id: string;
  quotationNumber: string;
  leadName: string;
  projectName: string;
  amount: number;
  receivedAmount: number;
  balanceAmount: number;
  status: string;
  validUntil: string;
  createdAt: string;
  updatedAt: string;
  opportunityId?: string | null;
  lead?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  opportunity?: { id: string; name: string } | null;
  project?: { id: string; name: string } | null;
  items?: Array<{ unit?: { id: string; number: string; area?: number | null; price?: number | null; status?: string | null } | null }>;
  bookings?: Array<{ id: string; number: string; status: string; totalAmount: number }>;
  receipts?: Array<{ id: string; receiptNumber: string; amount: number; status: string; receiptDate: string; bookingId: string }>;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info"> = {
  draft: "secondary",
  submitted: "info",
  approved: "success",
  rejected: "destructive",
  expired: "warning",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired",
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
};

export default function QuotationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [quotation, setQuotation] = React.useState<QuotationData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState("details");

  React.useEffect(() => {
    const fetchQuotation = async () => {
      try {
        setIsLoading(true);
        const res = await quotationApi.get(params.id as string);
        if (res.data.success && res.data.data) {
          const record = res.data.data;
          setQuotation({
            ...record,
            quotationNumber: record.number || record.quotationNumber,
            leadName: record.lead ? `${record.lead.firstName || ""} ${record.lead.lastName || ""}`.trim() : "—",
            projectName: record.project?.name || "—",
            amount: Number(record.totalAmount ?? record.amount ?? 0),
            receivedAmount: Number(record.receivedAmount || 0),
            balanceAmount: Number(record.balanceAmount ?? record.totalAmount ?? 0),
            status: String(record.status || "draft").toLowerCase(),
          });
        } else {
          toast({ title: "Error", description: "Quotation not found", variant: "destructive" as any });
          router.push("/quotations");
        }
      } catch {
        toast({ title: "Error", description: "Failed to load quotation", variant: "destructive" as any });
      } finally {
        setIsLoading(false);
      }
    };
    fetchQuotation();
  }, [params.id, router, toast]);

  const handleSubmit = async () => {
    try {
      const res = await quotationApi.submit(params.id as string);
      if (res.data.success) {
        toast({ title: "Success", description: "Quotation submitted" });
        setQuotation((prev) => (prev ? { ...prev, status: "submitted" } : prev));
      }
    } catch {
      toast({ title: "Error", description: "Failed to submit quotation", variant: "destructive" as any });
    }
  };

  const handleApprove = async () => {
    try {
      const res = await quotationApi.approve(params.id as string);
      if (res.data.success) {
        toast({ title: "Success", description: "Quotation approved" });
        setQuotation((prev) => (prev ? { ...prev, status: "approved" } : prev));
      }
    } catch {
      toast({ title: "Error", description: "Failed to approve quotation", variant: "destructive" as any });
    }
  };

  const handleReject = async () => {
    try {
      const res = await quotationApi.reject(params.id as string, "Rejected by admin");
      if (res.data.success) {
        toast({ title: "Success", description: "Quotation rejected" });
        setQuotation((prev) => (prev ? { ...prev, status: "rejected" } : prev));
      }
    } catch {
      toast({ title: "Error", description: "Failed to reject quotation", variant: "destructive" as any });
    }
  };

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
        <div className="grid gap-6 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
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

  if (!quotation) return null;

  return (
    <div className="space-y-6">
      <RecordPageHeader
        objectLabel="Quotation"
        title={quotation.quotationNumber}
        subtitle={`For ${quotation.leadName}`}
        backHref="/quotations"
        icon={<FileText className="h-5 w-5" aria-hidden="true" />}
        badges={<Badge variant={STATUS_VARIANT[quotation.status] || "default"}>{STATUS_LABEL[quotation.status] || quotation.status}</Badge>}
        actions={
          <>
          {quotation.status === "draft" && (
            <Button onClick={handleSubmit}>
              <Send className="mr-2 h-4 w-4" />
              Submit
            </Button>
          )}
          {quotation.status === "submitted" && (
            <>
              <Button onClick={handleApprove}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Approve
              </Button>
              <Button variant="destructive" onClick={handleReject}>
                <XCircle className="mr-2 h-4 w-4" />
                Reject
              </Button>
            </>
          )}
          </>
        }
      />

      <RecordSummary items={[
        { label: "Amount", value: formatCurrency(quotation.amount) },
        { label: "Received", value: formatCurrency(quotation.receivedAmount) },
        { label: "Balance", value: formatCurrency(quotation.balanceAmount) },
        { label: "Status", value: STATUS_LABEL[quotation.status] || quotation.status },
        { label: "Valid Until", value: formatDate(quotation.validUntil) },
        { label: "Created", value: formatDate(quotation.createdAt) },
      ]} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="details" className="gap-2">
            <FileText className="h-4 w-4" />
            Details
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-2">
            <History className="h-4 w-4" />
            Activity
          </TabsTrigger>
          <TabsTrigger value="notes" className="gap-2">
            <StickyNote className="h-4 w-4" />
            Notes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Quotation Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Quotation Number</span>
                  <span className="text-sm font-medium">{quotation.quotationNumber}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Lead</span>
                  <span className="text-sm font-medium">{quotation.leadName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Project</span>
                  <span className="text-sm font-medium">{quotation.projectName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Amount</span>
                  <span className="text-sm font-bold">{formatCurrency(quotation.amount)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge variant={STATUS_VARIANT[quotation.status] || "default"}>
                    {STATUS_LABEL[quotation.status] || quotation.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Timeline
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Created</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(quotation.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Valid Until</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(quotation.validUntil)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Last Updated</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(quotation.updatedAt)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-medium"><Receipt className="h-4 w-4" />Receipts linked to this quotation</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {!quotation.receipts?.length ? (
                <p className="text-sm text-muted-foreground">No receipts have been issued for this quotation yet. Receipts are available after a linked payment is verified.</p>
              ) : quotation.receipts.map((receipt) => (
                <div key={receipt.id} className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0">
                  <div>
                    <Link href={`/receipts/${receipt.id}`} className="font-medium text-primary hover:underline">{receipt.receiptNumber}</Link>
                    <p className="text-xs text-muted-foreground">{formatDate(receipt.receiptDate)} · {receipt.status}</p>
                  </div>
                  <span className="font-semibold">{formatCurrency(Number(receipt.amount))}</span>
                  <Button variant="outline" size="sm" asChild><Link href={`/receipts/${receipt.id}`}>View Receipt</Link></Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No activity recorded</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes">
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <StickyNote className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No notes added</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}