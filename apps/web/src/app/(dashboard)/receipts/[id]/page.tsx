"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Download, Printer, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { receiptApi } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/date-format";

interface ReceiptDetail {
  id: string;
  receiptNumber: string;
  receiptDate: string;
  amount: number;
  status: "ISSUED" | "CANCELLED";
  customerNameSnapshot: string;
  projectNameSnapshot: string;
  unitNumberSnapshot: string;
  paymentReferenceSnapshot: string | null;
  cancellationReason: string | null;
  cancelledAt: string | null;
  detailsSnapshot: {
    payerName?: string;
    paymentMode?: string;
    paymentDate?: string;
    balanceAfterReceipt?: number;
    company?: { name?: string; address?: string; city?: string; state?: string; country?: string; phone?: string; email?: string };
  };
  booking: {
    id: string;
    number: string;
    project: { id: string; name: string };
    unit: { id: string; number: string };
  };
  payment: { id: string; reference: string | null; status: string };
  issuedBy: { firstName: string; lastName: string };
  cancelledBy: { firstName: string; lastName: string } | null;
}

const formatCurrency = (amount: number) => new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(amount);

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ReceiptDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { hasEffectivePermission } = useAuth();
  const [receipt, setReceipt] = React.useState<ReceiptDetail | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState("");
  const [isCancelling, setIsCancelling] = React.useState(false);

  const loadReceipt = React.useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await receiptApi.get(params.id as string);
      if (!response.data?.success || !response.data.data) {
        throw new Error(response.data?.error || "Receipt not found");
      }
      setReceipt(response.data.data);
    } catch (error: any) {
      setLoadError(error?.response?.data?.error || error?.message || "Failed to load receipt.");
    } finally {
      setIsLoading(false);
    }
  }, [params.id]);

  React.useEffect(() => {
    void loadReceipt();
  }, [loadReceipt]);

  const downloadReceipt = async () => {
    if (!receipt) return;
    try {
      const response = await receiptApi.downloadPdf(receipt.id);
      downloadBlob(response.data, `${receipt.receiptNumber}.pdf`);
    } catch (error: any) {
      toast({
        title: "Download failed",
        description: error?.response?.data?.error || "Unable to download receipt PDF.",
        variant: "destructive",
      });
    }
  };

  const cancelReceipt = async () => {
    if (!receipt || !cancelReason.trim()) return;
    setIsCancelling(true);
    try {
      const response = await receiptApi.cancel(receipt.id, cancelReason.trim());
      if (!response.data?.success) throw new Error(response.data?.error || "Receipt cancellation failed");
      toast({ title: "Receipt cancelled", description: "Cancellation has been recorded in the audit history." });
      setCancelOpen(false);
      setCancelReason("");
      await loadReceipt();
    } catch (error: any) {
      toast({
        title: "Cancellation failed",
        description: error?.response?.data?.error || error?.message || "Unable to cancel receipt.",
        variant: "destructive",
      });
    } finally {
      setIsCancelling(false);
    }
  };

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-12 w-64" /><Skeleton className="h-72 w-full" /></div>;
  }
  if (loadError || !receipt) {
    return (
      <Card role="alert" className="border-destructive">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
          <p className="text-sm text-destructive">{loadError || "Receipt not found."}</p>
          <Button variant="outline" onClick={() => void loadReceipt()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  const company = receipt.detailsSnapshot.company;
  const companyAddress = [company?.address, company?.city, company?.state, company?.country].filter(Boolean).join(", ");

  return (
    <>
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Button variant="ghost" asChild><Link href="/receipts"><ArrowLeft className="mr-2 h-4 w-4" />Receipt Register</Link></Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Print</Button>
            <Button onClick={() => void downloadReceipt()}><Download className="mr-2 h-4 w-4" />Download PDF</Button>
            {receipt.status === "ISSUED" && hasEffectivePermission("RECEIPT_CANCEL") && (
              <Button variant="destructive" onClick={() => setCancelOpen(true)}><XCircle className="mr-2 h-4 w-4" />Cancel receipt</Button>
            )}
          </div>
        </div>
        <Card>
          <CardHeader className="border-b text-center">
            <CardTitle className="text-xl">{company?.name || "Company"}</CardTitle>
            {companyAddress && <p className="text-sm text-muted-foreground">{companyAddress}</p>}
            {(company?.phone || company?.email) && <p className="text-xs text-muted-foreground">{[company.phone, company.email].filter(Boolean).join(" · ")}</p>}
            <h1 className="pt-4 text-2xl font-bold tracking-wide">PAYMENT RECEIPT</h1>
            <Badge className="mx-auto mt-2 w-fit" variant={receipt.status === "ISSUED" ? "success" : "destructive"}>{receipt.status}</Badge>
          </CardHeader>
          <CardContent className="space-y-6 p-5 sm:p-8">
            {receipt.status === "CANCELLED" && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                Cancelled {receipt.cancelledAt ? `on ${formatDateTime(receipt.cancelledAt)}` : ""}: {receipt.cancellationReason || "No reason provided"}
              </div>
            )}
            <dl className="grid gap-4 sm:grid-cols-2">
              <div><dt className="text-xs text-muted-foreground">Receipt number</dt><dd className="font-semibold">{receipt.receiptNumber}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Receipt date</dt><dd className="font-semibold">{formatDate(receipt.receiptDate)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Customer / payer</dt><dd className="font-semibold">{receipt.customerNameSnapshot}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Project and unit</dt><dd className="font-semibold">{receipt.projectNameSnapshot} · {receipt.unitNumberSnapshot}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Booking</dt><dd><Link className="font-semibold text-primary hover:underline" href={`/bookings/${receipt.booking.id}`}>{receipt.booking.number}</Link></dd></div>
              <div><dt className="text-xs text-muted-foreground">Payment reference</dt><dd><Link className="font-semibold text-primary hover:underline" href={`/payments/${receipt.payment.id}`}>{receipt.paymentReferenceSnapshot || receipt.payment.reference || receipt.payment.id}</Link></dd></div>
              <div><dt className="text-xs text-muted-foreground">Payment date</dt><dd className="font-semibold">{receipt.detailsSnapshot.paymentDate ? formatDate(receipt.detailsSnapshot.paymentDate) : "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Payment mode</dt><dd className="font-semibold">{receipt.detailsSnapshot.paymentMode || "—"}</dd></div>
              {typeof receipt.detailsSnapshot.balanceAfterReceipt === "number" && (
                <div><dt className="text-xs text-muted-foreground">Balance remaining after this payment</dt><dd className="font-semibold">{formatCurrency(receipt.detailsSnapshot.balanceAfterReceipt)}</dd></div>
              )}
              <div><dt className="text-xs text-muted-foreground">Payment status</dt><dd className="font-semibold">{receipt.payment.status}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Issued by</dt><dd className="font-semibold">{[receipt.issuedBy.firstName, receipt.issuedBy.lastName].filter(Boolean).join(" ")}</dd></div>
            </dl>
            <div className="rounded-md border bg-muted/20 p-4">
              <p className="text-xs text-muted-foreground">Amount received</p>
              <p className="mt-1 text-2xl font-bold">{formatCurrency(receipt.amount)}</p>
            </div>
            <p className="border-t pt-4 text-center text-xs text-muted-foreground">
              {receipt.status === "ISSUED" ? "Issued for a verified payment. Please retain this receipt for your records." : "This receipt has been cancelled and is retained for audit purposes."}
            </p>
          </CardContent>
        </Card>
      </div>
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this receipt?</DialogTitle>
            <DialogDescription>The receipt will remain in the register as cancelled, with the reason and actor recorded.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="receipt-cancel-reason">Reason *</Label>
            <Input id="receipt-cancel-reason" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} maxLength={500} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={isCancelling}>Keep receipt</Button>
            <Button variant="destructive" onClick={() => void cancelReceipt()} disabled={isCancelling || !cancelReason.trim()}>
              {isCancelling ? "Cancelling..." : "Cancel receipt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
